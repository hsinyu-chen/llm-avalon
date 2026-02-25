import { IAgent, NightPhaseInfo, TeamProposalContext, VoteContext, MissionContext, AssassinContext, SpeakContext, SpeechAct, ExcaliburContext, LadyContext, NoteContext, GameReflectionContext, BaseGameContext, TokenUsage, ProposeTeamAction, VoteAction, MissionAction, AssassinateAction } from '../models/agent.interface';
import { LLMManagerService } from '../services/llm/llm-manager.service';
import { Role, ROLE_META, Team } from '../models/role';
import { LLMContent, LLMGenerateConfig, LLMProvider, LLMUsageMetadata } from '../services/llm/llm-provider';
import { GameEvent } from '../models/game-event';
import { signal } from '@angular/core';
import { getGameOverViewPrompt } from './prompts/getGameOverViewPrompt';
import { getGameRulePrompt } from './prompts/getGameRulePrompt';
import { getCriticalBehavioralRulesPrompt } from './prompts/getCriticalBehavioralRulesPrompt';
import { getLadyRulePrompt } from './prompts/getLadyRulePrompt';
import { getExcaliburRulePrompt } from './prompts/getExcaliburRulePrompt';
import { getFactionStrategiesPrompt } from './prompts/getFactionStrategiesPrompt';
import { getProposeTeamPrompt } from './prompts/getProposeTeamPrompt';
import { getVotePrompt } from './prompts/getVotePrompt';
import { getExecuteMissionPrompt } from './prompts/getExecuteMissionPrompt';
import { getAssassinatePrompt } from './prompts/getAssassinatePrompt';
import { getSpeakPrompt } from './prompts/getSpeakPrompt';
import { getUseExcaliburPrompt } from './prompts/getUseExcaliburPrompt';
import { getUseLadyOfTheLakePrompt } from './prompts/getUseLadyOfTheLakePrompt';
import { getShareGameReflectionPrompt } from './prompts/getShareGameReflectionPrompt';
import { getUpdateNotePrompt } from './prompts/getUpdateNotePrompt';
import { getCharacterAbilitiesPrompt } from './prompts/getCharacterAbilitiesPrompt';
import { getRoleSpecificStrategiesPrompt } from './prompts/getRoleSpecificStrategiesPrompt';
import { getPhaseSpecificRoleHintsPrompt } from './prompts/getPhaseSpecificRoleHintsPrompt';
import { getDiscussionTacticsPrompt } from './prompts/getDiscussionTacticsPrompt';
import { getCommunicationChannelsPrompt } from './prompts/getCommunicationChannelsPrompt';
import { getOutputFormatPrompt } from './prompts/getOutputFormatPrompt';
import { I18nService } from '../i18n/i18n.service';

const MAX_RETRIES = 2;
const MAX_API_RETRIES = 3;
const BASE_DELAY_MS = 2000;

const streamQueues: Record<string, Promise<void>> = {};

/**
 * LLMAgent - An AI agent powered by a Large Language Model.
 *
 * Key helpers:
 *   buildPrompt(ctx, ...sections) — assembles identity + base context + note + body sections
 *   queryLLMWithValidation()      — append-only multi-turn retry loop
 *   buildSystemInstruction()      — comprehensive game rules + strategy guide (built per-game)
 */
