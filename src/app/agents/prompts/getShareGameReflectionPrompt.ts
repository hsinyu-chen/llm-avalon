import { GameReflectionContext } from '../../models/agent.interface';
import { Role, ROLE_META, Team } from '../../models/role';
import { I18nService } from '../../i18n/i18n.service';

export function getShareGameReflectionPrompt(context: GameReflectionContext, myRole: Role, name: string, id: string, note: string, i18n: I18nService): string {
    const teamInfo = ROLE_META[myRole].team;
    const winnerText = context.winner === Team.Good ? 'Good' : (context.winner === Team.Evil ? 'Evil' : 'Unknown');
    const myTeamText = teamInfo === Team.Good ? 'Good' : 'Evil';
    const assassinInfo = context.assassinTargetId
        ? `Assassination: Assassin ${context.isMerlinKilled ? 'Successfully' : 'Failed to'} killed Merlin (Target: ${context.playerNames[context.assassinTargetId] || context.assassinTargetId}).`
        : '';
    const myRoleName = i18n.translate(`roles.${myRole}`);

    const trueRolesText = context.playerRoles.map(p => {
        const rMeta = ROLE_META[p.role];
        const rName = i18n.translate(`roles.${p.role}`);
        return `- ${context.playerNames[p.id] || p.id} (${p.id}): ${rName} (${rMeta.team === Team.Good ? 'Good' : 'Evil'})`;
    }).join('\n');

    const resultText = context.winner === teamInfo ? 'VICTORY' : 'DEFEAT';

    return [
        `GAME OVER!`,
        `This game had ${context.playerCount} players, ${context.round} missions.`,
        `Mission results: ${context.missions.map(m => `Round ${m.round}: ${m.succeeded ? 'Success' : 'Fail'}`).join(', ')}.`,
        assassinInfo,
        `The winner is the ${winnerText} team!`,
        `You were ${name} (${myRoleName}), on the ${myTeamText} team.`,
        `The game ended in your ${resultText}.`,
        ``,
        `[PUBLIC REVELATION - TRUE ROLES]`,
        `The game is over, and all secret identities are now revealed:`,
        `EVERYONE'S TRUE ROLES ARE:`,
        trueRolesText,
        ``,
        `[REFLECTION GUIDELINES]`,
        `All secret identities are now revealed. Before providing your summary, reflect on:`,
        `1. LIGHTBULB MOMENTS: Compare these revealed roles with your suspicions during the game. Were you right about anyone? Who surprised you?`,
        `2. STRATEGIC REVIEW: How did the revealed roles explain the success or failure of specific missions or votes?`,
        `3. IDENTITY CHECK: Confirm you are ${name} (${id}) and how you feel about your own performance.`,
        `4. PLAYER ANALYSIS (TURING TEST): Comment on at least one other player's abilities and speculate on their true nature.`,
        `   - First, explicitly guess: Are they a HUMAN player or an AI MODEL?`,
        `   - (Hint: Humans might show emotion, make minor logical leaps, or speak more casually. AI models tend to be overly analytical, robotic, or overly polite).`,
        `   - If you guess AI MODEL, further specify if they are a basic, intermediate, or advanced model, and guess a specific model name(real world model name like GPT-4o, Claude 3.5, Gemini 3, etc.).`
    ].filter(s => s !== '').join('\n');
}
