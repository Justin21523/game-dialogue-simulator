export type ScreenId =
    | 'mainMenu'
    | 'hangar'
    | 'missionBoard'
    | 'briefing'
    | 'flight'
    | 'exploration'
    | 'story'
    | 'results'
    | 'statistics'
    | 'achievements'
    | 'saveLoad';

export type Resources = {
    money: number;
    fuel: number;
};

export type CharacterStatus = 'IDLE' | 'MISSION' | 'RESTING' | 'REPAIR';

export type CharacterState = {
    id: string;
    name: string;
    type: string;
    color: string;
    level: number;
    exp: number;
    energy: number;
    speed: number;
    reliability: number;
    status: CharacterStatus;
};

export type Mission = {
    id: string;
    title: string;
    type: string;
    description: string;
    location: string;
    fuelCost: number;
    rewardMoney: number;
    rewardExp: number;
    campaignId?: string | null;
    campaignTheme?: string | null;
};

export type FlightParams = {
    missionType: string;
    charId: string;
    missionId: string;
};

export type MissionRewards = {
    money: number;
    exp: number;
    bonus: number;
};

export type MissionResult = {
    mission: Mission;
    character: CharacterState;
    success: boolean;
    score: number;
    rewards: MissionRewards;
};
