export function getLadyRulePrompt(): string {
  return `## Expansion: Lady of the Lake

- At game start, the Lady token goes to the player right of the Leader.
- After missions 2, 3, and 4, the Lady holder may:
  - Inspect one player's true alignment (Good/Evil). Cannot inspect self or previous Lady holders.
  - The inspected player must answer truthfully.
  - The Lady token then passes to the inspected player.
- The holder may publicly announce or hide the result (credibility matters).`;
}
