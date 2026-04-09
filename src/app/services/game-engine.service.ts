import { Injectable, signal, computed, inject } from '@angular/core';
import { GameState, PlayerState, MissionRecord, GameOptions } from '../models/game-state';
import { GamePhase, GameEvent } from '../models/game-event';
import { Role, Team, ROLE_META } from '../models/role';
import { IAgent, SpeechEntry, BaseGameContext, SpeakContext } from '../models/agent.interface';
import { GAME_CONFIGS } from '../models/game-config';
import { I18nService } from '../i18n/i18n.service';
import { AgentFatalError } from '../models/errors';
import { GameRecordService } from './game-record.service';
import { GameRecord, GameRecordPlayer } from '../models/game-record';
import { WakeLockService } from './wake-lock.service';


@Injectable({
    providedIn: 'root'
})
export class GameEngineService {
    // Main game state signal
    private _state = signal<GameState>({
        phase: GamePhase.Setup,
        players: [],
        currentLeaderIndex: 0,
        currentRound: 1,
        consecutiveFailedVotes: 0,
        missions: [],
        proposedTeamIds: [],
        discussion: null,
        winner: null,
        assassinTargetId: null,
        isMerlinKilled: false,
        rolesInGame: [],
        events: [],
        ladyHistory: [],
        signaledThisRoundIds: []
    });

    // Public read-only signals
    readonly state = this._state.asReadonly();
    readonly players = computed(() => this._state().players);
    readonly phase = computed(() => this._state().phase);
    readonly currentRound = computed(() => this._state().currentRound);
    readonly isPaused = computed(() => this._state().isPaused);
    readonly isThinking = computed(() => this._state().isThinking);
    readonly isUpdatingNotes = computed(() => !!this._state().updatingNotePlayerIds?.length);
    readonly updatingNotePlayerIds = computed(() => this._state().updatingNotePlayerIds || []);

    // Flag to prevent multiple parallel loops
    private _isRunningLoop = false;

    // Track current game instance to terminate stale loops
    private _gameInstanceId = 0;

    // Log of events (mostly for God-view and history)
    readonly history = signal<string[]>([]);

    private i18n = inject(I18nService);
    private gameRecordService = inject(GameRecordService);
    private wakeLock = inject(WakeLockService);


