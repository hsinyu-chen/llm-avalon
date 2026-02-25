export function getCommunicationChannelsPrompt(): string {
    return `## Communication Channels
- **PUBLIC CHAT**: Used in discussion phases. Every message you send is visible to ALL players.
- **PRIVATE NOTE**: Your persistent long-term memory. Only YOU see this.
- **SECRET INTEL**: Your role, identity of other players revealed at night, and findings from expansions like Lady of the Lake. Only YOU see this.

⚠️ **WARNING**: NEVER reveal your role or secret intel in public chat. Use public information (votes, mission results, behaviors) as the basis for your arguments. If you are Evil, you must carefully lie to blend in.`;
}
