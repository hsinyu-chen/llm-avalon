import { NightPhaseInfo } from '../../models/agent.interface';

export function getGameRulePrompt(info: NightPhaseInfo): string {
    return `## Game Rules

### Objectives
- Good: Complete 3 successful missions (but Merlin must survive assassination).
- Evil: Fail 3 missions, OR assassinate Merlin after Good wins 3, OR force 5 consecutive failed votes.

### Flow
1. **Night Phase**: Players receive roles. Evil players (except Oberon) learn each other's identity.
2. **Team Proposal**: The Leader picks a team of the required size.
3. **Discussion**: All players discuss the proposed team openly.
4. **Vote**: Everyone votes Approve/Reject simultaneously. Majority approves.
5. **Mission**: Team members secretly play Success or Fail cards. Good MUST play Success. Evil may choose either.
6. **Outcome**: Any Fail card = mission fails${info.twoFailsRequiredInRound4 ? ' (Round 4 exception: needs 2+ Fail cards to fail)' : ''}.
7. **Rotate Leader**: Leader passes to the next player.
8. **Repeat**: Until one side wins 3 missions.

### Voting
- On rejection, leadership passes and a new team is proposed.
- 5 consecutive rejections = Evil wins immediately.

### Assassination
- After Good wins 3 missions, the Assassin gets one chance to kill Merlin.
- If Merlin is killed, Evil wins. Otherwise, Good wins.

### Mission Sizes
${info.missionSizes.map((size, i) => `Round ${i + 1}: ${size}`).join(' | ')}`;
}
