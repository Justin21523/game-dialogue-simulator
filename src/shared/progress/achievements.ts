import type { AchievementDefinition, AchievementState, StatisticsState } from '../types/Progress';

export type RarityInfo = { name: string; color: string; points: number };
export type CategoryInfo = { name: string; icon: string };

export type AchievementView = AchievementDefinition & {
    unlocked: boolean;
    progress: number;
    target: number;
    progressPercent: number;
    rarityInfo: RarityInfo;
    categoryInfo: CategoryInfo;
};

export type AchievementUnlock = {
    id: string;
    definition: AchievementDefinition;
    points: number;
};

export const RARITY_TIERS: Record<string, RarityInfo> = {
    common: { name: 'Common', color: '#9e9e9e', points: 10 },
    uncommon: { name: 'Uncommon', color: '#4caf50', points: 25 },
    rare: { name: 'Rare', color: '#2196f3', points: 50 },
    epic: { name: 'Epic', color: '#9c27b0', points: 100 },
    legendary: { name: 'Legendary', color: '#ff9800', points: 200 }
};

export const ACHIEVEMENT_CATEGORIES: Record<string, CategoryInfo> = {
    milestone: { name: 'Milestone', icon: 'star' },
    mission_type: { name: 'Mission Expert', icon: 'briefcase' },
    exploration: { name: 'Exploration', icon: 'globe' },
    character: { name: 'Character', icon: 'users' },
    performance: { name: 'Performance', icon: 'trophy' },
    progression: { name: 'Progression', icon: 'trending-up' },
    economy: { name: 'Economy', icon: 'dollar-sign' },
    special: { name: 'Special', icon: 'award' },
    ai_generated: { name: 'AI Generated', icon: 'robot' },
    seasonal: { name: 'Seasonal', icon: 'calendar' },
    secret: { name: 'Secret', icon: 'question' }
};

export function createDefaultAchievementState(): AchievementState {
    return {
        unlocked: [],
        progress: {},
        totalPoints: 0,
        customDefinitions: {}
    };
}

