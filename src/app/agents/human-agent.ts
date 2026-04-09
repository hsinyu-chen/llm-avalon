import { IAgent, NightPhaseInfo, TeamProposalContext, ProposeTeamAction, VoteContext, VoteAction, MissionContext, MissionAction, AssassinContext, AssassinateAction, SpeakContext, SpeechAct, GameReflectionContext, NoteContext, ExcaliburContext, LadyContext, TokenUsage, LLMUsageMetadata } from '../models/agent.interface';
import { HumanInteractionService } from '../services/human-interaction.service';

export class HumanAgent implements IAgent {
    readonly modelName = 'Human';
    private personalNote = '';
    private noteHistory: { round: number; note: string }[] = [];
    private nightInfoText = '';

    constructor(
        public readonly id: string,
        public readonly name: string,
        private interactionService: HumanInteractionService
    ) { }

    getPersonalNote(): string {
        return this.personalNote;
    }
    getNoteHistory(): { round: number; note: string }[] {
        return this.noteHistory;
    }

    getNightInfo(): string {
        return this.nightInfoText || 'No night info';
    }

    getTokenUsage(): TokenUsage {
        return { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalCost: 0 };
    }

    async onNightPhase(info: NightPhaseInfo): Promise<void> {
        // Collect night info to display in UI
        this.nightInfoText = info.intelSummary || '';
    }

    async proposeTeam(context: TeamProposalContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<ProposeTeamAction> {
        return new Promise((resolve) => {
            this.interactionService.requestAction({ type: 'propose', context, resolve });
        });
    }

    async vote(context: VoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<VoteAction> {
        return new Promise((resolve) => {
            this.interactionService.requestAction({ type: 'vote', context, resolve });
        });
    }

    async executeMission(context: MissionContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<MissionAction> {
        return new Promise((resolve) => {
            this.interactionService.requestAction({ type: 'mission', context, resolve });
        });
    }

    async assassinate(context: AssassinContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<AssassinateAction> {
        return new Promise((resolve) => {
            this.interactionService.requestAction({ type: 'assassinate', context, resolve });
        });
    }

    async speak(context: SpeakContext): Promise<SpeechAct> {
        return new Promise((resolve) => {
            this.interactionService.requestAction({ type: 'speak', context, resolve });
        });
    }

    async shareGameReflection(context: GameReflectionContext, onChunk?: (chunk: string, field: 'reflection' | 'thought' | 'self_check' | 'reasoning' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ reflection: string; thought?: string; self_check?: string; reasoning?: string; situation_assessment?: string; action_strategy?: string; promptText?: string; retryLogs?: string[] }> {
        return { reflection: 'Game ended.' };
    }

    async onSystemMessage(message: string): Promise<void> {
        console.log(`[HumanAgent] System Message: ${message}`);
    }

    async useExcalibur(context: ExcaliburContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ targetId: string | null; thought?: string; reasoning?: string; self_check?: string; situation_assessment?: string; action_strategy?: string; promptText?: string; retryLogs?: string[] }> {
        return { targetId: null, reasoning: 'Not implemented for Human' }; // TODO: Implement if needed
    }

    async useLadyOfTheLake(context: LadyContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ targetId: string; thought?: string; reasoning?: string; self_check?: string; situation_assessment?: string; action_strategy?: string; promptText?: string; retryLogs?: string[] }> {
        return { targetId: '', reasoning: 'Not implemented for Human' }; // TODO: Implement if needed
    }

    async updateNote(context: NoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<string> {
        this.personalNote = context.personalNote;
        this.noteHistory.push({ round: context.round, note: this.personalNote });
        return this.personalNote;
    }
}
