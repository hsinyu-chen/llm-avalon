import { Role, Team } from './role';
import { MissionRecord, GameOptions } from './game-state';
import { GameEvent } from './game-event';

// =============================================================================
//  Base Context — shared by ALL agent methods (except NightPhaseInfo)
// =============================================================================

export interface BaseGameContext {
    /** Current game round (1-based) */
    round: number;
    /** All completed mission records */
    missionHistory: MissionRecord[];
    /** Events from the current round (proposals, votes, discussions, outcomes) */
    roundEvents: GameEvent[];
    /** Player ID → display name mapping */
    playerNames: Record<string, string>;
    /** How many consecutive votes have been rejected (0-4, 5 = Evil wins) */
    consecutiveFailedVotes: number;
    /** The fixed team size required for the current mission */
    currentMissionSize: number;
    /** Full game event history (all rounds) */
    allEvents: GameEvent[];
    /** Roles present in this game */
    rolesInGame: Role[];
    /** Whether Round 4 requires 2 fails (depends on player count >= 7) */
    twoFailsRequiredInRound4: boolean;
}

// =============================================================================
//  Night Phase (special — only called once at game start)
// =============================================================================

export interface NightPhaseInfo {
    myRole: Role;
    visiblePlayers: { id: string; name: string; info: string }[];
    playerCount: number;
    rolesInGame: Role[];
    options: GameOptions;
    missionSizes: number[];
    twoFailsRequiredInRound4: boolean;
}

// =============================================================================
//  Phase-Specific Contexts (extend BaseGameContext)
// =============================================================================

export interface TeamProposalContext extends BaseGameContext {
    teamSize: number;
    playerIds: string[];
}

export interface VoteContext extends BaseGameContext {
    proposedTeam: string[];
    leaderId: string;
    excaliburHolderId: string | null;
    chatLog: SpeechEntry[];
}

export interface MissionContext extends BaseGameContext {
    team: string[];
}

export interface SpeakContext extends BaseGameContext {
    phase: 'DISCUSSION' | 'MISSION_DEBRIEF' | 'OPENING' | 'ASSASSINATION_DISCUSSION';
    chatLog: SpeechEntry[];
    visibleAgentIds: string[];
    proposedTeam: string[];
    leaderId: string;
    discussionRound: number;
    /** Assassin's identity — only set during ASSASSINATION_DISCUSSION phase */
    assassinId?: string;
}

export interface AssassinContext extends BaseGameContext {
    goodPlayerIds: string[];
    /** Full game event log for assassination analysis */
    allEvents: GameEvent[];
}

export interface NoteContext extends BaseGameContext {
    playerCount: number;
    recentEvents: string[];
    personalNote: string;
}

export interface ExcaliburContext extends BaseGameContext {
    holderId: string;
    missionCardHolderIds: string[];
}

export interface LadyContext extends BaseGameContext {
    holderId: string;
    ladyHistory: { holderId: string; targetId: string; claim: string }[];
}

// =============================================================================
//  Game Reflection (special — only called once at game end)
// =============================================================================

export interface GameReflectionContext {
    round: number;
    winner: Team | null;
    playerCount: number;
    rolesInGame: Role[];
    missions: MissionRecord[];
    assassinTargetId?: string | null;
    isMerlinKilled: boolean;
    playerRoles: { id: string; role: Role }[];
    playerNames: Record<string, string>;
}

// =============================================================================
//  Speech Types
// =============================================================================

export interface SpeechEntry {
    playerId: string;
    name: string;
    message: string;
    timestamp: number;
}

export interface SpeechAct {
    self_check: string;
    reasoning: string;
    action: {
        speech: string;
        readyToVote: boolean;
    };
    promptText?: string;
}

// =============================================================================
//  Action Types for Agents
// =============================================================================

export interface MissionAction {
    self_check: string;
    reasoning: string;
    action: {
        playedMissionResult: boolean;
    };
    promptText?: string;
}

export interface VoteAction {
    self_check: string;
    reasoning: string;
    action: {
        voteChoice: boolean;
    };
    promptText?: string;
}
export interface ProposeTeamAction {
    self_check: string;
    reasoning: string;
    action: {
        teamMemberIds: string[];
    };
    promptText?: string;
}

export interface AssassinateAction {
    self_check: string;
    reasoning: string;
    action: {
        targetId: string;
    };
    promptText?: string;
}


// =============================================================================
//  Agent Interface
// =============================================================================

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalCost: number;
}

export interface IAgent {
    readonly id: string;
    readonly name: string;
    getPersonalNote(): string;
    getNoteHistory?(): { round: number; note: string }[];
    getNightInfo?(): string;
    getTokenUsage?(): TokenUsage;
    readonly modelName?: string;
    getIsThinking?(): boolean;

    onNightPhase(info: NightPhaseInfo): Promise<void>;
    proposeTeam(context: TeamProposalContext): Promise<ProposeTeamAction>;
    vote(context: VoteContext): Promise<VoteAction>;
    executeMission(context: MissionContext): Promise<MissionAction>;
    assassinate(context: AssassinContext): Promise<AssassinateAction>;
    speak(context: SpeakContext, onChunk?: (chunk: string, field: 'speech' | 'reasoning' | 'self_check') => void): Promise<SpeechAct>;
    shareGameReflection(context: GameReflectionContext, onChunk?: (chunk: string, field: 'reflection' | 'self_check') => void): Promise<{ reflection: string; promptText?: string }>;
    onSystemMessage(message: string): Promise<void>;
    useExcalibur(context: ExcaliburContext): Promise<string | null>;
    useLadyOfTheLake(context: LadyContext): Promise<string | null>;
    updateNote(context: NoteContext): Promise<string>;
}

