/**
 * Achievement System for Super Wings Simulator
 * Tracks achievement progress and unlocks achievements
 *
 * Expandable by AI Agents:
 * - Use addAchievement() to dynamically add new achievements
 * - Use importFromJSON() to bulk import AI-generated achievements
 * - Use addCategory() to add new achievement categories
 * - All achievements support Chinese/English localization
 *
 * API for Backend Integration:
 * - window.achievementSystem.addAchievement(definition)
 * - window.achievementSystem.importFromJSON(jsonData)
 * - window.achievementSystem.checkCondition(achievementId)
 * - window.achievementSystem.forceUnlock(achievementId)
 */

import { eventBus } from '../core/event-bus.js';

class AchievementSystem {
    constructor() {
        this.storageKey = 'sw_achievements';
        this.customAchievementsKey = 'sw_custom_achievements';

        // Achievement definitions (base + custom)
        this.definitions = {};
        this.customDefinitions = {};

        // Progress and unlocked status
        this.state = {
            unlocked: [],           // Array of unlocked achievement IDs
            progress: {},           // { achievementId: currentProgress }
            totalPoints: 0
        };

        // Rarity configuration (expandable)
        this.rarityTiers = {
            common: { name: 'Common', color: '#9e9e9e', points: 10 },
            uncommon: { name: 'Uncommon', color: '#4caf50', points: 25 },
            rare: { name: 'Rare', color: '#2196f3', points: 50 },
            epic: { name: 'Epic', color: '#9c27b0', points: 100 },
            legendary: { name: 'Legendary', color: '#ff9800', points: 200 }
        };

        // Category definitions (expandable)
        this.categories = {
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

        // Condition type handlers (expandable)
        this.conditionHandlers = {};
    }

    /**
     * Initialize the achievement system
     */
    init() {
        this.loadDefinitions();
        this.loadCustomDefinitions();
        this.loadState();
        this.registerDefaultConditionHandlers();
        this.subscribeToEvents();

        console.log('[AchievementSystem] Initialized with', Object.keys(this.definitions).length, 'base +', Object.keys(this.customDefinitions).length, 'custom achievements');
    }

    /**
     * Register default condition handlers
     */
    registerDefaultConditionHandlers() {
        // Missions completed
        this.registerConditionHandler('missions_completed', (condition, stats) => {
            return (stats.missionsCompleted || 0) >= condition.count;
        });

        // Mission type completed
        this.registerConditionHandler('mission_type_completed', (condition, stats) => {
            const count = (stats.missionsByType && stats.missionsByType[condition.mission_type]) || 0;
            return count >= condition.count;
        });

        // Unique locations
        this.registerConditionHandler('unique_locations', (condition, stats) => {
            const count = (stats.locationsVisited && stats.locationsVisited.length) || 0;
            return count >= condition.count;
        });

        // All locations visited
        this.registerConditionHandler('all_locations_visited', (condition, stats) => {
            const count = (stats.locationsVisited && stats.locationsVisited.length) || 0;
            return count >= condition.count;
        });

        // Unique characters used
        this.registerConditionHandler('unique_characters_used', (condition, stats) => {
            const count = (stats.charactersUsed && stats.charactersUsed.length) || 0;
            return count >= condition.count;
        });

        // Character missions
        this.registerConditionHandler('character_missions', (condition, stats) => {
            const count = (stats.missionsByCharacter && stats.missionsByCharacter[condition.character_id]) || 0;
            return count >= condition.count;
        });

        // Success streak
        this.registerConditionHandler('success_streak', (condition, stats) => {
            return (stats.bestStreak || 0) >= condition.count;
        });

        // Character level
        this.registerConditionHandler('character_level', (condition, stats) => {
            return (stats.highestCharacterLevel || 1) >= condition.level;
        });

        // Total money earned
        this.registerConditionHandler('total_money_earned', (condition, stats) => {
            return (stats.totalMoneyEarned || 0) >= condition.count;
        });

        // Unique NPCs helped
        this.registerConditionHandler('unique_npcs_helped', (condition, stats) => {
            const count = (stats.uniqueNPCsHelped && stats.uniqueNPCsHelped.length) || 0;
            return count >= condition.count;
        });

        // Custom value check (for AI-generated achievements)
        this.registerConditionHandler('custom_value', (condition, stats) => {
            const value = stats[condition.stat_key] || 0;
            switch (condition.operator) {
                case '>=': return value >= condition.target;
                case '>': return value > condition.target;
                case '==': return value === condition.target;
                case '<=': return value <= condition.target;
                case '<': return value < condition.target;
                default: return value >= condition.target;
            }
        });
    }

    /**
     * Register a custom condition handler
     * @param {string} type - Condition type name
     * @param {function} handler - Function(condition, stats) => boolean
     */
    registerConditionHandler(type, handler) {
        this.conditionHandlers[type] = handler;
    }

    /**
     * Load achievement definitions
     */
    loadDefinitions() {
        // Embedded achievement definitions for frontend use
        this.definitions = {
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
            constructor: {
                id: 'constructor',
                name: 'Constructor',
                description: 'Complete 10 construction missions',
                category: 'mission_type',
                condition: { type: 'mission_type_completed', mission_type: 'construction', count: 10 },
                reward: { money: 300, experience: 150 },
                rarity: 'uncommon'
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

    /**
     * Subscribe to game events for tracking
     */
    subscribeToEvents() {
        if (!eventBus) {
            console.warn('[AchievementSystem] EventBus not found');
            return;
        }

        // Mission completion event
        eventBus.on('MISSION_COMPLETED', (data) => this.checkAllAchievements());

        // Level up event
        eventBus.on('LEVEL_UP', (data) => this.checkLevelAchievements(data));

        // Stats updated event
        eventBus.on('STATS_UPDATED', () => this.checkAllAchievements());
    }

    /**
     * Check all achievements against current stats
     */
    checkAllAchievements() {
        if (!window.statisticsTracker) {
            console.warn('[AchievementSystem] StatisticsTracker not found');
            return;
        }

        const stats = window.statisticsTracker.getAllStats();

        for (const [id, achievement] of Object.entries(this.definitions)) {
            // Skip if already unlocked
            if (this.state.unlocked.includes(id)) continue;

            const progress = this.getProgressForCondition(achievement.condition, stats);
            this.state.progress[id] = progress;

            // Check if condition is met
            if (this.isConditionMet(achievement.condition, stats)) {
                this.unlock(id);
            }
        }

        this.saveState();
    }

    /**
     * Check level-related achievements
     */
    checkLevelAchievements(data) {
        const { newLevel } = data;

        // Check level_5_character
        if (newLevel >= 5 && !this.state.unlocked.includes('level_5_character')) {
            this.unlock('level_5_character');
        }

        // Check level_10_character
        if (newLevel >= 10 && !this.state.unlocked.includes('level_10_character')) {
            this.unlock('level_10_character');
        }
    }

    /**
     * Get progress value for a condition
     */
    getProgressForCondition(condition, stats) {
        switch (condition.type) {
            case 'missions_completed':
                return stats.missionsCompleted || 0;

            case 'mission_type_completed':
                return (stats.missionsByType && stats.missionsByType[condition.mission_type]) || 0;

            case 'unique_locations':
            case 'all_locations_visited':
                return (stats.locationsVisited && stats.locationsVisited.length) || 0;

            case 'unique_characters_used':
                return (stats.charactersUsed && stats.charactersUsed.length) || 0;

            case 'character_missions':
                return (stats.missionsByCharacter && stats.missionsByCharacter[condition.character_id]) || 0;

            case 'character_mission_type':
                // This would need more detailed tracking
                return this.state.progress[condition.character_id + '_' + condition.mission_type] || 0;

            case 'success_streak':
                return stats.bestStreak || 0;

            case 'fast_completion':
                return stats.fastCompletions || 0;

            case 'character_level':
                return stats.highestCharacterLevel || 1;

            case 'total_money_earned':
                return stats.totalMoneyEarned || 0;

            case 'events_resolved':
                return stats.eventsResolved || 0;

            case 'unique_npcs_helped':
                return (stats.uniqueNPCsHelped && stats.uniqueNPCsHelped.length) || 0;

            default:
                return 0;
        }
    }

    /**
     * Check if a condition is met
     */
    isConditionMet(condition, stats) {
        const progress = this.getProgressForCondition(condition, stats);

        switch (condition.type) {
            case 'character_level':
                return progress >= condition.level;
            default:
                return progress >= condition.count;
        }
    }

    /**
     * Unlock an achievement
     */
    unlock(achievementId) {
        if (this.state.unlocked.includes(achievementId)) {
            return false;
        }

        const achievement = this.definitions[achievementId];
        if (!achievement) {
            console.warn('[AchievementSystem] Unknown achievement:', achievementId);
            return false;
        }

        // Add to unlocked list
        this.state.unlocked.push(achievementId);

        // Add points
        const rarityPoints = this.rarityTiers[achievement.rarity]?.points || 0;
        this.state.totalPoints += rarityPoints;

        console.log('[AchievementSystem] Unlocked:', achievement.name, '(+' + rarityPoints + ' pts)');

        // Grant rewards
        this.grantRewards(achievement.reward);

        // Update statistics tracker
        if (window.statisticsTracker) {
            window.statisticsTracker.stats.achievementsUnlocked++;
            window.statisticsTracker.stats.achievementPoints = this.state.totalPoints;
        }

        // Save state
        this.saveState();

        // Emit event for UI notification
        if (eventBus) {
            eventBus.emit('ACHIEVEMENT_UNLOCKED', {
                achievement: achievement,
                points: rarityPoints,
                totalPoints: this.state.totalPoints
            });
        }

        // Play sound
        if (window.audioManager) {
            window.audioManager.playSound('achievement');
        }

        return true;
    }

    /**
     * Grant achievement rewards
     */
    grantRewards(reward) {
        if (!reward) return;

        if (reward.money && window.gameState) {
            window.gameState.addResource('money', reward.money);
        }

        // Experience could be added to current character or general pool
        if (reward.experience && eventBus) {
            eventBus.emit('EXPERIENCE_GAINED', { amount: reward.experience });
        }
    }

    /**
     * Get all achievements with their current status
     */
    getAllAchievements() {
        const achievements = [];

        for (const [id, def] of Object.entries(this.definitions)) {
            const stats = window.statisticsTracker?.getAllStats() || {};
            const progress = this.getProgressForCondition(def.condition, stats);
            const target = def.condition.count || def.condition.level || 1;

            achievements.push({
                ...def,
                unlocked: this.state.unlocked.includes(id),
                progress: progress,
                target: target,
                progressPercent: Math.min(100, Math.round((progress / target) * 100)),
                rarityInfo: this.rarityTiers[def.rarity],
                categoryInfo: this.categories[def.category]
            });
        }

        return achievements;
    }

    /**
     * Get achievements by category
     */
    getAchievementsByCategory(category) {
        return this.getAllAchievements().filter(a => a.category === category);
    }

    /**
     * Get unlocked achievements only
     */
    getUnlockedAchievements() {
        return this.getAllAchievements().filter(a => a.unlocked);
    }

    /**
     * Get total points
     */
    getTotalPoints() {
        return this.state.totalPoints;
    }

    /**
     * Get unlock percentage
     */
    getUnlockPercentage() {
        const total = Object.keys(this.definitions).length;
        const unlocked = this.state.unlocked.length;
        return Math.round((unlocked / total) * 100);
    }

    /**
     * Get summary statistics
     */
    getSummary() {
        const total = Object.keys(this.definitions).length;
        const unlocked = this.state.unlocked.length;

        // Count by rarity
        const byRarity = {
            common: { unlocked: 0, total: 0 },
            uncommon: { unlocked: 0, total: 0 },
            rare: { unlocked: 0, total: 0 },
            epic: { unlocked: 0, total: 0 },
            legendary: { unlocked: 0, total: 0 }
        };

        for (const [id, def] of Object.entries(this.definitions)) {
            byRarity[def.rarity].total++;
            if (this.state.unlocked.includes(id)) {
                byRarity[def.rarity].unlocked++;
            }
        }

        return {
            unlocked,
            total,
            percentage: Math.round((unlocked / total) * 100),
            points: this.state.totalPoints,
            byRarity
        };
    }

    /**
     * Save state to localStorage
     */
    saveState() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (e) {
            console.error('[AchievementSystem] Failed to save:', e);
        }
    }

    /**
     * Load state from localStorage
     */
    loadState() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.state = {
                    unlocked: parsed.unlocked || [],
                    progress: parsed.progress || {},
                    totalPoints: parsed.totalPoints || 0
                };
            }
        } catch (e) {
            console.error('[AchievementSystem] Failed to load:', e);
        }
    }

