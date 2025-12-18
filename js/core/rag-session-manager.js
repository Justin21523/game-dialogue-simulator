import { aiService } from './ai-service.js';
import { eventBus } from './event-bus.js';

/**
 * RAG Session Manager
 *
 * Manages RAG (Retrieval-Augmented Generation) sessions for maintaining AI context.
 * Maintains a global session and creates mission-specific sessions as needed.
 *
 * Features:
 * - Global RAG session (game-wide context)
 * - Mission-specific RAG sessions
 * - Periodic context updates
 * - Automatic cleanup
 */
export class RAGSessionManager {
    constructor() {
        this.globalSessionId = null;
        this.missionSessions = new Map(); // mission_id -> session_id

        // Update interval (5 seconds)
        this.updateInterval = 5000;
        this.updateTimer = null;

        // Context tracking
        this.globalContext = {
            gameStartTime: Date.now(),
            completedMissions: [],
            unlockedCharacters: [],
            visitedLocations: []
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Track game-wide events for global context
        eventBus.on('MISSION_COMPLETED', (data) => {
            if (data.mission) {
                this.globalContext.completedMissions.push({
                    id: data.mission.id,
                    destination: data.mission.destination,
                    completedAt: Date.now()
                });
            }
        });

        eventBus.on('CHARACTER_UNLOCKED', (data) => {
            if (data.characterId && !this.globalContext.unlockedCharacters.includes(data.characterId)) {
                this.globalContext.unlockedCharacters.push(data.characterId);
            }
        });

        eventBus.on('LOCATION_VISITED', (data) => {
            if (data.location && !this.globalContext.visitedLocations.includes(data.location)) {
                this.globalContext.visitedLocations.push(data.location);
            }
        });
    }

    /**
     * Initialize global RAG session
     */
    async initializeGlobalSession() {
        if (this.globalSessionId) {
            console.log('[RAGSessionManager] Global session already exists');
            return this.globalSessionId;
        }

        try {
            this.globalSessionId = await aiService.createRAGSession({
                type: 'global',
                knowledge_domains: ['characters', 'locations', 'missions', 'abilities'],
                context: this.globalContext
            });

            console.log(`[RAGSessionManager] Global RAG session created: ${this.globalSessionId}`);

            // Start periodic updates
            this.startPeriodicUpdates();

            return this.globalSessionId;

        } catch (e) {
            console.error('[RAGSessionManager] Failed to create global session', e);
            return null;
        }
    }

    /**
     * Create mission-specific RAG session
     */
    async createMissionSession(mission, additionalContext = {}) {
        if (!mission || !mission.id) {
            console.warn('[RAGSessionManager] Invalid mission provided');
            return null;
        }

        // Check if session already exists
        if (this.missionSessions.has(mission.id)) {
            console.log(`[RAGSessionManager] Mission session already exists: ${mission.id}`);
            return this.missionSessions.get(mission.id);
        }

        try {
            const sessionId = await aiService.createRAGSession({
                type: 'mission',
                mission_id: mission.id,
                parent_session: this.globalSessionId,
                knowledge_domains: ['missions', 'locations', 'npcs'],
                context: {
                    destination: mission.destination,
                    difficulty: mission.difficulty,
                    objectives: mission.objectives || [],
                    ...additionalContext
                }
            });

            this.missionSessions.set(mission.id, sessionId);
            console.log(`[RAGSessionManager] Mission RAG session created: ${sessionId} for mission ${mission.id}`);

            return sessionId;

        } catch (e) {
            console.error('[RAGSessionManager] Failed to create mission session', e);
            return null;
        }
    }

    /**
     * Delete mission-specific RAG session
     */
    async deleteMissionSession(missionId) {
        const sessionId = this.missionSessions.get(missionId);
        if (!sessionId) return;

        try {
            await aiService.deleteRAGSession(sessionId);
            this.missionSessions.delete(missionId);
            console.log(`[RAGSessionManager] Deleted mission session: ${sessionId}`);
        } catch (e) {
            console.warn('[RAGSessionManager] Failed to delete mission session', e);
        }
    }

    /**
     * Update RAG context
     */
    async updateContext(sessionId, context) {
        if (!sessionId) return;

        try {
            await aiService.updateRAGContext({
                session_id: sessionId,
                context
            });
        } catch (e) {
            console.warn('[RAGSessionManager] Failed to update context', e);
        }
    }

    /**
     * Update global context
     */
    async updateGlobalContext(updates) {
        this.globalContext = {
            ...this.globalContext,
            ...updates,
            lastUpdateTime: Date.now()
        };

        if (this.globalSessionId) {
            await this.updateContext(this.globalSessionId, this.globalContext);
        }
    }

    /**
     * Query RAG system
     */
    async query(sessionId, question, maxResults = 5) {
        if (!sessionId) {
            console.warn('[RAGSessionManager] No session ID provided');
            return [];
        }

        try {
            const response = await aiService.queryRAG({
                session_id: sessionId,
                question,
                max_results: maxResults
            });

            return response.results || [];

        } catch (e) {
            console.warn('[RAGSessionManager] Query failed', e);
            return [];
        }
    }

    /**
     * Start periodic context updates
     */
    startPeriodicUpdates() {
        if (this.updateTimer) return;

        this.updateTimer = setInterval(async () => {
            await this.periodicUpdate();
        }, this.updateInterval);

        console.log('[RAGSessionManager] Periodic updates started');
    }

    /**
     * Stop periodic updates
     */
    stopPeriodicUpdates() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
            console.log('[RAGSessionManager] Periodic updates stopped');
        }
    }

    /**
     * Periodic update of global context
     */
    async periodicUpdate() {
        if (!this.globalSessionId) return;

        await this.updateGlobalContext({
            sessionDuration: Date.now() - this.globalContext.gameStartTime
        });
    }

    /**
     * Get session ID for mission
     */
    getMissionSession(missionId) {
        return this.missionSessions.get(missionId) || null;
    }

    /**
     * Get global session ID
     */
    getGlobalSession() {
        return this.globalSessionId;
    }

    /**
     * Cleanup all sessions
     */
    async cleanup() {
        console.log('[RAGSessionManager] Cleaning up all RAG sessions');

        // Delete all mission sessions
        for (const [missionId, sessionId] of this.missionSessions) {
            try {
                await aiService.deleteRAGSession(sessionId);
            } catch (e) {
                console.warn(`[RAGSessionManager] Failed to delete session ${sessionId}`, e);
            }
        }
        this.missionSessions.clear();

        // Delete global session
        if (this.globalSessionId) {
            try {
                await aiService.deleteRAGSession(this.globalSessionId);
            } catch (e) {
                console.warn('[RAGSessionManager] Failed to delete global session', e);
            }
            this.globalSessionId = null;
        }

        // Stop updates
        this.stopPeriodicUpdates();
    }

    /**
     * Get manager status
     */
    getStatus() {
        return {
            globalSessionId: this.globalSessionId,
            missionSessions: Array.from(this.missionSessions.entries()),
            globalContext: this.globalContext,
            isUpdating: !!this.updateTimer
        };
    }
}

// Singleton instance
export const ragSessionManager = new RAGSessionManager();
