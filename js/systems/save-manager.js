/**
 * Save Manager for Super Wings Simulator
 * Manages multiple save slots with import/export functionality
 */

class SaveManager {
    constructor() {
        this.maxSlots = 10;  // Increased from 3 to 10 slots
        this.storagePrefix = 'sw_save_slot_';
        this.metaKey = 'sw_save_meta';
        this.currentSlot = 0;
        this.version = 2;
    }

    /**
     * Initialize save manager
     */
    init() {
        // Migrate from V1 if needed
        this.migrateFromV1();

        // Load current slot preference
        const meta = this.getMeta();
        this.currentSlot = meta.lastUsedSlot || 0;

        console.log('[SaveManager] Initialized, current slot:', this.currentSlot);
    }

    /**
     * Migrate from V1 single-slot save
     */
    migrateFromV1() {
        const v1Key = 'super_wings_save_v1';
        const v1Data = localStorage.getItem(v1Key);

        if (v1Data && !localStorage.getItem(this.storagePrefix + '0')) {
            try {
                const parsed = JSON.parse(v1Data);
                console.log('[SaveManager] Migrating V1 save to slot 0');

                // Convert to V2 format
                const v2Data = {
                    version: this.version,
                    slot: 0,
                    timestamp: parsed.timestamp || Date.now(),
                    playTime: 0,
                    preview: this.createPreview(parsed),
                    gameState: parsed,
                    statistics: {},
                    achievements: { unlocked: [], progress: {} },
                    settings: {
                        theme: 'light',
                        bgmVolume: 0.3,
                        sfxVolume: 0.5
                    }
                };

                // Save to slot 0
                localStorage.setItem(this.storagePrefix + '0', JSON.stringify(v2Data));

                // Update meta
                this.setMeta({ lastUsedSlot: 0, migratedFromV1: true });

                console.log('[SaveManager] V1 migration complete');
            } catch (e) {
                console.error('[SaveManager] V1 migration failed:', e);
            }
        }
    }

    /**
     * Get save metadata
     */
    getMeta() {
        try {
            const meta = localStorage.getItem(this.metaKey);
            return meta ? JSON.parse(meta) : {};
        } catch (e) {
            return {};
        }
    }

    /**
     * Set save metadata
     */
    setMeta(data) {
        try {
            const current = this.getMeta();
            localStorage.setItem(this.metaKey, JSON.stringify({ ...current, ...data }));
        } catch (e) {
            console.error('[SaveManager] Failed to set meta:', e);
        }
    }

    /**
     * Get information about all save slots
     */
    getSlotsMeta() {
        const slots = [];

        for (let i = 0; i < this.maxSlots; i++) {
            const data = this.getSlotData(i);

            if (data) {
                slots.push({
                    index: i,
                    isEmpty: false,
                    timestamp: data.timestamp,
                    playTime: data.playTime || 0,
                    preview: data.preview || {},
                    version: data.version || 1
                });
            } else {
                slots.push({
                    index: i,
                    isEmpty: true,
                    timestamp: null,
                    playTime: 0,
                    preview: {},
                    version: this.version
                });
            }
        }

        return slots;
    }

    /**
     * Get raw slot data
     */
    getSlotData(slotIndex) {
        try {
            const data = localStorage.getItem(this.storagePrefix + slotIndex);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('[SaveManager] Failed to read slot:', slotIndex, e);
            return null;
        }
    }

    /**
     * Save game to a specific slot
     */
    saveToSlot(slotIndex, gameData) {
        if (slotIndex < 0 || slotIndex >= this.maxSlots) {
            throw new Error('Invalid slot index');
        }

        const saveData = {
            version: this.version,
            slot: slotIndex,
            timestamp: Date.now(),
            playTime: gameData.playTime || (window.statisticsTracker?.getStat('totalPlayTime') || 0),
            preview: this.createPreview(gameData.gameState || gameData),
            gameState: gameData.gameState || gameData,
            statistics: gameData.statistics || (window.statisticsTracker?.serialize() || {}),
            achievements: gameData.achievements || {
                unlocked: [],
                progress: {}
            },
            settings: gameData.settings || {
                theme: window.themeManager?.getTheme() || 'light',
                bgmVolume: 0.3,
                sfxVolume: 0.5
            }
        };

        try {
            localStorage.setItem(this.storagePrefix + slotIndex, JSON.stringify(saveData));
            this.currentSlot = slotIndex;
            this.setMeta({ lastUsedSlot: slotIndex });

            console.log('[SaveManager] Saved to slot:', slotIndex);

            // Emit event
            if (window.eventBus) {
                window.eventBus.emit('SAVE_SLOT_UPDATED', { slotIndex });
            }

            return true;
        } catch (e) {
            console.error('[SaveManager] Failed to save:', e);
            return false;
        }
    }

    /**
     * Load game from a specific slot
     */
    loadFromSlot(slotIndex) {
        if (slotIndex < 0 || slotIndex >= this.maxSlots) {
            throw new Error('Invalid slot index');
        }

        const data = this.getSlotData(slotIndex);

        if (!data) {
            console.warn('[SaveManager] Slot is empty:', slotIndex);
            return null;
        }

        this.currentSlot = slotIndex;
        this.setMeta({ lastUsedSlot: slotIndex });

        console.log('[SaveManager] Loaded from slot:', slotIndex);

        return data;
    }

