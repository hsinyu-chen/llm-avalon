import { VoteContext } from '../../models/agent.interface';

export function getVotePrompt(context: VoteContext): string[] {
    const goodWins = context.missionHistory.filter(m => m.succeeded).length;
    const evilWins = context.missionHistory.filter(m => !m.succeeded).length;

    const excaliburLine = context.excaliburHolderId
        ? `Excalibur holder: ${context.playerNames[context.excaliburHolderId] || context.excaliburHolderId}.` : '';

    const teamNamesStr = context.proposedTeam.map(id => `${context.playerNames[id] || id}(${id})`).join(', ');

    const playerCount = context.playerIds.length;
    const currentLeaderIdx = context.playerIds.indexOf(context.leaderId);
    const v1LeaderIdx = (currentLeaderIdx - context.consecutiveFailedVotes + playerCount) % playerCount;

    const roundRotationNames: string[] = [];
    for (let i = 0; i < 5; i++) {
        const pid = context.playerIds[(v1LeaderIdx + i) % playerCount];
        const name = context.playerNames[pid] || pid;
        roundRotationNames.push(i === context.consecutiveFailedVotes ? `${name}(current)` : name);
    }
    const leaderRotationStr = roundRotationNames.join(', ');

    return [
        `[VOTE TARGET]`,
        `- **Officially Proposed Team**: [${teamNamesStr}]`,
        `- **Leader Rotation for this Round**: ${leaderRotationStr}`,
        `- **Current Progress**: Round ${context.round} | Vote attempt ${context.consecutiveFailedVotes + 1}/5`,
        `- **Score**: Good ${goodWins} vs Evil ${evilWins}`,
        `⚠️ **WARNING**: Do not confuse this with any other team discussed in chat. You are voting ONLY on [${teamNamesStr}].`,
        excaliburLine,
        ``,
        `⚠️ IMPORTANT: Chat history is PURGED after this round ends. You MUST rely on your NOTE for info from previous rounds.`,
        ``,
        `Tactical considerations for voting:`,
        context.consecutiveFailedVotes === 4
            ? `- 🔴 CRITICAL DANGER: This is VOTE ATTEMPT 5! If this team is rejected, EVIL WINS THE GAME IMMEDIATELY!
  - **GOOD PLAYERS**: You MUST APPROVE (action.voteChoice = true) this team no matter what! Losing a mission is survivable; losing the vote track is game over.
  - **EVIL PLAYERS**: You win if the team is rejected. However, if you vote REJECT (X) and the team passes anyway (due to Good players approving), you are PERMANENTLY EXPOSED as Evil. Unless you are 100% sure you can force a rejection, it is often safer to APPROVE (O) and try to sabotage the mission or save yourself for assassination.`
            : `- 🛑 DO NOT BE AFRAID TO REJECT: In Avalon, rejecting teams (action.voteChoice = false) is a NORMAL and CRITICAL strategy. If you are not 100% sure about a team, or if it doesn't serve your faction's goals, REJECT IT.`,
        context.consecutiveFailedVotes < 4 ? `- Good players MUST REJECT teams they suspect contain Evil players.` : '',
        context.consecutiveFailedVotes < 4 ? `- Evil players MUST REJECT teams that contain only Good players.` : '',
        `- Analyze who proposed the team and their possible alignment.`,
        `- Consider the voting behavior of others: are some players always voting together?`,
        `- Voting is a tool for both building teams and sending signals.`,
    ];
}
