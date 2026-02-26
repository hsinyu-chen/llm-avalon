import { AssassinContext } from '../../models/agent.interface';

export function getAssassinatePrompt(context: AssassinContext): string {
    const goodPlayersStr = context.goodPlayerIds
        .map(id => `${context.playerNames[id] || id}(${id})`)
        .join(', ');

    return [
        `[ASSASSINATION: FINAL CHOICE]`,
        `The Good team has won 3 missions. This is your FINAL CHANCE to steal victory!`,
        `You must identify and assassinate MERLIN from the following players: ${goodPlayersStr}.`,
        ``,
        `### TARGET ANALYSIS STRATEGY:`,
        `- **The Quiet Observer**: Merlin often knows everything but says little to avoid detection. Look for players who voted perfectly but didn't lead the charge.`,
        `- **The Decoy (Percival)**: Good players like Percival will act loud, confident, and "Merlin-like" to protect the real Merlin. Don't be fooled by obvious bravado.`,
        `- **Voting Patterns**: Review who consistently supported the successful teams before they were confirmed as "Safe."`,
        `- **Recent Behavior**: In the final discussion, did anyone suddenly act "confused" or try to shift credit? That might be Merlin trying to hide.`,
        ``,
        `Analyze EACH candidate below and explain the likelihood of them being Merlin:`,
        ...context.goodPlayerIds.map(id =>
            `- **${context.playerNames[id] || id} (${id})**: evaluate their game-long behavior and recent discussion.`
        ),
        ``,
        `FINAL ACTION: State your definitive choice for Merlin. If you kill Merlin, EVIL WINS.`
    ].join('\n');
}
