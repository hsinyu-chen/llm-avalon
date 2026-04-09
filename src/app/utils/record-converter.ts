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
        private tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalCost: 0 },
        private noteHistory: { round: number; note: string }[] = []
    ) { }

    getPersonalNote(): string { return this.personalNote; }
    getNoteHistory(): { round: number; note: string }[] { return this.noteHistory; }
    getTokenUsage(): TokenUsage { return this.tokenUsage; }

    // Replay agents don't perform actions
    async onNightPhase(info: NightPhaseInfo): Promise<void> { }
    async proposeTeam(context: TeamProposalContext): Promise<any> { return { action: { teamMemberIds: [] }, thought: '', reasoning: '' }; }
    async vote(context: VoteContext): Promise<any> { return { action: { voteChoice: false }, thought: '', reasoning: '' }; }
    async executeMission(context: MissionContext): Promise<any> { return { action: { playedMissionResult: true }, thought: '', reasoning: '' }; }
    async assassinate(context: AssassinContext): Promise<any> { return { action: { targetId: '' }, thought: '', reasoning: '' }; }
    async speak(context: SpeakContext): Promise<any> { return { action: { speech: '', readyToVote: true }, thought: '', reasoning: '' }; }
    async shareGameReflection(context: GameReflectionContext): Promise<any> { return { reflection: '', thought: '', reasoning: '' }; }
    async onSystemMessage(message: string): Promise<void> { }
    async useExcalibur(): Promise<any> { return { targetId: null, thought: '', reasoning: '' }; }
    async useLadyOfTheLake(): Promise<any> { return { targetId: '', thought: '', reasoning: '' }; }
    async updateNote(): Promise<string> { return this.personalNote; }
}

export function recordToGameState(record: GameRecord): GameState {
    // Collect note history from events for ReplayAgents
    const playerNoteHistories: Record<string, { round: number; note: string }[]> = {};
    record.events.forEach(e => {
        // Only collect from AGENT_NOTE_UPDATE events for the persistent history
        if (e.type === 'SYSTEM' && (e as any).subType === 'AGENT_NOTE_UPDATE' && e.privateNotes) {
            Object.entries(e.privateNotes).forEach(([playerId, note]) => {
                if (!playerNoteHistories[playerId]) playerNoteHistories[playerId] = [];
                const history = playerNoteHistories[playerId];
                const round = (e as any).round || 0;
                // Avoid duplicating if multiple updates happen for same round (though usually once)
                const last = history[history.length - 1];
                if (!last || last.note !== note || last.round !== round) {
                    history.push({ round, note: note || '' });
                }
            });
        }
    });

    const players: PlayerState[] = record.players.map(p => {
        const history = playerNoteHistories[p.id] || [];
        const latestNote = history.length > 0 ? history[history.length - 1].note : '';
        return {
            agent: new ReplayAgent(p.id, p.name, p.modelName, latestNote, { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalCost: 0 }, history),
            role: p.role as Role,
            team: p.team as Team
        };
    });

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
