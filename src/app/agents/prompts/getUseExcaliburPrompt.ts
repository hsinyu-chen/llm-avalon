import { ExcaliburContext } from '../../models/agent.interface';

export function getUseExcaliburPrompt(context: ExcaliburContext): string[] {
    const holdersStr = context.missionCardHolderIds
        .map(id => `${context.playerNames[id] || id}(${id})`)
        .join(', ');

    return [
        `You hold Excalibur this round.`,
        `Mission card holders: ${holdersStr}.`,
        `You may switch one player's mission card (Success↔Fail). You will see the original card.`,
        `This can rescue (flip Fail→Success) or sabotage (flip Success→Fail).`,
        `Return null to skip.`
    ];
}
