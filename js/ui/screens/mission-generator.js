/**
 * Mission Generator Screen
 * Uses AI to generate new missions dynamically
 * Integrates with /missions/generate API
 */

import { gameState } from '../../core/game-state.js';
import { Toast } from '../toast.js';

export class MissionGeneratorScreen {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.apiBase = '/api/v1/missions';
        this.generatedMissions = [];
        this.isGenerating = false;
    }

    /**
     * Render the mission generator UI
     */
    render() {
        this.container.innerHTML = `
            <div class="screen mission-generator-screen anim-slide-up">
                <header class="screen-header">
                    <h2><span class="icon">🤖</span> AI MISSION GENERATOR</h2>
                    <p class="subtitle">Create custom missions with AI</p>
                </header>

                <div class="generator-controls panel">
                    <h3>Generation Settings</h3>

                    <div class="form-group">
                        <label for="mission-level">Difficulty Level:</label>
                        <input type="range" id="mission-level" min="1" max="5" value="1" />
                        <span id="level-display">Level 1</span>
                    </div>

                    <div class="form-group">
                        <label for="mission-type-select">Mission Type (Optional):</label>
                        <select id="mission-type-select">
                            <option value="">Random</option>
                            <option value="Delivery">Delivery</option>
                            <option value="Rescue">Rescue</option>
                            <option value="Construction">Construction</option>
                            <option value="Sports">Sports</option>
                            <option value="Police">Police</option>
                            <option value="Nature">Nature</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="mission-location-input">Location (Optional):</label>
                        <input
                            type="text"
                            id="mission-location-input"
                            placeholder="e.g., Paris, Tokyo, Amazon Rainforest"
                            class="text-input"
                        />
                    </div>

                    <div class="form-group">
                        <label for="batch-count">Generate Multiple:</label>
                        <input type="number" id="batch-count" min="1" max="10" value="1" />
                        <span class="hint">Generate 1-10 missions at once</span>
                    </div>

                    <div class="button-group">
                        <button id="btn-generate" class="btn btn-primary">
                            🎲 Generate Mission
                        </button>
                        <button id="btn-generate-batch" class="btn btn-secondary">
                            📦 Generate Batch
                        </button>
                    </div>
                </div>

                <div id="generated-missions-container" class="generated-missions">
                    <h3>Generated Missions</h3>
                    <div id="missions-list" class="missions-list">
                        <div class="empty-state">No missions generated yet. Click "Generate Mission" to start!</div>
                    </div>
                </div>

                <div class="action-bar">
                    <button id="btn-back" class="btn btn-secondary">◀ Back</button>
                    <button id="btn-accept-all" class="btn btn-success" disabled>
                        ✓ Accept All Generated Missions
                    </button>
                    <button id="btn-clear" class="btn btn-warning" disabled>
                        🗑️ Clear Generated
                    </button>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    /**
     * Attach event listeners
     */
    attachEvents() {
        // Level slider
        const levelSlider = document.getElementById('mission-level');
        const levelDisplay = document.getElementById('level-display');
        if (levelSlider && levelDisplay) {
            levelSlider.addEventListener('input', (e) => {
                levelDisplay.textContent = `Level ${e.target.value}`;
            });
        }

        // Generate single mission
        const btnGenerate = document.getElementById('btn-generate');
        if (btnGenerate) {
            btnGenerate.addEventListener('click', () => this.generateSingleMission());
        }

        // Generate batch
        const btnGenerateBatch = document.getElementById('btn-generate-batch');
        if (btnGenerateBatch) {
            btnGenerateBatch.addEventListener('click', () => this.generateBatchMissions());
        }

        // Accept all missions
        const btnAcceptAll = document.getElementById('btn-accept-all');
        if (btnAcceptAll) {
            btnAcceptAll.addEventListener('click', () => this.acceptAllMissions());
        }

        // Clear generated missions
        const btnClear = document.getElementById('btn-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => this.clearGenerated());
        }

        // Back button
        const btnBack = document.getElementById('btn-back');
        if (btnBack) {
            btnBack.addEventListener('click', () => {
                if (window.game && window.game.renderMissionBoard) {
                    window.game.renderMissionBoard();
                }
            });
        }
    }

    /**
     * Generate a single mission
     */
    async generateSingleMission() {
        if (this.isGenerating) {
            Toast.show('Already generating...', 'warning');
            return;
        }

        const level = parseInt(document.getElementById('mission-level')?.value || 1);
        const missionType = document.getElementById('mission-type-select')?.value || null;
        const location = document.getElementById('mission-location-input')?.value?.trim() || null;

        const btnGenerate = document.getElementById('btn-generate');
        if (btnGenerate) {
            btnGenerate.disabled = true;
            btnGenerate.textContent = '🎲 Generating...';
        }

        this.isGenerating = true;

        try {
            const mission = await this.callGenerateAPI(level, missionType, location);
            this.generatedMissions.push(mission);
            this.renderGeneratedMissions();
            Toast.show('Mission generated successfully!', 'success');
        } catch (error) {
            console.error('[MissionGenerator] Generation failed:', error);
            Toast.show('Mission generation failed. Try again.', 'error');
        } finally {
            this.isGenerating = false;
            if (btnGenerate) {
                btnGenerate.disabled = false;
                btnGenerate.textContent = '🎲 Generate Mission';
            }
        }
    }

    /**
     * Generate multiple missions at once
     */
    async generateBatchMissions() {
        if (this.isGenerating) {
            Toast.show('Already generating...', 'warning');
            return;
        }

        const count = parseInt(document.getElementById('batch-count')?.value || 1);
        const level = parseInt(document.getElementById('mission-level')?.value || 1);

        const btnBatch = document.getElementById('btn-generate-batch');
        if (btnBatch) {
            btnBatch.disabled = true;
            btnBatch.textContent = `📦 Generating ${count}...`;
        }

        this.isGenerating = true;

        try {
            const promises = [];
            for (let i = 0; i < count; i++) {
                promises.push(this.callGenerateAPI(level, null, null));
            }

            const missions = await Promise.all(promises);
            this.generatedMissions.push(...missions);
            this.renderGeneratedMissions();
            Toast.show(`${count} missions generated successfully!`, 'success');
        } catch (error) {
            console.error('[MissionGenerator] Batch generation failed:', error);
            Toast.show('Batch generation failed. Try again.', 'error');
        } finally {
            this.isGenerating = false;
            if (btnBatch) {
                btnBatch.disabled = false;
                btnBatch.textContent = '📦 Generate Batch';
            }
        }
    }

    /**
     * Call the /missions/generate API
     * @param {number} level - Mission difficulty level
     * @param {string|null} missionType - Optional mission type
     * @param {string|null} location - Optional location
     * @returns {Promise<Object>} Generated mission data
     */
    async callGenerateAPI(level, missionType, location) {
        const payload = {
            level: level,
        };

        if (missionType) {
            payload.mission_type = missionType;
        }

        if (location) {
            payload.location = location;
        }

        const response = await fetch(`${this.apiBase}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    }

    /**
     * Render the list of generated missions
     */
    renderGeneratedMissions() {
        const missionsList = document.getElementById('missions-list');
        if (!missionsList) return;

        if (this.generatedMissions.length === 0) {
            missionsList.innerHTML = '<div class="empty-state">No missions generated yet. Click "Generate Mission" to start!</div>';
            document.getElementById('btn-accept-all').disabled = true;
            document.getElementById('btn-clear').disabled = true;
            return;
        }

        missionsList.innerHTML = this.generatedMissions.map((mission, index) => `
            <div class="generated-mission-card panel" data-index="${index}">
                <div class="mission-header">
                    <h4>${mission.title}</h4>
                    <span class="mission-type-badge">${mission.type}</span>
                </div>
                <div class="mission-details">
                    <p><strong>📍 Location:</strong> ${mission.location}</p>
                    <p><strong>📝 Description:</strong> ${mission.description}</p>
                    <p><strong>💰 Reward:</strong> ${mission.reward_money}</p>
                    <p><strong>⏱️ Duration:</strong> ${mission.duration}s</p>
                    <p><strong>⛽ Fuel Cost:</strong> ${mission.fuel_cost}</p>
                </div>
                <div class="mission-actions">
                    <button class="btn btn-sm btn-success btn-accept-single" data-index="${index}">
                        ✓ Accept
                    </button>
                    <button class="btn btn-sm btn-danger btn-remove-single" data-index="${index}">
                        ✗ Remove
                    </button>
                </div>
            </div>
        `).join('');

        // Enable action buttons
        document.getElementById('btn-accept-all').disabled = false;
        document.getElementById('btn-clear').disabled = false;

        // Attach individual mission actions
        this.attachMissionActions();
    }

    /**
     * Attach event listeners to individual mission cards
     */
    attachMissionActions() {
        // Accept single mission
        document.querySelectorAll('.btn-accept-single').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.acceptSingleMission(index);
            });
        });

        // Remove single mission
        document.querySelectorAll('.btn-remove-single').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.removeSingleMission(index);
            });
        });
    }

    /**
     * Accept a single generated mission
     * @param {number} index - Mission index
     */
    acceptSingleMission(index) {
        const mission = this.generatedMissions[index];
        if (!mission) return;

        // Add to game state's available missions
        gameState.availableMissions.push(this.convertToMissionObject(mission));
        gameState.save();

        // Remove from generated list
        this.generatedMissions.splice(index, 1);
        this.renderGeneratedMissions();

        Toast.show(`Mission "${mission.title}" added to mission board!`, 'success');
    }

    /**
     * Remove a single generated mission
     * @param {number} index - Mission index
     */
    removeSingleMission(index) {
        const mission = this.generatedMissions[index];
        if (!mission) return;

        this.generatedMissions.splice(index, 1);
        this.renderGeneratedMissions();

        Toast.show('Mission removed', 'info');
    }

    /**
     * Accept all generated missions
     */
    acceptAllMissions() {
        if (this.generatedMissions.length === 0) return;

        const count = this.generatedMissions.length;

        // Add all to game state
        this.generatedMissions.forEach(mission => {
            gameState.availableMissions.push(this.convertToMissionObject(mission));
        });

        gameState.save();

        // Clear generated list
        this.generatedMissions = [];
        this.renderGeneratedMissions();

        Toast.show(`${count} missions added to mission board!`, 'success');
    }

    /**
     * Clear all generated missions
     */
    clearGenerated() {
        if (this.generatedMissions.length === 0) return;

        this.generatedMissions = [];
        this.renderGeneratedMissions();

        Toast.show('Generated missions cleared', 'info');
    }

    /**
     * Convert API mission data to game Mission object format
     * @param {Object} apiMission - Mission data from API
     * @returns {Object} Mission object
     */
    convertToMissionObject(apiMission) {
        // Import Mission class if available
        // For now, return compatible object
        return {
            id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: apiMission.title,
            type: apiMission.type,
            location: apiMission.location,
            description: apiMission.description,
            rewardMoney: apiMission.reward_money,
            rewardExp: apiMission.reward_exp || Math.floor(apiMission.reward_money * 0.5),
            fuelCost: apiMission.fuel_cost,
            duration: apiMission.duration,
            objectives: [
                {
                    type: 'main',
                    description: apiMission.description,
                    completed: false,
                }
            ],
        };
    }
}

// Make available globally
window.MissionGeneratorScreen = MissionGeneratorScreen;

export default MissionGeneratorScreen;
