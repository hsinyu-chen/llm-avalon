import { Role } from '../../models/role';

export function getPhaseSpecificRoleHintsPrompt(uniqueRoles: Role[]): string | null {
    const phaseHints: string[] = [];

    // Default discussion hints
    const defaultHints: string[] = [];
    if (uniqueRoles.includes(Role.Merlin)) {
        defaultHints.push(`- **Merlin** during discussion: Do NOT be the most aggressive voice pushing to exclude Evil players. Let others lead the charge. If you are too precise in your accusations, the Assassin will identify you. Be subtle — agree with correct opinions rather than originating them.`);
    }
    if (uniqueRoles.includes(Role.Percival)) {
        defaultHints.push(`- **Percival** during discussion: Your job is to PROTECT Merlin by being the loudest, most opinionated Good player. Take strong positions, make yourself look like the one with hidden knowledge. The Assassin should want to kill YOU, not Merlin.`);
    }
    if (defaultHints.length > 0) {
        phaseHints.push(`### During Normal Discussion\n${defaultHints.join('\n')}`);
    }

    // Assassination discussion hints
    const assassinHints: string[] = [];
    if (uniqueRoles.includes(Role.Merlin)) {
        assassinHints.push(`- **Merlin** — FINAL SURVIVAL (LIFE OR DEATH):
  - You MUST NOT stand out as the one with perfect knowledge. The Assassin is watching every word.
  - DEFLECT: Attribute your correct calls to other players' logic, say "I just followed [player]'s reasoning" or "I got lucky with my guesses".
  - CLAIM IGNORANCE: Express surprise at the 3-0 result. Say you were nervous the whole time.
  - POINT ELSEWHERE: Subtly suggest another Good player seemed to have the best reads. Make the Assassin think someone else was the mastermind.
  - DO NOT PANIC: Acting too defensive or too humble is also suspicious. Be natural.`);
    }
    if (uniqueRoles.includes(Role.Percival)) {
        assassinHints.push(`- **Percival** — DRAW THE ASSASSIN'S FIRE:
  - This is your MOST IMPORTANT moment. You MUST make the Assassin believe YOU are Merlin.
  - CLAIM CREDIT AGGRESSIVELY: Say things like "I knew who was Evil from the start", "My reads were never wrong", "I guided this team to victory".
  - ACT OMNISCIENT: Speak with absolute confidence as if you had secret knowledge the whole time.
  - DISMISS MERLIN: If players point at the real Merlin, casually downplay them — "They just went along with the group".
  - Your DEATH is a VICTORY. If the Assassin kills you instead of Merlin, Good wins!`);
    }
    if (uniqueRoles.includes(Role.LoyalServant)) {
        assassinHints.push(`- **Loyal Servant** — PROTECT MERLIN:
  - Claim credit for good decisions. Say "I was the one pushing for the right team" or "My vote patterns prove I had the best instincts".
  - The more Good players who claim to be the mastermind, the harder it is for the Assassin to find the real Merlin.`);
    }
    if (assassinHints.length > 0) {
        phaseHints.push(`### During Assassination Discussion\n${assassinHints.join('\n')}`);
    }

    if (phaseHints.length > 0) {
        return `## Phase-Specific Role Hints\n\n${phaseHints.join('\n\n')}`;
    }

    return null;
}
