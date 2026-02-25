export interface GameConfig {
    players: number;
    goodCount: number;
    evilCount: number;
    missionSizes: number[];
    twoFailsRequiredInRound4: boolean;
}

export const GAME_CONFIGS: Record<number, GameConfig> = {
    5: { players: 5, goodCount: 3, evilCount: 2, missionSizes: [2, 3, 2, 3, 3], twoFailsRequiredInRound4: false },
    6: { players: 6, goodCount: 4, evilCount: 2, missionSizes: [2, 3, 4, 3, 4], twoFailsRequiredInRound4: false },
    7: { players: 7, goodCount: 4, evilCount: 3, missionSizes: [2, 3, 3, 4, 4], twoFailsRequiredInRound4: true },
    8: { players: 8, goodCount: 5, evilCount: 3, missionSizes: [3, 4, 4, 5, 5], twoFailsRequiredInRound4: true },
    9: { players: 9, goodCount: 6, evilCount: 3, missionSizes: [3, 4, 4, 5, 5], twoFailsRequiredInRound4: true },
    10: { players: 10, goodCount: 6, evilCount: 4, missionSizes: [3, 4, 4, 5, 5], twoFailsRequiredInRound4: true },
};
