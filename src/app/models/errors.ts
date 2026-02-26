/**
 * Error thrown when an agent fails to provide a valid response after all retries.
 * This should halt the game engine as it's a fatal state for a zoneless/autonomous game.
 */
export class AgentFatalError extends Error {
    constructor(
        public readonly agentId: string,
        public readonly agentName: string,
        public readonly action: string,
        public readonly lastErrorMessage: string
    ) {
        super(`Agent ${agentName} (${agentId}) failed to perform ${action}: ${lastErrorMessage}`);
        this.name = 'AgentFatalError';
    }
}
