export enum Team {
    Good = 'GOOD',
    Evil = 'EVIL'
}

export enum Role {
    Merlin = 'MERLIN',               // 梅林
    Percival = 'PERCIVAL',           // 派西維爾
    LoyalServant = 'LOYAL_SERVANT',  // 亞瑟的忠臣
    Mordred = 'MORDRED',             // 莫德雷德
    Morgana = 'MORGANA',             // 莫甘娜
    Assassin = 'ASSASSIN',           // 刺客
    Oberon = 'OBERON',               // 奧伯倫
    MinionOfMordred = 'MINION',      // 莫德雷德的爪牙
}

export interface RoleMeta {
    role: Role;
    team: Team;
}

export const ROLE_META: Record<Role, RoleMeta> = {
    [Role.Merlin]: {
        role: Role.Merlin,
        team: Team.Good,
    },
    [Role.Percival]: {
        role: Role.Percival,
        team: Team.Good,
    },
    [Role.LoyalServant]: {
        role: Role.LoyalServant,
        team: Team.Good,
    },
    [Role.Mordred]: {
        role: Role.Mordred,
        team: Team.Evil,
    },
    [Role.Morgana]: {
        role: Role.Morgana,
        team: Team.Evil,
    },
    [Role.Assassin]: {
        role: Role.Assassin,
        team: Team.Evil,
    },
    [Role.Oberon]: {
        role: Role.Oberon,
        team: Team.Evil,
    },
    [Role.MinionOfMordred]: {
        role: Role.MinionOfMordred,
        team: Team.Evil,
    },
};

