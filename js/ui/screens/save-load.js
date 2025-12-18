/**
 * Save/Load Screen for Super Wings Simulator
 * Manages multiple save slots with import/export functionality
 */

export class SaveLoadScreen {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.mode = 'save';  // 'save' or 'load'
    }

    render(mode = 'save') {
        this.mode = mode;
        const slots = window.saveManager?.getSlotsMeta() || [];
        const currentSlot = window.saveManager?.getCurrentSlot() || 0;

        this.container.innerHTML = `
            <div class="screen save-load-screen anim-fade-in">
                <header class="screen-header">
                    <button id="btn-back" class="btn btn-icon" title="Back">◀</button>
                    <h2>${mode === 'save' ? 'Save Game' : 'Load Game'}</h2>
                    <div class="mode-toggle">
                        <button class="mode-btn ${mode === 'save' ? 'active' : ''}" data-mode="save">Save</button>
                        <button class="mode-btn ${mode === 'load' ? 'active' : ''}" data-mode="load">Load</button>
                    </div>
                </header>

                <div class="save-load-content">
                    <div class="save-slots">
                        ${slots.map((slot, index) => this.renderSlotCard(slot, index, currentSlot)).join('')}
                    </div>

                    <div class="save-actions">
                        <button id="btn-import" class="btn btn-secondary">
                            📥 Import Save
                        </button>
                        <input type="file" id="import-file" accept=".json" style="display: none;">
                    </div>
                </div>
            </div>
        `;

        this.attachEvents();
        this.addStyles();
    }

    renderSlotCard(slot, index, currentSlot) {
        const isEmpty = slot.isEmpty;
        const isCurrentSlot = index === currentSlot;

        if (isEmpty) {
            return `
                <div class="save-slot empty ${this.mode === 'save' ? 'clickable' : ''}" data-slot="${index}">
                    <div class="slot-header">
                        <span class="slot-number">Slot ${index + 1}</span>
                        <span class="slot-status">Empty</span>
                    </div>
                    <div class="slot-empty-content">
                        <span class="empty-icon">📁</span>
                        <span class="empty-text">${this.mode === 'save' ? 'Click to save here' : 'No save data'}</span>
                    </div>
                </div>
            `;
        }

        const preview = slot.preview || {};
        const timestamp = window.saveManager?.formatTimestamp(slot.timestamp) || 'Unknown';
        const playTime = window.saveManager?.formatPlayTime(slot.playTime || 0) || '0m';

        return `
            <div class="save-slot filled ${isCurrentSlot ? 'current' : ''}" data-slot="${index}">
                <div class="slot-header">
                    <span class="slot-number">Slot ${index + 1}</span>
                    ${isCurrentSlot ? '<span class="current-badge">Current</span>' : ''}
                    <span class="slot-timestamp">${timestamp}</span>
                </div>
                <div class="slot-content">
                    <div class="slot-preview">
                        <div class="preview-stat">
                            <span class="stat-icon">💰</span>
                            <span class="stat-value">${preview.money?.toLocaleString() || 0}</span>
                        </div>
                        <div class="preview-stat">
                            <span class="stat-icon">✈</span>
                            <span class="stat-value">${preview.missionsCompleted || 0} Missions</span>
                        </div>
                        <div class="preview-stat">
                            <span class="stat-icon">👥</span>
                            <span class="stat-value">${preview.charactersUnlocked || 0} Characters</span>
                        </div>
                        <div class="preview-stat">
                            <span class="stat-icon">⏱</span>
                            <span class="stat-value">${playTime}</span>
                        </div>
                    </div>
                    <div class="slot-meta">
                        <span class="meta-level">Highest Level: Lv.${preview.highestLevel || 1}</span>
                    </div>
                </div>
                <div class="slot-actions">
                    ${this.mode === 'save' ? `
                        <button class="slot-btn save-btn" data-action="save" data-slot="${index}">
                            💾 Save
                        </button>
                    ` : `
                        <button class="slot-btn load-btn" data-action="load" data-slot="${index}">
                            📂 Load
                        </button>
                    `}
                    <button class="slot-btn export-btn" data-action="export" data-slot="${index}" title="Export">
                        📤
                    </button>
                    <button class="slot-btn delete-btn" data-action="delete" data-slot="${index}" title="Delete">
                        🗑
                    </button>
                </div>
            </div>
        `;
    }

    attachEvents() {
        // Back button
        document.getElementById('btn-back')?.addEventListener('click', () => {
            window.game?.renderMainMenu();
        });

        // Mode toggle
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.render(mode);
                if (window.audioManager) {
                    window.audioManager.playSound('button');
                }
            });
        });

        // Slot actions
        document.querySelectorAll('.slot-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const slotIndex = parseInt(btn.dataset.slot);

                switch (action) {
                    case 'save':
                        await this.handleSave(slotIndex);
                        break;
                    case 'load':
                        await this.handleLoad(slotIndex);
                        break;
                    case 'export':
                        this.handleExport(slotIndex);
                        break;
                    case 'delete':
                        this.handleDelete(slotIndex);
                        break;
                }
            });
        });

        // Empty slot click (save mode)
        document.querySelectorAll('.save-slot.empty.clickable').forEach(slot => {
            slot.addEventListener('click', async () => {
                const slotIndex = parseInt(slot.dataset.slot);
                await this.handleSave(slotIndex);
            });
        });

        // Import button
        document.getElementById('btn-import')?.addEventListener('click', () => {
            document.getElementById('import-file')?.click();
        });

        // Import file change
        document.getElementById('import-file')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.handleImport(file);
            }
            e.target.value = '';
        });
    }

    async handleSave(slotIndex) {
        if (!window.saveManager || !window.gameState) {
            this.showMessage('Cannot save', 'error');
            return;
        }

        // Get current game data
        const gameData = {
            gameState: window.gameState.getState(),
            statistics: window.statisticsTracker?.serialize() || {},
            achievements: window.achievementSystem?.serialize() || {},
            settings: {
                theme: window.themeManager?.getTheme() || 'light'
            }
        };

        const success = window.saveManager.saveToSlot(slotIndex, gameData);

        if (success) {
            this.showMessage('Save successful!', 'success');
            if (window.audioManager) {
                window.audioManager.playSound('success');
            }
            // Refresh display
            setTimeout(() => this.render(this.mode), 500);
        } else {
            this.showMessage('Save failed', 'error');
        }
    }

    async handleLoad(slotIndex) {
        if (!window.saveManager) {
            this.showMessage('Cannot load', 'error');
            return;
        }

        const data = window.saveManager.loadFromSlot(slotIndex);

        if (!data) {
            this.showMessage('Load failed', 'error');
            return;
        }

        // Apply loaded data
        if (data.gameState && window.gameState) {
            window.gameState.loadState(data.gameState);
        }

        if (data.statistics && window.statisticsTracker) {
            window.statisticsTracker.deserialize(data.statistics);
        }

        if (data.achievements && window.achievementSystem) {
            window.achievementSystem.deserialize(data.achievements);
        }

        if (data.settings?.theme && window.themeManager) {
            window.themeManager.setTheme(data.settings.theme);
        }

        this.showMessage('Load successful!', 'success');
        if (window.audioManager) {
            window.audioManager.playSound('success');
        }

        // Navigate to hangar
        setTimeout(() => {
            window.game?.renderHangar();
        }, 800);
    }

    handleExport(slotIndex) {
        if (!window.saveManager) {
            this.showMessage('Cannot export', 'error');
            return;
        }

        const success = window.saveManager.exportSave(slotIndex);

        if (success) {
            this.showMessage('Export successful!', 'success');
        } else {
            this.showMessage('Export failed', 'error');
        }
    }

    handleDelete(slotIndex) {
        if (!window.saveManager) return;

        // Confirm deletion
        const confirmed = confirm(`Delete Slot ${slotIndex + 1}? This cannot be undone.`);

        if (!confirmed) return;

        const success = window.saveManager.deleteSlot(slotIndex);

        if (success) {
            this.showMessage('Deleted', 'success');
            this.render(this.mode);
        } else {
            this.showMessage('Delete failed', 'error');
        }
    }

    async handleImport(file) {
        if (!window.saveManager) {
            this.showMessage('Cannot import', 'error');
            return;
        }

        // Find first empty slot, or use slot 0
        const slots = window.saveManager.getSlotsMeta();
        let targetSlot = slots.findIndex(s => s.isEmpty);
        if (targetSlot === -1) {
            const overwrite = confirm('All slots have data. Overwrite Slot 1?');
            if (!overwrite) return;
            targetSlot = 0;
        }

        try {
            await window.saveManager.importSave(file, targetSlot);
            this.showMessage(`Imported to Slot ${targetSlot + 1}!`, 'success');
            this.render(this.mode);
        } catch (error) {
            this.showMessage('Import failed: ' + error.message, 'error');
        }
    }

    showMessage(text, type = 'info') {
        // Create toast message
        const toast = document.createElement('div');
        toast.className = `save-toast ${type}`;
        toast.textContent = text;
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 50);

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    addStyles() {
        if (document.getElementById('save-load-screen-styles')) return;

        const style = document.createElement('style');
        style.id = 'save-load-screen-styles';
        style.textContent = `
            .save-load-screen {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: var(--bg-main);
            }

            .save-load-screen .screen-header {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px 24px;
                background: var(--bg-panel);
                border-bottom: 1px solid var(--border-color);
            }

            .save-load-screen .screen-header h2 {
                flex: 1;
                margin: 0;
                font-size: 24px;
            }

            .mode-toggle {
                display: flex;
                background: var(--bg-secondary);
                border-radius: var(--radius-full);
                padding: 4px;
            }

            .mode-btn {
                padding: 8px 20px;
                border: none;
                background: transparent;
                color: var(--text-secondary);
                border-radius: var(--radius-full);
                cursor: pointer;
                font-size: 14px;
                transition: all var(--transition-fast);
            }

            .mode-btn.active {
                background: var(--color-primary);
                color: white;
            }

            .save-load-content {
                flex: 1;
                overflow-y: auto;
                padding: 24px;
            }

            .save-slots {
                display: flex;
                flex-direction: column;
                gap: 16px;
                max-width: 600px;
                margin: 0 auto;
            }

            .save-slot {
                background: var(--bg-card);
                border: 2px solid var(--border-color);
                border-radius: var(--radius-lg);
                overflow: hidden;
                transition: all var(--transition-fast);
            }

            .save-slot.clickable {
                cursor: pointer;
            }

            .save-slot.clickable:hover {
                border-color: var(--color-primary);
                transform: translateY(-2px);
                box-shadow: var(--shadow-md);
            }

            .save-slot.current {
                border-color: var(--color-primary);
            }

            .slot-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                background: var(--bg-secondary);
                border-bottom: 1px solid var(--border-color);
            }

            .slot-number {
                font-weight: 600;
                font-size: 16px;
            }

            .slot-status {
                color: var(--text-muted);
                font-size: 13px;
            }

            .current-badge {
                background: var(--color-primary);
                color: white;
                padding: 2px 8px;
                border-radius: var(--radius-full);
                font-size: 11px;
                text-transform: uppercase;
            }

            .slot-timestamp {
                margin-left: auto;
                color: var(--text-secondary);
                font-size: 13px;
            }

            .slot-empty-content {
                padding: 40px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }

            .empty-icon {
                font-size: 48px;
                opacity: 0.5;
            }

            .empty-text {
                color: var(--text-muted);
                font-size: 14px;
            }

            .slot-content {
                padding: 16px;
            }

            .slot-preview {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin-bottom: 12px;
            }

            .preview-stat {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .stat-icon {
                font-size: 20px;
            }

            .stat-value {
                font-size: 14px;
                color: var(--text-main);
            }

            .slot-meta {
                font-size: 13px;
                color: var(--text-secondary);
            }

            .slot-actions {
                display: flex;
                gap: 8px;
                padding: 12px 16px;
                background: var(--bg-secondary);
                border-top: 1px solid var(--border-color);
            }

            .slot-btn {
                padding: 8px 16px;
                border: 1px solid var(--border-color);
                background: var(--bg-card);
                border-radius: var(--radius-sm);
                cursor: pointer;
                font-size: 14px;
                transition: all var(--transition-fast);
            }

            .slot-btn:hover {
                background: var(--bg-main);
            }

            .slot-btn.save-btn,
            .slot-btn.load-btn {
                flex: 1;
                background: var(--color-primary);
                border-color: var(--color-primary);
                color: white;
            }

            .slot-btn.save-btn:hover,
            .slot-btn.load-btn:hover {
                filter: brightness(1.1);
            }

            .slot-btn.delete-btn:hover {
                background: var(--color-danger);
                border-color: var(--color-danger);
                color: white;
            }

            .save-actions {
                display: flex;
                justify-content: center;
                padding: 24px;
            }

            /* Toast messages */
            .save-toast {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                padding: 12px 24px;
                background: var(--bg-card);
                border-radius: var(--radius-md);
                box-shadow: var(--shadow-lg);
                font-size: 14px;
                z-index: 10000;
                opacity: 0;
                transition: all 0.3s ease;
            }

            .save-toast.show {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }

            .save-toast.success {
                background: var(--color-success);
                color: white;
            }

            .save-toast.error {
                background: var(--color-danger);
                color: white;
            }

            @media (max-width: 480px) {
                .slot-preview {
                    grid-template-columns: 1fr;
                }

                .slot-actions {
                    flex-wrap: wrap;
                }

                .slot-btn.save-btn,
                .slot-btn.load-btn {
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
