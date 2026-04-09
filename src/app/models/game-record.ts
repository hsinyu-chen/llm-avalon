import { GameEvent } from './game-event';
import { GameOptions } from './game-state';

export interface GameRecordPlayer {
    id: string;
    name: string;
    role: string;
    team: string;
    modelName?: string;
    systemInstruction?: string;
}

export interface GameRecordTokenUsage {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalCost: number;
}

export interface GameRecord {
    id: string;
    createdAt: number;
    playerCount: number;
    players: GameRecordPlayer[];
    winner: string;
    isMerlinKilled: boolean;
    events: GameEvent[];
    options?: GameOptions;
    tokenUsage?: GameRecordTokenUsage;
}

/** Lightweight summary for the history list (no events payload). */
export type GameRecordSummary = Omit<GameRecord, 'events'>;
