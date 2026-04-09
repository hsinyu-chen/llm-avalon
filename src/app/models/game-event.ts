import { Team } from './role';

export enum GamePhase {
    Setup = 'SETUP',
    Night = 'NIGHT',               // role reveal
    Opening = 'OPENING',           // self introduction (new)
    TeamProposal = 'TEAM_PROPOSAL',
    Discussion = 'DISCUSSION',     // multi-round discussion (Phase A)
    Vote = 'VOTE',
    Mission = 'MISSION',
    MissionDebrief = 'MISSION_DEBRIEF',  // post-mission discussion (Phase D)
    AssassinationDiscussion = 'ASSASSINATION_DISCUSSION',  // pre-assassination debate
    Assassination = 'ASSASSINATION',
    GameDebrief = 'GAME_DEBRIEF',      // post-game reflection
    GameOver = 'GAME_OVER',
}

export interface BaseGameEvent {
    status?: 'pending' | 'success' | 'error';
    error?: string;
    isThinking?: boolean;
    promptText?: string;
    retryLogs?: string[];
    privateNotes?: Record<string, string>; // PlayerID -> Note content
    promptSpeed?: number;
    completionSpeed?: number;
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
    cost?: number;
}

export type GameEvent =
    | (BaseGameEvent & { type: 'ROUND_START'; round: number })
    | (BaseGameEvent & { type: 'PHASE_CHANGE'; phase: GamePhase; round: number; failedVotes?: number })
    | (BaseGameEvent & { type: 'DISCUSSION'; round: number; failedVotes?: number; discussionRound?: number; phase?: string; playerId: string; playerName: string; message: string; timestamp: number; self_check?: string; reasoning?: string; thought?: string; situation_assessment?: string; action_strategy?: string; hiddenSignalTargetId?: string })
    | (BaseGameEvent & { type: 'TEAM_PROPOSAL'; round: number; failedVotes?: number; leaderId: string; leaderName: string; teamIds: string[]; teamNames: string[]; reasoning?: string; thought?: string; self_check?: string; situation_assessment?: string; action_strategy?: string })
    | (BaseGameEvent & { type: 'VOTE_RESULTS'; round: number; failedVotes?: number; votes: { name: string; approve: boolean; reasoning?: string; self_check?: string; thought?: string; situation_assessment?: string; action_strategy?: string; promptText?: string; retryLogs?: string[] }[]; passed: boolean; failCount: number; teamNames?: string[] })
    | (BaseGameEvent & { type: 'MISSION_OUTCOME'; round: number; teamNames: string[]; teamMembers?: { name: string; role: string; team: Team; playedSuccess?: boolean }[]; failsCount: number; succeeded: boolean; reasonings?: { name: string; reasoning: string; self_check?: string; thought?: string; situation_assessment?: string; action_strategy?: string; promptText?: string; retryLogs?: string[] }[] })
    | (BaseGameEvent & { type: 'SYSTEM'; message: string; subType?: string; icon?: string; round?: number; failedVotes?: number; discussionRound?: number; phase?: string; attempt?: number; self_check?: string; reasoning?: string; thought?: string; situation_assessment?: string; action_strategy?: string })
    | (BaseGameEvent & { type: 'ASSASSINATION'; round: number; playerId: string; playerName: string; message: string; icon?: string; targetId: string; targetName: string; self_check?: string; reasoning?: string; thought?: string; situation_assessment?: string; action_strategy?: string; hiddenSignalTargetId?: string })
    | (BaseGameEvent & { type: 'GAME_OVER'; winner: Team; reason: string })
    | (BaseGameEvent & { type: 'GAME_DEBRIEF'; round: number; playerId: string; playerName: string; message: string; timestamp: number; self_check?: string; reasoning?: string; thought?: string; situation_assessment?: string; action_strategy?: string; discussionRound?: number });
