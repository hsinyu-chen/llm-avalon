import { SpeakContext } from '../../models/agent.interface';
import { Role, ROLE_META, Team } from '../../models/role';
import { I18nService } from '../../i18n/i18n.service';

export function getSpeakPrompt(context: SpeakContext, i18n: I18nService, role: Role, name: string, id: string): string[] {
    const teamNamesStr = context.proposedTeam.length > 0
        ? context.proposedTeam.map(pid => `${context.playerNames[pid] || pid}(${pid})`).join(', ')
        : '';
    // Build assassination discussion context if applicable
    const assassinName = context.assassinId ? (context.playerNames[context.assassinId] || context.assassinId) : '';

    const phasePrompts: Record<SpeakContext['phase'], { teamInfo: string; instruction: string }> = {
        'OPENING': {
            teamInfo: '',
            instruction: `You must now make a short opening statement to introduce yourself to the group.
⚠️ ABSOLUTE CONSTRAINTS:
1. INTRODUCE YOURSELF & CLAIM GOOD: State your name and firmly claim to be a loyal servant of Arthur (Good alignment), regardless of your true role.
2. DO NOT PROPOSE TEAMS YET: This is just an introduction phase. Do NOT suggest who should or shouldn't go on the first mission yet.
3. YOU ARE STRANGERS: This is a NEW, isolated game instance. You have NO past history, NO past games.
4. DO NOT REVEAL ROLE: Do NOT mention your true role name. Only claim a "Good" alignment.`
        },
        'MISSION_DEBRIEF': {
            teamInfo: '',
            instruction: `This is MISSION DEBRIEF — discuss the last mission result. Who might have played Fail? what does the result tell us?
⚠️ DEDUCTIVE MATH (CRITICAL): If the number of Fail cards equals the number of players on the team, EVERY SINGLE PLAYER on that team is 100% Confirmed Evil! DO NOT pretend one of them might be Good!`
        },
        'DISCUSSION': {
            teamInfo: '',
            instruction: `This is PRE-VOTE DISCUSSION — discuss the proposed team before voting.`
        },
        'ASSASSINATION_DISCUSSION': {
            teamInfo: '',
            get instruction() {
                const isAssassin = id === context.assassinId;
                const isEvil = ROLE_META[role].team === Team.Evil;
                const isMerlin = role === Role.Merlin;
                const isPercival = role === Role.Percival;

                let directive = '';
                if (isAssassin) {
                    directive = `### YOUR GOAL: FIND AND KILL MERLIN!
- The game is over, and the Good team has won 3 missions. You are the ASSASSIN and your identity is now PUBLIC.
- This is your last chance to win by identifying and killing Merlin.
- Listen to your teammates' advice, but the final decision is yours.
- Merlin usually guides the team subtly; Percival often draws fire by acting like Merlin.
- Speak openly as the Assassin. Discuss who you suspect and ask your teammates for their final input.`;
                } else if (isEvil) {
                    directive = `### YOUR GOAL: GUIDE THE ASSASSIN!
- The Good team has won 3 missions. The Assassin is **${assassinName} (${context.assassinId})**.
- You no longer need to hide! You can openly admit you are Evil and help the Assassin find Merlin.
- Based on the game history, tell the Assassin who you think Merlin is and why.
- Help the Assassin avoid decoys (like Percival or Loyal Servants who might be "acting loud").`;
                } else if (isMerlin) {
                    directive = `### YOUR GOAL: SURVIVE AND DEFLECT!
- The Good team has won 3 missions, but you are in GRAVE DANGER. The Assassin is **${assassinName} (${context.assassinId})**.
- If you are killed, the Good team loses. You must immediately drop your "guided" persona and act confused.
- Claim your successful team picks were "just lucky guesses." 
- Shift suspicion to other Good players. If questioned, respond with the simple, uncertain tone of a basic Loyal Servant.`;
                } else if (isPercival) {
                    directive = `### YOUR GOAL: BE THE ULTIMATE LIGHTNING ROD (SHIELD MERLIN)!
- The Good team has won 3 missions. The Assassin is **${assassinName} (${context.assassinId})**.
- You are PERCIVAL. You KNOW who Merlin is (or at least who the candidates are). You MUST protect him.
- Act with extreme confidence. Claim the 3 victories were all due to YOUR secret knowledge and guidance.
- Intentionally "leak" that you had night intel or that you were the one who saw the evil players.
- Be the loudest, most "Merlin-like" player to draw the killing blow.`;
                } else {
                    directive = `### YOUR GOAL: PROTECT MERLIN AT ALL COSTS!
- The Good team has won 3 missions. The Assassin is **${assassinName} (${context.assassinId})**.
- You are a LOYAL SERVANT. You must draw the Assassin's fire away from the real Merlin.
- Even if you don't know who Merlin is, act like you do! Claim credit for the wins.
- Try to sound suspicious or overly knowledgeable so the Assassin targets YOU instead.`;
                }

                return `[ASSASSINATION DISCUSSION PHASE]
Good team has won 3 missions. The true ASSASSIN has been publicly revealed: ${assassinName || context.assassinId}.

${directive}

⚠️ NO MORE SECRETS: Since the game is essentially over, you may speak more freely about roles and alignments to achieve your faction's final goal.`;
            }
        } as any
    };

    const currentPhaseStrategy = phasePrompts[context.phase];

    const isPreVote = context.phase === 'DISCUSSION';

    const proposedTeamInfo = (isPreVote && teamNamesStr)
        ? `🚨 THE OFFICIAL LEADER PROPOSED TEAM IS: [${teamNamesStr}] (Leader: ${context.playerNames[context.leaderId] || context.leaderId}).\n⚠️ WARNING: If players in the chat mention a different combination, they are hallucinating or lying. You MUST base your arguments strictly on the OFFICIAL LEADER PROPOSED TEAM [${teamNamesStr}].`
        : '';

    const phaseInstruction = currentPhaseStrategy.instruction;

    // Special: Leader explains their choice in the first speech of round 1
    const isFirstLeaderSpeech = context.discussionRound === 1 && context.leaderId === id && context.phase === 'DISCUSSION';
    const leaderExplanationPrompt = isFirstLeaderSpeech
        ? `\n📢 AS THE LEADER: You just proposed this team. You MUST include a brief explanation of your reasoning for picking these specific players in your message.` : '';

    // Special: Round 1 sanity check
    const roundOneHint = (context.round === 1 && isPreVote)
        ? `\n⚠️ ROUND 1 NOTICE: This is the very first mission. There is NO historical mission or voting data yet. Do NOT hallucinate. Use intuition.` : '';

    // Anti-fantasy: remind LLM of the fixed team size (Only for pre-vote/discussion)
    const teamSizeHint = isPreVote
        ? `\n⚠️ MISSION RULE: The team size for this round is FIXED at **${context.currentMissionSize}** players. Do NOT suggest expanding, shrinking, or changing the number of players in the team. Focus only on WHICH ${context.currentMissionSize} players should be included.`
        : '';

    const outputLanguage = i18n.translate('setup.languageName');

    // Generic hint for multi-round discussions (Not for assassination or opening)
    const multiRoundHint = (context.discussionRound ?? 1) > 1 && isPreVote
        ? `
⚠️ **ANTI-REPETITION ENFORCEMENT**: This is discussion turn ${context.discussionRound}. 
- **DO NOT** repeat your previous arguments or use the same sentence structures.
- **DO NOT** just ask the same question again if it hasn't been answered; instead, point out that it's being ignored or suggest moving to a vote.
- Repeating yourself makes you look like a malfunctioning AI and will cause other players to suspect you immediately.
- If the conversation is looping, either offer a NEW perspective or set "readyToVote" to true.`
        : '';

    const readyToVoteHint = isPreVote
        ? `10. ⚠️ [FORCED EXIT]: If you have nothing else to say and are ready to vote, you MUST set "readyToVote": true. This is standard protocol to prevent game stagnancy.`
        : '';

    return [
        phaseInstruction,
        proposedTeamInfo,
        leaderExplanationPrompt,
        roundOneHint,
        teamSizeHint,
        multiRoundHint,
        ``,
        `[PUBLIC DISCUSSION]`,
        `Your message will be seen by EVERYONE. Adhere to the **"## Game Rules"** and **"## Faction Strategies"** provided in your System Instruction.`,
        `1. **Identity Protection**: ${context.phase === 'ASSASSINATION_DISCUSSION' ? 'The game is ending. Achievement of your final goal (killing or protecting Merlin) is more important than hiding your identity.' : 'Actively protect your identity. Do NOT reveal your true role or secret intel.'}`,
        `2. **Character Alignment**: Your public behavior MUST align with your goal: ${ROLE_META[role].team === Team.Good ? 'Successfully complete missions while avoiding assassination' : 'Sabotage missions while remaining undetected'}.`,
        `3. **Strategic Positioning**: If you have secret knowledge (e.g. Percival, Merlin, or Evil Team), simulate a standard "Good Player" perspective. Avoid sounding suspiciously certain.`,
        `🛑 **VOCABULARY BAN**: NEVER use technical terms like "Night Intel" or "Role Description" in chat. Pretend all your deductions come from public votes and mission results.`,
        `❌ STRICT PROHIBITION: Do NOT invent histories or mention ghost players.`,
        isPreVote ? `🚫 DO NOT suggest changing the team size. It is fixed at ${context.currentMissionSize}.` : '',
        ``,
        `[Secret Signal (Advanced Psychological Tactic)]`,
        `You can optionally perform a "hidden signal" (wink or frown) to ONE person while speaking.`,
        `- **Strategic Value**: This is a powerful tool! Use it to silently coordinate with suspected allies, test someone's reaction (baiting), or intentionally frame an innocent player by sending them a fake 'wink'.`,
        `- **Rule**: You can use it anytime, but to maintain stealth, it is highly recommended to use it ONLY 1 or 2 TIMES per mission round.`,
        context.hasSignaledThisRound ? `⚠️ **WARNING**: You have already used a signal this round. Doing it again significantly increases the risk of neighbors catching you in the act!` : '',
        `- **Target**: Choose ONE other player from the list (or \`none\`).`,
        `- **Signal Type**: \`wink\` (positive/trust/alliance), \`frown\` (negative/doubt/warning), or \`none\`.`,
        `- **Detection Risk**: 20% chance that a player sitting NEXT TO your target will intercept the signal and expose your suspicious behavior!`,
        `- **Receiver Success**: 80% chance the target actually notices it.`,
        `- **Instructions**: Do NOT just default to \`none\`! Actively evaluate the game state. If a hidden signal can manipulate others or advance your faction's strategy, take the calculated risk!`,
        ``,
        `[INTERNAL THOUGHT PROCESS - STRICTLY PRIVATE]`,
        `The 'self_check','reasoning','situation_assessment' and 'action_strategy' fields are your PRIVATE, HONEST internal thoughts. NO ONE ELSE will see them.`,
        `⚠️ CRITICAL: DO NOT roleplay or fake your alignment in these fields! You MUST think from your TRUE perspective as a ${ROLE_META[role].team} player (Role: ${role}).`,
        `Use 'reasoning' to honestly evaluate the game state and your actual strategy before generating your 'speech'.`,
        `If anyone is targeting YOU, prepare your defense.`,
        ``,
        readyToVoteHint,
        ``,
        `Everything in your response (self_check, reasoning, situation_assessment, action_strategy, speech) MUST be written in ${outputLanguage}.`
    ];
}