    /**
     * Delete a save slot
     */
    deleteSlot(slotIndex) {
        if (slotIndex < 0 || slotIndex >= this.maxSlots) {
            throw new Error('Invalid slot index');
        }

        try {
            localStorage.removeItem(this.storagePrefix + slotIndex);
            console.log('[SaveManager] Deleted slot:', slotIndex);

            // Emit event
            if (window.eventBus) {
                window.eventBus.emit('SAVE_SLOT_UPDATED', { slotIndex, deleted: true });
            }

            return true;
        } catch (e) {
            console.error('[SaveManager] Failed to delete:', e);
            return false;
        }
    }

    /**
     * Clear all save slots and metadata
     */
    clearAllSaves() {
        try {
            // Delete all save slots
            for (let i = 0; i < this.maxSlots; i++) {
                localStorage.removeItem(this.storagePrefix + i);
            }

            // Delete metadata
            localStorage.removeItem(this.metaKey);

            // Clear IndexedDB if available
            if (window.indexedDB) {
                const deleteRequest = indexedDB.deleteDatabase('super_wings_db');
                deleteRequest.onsuccess = () => {
                    console.log('[SaveManager] IndexedDB cleared');
                };
            }

            console.log('[SaveManager] All saves cleared!');

            // Emit event
            if (window.eventBus) {
                window.eventBus.emit('ALL_SAVES_CLEARED');
            }

            // Reset current slot
            this.currentSlot = 0;

            return true;
        } catch (e) {
            console.error('[SaveManager] Failed to clear all saves:', e);
            return false;
        }
    }

    /**
     * Create preview data for save slot display
     */
    createPreview(gameState) {
        return {
            money: gameState?.resources?.money || 0,
            fuel: gameState?.resources?.fuel || 0,
            missionsCompleted: window.statisticsTracker?.getStat('missionsCompleted') || 0,
            charactersUnlocked: Object.keys(gameState?.characters || {}).length,
            lastLocation: 'World Airport',
            highestLevel: this.getHighestCharacterLevel(gameState?.characters)
        };
    }

    /**
     * Get highest character level from game state
     */
    getHighestCharacterLevel(characters) {
        if (!characters) return 1;

        let highest = 1;
        for (const char of Object.values(characters)) {
            if (char.level > highest) {
                highest = char.level;
            }
        }
        return highest;
    }

    /**
     * Export save as JSON file download
     */
    exportSave(slotIndex) {
        const data = this.getSlotData(slotIndex);

        if (!data) {
            console.warn('[SaveManager] Cannot export empty slot');
            return false;
        }

        const exportData = {
            ...data,
            exportedAt: new Date().toISOString(),
            game: 'Super Wings Simulator'
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `super-wings-save-slot${slotIndex + 1}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('[SaveManager] Exported slot:', slotIndex);
        return true;
    }

    /**
     * Import save from JSON file
     */
    async importSave(file, slotIndex) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    // Validate save data
                    if (!this.validateSave(data)) {
                        reject(new Error('Invalid save file'));
                        return;
                    }

                    // Update slot index
                    data.slot = slotIndex;
                    data.timestamp = Date.now();

                    // Save to slot
                    localStorage.setItem(this.storagePrefix + slotIndex, JSON.stringify(data));

                    console.log('[SaveManager] Imported to slot:', slotIndex);
                    resolve(data);
                } catch (err) {
                    reject(new Error('Failed to parse save file'));
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsText(file);
        });
    }

    /**
     * Validate save data structure
     */
    validateSave(data) {
        // Basic structure validation
        if (!data || typeof data !== 'object') return false;
        if (!data.gameState) return false;

        // Check for essential game state properties
        const gs = data.gameState;
        if (!gs.resources || typeof gs.resources.money === 'undefined') return false;
        if (!gs.characters) return false;

        return true;
    }

    /**
     * Auto-save to current slot
     */
    autoSave(gameData) {
        return this.saveToSlot(this.currentSlot, gameData);
    }

    /**
     * Get current slot index
     */
    getCurrentSlot() {
        return this.currentSlot;
    }

    /**
     * Set current slot
     */
    setCurrentSlot(slotIndex) {
        if (slotIndex >= 0 && slotIndex < this.maxSlots) {
            this.currentSlot = slotIndex;
            this.setMeta({ lastUsedSlot: slotIndex });
        }
    }

    /**
     * Check if any saves exist
     */
    hasSaves() {
        for (let i = 0; i < this.maxSlots; i++) {
            if (localStorage.getItem(this.storagePrefix + i)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Format time for display
     */
    formatPlayTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Format timestamp for display
     */
    formatTimestamp(timestamp) {
        if (!timestamp) return 'Never';

        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    }
}

// Create singleton instance
const saveManager = new SaveManager();

// Make available globally
window.saveManager = saveManager;