    /**
     * Reset all achievements
     */
    reset() {
        this.state = {
            unlocked: [],
            progress: {},
            totalPoints: 0
        };
        this.saveState();
        console.log('[AchievementSystem] Reset complete');
    }

    /**
     * Serialize for save file
     */
    serialize() {
        return {
            unlocked: [...this.state.unlocked],
            progress: { ...this.state.progress },
            totalPoints: this.state.totalPoints
        };
    }

    /**
     * Deserialize from save file
     */
    deserialize(data) {
        if (data) {
            this.state = {
                unlocked: data.unlocked || [],
                progress: data.progress || {},
                totalPoints: data.totalPoints || 0
            };
        }
    }

    // ==========================================
    // AI Agent Expandable API
    // ==========================================

    /**
     * Load custom achievements from localStorage
     */
    loadCustomDefinitions() {
        try {
            const saved = localStorage.getItem(this.customAchievementsKey);
            if (saved) {
                this.customDefinitions = JSON.parse(saved);
                // Merge custom definitions into main definitions
                Object.assign(this.definitions, this.customDefinitions);
            }
        } catch (e) {
            console.error('[AchievementSystem] Failed to load custom achievements:', e);
        }
    }

    /**
     * Save custom achievements to localStorage
     */
    saveCustomDefinitions() {
        try {
            localStorage.setItem(this.customAchievementsKey, JSON.stringify(this.customDefinitions));
        } catch (e) {
            console.error('[AchievementSystem] Failed to save custom achievements:', e);
        }
    }

