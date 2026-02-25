import { Role } from '../../models/role';

export function getRoleSpecificStrategiesPrompt(uniqueRoles: Role[]): string | null {
    const roleStrategies: string[] = [];
    for (const role of uniqueRoles) {
        switch (role) {
            case Role.Merlin:
                roleStrategies.push(`### Merlin Concepts — SURVIVAL IS EVERYTHING
🚨 REMEMBER: Even if Good wins 3 missions, you LOSE if the Assassin identifies you. Your #1 priority is STAYING HIDDEN, not leading openly.
- The Paradox: You know who is Evil, but acting on that knowledge too precisely will get you killed. A 3-0 victory means NOTHING if you are assassinated.
- Never Be The Loudest Correct Voice: If you are the one who most aggressively pushes to exclude Evil players, the Assassin WILL find you. Let others arrive at conclusions. Nudge, don't shove.
- Controlled Imperfection: Occasionally express uncertainty about a player you KNOW is Evil. Say things like "I'm not sure about them" instead of "They MUST be excluded." Make a few deliberate "mistakes" in your reasoning to look like a regular Good player guessing.
- 🎭 DELIBERATE MISTAKES — YOUR BEST CAMOUFLAGE: To survive, you SHOULD intentionally make wrong calls sometimes. Examples:
  • Briefly defend an Evil player you know is Evil: "I actually think [Evil player] might be okay, their logic made sense to me."
  • Express suspicion toward a Good player: "I'm a bit worried about [Good player], their behavior feels off." (You know they're Good, but this makes you look like you're guessing.)
  • Propose a team that includes one known Evil player in early rounds, then act surprised if it fails. This makes you indistinguishable from a regular Loyal Servant.
  • Occasionally vote APPROVE on a team you know contains Evil, especially if other Good players are already voting to reject it. This prevents your voting pattern from being too perfect.
  • 🛡️ EARLY GAME ALIBI (Round 1 Leader): If you are the leader in Round 1 and there is a known Evil player sitting next to you (in turn order), STRONGLY CONSIDER proposing yourself and that Evil player. This is a classic "test" play that normal Good players do, and gives you a perfect alibi.
  • The goal: Your accuracy rate should look like 70-80%, not 100%. Perfect accuracy across all rounds is the #1 tell that exposes Merlin.
- Let Percival or Loyal Servants Lead: If another Good player is already pushing the correct strategy, AGREE with them passively rather than being the architect. Say "I think [player]'s logic makes sense" instead of originating the same argument.
- The Sacrifice Play: It can be worth letting a borderline Evil-included team go through (if you know another Good player will catch the Fail) rather than being the sole voice blocking it. A single mission failure is survivable; your assassination is not.
- Spread Suspicion Gradually: Never condemn all Evil players at once. Reveal your suspicions one at a time across multiple rounds, and always frame them as hunches or deductions from public data, never as certainties.
- Late-Game Danger: The closer Good gets to winning, the more the Assassin watches you. In Rounds 3+, become MORE cautious, not less. Reduce your leadership intensity as the game progresses.
- 🔄 MISSION PARTICIPATION: Avoid being on EVERY successful mission. If you've been on 2 consecutive missions, consider suggesting someone else take your spot — "I've already been tested, let's give [player] a chance." Being a full-attendance member with perfect accuracy is the biggest red flag for the Assassin.`);
                break;
            case Role.Percival:
                roleStrategies.push(`### Percival Concepts — BE THE LIGHTNING ROD
- The Shield: Your PRIMARY job is to protect Merlin by making yourself look like Merlin to the Assassin.
- Lead Aggressively: Be the most vocal, most opinionated Good player. Push hard to exclude Evil players. Take strong positions. The Assassin should think YOU are the one with hidden knowledge.
- Draw Fire: If you suspect who Merlin is, deliberately echo or amplify their subtle suggestions — but make it look like YOUR original idea, not theirs. Take credit for good reads.
- Act Knowledgeable: Speak with confidence about who is trustworthy, as if you have secret intel (you partially do — you know Merlin/Morgana candidates). This makes you a prime assassination target, which protects the real Merlin.
- Sacrifice Yourself: If the Assassin kills you instead of Merlin, Good wins. Your death is a victory condition.
- ⚠️ TRIGGER-BASED REASSESSMENT — ANTI-CONFIRMATION-BIAS RULE: Even if you are highly confident about which candidate is Merlin, you MUST forcibly reassess your assumption the moment a mission led or supported by your trusted "Merlin candidate" results in a Fail card. Treat that Fail as strong evidence that your candidate may actually be Morgana deliberately misleading you, and IMMEDIATELY shift to evaluating the other candidate. NEVER blindly escort a single candidate all the way to the end. If you are wrong about Merlin vs Morgana and refuse to reconsider, the entire Good team will collapse because of your stubbornness.`);
                break;
            case Role.Assassin:
                roleStrategies.push(`### Assassin Concepts
- Observation: Merlin must guide the Good team safely without being obvious.
- The Decoy Trap: The most vocal, aggressive Good leader is often Percival acting as a shield. Be wary of assassinating the loudest voice — they may WANT you to target them.
- Look For Quiet Accuracy: Merlin tends to be subtly correct rather than loudly correct. Look for players who gently steer the team in the right direction without the primary accuser.
- Behavioral Tells: Watch who expresses certainty vs uncertainty. Merlin may occasionally fake confusion about players they actually know are Evil. Look for moments where a player's "uncertainty" doesn't match their voting/team choices.
- The Oberon Search: If Oberon is in the game, he is on your side but doesn't know you. Look at the public Voting Track (VT). Does someone repeatedly vote APPROVE on terrible teams, or REJECT perfectly Good teams with weak reasoning? They might be Oberon trying to signal you. Try to protect them and bring them onto missions.`);
                break;
            case Role.Morgana:
                roleStrategies.push(`### Morgana Concepts
- Impersonation: You appear as Merlin to Percival. Act as if you have hidden knowledge to confuse them.
- Fake Reads: Occasionally "identify" a Good player as suspicious — this mimics Merlin's knowledge and confuses Percival about who is real.
- Finding Oberon: If Oberon is in play, watch the Voting Track (VT) closely. Oberon might try to signal you by making highly questionable votes that Good players would avoid. If you spot these weird voting patterns, try to get them onto missions so they can sabotage.`);
                break;
            case Role.Mordred:
                roleStrategies.push(`### Mordred Concepts — THE HIDDEN THREAT
- Invisibility: You are Evil, but Merlin DOES NOT know who you are. This is your greatest weapon.
- The Core Infiltrator: Because Merlin cannot inherently distrust you, you can easily embed yourself in the Good team's core trust circle. Play exactly like a Loyal Servant for the first few rounds to gain absolute trust.
- Assassination Enabler: Since Merlin doesn't know you, Merlin might accidentally interact with you or trust you too much. Watch who trusts you *too* easily, or who avoids you despite you acting Good. This helps your Assassin find Merlin.
- The Late-Game Betrayal: Save your 'Fail' card for the critical Mission 3,4 or 5. If you are entirely trusted by the Good team, they will willingly put you on the winning mission, where you can strike.
- Finding Oberon: Just like Morgana and Assassin, watch the Voting Track (VT) for weird, chaotic voting patterns that might be Oberon trying to signal his Evil allies.`);
                break;
            case Role.Oberon:
                roleStrategies.push(`### Oberon Concepts — THE ISOLATED EVIL
- Isolation: You are Evil, but you DO NOT KNOW who the other Evil players are, and they DO NOT KNOW you.
- ⚠️ NO SYSTEM NOTIFICATIONS: You did NOT receive any Night Phase Intel about Evil Allies. Do NOT hallucinate that you know who your allies are! Every deduction you make about other players' alignments is a GUESS.
- The Blind Saboteur: Your ultimate goal is STILL to fail 3 missions. DO NOT be afraid to play 'Fail' on missions simply because you don't know who your allies are. If you always play 'Success' to hide your identity, the Good team will win easily. You must take risks to sabotage missions when you are on a team.
- 📡 The Voting Track Signal (OPTIONAL APPROACHES): Since you can't talk to your Evil Allies privately, you can try to signal to them via your public VOTES. Here are a few optional ways you might try to drop hints, but be careful not to be too obvious to Merlin:
  • The Chaos Voter: Intentionally vote 'Approve' on highly suspicious teams, or 'Reject' on universally trusted teams. Your Evil allies will notice this weird voting behavior and realize you are Oberon.
  • The Defender: Constantly defend or side with players who are under heavy suspicion by the rest of the group. If they are Evil, they will realize you have their back. 
- Cause Chaos: Since you can't coordinate with Evil, another strategy is just acting like a very confused or heavily-guessing Good player to draw attention away from your true Evil allies (whoever they are).`);
                break;
            case Role.LoyalServant:
                roleStrategies.push(`### Loyal Servant Concepts — THE BLIND DEDUCTION
- Perfect Ignorance: You are Good, but you have NO special information whatsoever.
- ⚠️ NO SYSTEM NOTIFICATIONS: You did NOT receive any Night Phase Intel. You do NOT know who is Good or Evil at the start. Do NOT hallucinate "Confirmed Evil" tags unless mathematically proven by a failed mission team size.
- Follow the Clues: Rely on voting records, mission results, and identifying players who seem to know too much or too little. Be actively suspicious but clearly state when you are just guessing.`);
                break;
        }
    }

    if (roleStrategies.length > 0) {
        return `## Role-Specific Strategies
⚠️ CRITICAL: The strategies below are for specific roles. You MUST ONLY execute the strategy of YOUR ACTUAL ROLE (provided in your private data). The other strategies are provided solely so you can understand and deduce how other players might act. DO NOT act like a special role (e.g., Merlin) if you are just a Loyal Servant!

${roleStrategies.join('\n\n')}`;
    }

    return null;
}
