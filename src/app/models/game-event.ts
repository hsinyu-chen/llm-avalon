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

// --- Event Types for Timeline ---
export type GameEvent =
    | { type: 'ROUND_START'; round: number }
    | { type: 'PHASE_CHANGE'; phase: GamePhase; round: number }
    | { type: 'DISCUSSION'; round: number; playerId: string; playerName: string; message: string; timestamp: number; self_check?: string; reasoning?: string; isThinking?: boolean; promptText?: string }
    | { type: 'TEAM_PROPOSAL'; round: number; leaderId: string; leaderName: string; teamIds: string[]; teamNames: string[]; reasoning?: string; isThinking?: boolean; promptText?: string }
    | { type: 'VOTE_RESULTS'; round: number; votes: { name: string; approve: boolean; reasoning?: string; promptText?: string }[]; passed: boolean; failCount: number; promptText?: string }
    | { type: 'MISSION_OUTCOME'; round: number; teamNames: string[]; teamMembers?: { name: string; role: string; team: Team }[]; failsCount: number; succeeded: boolean; reasonings?: { name: string; reasoning: string; promptText?: string }[]; promptText?: string }
    | { type: 'SYSTEM'; message: string; icon?: string; round?: number; promptText?: string } // e.g., Excalibur used
    | { type: 'GAME_OVER'; winner: Team; reason: string; promptText?: string }
    | { type: 'GAME_DEBRIEF'; playerId: string; playerName: string; message: string; timestamp: number; isThinking?: boolean; promptText?: string };
