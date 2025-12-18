/**
 * Active Missions Panel Component
 * Displays all currently active missions with progress tracking
 * Integrates with /missions/active API endpoint
 */

import { gameState } from '../../core/game-state.js';
import { Toast } from '../toast.js';

class ActiveMissionsPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[ActiveMissionsPanel] Container not found: ${containerId}`);
            return;
        }

        this.apiBase = '/api/v1/missions';
        this.activeSessions = [];
        this.refreshInterval = null;
        this.autoRefreshEnabled = true;

        this.init();
    }

    /**
     * Initialize the panel
     */
    init() {
        this.render();
        this.startAutoRefresh();
    }

    /**
     * Render the active missions panel
     */
    render() {
        this.container.innerHTML = `
            <div class="active-missions-panel panel">
                <div class="panel-header">
                    <h3>🚀 Active Missions</h3>
                    <div class="panel-controls">
                        <button id="btn-refresh-missions" class="btn btn-sm btn-secondary">
                            🔄 Refresh
                        </button>
                        <button id="btn-toggle-auto-refresh" class="btn btn-sm btn-outline">
                            ${this.autoRefreshEnabled ? '⏸️ Pause Auto-Refresh' : '▶️ Resume Auto-Refresh'}
                        </button>
                    </div>
                </div>

                <div id="active-missions-list" class="active-missions-list">
                    <div class="loading-state">Loading active missions...</div>
                </div>
            </div>
        `;

        this.attachEvents();
        this.loadActiveMissions();
    }

    /**
     * Attach event listeners
     */
    attachEvents() {
        // Refresh button
        const btnRefresh = document.getElementById('btn-refresh-missions');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.loadActiveMissions());
        }

        // Toggle auto-refresh
        const btnToggleAutoRefresh = document.getElementById('btn-toggle-auto-refresh');
        if (btnToggleAutoRefresh) {
            btnToggleAutoRefresh.addEventListener('click', () => this.toggleAutoRefresh());
        }
    }

    /**
     * Load active missions from backend
     */
    async loadActiveMissions() {
        try {
            const response = await fetch(`${this.apiBase}/active`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch active missions: ${response.status}`);
            }

            const data = await response.json();
            this.activeSessions = data.sessions || [];

            this.renderMissionsList();
        } catch (error) {
            console.error('[ActiveMissionsPanel] Failed to load active missions:', error);
            this.renderError('Failed to load active missions from backend.');
        }
    }

    /**
     * Render the missions list
     */
    renderMissionsList() {
        const listContainer = document.getElementById('active-missions-list');
        if (!listContainer) return;

        // Combine backend sessions with local active missions
        const localMissions = gameState.activeMissions || [];

        if (localMissions.length === 0 && this.activeSessions.length === 0) {
            listContainer.innerHTML = '<div class="empty-state">No active missions. Accept a mission from the mission board!</div>';
            return;
        }

        listContainer.innerHTML = `
            ${localMissions.map(mission => this.renderMissionCard(mission)).join('')}
            ${this.activeSessions.length > 0 ? `
                <div class="backend-sessions-section">
                    <h4>Backend Sessions</h4>
                    ${this.activeSessions.map(session => this.renderSessionCard(session)).join('')}
                </div>
            ` : ''}
        `;

        this.attachMissionActions();
    }

    /**
     * Render a mission card (local mission)
     * @param {Object} mission - Mission object
     * @returns {string} HTML string
     */
    renderMissionCard(mission) {
        const char = gameState.getCharacter(mission.assignedCharId);
        const progress = mission.progress || 0;
        const timeRemaining = this.calculateTimeRemaining(char?.missionEndTime);

        return `
            <div class="active-mission-card" data-mission-id="${mission.id}">
                <div class="mission-card-header">
                    <h4>${mission.title || mission.type}</h4>
                    <span class="mission-status-badge ${mission.status || 'active'}">${mission.status || 'Active'}</span>
                </div>

                <div class="mission-card-body">
                    <div class="mission-info">
                        <p><strong>👤 Character:</strong> ${char?.name || mission.assignedCharId}</p>
                        <p><strong>📍 Location:</strong> ${mission.location}</p>
                        <p><strong>⏱️ Time Remaining:</strong> ${timeRemaining}</p>
                    </div>

                    <div class="mission-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <span class="progress-text">${progress}% Complete</span>
                    </div>
                </div>

                <div class="mission-card-actions">
                    <button class="btn btn-sm btn-primary btn-view-progress" data-mission-id="${mission.id}">
                        📊 View Progress
                    </button>
                    <button class="btn btn-sm btn-secondary btn-advance-phase" data-mission-id="${mission.id}">
                        ⏭️ Advance Phase
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render a backend session card
     * @param {Object} session - Session object from backend
     * @returns {string} HTML string
     */
    renderSessionCard(session) {
        return `
            <div class="backend-session-card" data-session-id="${session.session_id}">
                <div class="session-header">
                    <h5>Session: ${session.session_id.substring(0, 8)}...</h5>
                    <span class="session-phase-badge">${session.current_phase || 'Unknown'}</span>
                </div>

                <div class="session-info">
                    <p><strong>Type:</strong> ${session.mission_type || 'N/A'}</p>
                    <p><strong>Location:</strong> ${session.location || 'N/A'}</p>
                    <p><strong>Character:</strong> ${session.character_id || 'N/A'}</p>
                    ${session.progress ? `<p><strong>Progress:</strong> ${session.progress}%</p>` : ''}
                </div>

                <div class="session-actions">
                    <button class="btn btn-sm btn-outline btn-end-session" data-session-id="${session.session_id}">
                        🛑 End Session
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Calculate time remaining for a mission
     * @param {number|null} endTime - Mission end timestamp
     * @returns {string} Formatted time remaining
     */
    calculateTimeRemaining(endTime) {
        if (!endTime) return 'Unknown';

        const now = Date.now();
        const remaining = endTime - now;

        if (remaining <= 0) return 'Completed';

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        return `${minutes}m ${seconds}s`;
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        const listContainer = document.getElementById('active-missions-list');
        if (!listContainer) return;

        listContainer.innerHTML = `
            <div class="error-state">
                <p>⚠️ ${message}</p>
                <button class="btn btn-secondary" onclick="this.closest('.active-missions-panel').dispatchEvent(new Event('retry'))">
                    Retry
                </button>
            </div>
        `;
    }

    /**
     * Attach actions to mission cards
     */
    attachMissionActions() {
        // View progress
        document.querySelectorAll('.btn-view-progress').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const missionId = e.target.dataset.missionId;
                await this.viewMissionProgress(missionId);
            });
        });

        // Advance phase
        document.querySelectorAll('.btn-advance-phase').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const missionId = e.target.dataset.missionId;
                await this.advanceMissionPhase(missionId);
            });
        });

        // End session
        document.querySelectorAll('.btn-end-session').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const sessionId = e.target.dataset.sessionId;
                await this.endBackendSession(sessionId);
            });
        });
    }

    /**
     * View mission progress
     * @param {string} missionId - Mission ID
     */
    async viewMissionProgress(missionId) {
        try {
            const progress = await gameState.getMissionProgress(missionId);

            if (!progress) {
                Toast.show('No backend progress data available.', 'warning');
                return;
            }

            // Display progress in a modal or detailed view
            const message = `
                Phase: ${progress.current_phase || 'Unknown'}
                Progress: ${progress.progress || 0}%
                Status: ${progress.status || 'Active'}
            `;

            Toast.show(message, 'info');
            console.log('[ActiveMissionsPanel] Mission progress:', progress);
        } catch (error) {
            console.error('[ActiveMissionsPanel] Failed to view progress:', error);
            Toast.show('Failed to fetch mission progress.', 'error');
        }
    }

    /**
     * Advance mission to next phase
     * @param {string} missionId - Mission ID
     */
    async advanceMissionPhase(missionId) {
        try {
            const result = await gameState.advanceMissionPhase(missionId);

            if (!result) {
                Toast.show('Failed to advance mission phase.', 'error');
                return;
            }

            Toast.show(`Advanced to phase: ${result.phase || 'Next'}`, 'success');
            this.loadActiveMissions(); // Refresh list
        } catch (error) {
            console.error('[ActiveMissionsPanel] Failed to advance phase:', error);
            Toast.show('Failed to advance mission phase.', 'error');
        }
    }

    /**
     * End a backend session
     * @param {string} sessionId - Session ID
     */
    async endBackendSession(sessionId) {
        try {
            const response = await fetch(`${this.apiBase}/${sessionId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to end session: ${response.status}`);
            }

            Toast.show('Session ended successfully.', 'success');
            this.loadActiveMissions(); // Refresh list
        } catch (error) {
            console.error('[ActiveMissionsPanel] Failed to end session:', error);
            Toast.show('Failed to end session.', 'error');
        }
    }

    /**
     * Toggle auto-refresh
     */
    toggleAutoRefresh() {
        this.autoRefreshEnabled = !this.autoRefreshEnabled;

        const btn = document.getElementById('btn-toggle-auto-refresh');
        if (btn) {
            btn.textContent = this.autoRefreshEnabled ? '⏸️ Pause Auto-Refresh' : '▶️ Resume Auto-Refresh';
        }

        if (this.autoRefreshEnabled) {
            this.startAutoRefresh();
            Toast.show('Auto-refresh enabled', 'info');
        } else {
            this.stopAutoRefresh();
            Toast.show('Auto-refresh paused', 'info');
        }
    }

    /**
     * Start auto-refresh
     */
    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        this.refreshInterval = setInterval(() => {
            if (this.autoRefreshEnabled) {
                this.loadActiveMissions();
            }
        }, 10000); // Refresh every 10 seconds
    }

    /**
     * Stop auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Destroy the panel and clean up
     */
    destroy() {
        this.stopAutoRefresh();
    }
}

// Make available globally
window.ActiveMissionsPanel = ActiveMissionsPanel;

export default ActiveMissionsPanel;
