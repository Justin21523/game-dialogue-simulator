/**
 * Tutorial Manager System
 * Provides contextual tutorials, hints, and guides for players
 * Integrates with /tutorial/* API endpoints
 */

import { Toast } from '../ui/toast.js';
import { Modal } from '../ui/components/modal.js';

class TutorialManager {
    constructor() {
        this.apiBase = '/api/v1/tutorial';
        this.shownTutorials = new Set(); // Track which tutorials have been shown
        this.hintHistory = []; // Track hint requests
        this.language = 'en';
        this.autoHintsEnabled = true;
        this.storageKey = 'sw_tutorial_state';

        this.loadState();
    }

    /**
     * Initialize the tutorial manager
     */
    init() {
        console.log('[TutorialManager] Initialized');

        // Listen for game events that might trigger tutorials
        this.attachGameEventListeners();
    }

    /**
     * Load tutorial state from storage
     */
    loadState() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const state = JSON.parse(saved);
                this.shownTutorials = new Set(state.shownTutorials || []);
                this.hintHistory = state.hintHistory || [];
                this.autoHintsEnabled = state.autoHintsEnabled !== false;
            }
        } catch (error) {
            console.error('[TutorialManager] Failed to load state:', error);
        }
    }

    /**
     * Save tutorial state to storage
     */
    saveState() {
        try {
            const state = {
                shownTutorials: Array.from(this.shownTutorials),
                hintHistory: this.hintHistory.slice(-20), // Keep last 20 hints
                autoHintsEnabled: this.autoHintsEnabled,
            };
            localStorage.setItem(this.storageKey, JSON.stringify(state));
        } catch (error) {
            console.error('[TutorialManager] Failed to save state:', error);
        }
    }

    /**
     * Show character usage tutorial
     * @param {string} characterId - Character ID
     * @param {boolean} force - Force show even if already seen
     * @returns {Promise<Object|null>} Tutorial data
     */
    async showCharacterTutorial(characterId, force = false) {
        const tutorialId = `character_${characterId}`;

        if (!force && this.shownTutorials.has(tutorialId)) {
            console.log('[TutorialManager] Character tutorial already shown:', characterId);
            return null;
        }

        try {
            const response = await fetch(`${this.apiBase}/character/${characterId}?language=${this.language}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch character tutorial: ${response.status}`);
            }

            const data = await response.json();
            this.displayTutorialModal({
                title: `Character Guide: ${characterId}`,
                content: data.tutorial || data.content || 'No tutorial available',
                icon: '👤',
            });

            this.shownTutorials.add(tutorialId);
            this.saveState();

            return data;
        } catch (error) {
            console.error('[TutorialManager] Failed to fetch character tutorial:', error);
            return this.fallbackCharacterTutorial(characterId);
        }
    }

    /**
     * Show mission type tutorial
     * @param {string} missionType - Mission type
     * @param {boolean} force - Force show even if already seen
     * @returns {Promise<Object|null>} Tutorial data
     */
    async showMissionTypeTutorial(missionType, force = false) {
        const tutorialId = `mission_type_${missionType}`;

        if (!force && this.shownTutorials.has(tutorialId)) {
            console.log('[TutorialManager] Mission type tutorial already shown:', missionType);
            return null;
        }

        try {
            const response = await fetch(`${this.apiBase}/mission-type/${missionType}?language=${this.language}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch mission type tutorial: ${response.status}`);
            }

            const data = await response.json();
            this.displayTutorialModal({
                title: `Mission Type Guide: ${missionType}`,
                content: data.tutorial || data.content || 'No tutorial available',
                icon: '📚',
            });

            this.shownTutorials.add(tutorialId);
            this.saveState();

            return data;
        } catch (error) {
            console.error('[TutorialManager] Failed to fetch mission type tutorial:', error);
            return this.fallbackMissionTypeTutorial(missionType);
        }
    }

    /**
     * Explain a game concept
     * @param {string} topic - Topic to explain
     * @param {string|null} context - Optional context
     * @returns {Promise<Object>} Explanation data
     */
    async explainConcept(topic, context = null) {
        try {
            const payload = {
                topic: topic,
                context: context,
                language: this.language,
            };

            const response = await fetch(`${this.apiBase}/explain`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Failed to explain concept: ${response.status}`);
            }

            const data = await response.json();

            // Display explanation
            this.displayTutorialModal({
                title: `About: ${topic}`,
                content: data.tutorial || data.content || 'No explanation available',
                icon: '💡',
            });

            return data;
        } catch (error) {
            console.error('[TutorialManager] Failed to explain concept:', error);
            return this.fallbackExplanation(topic);
        }
    }

    /**
     * Get a contextual hint
     * @param {Object} context - Context object
     * @param {string} context.topic - Current topic/screen
     * @param {string} context.character_id - Current character (optional)
     * @param {string} context.mission_type - Current mission type (optional)
     * @returns {Promise<Object>} Hint data
     */
    async getHint(context = {}) {
        try {
            const payload = {
                topic: context.topic || 'general',
                character_id: context.character_id || null,
                mission_type: context.mission_type || null,
                difficulty: context.difficulty || 'normal',
                language: this.language,
            };

            const response = await fetch(`${this.apiBase}/hint`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Failed to get hint: ${response.status}`);
            }

            const data = await response.json();

            // Record hint
            this.hintHistory.push({
                topic: payload.topic,
                timestamp: Date.now(),
            });
            this.saveState();

            return data;
        } catch (error) {
            console.error('[TutorialManager] Failed to get hint:', error);
            return this.fallbackHint(context);
        }
    }

    /**
     * Check if player needs hints based on context
     * Auto-triggers hints when player seems stuck
     * @param {Object} playerState - Player state information
     */
    async checkForHints(playerState = {}) {
        if (!this.autoHintsEnabled) {
            return;
        }

        const now = Date.now();
        const lastHint = this.hintHistory[this.hintHistory.length - 1];

        // Don't spam hints - at least 2 minutes between auto-hints
        if (lastHint && now - lastHint.timestamp < 120000) {
            return;
        }

        // Detect if player is struggling
        const isStruggling = this.detectStruggle(playerState);

        if (isStruggling) {
            console.log('[TutorialManager] Player appears to be struggling, offering hint...');

            const hint = await this.getHint({
                topic: playerState.current_screen || 'general',
                character_id: playerState.selected_character || null,
                mission_type: playerState.current_mission_type || null,
            });

            if (hint && hint.tutorial) {
                Toast.show(`💡 Hint: ${hint.tutorial}`, 'info', 8000);
            }
        }
    }

    /**
     * Detect if player is struggling
     * @param {Object} playerState - Player state
     * @returns {boolean} True if struggling
     */
    detectStruggle(playerState) {
        // Example heuristics:
        // - Spent > 5 minutes on same screen without action
        // - Failed mission 3+ times in a row
        // - Low resources (money < 50, fuel < 20)
        // - No missions completed in last 10 minutes

        if (playerState.time_on_screen > 300000) { // 5 minutes
            return true;
        }

        if (playerState.consecutive_failures >= 3) {
            return true;
        }

        if (playerState.money < 50 && playerState.fuel < 20) {
            return true;
        }

        return false;
    }

    /**
     * Get list of available tutorial types
     * @returns {Promise<Array>} Tutorial types
     */
    async getTutorialTypes() {
        try {
            const response = await fetch(`${this.apiBase}/types`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to get tutorial types: ${response.status}`);
            }

            const data = await response.json();
            return data.types || [];
        } catch (error) {
            console.error('[TutorialManager] Failed to get tutorial types:', error);
            return [];
        }
    }

    /**
     * Display tutorial in a modal
     * @param {Object} options - Modal options
     * @param {string} options.title - Modal title
     * @param {string} options.content - Tutorial content
     * @param {string} options.icon - Icon emoji
     */
    displayTutorialModal(options) {
        const modal = new Modal('tutorial-modal');

        modal.show({
            title: `${options.icon} ${options.title}`,
            content: `
                <div class="tutorial-content">
                    ${options.content}
                </div>
            `,
            footer: `
                <button class="btn btn-primary modal-close">Got it!</button>
            `,
        });

        // Close button
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.hide();
        });
    }

    /**
     * Attach event listeners for auto-tutorials
     */
    attachGameEventListeners() {
        if (window.eventBus) {
            // Show character tutorial when character selected
            window.eventBus.on('CHARACTER_SELECTED', (data) => {
                if (data.characterId && !this.shownTutorials.has(`character_${data.characterId}`)) {
                    setTimeout(() => {
                        this.showCharacterTutorial(data.characterId);
                    }, 1000);
                }
            });

            // Show mission type tutorial when viewing mission board
            window.eventBus.on('MISSION_BOARD_OPENED', (data) => {
                if (data.firstTime && data.missionType) {
                    setTimeout(() => {
                        this.showMissionTypeTutorial(data.missionType);
                    }, 2000);
                }
            });
        }
    }

    /**
     * Reset all shown tutorials (for testing)
     */
    resetTutorials() {
        this.shownTutorials.clear();
        this.hintHistory = [];
        this.saveState();
        console.log('[TutorialManager] All tutorials reset');
    }

    /**
     * Toggle auto-hints
     * @param {boolean} enabled - Enable/disable auto-hints
     */
    toggleAutoHints(enabled) {
        this.autoHintsEnabled = enabled;
        this.saveState();
        Toast.show(`Auto-hints ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }

    // ========== Fallback Methods ==========

    fallbackCharacterTutorial(characterId) {
        return {
            tutorial: `${characterId} is a Super Wings character. Select them for missions that match their specialty!`,
            content: `This character has unique abilities. Match their type with mission types for bonus rewards.`,
        };
    }

    fallbackMissionTypeTutorial(missionType) {
        return {
            tutorial: `${missionType} missions require specific skills. Choose the right character for better results!`,
            content: `Match character types with mission types to maximize success and rewards.`,
        };
    }

    fallbackExplanation(topic) {
        return {
            tutorial: `${topic}: A core game concept. Explore more to learn!`,
            content: `This is an important part of the game. Keep playing to master it.`,
        };
    }

    fallbackHint(context) {
        const hints = [
            'Match character types with mission types for bonus rewards.',
            'Keep an eye on your fuel levels before accepting missions.',
            'Complete missions to earn money and experience.',
            'Try using AI recommendations for the best character choices.',
        ];

        return {
            tutorial: hints[Math.floor(Math.random() * hints.length)],
            content: 'Here\'s a tip to help you progress!',
        };
    }
}

// Create singleton instance
const tutorialManager = new TutorialManager();

// Make available globally
window.tutorialManager = tutorialManager;

export default tutorialManager;