    /**
     * Add a new achievement dynamically
     * Can be called by AI agents to create new achievements
     *
     * @param {object} definition - Achievement definition
     * @param {string} definition.id - Unique achievement ID
     * @param {string} definition.name_zh - Chinese name
     * @param {string} definition.description_zh - Chinese description
     * @param {string} definition.category - Category key
     * @param {string} definition.rarity - Rarity key (common/uncommon/rare/epic/legendary)
     * @param {object} definition.condition - Unlock condition
     * @param {object} definition.reward - Rewards on unlock
     * @returns {boolean} Success status
     */
    addAchievement(definition) {
        if (!definition.id) {
            console.error('[AchievementSystem] Achievement must have an ID');
            return false;
        }

        if (this.definitions[definition.id]) {
            console.warn('[AchievementSystem] Achievement already exists:', definition.id);
            return false;
        }

        // Validate required fields (name or name_zh, description or description_zh)
        if (!definition.name && !definition.name_zh) {
            console.error('[AchievementSystem] Missing required field: name');
            return false;
        }
        if (!definition.description && !definition.description_zh) {
            console.error('[AchievementSystem] Missing required field: description');
            return false;
        }
        const required = ['category', 'rarity', 'condition'];
        for (const field of required) {
            if (!definition[field]) {
                console.error('[AchievementSystem] Missing required field:', field);
                return false;
            }
        }

        // Add to definitions
        this.definitions[definition.id] = definition;
        this.customDefinitions[definition.id] = definition;

        // Save custom definitions
        this.saveCustomDefinitions();

        console.log('[AchievementSystem] Added achievement:', definition.id);

        // Emit event
        if (window.eventBus) {
            window.eventBus.emit('ACHIEVEMENT_ADDED', { achievement: definition });
        }

        return true;
    }

