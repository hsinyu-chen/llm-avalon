import { Role, Team } from '../../models/role';
import { MissionContext, NightPhaseInfo } from '../../models/agent.interface';
import { I18nService } from '../../i18n/i18n.service';

export function getExecuteMissionPrompt(
    context: MissionContext,
    name: string,
    id: string,
    i18n: I18nService,
    role: Role,
    visiblePlayers: NightPhaseInfo['visiblePlayers'],
    rolesInGame: Role[]
): string[] {
    const goodWins = context.missionHistory.filter(m => m.succeeded).length;
    const evilWins = context.missionHistory.filter(m => !m.succeeded).length;
    const teamNamesStr = context.team.map(tid => `${context.playerNames[tid] || tid}(${tid})`).join(', ');

    const knownEvilIds = new Set(visiblePlayers
        .filter(p => p.team === Team.Evil)
        .map(p => p.id));
    knownEvilIds.add(id);

    const knownEvilTeamIds = context.team.filter(tid => knownEvilIds.has(tid));
    const knownEvilOnTeam = knownEvilTeamIds.length;
    const hasOberonInGame = rolesInGame.includes(Role.Oberon);

    let warningStr = `⚠️ YOUR ULTIMATE GOAL IS TO FAIL 3 MISSIONS. However, you can use deception to get there.`;
    const requiresTwoFails = context.round === 4 && context.twoFailsRequiredInRound4;

    if (requiresTwoFails) {
        warningStr = `🚨🚨🚨 [CRITICAL OVERRIDE] ROUND 4 REQUIRES TWO (2) FAIL CARDS TO FAIL THE MISSION! 🚨🚨🚨\nIf you play 'Fail' but no other Evil player is on this team to also play 'Fail', your 'Fail' card will be wasted and Good will still win the mission! If you are the ONLY Evil player on this team, you MUST play 'Success' to hide!`;
    }
    const isMatchPointForGood = goodWins === 2;
    const isMatchPointForEvil = evilWins === 2;
    const teamSize = context.team.length;

    let situationalTactics = `💡 **[SITUATIONAL TACTICS]**:\n`;

    if (isMatchPointForGood) {
        situationalTactics += `   - 🚨 **DESPERATION MODE**: Good is at match point (2 wins)! If this mission succeeds, EVIL LOSES THE GAME. You MUST strongly consider playing 'Fail' to keep Evil alive, even if it blows your cover!\n`;
    } else if (isMatchPointForEvil) { 
        situationalTactics += `   - 🩸 **KILL SHOT**: Evil is at match point (2 wins)! One more 'Fail' wins the game instantly. Go for the throat!\n`;
    }

    if (teamSize === 2 && !isMatchPointForGood) {
        situationalTactics += `   - 🕵️ **HIGH RISK OF EXPOSURE**: This is a 2-person team. If you play 'Fail', the other player will know exactly who did it. Playing 'Success' (Deep Wolf) to build absolute trust is a very strong option here, unless you intend to aggressively frame the other player.\n`;
    } else if (teamSize >= 3 && !isMatchPointForGood) {
        situationalTactics += `   - 🌫️ **SMOKESCREEN ADVANTAGE**: This is a large team (${teamSize} players). It is much safer to play 'Fail' here! The blame will be divided, creating paranoia among the Good players and keeping your identity hidden.\n`;
    }

    const sections = [
        `Mission round ${context.round}. Team: ${teamNamesStr}.`,
        `Current mission score: Good ${goodWins} vs Evil ${evilWins}.`,
        ``,
        `🔴 STRATEGIC DECISION — You are EVIL. You MUST decide: play Success or Fail.`,
        warningStr,
        ``,
        `⚠️ IMPORTANT: Only players in the [Team] list will play mission cards. Your allies NOT in this list will NOT play a card.`,
        ``,
         `Tactical considerations for your mission card:`,
        `1. 💥 THE SABOTAGE: Playing 'Fail' scores a point for Evil.`,
        `2. 🐺 THE "DEEP WOLF" PLAY: Playing 'Success' keeps your cover intact and builds trust.`,
        situationalTactics
    ];

    if (knownEvilOnTeam > 1) {
        const knownEvilNames = knownEvilTeamIds.map(tid => `${context.playerNames[tid] || tid}(${tid})`).join(', ');

        const oberonWarning = hasOberonInGame && (knownEvilOnTeam < context.team.length)
            ? `⚠️ **[OBERON IN GAME]**: Oberon is in this game. One of the unknown players on this team could be Oberon! Be cautious.`
            : '';

        sections.push(`3. 🤝 AVOID DOUBLE FAILS: This team contains ${knownEvilOnTeam} Evil players you recognize: ${knownEvilNames}.`);
        if (oberonWarning) sections.push(oberonWarning);

        if (role !== Role.Oberon) {
            const sortedEvilIds = [...knownEvilTeamIds].sort((a, b) => {
                const numA = parseInt(a.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.replace(/\D/g, '')) || 0;
                return numA - numB;
            });

            const requiredSaboteurs = requiresTwoFails ? 2 : 1;
            const designatedSaboteurs = sortedEvilIds.slice(0, requiredSaboteurs);
            const amIDesignated = designatedSaboteurs.includes(id);

            const designatedNames = designatedSaboteurs.map(tid => `${context.playerNames[tid] || tid}(${tid})`).join(', ');

            sections.push(`   - ⚠️ **[EVIL FACTION SABOTAGE PROTOCOL]** ⚠️: To avoid exposing multiple identities, the system has automatically assigned roles for this mission based on player IDs.`);

            if (amIDesignated) {
                sections.push(
                    `   - 🚨 **[YOUR ROLE: THE PRIMARY DECIDER]** 🚨`,
                    `     The system selected you (${name}) to make the final call for the Evil team on this mission.`,
                    `     Your other Evil teammate(s) have been forced to play 'Success' to prevent Double Fails.`,
                    `     Therefore, the outcome rests ENTIRELY ON YOU:`,
                    `     ► Play 'Fail': If you want to sabotage and score a point now.`,
                    `     ► Play 'Success' (Deep Wolf): If you want to stay hidden and build trust for later rounds.`,
                    `     You are the ONLY one who can play 'Fail'. Choose wisely based on the current score!`
                );
            }
            else {
                sections.push(
                    `   - 🛡️ **[YOUR ROLE: BACKUP / DEEP WOLF]** 🛡️`,
                    `     The system designated ${designatedNames} as the Primary Decider(s) for this mission.`,
                    `     **YOU MUST PLAY 'SUCCESS'** to maintain your cover!`,
                    `     Leave the sabotage decision entirely to your partner(s). DO NOT play 'Fail' under any circumstances to avoid Double Fails!`
                );
            }
        } else {
            sections.push(`   - ⚠️ **[OBERON LIMITATION]**: You do not know who your allies are, and they do not know you. Coordination is impossible. If you sabotage, be aware an ally might also sabotage, causing a double fail.`);
        }
    } else {
        if (hasOberonInGame && context.team.length > 1) {
            sections.push(`3. 🤝 OBERON WARNING: You are the only known Evil player on this team, but Oberon is in this game and might be one of your teammates. Be aware that a double fail could happen if both of you decide to sabotage.`);
        } else {
            sections.push(`3. 🎯 INDEPENDENT ACTION: You are the ONLY Evil player on this team. The decision to sabotage or hide is entirely yours.`);
        }
    }

    sections.push(
        `4. 🚨 MATCH POINT (CRITICAL): Good has ${goodWins} wins. If Good reaches 3 wins, EVIL LOSES THE GAME.`,
        ``,
        `Weigh the value of scoring a point now vs. building trust for later.`
    );

    return sections;
}