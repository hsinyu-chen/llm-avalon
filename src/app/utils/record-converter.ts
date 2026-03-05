import { GameRecord } from '../models/game-record';
import { GameState, PlayerState, MissionRecord } from '../models/game-state';
import { GamePhase } from '../models/game-event';
import { Team, Role } from '../models/role';
import { IAgent, TokenUsage, NightPhaseInfo, TeamProposalContext, VoteContext, MissionContext, AssassinContext, SpeakContext, GameReflectionContext } from '../models/agent.interface';
import { LLMUsageMetadata } from '../services/llm/llm-provider';

export class ReplayAgent implements IAgent {
    constructor(
        public readonly id: string,
        public readonly name: string,
        public readonly modelName?: string,
        private personalNote: string = '',
        private tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalCost: 0 }
    ) { }

    getPersonalNote(): string { return this.personalNote; }
    getTokenUsage(): TokenUsage { return this.tokenUsage; }

    // Replay agents don't perform actions
    async onNightPhase(info: NightPhaseInfo): Promise<void> { }
    async proposeTeam(context: TeamProposalContext): Promise<any> { return null; }
    async vote(context: VoteContext): Promise<any> { return null; }
    async executeMission(context: MissionContext): Promise<any> { return null; }
    async assassinate(context: AssassinContext): Promise<any> { return null; }
    async speak(context: SpeakContext): Promise<any> { return null; }
    async shareGameReflection(context: GameReflectionContext): Promise<any> { return null; }
    async onSystemMessage(message: string): Promise<void> { }
    async useExcalibur(): Promise<any> { return null; }
    async useLadyOfTheLake(): Promise<any> { return null; }
    async updateNote(): Promise<string> { return this.personalNote; }
}

export function recordToGameState(record: GameRecord): GameState {
    const players: PlayerState[] = record.players.map(p => ({
        agent: new ReplayAgent(p.id, p.name, p.modelName),
        role: p.role as Role,
        team: p.team as Team
    }));

    // Extract missions from events
    const missions: MissionRecord[] = [];
    record.events.forEach(e => {
        if (e.type === 'MISSION_OUTCOME') {
            missions.push({
                round: e.round,
                leaderId: '', // Not strictly needed for replay scoreboard
                teamIds: [],  // Not stored in MISSION_OUTCOME event directly
                votes: {},    // Not stored in MISSION_OUTCOME event directly
                results: [],  // Not stored in MISSION_OUTCOME event directly
                succeeded: e.succeeded,
                failsCount: e.failsCount,
            });
        }
    });

    // Sort missions by round to be safe
    missions.sort((a, b) => a.round - b.round);

    return {
        phase: GamePhase.GameOver,
        players,
        currentLeaderIndex: 0, // Not strictly needed for replay but required by interface
        currentRound: record.events.filter(e => e.type === 'ROUND_START').length || 1,
        consecutiveFailedVotes: 0,
        missions,
        proposedTeamIds: [],
        discussion: null,
        winner: record.winner as Team,
        assassinTargetId: null,
        isMerlinKilled: record.isMerlinKilled,
        rolesInGame: players.map(p => p.role),
        options: record.options,
        events: record.events,
        perspectiveId: null // Replay is God View
    };
}
