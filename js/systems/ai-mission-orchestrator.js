import { eventBus } from '../core/event-bus.js';
import { aiService } from '../core/ai-service.js';

/**
 * AI Mission Orchestrator
 *
 * Continuously evaluates mission state and dynamically adjusts content based on AI suggestions.
 * This is the core of making missions truly AI-driven rather than template-based.
 *
 * Features:
 * - Periodic AI evaluation (every 10 seconds)
 * - Dynamic event injection
 * - Alternative path creation
 * - Hint system
 * - RAG session management
 */
export class AIMissionOrchestrator {
    constructor() {
        this.activeMission = null;
        this.evaluationInterval = 10000; // 10 seconds
        this.evaluationTimer = null;
        this.ragSessionId = null;
        this.isRunning = false;

        // Game state capture
        this.world = null;
        this.player = null;

        // Action tracking for AI context
        this.recentActions = [];
        this.maxActionsTracked = 20;

        // Performance
        this.lastEvaluationTime = 0;
        this.evaluationCount = 0;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Mission lifecycle
        eventBus.on('MISSION_STARTED', (data) => this.onMissionStarted(data));
        eventBus.on('MISSION_COMPLETED', () => this.onMissionCompleted());
        eventBus.on('MISSION_FAILED', () => this.onMissionCompleted());

        // Track player actions for AI context
        eventBus.on('PLAYER_MOVED', (data) => this.trackAction('move', data));
        eventBus.on('ITEM_COLLECTED', (data) => this.trackAction('collect', data));
        eventBus.on('NPC_INTERACTION', (data) => this.trackAction('talk', data));
        eventBus.on('ABILITY_USED', (data) => this.trackAction('ability', data));
        eventBus.on('BLOCKER_RESOLVED', (data) => this.trackAction('resolve', data));
        eventBus.on('SUBTASK_COMPLETED', (data) => this.trackAction('complete_subtask', data));
    }

    /**
     * Start AI orchestration for a mission
     */
    async onMissionStarted(data) {
        const { mission, world, player } = data;

        if (!mission) {
            console.warn('[AIMissionOrchestrator] No mission provided');
            return;
        }

        console.log(`[AIMissionOrchestrator] Starting orchestration for mission: ${mission.id}`);

        this.activeMission = mission;
        this.world = world;
        this.player = player;
        this.recentActions = [];
        this.evaluationCount = 0;

        // Create RAG session for this mission
        try {
            this.ragSessionId = await aiService.createRAGSession({
                type: 'mission',
                mission_id: mission.id,
                parent_session: world.globalRagSession || null,
                knowledge_domains: ['missions', 'locations', 'characters'],
                context: {
                    destination: mission.destination,
                    difficulty: mission.difficulty,
                    player_character: player.characterId
                }
            });

            console.log(`[AIMissionOrchestrator] RAG session created: ${this.ragSessionId}`);
        } catch (e) {
            console.warn('[AIMissionOrchestrator] Failed to create RAG session, continuing without', e);
        }

        // Start evaluation loop
        this.startEvaluationLoop();
    }

    /**
     * Stop AI orchestration when mission ends
     */
    async onMissionCompleted() {
        console.log('[AIMissionOrchestrator] Mission ended, stopping orchestration');
        this.stopEvaluationLoop();

        // Cleanup RAG session
        if (this.ragSessionId) {
            try {
                await aiService.deleteRAGSession(this.ragSessionId);
            } catch (e) {
                console.warn('[AIMissionOrchestrator] Failed to delete RAG session', e);
            }
            this.ragSessionId = null;
        }

        this.activeMission = null;
        this.world = null;
        this.player = null;
    }

    /**
     * Start the periodic evaluation loop
     */
    startEvaluationLoop() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastEvaluationTime = Date.now();

        // Initial evaluation after 5 seconds
        setTimeout(() => this.performAIEvaluation(), 5000);

        // Then every 10 seconds
        this.evaluationTimer = setInterval(() => {
            this.performAIEvaluation();
        }, this.evaluationInterval);

