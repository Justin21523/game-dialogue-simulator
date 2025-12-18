/**
 * Content Generator System
 * Uses AI to generate missions, locations, and events dynamically
 * Integrates with /content/* API endpoints
 */

import { CONFIG } from '../config.js';
import { gameState } from '../core/game-state.js';
import { Mission } from '../models/mission.js';

class ContentGenerator {
    constructor() {
        this.apiBase = `${CONFIG.API_BASE}/content`;  // Use backend URL from config
        this.isGenerating = false;
        this.cachedMissionTypes = null;
    }

    /**
     * Generate a single mission with AI
     * @param {Object} options - Generation options
     * @param {string} options.mission_type - Type of mission
     * @param {string} options.location - Mission location
     * @param {number} options.difficulty - Difficulty level (1-5)
     * @param {string} options.objective - Main objective description
     * @returns {Promise<Object>} Generated mission data
     */
    async generateMissionContent(options = {}) {
        try {
            const payload = {
                mission_type: options.mission_type || 'delivery',
                location: options.location || 'Paris',
                difficulty: options.difficulty || 1,
                objective: options.objective || null,
            };

            const response = await fetch(`${this.apiBase}/mission`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Mission generation failed: ${response.status}`);
            }

            const data = await response.json();
            return this.convertToMissionObject(data);
        } catch (error) {
            console.error('[ContentGenerator] Mission generation failed:', error);
            return this.fallbackMission(options);
        }
    }

    /**
     * Generate multiple missions in batch
     * @param {number} count - Number of missions to generate
     * @param {Object} options - Generation options
     * @param {string} options.mission_type - Type of mission (optional)
     * @param {number} options.min_difficulty - Minimum difficulty
     * @param {number} options.max_difficulty - Maximum difficulty
     * @returns {Promise<Array>} Array of generated missions
     */
    async generateMissionBatch(count = 5, options = {}) {
        try {
            const payload = {
                count: count,
                mission_type: options.mission_type || null,
                min_difficulty: options.min_difficulty || 1,
                max_difficulty: options.max_difficulty || 5,
                theme: options.theme || null,
            };

            const response = await fetch(`${this.apiBase}/missions/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Batch mission generation failed: ${response.status}`);
            }

            const data = await response.json();
            return (data.missions || []).map(m => this.convertToMissionObject(m));
        } catch (error) {
            console.error('[ContentGenerator] Batch generation failed:', error);
            return this.fallbackMissionBatch(count, options);
        }
    }

    /**
     * Generate a location description with AI
     * @param {Object} options - Generation options
     * @param {string} options.location_name - Name of the location
     * @param {string} options.country - Country
     * @param {string} options.context - Context for the location
     * @returns {Promise<Object>} Generated location data
     */
    async generateLocation(options = {}) {
        try {
            const payload = {
                location_name: options.location_name || 'World Airport',
                country: options.country || null,
                context: options.context || 'mission',
                description_style: options.description_style || 'detailed',
            };

            const response = await fetch(`${this.apiBase}/location`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Location generation failed: ${response.status}`);
            }

            const data = await response.json();
            return {
                name: data.name || options.location_name,
                description: data.description || 'A bustling location.',
                atmosphere: data.atmosphere || 'Neutral',
                features: data.features || [],
                coordinates: data.coordinates || null,
            };
        } catch (error) {
            console.error('[ContentGenerator] Location generation failed:', error);
            return this.fallbackLocation(options);
        }
    }

    /**
     * Generate a dynamic game event with AI
     * @param {Object} options - Generation options
     * @param {string} options.context - Event context (e.g., 'in_flight', 'mission_start')
     * @param {string} options.character_id - Character involved
     * @param {string} options.location - Current location
     * @param {string} options.mission_type - Type of current mission
     * @returns {Promise<Object>} Generated event data
     */
    async generateEvent(options = {}) {
        try {
            const payload = {
                context: options.context || 'random',
                character_id: options.character_id || null,
                location: options.location || null,
                mission_type: options.mission_type || null,
                difficulty: options.difficulty || 1,
            };

            const response = await fetch(`${this.apiBase}/event`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Event generation failed: ${response.status}`);
            }

            const data = await response.json();
            return {
                event_id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: data.name || 'Random Event',
                description: data.description || 'Something unexpected happens!',
                event_type: data.event_type || 'neutral',
                choices: data.choices || [],
                rewards: data.rewards || null,
                penalties: data.penalties || null,
            };
        } catch (error) {
            console.error('[ContentGenerator] Event generation failed:', error);
            return this.fallbackEvent(options);
        }
    }

    /**
     * Get available mission types
     * @returns {Promise<Array<string>>} List of mission types
     */
    async getMissionTypes() {
        if (this.cachedMissionTypes) {
            return this.cachedMissionTypes;
        }

        try {
            const response = await fetch(`${this.apiBase}/mission-types`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch mission types: ${response.status}`);
            }

            const data = await response.json();
            this.cachedMissionTypes = data.mission_types || [];
            return this.cachedMissionTypes;
        } catch (error) {
            console.error('[ContentGenerator] Failed to fetch mission types:', error);
            return this.fallbackMissionTypes();
        }
    }

    /**
     * Expand game content (generate missions, locations, etc.)
     * @param {Object} options - Expansion options
     * @param {number} options.missions - Number of missions to generate
     * @param {number} options.locations - Number of locations to generate
     * @param {number} options.events - Number of events to generate
     * @returns {Promise<Object>} Expanded content
     */
    async expandContent(options = {}) {
        try {
            const params = new URLSearchParams({
                missions: options.missions || 5,
                locations: options.locations || 2,
                events: options.events || 3,
            });

            const response = await fetch(`${this.apiBase}/expand-content?${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Content expansion failed: ${response.status}`);
            }

            const data = await response.json();
            return {
                missions: (data.missions || []).map(m => this.convertToMissionObject(m)),
                locations: data.locations || [],
                events: data.events || [],
            };
        } catch (error) {
            console.error('[ContentGenerator] Content expansion failed:', error);
            return {
                missions: [],
                locations: [],
                events: [],
            };
        }
    }

    /**
     * Refresh daily mission board with new AI-generated missions
     * @param {number} count - Number of missions to generate
     * @returns {Promise<Array>} Array of generated missions
     */
    async refreshDailyMissions(count = 10) {
        console.log('[ContentGenerator] Refreshing daily missions...');

        try {
            const missions = await this.generateMissionBatch(count, {
                min_difficulty: 1,
                max_difficulty: 3,
            });

            // Add to game state
            missions.forEach(mission => {
                gameState.availableMissions.push(mission);
            });

            gameState.save();

            console.log(`[ContentGenerator] Added ${missions.length} new missions to board.`);
            return missions;
        } catch (error) {
            console.error('[ContentGenerator] Daily refresh failed:', error);
            return [];
        }
    }

    // ========== Helper Methods ==========

    /**
     * Convert API mission data to game Mission object
     * @param {Object} apiMission - Mission data from API
     * @returns {Mission} Mission instance
     */
    convertToMissionObject(apiMission) {
        // Return a Mission instance instead of plain object
        return new Mission({
            id: apiMission.id || `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: apiMission.title || apiMission.name || 'Untitled Mission',
            type: apiMission.type || apiMission.mission_type || 'delivery',
            location: apiMission.location || 'World Airport',
            description: apiMission.description || 'Help is needed!',
            rewardMoney: apiMission.reward_money || apiMission.reward || 100,
            rewardExp: apiMission.reward_exp || Math.floor((apiMission.reward_money || 100) * 0.5),
            fuelCost: apiMission.fuel_cost || 10,
            duration: apiMission.duration || 60,
            objectives: apiMission.objectives || [
                {
                    type: 'main',
                    description: apiMission.description || 'Complete the mission',
                    completed: false,
                }
            ],
        });
    }

    /**
     * Fallback mission when API fails
     * @param {Object} options - Generation options
     * @returns {Mission} Fallback mission instance
     */
    fallbackMission(options) {
        // Return a Mission instance instead of plain object
        return new Mission({
            id: `fallback_${Date.now()}`,
            title: `${options.mission_type || 'Delivery'} Mission`,
            type: options.mission_type || 'delivery',
            location: options.location || 'World Airport',
            description: 'A standard mission. Help is needed!',
            rewardMoney: 100 * (options.difficulty || 1),
            rewardExp: 50 * (options.difficulty || 1),
            fuelCost: 10 + (options.difficulty || 1) * 2,
            duration: 60,
            objectives: [
                {
                    type: 'main',
                    description: options.objective || 'Complete the mission',
                    completed: false,
                }
            ],
        });
    }

    /**
     * Fallback mission batch when API fails
     * @param {number} count - Number of missions
     * @param {Object} options - Generation options
     * @returns {Array} Array of fallback missions
     */
    fallbackMissionBatch(count, options) {
        const missions = [];
        const types = ['delivery', 'rescue', 'construction', 'sports', 'police', 'nature'];

        for (let i = 0; i < count; i++) {
            const type = options.mission_type || types[Math.floor(Math.random() * types.length)];
            const difficulty = Math.floor(
                Math.random() * ((options.max_difficulty || 5) - (options.min_difficulty || 1) + 1)
            ) + (options.min_difficulty || 1);

            missions.push(this.fallbackMission({ mission_type: type, difficulty }));
        }

        return missions;
    }

    /**
     * Fallback location when API fails
     * @param {Object} options - Generation options
     * @returns {Object} Fallback location
     */
    fallbackLocation(options) {
        return {
            name: options.location_name || 'World Airport',
            description: `A location in ${options.country || 'the world'}. A great place for missions.`,
            atmosphere: 'Neutral',
            features: ['Landing pad', 'Control tower'],
            coordinates: null,
        };
    }

    /**
     * Fallback event when API fails
     * @param {Object} options - Generation options
     * @returns {Object} Fallback event
     */
    fallbackEvent(options) {
        return {
            event_id: `fallback_event_${Date.now()}`,
            name: 'Unexpected Encounter',
            description: 'Something unexpected happens during your mission!',
            event_type: 'neutral',
            choices: [
                { option: 'Continue', outcome: 'No change' },
                { option: 'Investigate', outcome: 'Small bonus' },
            ],
            rewards: null,
            penalties: null,
        };
    }

    /**
     * Fallback mission types when API fails
     * @returns {Array<string>} Fallback mission types
     */
    fallbackMissionTypes() {
        return ['delivery', 'rescue', 'construction', 'sports', 'police', 'nature', 'medical', 'exploration'];
    }
}

// Create singleton instance
const contentGenerator = new ContentGenerator();

// Make available globally
window.contentGenerator = contentGenerator;

export default contentGenerator;
