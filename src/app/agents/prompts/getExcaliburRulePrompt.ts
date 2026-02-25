export function getExcaliburRulePrompt(): string {
    return `## Expansion: Excalibur

- After the Leader proposes a team, the Leader gives Excalibur to one team member (not themselves).
- After mission cards are played (before reveal), the Excalibur holder may:
  - Switch one team member's mission card (Success↔Fail).
  - The holder sees the original card that was replaced.
- Can be used to rescue (flip Fail→Success) or sabotage (flip Success→Fail).
- The holder may choose not to use it.`;
}
