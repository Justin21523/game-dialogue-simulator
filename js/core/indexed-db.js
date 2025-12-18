/**
 * IndexedDB Manager for Super Wings Simulator
 * Provides persistent storage with fallback to localStorage
 *
 * Benefits over localStorage:
 * - Supports larger data volumes (GBs vs ~5MB)
 * - Asynchronous operations (non-blocking)
 * - Structured queries with indexes
 * - Better performance for complex data
 */

class IndexedDBManager {
    constructor() {
        this.dbName = 'SuperWingsDB';
        this.dbVersion = 1;
        this.db = null;

        // Object store names
        this.stores = {
            gameState: 'gameState',
            missionHistory: 'missionHistory',
            achievements: 'achievements',
            statistics: 'statistics',
            settings: 'settings',
        };

        this.initPromise = null;
    }

    /**
     * Initialize IndexedDB connection
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        // Return existing promise if already initializing
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            // Check if IndexedDB is available
            if (!window.indexedDB) {
                console.warn('[IndexedDB] Not supported, falling back to localStorage');
                this.db = null;
                resolve(null);
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('[IndexedDB] Failed to open:', request.error);
                this.db = null;
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[IndexedDB] Opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores if they don't exist
                if (!db.objectStoreNames.contains(this.stores.gameState)) {
                    const gameStateStore = db.createObjectStore(this.stores.gameState, { keyPath: 'key' });
                    gameStateStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.stores.missionHistory)) {
                    const missionStore = db.createObjectStore(this.stores.missionHistory, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                    missionStore.createIndex('timestamp', 'timestamp', { unique: false });
                    missionStore.createIndex('missionType', 'missionType', { unique: false });
                    missionStore.createIndex('character', 'character', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.stores.achievements)) {
                    const achievementStore = db.createObjectStore(this.stores.achievements, { keyPath: 'id' });
                    achievementStore.createIndex('unlocked', 'unlocked', { unique: false });
                    achievementStore.createIndex('category', 'category', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.stores.statistics)) {
                    const statsStore = db.createObjectStore(this.stores.statistics, { keyPath: 'key' });
                    statsStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.stores.settings)) {
                    db.createObjectStore(this.stores.settings, { keyPath: 'key' });
                }

                console.log('[IndexedDB] Database upgraded to version', this.dbVersion);
            };
        });

        return this.initPromise;
    }

    /**
     * Save data to IndexedDB with localStorage fallback
     * @param {string} storeName - Object store name
     * @param {Object} data - Data to save
     * @returns {Promise<boolean>} Success status
     */
    async save(storeName, data) {
        // Ensure database is initialized
        if (!this.db) {
            await this.init();
        }

        // Fallback to localStorage if IndexedDB unavailable
        if (!this.db) {
            return this._saveToLocalStorage(storeName, data);
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);

                // Add timestamp
                const dataWithTimestamp = {
                    ...data,
                    timestamp: Date.now(),
                };

                const request = store.put(dataWithTimestamp);

                request.onsuccess = () => {
                    // Also save to localStorage as backup
                    this._saveToLocalStorage(storeName, data);
                    resolve(true);
                };

                request.onerror = () => {
                    console.error(`[IndexedDB] Save failed for ${storeName}:`, request.error);
                    // Fallback to localStorage
                    this._saveToLocalStorage(storeName, data);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`[IndexedDB] Save error for ${storeName}:`, error);
                this._saveToLocalStorage(storeName, data);
                reject(error);
            }
        });
    }

    /**
     * Load data from IndexedDB with localStorage fallback
     * @param {string} storeName - Object store name
     * @param {string} key - Data key
     * @returns {Promise<Object|null>} Loaded data or null
     */
    async load(storeName, key) {
        // Ensure database is initialized
        if (!this.db) {
            await this.init();
        }

        // Fallback to localStorage if IndexedDB unavailable
        if (!this.db) {
            return this._loadFromLocalStorage(storeName, key);
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(key);

                request.onsuccess = () => {
                    if (request.result) {
                        resolve(request.result);
                    } else {
                        // Try localStorage as fallback
                        const fallbackData = this._loadFromLocalStorage(storeName, key);
                        resolve(fallbackData);
                    }
                };

                request.onerror = () => {
                    console.error(`[IndexedDB] Load failed for ${storeName}:`, request.error);
                    // Fallback to localStorage
                    const fallbackData = this._loadFromLocalStorage(storeName, key);
                    resolve(fallbackData);
                };
            } catch (error) {
                console.error(`[IndexedDB] Load error for ${storeName}:`, error);
                const fallbackData = this._loadFromLocalStorage(storeName, key);
                resolve(fallbackData);
            }
        });
    }

    /**
     * Load all data from a store
     * @param {string} storeName - Object store name
     * @returns {Promise<Array>} Array of all records
     */
    async loadAll(storeName) {
        if (!this.db) {
            await this.init();
        }

        if (!this.db) {
            return [];
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();

                request.onsuccess = () => {
                    resolve(request.result || []);
                };

                request.onerror = () => {
                    console.error(`[IndexedDB] LoadAll failed for ${storeName}:`, request.error);
                    resolve([]);
                };
            } catch (error) {
                console.error(`[IndexedDB] LoadAll error for ${storeName}:`, error);
                resolve([]);
            }
        });
    }

    /**
     * Query data using an index
     * @param {string} storeName - Object store name
     * @param {string} indexName - Index name
     * @param {*} query - Query value
     * @returns {Promise<Array>} Matching records
     */
    async query(storeName, indexName, query) {
        if (!this.db) {
            await this.init();
        }

        if (!this.db) {
            return [];
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(query);

                request.onsuccess = () => {
                    resolve(request.result || []);
                };

                request.onerror = () => {
                    console.error(`[IndexedDB] Query failed for ${storeName}.${indexName}:`, request.error);
                    resolve([]);
                };
            } catch (error) {
                console.error(`[IndexedDB] Query error for ${storeName}.${indexName}:`, error);
                resolve([]);
            }
        });
    }

    /**
     * Delete data from store
     * @param {string} storeName - Object store name
     * @param {string} key - Data key
     * @returns {Promise<boolean>} Success status
     */
    async delete(storeName, key) {
        if (!this.db) {
            await this.init();
        }

        if (!this.db) {
            this._deleteFromLocalStorage(storeName, key);
            return true;
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(key);

                request.onsuccess = () => {
                    this._deleteFromLocalStorage(storeName, key);
                    resolve(true);
                };

                request.onerror = () => {
                    console.error(`[IndexedDB] Delete failed for ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`[IndexedDB] Delete error for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Clear all data from a store
     * @param {string} storeName - Object store name
     * @returns {Promise<boolean>} Success status
     */
    async clear(storeName) {
        if (!this.db) {
            await this.init();
        }

        if (!this.db) {
            this._clearLocalStorage(storeName);
            return true;
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();

                request.onsuccess = () => {
                    this._clearLocalStorage(storeName);
                    resolve(true);
                };

                request.onerror = () => {
                    console.error(`[IndexedDB] Clear failed for ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`[IndexedDB] Clear error for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    // ==================== localStorage Fallback Methods ====================

    _saveToLocalStorage(storeName, data) {
        try {
            const key = `${this.dbName}_${storeName}_${data.key || data.id}`;
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('[IndexedDB] localStorage save failed:', error);
            return false;
        }
    }

    _loadFromLocalStorage(storeName, key) {
        try {
            const storageKey = `${this.dbName}_${storeName}_${key}`;
            const data = localStorage.getItem(storageKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('[IndexedDB] localStorage load failed:', error);
            return null;
        }
    }

    _deleteFromLocalStorage(storeName, key) {
        try {
            const storageKey = `${this.dbName}_${storeName}_${key}`;
            localStorage.removeItem(storageKey);
        } catch (error) {
            console.error('[IndexedDB] localStorage delete failed:', error);
        }
    }

    _clearLocalStorage(storeName) {
        try {
            const prefix = `${this.dbName}_${storeName}_`;
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
            console.error('[IndexedDB] localStorage clear failed:', error);
        }
    }
}

// Create singleton instance
const indexedDBManager = new IndexedDBManager();

// Initialize on load
indexedDBManager.init().catch(error => {
    console.error('[IndexedDB] Initialization failed:', error);
});

// Make available globally
window.indexedDBManager = indexedDBManager;

export default indexedDBManager;
