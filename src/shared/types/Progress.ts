export type SessionStats = {
    currentSessionStart: number | null;
    currentSessionDuration: number;
    longestSession: number;
    averageSessionDuration: number;
    totalSessionCount: number;
    missionsThisSession: number;
};

export type PerformanceMetrics = {
    missionTimes: number[];
    averageMissionTime: number;
    fastestMissionTime: number | null;
    slowestMissionTime: number | null;
    successRate: number;
    averageScore: number;
};

export type EconomyStats = {
    moneyFlow: Array<{ timestamp: number; amount: number; reason: string }>;
    netWorth: number;
    peakNetWorth: number;
    totalEarnings: number;
    totalSpendings: number;
    averageRewardPerMission: number;
};

export type ExplorationStats = {
    totalFlightDistance: number;
    longestFlight: number;
    averageFlightDistance: number;
    collectiblesFound: {
        coins: number;
        powerups: number;
        treasures: number;
    };
    countriesVisited: string[];
    continentsVisited: string[];
};

export type StatisticsState = {
    missionsCompleted: number;
    missionsFailed: number;
    missionsByType: Record<string, number>;
    missionsByCharacter: Record<string, number>;

    locationsVisited: string[];
    uniqueNPCsHelped: string[];

    totalMoneyEarned: number;
    totalMoneySpent: number;
    highestMoney: number;

    totalFlightTime: number;
    coinsCollected: number;
    obstaclesHit: number;
    totalDistance: number;
    boostsUsed: number;

    currentStreak: number;
    bestStreak: number;
    perfectMissions: number;
    fastCompletions: number;

    charactersUsed: string[];
    characterLevelUps: number;
    highestCharacterLevel: number;

    totalPlayTime: number;
    firstPlayDate: string | null;
    lastPlayDate: string | null;
    totalSessions: number;

    achievementPoints: number;
    achievementsUnlocked: number;

    sessionStats: SessionStats;
    performanceMetrics: PerformanceMetrics;
    economyStats: EconomyStats;
    explorationStats: ExplorationStats;
};

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type AchievementCategory =
    | 'milestone'
    | 'mission_type'
    | 'exploration'
    | 'character'
    | 'performance'
    | 'progression'
    | 'economy'
    | 'special'
    | 'ai_generated'
    | 'seasonal'
    | 'secret';

export type AchievementReward = {
    money?: number;
    experience?: number;
};

export type AchievementCondition =
    | { type: 'missions_completed'; count: number }
    | { type: 'mission_type_completed'; mission_type: string; count: number }
    | { type: 'unique_locations'; count: number }
    | { type: 'all_locations_visited'; count: number }
    | { type: 'unique_characters_used'; count: number }
    | { type: 'character_missions'; character_id: string; count: number }
    | { type: 'character_mission_type'; character_id: string; mission_type: string; count: number }
    | { type: 'success_streak'; count: number }
    | { type: 'fast_completion'; count: number }
    | { type: 'character_level'; level: number }
    | { type: 'total_money_earned'; count: number }
    | { type: 'events_resolved'; count: number }
    | { type: 'unique_npcs_helped'; count: number };

export type AchievementDefinition = {
    id: string;
    name?: string;
    name_zh?: string;
    description?: string;
    description_zh?: string;
    category: AchievementCategory | string;
    condition: AchievementCondition;
    reward?: AchievementReward;
    rarity: AchievementRarity;
};

export type AchievementState = {
    unlocked: string[];
    progress: Record<string, number>;
    totalPoints: number;
    customDefinitions: Record<string, AchievementDefinition>;
};

