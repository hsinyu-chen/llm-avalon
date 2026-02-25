import { SpeakContext } from '../../models/agent.interface';
import { Role, ROLE_META } from '../../models/role';
import { I18nService } from '../../i18n/i18n.service';

export function getSpeakPrompt(context: SpeakContext, i18n: I18nService, role: Role, name: string, id: string): string[] {
    const teamNamesStr = context.proposedTeam.length > 0
        ? context.proposedTeam.map(pid => `${context.playerNames[pid] || pid}(${pid})`).join(', ')
        : '';
    // Build assassination discussion context if applicable
    const assassinName = context.assassinId ? (context.playerNames[context.assassinId] || context.assassinId) : '';

    const phasePrompts: Record<SpeakContext['phase'], { teamInfo: string; instruction: string }> = {
        'OPENING': {
            teamInfo: 'No team proposed yet (Opening phase).',
            instruction: `You must now make a short opening statement to introduce yourself to the group.
⚠️ ABSOLUTE CONSTRAINTS:
1. INTRODUCE YOURSELF & CLAIM GOOD: State your name and firmly claim to be a loyal servant of Arthur (Good alignment), regardless of your true role.
2. DO NOT PROPOSE TEAMS YET: This is just an introduction phase. Do NOT suggest who should or shouldn't go on the first mission yet.
3. YOU ARE STRANGERS: This is a NEW, isolated game instance. You have NO past history, NO "last poly", NO "previous gatherings".
4. DO NOT REVEAL ROLE: Do NOT mention your true role name (Merlin, Assassin, etc.). Only claim a "Good" alignment.`
        },
        'MISSION_DEBRIEF': {
            teamInfo: 'No team proposed yet (Mission Debrief phase).',
            instruction: `This is MISSION DEBRIEF — discuss the last mission result. Who might have played Fail? What does the result tell us?
⚠️ DEDUCTIVE MATH (CRITICAL): Pay close attention to the number of Fail cards! If the number of Fail cards equals the number of players on the team (e.g. 2 fails on a 2-person mission), EVERY SINGLE PLAYER on that team is 100% Confirmed Evil! DO NOT pretend one of them might be Good!`
        },
        'DISCUSSION': {
            teamInfo: 'No team proposed yet.', // Fallback if no team is proposed somehow
            instruction: `This is PRE-VOTE DISCUSSION — discuss the proposed team before voting.`
        },
        'ASSASSINATION_DISCUSSION': {
            teamInfo: 'No team — this is the ASSASSINATION DISCUSSION phase.',
            instruction: `🗡️ ASSASSINATION DISCUSSION PHASE\nGood team has won 3 missions. The true ASSASSIN has been publicly revealed: ${assassinName}.\nThe Assassin will now choose one Good player to assassinate, hoping to find Merlin.\nIf Merlin is killed, EVIL WINS.\n\nThis is your LAST CHANCE to influence the Assassin.\n⚠️ ROLE-SPECIFIC SURVIVAL DIRECTIVES:\n- If you are EVIL: State explicitly who you think Merlin is and WHY. Provide specific instances (e.g. "P2 knew too much in Round 3"). Guide the Assassin!\n- If you are MERLIN: Your life is in danger! Mislead the Assassin! Act confused, claim you were just guessing, or say you think someone else was leading the team.\n- If you are a GOOD PLAYER (not Merlin): Draw the Assassin's fire! Claim credit for guiding the team to victory. Act like you had secret knowledge so the Assassin targets YOU instead of the real Merlin.\n- EVERYONE: State your opinion. Once stated, YOU MUST PASS (set readyToVote to true). DO NOT repeat yourself.`
        }
    };

    const currentPhaseStrategy = phasePrompts[context.phase];

    const proposedTeamInfo = teamNamesStr
        ? `🚨 THE OFFICIAL LEADER PROPOSED TEAM IS: [${teamNamesStr}] (Leader: ${context.playerNames[context.leaderId] || context.leaderId}).\n⚠️ WARNING: If players in the chat mention a different combination, they are hallucinating or lying. You MUST base your arguments strictly on the OFFICIAL LEADER PROPOSED TEAM [${teamNamesStr}].`
        : currentPhaseStrategy.teamInfo;

    const phaseInstruction = currentPhaseStrategy.instruction;

    // Special: Leader explains their choice in the first speech of round 1
    const isFirstLeaderSpeech = context.discussionRound === 1 && context.leaderId === id && context.phase === 'DISCUSSION';
    const leaderExplanationPrompt = isFirstLeaderSpeech
        ? `\n📢 AS THE LEADER: You just proposed this team. You MUST include a brief explanation of your reasoning for picking these specific players in your message.` : '';

    // Special: Round 1 sanity check
    const roundOneHint = context.round === 1
        ? `\n⚠️ ROUND 1 NOTICE: This is the very first mission. There is NO historical mission or voting data yet. Do NOT hallucinate or imagine past events or "suspicious behaviors" that haven't happened. Use general intuition or social engineering for now.` : '';

    // Anti-fantasy: remind LLM of the fixed team size
    const teamSizeHint = `\n⚠️ MISSION RULE: The team size for this round is FIXED at **${context.currentMissionSize}** players. Do NOT suggest expanding, shrinking, or changing the number of players in the team. Focus only on WHICH ${context.currentMissionSize} players should be included.`;

    // PASS is available in all non-OPENING phases
    const canPass = context.phase !== 'OPENING';

    const passBlock = canPass ? [
        ``,
        `🚨🚨🚨 DISCUSSION TURN REPLIES 🚨🚨🚨`,
        `You must reply with a valid JSON object.`,
        `You MUST ALWAYS provide ALL 4 fields: "self_check", "reasoning", "speech", and "readyToVote" (boolean).`,
        ``,
        `If you want to PASS (end turn without speaking, you are ready to conclude discussion):`,
        `  return: {"self_check": "...", "reasoning": "...", "action": {"speech": "", "readyToVote": true}}`,
        ``,
        `If you want to Speak (and optionally pass afterwards):`,
        `  return: { "self_check": "...", "reasoning": "...", "action": {"speech": "your message", "readyToVote": true/false} }`,
        ``,
        `⚠️ STRICT RULES ABOUT SPEECH AND PASSING:`,
        `- If everyone already agrees, or you only want to say "I agree / Let's be careful", YOU MUST PASS INSTEAD: set "action.speech" to "" and "action.readyToVote" to true.`,
        `- DO NOT write "I pass" or "Ready to vote" inside the speech. Use the "action.readyToVote" boolean field.`,
        `- If your opinion has been heard and acknowledged, MUST PASS.`,
        `- If you speak, keep "speech" UNDER 3 SENTENCES. DO NOT echo what others said.`,
        ``
    ] : [];

    const outputLanguage = i18n.translate('setup.languageName');

    return [
        phaseInstruction,
        proposedTeamInfo,
        ...passBlock,
        leaderExplanationPrompt,
        roundOneHint,
        teamSizeHint,
        ``,
        `📢 PUBLIC DISCUSSION — Your message will be seen by EVERYONE.`,
        role === Role.Percival
            ? `⚠️ ROLE SURVIVAL WARNING: Do NOT reveal you are Percival! Your job is to act like a confident player with secret knowledge so the Assassin suspects you are Merlin. Draw their fire!`
            : `⚠️ ROLE SURVIVAL WARNING: Do NOT reveal your true role! Act like a standard Loyal Servant.`,
        `🛑 VOCABULARY BAN (ESPECIALLY FOR MERLIN): NEVER use words like "Confirmed Evil", "I know", "100%", or "Night Intel" in public chat. If a mission SUCCEEDED, a normal Good player assumes everyone on it is good. If you suddenly accuse someone on a successful team of being Evil, the Assassin will instantly know you are Merlin and YOU WILL LOSE. ALWAYS pretend you are just guessing from public votes!`,
        `❌ STRICT PROHIBITION: Do NOT invent histories or mention ghost players.`,
        `🚫 DO NOT suggest changing the team size. It is fixed at ${context.currentMissionSize}.`,
        ``,
        `IMPORTANT: Write your message in ${outputLanguage}. Keep it concise (1-3 sentences).`,
        ``,
        `=== INTERNAL THOUGHT PROCESS (STRICTLY PRIVATE) ===`,
        `The 'self_check' and 'reasoning' fields are your PRIVATE, HONEST internal thoughts. NO ONE ELSE will see them.`,
        `⚠️ CRITICAL: DO NOT roleplay or fake your alignment in these fields! You MUST think from your TRUE perspective as a ${ROLE_META[role].team} player (Role: ${role}).`,
        `Use 'reasoning' to honestly evaluate the game state and your actual strategy before generating your 'speech'.`,
        `If anyone is targeting YOU, prepare your defense.`,
        ``,
        `10. ⚠️ [FORCED EXIT]: If you have nothing else to say and are ready to vote, you MUST set "readyToVote": true. This is standard protocol to prevent game stagnancy.`,
        ``,
        `⚠️ LANGUAGE RULE: Everything in your response (self_check, reasoning, speech) MUST be written in ${outputLanguage}.`,
        ``,
        ...(canPass ? [
            `Respond in ${outputLanguage} in strict JSON:`,
            `{`,
            `  "self_check": "I am ${name} (${id}), my role is ${i18n.translate(`roles.${role}`)}. Is it currently my turn to speak or provide a final action? [Yes/No] (Answer in ${outputLanguage})",`,
            `  "reasoning": "[Internal strategy evaluation in ${outputLanguage}]",`,
            `  "action": {`,
            `    "speech": "your response to others (keep it concise, ignore if you want to pass)",`,
            `    "readyToVote": true/false`,
            `  }`,
            `}`
        ] : [

            `Respond in strict JSON:`,
            `{`,
            `    "speech": "...",`,
            `    "readyToVote": false`,
            `  }`,
            `}`
        ])
    ];
}
