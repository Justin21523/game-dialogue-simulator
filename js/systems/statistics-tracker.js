/**
 * Statistics Tracker for Super Wings Simulator
 * Tracks various game statistics for achievements and player progress
 */

import { eventBus } from '../core/event-bus.js';

class StatisticsTracker {
    constructor() {
        this.storageKey = 'sw_statistics';

        // Default statistics structure
        this.stats = this.getDefaultStats();

        // Play time tracking
        this.playTimeInterval = null;
        this.sessionStartTime = null;
    }

    /**
     * Get default statistics structure
     */
    getDefaultStats() {
        return {
            // Mission Statistics
            missionsCompleted: 0,
            missionsFailed: 0,
            missionsByType: {},           // { delivery: 10, sports: 5, ... }
            missionsByCharacter: {},      // { jett: 20, jerome: 15, ... }

            // Exploration Statistics
            locationsVisited: [],         // Array of location names
            uniqueNPCsHelped: [],         // Array of NPC names

            // Economic Statistics
            totalMoneyEarned: 0,
            totalMoneySpent: 0,
            highestMoney: 0,              // Peak money at any time

            // Flight Statistics
            totalFlightTime: 0,           // In seconds
            coinsCollected: 0,
            obstaclesHit: 0,
            totalDistance: 0,             // Arbitrary units
            boostsUsed: 0,

            // Performance Statistics
            currentStreak: 0,
            bestStreak: 0,
            perfectMissions: 0,           // Missions with no obstacles hit
            fastCompletions: 0,           // Missions completed under time bonus

            // Character Statistics
            charactersUsed: [],           // Array of character IDs used
            characterLevelUps: 0,
            highestCharacterLevel: 1,

            // Time Statistics
            totalPlayTime: 0,             // In seconds
            firstPlayDate: null,
            lastPlayDate: null,
            totalSessions: 0,

            // Achievement Progress (for display purposes)
            achievementPoints: 0,
            achievementsUnlocked: 0,

            // Session Statistics (Phase 3.4 Enhancement)
            sessionStats: {
                currentSessionStart: null,
                currentSessionDuration: 0,
                longestSession: 0,
                averageSessionDuration: 0,
                totalSessionCount: 0,
                missionsThisSession: 0,
            },

            // Performance Metrics (Phase 3.4 Enhancement)
            performanceMetrics: {
                missionTimes: [],              // Array of mission completion times
                averageMissionTime: 0,
                fastestMissionTime: null,
                slowestMissionTime: null,
                successRate: 0,                // missionsCompleted / (missionsCompleted + missionsFailed)
                averageScore: 0,
            },

            // Economy Stats (Phase 3.4 Enhancement)
            economyStats: {
                moneyFlow: [],                 // Array of {timestamp, amount, reason}
                netWorth: 0,                   // Current money
                peakNetWorth: 0,
                totalEarnings: 0,
                totalSpendings: 0,
                averageRewardPerMission: 0,
            },

            // Exploration Stats (Phase 3.4 Enhancement)
            explorationStats: {
                totalFlightDistance: 0,        // Total distance flown
                longestFlight: 0,
                averageFlightDistance: 0,
                collectiblesFound: {
                    coins: 0,
                    powerups: 0,
                    treasures: 0,
                },
                countriesVisited: [],          // Array of country names
                continentsVisited: [],         // Array of continent names
            },
        };
    }

    /**
     * Initialize the statistics tracker
     */
    init() {
        this.load();
        this.startPlayTimeTracking();
        this.subscribeToEvents();

        // Update first play date if not set
        if (!this.stats.firstPlayDate) {
            this.stats.firstPlayDate = new Date().toISOString();
        }

        // Increment session count
        this.stats.totalSessions++;
        this.stats.lastPlayDate = new Date().toISOString();

        console.log('[StatisticsTracker] Initialized');
    }

    /**
     * Subscribe to game events
     */
    subscribeToEvents() {
        if (!eventBus) {
            console.warn('[StatisticsTracker] EventBus not found, events will not be tracked');
            return;
        }

        // Mission events
        eventBus.on('MISSION_COMPLETED', (data) => this.onMissionCompleted(data));

        // Resource events
        eventBus.on('RESOURCE_UPDATED', (data) => this.onResourceUpdated(data));

        // Level up events (if available)
        eventBus.on('LEVEL_UP', (data) => this.onLevelUp(data));
    }

