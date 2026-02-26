import { LadyContext } from '../../models/agent.interface';

export function getUseLadyOfTheLakePrompt(context: LadyContext): string[] {
    const historyText = (context.ladyHistory || []).map(h => `${context.playerNames[h.holderId] || h.holderId} inspected ${context.playerNames[h.targetId] || h.targetId}, claimed: ${h.claim || 'unknown'}`).join('\n');

    return [
        `You hold the Lady of the Lake.`,
        `Round ${context.round} mission just ended.`,
        `You may inspect one player's true alignment (Good/Evil).`,
        `Cannot inspect yourself or any previous Lady holder.`,
        `Inspection history:\n${historyText}`,
        `Goal: help your faction win — find enemy players!`
    ];
}
