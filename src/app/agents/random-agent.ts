import { IAgent, NightPhaseInfo, TeamProposalContext, AssassinContext, SpeechAct, ExcaliburContext, LadyContext, NoteContext, ProposeTeamAction, VoteAction, MissionAction, AssassinateAction, HiddenSignal, SignalType, GameReflectionContext, LLMUsageMetadata, VoteContext, MissionContext, SpeakContext } from '../models/agent.interface';

export class RandomAgent implements IAgent {
    readonly modelName = 'Random';
    private note = '';
    private noteHistory: { round: number; note: string }[] = [];
    private nightInfo = 'No night info';

    constructor(public readonly id: string, public readonly name: string) { }
    async shareGameReflection(context: GameReflectionContext, onChunk?: (chunk: string, field: 'reflection' | 'thought' | 'self_check' | 'reasoning' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ reflection: string; self_check?: string; reasoning?: string; situation_assessment?: string; action_strategy?: string; thought?: string; promptText?: string }> {
        return {
            reflection: "The game was a chaotic sequence of random decisions. I feel indifferent about the outcome.",
            self_check: "Reflection generation complete.",
            reasoning: "Aggregated random events into a final summary.",
            situation_assessment: "The game has ended, so the situation is static.",
            action_strategy: "No further strategy needed.",
            thought: "Game over. Processing final states... Randomly assigned significance to round 3."
        };
    }
    getPersonalNote(): string {
        return this.note;
    }
    getNoteHistory(): { round: number; note: string }[] {
        return this.noteHistory;
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
        const selected = shuffled.slice(0, context.teamSize);
        return {
            self_check: "Ensuring team size is exactly " + context.teamSize,
            reasoning: `I chose ${selected.join(', ')} because their IDs appeared in a favorable random order.`,
            situation_assessment: "I have no data, so I'm assuming everyone is equally suspicious.",
            action_strategy: "Pick a random subset and hope for the best.",
            thought: "Shuffling player list... Seed: " + Math.random() + ". Selected indices: 0 to " + (context.teamSize - 1),
            action: {
                teamMemberIds: selected
            }
        };
    }

    async vote(context: VoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<VoteAction> {
        // 60% chance to approve to keep the game moving
        const approve = Math.random() > 0.4;
        return {
            self_check: "Confirmed vote choice is a boolean.",
            reasoning: approve ? "The team looks okay from a distance." : "I have a bad feeling about this random combination.",
            situation_assessment: "Votes are 50/50 in my mental model.",
            action_strategy: "Bias towards 'Yes' to avoid the 5th failed vote.",
            thought: "Generating random float... Result: " + Math.random() + ". Threshold: 0.4. Action: " + (approve ? 'Approve' : 'Reject'),
            action: {
                voteChoice: approve
            }
        };
    }

    async executeMission(context: MissionContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<MissionAction> {
        // Simple logic: 30% fail rate (random evil behavior simulation)
        const success = Math.random() > 0.3;
        return {
            self_check: "Mission result must be compatible with my team.",
            reasoning: success ? "Playing safe to build trust." : "Attempting to sabotage the mission quietly.",
            situation_assessment: "Mission outcome is crucial at this stage.",
            action_strategy: "Roll a d10. 1-3: Fail, 4-10: Success.",
            thought: "Simulating mission tension... Decision: " + (success ? "Success" : "Fail") + " based on probability distribution.",
            action: {
                playedMissionResult: success
            }
        };
    }

    async assassinate(context: AssassinContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<AssassinateAction> {
        const target = context.goodPlayerIds[Math.floor(Math.random() * context.goodPlayerIds.length)];
        return {
            self_check: "Target must be a known Good player.",
            reasoning: `I suspect ${target} is Merlin due to their uncanny random behavior.`,
            situation_assessment: "This is the final chance for Evil to win.",
            action_strategy: "Close eyes, spin around, and point at someone.",
            thought: "Targeting logic: uniform distribution over " + context.goodPlayerIds.length + " targets. Selected: " + target,
            action: {
                targetId: target
            }
        };
    }

    async speak(context: SpeakContext, onChunk?: (chunk: string, field: 'speech' | 'thought' | 'reasoning' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<SpeechAct> {
        // 20% chance to pass
        if (Math.random() < 0.2) {
            return {
                self_check: "Passing to observe others.",
                reasoning: "I don't have anything meaningful to add to the random noise.",
                situation_assessment: "Silence is golden.",
                action_strategy: "Skip turn.",
                thought: "Pass rolled. No speech generated.",
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
            reasoning: 'Randomly chatting to appear human-like.',
            situation_assessment: "Conversation is flowing randomly.",
            action_strategy: "Say something generic.",
            thought: "Constructing random sentence... Appending identity tag. Finalizing signal check.",
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

    async useExcalibur(context: ExcaliburContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ targetId: string | null; thought?: string; reasoning?: string; self_check?: string; situation_assessment?: string; action_strategy?: string }> {
        // 50% chance to switch someone
        if (Math.random() < 0.5 || context.missionCardHolderIds.length === 0) {
            return {
                targetId: null,
                reasoning: 'Decided not to use Excalibur.',
                thought: "Excalibur usage decision: opt-out.",
                situation_assessment: "The current results might be fine.",
                action_strategy: "Do nothing.",
                self_check: "Checked targetId is null."
            };
        }
        const target = context.missionCardHolderIds[Math.floor(Math.random() * context.missionCardHolderIds.length)];
        return {
            targetId: target,
            reasoning: `Randomly chose to flip ${target}'s card.`,
            thought: "Excalibur usage decision: targeting role check for " + target,
            situation_assessment: "Suspicion levels are randomized.",
            action_strategy: "Flip a card to cause chaos.",
            self_check: "Checked targetId is one of the holders."
        };
    }

    async useLadyOfTheLake(context: LadyContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ targetId: string; thought?: string; reasoning?: string; self_check?: string; situation_assessment?: string; action_strategy?: string }> {
        const potentialTargets = Object.keys(context.playerNames).filter(id => {
            const hasUsed = context.ladyHistory?.some(h => h.targetId === id) || false;
            return id !== this.id && !hasUsed;
        });

        const target = potentialTargets.length > 0
            ? potentialTargets[Math.floor(Math.random() * potentialTargets.length)]
            : Object.keys(context.playerNames).filter(id => id !== this.id)[0]; // Fallback

        return {
            targetId: target,
            reasoning: `Randomly chose to investigate ${target}.`,
            thought: "Lady usage: filtering potential targets... " + potentialTargets.length + " remaining. Selected: " + target,
            situation_assessment: "I need to know more about someone.",
            action_strategy: "Inspect a random player.",
            self_check: "Target is valid and not previously checked."
        };
    }

    async updateNote(context: NoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<string> {
        console.log('[RandomAgent] Updating note for round', context.round);
        this.note = "Random Note for round " + context.round;
        this.noteHistory.push({ round: context.round, note: this.note });
        return this.note;
    }
}