export class LLMAgent implements IAgent {
    public myRole: Role | null = null;
    public roleInfo = '';
    public visiblePlayers: NightPhaseInfo['visiblePlayers'] = [];
    public history: string[] = [];
    public note = '';
    public noteHistory: { round: number; note: string }[] = [];
    public systemInstruction = '';
    private _modelName = 'LLM';
    private _isThinking = signal(false);
    private tokenUsage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        totalCost: 0
    };

    /** Expose note for UI tooltip */
    getPersonalNote(): string { return this.note; }
    /** Expose note history for UI tooltip */
    getNoteHistory(): { round: number; note: string }[] { return this.noteHistory; }
    /** Expose night phase info for UI debug tooltip */
    getNightInfo(): string {
        if (this.visiblePlayers.length === 0) return 'No night info';
        return this.visiblePlayers.map(p => `- ${p.name} (${p.id}): ${p.info}`).join('\n');
    }
    /** Expose token usage for UI */
    getTokenUsage(): TokenUsage { return this.tokenUsage; }
    /** Expose model name for UI display */
    get modelName(): string { return this._modelName; }
    /** Expose thinking state for UI display */
    getIsThinking(): boolean { return this._isThinking(); }

    constructor(
        public readonly id: string,
        public readonly name: string,
        private llmManager: LLMManagerService,
        private i18n: I18nService,
        private configId?: string
    ) {
        // Eagerly resolve model name from config
        this.resolveModelName();
    }

    private async resolveModelName(): Promise<void> {
        try {
            if (this.configId) {
                const configs = this.llmManager.configs();
                const cfg = configs.find(c => c.id === this.configId);
                if (cfg) {
                    this._modelName = cfg.settings.modelId || cfg.name || cfg.provider;
                    return;
                }
            }
            const active = this.llmManager.activeConfig();
            if (active) {
                this._modelName = active.settings.modelId || active.name || active.provider;
            }
        } catch {
            this._modelName = 'LLM';
        }
    }

    // =========================================================================
    //  IAgent Implementation
    // =========================================================================

    async onNightPhase(info: NightPhaseInfo): Promise<void> {
        this.myRole = info.myRole;
        this.visiblePlayers = info.visiblePlayers;
        this.roleInfo = this.i18n.translate(`roleDescriptions.${info.myRole}`);

        // Build the comprehensive system instruction with full game rules
        // Night phase info (role, visible players) is embedded in system instruction — permanent for the game
        this.systemInstruction = this.buildSystemInstruction(info);
    }

    async onSystemMessage(message: string): Promise<void> {
        this.history.push(`[System]: ${message}`);
    }

    async proposeTeam(context: TeamProposalContext): Promise<ProposeTeamAction> {
        const validIds = new Set(context.playerIds);
        const nameToId = new Map(Object.entries(context.playerNames).map(([id, name]) => [name, id]));
        const prompt = this.buildPrompt(context, ...getProposeTeamPrompt(context));

        const result = await this.queryLLMWithValidation<ProposeTeamAction>(
            prompt,
            { responseSchema: { type: 'object', properties: { self_check: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` }, reasoning: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` }, action: { type: 'object', properties: { teamMemberIds: { type: 'array', items: { type: 'string' } } }, required: ['teamMemberIds'] } }, required: ['self_check', 'reasoning', 'action'] } },
            (parsed) => {
                if (!parsed.action || !Array.isArray(parsed.action.teamMemberIds)) return 'Response must contain action.teamMemberIds array.';

                // Allow models to return player names instead of IDs
                parsed.action.teamMemberIds = parsed.action.teamMemberIds.map((val: string) => {
                    if (validIds.has(val)) return val;
                    if (nameToId.has(val)) return nameToId.get(val)!;
                    return val;
                });

                if (parsed.action.teamMemberIds.length !== context.teamSize) return `Team must have ${context.teamSize} members, got ${parsed.action.teamMemberIds.length}.`;
                const invalid = parsed.action.teamMemberIds.filter((id: string) => !validIds.has(id));
                if (invalid.length > 0) return `Invalid player IDs: ${invalid.join(', ')}. Valid: ${context.playerIds.join(', ')}`;
                if (new Set(parsed.action.teamMemberIds).size !== parsed.action.teamMemberIds.length) return 'Duplicate player IDs found.';
                return null;
            }
        );

        if (result) {
            result.promptText = prompt;
            const teamNames = result.action.teamMemberIds.map(id => context.playerNames[id] || id).join(', ');
            this.history.push(this.i18n.translate('agent.proposal.history', {
                round: context.round,
                names: teamNames,
                reasoning: result.reasoning
            }));
            return result;
        }
        // Fallback
        const others = context.playerIds.filter(id => id !== this.id);
        return {
            self_check: 'Fallback',
            reasoning: 'API error or invalid response.',
            action: {
                teamMemberIds: [this.id, ...others.slice(0, context.teamSize - 1)]
            }
        };
    }

    async vote(context: VoteContext): Promise<VoteAction> {
        const prompt = this.buildPrompt(
            context,
            ...getVotePrompt(context)
        );

        const result = await this.queryLLMWithValidation<VoteAction>(
            prompt,
            {
                responseSchema: {
                    type: 'object',
                    properties: {
                        self_check: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` },
                        reasoning: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` },
                        action: {
                            type: 'object',
                            properties: {
                                voteChoice: { type: 'boolean' }
                            },
                            required: ['voteChoice']
                        }
                    },
                    required: ['self_check', 'reasoning', 'action']
                }
            },
            (parsed) => {
                if (!parsed.action || typeof parsed.action.voteChoice !== 'boolean') return 'Response must contain action.voteChoice (boolean).';
                return null;
            }
        );

        if (result) {
            result.promptText = prompt;
            const teamNames = context.proposedTeam.map(id => context.playerNames[id] || id).join(', ');
            const choice = result.action.voteChoice ? this.i18n.translate('agent.vote.approve') : this.i18n.translate('agent.vote.reject');
            this.history.push(this.i18n.translate('agent.vote.history', {
                round: context.round,
                names: teamNames,
                choice,
                reasoning: result.reasoning
            }));
            return result;
        }
        return {
            self_check: 'Fallback',
            reasoning: 'API error or invalid response.',
            action: {
                voteChoice: false
            }
        };
    }

    async executeMission(context: MissionContext): Promise<MissionAction> {
        const teamInfo = ROLE_META[this.myRole!].team;
        if (teamInfo === Team.Good) {
            const msg = this.i18n.translate('agent.mission.goodSuccessReasoning');
            const check = this.i18n.translate('agent.mission.goodSuccessCheck');
            this.history.push(this.i18n.translate('agent.mission.historyGoodMustSuccess', { round: context.round, msg }));
            return {
                self_check: check,
                reasoning: msg,
                action: {
                    playedMissionResult: true
                }
            };
        }

        const prompt = this.buildPrompt(
            context,
            ...getExecuteMissionPrompt(context, this.name, this.id, this.i18n, this.myRole!)
        );

        const result = await this.queryLLMWithValidation<MissionAction>(
            prompt,
            {
                responseSchema: {
                    type: 'object',
                    properties: {
                        self_check: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` },
                        reasoning: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` },
                        action: {
                            type: 'object',
                            properties: {
                                playedMissionResult: { type: 'boolean' }
                            },
                            required: ['playedMissionResult']
                        }
                    },
                    required: ['self_check', 'reasoning', 'action']
                }
            },
            (parsed) => {
                if (!parsed.action || typeof parsed.action.playedMissionResult !== 'boolean') return 'Response must contain action.playedMissionResult (boolean).';
                return null;
            }
        );

        if (result) {
            result.promptText = prompt;
            const resStr = result.action.playedMissionResult ? this.i18n.translate('board.success') : this.i18n.translate('board.fail');
            this.history.push(this.i18n.translate('agent.mission.historyPlayed', {
                round: context.round,
                result: resStr,
                reasoning: result.reasoning
            }));
            return result;
        }

        return {
            self_check: 'Fallback',
            reasoning: 'API error or invalid response.',
            action: {
                playedMissionResult: true
            }
        };
    }


    async assassinate(context: AssassinContext): Promise<AssassinateAction> {
        const validIds = new Set(context.goodPlayerIds);
        const nameToId = new Map(Object.entries(context.playerNames).map(([id, name]) => [name, id]));

        // Format full game history for assassination analysis
        const gameHistoryText = this.formatFullGameHistory(context.allEvents);

        const prompt = this.buildPrompt(
            context,
            ...getAssassinatePrompt(context, gameHistoryText)
        );

        const result = await this.queryLLMWithValidation<AssassinateAction>(
            prompt,
            { responseSchema: { type: 'object', properties: { self_check: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` }, reasoning: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` }, action: { type: 'object', properties: { targetId: { type: 'string' } }, required: ['targetId'] } }, required: ['self_check', 'reasoning', 'action'] } },
            (parsed) => {
                if (!parsed.action || typeof parsed.action.targetId !== 'string') return 'Response must contain action.targetId (string).';

                // Allow models to return player names instead of IDs
                if (!validIds.has(parsed.action.targetId) && nameToId.has(parsed.action.targetId)) {
                    parsed.action.targetId = nameToId.get(parsed.action.targetId)!;
                }

                if (!validIds.has(parsed.action.targetId)) return `Invalid target player ID: ${parsed.action.targetId}. Valid: ${context.goodPlayerIds.join(', ')}`;
                return null;
            }
        );

        if (result) {
            result.promptText = prompt;
            return result;
        }
        return {
            self_check: 'Fallback',
            reasoning: 'API error or invalid response.',
            action: {
                targetId: context.goodPlayerIds[0]
            }
        };
    }


    async speak(context: SpeakContext, onChunk?: (chunk: string, field: 'speech' | 'reasoning' | 'self_check') => void): Promise<SpeechAct> {


        const prompt = this.buildPrompt(
            context,
            ...getSpeakPrompt(context, this.i18n, this.myRole!, this.name, this.id)
        );

        const result = await this.queryLLMWithValidation<SpeechAct>(
            prompt,
            {
                responseSchema: {
                    type: 'object',
                    properties: {
                        self_check: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` },
                        reasoning: { type: 'string', description: `MUST BE IN: ${this.i18n.translate('setup.languageName')}` },
                        action: {
                            type: 'object',
                            properties: {
                                speech: { type: 'string' },
                                readyToVote: { type: 'boolean' }
                            },
                            required: ['speech', 'readyToVote']
                        }
                    },
                    required: ['self_check', 'reasoning', 'action']
                }
            },
            (parsed) => {
                if (!parsed.action || typeof parsed.action.speech !== 'string' || typeof parsed.action.readyToVote !== 'boolean') {
                    return 'Response must contain action (with speech and readyToVote).';
                }

                const speech = parsed.action.speech;
                const hasMessage = speech && speech.trim().length > 0;

                if (parsed.action.readyToVote === true && !hasMessage) return null; // valid pass
                if (hasMessage) return null; // valid speech (with or without pass flag)

                return 'Response must contain a non-empty speech string OR action.readyToVote: true.';
            },
            onChunk as (chunk: string, field: string) => void
        );

        if (result) {
            result.promptText = prompt;
            const hasSpeech = result.action.speech && result.action.speech.trim().length > 0;
            if (hasSpeech) {
                this.history.push(this.i18n.translate('agent.discussion.historySpoke', {
                    round: context.round,
                    speech: result.action.speech.trim(),
                    reasoning: result.reasoning
                }));
            } else {
                this.history.push(this.i18n.translate('agent.discussion.historyPassed', {
                    round: context.round,
                    reasoning: result.reasoning
                }));
            }
            return result;
        }

        return {
            self_check: 'Fallback',
            reasoning: 'API error or invalid response.',
            action: {
                speech: '...',
                readyToVote: true
            },
            promptText: prompt
        };
    }


    async useExcalibur(context: ExcaliburContext): Promise<string | null> {
        const validIds = new Set(context.missionCardHolderIds);
        const nameToId = new Map(Object.entries(context.playerNames).map(([id, name]) => [name, id]));
        const holdersStr = context.missionCardHolderIds
            .map(id => `${context.playerNames[id] || id}(${id})`)
            .join(', ');

        const prompt = this.buildPrompt(
            context,
            ...getUseExcaliburPrompt(context)
        );

        const result = await this.queryLLMWithValidation<{ targetId: string | null }>(
            prompt,
            { responseSchema: { type: 'object', description: 'Excalibur usage decision', properties: { targetId: { type: 'string', nullable: true, description: 'The player ID whose mission card to flip, or null to skip using Excalibur' } }, required: ['targetId'] } },
            (parsed) => {
                if (parsed.targetId !== null) {
                    // Allow models to return player names instead of IDs
                    if (!validIds.has(parsed.targetId) && nameToId.has(parsed.targetId)) {
                        parsed.targetId = nameToId.get(parsed.targetId)!;
                    }

                    if (!validIds.has(parsed.targetId))
                        return `targetId must be one of: ${holdersStr}, or null.`;
                }
                return null;
            }
        );
        return result?.targetId ?? null;
    }

    async useLadyOfTheLake(context: LadyContext): Promise<string | null> {
        const validIds = new Set(Object.keys(context.playerNames));
        const nameToId = new Map(Object.entries(context.playerNames).map(([id, name]) => [name, id]));

        const prompt = this.buildPrompt(
            context,
            ...getUseLadyOfTheLakePrompt(context)
        );

        const result = await this.queryLLMWithValidation<{ targetId: string }>(
            prompt,
            { responseSchema: { type: 'object', description: 'Lady of the Lake inspection target', properties: { targetId: { type: 'string', description: 'The player ID of the player you want to inspect for alignment' } }, required: ['targetId'] } },
            (parsed) => {
                if (!parsed.targetId) return 'Must provide targetId.';

                // Allow models to return player names instead of IDs
                if (!validIds.has(parsed.targetId) && nameToId.has(parsed.targetId)) {
                    parsed.targetId = nameToId.get(parsed.targetId)!;
                }

                if (parsed.targetId === this.id) return 'Cannot inspect yourself.';
                if (!validIds.has(parsed.targetId)) return `Invalid target player ID: ${parsed.targetId}. Valid: ${Array.from(validIds).join(', ')}`;

                return null;
            }
        );
        return result?.targetId ?? null;
    }

    async updateNote(context: NoteContext): Promise<string> {
        const prompt = this.buildPrompt(
            context,
            ...getUpdateNotePrompt(context, this.myRole!, this.note, this.history, this.i18n)
        );

        const result = await this.queryLLMWithValidation<{ newNote: string }>(
            prompt,
            { responseSchema: { type: 'object', description: 'Updated personal note', properties: { newNote: { type: 'string', description: `Your updated personal note. MUST BE IN: ${this.i18n.translate('setup.languageName')}` } }, required: ['newNote'] } },
            (parsed) => {
                if (!parsed.newNote || typeof parsed.newNote !== 'string') return 'Response must contain newNote (string).';
                return null;
            }
        );

        if (result) {
            this.note = result.newNote;
            this.noteHistory.push({ round: context.round, note: this.note });
        }

        // Clear history after consolidation into Note — prevents context explosion
        this.history = [];

        return this.note;
    }

    async shareGameReflection(context: GameReflectionContext, onChunk?: (chunk: string, field: 'reflection' | 'self_check') => void): Promise<{ reflection: string; promptText?: string }> {
        const prompt = getShareGameReflectionPrompt(context, this.myRole!, this.name, this.id, this.note, this.i18n);
        const result = await this.queryLLMWithValidation<{ reflection: string }>(
            prompt,
            {
                responseSchema: {
                    type: 'object',
                    description: 'Post-game reflection with identity check',
                    properties: {
                        self_check: { type: 'string', description: `Confirmation in native language. MUST BE IN: ${this.i18n.translate('setup.languageName')}` },
                        reflection: { type: 'string', description: `Reflection in native language. MUST BE IN: ${this.i18n.translate('setup.languageName')}` }
                    },
                    required: ['self_check', 'reflection']
                }
            },
            (parsed) => {
                if (!parsed.reflection || typeof parsed.reflection !== 'string') return 'Response must contain reflection (string).';
                return null;
            },
            onChunk as (chunk: string, field: string) => void
        );

        return {
            reflection: result?.reflection ?? this.i18n.translate('agent.reflection.fallback'),
            promptText: prompt
        };
    }

    // =========================================================================
    //  Private Helpers
    // =========================================================================

    /**
     * Build a prompt with standard preamble: identity + base game context + note + body sections.
     * All phase methods should use this to ensure consistent context injection.
     */
    public buildPrompt(ctx: BaseGameContext, ...sections: string[]): string {
        const teamInfo = ROLE_META[this.myRole!].team;
        const myTeamText = teamInfo === Team.Good ? 'Good (Blue)' : 'Evil (Red)';

        const identity = [
            `[PRIVATE DATA - IDENTITY]`,
            `You are **${this.name} (${this.id}).**`,
            `Your team: **${myTeamText}**`,
            `Your role: **${this.i18n.translate(`roles.${this.myRole}`)} (${this.myRole})**`
        ].join('\n');

        const visibleInfo = this.visiblePlayers.length > 0
            ? `[PRIVATE DATA - SECRET INTEL]\n### Night Phase Intel\n${this.visiblePlayers.map(p => `- ${p.name} (${p.id}): ${p.info}`).join('\n')}\n⚠️ This is YOUR SECRET intel. NEVER quote it directly in discussion!`
            : `[PRIVATE DATA - SECRET INTEL]\n### Night Phase Intel\n${this.i18n.translate('agent.night.noInfo', { role: this.i18n.translate(`roles.${this.myRole}`) })}`;

        const noteBlock = `[PRIVATE DATA - YOUR PERSONAL NOTE]\n===Your Note===\n${this.note || 'empty'}\n===============`;

        const recentThoughtsBlock = this.history.length > 0
            ? `[PRIVATE DATA - YOUR RECENT ACTIONS & THOUGHTS THIS ROUND]\n${this.history.join('\n')}\n======================================================`
            : '';

        // Format base game context
        const goodWins = ctx.missionHistory.filter(m => m.succeeded).length;
        const evilWins = ctx.missionHistory.filter(m => !m.succeeded).length;

        const missionSummary = ctx.missionHistory.length > 0
            ? ctx.missionHistory.map(m =>
                `Round ${m.round}: ${m.succeeded ? '✅Success' : '❌Fail'} (${m.failsCount} fails, team: ${m.teamIds.map(id => ctx.playerNames[id] || id).join(',')})`
            ).join('\n')
            : 'No missions completed yet.';

        const roundEventsText = ctx.roundEvents.length > 0
            ? this.formatRoundHistory(ctx.roundEvents)
            : 'No events this round.';

        // Sort by ID to guarantee consistent p1,p2,...,pN ordering
        const playerRoster = Object.keys(ctx.playerNames)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(id => `${ctx.playerNames[id]}(${id})`)
            .join(', ');

        const roleCounts = ctx.rolesInGame.reduce((acc, role) => {
            acc[role] = (acc[role] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const rolesListText = Object.entries(roleCounts)
            .map(([role, count]) => `${this.i18n.translate(`roles.${role as Role}`)}x${count}`)
            .join(', ');

        let matchPointWarning = '';
        if (goodWins === 2 && evilWins === 2) {
            matchPointWarning = this.i18n.translate('agent.matchPoint.both2');
        } else if (goodWins === 2) {
            matchPointWarning = this.i18n.translate('agent.matchPoint.good2');
        } else if (evilWins === 2) {
            matchPointWarning = this.i18n.translate('agent.matchPoint.evil2');
        }

        let twoFailsWarning = '';
        if (ctx.round === 4 && ctx.twoFailsRequiredInRound4) {
            twoFailsWarning = this.i18n.translate('agent.ruleOverride.round4TwoFails');
        }

        const baseContext = [
            `[PUBLIC DATA - EVERYONE SEES THIS]`,
            `===Game State===`,
            `Roles in THIS game: ${rolesListText}`,
            `Player list: ${playerRoster}`,
            `Round: ${ctx.round} | Score: Good ${goodWins} - Evil ${evilWins} | Failed votes: ${ctx.consecutiveFailedVotes}/5`,
            ...(matchPointWarning ? [matchPointWarning] : []),
            ...(twoFailsWarning ? [twoFailsWarning] : []),
            `Mission history:\n${missionSummary}`,
            `Voting history (Previous Rounds):\n${this.formatVotingHistory(ctx.allEvents, ctx.round, ctx.playerNames)}`,
            `Events this round:\n${roundEventsText}`,
            `================`
        ].join('\n');

        return [identity, visibleInfo, noteBlock, recentThoughtsBlock, baseContext, '', ...sections.filter(s => s !== '')].filter(s => s !== '').join('\n');
    }



    /** Format GameEvent[] into a human-readable log. */
    private formatRoundHistory(events: GameEvent[]): string {
        return events.map(e => {
            switch (e.type) {
                case 'DISCUSSION': {
                    const msg = e.message?.trim();
                    if (!msg) return ''; // Skip empty messages (when passing without speech)
                    return `[Chat] ${e.playerName}: ${msg}`;
                }
                case 'TEAM_PROPOSAL': return `[Proposal] ${e.leaderName} proposed: ${e.teamNames.join(', ')}`;
                case 'VOTE_RESULTS': return `[Vote] ${e.passed ? 'PASSED' : 'REJECTED'}. ${e.votes.map(v => `${v.name}:${v.approve ? 'O' : 'X'}`).join(', ')}`;
                case 'MISSION_OUTCOME': return `[Mission] ${e.succeeded ? 'SUCCESS' : 'FAIL'} (fails: ${e.failsCount})`;
                case 'SYSTEM': {
                    if (e.message.includes('跳過發言') || e.message.includes('skipped')) return '';
                    return `[System] ${e.message}`;
                }
                default: return '';
            }
        }).filter(s => s !== '').join('\n');
    }

    /** Format full voting history for previous rounds in a compact way. */
    private formatVotingHistory(events: GameEvent[], currentRound: number, playerNames: Record<string, string>): string {
        const history: string[] = [];
        let voteAttempt = 1;

        for (const e of events) {
            if ('round' in e && e.round !== undefined) {
                if (e.round < currentRound) {
                    if (e.type === 'TEAM_PROPOSAL') {
                        const teamStr = e.teamIds.map(id => playerNames[id] || id).join(',');
                        history.push(`R${e.round}-V${voteAttempt}: Leader(${e.leaderName}) proposed [${teamStr}]`);
                    } else if (e.type === 'VOTE_RESULTS') {
                        // Find the corresponding proposal in the history array by searching backwards
                        const targetStr = `R${e.round}-V${voteAttempt}`;
                        for (let i = history.length - 1; i >= 0; i--) {
                            if (history[i].startsWith(targetStr)) {
                                const votesStr = e.votes.map(v => `${v.name}:${v.approve ? 'O' : 'X'}`).join(',');
                                history[i] += ` -> ${e.passed ? 'PASSED' : 'REJECTED'} (Votes: ${votesStr})`;
                                break;
                            }
                        }
                        voteAttempt++;
                    } else if (e.type === 'MISSION_OUTCOME') {
                        voteAttempt = 1;
                        history.push(`R${e.round}-RESULT: ${e.succeeded ? 'SUCCESS' : 'FAIL'} (fails: ${e.failsCount})`);
                    } else if (e.type === 'SYSTEM' && !e.message.includes('跳過發言') && !e.message.includes('skipped')) {
                        history.push(`R${e.round}-SYSTEM: ${e.message}`);
                    }
                } else if (e.round === currentRound && e.type === 'VOTE_RESULTS') {
                    voteAttempt++;
                }
            }
        }

        return history.length > 0 ? history.join('\n') : 'No previous voting history.';
    }

    /** Format full game event history for assassination review. */
    public formatFullGameHistory(events: GameEvent[]): string {
        return events.map(e => {
            switch (e.type) {
                case 'ROUND_START': return `\n--- Round ${e.round} ---`;
                case 'DISCUSSION': return `[Chat] ${e.playerName}: ${e.message}`;
                case 'TEAM_PROPOSAL': return `[Proposal] ${e.leaderName} proposed: ${e.teamNames.join(', ')}`;
                case 'VOTE_RESULTS': return `[Vote R${e.round}] ${e.passed ? 'PASSED' : 'REJECTED'}. ${e.votes.map(v => `${v.name}:${v.approve ? 'O' : 'X'}`).join(', ')}`;
                case 'MISSION_OUTCOME': return `[Mission R${e.round}] ${e.succeeded ? 'SUCCESS' : 'FAIL'} (fails: ${e.failsCount}, team: ${e.teamNames.join(', ')})`;
                case 'SYSTEM': return `[System] ${e.message}`;
                default: return '';
            }
        }).filter(s => s !== '').join('\n');
    }

    /**
     * Build a comprehensive system instruction based on the game state.
     * Written in English for token efficiency. Chat/Note output uses this.lang.
     * This instruction is identical for ALL AI participants to maximize provider-side caching.
     */
    private buildSystemInstruction(info: NightPhaseInfo): string {
        const uniqueRoles = [...new Set(info.rolesInGame)];

        const sections: string[] = [];

        // ==== §1 GAME OVERVIEW ====
        sections.push(getGameOverViewPrompt(info));

        // ==== §2 GAME RULES ====
        sections.push(getGameRulePrompt(info));

        // ==== §3 CHARACTER ABILITIES ====
        sections.push(getCharacterAbilitiesPrompt(uniqueRoles, this.i18n));

        // ==== §4 EXPANSION RULES ====
        if (info.options.excalibur) {
            sections.push(getExcaliburRulePrompt());
        }

        if (info.options.lady) {
            sections.push(getLadyRulePrompt());
        }

        // ==== §5 CRITICAL BEHAVIORAL RULES ====
        sections.push(getCriticalBehavioralRulesPrompt());

        // ==== §6 FACTION STRATEGIES ====
        sections.push(getFactionStrategiesPrompt());

        // ==== §7 ROLE-SPECIFIC STRATEGIES ====
        const roleStrategiesPrompt = getRoleSpecificStrategiesPrompt(uniqueRoles);
        if (roleStrategiesPrompt) sections.push(roleStrategiesPrompt);

        // ==== §8 PHASE-SPECIFIC ROLE HINTS ====
        const phaseHintsPrompt = getPhaseSpecificRoleHintsPrompt(uniqueRoles);
        if (phaseHintsPrompt) sections.push(phaseHintsPrompt);

        // ==== §9 DISCUSSION TACTICS ====
        sections.push(getDiscussionTacticsPrompt());

        // (Note-Taking Guide has been moved to updateNote phase to be dynamically generated per role)

        // ==== §11 COMMUNICATION CHANNELS ====
        sections.push(getCommunicationChannelsPrompt());

        // ==== §12 OUTPUT FORMAT ====
        const lang = this.i18n.translate('setup.languageName');
        sections.push(getOutputFormatPrompt(lang));

        return sections.join('\n\n');
    }

    /**
     * Query LLM with validation and append-only retry.
     *
     * Flow:
     *   1. Send original prompt → get response
     *   2. Parse JSON → run validate()
     *   3. If invalid: append [model: bad response] + [user: correction] → retry
     *   4. Up to MAX_RETRIES correction rounds
     *
     * @returns parsed result if valid, or null if all attempts fail.
     */
    public async queryLLMWithValidation<T>(
        prompt: string,
        config: LLMGenerateConfig,
        validate: (parsed: T) => string | null,
        onFieldChunk?: (chunk: string, field: string) => void
    ): Promise<T | null> {
        const provider = await this.getProvider();
        const contents: LLMContent[] = [
            { role: 'user', parts: [{ text: prompt }] }
        ];

        this._isThinking.set(true);
        try {
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                const responseText = await this.streamLLM(provider, contents, config, onFieldChunk);

                // Append model's response to conversation history
                contents.push({ role: 'model', parts: [{ text: responseText }] });

                try {
                    const parsed = JSON.parse(responseText) as T;
                    const error = validate(parsed);
                    if (!error) return parsed; // Valid!

                    // Invalid — append correction and retry
                    console.warn(`[LLMAgent:${this.name}] Validation failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${error}`);
                    contents.push({ role: 'user', parts: [{ text: `Invalid response: ${error}\nPlease retry with the exact format required.` }] });
                } catch (e) {
                    // JSON parse failure — append correction
                    console.warn(`[LLMAgent:${this.name}] JSON parse failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, e);
                    contents.push({ role: 'user', parts: [{ text: `Your response is not valid JSON. Raw: "${responseText}"\nPlease retry with valid JSON only.` }] });
                }
            }

            console.error(`[LLMAgent:${this.name}] All ${MAX_RETRIES + 1} attempts failed for prompt.`);
            return null;
        } finally {
            this._isThinking.set(false);
        }
    }

    /** Get the LLM provider instance. */
    private async getProvider() {
        let provider;
        if (this.configId) {
            provider = await this.llmManager.getProviderByConfigId(this.configId);
        } else {
            provider = this.llmManager.getProviderForConfig(this.llmManager.activeConfig()!);
        }
        if (!provider) throw new Error('[LLMAgent] No provider available');
        return provider;
    }

    /** Stream a response from the provider given a conversation. */
    private async streamLLM(provider: LLMProvider, contents: LLMContent[], config: LLMGenerateConfig, onFieldChunk?: (chunk: string, field: string) => void): Promise<string> {
        let fullText = '';
        let finalUsageMetadata: LLMUsageMetadata | undefined;

        let llmConfig;
        if (this.configId) {
            llmConfig = this.llmManager.configs().find(c => c.id === this.configId);
        }
        if (!llmConfig) {
            llmConfig = this.llmManager.activeConfig();
        }
        // Use baseUrl as the mutex key if available, otherwise fallback to provider name
        const mutexKey = llmConfig?.settings?.baseUrl || llmConfig?.provider || 'default';

        if (!streamQueues[mutexKey]) {
            streamQueues[mutexKey] = Promise.resolve();
        }

        let release!: () => void;
        const lock = new Promise<void>(resolve => release = resolve);
        const previousLock = streamQueues[mutexKey];
        streamQueues[mutexKey] = previousLock.then(() => lock, () => lock);

        await previousLock;

        try {
            for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
                try {
                    fullText = ''; // Reset on retry
                    const stream = provider.generateContentStream(contents, this.systemInstruction, config);

                    // Simple state machine to extract fields during streaming
                    let currentField: string | null = null;
                    let escaped = false;
                    let lastReportedLength = 0;

                    for await (const chunk of stream) {
                        if (chunk.usageMetadata) {
                            finalUsageMetadata = chunk.usageMetadata;
                        }

                        if (chunk.text) {
                            const prevFullText = fullText;
                            fullText += chunk.text;

                            if (onFieldChunk) {
                                let i = Math.max(lastReportedLength, prevFullText.length);
                                while (i < fullText.length) {
                                    if (!currentField) {
                                        const speechIndex = fullText.indexOf('"speech": "', lastReportedLength);
                                        const messageIndex = fullText.indexOf('"message": "', lastReportedLength);
                                        const reflectionIndex = fullText.indexOf('"reflection": "', lastReportedLength);
                                        const reasoningIndex = fullText.indexOf('"reasoning": "', lastReportedLength);
                                        const selfCheckIndex = fullText.indexOf('"self_check": "', lastReportedLength);

                                        let minIndex = Infinity;
                                        let field = '';
                                        let offset = 0;

                                        if (speechIndex !== -1 && speechIndex < minIndex) { minIndex = speechIndex; field = 'speech'; offset = 11; }
                                        if (messageIndex !== -1 && messageIndex < minIndex) { minIndex = messageIndex; field = 'message'; offset = 12; }
                                        if (reflectionIndex !== -1 && reflectionIndex < minIndex) { minIndex = reflectionIndex; field = 'reflection'; offset = 15; }
                                        if (reasoningIndex !== -1 && reasoningIndex < minIndex) { minIndex = reasoningIndex; field = 'reasoning'; offset = 14; }
                                        if (selfCheckIndex !== -1 && selfCheckIndex < minIndex) { minIndex = selfCheckIndex; field = 'self_check'; offset = 15; }

                                        if (field) {
                                            currentField = field;
                                            lastReportedLength = minIndex + offset;
                                            i = lastReportedLength;
                                            continue;
                                        } else {
                                            break;
                                        }
                                    }

                                    if (currentField) {
                                        const char = fullText[i];
                                        if (!escaped) {
                                            if (char === '\\') {
                                                escaped = true;
                                                i++;
                                                continue;
                                            }
                                            if (char === '"') {
                                                currentField = null;
                                                lastReportedLength = i + 1;
                                                i++;
                                                continue;
                                            }
                                            onFieldChunk(char, currentField === 'message' ? 'speech' : currentField);
                                        } else {
                                            const c = char === 'n' ? '\n' : (char === 't' ? '\t' : char);
                                            onFieldChunk(c, currentField === 'message' ? 'speech' : currentField);
                                            escaped = false;
                                        }
                                        i++;
                                        lastReportedLength = i;
                                    }
                                }
                            }
                        }
                    }

                    // If we get here, the stream finished successfully
                    break;

                } catch (e) {
                    const error = e as { status?: number, message?: string };
                    const isRateLimit = error?.status === 429 ||
                        (error?.message && error.message.includes('429')) ||
                        (error?.message && error.message.includes('RESOURCE_EXHAUSTED'));

                    if (isRateLimit && attempt < MAX_API_RETRIES) {
                        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
                        console.warn(`[LLMAgent:${this.name}] Rate limit (429) hit. Retrying in ${delayMs}ms... (attempt ${attempt + 1}/${MAX_API_RETRIES})`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                        continue; // Try again
                    }

                    // If not rate limit, or we ran out of retries, throw
                    throw error;
                }
            }

            if (finalUsageMetadata) {
                await this.updateTokenUsage(finalUsageMetadata);
            }

            return fullText;
        } finally {
            release();
        }
    }

    private async updateTokenUsage(metadata: LLMUsageMetadata): Promise<void> {
        this.tokenUsage.promptTokens += metadata.prompt || 0;
        this.tokenUsage.completionTokens += metadata.candidates || 0;
        this.tokenUsage.cachedTokens += metadata.cached || 0;

        try {
            const provider = await this.getProvider();
            let config;
            if (this.configId) {
                config = this.llmManager.configs().find(c => c.id === this.configId);
            }
            if (!config) {
                config = this.llmManager.activeConfig();
            }
            if (!config) return;

            const models = provider.getAvailableModels();
            const modelDef = models.find(m => m.id === config.settings.modelId);

            if (modelDef) {
                const rates = modelDef.getRates(metadata.prompt);
                const inputPrice = config.settings.inputPrice !== undefined ? config.settings.inputPrice : rates.input;
                const outputPrice = config.settings.outputPrice !== undefined ? config.settings.outputPrice : rates.output;
                const cachedPrice = rates.cached !== undefined ? rates.cached : inputPrice; // fallback to inputPrice

                const cost = ((metadata.prompt || 0) * inputPrice + (metadata.cached || 0) * cachedPrice + (metadata.candidates || 0) * outputPrice) / 1000000;
                this.tokenUsage.totalCost += cost;
            }
        } catch (e) {
            console.error(`[LLMAgent:${this.name}] Failed to update token cost`, e);
        }
    }
}
