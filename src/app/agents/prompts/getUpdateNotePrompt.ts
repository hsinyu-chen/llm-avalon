import { NoteContext } from '../../models/agent.interface';
import { Role, ROLE_META } from '../../models/role';
import { getNoteTakingGuide } from './getNoteTakingGuidePrompt';
import { I18nService } from '../../i18n/i18n.service';

export function getUpdateNotePrompt(context: NoteContext, myRole: Role, note: string, history: string[], i18n: I18nService): string[] {
    const teamInfo = ROLE_META[myRole].team;

    // Include private system messages (Lady/Excalibur results) so they get consolidated into Note
    const privateMessages = history.length > 0
        ? `\nPrivate system messages you received:\n${history.join('\n')}` : '';

    return [
        `Team: ${teamInfo}. Round: ${context.round}. Players: ${context.playerCount}.`,
        `Your current note (accumulated from ALL previous rounds): "${note || 'empty'}".`,
        `Events this round (including all chat):\n----\n${context.recentEvents.join('\n')}\n----`,
        privateMessages,
        ``,
        `⚠️ CRITICAL: As soon as this step ends, ALL chat and round events will be WIPED from your context.`,
        `This is your ONLY CHANCE to transfer important findings, suspicious statements, or voting patterns into your permanent NOTE.`,
        ``,
        `UPDATE your note by MERGING new information INTO your existing note.`,
        `CRITICAL: Your note is your ONLY memory across rounds. If you drop old info, you LOSE it forever.`,
        myRole !== Role.LoyalServant && myRole !== Role.Oberon
            ? `⚠️ WARNING ON DEDUCTIONS: Aside from your initial Night Phase Intel, EVERY deduction you make about other players is an UNCERTAIN INFERENCE, not a confirmed fact. Do not treat your guesses as 100% truth. Distinguish between hard facts (e.g. "Round 1 failed with 1 fail") and your subjective guesses (e.g. "I suspect P2 is Evil").`
            : `⚠️ CRITICAL: You received NO Night Phase Intel at the start of the game. EVERY single deduction you make is an UNCERTAIN INFERENCE. Do NOT invent system notifications or hallucinate "Confirmed Evil" allies. Distinguish between hard facts (e.g. "Round 1 failed with 1 fail") and your subjective guesses. Use tags like (Guess) or (Unconfirmed), and DO NOT use "Confirmed".`,
        getNoteTakingGuide(myRole),
        `Write the note content in Markdown format and use the language: ${i18n.translate('setup.languageName')}.`
    ];
}
