import { TeamProposalContext } from '../../models/agent.interface';

export function getProposeTeamPrompt(context: TeamProposalContext): string[] {
    return [
        `## TEAM PROPOSAL PHASE`,
        `You are the current LEADER. It's your turn to propose a team for Mission ${context.round}.`,
        `Team size required: ${context.teamSize}.`,
        `Available players: ${context.playerIds.map(id => `${context.playerNames[id]}(${id})`).join(', ')}.`,
        `Pick ${context.teamSize} players from the available IDs.`,
        `⚠️ CRITICAL: The IDs in teamMemberIds MUST EXACTLY MATCH the players you decided to pick in your reasoning!`,
        `Respond in strict JSON:`,
        `{`,
        `  "self_check": "...",`,
        `  "reasoning": "...",`,
        `  "action": {`,
        `    "teamMemberIds": ["<Player_ID_1>", "<Player_ID_2>"]`,
        `  }`,
        `}`
    ];
}