    /**
     * Import multiple achievements from JSON
     * Designed for AI agent bulk import
     *
     * @param {object} jsonData - JSON data with achievements array
     * @returns {number} Number of achievements imported
     */
    importFromJSON(jsonData) {
        let imported = 0;

        // Handle both { achievements: [...] } and direct array format
        const achievements = jsonData.achievements || jsonData;

        if (!Array.isArray(achievements)) {
            // Handle object format { id: definition, id2: definition2, ... }
            for (const [id, def] of Object.entries(achievements)) {
                def.id = def.id || id;
                if (this.addAchievement(def)) {
                    imported++;
                }
            }
        } else {
            // Handle array format [definition, definition, ...]
            for (const def of achievements) {
                if (this.addAchievement(def)) {
                    imported++;
                }
            }
        }

        console.log('[AchievementSystem] Imported', imported, 'achievements');
        return imported;
    }

    /**
     * Remove an achievement
     * @param {string} achievementId - Achievement ID to remove
     * @returns {boolean} Success status
     */
    removeAchievement(achievementId) {
        if (!this.customDefinitions[achievementId]) {
            console.warn('[AchievementSystem] Cannot remove base achievements');
            return false;
        }

        delete this.definitions[achievementId];
        delete this.customDefinitions[achievementId];
        this.saveCustomDefinitions();

        // Remove from unlocked list if present
        const index = this.state.unlocked.indexOf(achievementId);
        if (index > -1) {
            this.state.unlocked.splice(index, 1);
            this.saveState();
        }

        console.log('[AchievementSystem] Removed achievement:', achievementId);
        return true;
    }

