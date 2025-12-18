/**
 * Asset Manager Screen
 * Manages game asset generation and validation
 * Integrates with /assets/* API endpoints
 */

import { Toast } from '../toast.js';

export class AssetManagerScreen {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.apiBase = '/api/v1/assets';
        this.progressInterval = null;
        this.isGenerating = false;

        // Cached data
        this.characters = [];
        this.locations = [];
        this.qualityLevels = [];
        this.missionIcons = [];
        this.skyTypes = [];
    }

    /**
     * Initialize and render the asset manager
     */
    async init() {
        await this.loadMetadata();
        this.render();
        this.checkStatus();
    }

    /**
     * Load asset metadata (characters, locations, etc.)
     */
    async loadMetadata() {
        try {
            const [characters, locations, qualityLevels, missionIcons, skyTypes] = await Promise.all([
                this.fetchCharacters(),
                this.fetchLocations(),
                this.fetchQualityLevels(),
                this.fetchMissionIcons(),
                this.fetchSkyTypes(),
            ]);

            this.characters = characters;
            this.locations = locations;
            this.qualityLevels = qualityLevels;
            this.missionIcons = missionIcons;
            this.skyTypes = skyTypes;
        } catch (error) {
            console.error('[AssetManager] Failed to load metadata:', error);
        }
    }

    /**
     * Render the asset manager UI
     */
    render() {
        this.container.innerHTML = `
            <div class="screen asset-manager-screen anim-slide-up">
                <header class="screen-header">
                    <h2><span class="icon">🎨</span> ASSET MANAGER</h2>
                    <p class="subtitle">Generate and manage game assets</p>
                </header>

                <div class="asset-status-panel panel">
                    <h3>Service Status</h3>
                    <div id="status-display" class="status-display">
                        <div class="loading-state">Checking status...</div>
                    </div>
                </div>

                <div class="asset-generation-panel panel">
                    <h3>Generate Assets</h3>

                    <div class="generation-tabs">
                        <button class="tab-btn active" data-tab="quick">⚡ Quick Generate</button>
                        <button class="tab-btn" data-tab="full">🎨 Full Generate</button>
                        <button class="tab-btn" data-tab="custom">⚙️ Custom Generate</button>
                    </div>

                    <div id="tab-quick" class="tab-content active">
                        ${this.renderQuickGenerateForm()}
                    </div>

                    <div id="tab-full" class="tab-content">
                        ${this.renderFullGenerateForm()}
                    </div>

                    <div id="tab-custom" class="tab-content">
                        ${this.renderCustomGenerateForm()}
                    </div>
                </div>

                <div class="asset-progress-panel panel">
                    <h3>Generation Progress</h3>
                    <div id="progress-display" class="progress-display">
                        <div class="empty-state">No active generation</div>
                    </div>
                </div>

                <div class="asset-validation-panel panel">
                    <h3>Validate Assets</h3>
                    <div class="validation-form">
                        <input
                            type="text"
                            id="validate-path"
                            placeholder="Path to manifest.json"
                            class="text-input"
                        />
                        <button id="btn-validate" class="btn btn-secondary">
                            ✓ Validate Package
                        </button>
                    </div>
                    <div id="validation-results" class="validation-results"></div>
                </div>

                <div class="action-bar">
                    <button id="btn-back" class="btn btn-secondary">◀ Back</button>
                    <button id="btn-refresh-status" class="btn btn-outline">🔄 Refresh Status</button>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    /**
     * Render quick generate form
     */
    renderQuickGenerateForm() {
        return `
            <form id="form-quick-generate" class="generation-form">
                <div class="form-group">
                    <label for="quick-character">Character:</label>
                    <select id="quick-character" required>
                        <option value="">Select a character</option>
                        ${this.characters.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label for="quick-mission-type">Mission Type:</label>
                    <input
                        type="text"
                        id="quick-mission-type"
                        placeholder="e.g., delivery, rescue"
                        class="text-input"
                        required
                    />
                </div>

                <button type="submit" class="btn btn-primary">
                    ⚡ Generate Quick Pack
                </button>
            </form>
        `;
    }

    /**
     * Render full generate form
     */
    renderFullGenerateForm() {
        return `
            <form id="form-full-generate" class="generation-form">
                <div class="form-group">
                    <label>Characters (Select Multiple):</label>
                    <div class="checkbox-group">
                        ${this.characters.slice(0, 8).map(c => `
                            <label class="checkbox-label">
                                <input type="checkbox" name="characters" value="${c}" />
                                ${c}
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="form-group">
                    <label>Locations (Select Multiple):</label>
                    <div class="checkbox-group">
                        ${this.locations.slice(0, 6).map(l => `
                            <label class="checkbox-label">
                                <input type="checkbox" name="locations" value="${l}" />
                                ${l}
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="form-group">
                    <label for="full-quality">Quality Level:</label>
                    <select id="full-quality">
                        ${Object.entries(this.qualityLevels).map(([key, desc]) =>
                            `<option value="${key}">${key} - ${desc}</option>`
                        ).join('')}
                    </select>
                </div>

                <button type="submit" class="btn btn-primary">
                    🎨 Generate Full Pack
                </button>
            </form>
        `;
    }

    /**
     * Render custom generate form
     */
    renderCustomGenerateForm() {
        return `
            <form id="form-custom-generate" class="generation-form">
                <div class="form-group">
                    <label for="custom-mission-id">Mission ID:</label>
                    <input
                        type="text"
                        id="custom-mission-id"
                        placeholder="mission_001"
                        class="text-input"
                    />
                </div>

                <div class="form-group">
                    <label>Asset Options:</label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="custom-images" checked />
                        Include Images
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="custom-audio" checked />
                        Include Audio
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="custom-manifest" checked />
                        Generate Manifest
                    </label>
                </div>

                <div class="form-group">
                    <label for="custom-quality">Quality:</label>
                    <select id="custom-quality">
                        ${Object.keys(this.qualityLevels).map(key =>
                            `<option value="${key}">${key}</option>`
                        ).join('')}
                    </select>
                </div>

                <button type="submit" class="btn btn-primary">
                    ⚙️ Generate Custom Pack
                </button>
            </form>
        `;
    }

    /**
     * Attach event listeners
     */
    attachEvents() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Quick generate form
        const formQuick = document.getElementById('form-quick-generate');
        if (formQuick) {
            formQuick.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleQuickGenerate();
            });
        }

        // Full generate form
        const formFull = document.getElementById('form-full-generate');
        if (formFull) {
            formFull.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFullGenerate();
            });
        }

        // Custom generate form
        const formCustom = document.getElementById('form-custom-generate');
        if (formCustom) {
            formCustom.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCustomGenerate();
            });
        }

        // Validate button
        const btnValidate = document.getElementById('btn-validate');
        if (btnValidate) {
            btnValidate.addEventListener('click', () => this.handleValidate());
        }

        // Refresh status button
        const btnRefreshStatus = document.getElementById('btn-refresh-status');
        if (btnRefreshStatus) {
            btnRefreshStatus.addEventListener('click', () => this.checkStatus());
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
     * Switch between tabs
     * @param {string} tabName - Tab name to switch to
     */
    switchTab(tabName) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // Remove active from all buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected tab
        const tab = document.getElementById(`tab-${tabName}`);
        if (tab) {
            tab.classList.add('active');
        }

        // Activate button
        const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (btn) {
            btn.classList.add('active');
        }
    }

    // ========== API Methods ==========

    /**
     * Check asset packager status
     */
    async checkStatus() {
        const statusDisplay = document.getElementById('status-display');
        if (!statusDisplay) return;

        try {
            const response = await fetch(`${this.apiBase}/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Status check failed: ${response.status}`);
            }

            const data = await response.json();
            this.renderStatus(data);
        } catch (error) {
            console.error('[AssetManager] Status check failed:', error);
            statusDisplay.innerHTML = `
                <div class="error-state">⚠️ Failed to check status</div>
            `;
        }
    }

    /**
     * Render status display
     * @param {Object} status - Status data
     */
    renderStatus(status) {
        const statusDisplay = document.getElementById('status-display');
        if (!statusDisplay) return;

        statusDisplay.innerHTML = `
            <div class="status-info">
                <p><strong>Status:</strong> <span class="status-badge ${status.ready ? 'success' : 'error'}">${status.ready ? 'Ready' : 'Not Ready'}</span></p>
                ${status.comfyui_status ? `<p><strong>ComfyUI:</strong> ${status.comfyui_status}</p>` : ''}
                ${status.message ? `<p>${status.message}</p>` : ''}
            </div>
        `;
    }

    /**
     * Fetch available characters
     * @returns {Promise<Array<string>>} Character list
     */
    async fetchCharacters() {
        try {
            const response = await fetch(`${this.apiBase}/characters`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) throw new Error('Failed to fetch characters');

            const data = await response.json();
            return data.characters || [];
        } catch (error) {
            console.error('[AssetManager] Failed to fetch characters:', error);
            return ['jett', 'jerome', 'donnie', 'chase', 'flip', 'todd', 'paul', 'bello'];
        }
    }

    /**
     * Fetch available locations
     * @returns {Promise<Array<string>>} Location list
     */
    async fetchLocations() {
        try {
            const response = await fetch(`${this.apiBase}/locations`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) throw new Error('Failed to fetch locations');

            const data = await response.json();
            return data.locations || [];
        } catch (error) {
            console.error('[AssetManager] Failed to fetch locations:', error);
            return ['paris', 'newyork', 'london', 'tokyo', 'sydney'];
        }
    }

    /**
     * Fetch quality levels
     * @returns {Promise<Object>} Quality levels object
     */
    async fetchQualityLevels() {
        try {
            const response = await fetch(`${this.apiBase}/quality-levels`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) throw new Error('Failed to fetch quality levels');

            const data = await response.json();
            return data.quality_levels || {};
        } catch (error) {
            console.error('[AssetManager] Failed to fetch quality levels:', error);
            return { standard: 'Standard quality', high: 'High quality', ultra: 'Ultra quality' };
        }
    }

    /**
     * Fetch mission icons
     * @returns {Promise<Array<string>>} Mission icon list
     */
    async fetchMissionIcons() {
        try {
            const response = await fetch(`${this.apiBase}/mission-icons`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) throw new Error('Failed to fetch mission icons');

            const data = await response.json();
            return data.icons || [];
        } catch (error) {
            console.error('[AssetManager] Failed to fetch mission icons:', error);
            return [];
        }
    }

    /**
     * Fetch sky types
     * @returns {Promise<Array<string>>} Sky type list
     */
    async fetchSkyTypes() {
        try {
            const response = await fetch(`${this.apiBase}/sky-types`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) throw new Error('Failed to fetch sky types');

            const data = await response.json();
            return data.sky_types || [];
        } catch (error) {
            console.error('[AssetManager] Failed to fetch sky types:', error);
            return ['clear', 'cloudy', 'sunset', 'night'];
        }
    }

    /**
     * Handle quick generate
     */
    async handleQuickGenerate() {
        const character = document.getElementById('quick-character').value;
        const missionType = document.getElementById('quick-mission-type').value;

        if (!character || !missionType) {
            Toast.show('Please fill all fields', 'error');
            return;
        }

        this.isGenerating = true;

        try {
            const payload = {
                character_id: character,
                mission_type: missionType,
            };

            const response = await fetch(`${this.apiBase}/generate/quick`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Quick generate failed: ${response.status}`);
            }

            const data = await response.json();
            Toast.show(`Quick pack generated! Package ID: ${data.package_id || 'N/A'}`, 'success');
            this.startProgressMonitoring();
        } catch (error) {
            console.error('[AssetManager] Quick generate failed:', error);
            Toast.show('Quick generation failed', 'error');
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Handle full generate
     */
    async handleFullGenerate() {
        const selectedCharacters = Array.from(
            document.querySelectorAll('input[name="characters"]:checked')
        ).map(cb => cb.value);

        const selectedLocations = Array.from(
            document.querySelectorAll('input[name="locations"]:checked')
        ).map(cb => cb.value);

        const quality = document.getElementById('full-quality').value;

        if (selectedCharacters.length === 0) {
            Toast.show('Please select at least one character', 'error');
            return;
        }

        this.isGenerating = true;

        try {
            const payload = {
                characters: selectedCharacters,
                locations: selectedLocations,
                quality: quality || 'standard',
            };

            const response = await fetch(`${this.apiBase}/generate/full`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Full generate failed: ${response.status}`);
            }

            const data = await response.json();
            Toast.show(`Full pack generation started! Package ID: ${data.package_id || 'N/A'}`, 'success');
            this.startProgressMonitoring();
        } catch (error) {
            console.error('[AssetManager] Full generate failed:', error);
            Toast.show('Full generation failed', 'error');
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Handle custom generate
     */
    async handleCustomGenerate() {
        const missionId = document.getElementById('custom-mission-id').value || 'custom_mission';
        const includeImages = document.getElementById('custom-images').checked;
        const includeAudio = document.getElementById('custom-audio').checked;
        const generateManifest = document.getElementById('custom-manifest').checked;
        const quality = document.getElementById('custom-quality').value;

        this.isGenerating = true;

        try {
            const payload = {
                mission_id: missionId,
                quality: quality || 'standard',
                include_images: includeImages,
                include_audio: includeAudio,
                generate_manifest: generateManifest,
            };

            const response = await fetch(`${this.apiBase}/generate/custom`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Custom generate failed: ${response.status}`);
            }

            const data = await response.json();
            Toast.show(`Custom pack generated! Package ID: ${data.package_id || 'N/A'}`, 'success');
            this.startProgressMonitoring();
        } catch (error) {
            console.error('[AssetManager] Custom generate failed:', error);
            Toast.show('Custom generation failed', 'error');
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Handle package validation
     */
    async handleValidate() {
        const path = document.getElementById('validate-path').value;

        if (!path) {
            Toast.show('Please enter a manifest path', 'error');
            return;
        }

        try {
            const payload = {
                manifest_path: path,
            };

            const response = await fetch(`${this.apiBase}/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Validation failed: ${response.status}`);
            }

            const data = await response.json();
            this.renderValidationResults(data);
        } catch (error) {
            console.error('[AssetManager] Validation failed:', error);
            Toast.show('Validation failed', 'error');
        }
    }

    /**
     * Render validation results
     * @param {Object} results - Validation results
     */
    renderValidationResults(results) {
        const resultsContainer = document.getElementById('validation-results');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <div class="validation-result-card">
                <h4>Validation Results</h4>
                <p><strong>Valid:</strong> ${results.valid ? '✓ Yes' : '✗ No'}</p>
                ${results.missing_files?.length > 0 ? `
                    <p><strong>Missing Files:</strong></p>
                    <ul>
                        ${results.missing_files.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                ` : ''}
                ${results.message ? `<p>${results.message}</p>` : ''}
            </div>
        `;
    }

    /**
     * Start monitoring generation progress
     */
    startProgressMonitoring() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }

        this.progressInterval = setInterval(async () => {
            await this.fetchProgress();
        }, 2000); // Poll every 2 seconds

        // Stop after 5 minutes
        setTimeout(() => {
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
        }, 300000);
    }

    /**
     * Fetch generation progress
     */
    async fetchProgress() {
        try {
            const response = await fetch(`${this.apiBase}/progress`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Progress check failed: ${response.status}`);
            }

            const data = await response.json();
            this.renderProgress(data);

            // Stop polling if completed
            if (data.status === 'completed' || data.status === 'failed') {
                if (this.progressInterval) {
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;
                }
            }
        } catch (error) {
            console.error('[AssetManager] Progress check failed:', error);
        }
    }

    /**
     * Render progress display
     * @param {Object} progress - Progress data
     */
    renderProgress(progress) {
        const progressDisplay = document.getElementById('progress-display');
        if (!progressDisplay) return;

        if (!progress || !progress.status || progress.status === 'idle') {
            progressDisplay.innerHTML = '<div class="empty-state">No active generation</div>';
            return;
        }

        progressDisplay.innerHTML = `
            <div class="progress-info">
                <p><strong>Status:</strong> ${progress.status}</p>
                ${progress.progress !== undefined ? `
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress.progress}%"></div>
                    </div>
                    <span class="progress-text">${progress.progress}%</span>
                ` : ''}
                ${progress.current_task ? `<p><strong>Current Task:</strong> ${progress.current_task}</p>` : ''}
                ${progress.message ? `<p>${progress.message}</p>` : ''}
            </div>
        `;
    }

    /**
     * Cleanup when screen is destroyed
     */
    destroy() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }
}

// Make available globally
window.AssetManagerScreen = AssetManagerScreen;

export default AssetManagerScreen;
