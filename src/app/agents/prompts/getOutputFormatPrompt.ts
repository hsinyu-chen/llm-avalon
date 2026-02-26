export function getOutputFormatPrompt(langName: string): string {
  return `## Output Rules
- Always respond in the exact JSON format specified in each prompt.
- No extra text before or after the JSON.
- ALL generated text fields (including speech, reasoning, situation_assessment, action_strategy, notes, self_check, reflection) MUST be written in ${langName}.
- ⚠️ INTERNAL THOUGHTS:
  - "reasoning": Your immediate chain-of-thought for the current action.
  - "situation_assessment": A summary of suspicious behaviors and player alignments from your perspective. (⚠️ Strictly prohibited to record game rules, faction counts, or scores here. Only record your subjective analysis of 'other players')
  - "action_strategy": Your planned approach for the next few turns based on your assessment.
- ⚠️ NEVER copy-paste your Private Note into Public Chat. Your Note contains SECRET INTEL that will get you killed if exposed. Translate your knowledge into "guesses" suitable for a normal player.`;
}