    /** Start a new game with the given agents and roles */
    async startGame(agents: IAgent[], roleSelection: Role[], options?: GameOptions) {
        if (agents.length !== roleSelection.length) {
            throw new Error('Number of agents must match number of roles');
        }

        const config = GAME_CONFIGS[agents.length];
        if (!config) throw new Error(`Unsupported player count: ${agents.length}`);

        // Shuffle roles
        const shuffledRoles = this.shuffle(roleSelection);

        // Initialize player states
        const players: PlayerState[] = agents.map((agent, i) => ({
            agent,
            role: shuffledRoles[i],
            team: ROLE_META[shuffledRoles[i]].team
        }));

        this._state.set({
            phase: GamePhase.Night,
            players,
            currentLeaderIndex: Math.floor(Math.random() * players.length),
            currentRound: 1,
            consecutiveFailedVotes: 0,
            missions: [],
            proposedTeamIds: [],
            discussion: null,
            winner: null,
            assassinTargetId: null,
            isMerlinKilled: false,
            rolesInGame: roleSelection,
            options: options || { excalibur: false, lady: false, questVoting: false, plotCards: false },
            excaliburHolder: null,
            ladyHolder: null,
            ladyHistory: [],
            events: [],
            isPaused: false,
            isThinking: false,
            updatingNotePlayerIds: [],
            signaledThisRoundIds: [],
            perspectiveId: agents.find(a => a.modelName === 'Human')?.id || null
        });

        this.addEvent({ type: 'ROUND_START', round: 1 });
        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.Night, round: 1 });

        this.log(this.i18n.translate('engine.gameStarted'));

        // Increment instance ID to invalidate any previous loops
        this._gameInstanceId++;
        const currentInstance = this._gameInstanceId;

        // Force reset loop flag if it was stuck
        this._isRunningLoop = false;

        // Start wake lock to prevent system sleep
        this.wakeLock.start();

        // Start the game loop in the background to avoid blocking the UI transition
        setTimeout(() => this.runGameLoop(currentInstance), 0);
    }


    private async runGameLoop(instanceId: number) {
        if (this._isRunningLoop) {
            console.warn('[GameLoop] Loop already running, skipping start.');
            return;
        }
        this._isRunningLoop = true;

        const isStale = () => {
            if (instanceId !== this._gameInstanceId) {
                console.log(`[GameLoop] Instance ${instanceId} is stale (current: ${this._gameInstanceId}). Terminating.`);
                return true;
            }
            return false;
        };

        try {
            while (this._state().phase !== GamePhase.GameOver && !this._state().isPaused) {
                if (isStale()) return;

                const state = this._state();
                this._state.update(s => ({ ...s, isThinking: false }));

                // Standard yield to keep UI responsive and allow signal propagation
                await new Promise(resolve => setTimeout(resolve, 0));
                if (isStale()) return;

                console.log(`[GameLoop] Phase: ${state.phase}, Round: ${state.currentRound}, FailedVotes: ${state.consecutiveFailedVotes}`);

                switch (state.phase) {
                    case GamePhase.Night:
                        await this.handleNightPhase(instanceId);
                        if (isStale()) return;
                        this.changePhase(GamePhase.Opening);
                        break;

                    case GamePhase.Opening:
                        await this.handleOpeningPhase(instanceId);
                        if (isStale()) return;
                        this.changePhase(GamePhase.TeamProposal);
                        break;

                    case GamePhase.TeamProposal:
                        const proposal = await this.handleTeamProposal(instanceId);
                        if (isStale()) return;
                        // Transition to discussion with the proposed team
                        this.changePhase(GamePhase.Discussion, { proposedTeamIds: proposal.teamIds });
                        break;

                    case GamePhase.Discussion:
                        await this.handleDiscussion('DISCUSSION', instanceId);
                        if (isStale()) return;
                        this.changePhase(GamePhase.Vote);
                        break;
                    case GamePhase.Vote:
                        const voteResult = await this.handleVote(instanceId);
                        if (isStale()) return;
                        if (voteResult.passed) {
                            if (this._state().options?.excalibur) {
                                await this.handleExcaliburAssignment(instanceId);
                                if (isStale()) return;
                            }
                            this.changePhase(GamePhase.Mission, { consecutiveFailedVotes: 0 });
                        } else {
                            if (voteResult.failCount >= 5) {
                                await this.updateAgentNotes(instanceId);
                                if (isStale()) return;
                                this.endGame(Team.Evil);
                                this.changePhase(GamePhase.GameDebrief);
                            } else {
                                this.rotateLeader();
                                this.changePhase(GamePhase.TeamProposal, { consecutiveFailedVotes: voteResult.failCount });
                            }
                        }
                        break;

                    case GamePhase.Mission:
                        const missionOutcome = await this.handleMission(instanceId);
                        if (isStale()) return;
                        if (this._state().phase === GamePhase.GameOver) {
                            this.changePhase(GamePhase.GameDebrief);
                            break;
                        }

                        const successCount = this._state().missions.filter(m => m.succeeded).length;
                        const failCount = this._state().missions.filter(m => !m.succeeded).length;
                        console.log(`[GameLoop] Mission Result: S=${successCount}, F=${failCount}`);

                        if (failCount >= 3) {
                            this.log(`Evil wins by points: ${failCount} missions failed.`);
                            await this.updateAgentNotes(instanceId);
                            if (isStale()) return;
                            this.endGame(Team.Evil);
                            this.changePhase(GamePhase.GameDebrief);
                        } else if (successCount >= 3) {
                            this.log(`Good reaches 3 points! Entering Assassination phase.`);
                            await this.updateAgentNotes(instanceId);
                            if (isStale()) return;
                            this.changePhase(GamePhase.AssassinationDiscussion);
                        } else {
                            this.log(`Game continues. Current Score: Good ${successCount}, Evil ${failCount}`);
                            this.rotateLeader();
                            await this.handleLadyOfTheLake(instanceId);
                            if (isStale()) return;
                            this.currentRoundChatLog = [];
                            this.changePhase(GamePhase.MissionDebrief, { proposedTeamIds: [] });
                        }
                        break;
                    case GamePhase.MissionDebrief:
                        await this.handleMissionDebrief(instanceId);
                        if (isStale()) return;
                        await this.updateAgentNotes(instanceId);
                        if (isStale()) return;
                        const nextRound = this._state().currentRound + 1;
                        this.addEvent({ type: 'ROUND_START', round: nextRound });
                        this.changePhase(GamePhase.TeamProposal, {
                            currentRound: nextRound,
                            signaledThisRoundIds: []
                        });
                        break;

                    case GamePhase.AssassinationDiscussion:
                        await this.handleAssassinationDiscussion(instanceId);
                        if (isStale()) return;
                        this.changePhase(GamePhase.Assassination);
                        break;

                    case GamePhase.Assassination:
                        await this.handleAssassination(instanceId);
                        if (isStale()) return;
                        this.changePhase(GamePhase.GameDebrief);
                        break;

                    case GamePhase.GameDebrief:
                        await this.handleGameDebrief(instanceId);
                        if (isStale()) return;
                        this.changePhase(GamePhase.GameOver);
                        break;

                    default:
                        console.warn('Unhandled game phase:', state.phase);
                        return;
                }
            }

            // Loop terminated - Check if it was Game Over
            const finalState = this._state();
            if (finalState.phase === GamePhase.GameOver) {
                this.log('Game Over.');
                if (finalState.winner !== null) {
                    this.autoSaveRecord(finalState.winner);
                }
                this.wakeLock.stop();
            }
        } catch (e) {
            console.error('[GameLoop] Fatal Error:', e);
            this.handleAgentError(e, -1);
        } finally {
            this._isRunningLoop = false;
        }
    }

    private async handleNightPhase(instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        this.log(this.i18n.translate('engine.rolesRevealed'));
        const state = this._state();
        const players = state.players;
        const config = GAME_CONFIGS[players.length];
        const gameOptions = state.options || { excalibur: false, lady: false, questVoting: false, plotCards: false };

        // Call onNightPhase for each agent concurrently
        await Promise.all(players.map(p => {
            const { info, summary } = this.getNightPhaseInfoForRole(p.role, p.agent.id, players);
            return p.agent.onNightPhase({
                myRole: p.role,
                visiblePlayers: info,
                playerCount: players.length,
                rolesInGame: state.rolesInGame,
                options: gameOptions,
                missionSizes: config.missionSizes,
                twoFailsRequiredInRound4: config.twoFailsRequiredInRound4,
                intelSummary: summary,
                hasSignaledThisRound: (state.signaledThisRoundIds || []).includes(p.agent.id)
            });
        }));

        if (this._state().options?.lady) {
            // Assign Lady to player to the right of leader (index - 1)
            const players = this._state().players;
            const leaderIndex = this._state().currentLeaderIndex;
            const ladyIndex = (leaderIndex - 1 + players.length) % players.length;
            this.updateState({ ladyHolder: players[ladyIndex].agent.id });
            this.log(this.i18n.translate('engine.ladyAssigned', { name: players[ladyIndex].agent.name }));
        }
    }

    private async handleOpeningPhase(instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        this.log('Phase OPENING: Starting self-introductions...');
        const state = this._state();
        const startIndex = state.currentLeaderIndex;
        const playerCount = state.players.length;

        for (let i = 0; i < playerCount; i++) {
            if (this._state().isPaused || isStale()) return;

            const player = state.players[(startIndex + i) % playerCount];

            // Resume check: find if the speech event already exists in CURRENT state
            const existingEvent = this._state().events.find(e =>
                e.type === 'DISCUSSION' && e.discussionRound === 0 && e.playerId === player.agent.id
            );

            if (existingEvent && existingEvent.status === 'success') {
                continue;
            }

            let eventIndex = existingEvent ? this._state().events.indexOf(existingEvent) : -1;

            // Create event if it doesn't exist
            if (eventIndex === -1) {
                eventIndex = this._state().events.length;
                this.addEvent({
                    type: 'DISCUSSION',
                    round: 1,
                    discussionRound: 0,
                    playerId: player.agent.id,
                    playerName: player.agent.name,
                    message: '',
                    timestamp: Date.now(),
                    isThinking: true,
                    status: 'pending',
                    phase: 'OPENING'
                });
            }

            try {
                // Mark as thinking
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev) {
                        ev.isThinking = true;
                        ev.status = 'pending';
                    }
                    return { ...s, events: newEvents };
                });

                const costBefore = player.agent.getTokenUsage?.()?.totalCost ?? 0;
                const result = await player.agent.speak({
                    ...this.buildBaseContext(player.agent.id),
                    phase: 'OPENING',
                    chatLog: [...this.currentRoundChatLog],
                    visibleAgentIds: state.players.map(p => p.agent.id),
                    proposedTeam: [],
                    leaderId: state.players[state.currentLeaderIndex].agent.id,
                    discussionRound: 0,
                    maxDiscussionRounds: 1
                }, (chunk, field, metadata) => {
                    this._state.update(s => {
                        const newEvents = [...s.events];
                        const ev = newEvents[eventIndex];
                        if (ev && ev.type === 'DISCUSSION') {
                            ev.isThinking = false;
                            if (field === 'speech') ev.message += chunk;
                            else if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                            else if (field === 'thought') ev.thought = (ev.thought || '') + chunk;
                            else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;

                            else if (field === 'situation_assessment') {
                                ev.situation_assessment = (ev.situation_assessment || '') + chunk;
                                if ((player.agent as any).updateStreamingAssessment) (player.agent as any).updateStreamingAssessment(chunk);
                            }
                            else if (field === 'action_strategy') {
                                ev.action_strategy = (ev.action_strategy || '') + chunk;
                                if ((player.agent as any).updateStreamingStrategy) (player.agent as any).updateStreamingStrategy(chunk);
                            }

                            if (metadata) {
                                console.log('[game-engine] OPENING streaming metadata received:', metadata);
                                if (metadata.promptSpeed) ev.promptSpeed = metadata.promptSpeed;
                                if (metadata.completionSpeed) ev.completionSpeed = metadata.completionSpeed;
                                if (metadata.prompt) ev.promptTokens = metadata.prompt;
                                if (metadata.candidates) ev.completionTokens = metadata.candidates;
                                if (metadata.cached) ev.cachedTokens = metadata.cached;
                            }
                        }
                        return { ...s, events: newEvents };
                    });
                });

                const message = result.action.speech;

                const entry: SpeechEntry = {
                    playerId: player.agent.id,
                    name: player.agent.name,
                    message,
                    timestamp: Date.now()
                };
                this.currentRoundChatLog.push(entry);

                // Final update on success
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'DISCUSSION') {
                        ev.isThinking = false;
                        ev.message = message;
                        ev.self_check = result.self_check;
                        ev.reasoning = result.reasoning;
                        ev.thought = result.thought;
                        ev.promptText = result.promptText;
                        ev.retryLogs = result.retryLogs;
                        ev.situation_assessment = result.situation_assessment;
                        ev.action_strategy = result.action_strategy;
                        ev.status = 'success';
                        ev.cost = (player.agent.getTokenUsage?.()?.totalCost ?? 0) - costBefore;
                        this.processHiddenSignal(player.agent.id, result.action.pass_hidden_signal, ev);
                    }
                    return { ...s, events: newEvents, isThinking: false };
                });

                this.log(`[Opening] ${player.agent.name}: ${message}`);
            } catch (e) {
                this.handleAgentError(e, eventIndex);
                throw e; // Stop this phase
            }
        }

        if (this._state().isPaused || isStale()) return;
    }

    private async handleTeamProposal(instanceId: number): Promise<{ teamIds: string[] }> {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return { teamIds: [] };

        const state = this._state();
        const leader = state.players[state.currentLeaderIndex];

        // Resume check against CURRENT state
        const existing = this._state().events.find(e =>
            e.type === 'TEAM_PROPOSAL' && e.round === state.currentRound && e.leaderId === leader.agent.id
        );

        if (existing && existing.type === 'TEAM_PROPOSAL' && existing.status === 'success') {
            return { teamIds: existing.teamIds };
        }

        const eventIndex = existing ? this._state().events.indexOf(existing) : this._state().events.length;
        if (!existing) {
            // Add a placeholder event
            this.addEvent({
                type: 'TEAM_PROPOSAL',
                round: state.currentRound,
                leaderId: leader.agent.id,
                leaderName: leader.agent.name,
                teamIds: [],
                teamNames: [],
                status: 'pending'
            });
        }

        try {
            // Mark as thinking
            this.updateState({ isThinking: true });
            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex];
                if (ev) {
                    ev.isThinking = true;
                    ev.status = 'pending';
                }
                return { ...s, events: newEvents };
            });

            const costBefore = leader.agent.getTokenUsage?.()?.totalCost ?? 0;
            const result = await leader.agent.proposeTeam({
                ...this.buildBaseContext(leader.agent.id),
                round: state.currentRound,
                teamSize: GAME_CONFIGS[state.players.length].missionSizes[state.currentRound - 1],
                playerIds: state.players.map(p => p.agent.id),
                playerNames: Object.fromEntries(state.players.map(p => [p.agent.id, p.agent.name]))
            }, (chunk, field, metadata) => {
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'TEAM_PROPOSAL') {
                        ev.isThinking = false;
                        if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                        else if (field === 'thought') ev.thought = (ev.thought || '') + chunk;
                        else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;
                        else if (field === 'situation_assessment') {
                            ev.situation_assessment = (ev.situation_assessment || '') + chunk;
                            if ((leader.agent as any).updateStreamingAssessment) (leader.agent as any).updateStreamingAssessment(chunk);
                        }
                        else if (field === 'action_strategy') {
                            ev.action_strategy = (ev.action_strategy || '') + chunk;
                            if ((leader.agent as any).updateStreamingStrategy) (leader.agent as any).updateStreamingStrategy(chunk);
                        }

                        if (metadata) {
                            console.log('[game-engine] PROPOSAL streaming metadata received:', metadata);
                            if (metadata.promptSpeed) ev.promptSpeed = metadata.promptSpeed;
                            if (metadata.completionSpeed) ev.completionSpeed = metadata.completionSpeed;
                            if (metadata.prompt) ev.promptTokens = metadata.prompt;
                            if (metadata.candidates) ev.completionTokens = metadata.candidates;
                            if (metadata.cached) ev.cachedTokens = metadata.cached;
                        }
                    }
                    return { ...s, events: newEvents };
                });
            });

            let teamIds = result.action.teamMemberIds;
            teamIds = this.validateTeam(teamIds, state.players.map(p => p.agent.id), GAME_CONFIGS[state.players.length].missionSizes[state.currentRound - 1], leader.agent.id);

            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex];
                if (ev && ev.type === 'TEAM_PROPOSAL') {
                    ev.isThinking = false;
                    ev.teamIds = teamIds;
                    ev.teamNames = teamIds.map(id => s.players.find(p => p.agent.id === id)?.agent.name || id);
                    ev.reasoning = result.reasoning;
                    ev.thought = result.thought;
                    ev.self_check = result.self_check;
                    ev.situation_assessment = result.situation_assessment;
                    ev.action_strategy = result.action_strategy;
                    ev.promptText = result.promptText;
                    ev.retryLogs = result.retryLogs;
                    ev.status = 'success';
                    ev.cost = (leader.agent.getTokenUsage?.()?.totalCost ?? 0) - costBefore;
                }
                return { ...s, proposedTeamIds: teamIds, events: newEvents, isThinking: false };
            });

            this.log(`Leader ${leader.agent.name} proposes: ${teamIds.join(', ')}`);
            return { teamIds: teamIds };
        } catch (e) {
            this.handleAgentError(e, eventIndex);
            throw e;
        }
    }

    private async handleExcaliburAssignment(instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        const state = this._state();
        const leader = state.players[state.currentLeaderIndex];
        const teamIds = state.proposedTeamIds;
        // Pick a random team member who is NOT the leader to hold Excalibur
        const excaliburCandidates = teamIds.filter(id => id !== leader.agent.id);
        if (excaliburCandidates.length > 0) {
            const recipientId = excaliburCandidates[Math.floor(Math.random() * excaliburCandidates.length)];
            const recipientPlayer = state.players.find(p => p.agent.id === recipientId);
            this.updateState({ excaliburHolder: recipientId });

            const recipientName = recipientPlayer?.agent.name || recipientId;
            this.log(this.i18n.translate('engine.excaliburGiven', { leader: leader.agent.name, target: recipientName }));

            // Notify all players (public info)
            await Promise.all(state.players.map(p =>
                p.agent.onSystemMessage(this.i18n.translate('engine.excaliburGiven', { leader: leader.agent.name, target: recipientName }))
            ));

            this.addEvent({
                type: 'SYSTEM',
                subType: 'EXCALIBUR_GIVEN',
                round: state.currentRound,
                message: this.i18n.translate('engine.excaliburGiven', { leader: leader.agent.name, target: recipientName }),
                icon: '🗡️'
            });
        }
    }


    /** Validate a team proposal. Returns a corrected team if invalid. */
    private validateTeam(teamIds: string[], allPlayerIds: string[], teamSize: number, leaderId: string): string[] {
        // Filter out invalid IDs
        let validTeam = teamIds.filter(id => allPlayerIds.includes(id));
        // Remove duplicates
        validTeam = [...new Set(validTeam)];

        if (validTeam.length === teamSize) return validTeam;

        // Fallback: fill with random valid players
        this.log(`[Validation] Team invalid (got ${teamIds.length} valid, need ${teamSize}). Auto-correcting...`);
        const pool = allPlayerIds.filter(id => !validTeam.includes(id));
        // Ensure leader is included if team is short
        if (!validTeam.includes(leaderId) && validTeam.length < teamSize) {
            validTeam.push(leaderId);
        }
        while (validTeam.length < teamSize && pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length);
            validTeam.push(pool.splice(idx, 1)[0]);
        }
        return validTeam.slice(0, teamSize);
    }

    private async handleDiscussion(phase: 'DISCUSSION' | 'MISSION_DEBRIEF' | 'ASSASSINATION_DISCUSSION', instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        const state = this._state();
        this.log(`Phase ${phase}: ${state.discussion ? 'Resuming' : 'Starting'} discussion...`);

        // resume or init discussion state
        let roundNumber = state.discussion?.roundNumber ?? 1;
        // Ensure passedAgentIds is a Set, even if restored from serialized state
        const restoredPasses = state.discussion?.passedAgentIds;
        const passedAgentIds = (restoredPasses instanceof Set)
            ? restoredPasses
            : new Set<string>(Array.isArray(restoredPasses) ? restoredPasses : []);

        // MISSION_DEBRIEF and GAME_DEBRIEF should only be 1 round globally
        const isDebrief = phase === 'MISSION_DEBRIEF';
        const maxRounds = isDebrief ? 1 : (state.discussion?.maxRounds ?? 10);
        const lastPersonSpeechCount = state.discussion?.lastPersonSpeechCount ?? {};

        while (passedAgentIds.size < state.players.length && roundNumber <= maxRounds) {
            if (this._state().isPaused || isStale()) return;

            // --- Add Round Marker Event ---
            const currentAttempt = state.consecutiveFailedVotes;
            const roundMarkerExists = this._state().events.some(e =>
                e.type === 'SYSTEM' &&
                e.round === state.currentRound &&
                e.discussionRound === roundNumber &&
                e.phase === phase &&
                e.attempt === currentAttempt
            );
            if (!roundMarkerExists) {
                this.addEvent({
                    type: 'SYSTEM',
                    subType: 'DISCUSSION_ROUND_START',
                    round: state.currentRound,
                    discussionRound: roundNumber,
                    phase,
                    attempt: currentAttempt,
                    message: `[${phase}] Turn ${roundNumber}${currentAttempt > 0 ? ` (Vote Attempt ${currentAttempt + 1} of R${state.currentRound})` : ''}`,
                    icon: '⏱️'
                });
            }

            this.log(`Discussion Round ${roundNumber}...`);

            // Update state for UI and persistence
            this.updateState({
                discussion: { roundNumber, maxRounds, passedAgentIds, lastPersonSpeechCount }
            });

            const startIndex = state.currentLeaderIndex;
            const playerCount = state.players.length;

            for (let i = 0; i < playerCount; i++) {
                if (this._state().isPaused || isStale()) return;

                const player = state.players[(startIndex + i) % playerCount];
                if (passedAgentIds.has(player.agent.id)) {
                    this.log(`[Discussion] ${player.agent.name} has already passed.`);
                    continue;
                }

                // --- Idempotency and Error Handling ---
                let eventIndex = this._state().events.findIndex(e =>
                    e.type === 'DISCUSSION' &&
                    e.phase === phase &&
                    e.round === state.currentRound &&
                    e.failedVotes === state.consecutiveFailedVotes &&
                    e.discussionRound === roundNumber &&
                    e.playerId === player.agent.id
                );

                // We ONLY skip if the event is ALREADY a success.
                // If it's pending or error, we must process it.
                if (eventIndex !== -1 && this._state().events[eventIndex].status === 'success') {
                    continue;
                }

                if (eventIndex === -1) {
                    eventIndex = this._state().events.length;
                    this.addEvent({
                        type: 'DISCUSSION',
                        round: state.currentRound,
                        discussionRound: roundNumber,
                        playerId: player.agent.id,
                        playerName: player.agent.name,
                        message: '',
                        timestamp: Date.now(),
                        isThinking: true,
                        status: 'pending',
                        phase
                    });
                }

                // Last person standing rule
                const activeAgentIds = state.players.filter(p => !passedAgentIds.has(p.agent.id));
                if (activeAgentIds.length === 1) {
                    const count = (lastPersonSpeechCount[player.agent.id] || 0) + 1;
                    lastPersonSpeechCount[player.agent.id] = count;
                    if (count > 2) {
                        this.log(this.i18n.translate('engine.forcedPass', { name: player.agent.name }));
                        passedAgentIds.add(player.agent.id);
                        this.updateState({ discussion: { roundNumber, maxRounds, passedAgentIds, lastPersonSpeechCount } });
                        this.addEvent({
                            type: 'SYSTEM',
                            subType: 'FORCED_PASS',
                            round: state.currentRound,
                            message: this.i18n.translate('engine.forcedPass', { name: player.agent.name }),
                            icon: '🚫'
                        });
                        // Reset thinking flag after forced pass
                        this._state.update(s => ({ ...s, isThinking: false }));
                        continue;
                    }
                }

                try {
                    // Reset agent thinking flag at the start of EACH attempt
                    this.updateState({ isThinking: true });

                    this._state.update(s => {
                        const newEvents = [...s.events];
                        const ev = newEvents[eventIndex];
                        if (ev) {
                            ev.isThinking = true;
                            ev.status = 'pending';
                        }
                        return { ...s, events: newEvents };
                    });

                    const costBefore = player.agent.getTokenUsage?.()?.totalCost ?? 0;
                    const result = await player.agent.speak({
                        ...this.buildBaseContext(player.agent.id),
                        phase,
                        chatLog: [...this.currentRoundChatLog],
                        visibleAgentIds: state.players.map(p => p.agent.id),
                        proposedTeam: state.proposedTeamIds,
                        leaderId: state.players[state.currentLeaderIndex].agent.id,
                        discussionRound: roundNumber,
                        maxDiscussionRounds: maxRounds,
                        assassinId: phase === 'ASSASSINATION_DISCUSSION' ? state.players.find(p => p.role === Role.Assassin)?.agent.id : undefined
                    } as SpeakContext, (chunk, field, metadata) => {
                        this._state.update(s => {
                            const newEvents = [...s.events];
                            const ev = newEvents[eventIndex];
                            if (ev && (ev.type === 'DISCUSSION' || ev.type === 'GAME_DEBRIEF')) {
                                ev.isThinking = false;
                                if (chunk === '' && !metadata) { // handle reset command from agent
                                    if (field === 'speech') ev.message = '';
                                    else if (field === 'reasoning') ev.reasoning = '';
                                    else if (field === 'thought') ev.thought = '';
                                    else if (field === 'self_check') ev.self_check = '';
                                    else if (field === 'situation_assessment') {
                                        ev.situation_assessment = '';
                                        if ((player.agent as any).updateStreamingAssessment) (player.agent as any).updateStreamingAssessment('');
                                    }
                                    else if (field === 'action_strategy') {
                                        ev.action_strategy = '';
                                        if ((player.agent as any).updateStreamingStrategy) (player.agent as any).updateStreamingStrategy('');
                                    }
                                } else {
                                    if (field === 'speech') {
                                        ev.message += chunk;
                                    }
                                    else if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                                    else if (field === 'thought') ev.thought = (ev.thought || '') + chunk;
                                    else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;
                                    else if (field === 'situation_assessment') {
                                        ev.situation_assessment = (ev.situation_assessment || '') + chunk;
                                        if ((player.agent as any).updateStreamingAssessment) {
                                            (player.agent as any).updateStreamingAssessment(chunk);
                                        }
                                    }
                                    else if (field === 'action_strategy') {
                                        ev.action_strategy = (ev.action_strategy || '') + chunk;
                                        if ((player.agent as any).updateStreamingStrategy) {
                                            (player.agent as any).updateStreamingStrategy(chunk);
                                        }
                                    }
                                }

                                if (metadata) {
                                    console.log('[game-engine] DISCUSSION streaming metadata received:', metadata);
                                    if (metadata.promptSpeed) ev.promptSpeed = metadata.promptSpeed;
                                    if (metadata.completionSpeed) ev.completionSpeed = metadata.completionSpeed;
                                    if (metadata.prompt) ev.promptTokens = metadata.prompt;
                                    if (metadata.candidates) ev.completionTokens = metadata.candidates;
                                    if (metadata.cached) ev.cachedTokens = metadata.cached;
                                }
                            }
                            return { ...s, events: newEvents };
                        });
                    });

                    const { speech, readyToVote } = result.action;

                    // Update event with final result
                    this._state.update(s => {
                        const newEvents = [...s.events];
                        const ev = newEvents[eventIndex];
                        if (ev) {
                            ev.isThinking = false;
                            if (ev.type === 'DISCUSSION') {
                                ev.message = speech;
                                ev.self_check = result.self_check;
                                ev.reasoning = result.reasoning;
                                ev.thought = result.thought;
                                ev.situation_assessment = result.situation_assessment;
                                ev.action_strategy = result.action_strategy;
                            }
                            ev.promptText = result.promptText;
                            ev.retryLogs = result.retryLogs;
                            ev.status = 'success';
                            ev.cost = (player.agent.getTokenUsage?.()?.totalCost ?? 0) - costBefore;
                            this.processHiddenSignal(player.agent.id, result.action.pass_hidden_signal, ev);
                        }
                        return { ...s, events: newEvents, isThinking: false };
                    });


                    // Handle PASS or SPEAK
                    if (readyToVote && !speech) {
                        passedAgentIds.add(player.agent.id);
                        this.log(this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }));
                        this.addEvent({
                            type: 'SYSTEM',
                            subType: 'PLAYER_PASS',
                            round: state.currentRound,
                            message: this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }),
                            icon: '⏭️'
                        });
                    } else if (speech) {
                        this.log(`[Discussion] ${player.agent.name}: ${speech}`);
                        const entry: SpeechEntry = { playerId: player.agent.id, name: player.agent.name, message: speech, timestamp: Date.now() };
                        // Idempotent chat log addition
                        const alreadyInChat = this.currentRoundChatLog.some(c => c.playerId === entry.playerId && c.message === entry.message && c.timestamp === entry.timestamp);
                        if (!alreadyInChat) {
                            this.currentRoundChatLog.push(entry);
                        }
                        if (readyToVote) {
                            passedAgentIds.add(player.agent.id);
                            this.addEvent({
                                type: 'SYSTEM',
                                subType: 'PLAYER_FINISH',
                                round: state.currentRound,
                                message: this.i18n.translate('engine.finishedSpeak', { name: player.agent.name }),
                                icon: '👍'
                            });
                        }
                    } else {
                        // This case (no speech, not ready to vote) is ambiguous. Treat as a pass to prevent loops.
                        passedAgentIds.add(player.agent.id);
                        this.log(this.i18n.translate('engine.skippedSpeakAmbiguous', { name: player.agent.name }));
                        this.addEvent({
                            type: 'SYSTEM',
                            subType: 'PLAYER_PASS',
                            round: state.currentRound,
                            message: this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }),
                            icon: '⏭️'
                        });
                    }
                    this.updateState({ discussion: { roundNumber, maxRounds, passedAgentIds, lastPersonSpeechCount } });

                } catch (e) {
                    this.handleAgentError(e, eventIndex);
                    throw e; // Stop phase
                }
            }
            roundNumber++;
        }

        if (this._state().isPaused) return;

        const actualRounds = roundNumber - 1;
        this.log(`Discussion concluded after ${actualRounds} round${actualRounds !== 1 ? 's' : ''}.`);

        this.updateState({ discussion: null });
    }

    private async handleMissionDebrief(instanceId: number) {
        await this.handleDiscussion('MISSION_DEBRIEF', instanceId);
    }

    // Store chat log between discussion and vote phases
    private currentRoundChatLog: SpeechEntry[] = [];

    private async handleVote(instanceId: number): Promise<{ passed: boolean, failCount: number }> {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return { passed: false, failCount: 0 };

        const state = this._state();
        console.log(`[GameEngine] handleVote start: round=${state.currentRound}, failCount=${state.consecutiveFailedVotes}`);
        const players = state.players;
        const proposedIds = state.proposedTeamIds;

        // Resume check
        const existing = state.events.find(e =>
            e.type === 'VOTE_RESULTS' &&
            e.round === state.currentRound &&
            e.failedVotes === state.consecutiveFailedVotes
        );
        if (existing && existing.type === 'VOTE_RESULTS' && existing.status === 'success') {
            return { passed: existing.passed, failCount: existing.failCount };
        }

        const eventIndex = existing ? state.events.indexOf(existing) : state.events.length;
        if (!existing) {
            this.addEvent({
                type: 'VOTE_RESULTS',
                round: state.currentRound,
                votes: [],
                passed: false,
                failCount: state.consecutiveFailedVotes,
                teamNames: state.proposedTeamIds.map(id => state.players.find(p => p.agent.id === id)?.agent.name || id),
                status: 'pending',
                isThinking: false
            });
        }

        try {
            this.updateState({ isThinking: true });
            const costsBefore = Object.fromEntries(players.map(p => [p.agent.id, p.agent.getTokenUsage?.()?.totalCost ?? 0]));
            const playerTokens: Record<string, { prompt: number, completion: number, cached: number }> = {};
            const votesResult = await Promise.all(players.map(p =>
                p.agent.vote({
                    ...this.buildBaseContext(p.agent.id),
                    proposedTeam: [...proposedIds],
                    leaderId: players[state.currentLeaderIndex].agent.id,
                    excaliburHolderId: state.excaliburHolder || null,
                    chatLog: this.currentRoundChatLog
                }, (chunk, field, metadata) => {
                    if (metadata) {
                        playerTokens[p.agent.id] = {
                            prompt: metadata.prompt || 0,
                            completion: metadata.candidates || 0,
                            cached: metadata.cached || 0
                        };
                        this._state.update(s => {
                            const newEvents = [...s.events];
                            const ev = newEvents[eventIndex];
                            if (ev && ev.type === 'VOTE_RESULTS') {
                                ev.promptTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.prompt, 0);
                                ev.completionTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.completion, 0);
                                ev.cachedTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.cached, 0);
                            }
                            return { ...s, events: newEvents };
                        });
                    }
                }).then(voteResult => ({
                    id: p.agent.id,
                    name: p.agent.name,
                    approve: voteResult.action.voteChoice,
                    thought: voteResult.thought,
                    reasoning: voteResult.reasoning,
                    situation_assessment: voteResult.situation_assessment,
                    action_strategy: voteResult.action_strategy,
                    promptText: voteResult.promptText,
                    retryLogs: voteResult.retryLogs
                }))
            ));

            let approvals = 0;
            votesResult.forEach(v => {
                if (v.approve) approvals++;
            });

            const majority = approvals > players.length / 2;
            const newFailedCount = state.consecutiveFailedVotes + (majority ? 0 : 1);

            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex];
                if (ev && ev.type === 'VOTE_RESULTS') {
                    ev.votes = votesResult;
                    ev.passed = majority;
                    ev.failCount = newFailedCount;
                    ev.status = 'success';
                    ev.cost = players.reduce((acc, p) => acc + ((p.agent.getTokenUsage?.()?.totalCost ?? 0) - (costsBefore[p.agent.id] || 0)), 0);
                    console.log('[GameEvent Update] VOTE_RESULTS', ev);
                }
                return { ...s, events: newEvents, isThinking: false };
            });

            this.log(`Vote Result: ${majority ? 'PASSED' : 'REJECTED'} (${approvals}/${players.length})`);
            console.log(`[GameEngine] return handleVote: passed=${majority}, nextFailCount=${newFailedCount}`);
            return { passed: majority, failCount: newFailedCount };
        } catch (e) {
            this.handleAgentError(e, eventIndex);
            throw e;
        }
    }

    private async handleMission(instanceId: number): Promise<{ succeeded: boolean, failsCount: number }> {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return { succeeded: false, failsCount: 0 };

        const state = this._state();
        const teamIds = state.proposedTeamIds;
        const onMission = state.players.filter(p => teamIds.includes(p.agent.id));

        this.log(`Mission in progress with team: ${teamIds.join(', ')}`);

        // Resume check
        const existing = state.events.find(e => e.type === 'MISSION_OUTCOME' && e.round === state.currentRound);
        if (existing && existing.type === 'MISSION_OUTCOME' && existing.status === 'success') {
            return { succeeded: existing.succeeded, failsCount: existing.failsCount };
        }

        const eventIndex = existing ? state.events.indexOf(existing) : state.events.length;
        if (!existing) {
            this.addEvent({
                type: 'MISSION_OUTCOME',
                round: state.currentRound,
                teamNames: onMission.map(p => p.agent.name),
                failsCount: 0,
                succeeded: false, // Default to false until cards are revealed
                status: 'pending',
                isThinking: true
            });
        }

        try {
            this.updateState({ isThinking: true });
            const costsBefore = Object.fromEntries(onMission.map(p => [p.agent.id, p.agent.getTokenUsage?.()?.totalCost ?? 0]));
            const playerTokens: Record<string, { prompt: number, completion: number, cached: number }> = {};
            const missionResponses = await Promise.all(onMission.map(p =>
                p.agent.executeMission({
                    ...this.buildBaseContext(p.agent.id),
                    team: [...teamIds]
                }, (chunk, field, metadata) => {
                    if (metadata) {
                        playerTokens[p.agent.id] = {
                            prompt: metadata.prompt || 0,
                            completion: metadata.candidates || 0,
                            cached: metadata.cached || 0
                        };
                        this._state.update(s => {
                            const newEvents = [...s.events];
                            const ev = newEvents[eventIndex];
                            if (ev && ev.type === 'MISSION_OUTCOME') {
                                ev.promptTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.prompt, 0);
                                ev.completionTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.completion, 0);
                                ev.cachedTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.cached, 0);
                            }
                            return { ...s, events: newEvents };
                        });
                    }
                })
            ));

            const initialChoices = missionResponses.map(r => r.action.playedMissionResult);
            const reasonings = onMission.map((p, idx) => ({
                name: p.agent.name,
                reasoning: missionResponses[idx].reasoning || 'No reasoning provided',
                thought: missionResponses[idx].thought,
                situation_assessment: missionResponses[idx].situation_assessment,
                action_strategy: missionResponses[idx].action_strategy,
                promptText: missionResponses[idx].promptText,
                retryLogs: missionResponses[idx].retryLogs
            })).filter(r => r.reasoning !== 'No reasoning provided');

            // -- Excalibur Phase --
            let finalResults = [...initialChoices];
            if (state.options?.excalibur && state.excaliburHolder) {
                finalResults = await this.handleExcaliburCardFlip(state.excaliburHolder, onMission, initialChoices, instanceId);
            }

            // Shuffle results to anonymize
            const shuffledResults = [...finalResults].sort(() => Math.random() - 0.5);
            const fails = finalResults.filter(r => r === false).length;
            const config = GAME_CONFIGS[state.players.length];
            const twoFailsNeeded = state.currentRound === 4 && config.twoFailsRequiredInRound4;
            const succeeded = twoFailsNeeded ? fails < 2 : fails === 0;

            const record: MissionRecord = {
                round: state.currentRound,
                leaderId: state.players[state.currentLeaderIndex].agent.id,
                teamIds: [...teamIds],
                votes: {},
                results: shuffledResults,
                agentPlays: Object.fromEntries(onMission.map((p, idx) => [p.agent.id, finalResults[idx]])),
                succeeded,
                failsCount: fails
            };

            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex] as any;
                if (ev) {
                    ev.teamMembers = onMission.map((p, idx) => ({
                        name: p.agent.name,
                        role: this.i18n.translate('roles.' + p.role),
                        team: ROLE_META[p.role].team,
                        playedSuccess: finalResults[idx]
                    }));
                    ev.failsCount = fails;
                    ev.succeeded = succeeded;
                    ev.reasonings = reasonings;
                    ev.status = 'success';
                    ev.cost = onMission.reduce((acc, p) => acc + ((p.agent.getTokenUsage?.()?.totalCost ?? 0) - (costsBefore[p.agent.id] || 0)), 0);
                    console.log('[GameEvent Update] MISSION_OUTCOME', ev);
                }
                const newMissions = [...s.missions, record];
                console.log(`[GameEngine] Adding mission record: round=${record.round}, succeeded=${record.succeeded}, totalCount=${newMissions.length}`);
                return { ...s, missions: newMissions, events: newEvents, isThinking: false };
            });

            this.log(`Mission result: ${succeeded ? 'SUCCESS' : 'FAIL'} (${fails} fail cards)`);
            return { succeeded, failsCount: fails };

        } catch (e) {
            this.handleAgentError(e, eventIndex);
            throw e;
        }
    }

    private async handleExcaliburCardFlip(excaliburHolderId: string, onMission: PlayerState[], results: boolean[], instanceId: number): Promise<boolean[]> {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return results;

        const state = this._state();
        const holder = state.players.find(p => p.agent.id === excaliburHolderId);
        if (!holder) return results;

        this.log(`[Excalibur] Waiting for ${holder.agent.name} to decide...`);

        try {
            const result = await holder.agent.useExcalibur({
                ...this.buildBaseContext(holder.agent.id),
                holderId: holder.agent.id,
                missionCardHolderIds: onMission.map(p => p.agent.id),
            });
            const targetId = result.targetId;

            if (targetId && onMission.some(p => p.agent.id === targetId)) {
                const targetIndex = onMission.findIndex(p => p.agent.id === targetId);
                if (targetIndex !== -1) {
                    const finalResults = [...results];
                    const originalResult = results[targetIndex];
                    finalResults[targetIndex] = !originalResult; // Flip result

                    this.log(this.i18n.translate('engine.excaliburSwitched', { holder: holder.agent.name, target: targetId }));
                    this.addEvent({
                        type: 'SYSTEM',
                        subType: 'EXCALIBUR_SWITCHED',
                        round: state.currentRound,
                        message: this.i18n.translate('engine.excaliburSwitched', { holder: holder.agent.name, target: targetId }),
                        icon: '⚔️',
                        thought: result.thought,
                        reasoning: result.reasoning,
                        self_check: result.self_check,
                        situation_assessment: result.situation_assessment,
                        action_strategy: result.action_strategy,
                        promptText: result.promptText,
                        retryLogs: result.retryLogs,
                    });
                    return finalResults;
                }
            } else {
                this.log(`[Excalibur] ${holder.agent.name} decided not to use Excalibur.`);
            }
        } catch (e) {
            // Find an event to attach the error to. A bit tricky here.
            // Let's find the VOTE_RESULTS event for this round.
            const voteEventIndex = this._state().events.findIndex(ev => ev.type === 'VOTE_RESULTS' && ev.round === state.currentRound && ev.passed);
            this.handleAgentError(e, voteEventIndex !== -1 ? voteEventIndex : this._state().events.length - 1);
            // Re-throw to stop mission processing
            throw e;
        }
        return results;
    }

    private async handleAssassinationDiscussion(instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        const state = this._state();

        // Find the Assassin
        const assassinPlayer = state.players.find(p => p.role === Role.Assassin);
        if (!assassinPlayer) {
            this.log('Error: No Assassin found! Skipping to assassination.');
            this.changePhase(GamePhase.Assassination);
            return;
        }

        // Publicly reveal the Assassin's identity
        const revealMsg = this.i18n.translate('engine.assassinRevealed', { name: assassinPlayer.agent.name });
        this.log(revealMsg);
        this.addEvent({
            type: 'SYSTEM',
            subType: 'ASSASSIN_REVEALED',
            message: revealMsg,
            icon: '🗡️',
            round: state.currentRound
        });

        // Use the generic discussion handler
        await this.handleDiscussion('ASSASSINATION_DISCUSSION', instanceId);
    }

    private async handleAssassination(instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        const state = this._state();

        const assassinPlayer = state.players.find(p => p.role === Role.Assassin);
        if (!assassinPlayer) {
            this.log('Error: No Assassin found in game! Good wins by default.');
            this.endGame(Team.Good);
            return;
        }

        // Resume check against CURRENT state
        const existing = this._state().events.find(e => e.type === 'ASSASSINATION');
        if (existing && existing.status === 'success') {
            return;
        }

        const eventIndex = existing ? this._state().events.indexOf(existing) : this._state().events.length;
        if (!existing) {
            // Add a placeholder event
            this.addEvent({
                type: 'ASSASSINATION',
                message: 'Assassination in progress...',
                round: state.currentRound,
                status: 'pending',
                playerId: assassinPlayer.agent.id,
                playerName: assassinPlayer.agent.name,
                targetId: '',
                targetName: ''
            });
        }


        try {
            this.updateState({ isThinking: true });
            const goodPlayerIds = state.players.filter(p => p.team === Team.Good).map(p => p.agent.id);
            this.log('Assassin is picking a target...');

            const costBefore = assassinPlayer.agent.getTokenUsage?.()?.totalCost ?? 0;
            const result = await assassinPlayer.agent.assassinate({
                ...this.buildBaseContext(assassinPlayer.agent.id),
                goodPlayerIds,
                allEvents: state.events || []
            }, (chunk, field, metadata) => {
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'ASSASSINATION') {
                        ev.isThinking = false;
                        if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                        else if (field === 'thought') ev.thought = (ev.thought || '') + chunk;
                        else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;
                        else if (field === 'situation_assessment') ev.situation_assessment = (ev.situation_assessment || '') + chunk;
                        else if (field === 'action_strategy') ev.action_strategy = (ev.action_strategy || '') + chunk;

                        if (metadata) {
                            if (metadata.promptSpeed) ev.promptSpeed = metadata.promptSpeed;
                            if (metadata.completionSpeed) ev.completionSpeed = metadata.completionSpeed;
                            if (metadata.prompt) ev.promptTokens = metadata.prompt;
                            if (metadata.candidates) ev.completionTokens = metadata.candidates;
                            if (metadata.cached) ev.cachedTokens = metadata.cached;
                        }
                    }
                    return { ...s, events: newEvents };
                });
            });

            const targetId = result.action.targetId;
            const targetPlayer = state.players.find(p => p.agent.id === targetId);
            this.log(`Assassin picked: ${targetPlayer?.agent.name || targetId}`);

            const message = this.i18n.translate('engine.assassinTarget', { assassin: assassinPlayer.agent.name, target: targetPlayer?.agent.name || targetId });
            const isMerlinKilled = targetPlayer?.role === Role.Merlin;
            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex];
                if (ev && ev.type === 'ASSASSINATION') {
                    ev.isThinking = false;
                    ev.status = 'success';
                    ev.message = message;
                    ev.icon = '🗡️';
                    ev.playerId = assassinPlayer.agent.id;
                    ev.playerName = assassinPlayer.agent.name;
                    ev.targetId = targetId;
                    ev.targetName = targetPlayer?.agent.name || targetId;
                    ev.self_check = result.self_check;
                    ev.reasoning = result.reasoning;
                    ev.thought = result.thought;
                    ev.situation_assessment = result.situation_assessment;
                    ev.action_strategy = result.action_strategy;
                    ev.promptText = result.promptText;
                    ev.retryLogs = result.retryLogs;
                    ev.cost = (assassinPlayer.agent.getTokenUsage?.()?.totalCost ?? 0) - costBefore;
                }
                return { ...s, events: newEvents, assassinTargetId: targetId, isMerlinKilled: isMerlinKilled, isThinking: false };
            });

            if (isMerlinKilled) {
                this.log(this.i18n.translate('engine.merlinAssassinated'));
                this.endGame(Team.Evil);
            } else {
                this.log(this.i18n.translate('engine.merlinSurvived'));
                this.endGame(Team.Good);
            }
        } catch (e) {
            this.handleAgentError(e, eventIndex);
            throw e;
        }
    }

    private async handleGameDebrief(instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        this.log('Game Debrief phase: Players share their reflections...');
        const state = this._state();

        for (const player of state.players) {
            if (this._state().isPaused || isStale()) return;

            // Skip human player reflections
            if (player.agent.modelName === 'Human') {
                continue;
            }

            // Mark as thinking
            this.updateState({ isThinking: true });

            // Search in CURRENT state to avoid stale index issues
            const existing = this._state().events.find(e =>
                e.type === 'GAME_DEBRIEF' && e.playerId === player.agent.id
            );

            if (existing && existing.status === 'success') {
                continue;
            }

            const eventIndex = existing ? this._state().events.indexOf(existing) : this._state().events.length;
            if (!existing) {
                this.addEvent({
                    type: 'GAME_DEBRIEF',
                    round: state.currentRound,
                    playerId: player.agent.id,
                    playerName: player.agent.name,
                    message: '',
                    timestamp: Date.now(),
                    isThinking: true,
                    status: 'pending'
                });
            }

            try {
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev) {
                        ev.isThinking = true;
                        ev.status = 'pending';
                    }
                    return { ...s, events: newEvents };
                });

                const costBefore = player.agent.getTokenUsage?.()?.totalCost ?? 0;
                const result = await player.agent.shareGameReflection({
                    round: state.currentRound,
                    winner: state.winner,
                    playerCount: state.players.length,
                    rolesInGame: state.rolesInGame,
                    missions: state.missions,
                    assassinTargetId: state.assassinTargetId,
                    isMerlinKilled: state.isMerlinKilled,
                    playerRoles: state.players.map(p => ({ id: p.agent.id, role: p.role })),
                    playerNames: Object.fromEntries(state.players.map(p => [p.agent.id, p.agent.name])),
                    allEvents: state.events
                }, (chunk, field, metadata) => {
                    this._state.update(s => {
                        const newEvents = [...s.events];
                        const ev = newEvents[eventIndex];
                        if (ev && ev.type === 'GAME_DEBRIEF') {
                            ev.isThinking = false;
                            if (field === 'reflection') {
                                ev.message += chunk;
                            }
                            else if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                            else if (field === 'thought') ev.thought = (ev.thought || '') + chunk;
                            else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;
                            else if (field === 'situation_assessment') {
                                ev.situation_assessment = (ev.situation_assessment || '') + chunk;
                                if ((player.agent as any).updateStreamingAssessment) (player.agent as any).updateStreamingAssessment(chunk);
                            }
                            else if (field === 'action_strategy') {
                                ev.action_strategy = (ev.action_strategy || '') + chunk;
                                if ((player.agent as any).updateStreamingStrategy) (player.agent as any).updateStreamingStrategy(chunk);
                            }

                            if (metadata) {
                                if (metadata.promptSpeed) ev.promptSpeed = metadata.promptSpeed;
                                if (metadata.completionSpeed) ev.completionSpeed = metadata.completionSpeed;
                                if (metadata.prompt) ev.promptTokens = metadata.prompt;
                                if (metadata.candidates) ev.completionTokens = metadata.candidates;
                                if (metadata.cached) ev.cachedTokens = metadata.cached;
                            }
                        }
                        return { ...s, events: newEvents };
                    });
                });

                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev) {
                        ev.isThinking = false;
                        if (ev.type === 'GAME_DEBRIEF') {
                            ev.message = result.reflection;
                            ev.self_check = result.self_check;
                            ev.reasoning = result.reasoning;
                            ev.thought = result.thought;
                            ev.situation_assessment = result.situation_assessment;
                            ev.action_strategy = result.action_strategy;
                        }
                        ev.promptText = result.promptText;
                        ev.retryLogs = result.retryLogs;
                        ev.status = 'success';
                        ev.cost = (player.agent.getTokenUsage?.()?.totalCost ?? 0) - costBefore;
                    }
                    return { ...s, events: newEvents, isThinking: false };
                });

                this.log(`[GameDebrief] ${player.agent.name}: ${result.reflection}`);
            } catch (e) {
                this.handleAgentError(e, eventIndex);
                if (this._state().isPaused) throw e;
            }
        }
    }

    private async updateAgentNotes(instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        const state = this._state();
        this.log('Agents are updating their notes...');

        // Resume check
        const existingEvent = state.events.find(e =>
            e.type === 'SYSTEM' &&
            e.subType === 'AGENT_NOTE_UPDATE' &&
            e.round === state.currentRound
        );

        if (existingEvent && existingEvent.status === 'success') {
            return;
        }

        const recentEvents = (state.events || [])
            .filter(e => 'round' in e && e.round === state.currentRound)
            .map(e => {
                switch (e.type) {
                    case 'DISCUSSION': {
                        const msg = (e.message || '').trim();
                        if (!msg) return '';
                        return `[Discussion] ${e.playerName}: ${msg}`;
                    }
                    case 'TEAM_PROPOSAL': return `[Proposal] ${e.leaderName} officially proposed the team: [${e.teamNames.join(', ')}]`;
                    case 'VOTE_RESULTS': {
                        const teamStr = e.teamNames ? ` [Team: ${e.teamNames.join(', ')}]` : '';
                        return `[Vote] Passed: ${e.passed}.${teamStr} Votes: ${e.votes.map((v: { name: string; approve: boolean }) => v.name + (v.approve ? '(O)' : '(X)')).join(', ')}`;
                    }
                    case 'MISSION_OUTCOME': return `[Mission] The team [${e.teamNames.join(', ')}] returned a result: ${e.succeeded ? 'Success' : 'Fail'} (Fails: ${e.failsCount})`;
                    case 'SYSTEM': {
                        //if (e.subType === 'PLAYER_PASS' || e.subType === 'PLAYER_FINISH' || e.subType === 'FORCED_PASS') return '';
                        return `[System] ${e.message}`;
                    }
                    default: return '';
                }
            })
            .filter(s => s !== '');

        const eventIndex = existingEvent ? this._state().events.indexOf(existingEvent) : this._state().events.length;
        if (!existingEvent) {
            this.addEvent({
                type: 'SYSTEM',
                subType: 'AGENT_NOTE_UPDATE',
                round: state.currentRound,
                message: this.i18n.translate('board.updatingNotes', { names: '...' }).replace('wait', 'complete'),
                icon: '📝',
                status: 'pending'
            });
        } else {
            // Update existing event to pending
            this._state.update(s => {
                const newEvents = [...s.events];
                newEvents[eventIndex] = { ...newEvents[eventIndex], status: 'pending', isThinking: true, error: undefined };
                return { ...s, events: newEvents };
            });
        }

        try {
            const pendingIds = state.players.map(p => p.agent.id);
            this.updateState({ updatingNotePlayerIds: pendingIds });

            const costsBefore = Object.fromEntries(state.players.map(p => [p.agent.id, p.agent.getTokenUsage?.()?.totalCost ?? 0]));
            const playerTokens: Record<string, { prompt: number, completion: number, cached: number }> = {};

            const playerNotes: Record<string, string> = {};

            await Promise.all(state.players.map(async p => {
                const newNote = await p.agent.updateNote({
                    ...this.buildBaseContext(p.agent.id),
                    playerCount: state.players.length,
                    recentEvents,
                    personalNote: ''
                }, (chunk, field, metadata) => {
                    if (metadata) {
                        playerTokens[p.agent.id] = {
                            prompt: metadata.prompt || 0,
                            completion: metadata.candidates || 0,
                            cached: metadata.cached || 0
                        };
                        this._state.update(s => {
                            const newEvents = [...s.events];
                            const ev = newEvents[eventIndex];
                            if (ev && ev.type === 'SYSTEM' && ev.subType === 'AGENT_NOTE_UPDATE') {
                                ev.promptTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.prompt, 0);
                                ev.completionTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.completion, 0);
                                ev.cachedTokens = Object.values(playerTokens).reduce((acc, curr) => acc + curr.cached, 0);
                            }
                            return { ...s, events: newEvents };
                        });
                    }
                });
                playerNotes[p.agent.id] = newNote;

                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'SYSTEM' && ev.subType === 'AGENT_NOTE_UPDATE') {
                        // Keep status pending until all players are done.
                    }
                    return {
                        ...s,
                        events: newEvents,
                        updatingNotePlayerIds: (s.updatingNotePlayerIds || []).filter(id => id !== p.agent.id)
                    };
                });
            }));

            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex];
                if (ev && ev.type === 'SYSTEM' && ev.subType === 'AGENT_NOTE_UPDATE') {
                    ev.status = 'success';
                    ev.message = this.i18n.translate('board.updatingNotes', { names: 'Everyone' }).split('...')[0].trim() + ' Done.';
                    ev.cost = state.players.reduce((acc, p) => acc + ((p.agent.getTokenUsage?.()?.totalCost ?? 0) - (costsBefore[p.agent.id] || 0)), 0);
                    ev.privateNotes = playerNotes;
                }
                return { ...s, events: newEvents };
            });
        } catch (e) {
            console.error('[GameEngine] Error during agent note update:', e);
            this.handleAgentError(e, eventIndex);
            throw e; // Important: throw to stop runGameLoop and wait for retry
        } finally {
            this.updateState({ updatingNotePlayerIds: [] });
        }
    }

    private collectAllAgentNotes(): Record<string, string> {
        const notes: Record<string, string> = {};
        for (const p of this._state().players) {
            notes[p.agent.id] = p.agent.getPersonalNote();
        }
        return notes;
    }

    private async handleLadyOfTheLake(instanceId: number) {
        const isStale = () => instanceId !== this._gameInstanceId;
        if (isStale()) return;

        const state = this._state();
        const holderId = state.ladyHolder;
        if (!holderId || !state.options?.lady) return;

        const holder = state.players.find(p => p.agent.id === holderId);
        if (!holder) return;

        this.log(`[Lady of the Lake] Waiting for ${holder.agent.name} to use the card...`);

        try {
            const result = await holder.agent.useLadyOfTheLake({
                ...this.buildBaseContext(holder.agent.id),
                holderId: holder.agent.id,
                ladyHistory: state.ladyHistory || []
            });
            const targetId = result.targetId;

            if (targetId && targetId !== holder.agent.id) {
                const target = state.players.find(p => p.agent.id === targetId);
                if (target) {
                    const isTargetEvil = ROLE_META[target.role].team === Team.Evil;
                    this.log(`[Lady of the Lake] ${holder.agent.name} investigated ${target.agent.name}.`);

                    this.addEvent({
                        type: 'SYSTEM',
                        subType: 'LADY_CHECKED',
                        round: state.currentRound,
                        message: this.i18n.translate('engine.ladyChecked', { holder: holder.agent.name, target: target.agent.name }),
                        icon: '🧚‍♀️',
                        thought: result.thought,
                        reasoning: result.reasoning,
                        self_check: result.self_check,
                        situation_assessment: result.situation_assessment,
                        action_strategy: result.action_strategy,
                        promptText: result.promptText,
                        retryLogs: result.retryLogs,
                    });

                    // Update holder for next round
                    this.updateState({
                        ladyHolder: targetId,
                        ladyHistory: [...(state.ladyHistory || []), { holderId: holderId, targetId: targetId, result: isTargetEvil }]
                    });
                }
            } else {
                this.log(`[Lady] ${holder.agent.name} decided not to use Lady of the Lake.`);
            }
        } catch (e) {
            console.error('[LadyOfTheLake] Error:', e);
            const eventIndex = this._state().events.length - 1;
            this.handleAgentError(e, eventIndex);
            throw e;
        }
    }

    // --- Helpers ---

    private changePhase(phase: GamePhase, patch: Partial<GameState> = {}) {
        const state = this._state();
        if (state.isPaused || state.error) {
            console.warn(`[GameEngine] changePhase rejected: Game is paused or in error state. Target: ${phase}`);
            return;
        }
        console.log(`[GameEngine] changePhase: ${state.phase} -> ${phase}`, patch);

        // Reset discussion state if entering a discussion-based phase
        if ([GamePhase.Discussion, GamePhase.MissionDebrief, GamePhase.AssassinationDiscussion, GamePhase.GameDebrief].includes(phase) && !patch.discussion) {
            let maxRounds = 10;
            if (phase === GamePhase.Discussion) maxRounds = 6;
            else if (phase === GamePhase.AssassinationDiscussion) maxRounds = 3;
            else if (phase === GamePhase.MissionDebrief || phase === GamePhase.GameDebrief) maxRounds = 1;

            patch.discussion = {
                roundNumber: 1,
                maxRounds: maxRounds,
                passedAgentIds: new Set<string>(),
                lastPersonSpeechCount: {}
            };
        }

        const eventRound = patch.currentRound !== undefined ? patch.currentRound : state.currentRound;
        const eventFailedVotes = patch.consecutiveFailedVotes !== undefined ? patch.consecutiveFailedVotes : state.consecutiveFailedVotes;

        // Only add event if it's a NEW phase transition
        const alreadyHasEvent = state.events.some(e =>
            e.type === 'PHASE_CHANGE' &&
            e.phase === phase &&
            e.round === eventRound &&
            e.failedVotes === eventFailedVotes
        );

        if (!alreadyHasEvent) {
            this.addEvent({ type: 'PHASE_CHANGE', phase, round: eventRound, failedVotes: eventFailedVotes });
        }

        if (phase === GamePhase.GameOver) {
            patch.perspectiveId = null;
        }

        this.updateState({ phase, ...patch });
    }

    private updateState(patch: Partial<GameState>) {
        this._state.update(s => ({ ...s, ...patch }));
    }

    private rotateLeader() {
        const state = this._state();
        const nextIndex = (state.currentLeaderIndex + 1) % state.players.length;
        this.updateState({ currentLeaderIndex: nextIndex });
    }

    private endGame(winner: Team) {
        this.log(`Game Over! ${winner === Team.Good ? 'Good' : 'Evil'} Faction wins!`);

        const alreadyGameOver = this._state().events.some(e => e.type === 'GAME_OVER');
        if (!alreadyGameOver) {
            this.addEvent({
                type: 'GAME_OVER',
                winner: winner,
                reason: winner === Team.Good ? this.i18n.translate('engine.goodWins') : this.i18n.translate('engine.evilWins')
            });
        }

        // Only update record-keeping state, Phase transition is handled by the loop
        this.updateState({ winner });
    }


    private autoSaveRecord(winner: Team) {
        const state = this._state();
        const players: GameRecordPlayer[] = state.players.map(p => ({
            id: p.agent.id,
            name: p.agent.name,
            role: p.role,
            team: p.team,
            modelName: p.agent.modelName,
            systemInstruction: p.agent.getSystemInstruction?.()
        }));

        // All usage from events (single source of truth)
        let promptTokens = 0, completionTokens = 0, cachedTokens = 0, totalCost = 0;
        for (const e of state.events) {
            promptTokens += e.promptTokens || 0;
            completionTokens += e.completionTokens || 0;
            cachedTokens += e.cachedTokens || 0;
            totalCost += e.cost || 0;
        }

        const record: GameRecord = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            playerCount: players.length,
            players,
            winner: winner,
            isMerlinKilled: state.isMerlinKilled,
            events: state.events,
            options: state.options,
            tokenUsage: { promptTokens, completionTokens, cachedTokens, totalCost }
        };

        this.gameRecordService.save(record).catch(err =>
            console.error('[GameEngine] Failed to auto-save game record:', err)
        );
    }

    private handleAgentError(e: unknown, eventIndex: number) {
        const error = e as Error;
        console.error('[GameEngine] Agent Error:', error);

        let displayMessage = error?.message || String(error);
        if (e instanceof AgentFatalError) {
            displayMessage = `Agent Fatal Error: ${e.agentName} failed during ${e.action}. ${e.lastErrorMessage}`;
        }

        this._state.update(s => {
            const newEvents = s.events.map((ev, idx) => {
                if (idx === eventIndex) {
                    return { ...ev, isThinking: false, status: 'error' as const, error: displayMessage };
                }
                return ev;
            });
            return {
                ...s,
                events: newEvents,
                error: displayMessage,
                isPaused: true,
                isThinking: false,
            };
        });
    }

    reset() {
        this._state.set({
            phase: GamePhase.Setup,
            players: [],
            currentLeaderIndex: 0,
            currentRound: 1,
            consecutiveFailedVotes: 0,
            missions: [],
            proposedTeamIds: [],
            discussion: null,
            error: null,
            winner: null,
            assassinTargetId: null,
            isMerlinKilled: false,
            rolesInGame: [],
            options: { excalibur: false, lady: false, questVoting: false, plotCards: false },
            excaliburHolder: null,
            ladyHolder: null,
            ladyHistory: [],
            events: [],
            updatingNotePlayerIds: [],
            signaledThisRoundIds: [],
        });
        this.history.set([]);
        this._gameInstanceId++; // Invalidate stale loops
        this._isRunningLoop = false;
        this.wakeLock.stop();
    }

    resumeGame() {
        if (!this._state().isPaused) return;
        this._state.update(s => ({ ...s, error: null, isPaused: false }));
        this.log('Resuming game...');
        setTimeout(() => this.runGameLoop(this._gameInstanceId), 0);
    }

    async retryEvent(eventToRetry: GameEvent) {
        if (!eventToRetry || eventToRetry.status !== 'error') {
            console.warn('Cannot retry event:', eventToRetry);
            return;
        }

        this._state.update(s => {
            const newEvents = s.events.map(e => {
                if (e === eventToRetry) {
                    return { ...e, status: 'pending' as const, isThinking: true, error: undefined };
                }
                return e;
            });
            return { ...s, events: newEvents, isPaused: false, error: null, isThinking: true };
        });

        this.log(`Retrying event: ${eventToRetry.type}...`);
        setTimeout(() => this.runGameLoop(this._gameInstanceId), 0);
    }

    addEvent(event: GameEvent) {
        console.log('[GameEvent]', event.type, event);
        const state = this._state();
        const currentFailedVotes = state.consecutiveFailedVotes;

        if (event.type === 'PHASE_CHANGE' || event.type === 'DISCUSSION' ||
            event.type === 'TEAM_PROPOSAL' || event.type === 'VOTE_RESULTS' || event.type === 'SYSTEM') {
            if (event.round === undefined) (event as any).round = state.currentRound;
            if ((event as any).failedVotes === undefined) (event as any).failedVotes = currentFailedVotes;
        }

        this._state.update(s => ({ ...s, events: [...(s.events || []), event] }));
    }

    private log(message: string) {
        this.history.update(h => [`[${new Date().toLocaleTimeString()}] ${message}`, ...h]);
    }

    private buildBaseContext(agentId?: string): BaseGameContext {
        const state = this._state();
        const playerNames: Record<string, string> = {};
        for (const p of state.players) {
            playerNames[p.agent.id] = p.agent.name;
        }

        const filterEventNotes = (events: GameEvent[]) => {
            if (!agentId) return events; // God View or internal - keep all
            return events.map(e => {
                if (!e.privateNotes) return e;
                const filteredNotes: Record<string, string> = {};
                if (e.privateNotes[agentId]) {
                    filteredNotes[agentId] = e.privateNotes[agentId];
                }
                return { ...e, privateNotes: filteredNotes };
            });
        };

        const allEvents = filterEventNotes((state.events || []).filter(e => {
            if (e.type === 'SYSTEM' || e.type === 'PHASE_CHANGE' || e.type === 'ROUND_START' || e.type === 'GAME_OVER') return true;
            return e.status === 'success';
        }));

        const roundEvents = allEvents.filter(e => 'round' in e && e.round === state.currentRound);

        return {
            round: state.currentRound,
            missionHistory: state.missions,
            roundEvents,
            playerIds: state.players.map(p => p.agent.id),
            playerNames,
            consecutiveFailedVotes: state.consecutiveFailedVotes,
            currentMissionSize: GAME_CONFIGS[state.players.length].missionSizes[state.currentRound - 1],
            allEvents,
            rolesInGame: state.rolesInGame,
            twoFailsRequiredInRound4: GAME_CONFIGS[state.players.length].twoFailsRequiredInRound4 || false,
            playerCount: state.players.length,
            hasSignaledThisRound: agentId ? (state.signaledThisRoundIds || []).includes(agentId) : false
        };
    }

    private getNightPhaseInfoForRole(role: Role, selfId: string, allPlayers: PlayerState[]): { info: { id: string; name: string; info: string; team?: Team }[]; summary?: string } {
        const isEvil = (r: Role) => ROLE_META[r].team === Team.Evil;
        const info: { id: string; name: string; info: string; team?: Team }[] = [];
        let summary: string | undefined;

        const otherPlayers = allPlayers.filter(p => p.agent.id !== selfId);
        const rolesInGame = allPlayers.map(p => p.role);

        const hasMordred = rolesInGame.includes(Role.Mordred);
        const hasOberon = rolesInGame.includes(Role.Oberon);

        switch (role) {
            case Role.Merlin: {
                otherPlayers.forEach(p => {
                    if (isEvil(p.role) && p.role !== Role.Mordred) {
                        info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.evil'), team: Team.Evil });
                    } else if (hasMordred) {
                        info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.good_or_mordred'), team: undefined });
                    } else {
                        info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.good'), team: Team.Good });
                    }
                });
                if (hasMordred) {
                    summary = this.i18n.translate('agent.night.intel_summary', { info: this.i18n.translate('agent.night.merlin_summary') });
                }
                break;
            }

            case Role.Percival: {
                otherPlayers.forEach(p => {
                    if (p.role === Role.Merlin || p.role === Role.Morgana) {
                        info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.merlin_or_morgana'), team: undefined });
                    } else {
                        info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.unknown'), team: undefined });
                    }
                });
                summary = this.i18n.translate('agent.night.intel_summary', { info: this.i18n.translate('agent.night.percival_summary') });
                break;
            }

            case Role.Assassin:
            case Role.Mordred:
            case Role.Morgana:
            case Role.MinionOfMordred: {
                otherPlayers.forEach(p => {
                    if (isEvil(p.role) && p.role !== Role.Oberon) {
                        info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.evil_ally'), team: Team.Evil });
                    } else if (hasOberon) {
                        info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.good_or_oberon'), team: undefined });
                    } else {
                        info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.good'), team: Team.Good });
                    }
                });
                if (hasOberon) {
                    summary = this.i18n.translate('agent.night.intel_summary', { info: this.i18n.translate('agent.night.evil_summary') });
                }
                break;
            }

            case Role.Oberon:
            case Role.LoyalServant:
            default: {
                otherPlayers.forEach(p => {
                    info.push({ id: p.agent.id, name: p.agent.name, info: this.i18n.translate('agent.night.labels.unknown'), team: undefined });
                });
                // Calculate total Good and Evil counts
                const goodCount = rolesInGame.filter(r => ROLE_META[r].team === Team.Good).length;
                const evilCount = rolesInGame.filter(r => ROLE_META[r].team === Team.Evil).length;
                const myTeam = ROLE_META[role].team;

                const remainingGood = myTeam === Team.Good ? goodCount - 1 : goodCount;
                const remainingEvil = myTeam === Team.Evil ? evilCount - 1 : evilCount;

                const summaryText = this.i18n.translate('setup.goodFaction') + ` ${remainingGood}, ` + this.i18n.translate('setup.evilFaction') + ` ${remainingEvil}`;
                summary = this.i18n.translate('agent.night.intel_summary', { info: summaryText });
                break;
            }
        }
        return { info, summary };
    }

    private processHiddenSignal(senderId: string, signalData: { target: string | null; signal: string | null }, event: GameEvent) {
        if (!senderId || !signalData || !signalData.target || !signalData.signal || !event) return;

        const state = this._state();
        const players = state.players;
        const normalizedSenderId = senderId.trim().toLowerCase();
        const sender = players.find(p => p.agent.id.trim().toLowerCase() === normalizedSenderId);
        if (!sender) return;

        // 1. Resolve & Validate Target
        const rawTarget = (signalData.target || '').trim().toLowerCase();
        const validIds = new Set(players.map(p => p.agent.id.trim().toLowerCase()));
        const nameToId = new Map(players.map(p => [p.agent.name.trim().toLowerCase(), p.agent.id.trim().toLowerCase()]));
        const nameIdFormatToId = new Map(players.map(p => [`${p.agent.name}(${p.agent.id})`.trim().toLowerCase(), p.agent.id.trim().toLowerCase()]));

        let targetId: string | null = null;
        if (validIds.has(rawTarget)) {
            targetId = rawTarget;
        } else if (nameToId.has(rawTarget)) {
            targetId = nameToId.get(rawTarget)!;
        } else if (nameIdFormatToId.has(rawTarget)) {
            targetId = nameIdFormatToId.get(rawTarget)!;
        } else {
            const match = rawTarget.match(/\((p\d+)\)$/i);
            if (match && validIds.has(match[1].toLowerCase())) {
                targetId = match[1].toLowerCase();
            }
        }

        // Must be a valid ID and NOT the sender, and NOT 'none'
        if (!targetId || targetId === normalizedSenderId || targetId === 'none' || signalData.signal === 'none') {
            // this.log(`[Hidden Signal] skipped: ${signalData.target} / ${signalData.signal}`);
            return;
        }

        // Store target ID on event for UI filtering
        if (event.type === 'DISCUSSION' || event.type === 'GAME_DEBRIEF' || event.type === 'ASSASSINATION') {
            (event as any).hiddenSignalTargetId = targetId;
        }

        // Mark as used this round
        const signaledIds = state.signaledThisRoundIds || [];
        if (!signaledIds.includes(normalizedSenderId)) {
            this.updateState({ signaledThisRoundIds: [...signaledIds, normalizedSenderId] });
        }

        const targetPlayer = players.find(p => p.agent.id.trim().toLowerCase() === targetId)!;
        const signalText = signalData.signal; // 'wink' or 'frown'
        const privateNotes: Record<string, string> = {};

        // 2. Roll for Receiver (80%)
        const receiverSuccess = Math.random() < 0.8;
        if (receiverSuccess) {
            privateNotes[targetPlayer.agent.id] = this.i18n.translate('agent.signal.receiver', {
                sender: sender.agent.name,
                signal: signalText
            });
        }

        // 3. Target-Neighbor Risk Roll (20% global trigger)
        const observersWhoNoticed: string[] = [];
        if (Math.random() < 0.2) {
            const targetIndex = players.findIndex(p => p.agent.id.trim().toLowerCase() === targetId);
            if (targetIndex !== -1) {
                // Find neighbors of the TARGET
                const neighborIndices = [
                    (targetIndex - 1 + players.length) % players.length,
                    (targetIndex + 1) % players.length
                ];

                // Filter neighbors: must exist, not be the sender, and not be the target itself
                const potentialObservers = neighborIndices
                    .map(idx => players[idx])
                    .filter(p => {
                        const pid = p.agent.id.trim().toLowerCase();
                        return pid !== normalizedSenderId && pid !== targetId;
                    });

                if (potentialObservers.length > 0) {
                    // Randomly pick one neighbor: they ALWAYS notice if the global trigger hit
                    const shuffled = [...potentialObservers].sort(() => Math.random() - 0.5);
                    const guaranteedObserver = shuffled.pop()!;

                    observersWhoNoticed.push(guaranteedObserver.agent.name);
                    privateNotes[guaranteedObserver.agent.id] = this.i18n.translate('agent.signal.observer', {
                        sender: sender.agent.name,
                        target: targetPlayer.agent.name,
                        signal: signalText
                    });

                    // If there's another neighbor, they have a 20% chance
                    if (shuffled.length > 0) {
                        const secondNeighbor = shuffled[0];
                        if (Math.random() < 0.2) {
                            observersWhoNoticed.push(secondNeighbor.agent.name);
                            privateNotes[secondNeighbor.agent.id] = this.i18n.translate('agent.signal.observer', {
                                sender: sender.agent.name,
                                target: targetPlayer.agent.name,
                                signal: signalText
                            });
                        }
                    }
                }
            }
        }

        // 4. Sender's Private Note
        const statusKey = receiverSuccess ? 'agent.signal.received' : 'agent.signal.notReceived';
        const status = this.i18n.translate(statusKey);
        const noticed = observersWhoNoticed.length > 0
            ? this.i18n.translate('agent.signal.noticed', { observers: observersWhoNoticed.join(', ') })
            : '';

        privateNotes[sender.agent.id] = this.i18n.translate('agent.signal.sender', {
            signal: signalText,
            target: targetPlayer.agent.name,
            status,
            noticed
        });

        // Store in event
        (event as any).privateNotes = privateNotes;
    }

    getVisibleRoleInfo(observerId: string | null, targetPlayer: PlayerState): { role: string; team: string; isOriginal: boolean } {
        if (!observerId) {
            const meta = ROLE_META[targetPlayer.role];
            return { role: targetPlayer.role, team: meta.team, isOriginal: true };
        }

        // Own role is always visible
        if (observerId === targetPlayer.agent.id) {
            const meta = ROLE_META[targetPlayer.role];
            return { role: targetPlayer.role, team: meta.team, isOriginal: true };
        }

        const observer = this._state().players.find(p => p.agent.id === observerId);
        if (!observer) return { role: 'UNKNOWN', team: 'UNKNOWN', isOriginal: false };

        const observerRole = observer.role;
        const targetRole = targetPlayer.role;

        // Logic based on Avalon rules
        switch (observerRole) {
            case Role.Merlin:
                // Merlin knows Evil, except Mordred
                if (ROLE_META[targetRole].team === Team.Evil && targetRole !== Role.Mordred) {
                    return { role: 'EVIL', team: Team.Evil, isOriginal: false };
                }
                break;
            case Role.Percival:
                // Percival sees Merlin and Morgana
                if (targetRole === Role.Merlin || targetRole === Role.Morgana) {
                    return { role: 'MERLIN_OR_MORGANA', team: 'UNKNOWN', isOriginal: false };
                }
                break;
            case Role.Assassin:
            case Role.Mordred:
            case Role.Morgana:
            case Role.MinionOfMordred:
                // Evil knows each other, except Oberon
                if (ROLE_META[targetRole].team === Team.Evil && targetRole !== Role.Oberon) {
                    return { role: 'EVIL_ALLY', team: Team.Evil, isOriginal: false };
                }
                break;
        }

        return { role: 'UNKNOWN', team: 'UNKNOWN', isOriginal: false };
    }
    private shuffle<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}
