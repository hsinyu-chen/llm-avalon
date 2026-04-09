import { IAgent, NightPhaseInfo, TeamProposalContext, VoteContext, MissionContext, AssassinContext, SpeakContext, SpeechAct, ExcaliburContext, LadyContext, NoteContext, GameReflectionContext, BaseGameContext, TokenUsage, ProposeTeamAction, VoteAction, MissionAction, AssassinateAction } from '../models/agent.interface';
import { LLMManagerService } from '../services/llm/llm-manager.service';
import { Role, ROLE_META, Team } from '../models/role';
import { LLMContent, LLMGenerateConfig, LLMProvider, LLMUsageMetadata, LLMConfig } from '../services/llm/llm-provider';
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
import { AgentFatalError } from '../models/errors';
import { parse } from 'best-effort-json-parser';
import { getAgentResponseSchema, getResponseFormatPrompt, AgentActionName } from './prompts/schemas';

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
    public intelSummary?: string;
    public history: string[] = [];
    public note = '';
    public noteHistory: { round: number; note: string }[] = [];
    private lastAssessment = '';
    private lastStrategy = '';
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
        let info = this.visiblePlayers.map(p => `- ${p.name} (${p.id}): ${p.info}`).join('\n');
        if (this.intelSummary) {
            info += `\n\n${this.intelSummary}`;
        }
        return info;
    }
    /** Expose token usage for UI */
    getTokenUsage(): TokenUsage { return this.tokenUsage; }
    /** Expose model name for UI display */
    get modelName(): string { return this._modelName; }
    /** Expose thinking state for UI display */
    getIsThinking(): boolean { return this._isThinking(); }
    /** Expose last assessment for UI */
    getLastAssessment(): string { return this.lastAssessment; }
    /** Expose last strategy for UI */
    getLastStrategy(): string { return this.lastStrategy; }
    updateStreamingAssessment(chunk: string) {
        if (chunk === '') this.lastAssessment = '';
        else this.lastAssessment += chunk;
    }
    updateStreamingStrategy(chunk: string) {
        if (chunk === '') this.lastStrategy = '';
        else this.lastStrategy += chunk;
    }

    getSystemInstruction(): string {
        return this.systemInstruction;
    }

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

    private resolveModelName(): void {
        try {
            if (this.configId) {
                const configs = this.llmManager.configs();
                const cfg = configs.find(c => c.id === this.configId);
                if (cfg) {
                    this._modelName = cfg.settings.modelId || cfg.name || cfg.provider;
                    return;
                }
            }
        } catch {
            // Ignore — keep default 'LLM'
        }
    }

    // =========================================================================
    //  IAgent Implementation
    // =========================================================================

    async onNightPhase(info: NightPhaseInfo): Promise<void> {
        this.myRole = info.myRole;
        this.visiblePlayers = info.visiblePlayers;
        this.intelSummary = info.intelSummary;
        this.roleInfo = this.i18n.translate(`roleDescriptions.${info.myRole}`);

        // Build the comprehensive system instruction with full game rules
        // Night phase info (role, visible players) is embedded in system instruction — permanent for the game
        this.systemInstruction = this.buildSystemInstruction(info);
    }

    async onSystemMessage(message: string): Promise<void> {
        this.history.push(`[System]: ${message}`);
    }

    async proposeTeam(context: TeamProposalContext, onChunk?: (chunk: string, field: 'reasoning' | 'self_check' | 'situation_assessment' | 'action_strategy') => void): Promise<ProposeTeamAction> {
        const validIds = new Set(context.playerIds);
        const nameToId = new Map(Object.entries(context.playerNames).map(([id, name]) => [name, id]));
        // Build a map for "name(id)" format -> ID
        const nameIdFormatToId = new Map(
            Object.entries(context.playerNames).map(([id, name]) => [`${name}(${id})`, id])
        );
        const prompt = this.buildPrompt(context, 'proposeTeam', ...getProposeTeamPrompt(context));

        const result = await this.queryLLMWithValidation<ProposeTeamAction>(
            prompt,
            { responseSchema: getAgentResponseSchema('proposeTeam', this.i18n.translate('setup.languageName')) },
            (parsed) => {
                if (!parsed.action || !Array.isArray(parsed.action.teamMemberIds)) return 'Response must contain action.teamMemberIds array.';

                // Allow models to return player names instead of IDs, including "name(id)" format
                parsed.action.teamMemberIds = parsed.action.teamMemberIds.map((val: string) => {
                    // If it's already a valid ID, return as-is
                    if (validIds.has(val)) return val;

                    // Try exact name match
                    if (nameToId.has(val)) return nameToId.get(val)!;

                    // Try "name(id)" format
                    if (nameIdFormatToId.has(val)) return nameIdFormatToId.get(val)!;

                    // Try to extract ID from "name(id)" format using regex
                    const match = val.match(/\(([^)]+)\)$/);
                    if (match) {
                        const extractedId = match[1];
                        if (validIds.has(extractedId)) return extractedId;
                    }

                    return val;
                });

                if (parsed.action.teamMemberIds.length !== context.teamSize) return `Team must have ${context.teamSize} members, got ${parsed.action.teamMemberIds.length}.`;
                const invalid = parsed.action.teamMemberIds.filter((id: string) => !validIds.has(id));
                if (invalid.length > 0) return `Invalid player IDs: ${invalid.join(', ')}. Valid: ${context.playerIds.join(', ')}`;
                if (new Set(parsed.action.teamMemberIds).size !== parsed.action.teamMemberIds.length) return 'Duplicate player IDs found.';
                return null;
            },
            'proposeTeam',
            onChunk as (chunk: string, field: string) => void
        );

        result.promptText = prompt;
        const teamNames = result.action.teamMemberIds.map(id => context.playerNames[id] || id).join(', ');
        this.history.push(this.i18n.translate('agent.proposal.history', {
            round: context.round,
            names: teamNames
        }));
        return result;
    }

    async vote(context: VoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'self_check' | 'situation_assessment' | 'action_strategy') => void): Promise<VoteAction> {
        const prompt = this.buildPrompt(
            context,
            'vote',
            ...getVotePrompt(context)
        );

        const result = await this.queryLLMWithValidation<VoteAction>(
            prompt,
            {
                responseSchema: getAgentResponseSchema('vote', this.i18n.translate('setup.languageName'))
            },
            (parsed) => {
                if (!parsed.action || typeof parsed.action.voteChoice !== 'boolean') return 'Response must contain action.voteChoice (boolean).';
                return null;
            },
            'vote',
            onChunk as (chunk: string, field: string) => void
        );

        result.promptText = prompt;
        const teamNames = context.proposedTeam.map(id => context.playerNames[id] || id).join(', ');
        const choice = result.action.voteChoice ? this.i18n.translate('agent.vote.approve') : this.i18n.translate('agent.vote.reject');
        this.history.push(this.i18n.translate('agent.vote.history', {
            round: context.round,
            names: teamNames,
            choice
        }));
        return result;
    }

    async executeMission(context: MissionContext, onChunk?: (chunk: string, field: 'reasoning' | 'self_check' | 'situation_assessment' | 'action_strategy') => void): Promise<MissionAction> {
        const teamInfo = ROLE_META[this.myRole!].team;
        if (teamInfo === Team.Good) {
            const autoResult: MissionAction = {
                action: { playedMissionResult: true },
                reasoning: "As a Good player, I have no choice but to play Success on missions. This is an automatic action.",
                situation_assessment: "",
                action_strategy: "",
                self_check: ""
            };

            if (onChunk) {
                onChunk(autoResult.reasoning, 'reasoning');
            }

            const resStr = this.i18n.translate('board.success');
            this.history.push(this.i18n.translate('agent.mission.historyPlayed', {
                round: context.round,
                result: resStr
            }));
            
            return autoResult;
        }

        const prompt = this.buildPrompt(
            context,
            'executeMission',
            ...getExecuteMissionPrompt(context, this.name, this.id, this.i18n, this.myRole!, this.visiblePlayers, context.rolesInGame)
        );

        const result = await this.queryLLMWithValidation<MissionAction>(
            prompt,
            {
                responseSchema: getAgentResponseSchema('executeMission', this.i18n.translate('setup.languageName'))
            },
            (parsed) => {
                const teamInfo = ROLE_META[this.myRole!].team;
                if (teamInfo === Team.Good && parsed.action?.playedMissionResult === false) {
                    return 'Good players MUST play Success (true).';
                }
                if (!parsed.action || typeof parsed.action.playedMissionResult !== 'boolean') return 'Response must contain action.playedMissionResult (boolean).';
                return null;
            },
            'executeMission',
            onChunk as (chunk: string, field: string) => void
        );

        result.promptText = prompt;
        const resStr = result.action.playedMissionResult ? this.i18n.translate('board.success') : this.i18n.translate('board.fail');
        this.history.push(this.i18n.translate('agent.mission.historyPlayed', {
            round: context.round,
            result: resStr
        }));
        return result;
    }


    async assassinate(context: AssassinContext, onChunk?: (chunk: string, field: 'reasoning' | 'self_check' | 'situation_assessment' | 'action_strategy') => void): Promise<AssassinateAction> {
        const validIds = new Set(context.goodPlayerIds);
        const nameToId = new Map(Object.entries(context.playerNames).map(([id, name]) => [name, id]));

        // Filter roundEvents to include assassination discussion for buildPrompt
        const assassinationEvents = context.allEvents.filter(e => e.type === 'DISCUSSION' && e.phase === 'ASSASSINATION_DISCUSSION');

        const prompt = this.buildPrompt(
            { ...context, round: context.round + 1, roundEvents: assassinationEvents },
            'assassinate',
            getAssassinatePrompt(context)
        );

        const result = await this.queryLLMWithValidation<AssassinateAction>(
            prompt,
            { responseSchema: getAgentResponseSchema('assassinate', this.i18n.translate('setup.languageName')) },
            (parsed) => {
                if (!parsed.action || typeof parsed.action.targetId !== 'string') return 'Response must contain action.targetId (string).';

                // Allow models to return player names instead of IDs
                if (!validIds.has(parsed.action.targetId) && nameToId.has(parsed.action.targetId)) {
                    parsed.action.targetId = nameToId.get(parsed.action.targetId)!;
                }

                if (!validIds.has(parsed.action.targetId)) return `Invalid target player ID: ${parsed.action.targetId}. Valid: ${context.goodPlayerIds.join(', ')}`;
                return null;
            },
            'assassinate',
            onChunk as (chunk: string, field: string) => void
        );

        result.promptText = prompt;
        return result;
    }


    async speak(context: SpeakContext, onChunk?: (chunk: string, field: 'speech' | 'reasoning' | 'self_check' | 'situation_assessment' | 'action_strategy') => void): Promise<SpeechAct> {


        const validSignalTargets = Object.entries(context.playerNames)
            .filter(([id]) => id !== this.id)
            .map(([id, name]) => `${name}(${id})`)
            .join(', ');

        const prompt = this.buildPrompt(
            context,
            'speak',
            ...getSpeakPrompt(context, this.i18n, this.myRole!, this.name, this.id)
        );

        const result = await this.queryLLMWithValidation<SpeechAct>(
            prompt,
            {
                responseSchema: getAgentResponseSchema('speak', this.i18n.translate('setup.languageName'))
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
            'speak',
            onChunk as (chunk: string, field: string) => void
        );

        result.promptText = prompt;
        const hasSpeech = result.action.speech && result.action.speech.trim().length > 0;
        if (hasSpeech) {
            this.history.push(this.i18n.translate('agent.discussion.historySpoke', {
                round: context.round,
                speech: result.action.speech.trim()
            }));
        } else {
            this.history.push(this.i18n.translate('agent.discussion.historyPassed', {
                round: context.round
            }));
        }
        return result;
    }


    async useExcalibur(context: ExcaliburContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ targetId: string | null; thought?: string; reasoning?: string; self_check?: string; situation_assessment?: string; action_strategy?: string; promptText?: string; retryLogs?: string[] }> {
        const validIds = new Set(context.missionCardHolderIds);
        const nameToId = new Map(Object.entries(context.playerNames).map(([id, name]) => [name, id]));
        const holdersStr = context.missionCardHolderIds
            .map(id => `${context.playerNames[id] || id}(${id})`)
            .join(', ');

        const prompt = this.buildPrompt(
            context,
            'useExcalibur',
            ...getUseExcaliburPrompt(context)
        );

        const result = await this.queryLLMWithValidation<{ targetId: string | null; situation_assessment: string; action_strategy: string; reasoning: string; self_check: string; thought?: string }>(
            prompt,
            { responseSchema: getAgentResponseSchema('useExcalibur', this.i18n.translate('setup.languageName')) },
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
            },
            'useExcalibur',
            onChunk as (chunk: string, field: string, metadata?: LLMUsageMetadata) => void
        );
        return result;
    }

    async useLadyOfTheLake(context: LadyContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ targetId: string; thought?: string; reasoning?: string; self_check?: string; situation_assessment?: string; action_strategy?: string; promptText?: string; retryLogs?: string[] }> {
        const validIds = new Set(Object.keys(context.playerNames));
        const nameToId = new Map(Object.entries(context.playerNames).map(([id, name]) => [name, id]));

        const prompt = this.buildPrompt(
            context,
            'useLadyOfTheLake',
            ...getUseLadyOfTheLakePrompt(context)
        );

        const result = await this.queryLLMWithValidation<{ targetId: string; situation_assessment: string; action_strategy: string; reasoning: string; self_check: string; thought?: string }>(
            prompt,
            { responseSchema: getAgentResponseSchema('useLadyOfTheLake', this.i18n.translate('setup.languageName')) },
            (parsed) => {
                if (!parsed.targetId) return 'Must provide targetId.';

                // Allow models to return player names instead of IDs
                if (!validIds.has(parsed.targetId) && nameToId.has(parsed.targetId)) {
                    parsed.targetId = nameToId.get(parsed.targetId)!;
                }

                if (parsed.targetId === this.id) return 'Cannot inspect yourself.';
                if (!validIds.has(parsed.targetId)) return `Invalid target player ID: ${parsed.targetId}. Valid: ${Array.from(validIds).join(', ')}`;

                return null;
            },
            'useLadyOfTheLake',
            onChunk as (chunk: string, field: string, metadata?: LLMUsageMetadata) => void
        );
        return result;
    }

    async updateNote(context: NoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<string> {
        const prompt = this.buildPrompt(
            context,
            'updateNote',
            ...getUpdateNotePrompt(context, this.myRole!, this.note, this.history, this.i18n, this.visiblePlayers, this.intelSummary)
        );

        const result = await this.queryLLMWithValidation<{ newNote: string; situation_assessment: string; action_strategy: string; reasoning: string; self_check: string; thought?: string }>(
            prompt,
            { responseSchema: getAgentResponseSchema('updateNote', this.i18n.translate('setup.languageName')) },
            (parsed) => {
                if (!parsed.newNote || typeof parsed.newNote !== 'string') return 'Response must contain newNote (string).';
                return null;
            },
            'updateNote',
            onChunk as (chunk: string, field: string, metadata?: LLMUsageMetadata) => void
        );

        this.note = result.newNote;
        this.noteHistory.push({ round: context.round, note: this.note });

        // Clear history after consolidation into Note — prevents context explosion
        // Only done upon SUCCESSFUL update to avoid memory loss on API error
        this.history = [];

        return this.note;
    }

    async shareGameReflection(context: GameReflectionContext, onChunk?: (chunk: string, field: 'reflection' | 'self_check' | 'reasoning' | 'situation_assessment' | 'action_strategy') => void): Promise<{ reflection: string; self_check?: string; reasoning?: string; situation_assessment?: string; action_strategy?: string; thought?: string; promptText?: string; retryLogs?: string[] }> {
        // Collect Assassination Discussion as "Events This Round"
        const assassinationEvents = context.allEvents.filter(e => e.type === 'DISCUSSION' && e.phase === 'ASSASSINATION_DISCUSSION');

        // Create a base context for buildPrompt
        const baseCtx: BaseGameContext = {
            round: context.round + 1, // Ensure voting history includes the last round
            missionHistory: context.missions,
            roundEvents: assassinationEvents,
            playerIds: context.playerRoles.map(p => p.id),
            playerNames: context.playerNames,
            consecutiveFailedVotes: 0, // Game over
            currentMissionSize: 0, // Game over
            allEvents: context.allEvents,
            rolesInGame: context.rolesInGame,
            twoFailsRequiredInRound4: context.playerCount >= 7,
            playerCount: context.playerCount,
            hasSignaledThisRound: false
        };

        const instruction = getShareGameReflectionPrompt(context, this.myRole!, this.name, this.id, this.note, this.i18n);
        const prompt = this.buildPrompt(baseCtx, 'shareGameReflection', instruction);

        const result = await this.queryLLMWithValidation<{ reflection: string; self_check: string; reasoning: string; situation_assessment: string; action_strategy: string; thought?: string }>(
            prompt,
            {
                responseSchema: getAgentResponseSchema('shareGameReflection', this.i18n.translate('setup.languageName'))
            },
            (parsed) => {
                if (!parsed.reflection || typeof parsed.reflection !== 'string') return 'Response must contain reflection (string).';
                return null;
            },
            'shareGameReflection',
            onChunk as (chunk: string, field: string, metadata?: LLMUsageMetadata) => void
        );

        return {
            reflection: result.reflection,
            self_check: result.self_check,
            reasoning: result.reasoning,
            situation_assessment: result.situation_assessment,
            action_strategy: result.action_strategy,
            thought: result.thought,
            promptText: prompt,
            retryLogs: result.retryLogs
        };
    }

    // =========================================================================
    //  Private Helpers
    // =========================================================================

    /**
     * Build a prompt with standard preamble: identity + base game context + note + body sections.
     * All phase methods should use this to ensure consistent context injection.
     */
    public buildPrompt(ctx: BaseGameContext, actionName?: AgentActionName, ...sections: string[]): string {
        const teamInfo = ROLE_META[this.myRole!].team;
        const myTeamText = teamInfo === Team.Good ? 'Good (Blue)' : 'Evil (Red)';

        const identity = [
            `[PRIVATE DATA - IDENTITY]`,
            `- **Name**: ${this.name} (${this.id})`,
            `- **Team**: ${myTeamText}`,
            `- **Role**: ${this.i18n.translate(`roles.${this.myRole}`)} (${this.myRole})`,
            `- **Role Power**: ${this.roleInfo}`
        ].join('\n');

        const visibleInfo = [
            `[PRIVATE DATA - SECRET INTEL]`,
            `### Night Phase Intel`,
            this.visiblePlayers.length > 0
                ? `${this.visiblePlayers.map(p => `- ${p.name} (${p.id}): ${p.info}`).join('\n')}\n` +
                (this.intelSummary ? `\n${this.intelSummary}\n` : '') +
                `\n${this.i18n.translate('agent.night.factEmphasis')}` +
                `\n\n⚠️ **WARNING**: This is YOUR SECRET intel. NEVER quote it directly in discussion!`
                : `${this.i18n.translate('agent.night.noInfo', { role: this.i18n.translate(`roles.${this.myRole}`) })}`,
        ].join('\n');

        const noteBlock = [
            `[PRIVATE DATA - YOUR PERSONAL NOTE]`,
            `### Your Note`,
            this.note || '_empty_'
        ].join('\n');

        const analysisBlock = (this.lastAssessment || this.lastStrategy)
            ? [
                `[PRIVATE DATA - YOUR ANALYSIS LAST TIME YOU SPEAK]`,
                `### Latest Assessment`,
                this.lastAssessment || 'N/A',
                '',
                `### Latest Strategy`,
                this.lastStrategy || 'N/A'
            ].join('\n')
            : '';

        // Format base game context
        const goodWins = ctx.missionHistory.filter(m => m.succeeded).length;
        const evilWins = ctx.missionHistory.filter(m => !m.succeeded).length;

        // Build mission summary with private note for each mission
        const missionSummary = ctx.missionHistory.length > 0
            ? ctx.missionHistory.map(m => {
                const playerInTeam = m.teamIds.includes(this.id);
                let privateNote = '';
                if (playerInTeam) {
                    const teamInfo = ROLE_META[this.myRole!].team;
                    if (teamInfo === Team.Good) {
                        // Good players always play success
                        privateNote = `\n  > *(Private Note: you played **Success** in the mission)*`;
                    } else {
                        // For evil, show the actual mission result
                        const playedSuccess = m.agentPlays && m.agentPlays[this.id] !== undefined ? m.agentPlays[this.id] : m.succeeded;
                        const resultText = playedSuccess ? 'Success' : 'Fail';
                        privateNote = `\n  > *(Private Note: you played **${resultText}** in the mission)*`;
                    }
                }
                return `- Round ${m.round}: ${m.succeeded ? '✅Success' : '❌Fail'} (${m.failsCount} fails, team: ${m.teamIds.map(id => ctx.playerNames[id] || id).join(',')})${privateNote}`;
            }).join('\n')
            : 'No missions completed yet.';

        const roundEventsText = ctx.roundEvents.length > 0
            ? this.formatRoundHistory(ctx.roundEvents)
            : 'No events this round.';

        const playerRoster = Object.keys(ctx.playerNames)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(id => `${ctx.playerNames[id]} (${id})`)
            .join(', ');

        const roleCounts = ctx.rolesInGame.reduce((acc, role) => {
            acc[role] = (acc[role] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const goodCount = ctx.rolesInGame.filter(r => ROLE_META[r].team === Team.Good).length;
        const evilCount = ctx.rolesInGame.filter(r => ROLE_META[r].team === Team.Evil).length;

        const rolesListText = Object.entries(roleCounts)
            .map(([role, count]) => `${this.i18n.translate(`roles.${role as Role}`)} x ${count}`)
            .join(', ') + ` (${this.i18n.translate('setup.good')}: ${goodCount}, ${this.i18n.translate('setup.evil')}: ${evilCount})`;

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
            `[PUBLIC DATA - COMMON KNOWLEDGE]`,
            `### Game State`,
            `- **Roles**: ${rolesListText}`,
            `- **Players**: ${playerRoster}`,
            `- **Score**: Good ${goodWins} vs Evil ${evilWins}`,
            `- **Progress**: Current Round ${ctx.round} | Failed votes: ${ctx.consecutiveFailedVotes}/5`,
            ...(matchPointWarning ? [`- ⚠️ **Warning**: ${matchPointWarning}`] : []),
            ...(twoFailsWarning ? [`- ⚠️ **Warning**: ${twoFailsWarning}`] : []),
            '',
            `#### Mission History`,
            missionSummary,
            '',
            `#### Voting History`,
            this.formatVotingHistory(ctx.allEvents, ctx.playerNames),
            '',
            `#### Events This Round (Current Round: ${ctx.round})`,
            roundEventsText
        ].join('\n');


        const actionInstructions = sections.filter(s => s !== '');

        if (actionName) {
            const lang = this.i18n.translate('setup.languageName');
            actionInstructions.push(getResponseFormatPrompt(actionName, lang));
        }

        return [
            identity,
            visibleInfo,
            noteBlock,
            analysisBlock,
            baseContext,
            actionInstructions.length > 0 ? `[CURRENT ACTION INSTRUCTIONS]` : '',
            ...actionInstructions
        ].filter(s => s !== '').join('\n\n');
    }



    /** Format GameEvent[] into a human-readable log. */
    private formatRoundHistory(events: GameEvent[]): string {
        return events.map(e => {
            switch (e.type) {
                case 'DISCUSSION': {
                    const msg = e.message?.trim();
                    let privateNote = '';
                    if (e.privateNotes && e.privateNotes[this.id]) {
                        privateNote = `\n  ${e.privateNotes[this.id]}`;
                    }
                    if (!msg && !privateNote) return ''; // Skip empty messages (when passing without speech)
                    const chatLog = msg ? `- **[Chat] ${e.playerName}${e.playerId == this.id ? ' (You)' : ''}**: ${msg}` : '';
                    return chatLog + privateNote;
                }
                case 'TEAM_PROPOSAL': return `- **[Proposal] ${e.leaderName}${e.leaderId == this.id ? ' (You)' : ''}** proposed: ${e.teamNames.join(', ')}`;
                case 'VOTE_RESULTS': {
                    const teamStr = e.teamNames ? `(Team: ${e.teamNames.join(', ')}) ` : '';
                    return `- **[Vote] ${e.passed ? 'PASSED' : 'REJECTED'}**. ${teamStr}${e.votes.map(v => `${v.name}${v.name == this.name ? ' (You)' : ''}: ${v.approve ? 'O' : 'X'}`).join(', ')}`;
                }
                case 'MISSION_OUTCOME': {
                    return `- **[Mission] ${e.succeeded ? 'SUCCESS' : 'FAIL'}** (fails: ${e.failsCount})`;
                }
                case 'SYSTEM': {
                    return `- **[System]** ${e.message}`;
                }
                default: return '';
            }
        }).filter(s => s !== '').join('\n');
    }

    /** Format full voting history for previous rounds in a compact way. */
    private formatVotingHistory(events: GameEvent[], playerNames: Record<string, string>): string {
        const history: string[] = [];
        let voteAttempt = 1;

        for (const e of events) {
            if ('round' in e && e.round !== undefined) {
                if (e.type === 'TEAM_PROPOSAL') {
                    const teamStr = e.teamIds.map(id => playerNames[id] || id).join(',');
                    history.push(`R${e.round}-V${voteAttempt}: Leader(${e.leaderName}) proposed [${teamStr}]`);
                } else if (e.type === 'VOTE_RESULTS') {
                    // Find the corresponding proposal in the history array by searching backwards
                    const targetStr = `R${e.round}-V${voteAttempt}`;
                    for (let i = history.length - 1; i >= 0; i--) {
                        if (history[i].startsWith(targetStr)) {
                            const votesStr = e.votes.map(v => `${v.name}:${v.approve ? 'O' : 'X'}`).join(',');
                            const teamStr = e.teamNames ? ` [Team: ${e.teamNames.join(',')}]` : '';
                            history[i] += ` -> ${e.passed ? 'PASSED' : 'REJECTED'}${teamStr} (Votes: ${votesStr})`;
                            break;
                        }
                    }
                    voteAttempt++;
                } else if (e.type === 'MISSION_OUTCOME') {
                    voteAttempt = 1;
                    history.push(`R${e.round}-RESULT: ${e.succeeded ? 'SUCCESS' : 'FAIL'} (fails: ${e.failsCount})`);
                }
            }
        }

        return history.length > 0 ? history.join('\n') : 'No previous voting history.';
    }

    /** Format full game event history for assassination review. */
    public formatFullGameHistory(events: GameEvent[]): string {
        return events.map(e => {
            switch (e.type) {
                case 'ROUND_START': return `\n### Round ${e.round}\n`;
                case 'DISCUSSION': {
                    let privateNote = '';
                    if (e.privateNotes && e.privateNotes[this.id]) {
                        privateNote = `\n  ${e.privateNotes[this.id]}`;
                    }
                    return `- **[Chat] ${e.playerName}**: ${e.message}${privateNote}`;
                }
                case 'TEAM_PROPOSAL': return `- **[Proposal] ${e.leaderName}** proposed: ${e.teamNames.join(', ')}`;
                case 'VOTE_RESULTS': {
                    const teamStr = e.teamNames ? ` (Team: ${e.teamNames.join(', ')})` : '';
                    return `- **[Vote R${e.round}] ${e.passed ? 'PASSED' : 'REJECTED'}**. ${teamStr} | ${e.votes.map(v => `${v.name}:${v.approve ? 'O' : 'X'}`).join(', ')}`;
                }
                case 'MISSION_OUTCOME': return `- **[Mission R${e.round}] ${e.succeeded ? 'SUCCESS' : 'FAIL'}** (fails: ${e.failsCount}, team: ${e.teamNames.join(', ')})`;
                case 'SYSTEM': return `- **[System]** ${e.message}`;
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
        actionName: string,
        onFieldChunk?: (chunk: string, field: string, metadata?: LLMUsageMetadata) => void
    ): Promise<T & { thought?: string, retryLogs?: string[] }> {
        const llmConfig = await this.getConfig();
        const provider = await this.getProvider(llmConfig);
        const contents: LLMContent[] = [{ role: 'user', parts: [{ text: prompt }] }];
        const retryLogs: string[] = [];

        this._isThinking.set(true);
        let lastError = '';
        try {
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                // Signal UI to clear any partial output from previous failed attempt
                if (onFieldChunk && attempt > 0) {
                    onFieldChunk('', 'speech');
                    onFieldChunk('', 'thought');
                    onFieldChunk('', 'reasoning');
                    onFieldChunk('', 'situation_assessment');
                    onFieldChunk('', 'action_strategy');
                    onFieldChunk('', 'self_check');
                    onFieldChunk('', 'reflection');
                }

                const { fullText: responseText, thoughtText } = await this.streamLLM(provider, llmConfig, contents, config, onFieldChunk, retryLogs);

                // Append model's response to conversation history (internal to this query session)
                contents.push({ role: 'model', parts: [{ text: responseText }] });

                try {
                    const parsed = parse(responseText) as T;
                    const error = validate(parsed);
                    if (!error) {
                        // Store internal thoughts for context maintenance
                        const anyParsed = parsed as any;
                        if (anyParsed.situation_assessment) this.lastAssessment = anyParsed.situation_assessment;
                        if (anyParsed.action_strategy) this.lastStrategy = anyParsed.action_strategy;
                        return { ...parsed, thought: thoughtText, retryLogs: retryLogs.length > 0 ? retryLogs : undefined };
                    }

                    // Invalid — append correction and retry
                    lastError = error;
                    const logMsg = `Validation failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${error}`;
                    console.warn(`[LLMAgent:${this.name}] ${logMsg}`);
                    retryLogs.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);

                    contents.push({
                        role: 'user',
                        parts: [
                            {
                                text: `Invalid response: ${error}\nPlease retry with the exact format required.`,
                            },
                        ],
                    });
                } catch (e) {
                    // JSON parse failure — append correction
                    lastError = (e as Error).message || 'JSON parse failed';
                    const logMsg = `JSON parse failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError}`;
                    console.warn(`[LLMAgent:${this.name}] ${logMsg}`, e);
                    retryLogs.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);

                    contents.push({
                        role: 'user',
                        parts: [
                            {
                                text: `Your response is not valid JSON. Raw: "${responseText}"\nPlease retry with valid JSON only.`,
                            },
                        ],
                    });
                }
            }

            console.error(`[LLMAgent:${this.name}] All ${MAX_RETRIES + 1} attempts failed for prompt.`);
            throw new AgentFatalError(this.id, this.name, actionName, lastError);
        } finally {
            this._isThinking.set(false);
        }
    }

    /** Get the LLM config for this agent */
    private async getConfig(): Promise<LLMConfig> {
        if (this.configId) {
            const config = await this.llmManager.getConfigById(this.configId);
            if (config) return config;
        }
        throw new Error(`[LLMAgent:${this.name}] No config found for configId=${this.configId}`);
    }

    /** Get the LLM provider instance. */
    private async getProvider(config: LLMConfig) {
        const provider = this.llmManager.getProviderForConfig(config);
        if (!provider) throw new Error(`[LLMAgent] No provider available for ${config.provider}`);
        return provider;
    }

    /** Stream a response from the provider given a conversation. */
    private async streamLLM(provider: LLMProvider, config: LLMConfig, contents: LLMContent[], genConfig: LLMGenerateConfig, onFieldChunk?: (chunk: string, field: string, metadata?: LLMUsageMetadata) => void, retryLogs: string[] = []): Promise<{ fullText: string, thoughtText: string }> {
        let fullText = '';
        let thoughtText = '';
        let finalUsageMetadata: LLMUsageMetadata | undefined;
        let streamSucceeded = false;

        const llmConfig = config;
// ... (lines 918-937 intentionally omitted for brevity in chunk, but I MUST match the target)
        // Use baseUrl as the mutex key if available, otherwise fallback to provider name
        const mutexKey = llmConfig.settings?.baseUrl || llmConfig.provider || 'default';

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
                    if (attempt === 0) {
                        this.lastAssessment = '';
                        this.lastStrategy = '';
                    }
                    fullText = ''; // Reset on retry
                    thoughtText = ''; // Reset on retry
                    finalUsageMetadata = undefined; // Reset usage metadata on each retry attempt
                    streamSucceeded = false;
                    const stream = provider.generateContentStream(config.settings, contents, this.systemInstruction, genConfig);

                    // Simple state machine to extract fields during streaming
                    let currentField: string | null = null;
                    let escaped = false;
                    let lastReportedLength = 0;

                    for await (const chunk of stream) {
                        if (chunk.usageMetadata) {
                            finalUsageMetadata = chunk.usageMetadata;
                        }

                        if (chunk.text) {
                            if (chunk.thought) {
                                thoughtText += chunk.text;
                                if (onFieldChunk) onFieldChunk(chunk.text, 'thought', chunk.usageMetadata);
                                continue;
                            }

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
                                        const assessmentIndex = fullText.indexOf('"situation_assessment": "', lastReportedLength);
                                        const strategyIndex = fullText.indexOf('"action_strategy": "', lastReportedLength);
                                        const selfCheckIndex = fullText.indexOf('"self_check": "', lastReportedLength);

                                        let minIndex = Infinity;
                                        let field = '';
                                        let offset = 0;

                                        if (speechIndex !== -1 && speechIndex < minIndex) { minIndex = speechIndex; field = 'speech'; offset = 11; }
                                        if (messageIndex !== -1 && messageIndex < minIndex) { minIndex = messageIndex; field = 'message'; offset = 12; }
                                        if (reflectionIndex !== -1 && reflectionIndex < minIndex) { minIndex = reflectionIndex; field = 'reflection'; offset = 15; }
                                        if (reasoningIndex !== -1 && reasoningIndex < minIndex) { minIndex = reasoningIndex; field = 'reasoning'; offset = 14; }
                                        if (assessmentIndex !== -1 && assessmentIndex < minIndex) { minIndex = assessmentIndex; field = 'situation_assessment'; offset = 25; }
                                        if (strategyIndex !== -1 && strategyIndex < minIndex) { minIndex = strategyIndex; field = 'action_strategy'; offset = 20; }
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
                                            onFieldChunk(char, currentField === 'message' ? 'speech' : currentField, chunk.usageMetadata);
                                        } else {
                                            const c = char === 'n' ? '\n' : (char === 't' ? '\t' : char);
                                            onFieldChunk(c, currentField === 'message' ? 'speech' : currentField, chunk.usageMetadata);
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
                    streamSucceeded = true;

                    if (onFieldChunk && finalUsageMetadata) {
                        console.log('[llm-agent] Calling onFieldChunk with metadata:', finalUsageMetadata);
                        onFieldChunk('', currentField === 'message' ? 'speech' : (currentField || 'speech'), finalUsageMetadata);
                    }

                    break;

                } catch (e) {
                    const error = e as { status?: number, message?: string };
                    const errorMsg = error?.message || String(e);

                    const isTransient =
                        error?.status === 429 ||
                        error?.status === 503 ||
                        error?.status === 504 ||
                        errorMsg.includes('429') ||
                        errorMsg.includes('503') ||
                        errorMsg.includes('RESOURCE_EXHAUSTED') ||
                        errorMsg.includes('UNAVAILABLE') ||
                        errorMsg.includes('Incomplete JSON segment') || // Stream interrupted
                        errorMsg.includes('fetch failed');

                    if (isTransient && attempt < MAX_API_RETRIES) {
                        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
                        const logMsg = `[Transient Error] ${errorMsg}. Retrying in ${delayMs}ms... (attempt ${attempt + 1}/${MAX_API_RETRIES})`;
                        console.warn(`[LLMAgent:${this.name}] ${logMsg}`);
                        retryLogs.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                        continue;
                    }

                    // If not transient, or we ran out of retries, throw
                    throw e;
                }
            }

            // Only update token usage if the stream actually succeeded
            if (streamSucceeded && finalUsageMetadata) {
                await this.updateTokenUsage(finalUsageMetadata);
            }

            return { fullText, thoughtText };
        } finally {
            release();
        }
    }

    private async updateTokenUsage(metadata: LLMUsageMetadata): Promise<void> {
        this.tokenUsage.promptTokens += metadata.prompt || 0;
        this.tokenUsage.completionTokens += metadata.candidates || 0;
        this.tokenUsage.cachedTokens += metadata.cached || 0;

        try {
            const config = await this.getConfig();
            const provider = await this.getProvider(config);

            const models = provider.getAvailableModels(config.settings);
            const modelDef = models.find(m => m.id === config.settings.modelId);

            if (modelDef) {
                const rates = modelDef.getRates(metadata.prompt);
                const inputPrice = rates.input;
                const outputPrice = rates.output;
                const cachedPrice = rates.cached ?? rates.input

                const cost = ((metadata.prompt || 0) * inputPrice + (metadata.cached || 0) * cachedPrice + (metadata.candidates || 0) * outputPrice) / 1000000;
                this.tokenUsage.totalCost += cost;
            }
        } catch (e) {
            console.error(`[LLMAgent:${this.name}] Failed to update token cost`, e);
        }
    }
}