    /**
     * Handle mission completion
     */
    onMissionCompleted(data) {
        const { mission, char, rewards, flightStats } = data;

        // Basic mission stats
        this.stats.missionsCompleted++;

        // Mission type tracking
        if (mission?.type) {
            this.stats.missionsByType[mission.type] = (this.stats.missionsByType[mission.type] || 0) + 1;
        }

        // Character tracking
        if (char?.id) {
            this.stats.missionsByCharacter[char.id] = (this.stats.missionsByCharacter[char.id] || 0) + 1;

            if (!this.stats.charactersUsed.includes(char.id)) {
                this.stats.charactersUsed.push(char.id);
            }
        }

        // Location tracking
        if (mission?.location && !this.stats.locationsVisited.includes(mission.location)) {
            this.stats.locationsVisited.push(mission.location);
        }

        // NPC tracking
        if (mission?.npcName && !this.stats.uniqueNPCsHelped.includes(mission.npcName)) {
            this.stats.uniqueNPCsHelped.push(mission.npcName);
        }

        // Flight stats (if provided)
        if (flightStats) {
            this.stats.coinsCollected += flightStats.coinsCollected || 0;
            this.stats.obstaclesHit += flightStats.obstaclesHit || 0;
            this.stats.totalFlightTime += flightStats.flightTime || 0;
            this.stats.boostsUsed += flightStats.boostsUsed || 0;

            // Perfect mission (no obstacles hit)
            if (flightStats.obstaclesHit === 0) {
                this.stats.perfectMissions++;
            }
        }

        // Streak tracking
        this.stats.currentStreak++;
        if (this.stats.currentStreak > this.stats.bestStreak) {
            this.stats.bestStreak = this.stats.currentStreak;
        }

        // Rewards tracking
        if (rewards?.money) {
            this.stats.totalMoneyEarned += rewards.money;
        }

        this.save();
        this.emitUpdate('missionsCompleted');
    }

    /**
     * Handle mission failure
     */
    recordMissionFailed() {
        this.stats.missionsFailed++;
        this.stats.currentStreak = 0; // Reset streak on failure
        this.save();
        this.emitUpdate('missionsFailed');
    }

    /**
     * Handle resource updates
     */
    onResourceUpdated(data) {
        if (data.type === 'money') {
            // Track highest money
            if (data.value > this.stats.highestMoney) {
                this.stats.highestMoney = data.value;
            }
        }
    }

    /**
     * Handle level up
     */
    onLevelUp(data) {
        this.stats.characterLevelUps++;

        if (data.newLevel > this.stats.highestCharacterLevel) {
            this.stats.highestCharacterLevel = data.newLevel;
        }

        this.save();
        this.emitUpdate('characterLevelUps');
    }

    /**
     * Record money spent
     */
    recordMoneySpent(amount) {
        this.stats.totalMoneySpent += amount;
        this.save();
        this.emitUpdate('totalMoneySpent');
    }

    /**
     * Record flight statistics manually
     */
    recordFlightStats(flightData) {
        if (flightData.coinsCollected) this.stats.coinsCollected += flightData.coinsCollected;
        if (flightData.obstaclesHit) this.stats.obstaclesHit += flightData.obstaclesHit;
        if (flightData.flightTime) this.stats.totalFlightTime += flightData.flightTime;
        if (flightData.distance) this.stats.totalDistance += flightData.distance;
        if (flightData.boostsUsed) this.stats.boostsUsed += flightData.boostsUsed;

        this.save();
    }

