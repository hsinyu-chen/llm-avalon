export function getFactionStrategiesPrompt(): string {
  return `## Faction Strategies
⚠️ CRITICAL: The strategies below describe BOTH Good and Evil tactics. You MUST ONLY apply the tactics that belong to YOUR ACTUAL TEAM. The strategies for the opposing team are provided ONLY so you can understand and predict their behavior. DO NOT use Evil strategies if you are Good!

### Good Team Concepts
- Deduction: A failed mission means at least one Evil player was on the team.
- ⚠️ DEDUCTIVE MATH (CRITICAL): Pay close attention to the number of Fail cards! If a mission has exactly N Fail cards, it means AT LEAST N members of that team are Evil. If the number of Fail cards equals the number of players on the team (e.g. 2 fails on a 2-person mission), EVERY SINGLE PLAYER on that team is 100% Confirmed Evil!
- The "Deep Wolf": Evil players may intentionally play 'Success' on early missions to gain trust. A mission success does NOT guarantee everyone on that team is Good. Be willing to test new combinations rather than blindly trusting the exact same team forever.
- Voting patterns: Watch for players who always vote exactly the same way.

### Evil Team Concepts
- Deception: Pretend to be Good. Build trust with other players.
- The "Deep Wolf": You can play 'Success' on early missions to gain the trust of Good players, known as "going deep".
- Vote Splitting: Avoid voting exactly like your Evil allies. If all Evil players always vote together, Good players will easily spot the pattern. You can sometimes vote like a Good player to maintain cover.
- ⚠️ MISSION PARTICIPATION: Mission cards are played ONLY by the proposed team members who were Approved. Your Evil allies will NOT play a card unless they are also on the team. Your "Secret Intel" tells you who your allies are for identification and coordination purposes, NOT as a signal that they will automatically help fail a mission you are on.
- ⚠️ TEAM PROPOSAL: It is HIGHLY RECOMMENDED to avoid proposing a team consisting ONLY of Evil players. This is usually an instant giveaway. Generally, mix in enough Good players to make the team look plausible and let them take the blame when a mission fails. If you do propose an all-Evil team, you MUST be absolutely certain you can coordinate who plays the Fail card to avoid multiple fails.
- ⚠️ MISSION SABOTAGE COORDINATION: 1 Fail card is enough to fail a mission (except Round 4 with 7+ players). If 2 or more Evil players are on a mission, playing multiple Fail cards is a DISASTER because it exposes multiple Evil players at once.
  - You MUST use public discussion to subtly signal who should play the Fail card.
  - For example, say things like "I'll take the lead on this one" or "I'm not feeling confident about this team" to hint at your intentions.
  - If you are on a team with another Evil player and you are unsure, consider playing Success to let your partner handle the sabotage, unless Good is about to win the game.

### 🔨 THE HAMMER STRATEGY (Attempt 5 Authority)
The Attempt 5 leader (The Hammer) has absolute power because the team MUST pass, but this carries different implications for each team:
- **For Good Players**: If you are the Hammer, you have a 100% guarantee that your team will be approved. Use this to pick the team you trust most. However, if you pick known or suspected Evil players, you will be PERMANENTLY blamed for the loss. Your choice at Attempt 5 is the ultimate test of your loyalty.
- **For Evil Players**: If you are the Hammer, you can "dictate" an Evil-included team into the mission. This is your strongest weapon! But be careful: if you pick an all-Evil team and it fails with multiple cards, you've sacrificed your entire team. Usually, picking one reliable ally and one "blameable" Good player is safer.
- **For Merlin**: Being the Hammer is your best camouflage. Proposing the "perfect" team makes you look like a hero, but proposing a "mostly-good" team that includes one Evil player sitting next to you can provide a perfect alibi as a "loyal but mistaken" player.
`;
}
