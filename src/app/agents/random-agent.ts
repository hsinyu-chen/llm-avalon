import { IAgent, NightPhaseInfo, TeamProposalContext, AssassinContext, SpeechAct, ExcaliburContext, NoteContext, ProposeTeamAction, VoteAction, MissionAction, AssassinateAction } from '../models/agent.interface';

export class RandomAgent implements IAgent {
    readonly modelName = 'Random';
    private note = '';
    private nightInfo = 'No night info';

    constructor(public readonly id: string, public readonly name: string) { }
    async shareGameReflection(): Promise<{ reflection: string; promptText?: string }> {
        return { reflection: "..." };
    }
    getPersonalNote(): string {
        return this.note;
    }

    getNightInfo(): string {
        return this.nightInfo;
    }

    async onNightPhase(info: NightPhaseInfo): Promise<void> {
        this.nightInfo = info.visiblePlayers.length > 0
            ? info.visiblePlayers.map(p => `- ${p.name} (${p.id}): ${p.info}`).join('\n')
            : 'No night info';
        console.log(`[Agent:${this.name}] Role: ${info.myRole}. Visible:`, info.visiblePlayers);
    }

    async proposeTeam(context: TeamProposalContext): Promise<ProposeTeamAction> {
        const shuffled = [...context.playerIds].sort(() => Math.random() - 0.5);
        return {
            self_check: 'Thinking...',
            reasoning: 'Randomly choosing players.',
            action: {
                teamMemberIds: shuffled.slice(0, context.teamSize)
            }
        };
    }

    async vote(): Promise<VoteAction> {
        // 60% chance to approve to keep the game moving
        const approve = Math.random() > 0.4;
        return {
            self_check: 'Thinking...',
            reasoning: 'Random choice.',
            action: {
                voteChoice: approve
            }
        };
    }

    async executeMission(): Promise<MissionAction> {
        // Simple logic: 30% fail rate (random evil behavior simulation)
        return {
            self_check: 'Thinking...',
            reasoning: 'Random choice.',
            action: {
                playedMissionResult: Math.random() > 0.3
            }
        };
    }

    async assassinate(context: AssassinContext): Promise<AssassinateAction> {
        const target = context.goodPlayerIds[Math.floor(Math.random() * context.goodPlayerIds.length)];
        return {
            self_check: 'Thinking...',
            reasoning: 'Random choice.',
            action: {
                targetId: target
            }
        };
    }

    async speak(): Promise<SpeechAct> {
        // 20% chance to pass
        if (Math.random() < 0.2) {
            return {
                self_check: '',
                reasoning: '',
                action: {
                    speech: '',
                    readyToVote: true
                }
            };
        }
        return {
            self_check: `I am ${this.name}`,
            reasoning: 'Randomly chatting',
            action: {
                speech: `我是 ${this.name}，我覺得... (Random chatter)`,
                readyToVote: false
            }
        };
    }


    async onSystemMessage(message: string): Promise<void> {
        console.log(`[RandomAgent ${this.name}] System Message: ${message}`);
    }

    async useExcalibur(context: ExcaliburContext): Promise<string | null> {
        // 50% chance to switch someone
        if (Math.random() < 0.5) return null;
        if (context.missionCardHolderIds.length === 0) return null;
        const target = context.missionCardHolderIds[Math.floor(Math.random() * context.missionCardHolderIds.length)];
        return target;
    }

    async useLadyOfTheLake(): Promise<string | null> {
        return null;
    }

    async updateNote(context: NoteContext): Promise<string> {
        console.log('[RandomAgent] Updating note for round', context.round);
        this.note = "Random Note";
        return this.note;
    }
}
