import { Role } from '../../models/role';
import { MissionContext } from '../../models/agent.interface';
import { I18nService } from '../../i18n/i18n.service';

export function getExecuteMissionPrompt(context: MissionContext, name: string, id: string, i18n: I18nService, role: Role): string[] {
    const goodWins = context.missionHistory.filter(m => m.succeeded).length;
    const evilWins = context.missionHistory.filter(m => !m.succeeded).length;
    const teamNamesStr = context.team.map(id => `${context.playerNames[id] || id}(${id})`).join(', ');

    let warningStr = `⚠️ YOUR ULTIMATE GOAL IS TO FAIL 3 MISSIONS. However, you can use deception to get there.`;
    if (context.round === 4 && context.twoFailsRequiredInRound4) {
        warningStr = `🚨🚨🚨 [CRITICAL OVERRIDE] ROUND 4 REQUIRES TWO (2) FAIL CARDS TO FAIL THE MISSION! 🚨🚨🚨\nIf you play 'Fail' but no other Evil player is on this team to also play 'Fail', your 'Fail' card will be wasted and Good will still win the mission! If you are the ONLY Evil player on this team, you MUST play 'Success' to hide!`;
    }

    return [
        `## MISSION EXECUTION PHASE`,
        `Mission round ${context.round}. Team: ${teamNamesStr}.`,
        `Current mission score: Good ${goodWins} vs Evil ${evilWins}.`,
        ``,
        `🔴 STRATEGIC DECISION — You are EVIL. You MUST decide: play Success or Fail.`,
        warningStr,
        ``,
        `⚠️ IMPORTANT: Only players in the [Team] list will play mission cards. Your allies NOT in this list will NOT play a card.`,
        ``,
        `Tactical considerations for your mission card:`,
        `1. 💥 THE SABOTAGE: Playing 'Fail' scores a point for Evil. This is your primary way to win.`,
        `2. 🐺 THE "DEEP WOLF" PLAY: Playing 'Success' keeps your cover intact and builds absolute trust with Good players. This is a strong strategy for Round 1 or 2 to guarantee you get picked for later, larger missions. BUT do not overuse it! If all Evil players "Deep Wolf", Good will easily win 3-0!`,
        `3. 🤝 AVOID DOUBLE FAILS: If there are multiple Evil players on this team, try to deduce who will fail it. 2 Fails on one mission instantly exposes multiple Evil players. If you think your ally will fail it, you MUST play Success to hide.`,
        ...(role !== Role.Oberon ? [
            `   - ⚠️ **[EVIL FACTION SABOTAGE PROTOCOL]** ⚠️: If you intend to fail the mission in this round, to avoid exposing too many Evil identities, please strictly follow this coordinated agreement:`,
            `     - If the mission requires ONLY 1 Fail card to fail: ONLY the Evil player with the SMALLEST ID (number) among those on this mission should play 'Fail'. Other Evil players MUST play 'Success' (Deep Wolf) to maintain cover!`,
            `     - If the mission requires 2 Fail cards to fail (usually Round 4 with 7+ players): ONLY the two Evil players with the SMALLEST and SECOND SMALLEST IDs should play 'Fail'. Others MUST play 'Success'.`
        ] : []),
        `4. 🚨 MATCH POINT (CRITICAL): Good has ${goodWins} wins. If Good reaches 3 wins, EVIL LOSES THE GAME.`,
        ``,
        `Weigh the value of scoring a point now vs. building trust for later.`,
        `Respond in strict JSON:`,
        `{`,
        `  "self_check": "I am ${name} (${id}). The team is: ${teamNamesStr}. Are any of my Evil allies ON THIS EXACT TEAM? [Yes/No] (Answer in ${i18n.translate('setup.languageName')})",`,
        `  "reasoning": "...",`,
        `  "action": {`,
        `    "playedMissionResult": true/false`,
        `  }`,
        `}`
    ];
}
