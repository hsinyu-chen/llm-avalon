import { Role, ROLE_META, Team } from '../../models/role';

export function getNoteTakingGuide(myRole: Role): string {
    let labels: string;
    let roleSpecific = '';

    switch (myRole) {
        case Role.Merlin:
            labels = `- **Merlin** labels: 🔴Confirmed Evil (from night intel) / ✅Trusted Good / ❓Unknown (Mordred may hide from you)`;
            roleSpecific = `### 4. Role-Specific Section: Merlin\n- [Stealth Assessment]: Am I being too obvious? Has anyone noticed my accuracy? Rate exposure risk (1-5).`;
            break;
        case Role.Percival:
            labels = `- **Percival** labels: 🔮Merlin-or-Morgana candidate / ✅Trusted / ⚠️Suspect / ❓Unknown`;
            roleSpecific = `### 4. Role-Specific Section: Percival\n- [Shield Strategy]: Am I drawing enough attention away from Merlin?`;
            break;
        case Role.Assassin:
            labels = `- **Evil** labels: 👥Evil Ally (use for your teammates) / 🎯Threat(Merlin?) / 🎭Oberon-Candidate / 🛡️Gullible(Good) / 📢Loud-Decoy / ❓Unknown Good\n  - 🚨 EVIL DEDUCTION RULE (CRITICAL): You ALREADY KNOW who your Evil allies are (except Oberon, if in game). Therefore, ANY player NOT in your Night Phase Intel CANNOT be Morgana, Mordred, or an Assassin! Unknown players are mathematically GUARANTEED to be either Good or Oberon. NEVER suspect an unknown player of being Morgana!`;
            roleSpecific = `### 4. Role-Specific Section: Assassin\n- [Merlin Hunt]: Who is Merlin? Evaluate the behavior of the Good players.`;
            break;
        case Role.Oberon:
            labels = `- **Oberon** labels: 👥Potential Evil Ally / 🎯Threat(Merlin?) / 🛡️Gullible(Good) / 📢Loud-Decoy / ❓Unknown\n  - 🚨 OBERON WARNING: You DO NOT know who your Evil allies are. Every unknown player could be Good or an Evil ally. Evaluate players to find your hidden teammates while sabotaging Good. NEVER use "✅Trusted" for Good players!`;
            roleSpecific = `### 4. Role-Specific Section: Oberon\n- [Ally Search]: Who might be your Evil allies? Look for players subtly trying to fail missions or defending you.`;
            break;
        case Role.Morgana:
            labels = `- **Evil** labels: 👥Evil Ally (use for your teammates) / 🎯Threat(Merlin/Percival?) / 🎭Oberon-Candidate / 🛡️Gullible(Good) / 📢Loud-Decoy / ❓Unknown Good\n  - 🚨 EVIL DEDUCTION RULE (CRITICAL): You ALREADY KNOW who your Evil allies are (except Oberon, if in game). Therefore, ANY player NOT in your Night Phase Intel CANNOT be Mordred or an Assassin! Unknown players are mathematically GUARANTEED to be either Good or Oberon. NEVER suspect an unknown player of being a known Evil role!`;
            roleSpecific = `### 4. Role-Specific Section: Morgana\n- [Percival Deception]: Am I successfully posing as Merlin? Who might be Percival?`;
            break;
        case Role.Mordred:
            labels = `- **Evil** labels: 👥Evil Ally (use for your teammates) / 🎯Threat(Merlin/Percival?) / 🎭Oberon-Candidate / 🛡️Gullible(Good) / 📢Loud-Decoy / ❓Unknown Good\n  - 🚨 EVIL DEDUCTION RULE (CRITICAL): You ALREADY KNOW who your Evil allies are (except Oberon, if in game). Therefore, ANY player NOT in your Night Phase Intel CANNOT be Morgana or an Assassin! Unknown players are mathematically GUARANTEED to be either Good or Oberon. NEVER suspect an unknown player of being a known Evil role!`;
            roleSpecific = `### 4. Role-Specific Section: Mordred\n- [Infiltration]: Merlin does NOT know my identity. Am I using this ultimate disguise to infiltrate the Good team?`;
            break;
        default:
            if (ROLE_META[myRole].team === Team.Evil) {
                labels = `- **Evil** labels: 👥Evil Ally (use for your teammates) / 🎯Threat(Merlin/Percival?) / 🎭Oberon-Candidate / 🛡️Gullible(Good) / 📢Loud-Decoy / ❓Unknown Good\n  - 🚨 EVIL DEDUCTION RULE (CRITICAL): You ALREADY KNOW who your Evil allies are (except Oberon). Therefore, ANY player NOT in your Night Phase Intel CANNOT be Morgana, Mordred, or an Assassin! Unknown players are mathematically GUARANTEED to be either Good or Oberon. NEVER suspect an unknown player of being Morgana!`;
            } else {
                labels = `- **Good (default)** labels: ✅Trusted / ⚠️Suspect / ❓Unknown`;
            }
            break;
    }

    return `## Note-Taking Guide

### 📝 Formatting Rules (CRITICAL)
- **Markdown Only**: Always use Markdown headers, bolding, and lists for structure.

Your PRIVATE NOTE is your ONLY memory across rounds. Structure your note with these sections:

### 1. [Player Analysis]
For EACH player (excluding yourself), assign a status label and note key evidence.
⚠️ If you have SECRET INTEL from the Night Phase, USE IT.

Use these labels:
${labels}

### 2. [Key Deductions]
What deductions can you make? (e.g., "Mission 2 failed with 1 fail card. Team was X,Y,Z. One of them is Evil.")
⚠️ DEDUCTIVE MATH (CRITICAL): Pay close attention to the number of Fail cards! If the number of Fail cards equals the number of players on the team (e.g. 2 fails on a 2-person mission), EVERY SINGLE PLAYER on that team is 100% Confirmed Evil! Update your labels immediately!

### 3. [Strategy]
Tactical plans for the next round.
${roleSpecific ? '\n' + roleSpecific : ''}

### Tactical Advice
- Dynamic Re-evaluation: Update labels as new evidence emerges.
- Deep Wolf Awareness: A "Success" on a mission does not guarantee everyone on the team is Good.
- KEEP important prior suspicions and confirmed alignments.
- ADD new observations and UPDATE changed assessments.`;
}
