import { IAgent, NightPhaseInfo, TeamProposalContext, AssassinContext, SpeechAct, ExcaliburContext, LadyContext, NoteContext, ProposeTeamAction, VoteAction, MissionAction, AssassinateAction, HiddenSignal, SignalType, GameReflectionContext, LLMUsageMetadata, VoteContext, MissionContext, SpeakContext } from '../models/agent.interface';

export class RandomAgent implements IAgent {
    readonly modelName = 'Random';
    private note = '';
    private nightInfo = 'No night info';

    constructor(public readonly id: string, public readonly name: string) { }
    async shareGameReflection(context: GameReflectionContext, onChunk?: (chunk: string, field: 'reflection' | 'thought' | 'self_check' | 'reasoning' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ reflection: string; self_check?: string; reasoning?: string; situation_assessment?: string; action_strategy?: string; promptText?: string }> {
        return { reflection: "...", situation_assessment: "...", action_strategy: "..." };
    }
    getPersonalNote(): string {
        return this.note;
    }

    getNightInfo(): string {
        return this.nightInfo;
    }
    getLastAssessment(): string { return 'Random assessment'; }
    getLastStrategy(): string { return 'Random strategy'; }

    async onNightPhase(info: NightPhaseInfo): Promise<void> {
        this.nightInfo = info.visiblePlayers.length > 0
            ? info.visiblePlayers.map(p => `- ${p.name} (${p.id}): ${p.info}`).join('\n')
            : 'No night info';
        console.log(`[Agent:${this.name}] Role: ${info.myRole}. Visible:`, info.visiblePlayers);
    }

    async proposeTeam(context: TeamProposalContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<ProposeTeamAction> {
        const shuffled = [...context.playerIds].sort(() => Math.random() - 0.5);
        return {
            self_check: 'Thinking...',
            reasoning: 'Randomly choosing players.',
            situation_assessment: 'Random assessment.',
            action_strategy: 'Random strategy.',
            action: {
                teamMemberIds: shuffled.slice(0, context.teamSize)
            }
        };
    }

    async vote(context: VoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<VoteAction> {
        // 60% chance to approve to keep the game moving
        const approve = Math.random() > 0.4;
        return {
            self_check: 'Thinking...',
            reasoning: 'Random choice.',
            situation_assessment: 'Random assessment.',
            action_strategy: 'Random strategy.',
            action: {
                voteChoice: approve
            }
        };
    }

    async executeMission(context: MissionContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<MissionAction> {
        // Simple logic: 30% fail rate (random evil behavior simulation)
        return {
            self_check: 'Thinking...',
            reasoning: 'Random choice.',
            situation_assessment: 'Random assessment.',
            action_strategy: 'Random strategy.',
            action: {
                playedMissionResult: Math.random() > 0.3
            }
        };
    }

    async assassinate(context: AssassinContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<AssassinateAction> {
        const target = context.goodPlayerIds[Math.floor(Math.random() * context.goodPlayerIds.length)];
        return {
            self_check: 'Thinking...',
            reasoning: 'Random choice.',
            situation_assessment: 'Random assessment.',
            action_strategy: 'Random strategy.',
            action: {
                targetId: target
            }
        };
    }

    async speak(context: SpeakContext, onChunk?: (chunk: string, field: 'speech' | 'thought' | 'reasoning' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<SpeechAct> {
        // 20% chance to pass
        if (Math.random() < 0.2) {
            return {
                self_check: '',
                reasoning: '',
                situation_assessment: '',
                action_strategy: '',
                action: {
                    speech: '',
                    readyToVote: true,
                    pass_hidden_signal: { target: 'none', signal: SignalType.None }
                }
            };
        }

        const signalRoll = Math.random();
        let hiddenSignal: HiddenSignal = { target: 'none', signal: SignalType.None };
        if (signalRoll < 0.3) {
            const players = Object.keys(context.playerNames || {}).filter(id => id !== this.id);
            if (players.length > 0) {
                hiddenSignal = {
                    target: players[Math.floor(Math.random() * players.length)],
                    signal: Math.random() > 0.5 ? SignalType.Wink : SignalType.Frown
                };
            }
        }

        return {
            self_check: `I am ${this.name}`,
            reasoning: 'Randomly chatting',
            situation_assessment: 'Random assessment.',
            action_strategy: 'Random strategy.',
            action: {
                speech: `I'm ${this.name}, just testing the system without any logic`,
                readyToVote: false,
                pass_hidden_signal: hiddenSignal
            }
        };
    }


    async onSystemMessage(message: string): Promise<void> {
        console.log(`[RandomAgent ${this.name}] System Message: ${message}`);
    }

    async useExcalibur(context: ExcaliburContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<string | null> {
        // 50% chance to switch someone
        if (Math.random() < 0.5) return null;
        if (context.missionCardHolderIds.length === 0) return null;
        const target = context.missionCardHolderIds[Math.floor(Math.random() * context.missionCardHolderIds.length)];
        return target;
    }

    async useLadyOfTheLake(context: LadyContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<string | null> {
        return null;
    }

    async updateNote(context: NoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<string> {
        console.log('[RandomAgent] Updating note for round', context.round);
        this.note = "Random Note";
        return this.note;
    }
}
