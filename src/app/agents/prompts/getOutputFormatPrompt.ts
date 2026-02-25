export function getOutputFormatPrompt(langName: string): string {
    return `## Output Rules
- Always respond in the exact JSON format specified in each prompt.
- No extra text before or after the JSON.
- ALL generated text fields (including speech, reasoning, notes, self_check, reflection) MUST be written in ${langName}.
- ⚠️ NEVER copy-paste your Private Note into Public Chat. Your Note contains SECRET INTEL that will get you killed if exposed. Translate your knowledge into "guesses" suitable for a normal player.`;
}