export function getBaseAchievementDefinitions(): Record<string, AchievementDefinition> {
    return {
        first_flight: {
            id: 'first_flight',
            name: 'First Flight',
            description: 'Complete your first mission',
            category: 'milestone',
            condition: { type: 'missions_completed', count: 1 },
            reward: { money: 100, experience: 50 },
            rarity: 'common'
        },
        delivery_rookie: {
            id: 'delivery_rookie',
            name: 'Delivery Rookie',
            description: 'Complete 5 delivery missions',
            category: 'mission_type',
            condition: { type: 'mission_type_completed', mission_type: 'delivery', count: 5 },
            reward: { money: 200, experience: 100 },
            rarity: 'common'
        },
        delivery_expert: {
            id: 'delivery_expert',
            name: 'Delivery Expert',
            description: 'Complete 25 delivery missions',
            category: 'mission_type',
            condition: { type: 'mission_type_completed', mission_type: 'delivery', count: 25 },
            reward: { money: 500, experience: 300 },
            rarity: 'rare'
        },
        sports_fan: {
            id: 'sports_fan',
            name: 'Sports Fan',
            description: 'Complete 10 sports missions',
            category: 'mission_type',
            condition: { type: 'mission_type_completed', mission_type: 'sports', count: 10 },
            reward: { money: 300, experience: 150 },
            rarity: 'uncommon'
        },
        ['constructor']: {
            id: 'constructor',
            name: 'Constructor',
            description: 'Complete 10 construction missions',
            category: 'mission_type',
            condition: { type: 'mission_type_completed', mission_type: 'construction', count: 10 } as const,
            reward: { money: 300, experience: 150 },
            rarity: 'uncommon' as const
        },
        animal_friend: {
            id: 'animal_friend',
            name: 'Animal Friend',
            description: 'Complete 10 animal care missions',
            category: 'mission_type',
            condition: { type: 'mission_type_completed', mission_type: 'animal_care', count: 10 },
            reward: { money: 300, experience: 150 },
            rarity: 'uncommon'
        },
        world_traveler: {
            id: 'world_traveler',
            name: 'World Traveler',
            description: 'Complete missions in 5 different locations',
            category: 'exploration',
            condition: { type: 'unique_locations', count: 5 },
            reward: { money: 400, experience: 200 },
            rarity: 'uncommon'
        },
        globe_trotter: {
            id: 'globe_trotter',
            name: 'Globe Trotter',
            description: 'Complete missions in all locations',
            category: 'exploration',
            condition: { type: 'all_locations_visited', count: 12 },
            reward: { money: 1000, experience: 500 },
            rarity: 'legendary'
        },
        team_player: {
            id: 'team_player',
            name: 'Team Player',
            description: 'Use 4 different characters',
            category: 'character',
            condition: { type: 'unique_characters_used', count: 4 },
            reward: { money: 300, experience: 150 },
            rarity: 'uncommon'
        },
        full_squad: {
            id: 'full_squad',
            name: 'Full Squad',
            description: 'Use all 8 characters',
            category: 'character',
            condition: { type: 'unique_characters_used', count: 8 },
            reward: { money: 800, experience: 400 },
            rarity: 'rare'
        },
        jett_master: {
            id: 'jett_master',
            name: 'Jett Master',
            description: 'Complete 20 missions with Jett',
            category: 'character',
            condition: { type: 'character_missions', character_id: 'jett', count: 20 },
            reward: { money: 400, experience: 200 },
            rarity: 'rare'
        },
        flip_champion: {
            id: 'flip_champion',
            name: 'Flip Champion',
            description: 'Complete 15 sports missions with Flip',
            category: 'character',
            condition: { type: 'character_mission_type', character_id: 'flip', mission_type: 'sports', count: 15 },
            reward: { money: 500, experience: 250 },
            rarity: 'rare'
        },
        perfect_streak: {
            id: 'perfect_streak',
            name: 'Perfect Streak',
            description: 'Complete 5 missions in a row successfully',
            category: 'performance',
            condition: { type: 'success_streak', count: 5 },
            reward: { money: 300, experience: 150 },
            rarity: 'uncommon'
        },
        unstoppable: {
            id: 'unstoppable',
            name: 'Unstoppable',
            description: 'Complete 10 missions in a row successfully',
            category: 'performance',
            condition: { type: 'success_streak', count: 10 },
            reward: { money: 600, experience: 300 },
            rarity: 'rare'
        },
        speed_demon: {
            id: 'speed_demon',
            name: 'Speed Demon',
            description: 'Complete 10 missions faster than expected',
            category: 'performance',
            condition: { type: 'fast_completion', count: 10 },
            reward: { money: 400, experience: 200 },
            rarity: 'rare'
        },
        level_5_character: {
            id: 'level_5_character',
            name: 'Rising Hero',
            description: 'Level up any character to level 5',
            category: 'progression',
            condition: { type: 'character_level', level: 5 },
            reward: { money: 300, experience: 150 },
            rarity: 'uncommon'
        },
        level_10_character: {
            id: 'level_10_character',
            name: 'Veteran Hero',
            description: 'Level up any character to level 10',
            category: 'progression',
            condition: { type: 'character_level', level: 10 },
            reward: { money: 600, experience: 300 },
            rarity: 'rare'
        },
        mission_50: {
            id: 'mission_50',
            name: 'Fifty Missions',
            description: 'Complete 50 missions',
            category: 'milestone',
            condition: { type: 'missions_completed', count: 50 },
            reward: { money: 500, experience: 250 },
            rarity: 'rare'
        },
        mission_100: {
            id: 'mission_100',
            name: 'Century Hero',
            description: 'Complete 100 missions',
            category: 'milestone',
            condition: { type: 'missions_completed', count: 100 },
            reward: { money: 1000, experience: 500 },
            rarity: 'epic'
        },
        rich_pilot: {
            id: 'rich_pilot',
            name: 'Rich Pilot',
            description: 'Earn a total of 10,000 coins',
            category: 'economy',
            condition: { type: 'total_money_earned', count: 10000 },
            reward: { money: 500, experience: 250 },
            rarity: 'rare'
        },
        event_handler: {
            id: 'event_handler',
            name: 'Event Handler',
            description: 'Successfully resolve 20 random events',
            category: 'special',
            condition: { type: 'events_resolved', count: 20 },
            reward: { money: 400, experience: 200 },
            rarity: 'uncommon'
        },
        helper_supreme: {
            id: 'helper_supreme',
            name: 'Helper Supreme',
            description: 'Help 30 different NPCs',
            category: 'special',
            condition: { type: 'unique_npcs_helped', count: 30 },
            reward: { money: 700, experience: 350 },
            rarity: 'epic'
        }
    };
}

export function getAllAchievementDefinitions(state: AchievementState): Record<string, AchievementDefinition> {
    return { ...getBaseAchievementDefinitions(), ...state.customDefinitions };
}

