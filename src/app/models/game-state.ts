import { IAgent } from './agent.interface';
import { Role, Team } from './role';
import { GamePhase, GameEvent } from './game-event';

export interface GameOptions {
    excalibur: boolean;
    lady: boolean;
    questVoting: boolean;
    plotCards: boolean;
}

export interface PlayerState {
    agent: IAgent;
    role: Role;
    team: Team;
}

export interface MissionRecord {
    round: number;
    leaderId: string;
    teamIds: string[];
    votes: Record<string, boolean>; // playerId -> approve
    results: boolean[];             // the actual cards played (anonymized)
    succeeded: boolean;
    failsCount: number;
}

export interface DiscussionState {
    roundNumber: number;          // current discussion round (1-based)
    maxRounds: number;            // safety cap (default 10)
    passedAgentIds: Set<string>;  // agents who have PASS-ed
}

export interface GameState {
    phase: GamePhase;
    players: PlayerState[];
    currentLeaderIndex: number;
    currentRound: number;           // 1-5
    consecutiveFailedVotes: number; // resets on successful vote (max 5)
    missions: MissionRecord[];
    proposedTeamIds: string[];
    discussion: DiscussionState | null;
    error?: string | null;  // <--- ADDED
    winner: Team | null;
    assassinTargetId: string | null;
    isMerlinKilled: boolean;

    // Module State
    rolesInGame: Role[];
    options?: GameOptions;
    excaliburHolder?: string | null; // Agent ID
    ladyHolder?: string | null;      // Agent ID
    ladyHistory?: { holderId: string; targetId: string }[];

    // Structured Log
    events: GameEvent[];
}
