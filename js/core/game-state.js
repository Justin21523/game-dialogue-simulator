import { CONFIG } from '../config.js';
import { eventBus } from './event-bus.js';
import { Character } from '../models/character.js';
import { Mission } from '../models/mission.js';
import { MissionGenerator } from '../systems/mission-generator.js';
import indexedDBManager from './indexed-db.js';

class GameState {
    constructor() {
        this.resources = {
            money: CONFIG.INITIAL_MONEY,
            fuel: CONFIG.INITIAL_FUEL
        };

        this.characters = new Map(); // Map<id, Character>
        this.activeMissions = []; // Missions currently in progress
        this.availableMissions = []; // Missions on the board
        this.missionSessions = new Map(); // Map<missionId, sessionId> for backend session tracking
        this.lastSaveTime = Date.now();
        this.apiBase = `${CONFIG.API_BASE}/missions`;  // Use backend URL from config

        // Bind auto-save
        setInterval(() => this.save(), 60000); // Auto save every minute
    }

    async init() {
        await this.load();

        // If no missions available, generate some
        if (this.availableMissions.length === 0) {
            await this.refreshMissions();
        }
    }

    async refreshMissions() {
        // Generate raw mission data
        const rawMissions = await MissionGenerator.generate(15, 1);
        // Ensure they are proper Mission instances
        this.availableMissions = rawMissions.map(m => m instanceof Mission ? m : new Mission(m));
        
        eventBus.emit('MISSIONS_UPDATED', this.availableMissions);
        this.save();
    }

    /**
     * Initialize characters (either from save or defaults)
     */
    initCharacters(savedChars = {}) {
        // Loop through config characters to ensure we have all defined ones
        for (const [id, def] of Object.entries(CONFIG.CHARACTERS)) {
            const savedData = savedChars[id] || {};
            // Merge config definition with saved state
            const charData = { ...def, ...savedData };
            this.characters.set(id, new Character(id, charData));
        }
    }

