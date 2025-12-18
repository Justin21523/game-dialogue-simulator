import { eventBus } from '../core/event-bus.js';
import { aiService } from '../core/ai-service.js';

/**
 * NPC Interaction Handler (Stage 3)
 *
 * Evaluates the impact of NPC interactions on active missions.
 * Makes ALL NPC interactions potentially meaningful by:
 * - Creating dynamic subtasks
 * - Providing hints
 * - Unlocking alternative paths
 * - Triggering dynamic events
 *
 * This is the core of making non-mission NPCs relevant to missions.
 */
export class NPCInteractionHandler {
    constructor() {
        this.world = null;
        this.activeMission = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen to NPC interactions
        eventBus.on('NPC_INTERACTION', (data) => this.onNPCInteraction(data));

        // Listen to dialogue endings
        eventBus.on('DIALOGUE_ENDED', (data) => this.onDialogueEnded(data));

        // Mission tracking
        eventBus.on('MISSION_STARTED', (data) => {
            this.activeMission = data.mission;
            this.world = data.world;
        });

        eventBus.on('MISSION_COMPLETED', () => {
            this.activeMission = null;
        });

        eventBus.on('MISSION_FAILED', () => {
            this.activeMission = null;
        });
    }

    /**
     * Handle NPC interaction
     * @param {Object} data - Interaction data
     */
    async onNPCInteraction(data) {
        const { npc, player } = data;

        if (!this.activeMission) {
            console.log('[NPCInteractionHandler] No active mission, skipping evaluation');
            return;
        }

        console.log(`[NPCInteractionHandler] Evaluating interaction: player=${player.characterId}, npc=${npc.npcId}`);

        // Evaluate with AI
        try {
            const evaluation = await aiService.evaluateNPCInteraction({
                npc_id: npc.npcId,
                npc_type: npc.type || 'resident',
                player_id: player.characterId,
                dialogue_content: npc.lastDialogue || {},
                active_mission: this.activeMission.id,
                interaction_history: npc.interactionHistory || []
            });

            // Process evaluation results
            this.processEvaluation(evaluation, npc, player);

        } catch (e) {
            console.warn('[NPCInteractionHandler] Evaluation failed', e);
        }
    }

    /**
     * Handle dialogue ending (final evaluation point)
     * @param {Object} data - Dialogue data
     */
    async onDialogueEnded(data) {
        // This is called when dialogue closes
        // Can be used for post-dialogue effects
    }

    /**
     * Process AI evaluation results
     * @param {Object} evaluation - AI evaluation response
     * @param {Object} npc - The NPC
     * @param {Object} player - The player
     */
    processEvaluation(evaluation, npc, player) {
        if (!evaluation) return;

        console.log('[NPCInteractionHandler] Processing evaluation:', evaluation);

        // 1. Create dynamic subtask
        if (evaluation.creates_subtask && evaluation.subtask_data) {
            this.createDynamicSubtask(evaluation.subtask_data, npc);
        }

        // 2. Provide hint
        if (evaluation.provides_hint && evaluation.hint) {
            this.provideHint(evaluation.hint);
        }

        // 3. Unlock alternative path
        if (evaluation.unlocks_alternative && evaluation.alternative_data) {
            this.unlockAlternative(evaluation.alternative_data, npc);
        }

        // 4. Trigger event
        if (evaluation.triggers_event && evaluation.event_data) {
            this.triggerEvent(evaluation.event_data, npc);
        }
    }

    /**
     * Create a dynamic subtask from NPC interaction
     * @param {Object} subtaskData - Subtask data from AI
     * @param {Object} npc - The NPC who triggered it
     */
    createDynamicSubtask(subtaskData, npc) {
        if (!this.activeMission) return;

        console.log('[NPCInteractionHandler] Creating dynamic subtask:', subtaskData);

        // Add to mission's dynamic tasks
        const taskToAdd = {
            id: `dynamic_task_${Date.now()}`,
            ...subtaskData,
            isDynamic: true,
            aiGenerated: true,
            triggeredBy: npc.npcId,
            timestamp: Date.now()
        };

        eventBus.emit('DYNAMIC_TASKS_ADDED', {
            mission: this.activeMission,
            tasks: [taskToAdd]
        });

        // Show notification
        eventBus.emit('SHOW_TOAST', {
            message: `✨ New objective: ${subtaskData.title}`,
            type: 'info',
            duration: 4000
        });
    }

    /**
     * Provide a hint to the player
     * @param {string} hint - Hint text
     */
    provideHint(hint) {
        console.log('[NPCInteractionHandler] Providing hint:', hint);

        eventBus.emit('SHOW_TOAST', {
            message: `💡 Hint: ${hint}`,
            type: 'info',
            duration: 6000
        });

        eventBus.emit('MISSION_HINT', {
            hint,
            source: 'npc_interaction',
            timestamp: Date.now()
        });
    }

    /**
     * Unlock an alternative mission path
     * @param {Object} alternativeData - Alternative path data
     * @param {Object} npc - The NPC who triggered it
     */
    unlockAlternative(alternativeData, npc) {
        if (!this.activeMission) return;

        console.log('[NPCInteractionHandler] Unlocking alternative path:', alternativeData);

        // Record alternative completion method
        this.activeMission.recordAlternativeCompletion?.(
            alternativeData.title || 'npc_shortcut',
            {
                npc_id: npc.npcId,
                ...alternativeData
            }
        );

        eventBus.emit('ALTERNATIVE_PATH_UNLOCKED', {
            mission: this.activeMission,
            alternative: alternativeData,
            npc: npc
        });

        eventBus.emit('SHOW_TOAST', {
            message: `🌟 Alternative approach unlocked: ${alternativeData.title}`,
            type: 'success',
            duration: 5000
        });
    }

    /**
     * Trigger a dynamic event
     * @param {Object} eventData - Event data
     * @param {Object} npc - The NPC who triggered it
     */
    triggerEvent(eventData, npc) {
        console.log('[NPCInteractionHandler] Triggering event:', eventData);

        eventBus.emit('DYNAMIC_EVENT', {
            type: eventData.type || 'npc_triggered',
            data: {
                ...eventData,
                triggered_by: npc.npcId
            },
            source: 'npc_interaction'
        });
    }

    /**
     * Get handler status
     * @returns {Object}
     */
    getStatus() {
        return {
            activeMission: this.activeMission?.id || null,
            hasWorld: !!this.world
        };
    }
}

// Singleton instance
export const npcInteractionHandler = new NPCInteractionHandler();
