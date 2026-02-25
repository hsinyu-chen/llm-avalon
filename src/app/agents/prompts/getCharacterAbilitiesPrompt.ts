import { Role, ROLE_META, Team } from '../../models/role';
import { I18nService } from '../../i18n/i18n.service';

export function getCharacterAbilitiesPrompt(uniqueRoles: Role[], i18n: I18nService): string {
    const roleDescriptions: string[] = [];
    for (const role of uniqueRoles) {
        const meta = ROLE_META[role];
        const teamLabel = meta.team === Team.Good ? '🔵Good' : '🔴Evil';
        const name = i18n.translate(`roles.${role}`);
        const description = i18n.translate(`roleDescriptions.${role}`);
        let detail = `- **${name}** (${role}) [${teamLabel}]: ${description}`;

        switch (role) {
            case Role.Merlin:
                detail += ' Sees all Evil players at night (except Mordred). Must guide Good subtly — if too obvious, the Assassin will identify and kill Merlin.';
                break;
            case Role.Percival:
                detail += ' Sees who Merlin is at night. If Morgana is present, sees two candidates (Merlin + Morgana) but cannot tell which is real.';
                break;
            case Role.Assassin:
                detail += ' Gets one assassination attempt after Good wins 3 missions. Should observe who seems to have hidden knowledge throughout the game.';
                break;
            case Role.Mordred:
                detail += ' Hidden from Merlin at night. Can freely pretend to be Good without being detected by Merlin.';
                break;
            case Role.Morgana:
                detail += ' Appears alongside Merlin to Percival at night, creating confusion. Can actively impersonate Merlin in discussions.';
                break;
            case Role.Oberon:
                detail += ' Evil but isolated — does not see other Evil players at night, and they do not see Oberon. A disadvantage for Evil.';
                break;
        }
        roleDescriptions.push(detail);
    }

    return `## Roles in This Game\n${roleDescriptions.join('\n')}`;
}
