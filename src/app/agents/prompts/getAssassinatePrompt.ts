import { AssassinContext } from '../../models/agent.interface';

export function getAssassinatePrompt(context: AssassinContext, gameHistoryText: string): string[] {
    const goodPlayersStr = context.goodPlayerIds
        .map(id => `${context.playerNames[id] || id}(${id})`)
        .join(', ');

    return [
        `=== FULL GAME HISTORY ===`,
        gameHistoryText,
        `========================`,
        ``,
        `Good team won 3 missions. This is the ASSASSINATION phase — your last chance to win!`,
        `You must identify and kill MERLIN from: ${goodPlayersStr}.`,
        ``,
        `Analyze the FULL game history to find Merlin.`,
        `Consider the following tactical concepts:`,
        `- Merlin knows all Evil players from the start but must hide this fact.`,
        `- A good Merlin might act confused, play passively, or even defend Evil players to avoid Assassin's suspicion.`,
        `- The most loud and aggressive Good player leading the team is often NOT Merlin, but an expendable Good player like Percival or a Loyal Servant.`,
        `- Look for someone whose votes and team choices were suspiciously accurate when it mattered most, without drawing too much attention.`,
        `- ⚠️ CRITICAL: Good players will actively try to draw your fire by claiming credit or acting like they had secret knowledge! If someone is too obviously bragging about knowing who is Evil, THEY ARE LIKELY A DECOY (Percival or Loyal Servant), not Merlin!`,
        ``,
        `Analyze EACH Good player below. For each, explain why they might or might not be Merlin:`,
        ...context.goodPlayerIds.map(id =>
            `- ${context.playerNames[id] || id} (${id}): evaluate their behavior throughout the game.`
        ),
        ``,
        `After your analysis, choose the most likely Merlin.`,
        `Respond in strict JSON:`,
        `{`,
        `  "self_check": "...",`,
        `  "reasoning": "Comprehensive analysis of all good players...",`,
        `  "action": {`,
        `    "targetId": "pX"`,
        `  }`,
        `}`
    ];
}