    /**
     * Add a new achievement category
     * @param {string} key - Category key
     * @param {object} category - Category definition
     */
    addCategory(key, category) {
        this.categories[key] = {
            name: category.name || category.name_zh,
            icon: category.icon || 'star'
        };
        console.log('[AchievementSystem] Added category:', key);
    }

    /**
     * Add a new rarity tier
     * @param {string} key - Rarity key
     * @param {object} rarity - Rarity definition
     */
    addRarity(key, rarity) {
        this.rarityTiers[key] = {
            name: rarity.name || rarity.name_zh,
            color: rarity.color || '#888888',
            points: rarity.points || 10
        };
        console.log('[AchievementSystem] Added rarity:', key);
    }

    /**
     * Force unlock an achievement (for testing or special events)
     * @param {string} achievementId - Achievement ID to unlock
     * @returns {boolean} Success status
     */
    forceUnlock(achievementId) {
        const achievement = this.definitions[achievementId] || this.customDefinitions[achievementId];
        if (!achievement) {
            console.error('[AchievementSystem] Unknown achievement:', achievementId);
            return false;
        }

        return this.unlock(achievementId);
    }

    /**
     * Check if a specific achievement's condition is met
     * Useful for AI agents to query achievement status
     * @param {string} achievementId - Achievement ID to check
     * @returns {object} Status object with met, progress, target
     */
    checkCondition(achievementId) {
        const achievement = this.definitions[achievementId] || this.customDefinitions[achievementId];
        if (!achievement) {
            return { error: 'Achievement not found' };
        }

        const stats = window.statisticsTracker?.getAllStats() || {};
        const progress = this.getProgressForCondition(achievement.condition, stats);
        const target = achievement.condition.count || achievement.condition.level || 1;
        const met = this.isConditionMet(achievement.condition, stats);

        return {
            achievementId,
            unlocked: this.state.unlocked.includes(achievementId),
            met,
            progress,
            target,
            percentage: Math.min(100, Math.round((progress / target) * 100))
        };
    }

    /**
     * Get all custom (AI-generated) achievements
     * @returns {array} Array of custom achievement definitions
     */
    getCustomAchievements() {
        return Object.values(this.customDefinitions);
    }

