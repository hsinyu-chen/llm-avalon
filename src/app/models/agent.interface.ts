import { Role, Team } from './role';
import { MissionRecord, GameOptions } from './game-state';
import { GameEvent } from './game-event';
import { LLMUsageMetadata } from '../services/llm/llm-provider';

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
    /** Ordered list of all player IDs (turn order for leader rotation) */
    playerIds: string[];
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
    /** Total number of players in the game */
    playerCount: number;
    /** Whether the agent has already used a hidden signal in this mission round */
    hasSignaledThisRound: boolean;
}

// =============================================================================
//  Night Phase (special — only called once at game start)
// =============================================================================

export interface NightPhaseInfo {
    myRole: Role;
    visiblePlayers: { id: string; name: string; info: string; team?: Team }[];
    playerCount: number;
    rolesInGame: Role[];
    options: GameOptions;
    missionSizes: number[];
    twoFailsRequiredInRound4: boolean;
    intelSummary?: string;
    hasSignaledThisRound: boolean;
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
    /** The maximum number of discussion rounds allowed for this phase */
    maxDiscussionRounds: number;
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
    ladyHistory?: { holderId: string; targetId: string; result: boolean; claim?: string }[];
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
    allEvents: GameEvent[];
}

// =============================================================================
//  Speech Types
// =============================================================================

export enum SignalType {
    Wink = 'wink',
    Frown = 'frown',
    None = 'none'
}

export interface HiddenSignal {
    target: string; // Use 'none' if no signal
    signal: SignalType; // Use SignalType.None if no signal
}

export interface SpeechEntry {
    playerId: string;
    name: string;
    message: string;
    timestamp: number;
}

export interface SpeechAct {
    self_check: string;
    reasoning: string;
    situation_assessment: string;
    action_strategy: string;
    action: {
        speech: string;
        readyToVote: boolean;
        pass_hidden_signal: HiddenSignal;
    };
    promptText?: string;
    retryLogs?: string[];
}

// =============================================================================
//  Action Types for Agents
// =============================================================================

export interface MissionAction {
    self_check: string;
    reasoning: string;
    situation_assessment: string;
    action_strategy: string;
    action: {
        playedMissionResult: boolean;
    };
    promptText?: string;
    retryLogs?: string[];
}

export interface VoteAction {
    self_check: string;
    reasoning: string;
    situation_assessment: string;
    action_strategy: string;
    action: {
        voteChoice: boolean;
    };
    promptText?: string;
    retryLogs?: string[];
}
export interface ProposeTeamAction {
    self_check: string;
    reasoning: string;
    situation_assessment: string;
    action_strategy: string;
    action: {
        teamMemberIds: string[];
    };
    promptText?: string;
    retryLogs?: string[];
}

export interface AssassinateAction {
    self_check: string;
    reasoning: string;
    situation_assessment: string;
    action_strategy: string;
    action: {
        targetId: string;
    };
    promptText?: string;
    retryLogs?: string[];
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
    getLastAssessment?(): string;
    getLastStrategy?(): string;

    onNightPhase(info: NightPhaseInfo): Promise<void>;
    proposeTeam(context: TeamProposalContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<ProposeTeamAction>;
    vote(context: VoteContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<VoteAction>;
    executeMission(context: MissionContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<MissionAction>;
    assassinate(context: AssassinContext, onChunk?: (chunk: string, field: 'reasoning' | 'thought' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<AssassinateAction>;
    speak(context: SpeakContext, onChunk?: (chunk: string, field: 'speech' | 'thought' | 'reasoning' | 'self_check' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<SpeechAct>;
    shareGameReflection(context: GameReflectionContext, onChunk?: (chunk: string, field: 'reflection' | 'thought' | 'self_check' | 'reasoning' | 'situation_assessment' | 'action_strategy', metadata?: LLMUsageMetadata) => void): Promise<{ reflection: string; self_check?: string; reasoning?: string; situation_assessment?: string; action_strategy?: string; promptText?: string; retryLogs?: string[] }>;
    onSystemMessage(message: string): Promise<void>;
    useExcalibur(context: ExcaliburContext): Promise<string | null>;
    useLadyOfTheLake(context: LadyContext): Promise<string | null>;
    updateNote(context: NoteContext): Promise<string>;
}

