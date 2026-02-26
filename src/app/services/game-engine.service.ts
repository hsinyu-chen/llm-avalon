import { Injectable, signal, computed, inject } from '@angular/core';
import { GameState, PlayerState, MissionRecord, GameOptions } from '../models/game-state';
import { GamePhase, GameEvent } from '../models/game-event';
import { Role, Team, ROLE_META } from '../models/role';
import { IAgent, SpeechEntry, BaseGameContext, SpeakContext } from '../models/agent.interface';
import { GAME_CONFIGS } from '../models/game-config';
import { I18nService } from '../i18n/i18n.service';
import { AgentFatalError } from '../models/errors';

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

    // Flag to prevent multiple parallel loops
    private _isRunningLoop = false;

    // Log of events (mostly for God-view and history)
    readonly history = signal<string[]>([]);

    private i18n = inject(I18nService);

    /** Start a new game with the given agents and roles */
    async startGame(agents: IAgent[], roleSelection: Role[], options?: GameOptions) {
        if (agents.length !== roleSelection.length) {
            throw new Error('Number of agents must match number of roles');
        }

        const config = GAME_CONFIGS[agents.length];
        if (!config) throw new Error(`Unsupported player count: ${agents.length}`);

        // Shuffle roles
        const shuffledRoles = [...roleSelection].sort(() => Math.random() - 0.5);

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
            signaledThisRoundIds: [],
        });

        this.addEvent({ type: 'ROUND_START', round: 1 });
        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.Night, round: 1 });

        this.log(this.i18n.translate('engine.gameStarted'));

        // Start the game loop in the background to avoid blocking the UI transition
        setTimeout(() => this.runGameLoop(), 0);
    }

    private async runGameLoop() {
        if (this._isRunningLoop) return;
        this._isRunningLoop = true;

        try {
            while (this._state().phase !== GamePhase.GameOver && !this._state().isPaused) {
                const state = this._state();
                this._state.update(s => ({ ...s, isThinking: false }));

                // Standard yield to keep UI responsive and allow signal propagation
                await new Promise(resolve => setTimeout(resolve, 0));

                console.log(`[GameLoop] Phase: ${state.phase}, Round: ${state.currentRound}, FailedVotes: ${state.consecutiveFailedVotes}`);

                switch (state.phase) {
                    case GamePhase.Night:
                        await this.handleNightPhase();
                        this.changePhase(GamePhase.Opening);
                        break;

                    case GamePhase.Opening:
                        await this.handleOpeningPhase();
                        this.changePhase(GamePhase.TeamProposal);
                        break;

                    case GamePhase.TeamProposal:
                        const proposal = await this.handleTeamProposal();
                        // Transition to discussion with the proposed team
                        this.changePhase(GamePhase.Discussion, { proposedTeamIds: proposal.teamIds });
                        break;

                    case GamePhase.Discussion:
                        await this.handleDiscussion('DISCUSSION');
                        this.changePhase(GamePhase.Vote);
                        break;
                    case GamePhase.Vote:
                        const voteResult = await this.handleVote();
                        if (voteResult.passed) {
                            if (this._state().options?.excalibur) {
                                await this.handleExcaliburAssignment();
                            }
                            this.changePhase(GamePhase.Mission, { consecutiveFailedVotes: 0 });
                        } else {
                            if (voteResult.failCount >= 5) {
                                this.endGame(Team.Evil);
                                this.changePhase(GamePhase.GameDebrief);
                            } else {
                                this.rotateLeader();
                                this.changePhase(GamePhase.TeamProposal, { consecutiveFailedVotes: voteResult.failCount });
                            }
                        }
                        break;

                    case GamePhase.Mission:
                        const missionOutcome = await this.handleMission();
                        if (this._state().phase === GamePhase.GameOver) {
                            this.changePhase(GamePhase.GameDebrief);
                            break;
                        }

                        const successCount = this._state().missions.filter(m => m.succeeded).length;
                        const failCount = this._state().missions.filter(m => !m.succeeded).length;
                        console.log(`[GameLoop] Mission Result: S=${successCount}, F=${failCount}`);

                        if (failCount >= 3) {
                            this.log(`Evil wins by points: ${failCount} missions failed.`);
                            this.endGame(Team.Evil);
                            this.changePhase(GamePhase.GameDebrief);
                        } else if (successCount >= 3) {
                            this.log(`Good reaches 3 points! Entering Assassination phase.`);
                            await this.updateAgentNotes();
                            this.changePhase(GamePhase.AssassinationDiscussion);
                        } else {
                            this.log(`Game continues. Current Score: Good ${successCount}, Evil ${failCount}`);
                            this.rotateLeader();
                            await this.handleLadyOfTheLake();
                            this.currentRoundChatLog = [];
                            this.changePhase(GamePhase.MissionDebrief, { proposedTeamIds: [] });
                        }
                        break;
                    case GamePhase.MissionDebrief:
                        await this.handleMissionDebrief();
                        await this.updateAgentNotes();
                        const nextRound = this._state().currentRound + 1;
                        this.addEvent({ type: 'ROUND_START', round: nextRound });
                        this.changePhase(GamePhase.TeamProposal, {
                            currentRound: nextRound,
                            signaledThisRoundIds: []
                        });
                        break;

                    case GamePhase.AssassinationDiscussion:
                        await this.handleAssassinationDiscussion();
                        this.changePhase(GamePhase.Assassination);
                        break;

                    case GamePhase.Assassination:
                        await this.handleAssassination();
                        this.changePhase(GamePhase.GameDebrief);
                        break;

                    case GamePhase.GameDebrief:
                        await this.handleGameDebrief();
                        this.changePhase(GamePhase.GameOver);
                        break;

                    case GamePhase.GameOver:
                        this.log('Game Over.');
                        return;

                    default:
                        console.warn('Unhandled game phase:', state.phase);
                        return;
                }
            }
        } catch (e) {
            console.error('[GameLoop] Fatal Error:', e);
            this.handleAgentError(e, -1);
        } finally {
            this._isRunningLoop = false;
        }
    }

    private async handleNightPhase() {
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

    private async handleOpeningPhase() {
        this.log('Phase OPENING: Starting self-introductions...');
        const state = this._state();
        const startIndex = state.currentLeaderIndex;
        const playerCount = state.players.length;

        for (let i = 0; i < playerCount; i++) {
            if (this._state().isPaused) return;

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

                const result = await player.agent.speak({
                    ...this.buildBaseContext(player.agent.id),
                    phase: 'OPENING',
                    chatLog: [...this.currentRoundChatLog],
                    visibleAgentIds: state.players.map(p => p.agent.id),
                    proposedTeam: [],
                    leaderId: state.players[state.currentLeaderIndex].agent.id,
                    discussionRound: 0
                }, (chunk, field) => {
                    this._state.update(s => {
                        const newEvents = [...s.events];
                        const ev = newEvents[eventIndex];
                        if (ev && ev.type === 'DISCUSSION') {
                            ev.isThinking = false;
                            if (field === 'speech') ev.message += chunk;
                            else if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                            else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;
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
                        ev.promptText = result.promptText;
                        ev.retryLogs = result.retryLogs;
                        ev.status = 'success';
                        this.processHiddenSignal(player.agent.id, result.action.pass_hidden_signal, ev);
                    }
                    return { ...s, events: newEvents, isThinking: false };
                });

                this.log(`[Opening] ${player.agent.name}: ${message}`);
            } catch (e) {
                this.handleAgentError(e, eventIndex);
                return; // Stop this phase
            }
        }

        if (this._state().isPaused) return;
    }

    private async handleTeamProposal(): Promise<{ teamIds: string[] }> {
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

            const result = await leader.agent.proposeTeam({
                ...this.buildBaseContext(leader.agent.id),
                round: state.currentRound,
                teamSize: GAME_CONFIGS[state.players.length].missionSizes[state.currentRound - 1],
                playerIds: state.players.map(p => p.agent.id),
                playerNames: Object.fromEntries(state.players.map(p => [p.agent.id, p.agent.name]))
            }, (chunk, field) => {
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'TEAM_PROPOSAL') {
                        ev.isThinking = false;
                        if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                        else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;
                        else if (field === 'situation_assessment') {
                            ev.situation_assessment = (ev.situation_assessment || '') + chunk;
                            if ((leader.agent as any).updateStreamingAssessment) (leader.agent as any).updateStreamingAssessment(chunk);
                        }
                        else if (field === 'action_strategy') {
                            ev.action_strategy = (ev.action_strategy || '') + chunk;
                            if ((leader.agent as any).updateStreamingStrategy) (leader.agent as any).updateStreamingStrategy(chunk);
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
                    ev.self_check = result.self_check;
                    ev.situation_assessment = result.situation_assessment;
                    ev.action_strategy = result.action_strategy;
                    ev.promptText = result.promptText;
                    ev.retryLogs = result.retryLogs;
                    ev.status = 'success';
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

    private async handleExcaliburAssignment() {
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

    private async handleDiscussion(phase: 'DISCUSSION' | 'MISSION_DEBRIEF' | 'ASSASSINATION_DISCUSSION') {
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
        const isDebrief = phase === 'MISSION_DEBRIEF' || phase === 'ASSASSINATION_DISCUSSION';
        const maxRounds = isDebrief ? 1 : (state.discussion?.maxRounds ?? 10);
        const lastPersonSpeechCount = state.discussion?.lastPersonSpeechCount ?? {};

        while (passedAgentIds.size < state.players.length && roundNumber <= maxRounds) {
            if (this._state().isPaused) return;

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
                    message: `[${phase}] Turn ${roundNumber}${currentAttempt > 0 ? ` (Attempt ${currentAttempt + 1})` : ''}`,
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
                if (this._state().isPaused) return;

                const player = state.players[(startIndex + i) % playerCount];
                if (passedAgentIds.has(player.agent.id)) {
                    this.log(`[Discussion] ${player.agent.name} has already passed.`);
                    continue;
                }

                // --- Idempotency and Error Handling ---
                let eventIndex = this._state().events.findIndex(e =>
                    e.type === 'DISCUSSION' &&
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

                    const result = await player.agent.speak({
                        ...this.buildBaseContext(player.agent.id),
                        phase,
                        chatLog: [...this.currentRoundChatLog],
                        visibleAgentIds: state.players.map(p => p.agent.id),
                        proposedTeam: state.proposedTeamIds,
                        leaderId: state.players[state.currentLeaderIndex].agent.id,
                        discussionRound: roundNumber,
                        assassinId: phase === 'ASSASSINATION_DISCUSSION' ? state.players.find(p => p.role === Role.Assassin)?.agent.id : undefined
                    } as SpeakContext, (chunk, field) => {
                        this._state.update(s => {
                            const newEvents = [...s.events];
                            const ev = newEvents[eventIndex];
                            if (ev && (ev.type === 'DISCUSSION' || ev.type === 'GAME_DEBRIEF')) {
                                ev.isThinking = false;
                                if (chunk === '') { // handle reset command from agent
                                    if (field === 'speech') ev.message = '';
                                    else if (field === 'reasoning') ev.reasoning = '';
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
                                ev.situation_assessment = result.situation_assessment;
                                ev.action_strategy = result.action_strategy;
                            }
                            ev.promptText = result.promptText;
                            ev.retryLogs = result.retryLogs;
                            ev.status = 'success';
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
                    return; // Stop phase
                }
            }
            roundNumber++;
        }

        if (this._state().isPaused) return;

        const actualRounds = roundNumber - 1;
        this.log(`Discussion concluded after ${actualRounds} round${actualRounds !== 1 ? 's' : ''}.`);

        this.updateState({ discussion: null });
    }

    private async handleMissionDebrief() {
        await this.handleDiscussion('MISSION_DEBRIEF');
    }

    // Store chat log between discussion and vote phases
    private currentRoundChatLog: SpeechEntry[] = [];

    private async handleVote(): Promise<{ passed: boolean, failCount: number }> {
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
            const votesResult = await Promise.all(players.map(p =>
                p.agent.vote({
                    ...this.buildBaseContext(p.agent.id),
                    proposedTeam: [...proposedIds],
                    leaderId: players[state.currentLeaderIndex].agent.id,
                    excaliburHolderId: state.excaliburHolder || null,
                    chatLog: this.currentRoundChatLog
                }).then(voteResult => ({
                    id: p.agent.id,
                    name: p.agent.name,
                    approve: voteResult.action.voteChoice,
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

    private async handleMission(): Promise<{ succeeded: boolean, failsCount: number }> {
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
            const missionResponses = await Promise.all(onMission.map(p =>
                p.agent.executeMission({ ...this.buildBaseContext(p.agent.id), team: [...teamIds] })
            ));

            const initialChoices = missionResponses.map(r => r.action.playedMissionResult);
            const reasonings = onMission.map((p, idx) => ({
                name: p.agent.name,
                reasoning: missionResponses[idx].reasoning || 'No reasoning provided',
                situation_assessment: missionResponses[idx].situation_assessment,
                action_strategy: missionResponses[idx].action_strategy,
                promptText: missionResponses[idx].promptText,
                retryLogs: missionResponses[idx].retryLogs
            })).filter(r => r.reasoning !== 'No reasoning provided');

            // -- Excalibur Phase --
            let finalResults = [...initialChoices];
            if (state.options?.excalibur && state.excaliburHolder) {
                finalResults = await this.handleExcaliburCardFlip(state.excaliburHolder, onMission, initialChoices);
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
                succeeded,
                failsCount: fails
            };

            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex] as any;
                if (ev) {
                    ev.teamMembers = onMission.map(p => ({
                        name: p.agent.name,
                        role: this.i18n.translate('roles.' + p.role),
                        team: ROLE_META[p.role].team
                    }));
                    ev.failsCount = fails;
                    ev.succeeded = succeeded;
                    ev.reasonings = reasonings;
                    ev.status = 'success';
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

    private async handleExcaliburCardFlip(excaliburHolderId: string, onMission: PlayerState[], results: boolean[]): Promise<boolean[]> {
        const state = this._state();
        const holder = state.players.find(p => p.agent.id === excaliburHolderId);
        if (!holder) return results;

        this.log(`[Excalibur] Waiting for ${holder.agent.name} to decide...`);

        try {
            const targetId = await holder.agent.useExcalibur({
                ...this.buildBaseContext(holder.agent.id),
                holderId: holder.agent.id,
                missionCardHolderIds: onMission.map(p => p.agent.id),
            });

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
                        icon: '⚔️'
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

    private async handleAssassinationDiscussion() {
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
        await this.handleDiscussion('ASSASSINATION_DISCUSSION');
    }

    private async handleAssassination() {
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

            const result = await assassinPlayer.agent.assassinate({
                ...this.buildBaseContext(assassinPlayer.agent.id),
                goodPlayerIds,
                allEvents: state.events || []
            }, (chunk, field) => {
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'ASSASSINATION') {
                        ev.isThinking = false;
                        if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                        else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;
                        else if (field === 'situation_assessment') ev.situation_assessment = (ev.situation_assessment || '') + chunk;
                        else if (field === 'action_strategy') ev.action_strategy = (ev.action_strategy || '') + chunk;
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
                    ev.situation_assessment = result.situation_assessment;
                    ev.action_strategy = result.action_strategy;
                    ev.promptText = result.promptText;
                    ev.retryLogs = result.retryLogs;
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

    private async handleGameDebrief() {
        this.log('Game Debrief phase: Players share their reflections...');
        const state = this._state();

        for (const player of state.players) {
            if (this._state().isPaused) return;

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
                }, (chunk, field) => {
                    this._state.update(s => {
                        const newEvents = [...s.events];
                        const ev = newEvents[eventIndex];
                        if (ev && ev.type === 'GAME_DEBRIEF') {
                            ev.isThinking = false;
                            if (field === 'reflection') {
                                ev.message += chunk;
                            }
                            else if (field === 'reasoning') ev.reasoning = (ev.reasoning || '') + chunk;
                            else if (field === 'self_check') ev.self_check = (ev.self_check || '') + chunk;
                            else if (field === 'situation_assessment') {
                                ev.situation_assessment = (ev.situation_assessment || '') + chunk;
                                if ((player.agent as any).updateStreamingAssessment) (player.agent as any).updateStreamingAssessment(chunk);
                            }
                            else if (field === 'action_strategy') {
                                ev.action_strategy = (ev.action_strategy || '') + chunk;
                                if ((player.agent as any).updateStreamingStrategy) (player.agent as any).updateStreamingStrategy(chunk);
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
                            ev.situation_assessment = result.situation_assessment;
                            ev.action_strategy = result.action_strategy;
                        }
                        ev.promptText = result.promptText;
                        ev.retryLogs = result.retryLogs;
                        ev.status = 'success';
                    }
                    return { ...s, events: newEvents, isThinking: false };
                });

                this.log(`[GameDebrief] ${player.agent.name}: ${result.reflection}`);
            } catch (e) {
                this.handleAgentError(e, eventIndex);
                if (this._state().isPaused) return;
            }
        }
    }

    private async updateAgentNotes() {
        const state = this._state();
        this.log('Agents are updating their notes...');

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

        try {
            await Promise.all(state.players.map(async p => {
                await p.agent.updateNote({
                    ...this.buildBaseContext(p.agent.id),
                    playerCount: state.players.length,
                    recentEvents,
                    personalNote: ''
                });
            }));
        } catch (e) {
            // This is a non-critical failure, so we just log it and don't pause.
            const error = e as Error;
            console.error('[GameEngine] Non-fatal error during agent note update:', error);
            const displayMessage = (e instanceof AgentFatalError)
                ? `Agent Note-Update Error: ${e.agentName}. ${e.lastErrorMessage}`
                : error.message;
            // Optionally add a non-pausing error to the state
            this._state.update(s => ({ ...s, error: displayMessage }));
        }
    }

    private async handleLadyOfTheLake() {
        const state = this._state();
        const holderId = state.ladyHolder;
        if (!holderId || !state.options?.lady) return;

        const holder = state.players.find(p => p.agent.id === holderId);
        if (!holder) return;

        this.log(`[Lady of the Lake] Waiting for ${holder.agent.name} to use the card...`);

        try {
            const targetId = await holder.agent.useLadyOfTheLake({
                ...this.buildBaseContext(holder.agent.id),
                holderId: holder.agent.id,
                ladyHistory: state.ladyHistory || []
            });

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
                        icon: '🧚‍♀️'
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
        }
    }

    // --- Helpers ---

    private changePhase(phase: GamePhase, patch: Partial<GameState> = {}) {
        const state = this._state();
        console.log(`[GameEngine] changePhase: ${state.phase} -> ${phase}`, patch);

        // Reset discussion state if entering a discussion-based phase
        if ([GamePhase.Discussion, GamePhase.MissionDebrief, GamePhase.AssassinationDiscussion, GamePhase.GameDebrief].includes(phase) && !patch.discussion) {
            patch.discussion = {
                roundNumber: 1,
                maxRounds: 10,
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
        this.changePhase(GamePhase.GameOver, { winner });
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
            isPaused: false,
            isThinking: false,
        });
        this.history.set([]);
    }

    resumeGame() {
        if (!this._state().isPaused) return;
        this._state.update(s => ({ ...s, error: null, isPaused: false }));
        this.log('Resuming game...');
        setTimeout(() => this.runGameLoop(), 0);
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
        setTimeout(() => this.runGameLoop(), 0);
    }

    addEvent(event: GameEvent) {
        console.log('[GameEvent]', event.type, event);
        const state = this._state();
        const currentFailedVotes = state.consecutiveFailedVotes;

        if (event.type === 'PHASE_CHANGE' || event.type === 'DISCUSSION' ||
            event.type === 'TEAM_PROPOSAL' || event.type === 'VOTE_RESULTS' || event.type === 'SYSTEM') {
            if (event.round === undefined) event.round = state.currentRound;
            if (event.failedVotes === undefined && 'failedVotes' in event) (event as any).failedVotes = currentFailedVotes;
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
}