        console.log('[AIMissionOrchestrator] Evaluation loop started');
    }

    /**
     * Stop the evaluation loop
     */
    stopEvaluationLoop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        if (this.evaluationTimer) {
            clearInterval(this.evaluationTimer);
            this.evaluationTimer = null;
        }

        console.log('[AIMissionOrchestrator] Evaluation loop stopped');
    }

    /**
     * Track player actions for AI context
     */
    trackAction(type, data) {
        if (!this.activeMission) return;

        this.recentActions.push({
            type,
            data,
            timestamp: Date.now()
        });

        // Keep only recent actions
        if (this.recentActions.length > this.maxActionsTracked) {
            this.recentActions.shift();
        }
    }

    /**
     * Capture current game state for AI evaluation
     */
    captureGameState() {
        if (!this.world || !this.player) return {};

        return {
            player: {
                characterId: this.player.characterId,
                position: { x: this.player.x, y: this.player.y },
                health: this.player.health || 100,
                activeAbilities: this.player.activeAbilities || []
            },
            world: {
                currentLocation: this.world.currentLocation,
                timeSpent: Date.now() - (this.world.missionStartTime || Date.now()),
                npcsInteracted: Array.from(this.world.npcs?.values() || [])
                    .filter(npc => npc.hasInteracted)
                    .map(npc => npc.npcId),
                itemsCollected: Array.from(this.world.items?.values() || [])
                    .filter(item => item.isCollected)
                    .length,
                blockersResolved: Array.from(this.world.blockers?.values() || [])
                    .filter(b => b.isResolved)
                    .length
            },
            recentActions: this.recentActions.slice(-10) // Last 10 actions
        };
    }

    /**
     * Perform AI evaluation of mission state
     */
    async performAIEvaluation() {
        if (!this.activeMission || !this.isRunning) return;

        const now = Date.now();
        const timeSinceLastEval = now - this.lastEvaluationTime;

        console.log(`[AIMissionOrchestrator] Evaluation #${++this.evaluationCount} (${timeSinceLastEval}ms since last)`);

        try {
            // Capture game state
            const gameState = this.captureGameState();

            // Update RAG context
            if (this.ragSessionId) {
                await aiService.updateRAGContext({
                    session_id: this.ragSessionId,
                    game_state: gameState,
                    mission_progress: {
                        completed_tasks: this.activeMission.completedSubTasks || [],
                        active_task: this.activeMission.getCurrentTask?.() || null,
                        completion_rate: this.activeMission.completionRate || 0
                    }
                });
            }

            // Call AI to evaluate mission state
            const evaluation = await aiService.evaluateMissionState({
                rag_session_id: this.ragSessionId,
                mission: this.activeMission.serialize?.() || {
                    id: this.activeMission.id,
                    destination: this.activeMission.destination,
                    difficulty: this.activeMission.difficulty
                },
                game_state: gameState,
                player_actions: this.recentActions
            });

            // Process AI suggestions
            this.processAIEvaluation(evaluation);

            this.lastEvaluationTime = now;

        } catch (e) {
            console.warn('[AIMissionOrchestrator] Evaluation failed', e);
        }
    }

    /**
     * Process AI evaluation results and apply suggestions
     */
    processAIEvaluation(evaluation) {
        if (!evaluation) return;

        console.log('[AIMissionOrchestrator] Processing AI evaluation:', evaluation);

        // 1. Trigger suggested events
        if (evaluation.suggested_events && evaluation.suggested_events.length > 0) {
            for (const event of evaluation.suggested_events) {
                this.triggerDynamicEvent(event);
            }
        }

        // 2. Add new opportunities (alternative paths)
        if (evaluation.new_opportunities && evaluation.new_opportunities.length > 0) {
            this.addAlternativePaths(evaluation.new_opportunities);
        }

        // 3. Provide hints if needed
        if (evaluation.hints && evaluation.hints.length > 0) {
            this.provideHints(evaluation.hints, evaluation.hint_urgency || 'low');
        }

        // 4. Dynamic task generation
        if (evaluation.suggested_tasks && evaluation.suggested_tasks.length > 0) {
            this.addDynamicTasks(evaluation.suggested_tasks);
        }
    }

    /**
     * Trigger a dynamic event suggested by AI
     */
    triggerDynamicEvent(event) {
        console.log('[AIMissionOrchestrator] Triggering dynamic event:', event);

        eventBus.emit('DYNAMIC_EVENT', {
            type: event.type,
            data: event,
            source: 'ai_orchestrator'
        });
    }

    /**
     * Add alternative paths to mission
     */
    addAlternativePaths(opportunities) {
        console.log('[AIMissionOrchestrator] Adding alternative paths:', opportunities);

        eventBus.emit('ALTERNATIVE_PATHS_ADDED', {
            mission: this.activeMission,
            paths: opportunities
        });

        // Show notification to player
        eventBus.emit('SHOW_TOAST', {
            message: '💡 New approach discovered!',
            type: 'success',
            duration: 3000
        });
    }

    /**
     * Provide hints to player
     */
    provideHints(hints, urgency) {
        if (hints.length === 0) return;

        console.log(`[AIMissionOrchestrator] Providing hints (urgency: ${urgency}):`, hints);

        // Choose hint based on urgency
        const hint = hints[0];

        let icon = '💭';
        let duration = 5000;

        if (urgency === 'high') {
            icon = '⚡';
            duration = 8000;
        } else if (urgency === 'medium') {
            icon = '💡';
            duration = 6000;
        }

        eventBus.emit('SHOW_TOAST', {
            message: `${icon} Hint: ${hint}`,
            type: 'info',
            duration
        });

        // Also emit as mission hint event
        eventBus.emit('MISSION_HINT', {
            hint,
            urgency,
            timestamp: Date.now()
        });
    }

    /**
     * Add dynamically generated tasks to mission
     */
    addDynamicTasks(tasks) {
        if (!this.activeMission || tasks.length === 0) return;

        console.log('[AIMissionOrchestrator] Adding dynamic tasks:', tasks);

        eventBus.emit('DYNAMIC_TASKS_ADDED', {
            mission: this.activeMission,
            tasks
        });

        eventBus.emit('SHOW_TOAST', {
            message: `✨ New objective: ${tasks[0].title}`,
            type: 'info',
            duration: 4000
        });
    }

    /**
     * Manually trigger evaluation (for debugging)
     */
    async triggerEvaluation() {
        await this.performAIEvaluation();
    }

    /**
     * Get orchestrator status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeMission: this.activeMission?.id || null,
            ragSessionId: this.ragSessionId,
            evaluationCount: this.evaluationCount,
            recentActions: this.recentActions.length,
            lastEvaluation: this.lastEvaluationTime
        };
    }
}

// Singleton instance
export const aiMissionOrchestrator = new AIMissionOrchestrator();
