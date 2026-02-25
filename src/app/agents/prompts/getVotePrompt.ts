import { VoteContext } from '../../models/agent.interface';

export function getVotePrompt(context: VoteContext): string[] {
    const goodWins = context.missionHistory.filter(m => m.succeeded).length;
    const evilWins = context.missionHistory.filter(m => !m.succeeded).length;

    const excaliburLine = context.excaliburHolderId
        ? `Excalibur holder: ${context.playerNames[context.excaliburHolderId] || context.excaliburHolderId}.` : '';

    const teamNamesStr = context.proposedTeam.map(id => `${context.playerNames[id] || id}(${id})`).join(', ');

    return [
        `Leader ${context.playerNames[context.leaderId] || context.leaderId} officially proposed a team for the current mission.`,
        `🚨 THE TEAM YOU ARE VOTING ON IS: [${teamNamesStr}]`,
        `⚠️ WARNING: Do not confuse this with any other team discussed in chat. You are voting ONLY on [${teamNamesStr}].`,
        `Current mission score: Good ${goodWins} vs Evil ${evilWins}.`,
        `Vote attempt: ${context.consecutiveFailedVotes + 1} of 5 (5 consecutive rejections = Evil wins immediately!).`,
        excaliburLine,
        ``,
        `⚠️ IMPORTANT: Chat history is PURGED after this round ends. You MUST rely on your NOTE for info from previous rounds.`,
        ``,
        `Tactical considerations for voting:`,
        context.consecutiveFailedVotes === 4
            ? `- 🔴 CRITICAL DANGER: This is VOTE ATTEMPT 5! If this team is rejected, EVIL WINS THE GAME IMMEDIATELY! Good players MUST APPROVE THIS TEAM no matter what! Evil players can either REJECT to win immediately, or APPROVE if they are on the team and want to sabotage it.`
            : `- 🛑 DO NOT BE AFRAID TO REJECT: In Avalon, rejecting teams (action.voteChoice = false) is a NORMAL and CRITICAL strategy. If you are not 100% sure about a team, or if it doesn't serve your faction's goals, REJECT IT.`,
        context.consecutiveFailedVotes < 4 ? `- Good players MUST REJECT teams they suspect contain Evil players.` : '',
        context.consecutiveFailedVotes < 4 ? `- Evil players MUST REJECT teams that contain only Good players.` : '',
        `- Analyze who proposed the team and their possible alignment.`,
        `- Consider the voting behavior of others: are some players always voting together?`,
        `- Voting is a tool for both building teams and sending signals.`,
        `Respond in strict JSON:`,
        `{`,
        `  "self_check": "...",`,
        `  "reasoning": "...",`,
        `  "action": {`,
        `    "voteChoice": true/false`,
        `  }`,
        `}`
    ];
}
