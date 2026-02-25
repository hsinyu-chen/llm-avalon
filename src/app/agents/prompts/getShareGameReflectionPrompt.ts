import { GameReflectionContext } from '../../models/agent.interface';
import { Role, ROLE_META, Team } from '../../models/role';
import { I18nService } from '../../i18n/i18n.service';

export function getShareGameReflectionPrompt(context: GameReflectionContext, myRole: Role, name: string, id: string, note: string, i18n: I18nService): string {
    const teamInfo = ROLE_META[myRole].team;
    const winnerText = context.winner === Team.Good ? 'Good' : (context.winner === Team.Evil ? 'Evil' : 'Unknown');
    const myTeamText = teamInfo === Team.Good ? 'Good' : 'Evil';
    const assassinInfo = context.assassinTargetId
        ? `Assassin targeted: ${context.assassinTargetId}.`
        : 'No assassination happened.';
    const merlinInfo = context.isMerlinKilled ? 'Merlin was assassinated.' : 'Merlin survived the assassination.';

    const myRoleName = i18n.translate(`roles.${myRole}`);
    // shareGameReflection doesn't use BaseGameContext, so use buildPromptRaw manually
    const identity = `[PRIVATE DATA - IDENTITY]\nYou are ${name} (${id}), role: ${myRoleName}. You are on the ${myTeamText} team.`;
    const noteBlock = `[PRIVATE DATA - YOUR PERSONAL NOTE]\n===Your Note===\n${note || 'empty'}\n===============`;

    const trueRolesText = context.playerRoles.map(p => {
        const rMeta = ROLE_META[p.role];
        const rName = i18n.translate(`roles.${p.role}`);
        return `- ${context.playerNames[p.id] || p.id} (${p.id}): ${rName} (${rMeta.team === Team.Good ? 'Good' : 'Evil'})`;
    }).join('\n');

    return [identity, noteBlock, '',
        `GAME OVER!`,
        `This game had ${context.playerCount} players, ${context.round} missions.`,
        `Mission results: ${context.missions.map(m => `Round ${m.round}: ${m.succeeded ? 'Success' : 'Fail'}`).join(', ')}.`,
        `Winner: ${winnerText}.`,
        assassinInfo,
        merlinInfo,
        ``,
        `=== PUBLIC REVELATION - TRUE ROLES ===`,
        `The game is over, and all secret identities are now revealed:`,
        `EVERYONE'S TRUE ROLES ARE:`,
        trueRolesText,
        ``,
        `=== IDENTITY RECOGNITION CHECK ===`,
        `Before providing your reflection, you MUST perform a self-identity check.`,
        `1. Confirm who you are: ${name} (${id}).`,
        `2. Reflect on your performance as this character.`,
        ``,
        `Output in strict JSON format:`,
        `{`,
        `  "self_check": "I am ${name} (${id}). [Role reflection in ${i18n.translate('setup.languageName')}]",`,
        `  "reflection": "your one-sentence reflection in ${i18n.translate('setup.languageName')}"`,
        `}`,
        `⚠️ CRITICAL: All fields MUST be written in ${i18n.translate('setup.languageName')}.`
    ].filter(s => s !== '').join('\n');
}