    /**
     * Start tracking play time
     */
    startPlayTimeTracking() {
        this.sessionStartTime = Date.now();

        // Update play time every minute
        this.playTimeInterval = setInterval(() => {
            const sessionTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);
            this.stats.totalPlayTime += 60; // Add 1 minute
            this.stats.lastPlayDate = new Date().toISOString();
            this.save();
        }, 60000);
    }

    /**
     * Stop tracking play time
     */
    stopPlayTimeTracking() {
        if (this.playTimeInterval) {
            clearInterval(this.playTimeInterval);
            this.playTimeInterval = null;
        }

        // Save remaining session time
        if (this.sessionStartTime) {
            const sessionTime = Math.floor((Date.now() - this.sessionStartTime) / 1000);
            // Don't double count - only add remainder
            const remainder = sessionTime % 60;
            this.stats.totalPlayTime += remainder;
            this.save();
        }
    }

    /**
     * Get a specific statistic
     */
    getStat(key) {
        return this.stats[key];
    }

    /**
     * Get all statistics
     */
    getAllStats() {
        return { ...this.stats };
    }

    /**
     * Get statistics summary for display
     */
    getSummary() {
        return {
            missions: {
                completed: this.stats.missionsCompleted,
                failed: this.stats.missionsFailed,
                successRate: this.stats.missionsCompleted > 0
                    ? Math.round((this.stats.missionsCompleted / (this.stats.missionsCompleted + this.stats.missionsFailed)) * 100)
                    : 0
            },
            exploration: {
                locations: this.stats.locationsVisited.length,
                npcsHelped: this.stats.uniqueNPCsHelped.length
            },
            economy: {
                earned: this.stats.totalMoneyEarned,
                spent: this.stats.totalMoneySpent,
                peak: this.stats.highestMoney
            },
            flight: {
                totalTime: this.formatTime(this.stats.totalFlightTime),
                coins: this.stats.coinsCollected,
                obstacles: this.stats.obstaclesHit
            },
            performance: {
                currentStreak: this.stats.currentStreak,
                bestStreak: this.stats.bestStreak,
                perfectMissions: this.stats.perfectMissions
            },
            characters: {
                used: this.stats.charactersUsed.length,
                levelUps: this.stats.characterLevelUps,
                highestLevel: this.stats.highestCharacterLevel
            },
            time: {
                totalPlayTime: this.formatTime(this.stats.totalPlayTime),
                sessions: this.stats.totalSessions,
                firstPlay: this.stats.firstPlayDate,
                lastPlay: this.stats.lastPlayDate
            }
        };
    }

    /**
     * Format seconds to readable time
     */
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Emit statistics update event
     */
    emitUpdate(statKey) {
        if (window.eventBus) {
            window.eventBus.emit('STATS_UPDATED', {
                statKey,
                value: this.stats[statKey]
            });
        }
    }

    /**
     * Save statistics to localStorage
     */
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.stats));
        } catch (e) {
            console.error('[StatisticsTracker] Failed to save:', e);
        }
    }

    /**
     * Load statistics from localStorage
     */
    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Merge with defaults to ensure all keys exist
                this.stats = { ...this.getDefaultStats(), ...parsed };
            }
        } catch (e) {
            console.error('[StatisticsTracker] Failed to load:', e);
            this.stats = this.getDefaultStats();
        }
    }

    /**
     * Reset all statistics
     */
    reset() {
        this.stats = this.getDefaultStats();
        this.stats.firstPlayDate = new Date().toISOString();
        this.stats.totalSessions = 1;
        this.save();
        console.log('[StatisticsTracker] Reset complete');
    }

    /**
     * Serialize for save file
     */
    serialize() {
        return { ...this.stats };
    }

    /**
     * Deserialize from save file
     */
    deserialize(data) {
        if (data) {
            this.stats = { ...this.getDefaultStats(), ...data };
        }
    }

    /**
     * Cleanup on page unload
     */
    cleanup() {
        this.stopPlayTimeTracking();
    }

    // ==================== Phase 3.4 Enhancement Methods ====================

    /**
     * Track mission completion time
     * @param {number} timeInSeconds - Time taken to complete mission
     */
    trackMissionTime(timeInSeconds) {
        this.stats.performanceMetrics.missionTimes.push(timeInSeconds);

        // Update fastest/slowest
        if (!this.stats.performanceMetrics.fastestMissionTime || timeInSeconds < this.stats.performanceMetrics.fastestMissionTime) {
            this.stats.performanceMetrics.fastestMissionTime = timeInSeconds;
        }
        if (!this.stats.performanceMetrics.slowestMissionTime || timeInSeconds > this.stats.performanceMetrics.slowestMissionTime) {
            this.stats.performanceMetrics.slowestMissionTime = timeInSeconds;
        }

        // Calculate average
        const times = this.stats.performanceMetrics.missionTimes;
        const sum = times.reduce((acc, t) => acc + t, 0);
        this.stats.performanceMetrics.averageMissionTime = sum / times.length;

        // Update success rate
        const total = this.stats.missionsCompleted + this.stats.missionsFailed;
        if (total > 0) {
            this.stats.performanceMetrics.successRate = this.stats.missionsCompleted / total;
        }

        this.save();
    }

    /**
     * Track money transaction
     * @param {number} amount - Amount (positive for earning, negative for spending)
     * @param {string} reason - Transaction reason
     */
    trackMoneyTransaction(amount, reason) {
        this.stats.economyStats.moneyFlow.push({
            timestamp: Date.now(),
            amount,
            reason,
        });

        // Limit flow history to last 100 transactions
        if (this.stats.economyStats.moneyFlow.length > 100) {
            this.stats.economyStats.moneyFlow.shift();
        }

        if (amount > 0) {
            this.stats.economyStats.totalEarnings += amount;
        } else {
            this.stats.economyStats.totalSpendings += Math.abs(amount);
        }

        // Update net worth (should match gameState.resources.money)
        this.stats.economyStats.netWorth += amount;

        // Update peak
        if (this.stats.economyStats.netWorth > this.stats.economyStats.peakNetWorth) {
            this.stats.economyStats.peakNetWorth = this.stats.economyStats.netWorth;
        }

        // Calculate average reward
        if (this.stats.missionsCompleted > 0) {
            this.stats.economyStats.averageRewardPerMission = this.stats.economyStats.totalEarnings / this.stats.missionsCompleted;
        }

        this.save();
    }

    /**
     * Track flight distance
     * @param {number} distance - Distance flown this flight
     */
    trackFlightDistance(distance) {
        this.stats.explorationStats.totalFlightDistance += distance;

        if (distance > this.stats.explorationStats.longestFlight) {
            this.stats.explorationStats.longestFlight = distance;
        }

        // Calculate average
        if (this.stats.missionsCompleted > 0) {
            this.stats.explorationStats.averageFlightDistance = this.stats.explorationStats.totalFlightDistance / this.stats.missionsCompleted;
        }

        this.save();
    }

    /**
     * Track collectible found
     * @param {string} type - Collectible type (coins, powerups, treasures)
     */
    trackCollectible(type) {
        if (this.stats.explorationStats.collectiblesFound[type] !== undefined) {
            this.stats.explorationStats.collectiblesFound[type]++;
            this.save();
        }
    }

    /**
     * Track country visited
     * @param {string} country - Country name
     * @param {string} continent - Continent name
     */
    trackCountryVisit(country, continent) {
        if (!this.stats.explorationStats.countriesVisited.includes(country)) {
            this.stats.explorationStats.countriesVisited.push(country);
        }

        if (continent && !this.stats.explorationStats.continentsVisited.includes(continent)) {
            this.stats.explorationStats.continentsVisited.push(continent);
        }

        this.save();
    }

    /**
     * Start new session
     */
    startSession() {
        this.stats.sessionStats.currentSessionStart = Date.now();
        this.stats.sessionStats.currentSessionDuration = 0;
        this.stats.sessionStats.missionsThisSession = 0;
        this.stats.sessionStats.totalSessionCount++;
        this.save();
    }

    /**
     * End current session
     */
    endSession() {
        if (!this.stats.sessionStats.currentSessionStart) {
            return;
        }

        const duration = Date.now() - this.stats.sessionStats.currentSessionStart;
        this.stats.sessionStats.currentSessionDuration = duration;

        // Update longest session
        if (duration > this.stats.sessionStats.longestSession) {
            this.stats.sessionStats.longestSession = duration;
        }

        // Calculate average session duration
        const totalDuration = this.stats.totalPlayTime * 1000; // Convert to ms
        const sessionCount = this.stats.sessionStats.totalSessionCount;
        if (sessionCount > 0) {
            this.stats.sessionStats.averageSessionDuration = totalDuration / sessionCount;
        }

        this.stats.sessionStats.currentSessionStart = null;
        this.save();
    }

    /**
     * Increment missions this session
     */
    incrementSessionMissions() {
        this.stats.sessionStats.missionsThisSession++;
        this.save();
    }

    /**
     * Get session statistics
     * @returns {Object} Session statistics
     */
    getSessionStats() {
        return this.stats.sessionStats;
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        return this.stats.performanceMetrics;
    }

    /**
     * Get economy statistics
     * @returns {Object} Economy statistics
     */
    getEconomyStats() {
        return this.stats.economyStats;
    }

    /**
     * Get exploration statistics
     * @returns {Object} Exploration statistics
     */
    getExplorationStats() {
        return this.stats.explorationStats;
    }
}

// Create singleton instance
const statisticsTracker = new StatisticsTracker();

// Make available globally
window.statisticsTracker = statisticsTracker;

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    statisticsTracker.cleanup();
});