    /**
     * Clear all custom achievements
     * Resets to base achievements only
     */
    clearCustomAchievements() {
        for (const id of Object.keys(this.customDefinitions)) {
            delete this.definitions[id];
        }
        this.customDefinitions = {};
        this.saveCustomDefinitions();
        console.log('[AchievementSystem] Cleared all custom achievements');
    }

    /**
     * Export all achievements to JSON
     * Useful for backup or sharing
     * @returns {string} JSON string
     */
    exportToJSON() {
        return JSON.stringify({
            base: this.definitions,
            custom: this.customDefinitions,
            state: this.state
        }, null, 2);
    }

    /**
     * Update isConditionMet to use registered handlers
     */
    isConditionMet(condition, stats) {
        // Use registered handler if available
        const handler = this.conditionHandlers[condition.type];
        if (handler) {
            return handler(condition, stats);
        }

        // Fallback to simple comparison
        const progress = this.getProgressForCondition(condition, stats);
        return progress >= (condition.count || condition.level || 1);
    }

    /**
     * Sync achievement progress with backend API
     * @returns {Promise<Object>} Server response with achievement data
     */
    async syncWithBackend() {
        try {
            const response = await fetch('/api/v1/progress/achievements', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Backend sync failed: ${response.status}`);
            }

            const data = await response.json();

            // Merge backend achievements with local ones
            if (data.achievements) {
                for (const achievement of data.achievements) {
                    // Check if this achievement should be unlocked
                    if (achievement.unlocked && !this.state.unlocked.includes(achievement.id)) {
                        this.unlock(achievement.id);
                    }

                    // Update progress from backend
                    if (achievement.progress !== undefined) {
                        this.state.progress[achievement.id] = achievement.progress;
                    }
                }
            }

            // Save updated state
            this.saveState();

            console.log('[AchievementSystem] Synced with backend:', data);
            return data;
        } catch (error) {
            console.error('[AchievementSystem] Backend sync failed:', error);
            // Don't throw - allow offline play
            return null;
        }
    }

    /**
     * Check for achievements that are close to being unlocked
     * Shows notifications for achievements at 80%+ progress
     * @returns {Array} Near-unlock achievements
     */
    checkNearUnlocks() {
        if (!window.statisticsTracker) {
            return [];
        }

        const stats = window.statisticsTracker.getAll();
        const nearUnlocks = [];
        const threshold = 0.8; // 80% progress

        for (const [id, achievement] of Object.entries(this.definitions)) {
            // Skip already unlocked
            if (this.state.unlocked.includes(id)) {
                continue;
            }

            const progress = this.getProgressForCondition(achievement.condition, stats);
            const target = achievement.condition.count || achievement.condition.level || 1;
            const percentage = progress / target;

            if (percentage >= threshold && percentage < 1.0) {
                nearUnlocks.push({
                    id,
                    achievement,
                    progress,
                    target,
                    percentage: Math.round(percentage * 100),
                });
            }
        }

        // Show notification for near unlocks (if not shown recently)
        if (nearUnlocks.length > 0 && window.eventBus) {
            const now = Date.now();
            const lastNotification = this._lastNearUnlockNotification || 0;
            const notificationCooldown = 5 * 60 * 1000; // 5 minutes

            if (now - lastNotification > notificationCooldown) {
                this._lastNearUnlockNotification = now;

                // Pick the closest one to show
                const closest = nearUnlocks.sort((a, b) => b.percentage - a.percentage)[0];

                window.eventBus.emit('achievement:near-unlock', {
                    achievement: closest.achievement,
                    progress: closest.progress,
                    target: closest.target,
                    percentage: closest.percentage,
                });
            }
        }

        return nearUnlocks;
    }

    /**
     * Trigger backend sync after mission completion
     * Call this when a mission is completed
     */
    async onMissionComplete() {
        // Check for new unlocks first
        this.checkAllAchievements();

        // Check near unlocks
        this.checkNearUnlocks();

        // Sync with backend
        await this.syncWithBackend();
    }
}

// Create singleton instance
const achievementSystem = new AchievementSystem();

// Make available globally
window.achievementSystem = achievementSystem;
