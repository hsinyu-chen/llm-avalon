import { Injectable, signal, computed, inject } from '@angular/core';
import { GameState, PlayerState, MissionRecord, GameOptions } from '../models/game-state';
import { GamePhase, GameEvent } from '../models/game-event';
import { Role, Team, ROLE_META } from '../models/role';
import { IAgent, SpeechEntry, BaseGameContext } from '../models/agent.interface';
import { GAME_CONFIGS } from '../models/game-config';
import { I18nService } from '../i18n/i18n.service';

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
        events: []
    });

    // Public read-only signals
    readonly state = this._state.asReadonly();
    readonly players = computed(() => this._state().players);
    readonly phase = computed(() => this._state().phase);
    readonly currentRound = computed(() => this._state().currentRound);

    // Log of events (mostly for God-view and history)
    readonly history = signal<string[]>([]);
    private i18n = inject(I18nService);

    // constructor() { } // Removed empty constructor to satisfy lint rules

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
            events: []
        });

        this.addEvent({ type: 'ROUND_START', round: 1 });
        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.Night, round: 1 });

        this.log(this.i18n.translate('engine.gameStarted'));

        this.isGameRunning = true;
        // Start the game loop in the background to avoid blocking the UI transition
        setTimeout(() => this.runGameLoop(), 0);
    }

    private async runGameLoop() {
        while (this.isGameRunning && this._state().phase !== GamePhase.GameOver) {
            const state = this._state();

            try {
                this._state.update(s => ({ ...s, error: null })); // clear any pending error at start of loop iteration

                switch (state.phase) {
                    case GamePhase.Night:
                        await this.handleNightPhase();
                        break;
                    case GamePhase.Opening:
                        await this.handleOpeningPhase();
                        break;
                    case GamePhase.TeamProposal:
                        await this.handleTeamProposal();
                        break;
                    case GamePhase.Discussion:
                        await this.handleDiscussion('DISCUSSION');
                        break;
                    case GamePhase.Vote:
                        await this.handleVote();
                        break;
                    case GamePhase.Mission:
                        await this.handleMission();
                        break;
                    case GamePhase.MissionDebrief: {
                        // Add last mission's outcome to events for debrief context
                        const debriefState = this._state();
                        if (debriefState.missions.length > 0) {
                            const lastMission = debriefState.missions[debriefState.missions.length - 1];
                            // The mission outcome event is added with currentRound so agents can see it
                            // (Agents filter by roundEvents where e.round === state.currentRound)
                            this.addEvent({
                                type: 'MISSION_OUTCOME',
                                round: debriefState.currentRound,
                                teamNames: lastMission.teamIds.map(id => debriefState.players.find(p => p.agent.id === id)?.agent.name || id),
                                teamMembers: lastMission.teamIds.map(id => {
                                    const p = debriefState.players.find(pl => pl.agent.id === id);
                                    return {
                                        name: p?.agent.name || id,
                                        role: p ? this.i18n.translate('roles.' + p.role) : '',
                                        team: p ? ROLE_META[p.role].team : Team.Good
                                    };
                                }),
                                failsCount: lastMission.failsCount,
                                succeeded: lastMission.succeeded
                            });
                        }
                        await this.handleDiscussion('MISSION_DEBRIEF');
                        break;
                    }
                    case GamePhase.AssassinationDiscussion:
                        await this.handleAssassinationDiscussion();
                        break;
                    case GamePhase.Assassination:
                        await this.handleAssassination();
                        break;
                    case GamePhase.GameDebrief:
                        await this.handleGameDebrief();
                        break;
                    default:
                        console.warn('Unhandled game phase:', state.phase);
                        return;
                }
            } catch (e) {
                const error = e as Error;
                console.error('[GameEngine] Error in game loop:', error);

                // Store error string in state and break out of the while loop
                // but keep isGameRunning = true so we can resume from the current phase
                this._state.update(s => ({
                    ...s,
                    error: error?.message || String(error)
                }));
                break;
            }
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
            const info = this.getNightPhaseInfoForRole(p.role, p.agent.id, players);
            return p.agent.onNightPhase({
                myRole: p.role,
                visiblePlayers: info,
                playerCount: players.length,
                rolesInGame: state.rolesInGame,
                options: gameOptions,
                missionSizes: config.missionSizes,
                twoFailsRequiredInRound4: config.twoFailsRequiredInRound4
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

        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.Opening, round: 1 });
        this.updateState({ phase: GamePhase.Opening });
    }

    private async handleOpeningPhase() {
        this.log('Phase OPENING: Starting self-introductions...');
        const state = this._state();
        const playerCount = state.players.length;

        for (let i = 0; i < playerCount; i++) {
            const player = state.players[i];

            const initialTimestamp = Date.now();
            const eventIndex = this._state().events.length;
            this.addEvent({
                type: 'DISCUSSION',
                round: state.currentRound,
                playerId: player.agent.id,
                playerName: player.agent.name,
                message: '',
                timestamp: initialTimestamp,
                isThinking: true
            });

            const result = await player.agent.speak({
                ...this.buildBaseContext(),
                phase: 'OPENING',
                chatLog: [...this.currentRoundChatLog],
                visibleAgentIds: state.players.map(p => p.agent.id),
                proposedTeam: [],
                leaderId: state.players[state.currentLeaderIndex].agent.id,
                discussionRound: 1
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
                timestamp: initialTimestamp
            };
            this.currentRoundChatLog.push(entry);

            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex];
                if (ev && ev.type === 'DISCUSSION') {
                    ev.isThinking = false;
                    ev.message = message;
                    ev.self_check = result.self_check;
                    ev.reasoning = result.reasoning;
                    ev.promptText = result.promptText;
                }
                return { ...s, events: newEvents };
            });

            this.log(`[Opening] ${player.agent.name}: ${message}`);
        }

        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.TeamProposal, round: state.currentRound });
        this.updateState({ phase: GamePhase.TeamProposal });
    }

    private async handleTeamProposal() {
        const state = this._state();
        const leader = state.players[state.currentLeaderIndex];
        const config = GAME_CONFIGS[state.players.length];
        const teamSize = config.missionSizes[state.currentRound - 1];
        const allPlayerIds = state.players.map(p => p.agent.id);

        this.log(`Round ${state.currentRound}: Leader ${leader.agent.name} is proposing a team of ${teamSize}...`);

        // --- Step 1: Leader proposes team ---
        const eventIndex = this._state().events.length;
        this.addEvent({
            type: 'TEAM_PROPOSAL',
            round: state.currentRound,
            leaderId: leader.agent.id,
            leaderName: leader.agent.name,
            teamIds: [],
            teamNames: [],
            isThinking: true
        });

        const result = await leader.agent.proposeTeam({
            ...this.buildBaseContext(),
            round: state.currentRound,
            teamSize,
            playerIds: allPlayerIds,
            playerNames: Object.fromEntries(state.players.map(p => [p.agent.id, p.agent.name]))
        });

        let teamIds = result.action.teamMemberIds;

        // --- Validate team ---
        teamIds = this.validateTeam(teamIds, allPlayerIds, teamSize, leader.agent.id);

        this._state.update(s => {
            const newEvents = [...s.events];
            const ev = newEvents[eventIndex];
            if (ev && ev.type === 'TEAM_PROPOSAL') {
                ev.isThinking = false;
                ev.teamIds = teamIds;
                ev.teamNames = state.players.filter(p => teamIds.includes(p.agent.id)).map(p => p.agent.name);
                ev.reasoning = result.reasoning;
                ev.promptText = result.promptText;
            }
            return { ...s, events: newEvents };
        });
        this.log(`Team proposed: ${teamIds.join(', ')}.`);

        // --- Step 2: Excalibur Assignment (AFTER team proposal, restricted to team members) ---
        if (state.options?.excalibur) {
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
                    round: state.currentRound,
                    message: this.i18n.translate('engine.excaliburGiven', { leader: leader.agent.name, target: recipientName }),
                    icon: '🗡️'
                });
            }
        }

        // --- Step 3: Enter discussion ---
        this.updateState({
            proposedTeamIds: teamIds,
            phase: GamePhase.Discussion,
            discussion: {
                roundNumber: 1,
                maxRounds: 10,
                passedAgentIds: new Set<string>()
            }
        });

        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.Discussion, round: state.currentRound });
        this.log(`Discussion starts.`);
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

    private async handleDiscussion(phase: 'DISCUSSION' | 'MISSION_DEBRIEF') {
        this.log(`Phase ${phase}: Starting discussion...`);

        const state = this._state();
        const passedAgentIds = new Set<string>();
        let roundNumber = 1;
        const maxRounds = 10;
        const lastPersonSpeechCount = new Map<string, number>();

        while (passedAgentIds.size < state.players.length && roundNumber <= maxRounds) {
            this.log(`Discussion Round ${roundNumber}...`);

            // Update state for UI to show discussion round
            this.updateState({
                discussion: {
                    roundNumber,
                    maxRounds,
                    passedAgentIds: new Set(passedAgentIds)
                }
            });

            // Sequential round-robin speak starting from the leader
            const startIndex = state.currentLeaderIndex;
            const playerCount = state.players.length;

            for (let i = 0; i < playerCount; i++) {
                const player = state.players[(startIndex + i) % playerCount];
                if (passedAgentIds.has(player.agent.id)) continue;

                // Last person standing rule: if only one person is left, they can only speak twice.
                const activeAgentIds = state.players.filter(p => !passedAgentIds.has(p.agent.id));
                if (activeAgentIds.length === 1) {
                    const count = (lastPersonSpeechCount.get(player.agent.id) || 0) + 1;
                    lastPersonSpeechCount.set(player.agent.id, count);
                    if (count > 2) {
                        this.log(this.i18n.translate('engine.forcedPass', { name: player.agent.name }));
                        passedAgentIds.add(player.agent.id);
                        this.addEvent({
                            type: 'SYSTEM',
                            round: state.currentRound,
                            message: this.i18n.translate('engine.forcedPass', { name: player.agent.name }),
                            icon: '🚫'
                        });
                        continue;
                    }
                }

                // Create initial empty event for streaming
                const initialTimestamp = Date.now();
                const eventIndex = this._state().events.length;
                this.addEvent({
                    type: 'DISCUSSION',
                    round: state.currentRound,
                    playerId: player.agent.id,
                    playerName: player.agent.name,
                    message: '',
                    timestamp: initialTimestamp,
                    isThinking: true
                });

                const result = await player.agent.speak({
                    ...this.buildBaseContext(),
                    phase,
                    chatLog: [...this.currentRoundChatLog],
                    visibleAgentIds: state.players.map(p => p.agent.id),
                    proposedTeam: state.proposedTeamIds,
                    leaderId: state.players[state.currentLeaderIndex].agent.id,
                    discussionRound: roundNumber
                }, (chunk, field) => {
                    // Update the event message in real-time
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
                const readyToVote = result.action.readyToVote;

                // Pure PASS (no message): keep the empty streaming event to show internal thoughts
                if (readyToVote && !message) {
                    this._state.update(s => {
                        const newEvents = [...s.events];
                        const ev = newEvents[eventIndex];
                        if (ev && ev.type === 'DISCUSSION') {
                            ev.isThinking = false;
                            ev.message = '';
                            ev.self_check = result.self_check;
                            ev.reasoning = result.reasoning;
                            ev.promptText = result.promptText;
                        }
                        return { ...s, events: newEvents };
                    });
                    passedAgentIds.add(player.agent.id);
                    this.log(this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }));
                    this.addEvent({
                        type: 'SYSTEM',
                        round: state.currentRound,
                        message: this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }),
                        icon: '⏭️'
                    });
                    continue;
                }

                // Finalize entry in currentRoundChatLog
                const entry: SpeechEntry = {
                    playerId: player.agent.id,
                    name: player.agent.name,
                    message,
                    timestamp: initialTimestamp
                };

                this.currentRoundChatLog.push(entry);
                // Ensure the final message is exactly what the agent returned (in case streaming missed something or was buggy)
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'DISCUSSION') {
                        ev.isThinking = false;
                        ev.message = message;
                        ev.self_check = result.self_check;
                        ev.reasoning = result.reasoning;
                        ev.promptText = result.promptText;
                    }
                    return { ...s, events: newEvents };
                });

                this.log(`[Discussion] ${player.agent.name}: ${message}`);

                // Speak+PASS: record the speech above, then mark as passed
                if (readyToVote) {
                    passedAgentIds.add(player.agent.id);
                    this.log(this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }));
                    this.addEvent({
                        type: 'SYSTEM',
                        round: state.currentRound,
                        message: this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }),
                        icon: '⏭️'
                    });
                }
            }

            roundNumber++;
        }

        this.log(`Discussion concluded after ${roundNumber - 1} rounds.`);

        const nextPhase = phase === 'DISCUSSION' ? GamePhase.Vote : GamePhase.TeamProposal;
        this.updateState({
            phase: nextPhase,
            discussion: null
        });

        this.addEvent({ type: 'PHASE_CHANGE', phase: nextPhase, round: state.currentRound });
    }

    // Store chat log between discussion and vote phases
    private currentRoundChatLog: SpeechEntry[] = [];

    private async handleVote() {
        const state = this._state();
        const players = state.players;
        const proposedIds = state.proposedTeamIds;
        this.log(`Voting on team: ${proposedIds.join(', ')}`);

        const baseCtx = this.buildBaseContext();

        // Concurrent voting
        const votesResult = await Promise.all(players.map(p =>
            p.agent.vote({
                ...baseCtx,
                proposedTeam: [...proposedIds],
                leaderId: players[state.currentLeaderIndex].agent.id,
                excaliburHolderId: state.excaliburHolder || null,
                chatLog: this.currentRoundChatLog
            }).then(voteResult => ({
                id: p.agent.id,
                approve: voteResult.action.voteChoice,
                reasoning: voteResult.reasoning,
                promptText: voteResult.promptText
            }))
        ));

        const votesMap: Record<string, boolean> = {};
        let approvals = 0;
        votesResult.forEach(v => {
            votesMap[v.id] = v.approve;
            if (v.approve) approvals++;
        });

        const majority = approvals > players.length / 2;

        this.addEvent({
            type: 'VOTE_RESULTS',
            round: state.currentRound,
            votes: votesResult.map(v => ({
                name: state.players.find(p => p.agent.id === v.id)!.agent.name,
                approve: v.approve,
                reasoning: v.reasoning,
                promptText: (votesResult as { id: string, promptText?: string }[]).find(ur => ur.id === v.id)?.promptText // Need to pass promptText from map
            })),
            passed: majority,
            failCount: state.consecutiveFailedVotes + (majority ? 0 : 1)
        });

        if (majority) {
            this.log(`Vote PASSED (${approvals}/${players.length}). Proceeding to mission.`);
            this.updateState({
                consecutiveFailedVotes: 0,
                phase: GamePhase.Mission
            });
            this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.Mission, round: state.currentRound });
        } else {
            const newFailedCount = state.consecutiveFailedVotes + 1;
            this.log(`Vote REJECTED (${approvals}/${players.length}). Failure count: ${newFailedCount}/5`);

            if (newFailedCount >= 5) {
                this.log('5 consecutive failed votes! Evil wins.');
                this.endGame(Team.Evil);
            } else {
                this.rotateLeader();
                this.updateState({
                    consecutiveFailedVotes: newFailedCount,
                    phase: GamePhase.TeamProposal
                });
                this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.TeamProposal, round: state.currentRound });
            }
        }
    }

    private async handleMission() {
        const state = this._state();
        const teamIds = state.proposedTeamIds;
        const onMission = state.players.filter(p => teamIds.includes(p.agent.id));

        this.log(`Mission in progress with team: ${teamIds.join(', ')}`);

        // Concurrent mission execution
        const baseCtx = this.buildBaseContext();
        const missionResponses = await Promise.all(onMission.map(p =>
            p.agent.executeMission({
                ...baseCtx,
                team: [...teamIds]
            })
        ));

        const results = missionResponses.map(r => r.action.playedMissionResult);
        const reasonings = onMission.map((p, idx) => ({
            name: p.agent.name,
            reasoning: missionResponses[idx].reasoning || 'No reasoning provided',
            promptText: missionResponses[idx].promptText
        })).filter(r => r.reasoning !== 'No reasoning provided');

        // -- Excalibur Phase --
        const finalResults = [...results];
        const excaliburHolderId = state.excaliburHolder;
        if (state.options?.excalibur && excaliburHolderId) {
            const holder = state.players.find(p => p.agent.id === excaliburHolderId);
            if (holder) {
                // Determine who played cards (for prompt context)
                // Note: The prompt only knows IDs, but results are anonymized.
                // However, Excalibur holder chooses a TARGET Player ID.
                // We need to know which Result belongs to which Player ID before shuffling?
                // `results` array indices correspond to `onMission` array indices.
                // So `onMission[i]` played `results[i]`.

                this.log(`[Excalibur] Waiting for ${holder.agent.name} to decide...`);

                const targetId = await holder.agent.useExcalibur({
                    ...baseCtx,
                    holderId: excaliburHolderId,
                    missionCardHolderIds: onMission.map(p => p.agent.id),
                });

                if (targetId && onMission.some(p => p.agent.id === targetId)) {
                    // Perform switch
                    const targetIndex = onMission.findIndex(p => p.agent.id === targetId);
                    if (targetIndex !== -1) {
                        const originalResult = results[targetIndex];
                        const newResult = !originalResult; // Flip result
                        finalResults[targetIndex] = newResult;

                        const resultType = originalResult ? 'Success' : 'Fail';
                        const newType = newResult ? 'Success' : 'Fail';

                        this.log(this.i18n.translate('engine.excaliburSwitched', { holder: holder.agent.name, target: targetId }));
                        await holder.agent.onSystemMessage(`You switched ${targetId}'s card. Original was: ${resultType}. Now: ${newType}.`);

                        this.addEvent({
                            type: 'SYSTEM',
                            round: state.currentRound,
                            message: this.i18n.translate('engine.excaliburSwitched', { holder: holder.agent.name, target: targetId }),
                            icon: '⚔️'
                        });
                    }
                } else {
                    this.log(`[Excalibur] ${holder.agent.name} decided not to use Excalibur.`);
                }
            }
        }

        // Shuffle results to anonymize (using finalResults)
        const shuffledResults = [...finalResults].sort(() => Math.random() - 0.5);
        const fails = finalResults.filter(r => r === false).length;

        const config = GAME_CONFIGS[state.players.length];
        const twoFailsNeeded = state.currentRound === 4 && config.twoFailsRequiredInRound4;
        const succeeded = twoFailsNeeded ? fails < 2 : fails === 0;

        const record: MissionRecord = {
            round: state.currentRound,
            leaderId: state.players[state.currentLeaderIndex].agent.id,
            teamIds: [...teamIds],
            votes: {}, // Votes are handled in handleVote but often useful here
            results: shuffledResults,
            succeeded,
            failsCount: fails
        };

        this.addEvent({
            type: 'MISSION_OUTCOME',
            round: state.currentRound,
            teamNames: onMission.map(p => p.agent.name),
            teamMembers: onMission.map(p => ({
                name: p.agent.name,
                role: this.i18n.translate('roles.' + p.role),
                team: ROLE_META[p.role].team
            })),
            failsCount: fails,
            succeeded,
            reasonings
        });

        this.log(`Mission result: ${succeeded ? 'SUCCESS' : 'FAIL'} (${fails} fail cards)`);

        const newMissions = [...state.missions, record];
        this.updateState({ missions: newMissions });

        // Check for immediate game over
        const successCount = newMissions.filter(m => m.succeeded).length;
        const failCount = newMissions.filter(m => !m.succeeded).length;

        if (failCount >= 3) {
            this.log('3 missions failed. Evil wins!');
            this.endGame(Team.Evil);
        } else if (successCount >= 3) {
            this.log('3 missions succeeded. Good wins (Pre-Assassination Discussion)!');
            // -- Memory Consolidation (Final Good Win Notes) --
            await this.updateAgentNotes();
            this.updateState({ phase: GamePhase.AssassinationDiscussion });
        } else {
            this.rotateLeader();

            // -- Lady of the Lake Phase --
            await this.handleLadyOfTheLake();

            // -- Memory Consolidation (Update Notes) --
            // We do this BEFORE incrementing currentRound so buildBaseContext has full round data
            await this.updateAgentNotes();

            // Clear chat log after notes are updated (end of round boundary)
            this.currentRoundChatLog = [];

            this.updateState({
                currentRound: state.currentRound + 1,
                phase: GamePhase.MissionDebrief,
                proposedTeamIds: [] // Clear proposed team for Mission Debrief phase
            });
            this.addEvent({ type: 'ROUND_START', round: state.currentRound + 1 });
            this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.MissionDebrief, round: state.currentRound + 1 });
        }
    }

    private async handleAssassinationDiscussion() {
        const state = this._state();

        // Add phase change event for UI
        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.AssassinationDiscussion, round: state.currentRound });

        // Find the Assassin
        const assassinPlayer = state.players.find(p => p.role === Role.Assassin);
        if (!assassinPlayer) {
            this.log('Error: No Assassin found! Skipping to assassination.');
            this.updateState({ phase: GamePhase.Assassination });
            return;
        }

        // Publicly reveal the Assassin's identity
        const revealMsg = this.i18n.translate('engine.assassinRevealed', { name: assassinPlayer.agent.name });
        this.log(revealMsg);
        this.addEvent({ type: 'SYSTEM', message: revealMsg, icon: '🗡️', round: state.currentRound });

        // Run discussion — use a dedicated chat log for this phase
        const assassinDiscussionChatLog: SpeechEntry[] = [];
        const passedAgentIds = new Set<string>();
        let roundNumber = 1;
        const maxRounds = 2; // Shorter than normal discussion
        const lastPersonSpeechCount = new Map<string, number>();

        while (passedAgentIds.size < state.players.length && roundNumber <= maxRounds) {
            this.log(`Assassination Discussion Round ${roundNumber}...`);

            this.updateState({
                discussion: {
                    roundNumber,
                    maxRounds,
                    passedAgentIds: new Set(passedAgentIds)
                }
            });

            const playerCount = state.players.length;

            for (let i = 0; i < playerCount; i++) {
                const player = state.players[i];
                if (passedAgentIds.has(player.agent.id)) continue;

                // Last person standing rule
                const activeAgentIds = state.players.filter(p => !passedAgentIds.has(p.agent.id));
                if (activeAgentIds.length === 1) {
                    const count = (lastPersonSpeechCount.get(player.agent.id) || 0) + 1;
                    lastPersonSpeechCount.set(player.agent.id, count);
                    if (count > 2) {
                        this.log(this.i18n.translate('engine.forcedPass', { name: player.agent.name }));
                        passedAgentIds.add(player.agent.id);
                        this.addEvent({
                            type: 'SYSTEM',
                            round: state.currentRound,
                            message: this.i18n.translate('engine.forcedPass', { name: player.agent.name }),
                            icon: '🚫'
                        });
                        continue;
                    }
                }

                const initialTimestamp = Date.now();
                const eventIndex = this._state().events.length;
                this.addEvent({
                    type: 'DISCUSSION',
                    round: state.currentRound,
                    playerId: player.agent.id,
                    playerName: player.agent.name,
                    message: '',
                    timestamp: initialTimestamp,
                    isThinking: true
                });

                const result = await player.agent.speak({
                    ...this.buildBaseContext(),
                    phase: 'ASSASSINATION_DISCUSSION',
                    chatLog: [...assassinDiscussionChatLog],
                    visibleAgentIds: state.players.map(p => p.agent.id),
                    proposedTeam: [],
                    leaderId: state.players[state.currentLeaderIndex].agent.id,
                    discussionRound: roundNumber,
                    assassinId: assassinPlayer.agent.id
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
                const readyToVote = result.action.readyToVote;

                // Pure PASS (no message): keep the empty streaming event to show internal thoughts
                if (readyToVote && !message) {
                    this._state.update(s => {
                        const newEvents = [...s.events];
                        const ev = newEvents[eventIndex];
                        if (ev && ev.type === 'DISCUSSION') {
                            ev.isThinking = false;
                            ev.message = '';
                            ev.self_check = result.self_check;
                            ev.reasoning = result.reasoning;
                            ev.promptText = result.promptText;
                        }
                        return { ...s, events: newEvents };
                    });
                    passedAgentIds.add(player.agent.id);
                    this.log(this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }));
                    this.addEvent({
                        type: 'SYSTEM',
                        round: state.currentRound,
                        message: this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }),
                        icon: '⏭️'
                    });
                    continue;
                }

                const entry: SpeechEntry = {
                    playerId: player.agent.id,
                    name: player.agent.name,
                    message,
                    timestamp: initialTimestamp
                };
                assassinDiscussionChatLog.push(entry);
                // Ensure the final message is exactly what the agent returned
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'DISCUSSION') {
                        ev.isThinking = false;
                        ev.message = message;
                        ev.self_check = result.self_check;
                        ev.reasoning = result.reasoning;
                        ev.promptText = result.promptText;
                    }
                    return { ...s, events: newEvents };
                });

                this.log(`[AssassinDiscussion] ${player.agent.name}: ${message}`);

                // Speak+PASS: record the speech above, then mark as passed
                if (readyToVote) {
                    passedAgentIds.add(player.agent.id);
                    this.log(this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }));
                    this.addEvent({
                        type: 'SYSTEM',
                        round: state.currentRound,
                        message: this.i18n.translate('engine.skippedSpeak', { name: player.agent.name }),
                        icon: '⏭️'
                    });
                }
            }

            roundNumber++;
        }

        this.log(`Assassination Discussion concluded after ${roundNumber - 1} rounds. Proceeding to assassination.`);

        // Transition to actual assassination
        this.updateState({
            phase: GamePhase.Assassination,
            discussion: null
        });
    }

    private async handleAssassination() {
        const state = this._state();

        // Add phase change event for UI
        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.Assassination, round: state.currentRound });

        const assassinPlayer = state.players.find(p => p.role === Role.Assassin);

        if (!assassinPlayer) {
            this.log('Error: No Assassin found in game! Good wins by default.');
            this.updateState({ assassinTargetId: null, isMerlinKilled: false });
            this.endGame(Team.Good);
            return;
        }

        const goodPlayerIds = state.players
            .filter(p => p.team === Team.Good)
            .map(p => p.agent.id);

        this.log('Assassin is picking a target...');
        const result = await assassinPlayer.agent.assassinate({
            ...this.buildBaseContext(),
            goodPlayerIds,
            // Filter out all DISCUSSION events — Assassin must rely on their NOTE for historical chat analysis
            allEvents: (state.events || []).filter(e => e.type !== 'DISCUSSION')
        });

        const targetId = result.action.targetId;

        const targetPlayer = state.players.find(p => p.agent.id === targetId);
        this.log(`Assassin picked: ${targetPlayer?.agent.name || targetId}`);

        // Add assassination event for UI
        this.addEvent({
            type: 'SYSTEM',
            message: this.i18n.translate('engine.assassinTarget', { assassin: assassinPlayer.agent.name, target: targetPlayer?.agent.name || targetId }),
            icon: '🗡️'
        });

        const isMerlinKilled = targetPlayer?.role === Role.Merlin;
        this.updateState({ assassinTargetId: targetId, isMerlinKilled });

        if (isMerlinKilled) {
            this.log(this.i18n.translate('engine.merlinAssassinated'));
            this.endGame(Team.Evil);
        } else {
            this.log(this.i18n.translate('engine.merlinSurvived'));
            this.endGame(Team.Good);
        }
    }

    private async handleGameDebrief() {
        this.log('Game Debrief phase: Players share their reflections...');

        const state = this._state();

        // Add phase change event for UI
        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.GameDebrief, round: state.currentRound });

        // Get all players to share their thoughts
        for (const player of state.players) {
            const eventIndex = this._state().events.length;
            this.addEvent({
                type: 'GAME_DEBRIEF',
                playerId: player.agent.id,
                playerName: player.agent.name,
                message: '',
                timestamp: Date.now(),
                isThinking: true
            });

            const { reflection, promptText } = await player.agent.shareGameReflection({
                round: state.currentRound,
                winner: state.winner,
                playerCount: state.players.length,
                rolesInGame: state.rolesInGame,
                missions: state.missions,
                assassinTargetId: state.assassinTargetId,
                isMerlinKilled: state.isMerlinKilled,
                playerRoles: state.players.map(p => ({ id: p.agent.id, role: p.role })),
                playerNames: Object.fromEntries(state.players.map(p => [p.agent.id, p.agent.name]))
            }, (chunk, field) => {
                this._state.update(s => {
                    const newEvents = [...s.events];
                    const ev = newEvents[eventIndex];
                    if (ev && ev.type === 'GAME_DEBRIEF') {
                        ev.isThinking = false;
                        if (field === 'reflection') ev.message += chunk;
                    }
                    return { ...s, events: newEvents };
                });
            });

            // Ensure final message
            this._state.update(s => {
                const newEvents = [...s.events];
                const ev = newEvents[eventIndex];
                if (ev && ev.type === 'GAME_DEBRIEF') {
                    ev.isThinking = false;
                    ev.message = reflection;
                    ev.promptText = promptText;
                }
                return { ...s, events: newEvents };
            });

            this.log(`[GameDebrief] ${player.agent.name}: ${reflection}`);
        }

        this.updateState({ phase: GamePhase.GameOver });
        this.addEvent({ type: 'PHASE_CHANGE', phase: GamePhase.GameOver, round: state.currentRound });
    }

    private async handleLadyOfTheLake() {
        const state = this._state();
        // Lady triggers after Mission 2, 3, 4 (so when currentRound is 3, 4, 5)
        if (!state.options?.lady || !state.ladyHolder) return;
        if (state.currentRound < 3 || state.currentRound > 5) return;

        const holder = state.players.find(p => p.agent.id === state.ladyHolder);
        if (!holder) return;

        this.log(`[Lady] Waiting for ${holder.agent.name} to use Lady of the Lake...`);

        const ladyHistory = state.ladyHistory || [];

        const targetId = await holder.agent.useLadyOfTheLake({
            ...this.buildBaseContext(),
            holderId: holder.agent.id,
            ladyHistory: ladyHistory.map(h => ({ ...h, claim: '' })),
        });

        if (targetId && targetId !== holder.agent.id) {
            const target = state.players.find(p => p.agent.id === targetId);
            if (target) {
                const alignment = ROLE_META[target.role].team === Team.Good ? 'Good' : 'Evil';

                this.log(this.i18n.translate('engine.ladyChecked', { holder: holder.agent.name, target: target.agent.name }));
                await holder.agent.onSystemMessage(this.i18n.translate('engine.ladyAlignment', { name: target.agent.name, alignment }));

                // Pass token
                this.updateState({
                    ladyHolder: target.agent.id,
                    ladyHistory: [...ladyHistory, { holderId: holder.agent.id, targetId: target.agent.id }]
                });

                this.log(`[Lady] Token passed to ${target.agent.name}.`);

                await Promise.all(state.players.map(p =>
                    p.agent.onSystemMessage(this.i18n.translate('engine.ladyChecked', { holder: holder.agent.name, target: target.agent.name }))
                ));

                this.addEvent({
                    type: 'SYSTEM',
                    message: this.i18n.translate('engine.ladyChecked', { holder: holder.agent.name, target: target.agent.name }),
                    icon: '🧚‍♀️'
                });
            }
        } else {
            this.log(`[Lady] ${holder.agent.name} skipped usage.`);
        }
    }

    private async updateAgentNotes() {
        const state = this._state();
        this.log('Agents are updating their notes...');

        // Filter events for the current round (simple heuristic)
        // ideally we track "events since last note update", but per-round is fine.
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
                    case 'VOTE_RESULTS': return `[Vote] Passed: ${e.passed}. Votes: ${e.votes.map((v: { name: string; approve: boolean }) => v.name + (v.approve ? '(O)' : '(X)')).join(', ')}`;
                    case 'MISSION_OUTCOME': return `[Mission] The team [${e.teamNames.join(', ')}] returned a result: ${e.succeeded ? 'Success' : 'Fail'} (Fails: ${e.failsCount})`;
                    case 'SYSTEM': {
                        if (e.message.includes('跳過發言') || e.message.includes('skipped')) return '';
                        return `[System] ${e.message}`;
                    }
                    default: return '';
                }
            })
            .filter(s => s !== '');

        await Promise.all(state.players.map(async p => {
            try {
                await p.agent.updateNote({
                    ...this.buildBaseContext(),
                    playerCount: state.players.length,
                    recentEvents,
                    personalNote: '' // We don't track their note in engine, they keep it internal.
                });
                // Optional: Monitor notes in debug console
                // console.log(`[Note] ${p.agent.name}:`, note);
            } catch (e) {
                console.error(`Error updating note for ${p.agent.name}`, e);
            }
        }));
    }

    // --- Helpers ---

    private updateState(patch: Partial<GameState>) {
        this._state.update(s => ({ ...s, ...patch }));
    }

    private rotateLeader() {
        const state = this._state();
        const nextIndex = (state.currentLeaderIndex + 1) % state.players.length;
        this.updateState({ currentLeaderIndex: nextIndex });
    }

    private endGame(winner: Team) {
        this.updateState({
            winner,
            phase: GamePhase.GameDebrief
        });
        this.addEvent({
            type: 'GAME_OVER',
            winner,
            reason: winner === Team.Good ? this.i18n.translate('engine.goodWins') : this.i18n.translate('engine.evilWins')
        });
        this.log(`Game Over! Winner: ${winner === Team.Good ? 'Good' : 'Evil'}`);
    }

    private isGameRunning = false;

    reset() {
        this.isGameRunning = false;
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
            events: []
        });
        this.history.set([]);
        this.isGameRunning = true;
        this.runGameLoop();
    }

    resumeGame() {
        if (!this.isGameRunning) return;
        this._state.update(s => ({ ...s, error: null }));
        this.log('Resuming game from error state...');
        // Start game loop again asynchronously
        setTimeout(() => this.runGameLoop(), 0);
    }

    addEvent(event: GameEvent) {
        this._state.update(s => ({ ...s, events: [...(s.events || []), event] }));
    }

    private log(message: string) {
        this.history.update(h => [`[${new Date().toLocaleTimeString()}] ${message}`, ...h]); // Newest first for log
    }

    /** Build the shared base context injected into every agent method call. */
    private buildBaseContext(): BaseGameContext {
        const state = this._state();
        const playerNames: Record<string, string> = {};
        for (const p of state.players) {
            playerNames[p.agent.id] = p.agent.name;
        }
        return {
            round: state.currentRound,
            missionHistory: state.missions,
            roundEvents: (state.events || []).filter(e => 'round' in e && e.round === state.currentRound),
            playerNames,
            consecutiveFailedVotes: state.consecutiveFailedVotes,
            currentMissionSize: GAME_CONFIGS[state.players.length].missionSizes[state.currentRound - 1],
            allEvents: state.events || [],
            rolesInGame: state.rolesInGame,
            twoFailsRequiredInRound4: GAME_CONFIGS[state.players.length].twoFailsRequiredInRound4 || false,
        };
    }

    private getNightPhaseInfoForRole(role: Role, selfId: string, allPlayers: PlayerState[]) {
        const isEvil = (r: Role) => ROLE_META[r].team === Team.Evil;

        switch (role) {
            case Role.Merlin:
                // Sees all evil except Mordred
                return allPlayers
                    .filter(p => isEvil(p.role) && p.role !== Role.Mordred)
                    .map(p => ({ id: p.agent.id, name: p.agent.name, info: 'EVIL' }));

            case Role.Percival:
                // Sees Merlin and Morgana
                return allPlayers
                    .filter(p => p.role === Role.Merlin || p.role === Role.Morgana)
                    .map(p => ({ id: p.agent.id, name: p.agent.name, info: 'MERLIN_OR_MORGANA' }));

            case Role.Assassin:
            case Role.Mordred:
            case Role.Morgana:
            case Role.MinionOfMordred:
                // Sees all other evil except Oberon (use agent id to exclude self, not role type)
                return allPlayers
                    .filter(p => isEvil(p.role) && p.role !== Role.Oberon && p.agent.id !== selfId)
                    .map(p => ({ id: p.agent.id, name: p.agent.name, info: 'EVIL_ALLY' }));

            case Role.Oberon:
            case Role.LoyalServant:
            default:
                // Sees nothing
                return [];
        }
    }
}