    /**
     * Save state to IndexedDB (with localStorage fallback)
     */
    async save() {
        const state = {
            key: CONFIG.SAVE_KEY,
            resources: this.resources,
            characters: Object.fromEntries(this.characters),
            activeMissions: this.activeMissions,
            availableMissions: this.availableMissions,
            timestamp: Date.now()
        };

        try {
            // Save to IndexedDB (automatically falls back to localStorage)
            await indexedDBManager.save('gameState', state);
            console.log("Game saved.");
            eventBus.emit('GAME_SAVED');
        } catch (e) {
            console.error("Save failed:", e);
            // Ensure localStorage fallback
            try {
                localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(state));
            } catch (fallbackError) {
                console.error("Fallback save also failed:", fallbackError);
            }
        }
    }

    /**
     * Load state from IndexedDB (with localStorage fallback)
     */
    async load() {
        try {
            // Try loading from IndexedDB first
            const state = await indexedDBManager.load('gameState', CONFIG.SAVE_KEY);

            if (state) {
                this.resources = state.resources;

                // FORCE RESET FUEL IF LOW (Fix for infinite loop bug)
                if (this.resources.fuel < 50) {
                    this.resources.fuel = 200; // Reset to full
                    console.log("⚠️ Fuel too low in save, auto-refilled to 200.");
                }

                // Hydrate Missions: Convert plain objects back to Mission instances
                this.activeMissions = (state.activeMissions || []).map(m => new Mission(m));
                this.availableMissions = (state.availableMissions || []).map(m => new Mission(m));

                this.initCharacters(state.characters);
                console.log("Game loaded from IndexedDB.");
            } else {
                // Fallback to localStorage if IndexedDB has no data
                const json = localStorage.getItem(CONFIG.SAVE_KEY);
                if (json) {
                    const localState = JSON.parse(json);
                    this.resources = localState.resources;

                    if (this.resources.fuel < 50) {
                        this.resources.fuel = 200;
                        console.log("⚠️ Fuel too low in save, auto-refilled to 200.");
                    }

                    this.activeMissions = (localState.activeMissions || []).map(m => new Mission(m));
                    this.availableMissions = (localState.availableMissions || []).map(m => new Mission(m));
                    this.initCharacters(localState.characters);
                    console.log("Game loaded from localStorage (fallback).");

                    // Migrate to IndexedDB
                    await this.save();
                } else {
                    this.reset();
                }
            }
        } catch (e) {
            console.error("Load failed, resetting:", e);
            this.reset();
        }

        eventBus.emit('STATE_UPDATED', this);
    }

    /**
     * 由外部提供的物件載入狀態（例如雲端/測試載入）
     * @param {Object} state
     */
    loadState(state) {
        if (!state || typeof state !== 'object') return;
        try {
            this.resources = state.resources || { money: CONFIG.INITIAL_MONEY, fuel: CONFIG.INITIAL_FUEL };
            this.activeMissions = (state.activeMissions || []).map(m => new Mission(m));
            this.availableMissions = (state.availableMissions || []).map(m => new Mission(m));
            this.initCharacters(state.characters || {});
            eventBus.emit('STATE_UPDATED', this);
            this.save();
        } catch (e) {
            console.error('loadState failed, reset to defaults', e);
            this.reset();
        }
    }

    reset() {
        this.resources = {
            money: CONFIG.INITIAL_MONEY,
            fuel: CONFIG.INITIAL_FUEL
        };
        this.activeMissions = [];
        this.availableMissions = [];
        this.initCharacters();
        this.refreshMissions(); // Generate initial missions
    }

    // --- Resource Management ---

    addMoney(amount) {
        this.resources.money += amount;
        eventBus.emit('RESOURCE_UPDATED', { type: 'money', value: this.resources.money });
        this.save();
    }

    consumeFuel(amount) {
        const actualCost = Math.ceil(amount * CONFIG.FUEL_COST_MULTIPLIER);
        if (this.resources.fuel >= actualCost) {
            this.resources.fuel -= actualCost;
            eventBus.emit('RESOURCE_UPDATED', { type: 'fuel', value: this.resources.fuel });
            this.save();
            return true;
        }
        return false;
    }

    refuel() {
        const missing = CONFIG.MAX_FUEL - this.resources.fuel;
        if (missing <= 0) return false;

        // Cost: 1 Money per 1 Fuel unit (Cheap)
        const cost = Math.ceil(missing * 0.5); 
        
        if (this.resources.money >= cost) {
            this.resources.money -= cost;
            this.resources.fuel = CONFIG.MAX_FUEL;
            
            eventBus.emit('RESOURCE_UPDATED', { type: 'money', value: this.resources.money });
            eventBus.emit('RESOURCE_UPDATED', { type: 'fuel', value: this.resources.fuel });
            this.save();
            return true;
        }
        return false;
    }

    getCharacter(id) {
        return this.characters.get(id);
    }
    
    getAllCharacters() {
        return Array.from(this.characters.values());
    }

    // --- Mission Logic ---

    async startMission(missionId, charId) {
        const mission = this.availableMissions.find(m => m.id === missionId);
        const char = this.characters.get(charId);

        if (!mission || !char) return false;

        // Create backend mission session
        try {
            const sessionId = await this.createMissionSession(mission, charId);
            this.missionSessions.set(missionId, sessionId);
        } catch (error) {
            console.warn('[GameState] Failed to create backend session:', error);
            // Continue without backend session (offline mode)
        }

        // Move mission from available to active
        this.availableMissions = this.availableMissions.filter(m => m.id !== missionId);
        mission.start(charId);
        this.activeMissions.push(mission);

        // Update character status
        char.status = 'MISSION';
        char.currentMissionId = missionId;
        char.missionEndTime = Date.now() + (mission.duration * 1000);

        this.save();
        eventBus.emit('MISSION_STARTED', { mission, char });
        return true;
    }

    /**
     * Create a mission session on the backend
     * @param {Mission} mission - Mission object
     * @param {string} charId - Character ID
     * @returns {Promise<string>} Session ID
     */
    async createMissionSession(mission, charId) {
        const payload = {
            mission_type: mission.type || 'delivery',
            location: mission.location || 'World Airport',
            problem_description: mission.description || 'Help needed',
            character_id: charId,
            npc_name: mission.npc_name || null,
        };

        const response = await fetch(`${this.apiBase}/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Failed to start mission session: ${response.status}`);
        }

        const data = await response.json();
        return data.session_id;
    }

    /**
     * Advance mission to next phase
     * @param {string} missionId - Mission ID
     * @param {string|null} action - Optional action description
     * @param {string|null} choice - Optional choice made
     * @returns {Promise<Object|null>} Phase advancement result
     */
    async advanceMissionPhase(missionId, action = null, choice = null) {
        const sessionId = this.missionSessions.get(missionId);
        if (!sessionId) {
            console.warn('[GameState] No session ID for mission:', missionId);
            return null;
        }

        try {
            const payload = {};
            if (action) payload.action = action;
            if (choice) payload.choice = choice;

            const response = await fetch(`${this.apiBase}/advance/${sessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Failed to advance mission: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[GameState] Failed to advance mission phase:', error);
            return null;
        }
    }

    /**
     * Get mission progress from backend
     * @param {string} missionId - Mission ID
     * @returns {Promise<Object|null>} Mission progress data
     */
    async getMissionProgress(missionId) {
        const sessionId = this.missionSessions.get(missionId);
        if (!sessionId) {
            console.warn('[GameState] No session ID for mission:', missionId);
            return null;
        }

        try {
            const response = await fetch(`${this.apiBase}/progress/${sessionId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to get mission progress: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[GameState] Failed to get mission progress:', error);
            return null;
        }
    }

    /**
     * End mission session on backend
     * @param {string} missionId - Mission ID
     * @returns {Promise<boolean>} Success status
     */
    async endMissionSession(missionId) {
        const sessionId = this.missionSessions.get(missionId);
        if (!sessionId) {
            return true; // No session to end
        }

        try {
            const response = await fetch(`${this.apiBase}/${sessionId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to end mission session: ${response.status}`);
            }

            this.missionSessions.delete(missionId);
            return true;
        } catch (error) {
            console.error('[GameState] Failed to end mission session:', error);
            return false;
        }
    }

    async completeMission(missionId, bonusScore = 0) {
        const missionIndex = this.activeMissions.findIndex(m => m.id === missionId);
        if (missionIndex === -1) return null;

        const mission = this.activeMissions[missionIndex];
        const char = this.characters.get(mission.assignedCharId);

        // End backend mission session
        await this.endMissionSession(missionId);

        // Remove from active
        this.activeMissions.splice(missionIndex, 1);

        // Update char
        char.status = 'IDLE';
        char.currentMissionId = null;
        char.missionEndTime = null;
        char.addExp(mission.rewardExp);

        // Give rewards + Bonus
        const totalMoney = mission.rewardMoney + bonusScore;
        this.addMoney(totalMoney);

        this.save();

        // Return enhanced result object
        const result = {
            mission,
            char,
            rewards: {
                money: totalMoney,
                exp: mission.rewardExp,
                bonus: bonusScore
            }
        };

        eventBus.emit('MISSION_COMPLETED', result);
        return result;
    }
}

export const gameState = new GameState();