export function getAchievementSummary(state: AchievementState): { unlocked: number; total: number; percentage: number; points: number } {
    const total = Object.keys(getAllAchievementDefinitions(state)).length;
    const unlocked = state.unlocked.length;
    const percentage = total > 0 ? Math.round((unlocked / total) * 100) : 0;
    return { unlocked, total, percentage, points: state.totalPoints };
}

export function getAllAchievements(state: AchievementState, stats: StatisticsState): AchievementView[] {
    const definitions = getAllAchievementDefinitions(state);
    const items: AchievementView[] = [];

    for (const [id, def] of Object.entries(definitions)) {
        const progress = getProgressForCondition(def.condition, stats, state);
        const target = getTargetForCondition(def.condition);
        const unlocked = state.unlocked.includes(id);
        const rarityInfo = RARITY_TIERS[def.rarity] ?? RARITY_TIERS.common;
        const categoryInfo = ACHIEVEMENT_CATEGORIES[def.category] ?? { name: String(def.category), icon: 'star' };
        const progressPercent = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;

        items.push({
            ...def,
            unlocked,
            progress,
            target,
            progressPercent,
            rarityInfo,
            categoryInfo
        });
    }

    return items;
}

export function checkForNewUnlocks(state: AchievementState, stats: StatisticsState): { next: AchievementState; unlocked: AchievementUnlock[] } {
    const definitions = getAllAchievementDefinitions(state);
    const unlockedNow: AchievementUnlock[] = [];
    let next: AchievementState = { ...state, progress: { ...state.progress } };

    for (const [id, def] of Object.entries(definitions)) {
        if (next.unlocked.includes(id)) continue;
        const progress = getProgressForCondition(def.condition, stats, next);
        next.progress[id] = progress;

        if (isConditionMet(def.condition, stats, next)) {
            const rarityPoints = RARITY_TIERS[def.rarity]?.points ?? 0;
            next = {
                ...next,
                unlocked: [...next.unlocked, id],
                totalPoints: next.totalPoints + rarityPoints
            };
            unlockedNow.push({ id, definition: def, points: rarityPoints });
        }
    }

    return { next, unlocked: unlockedNow };
}

export function addCustomAchievement(state: AchievementState, def: AchievementDefinition): AchievementState {
    if (!def.id) return state;
    const definitions = getAllAchievementDefinitions(state);
    if (definitions[def.id]) return state;

    return { ...state, customDefinitions: { ...state.customDefinitions, [def.id]: def } };
}

export function importAchievementsFromJson(state: AchievementState, defs: AchievementDefinition[] | Record<string, AchievementDefinition>): AchievementState {
    let next = state;
    const items = Array.isArray(defs) ? defs : Object.values(defs);
    for (const def of items) {
        next = addCustomAchievement(next, def);
    }
    return next;
}

function getTargetForCondition(condition: AchievementDefinition['condition']): number {
    if (condition.type === 'character_level') return condition.level;
    return condition.count;
}

function isConditionMet(condition: AchievementDefinition['condition'], stats: StatisticsState, state: AchievementState): boolean {
    const progress = getProgressForCondition(condition, stats, state);
    if (condition.type === 'character_level') return progress >= condition.level;
    return progress >= condition.count;
}

function getProgressForCondition(
    condition: AchievementDefinition['condition'],
    stats: StatisticsState,
    state: AchievementState
): number {
    switch (condition.type) {
        case 'missions_completed':
            return stats.missionsCompleted;

        case 'mission_type_completed':
            return stats.missionsByType[condition.mission_type] ?? 0;

        case 'unique_locations':
        case 'all_locations_visited':
            return stats.locationsVisited.length;

        case 'unique_characters_used':
            return stats.charactersUsed.length;

        case 'character_missions':
            return stats.missionsByCharacter[condition.character_id] ?? 0;

        case 'character_mission_type':
            return state.progress[`${condition.character_id}_${condition.mission_type}`] ?? 0;

        case 'success_streak':
            return stats.bestStreak;

        case 'fast_completion':
            return stats.fastCompletions;

        case 'character_level':
            return stats.highestCharacterLevel;

        case 'total_money_earned':
            return stats.totalMoneyEarned;

        case 'events_resolved':
            return (stats as unknown as { eventsResolved?: number }).eventsResolved ?? 0;

        case 'unique_npcs_helped':
            return stats.uniqueNPCsHelped.length;
    }
}
