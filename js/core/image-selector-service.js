/**
 * Image Selector Service for Super Wings Simulator
 * Frontend wrapper for AI-powered image selection API
 * Automatically determines the best image based on context
 */

class ImageSelectorService {
    constructor() {
        this.apiBase = 'http://localhost:8001/api/v1/images';  // Fixed: Backend runs on port 8001
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.isOnline = true;
        this.fallbackPaths = {};

        // Check API availability on init
        this.checkAvailability();
    }

    /**
     * Check if the API is available
     */
    async checkAvailability() {
        try {
            const response = await fetch(`${this.apiBase}/catalog`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            this.isOnline = response.ok;
            console.log(`[ImageSelector] API ${this.isOnline ? 'online' : 'offline'}`);
        } catch (e) {
            this.isOnline = false;
            console.log('[ImageSelector] API offline, using fallback mode');
        }
    }

    // ==================== Scene-Specific Selectors ====================

    /**
     * Select image for takeoff preparation
     */
    async selectForReady(characterId) {
        return this.select(characterId, {
            action: 'idle',
            emotion: 'determined',
            game_state: 'mission_start',
            context: 'preparing for takeoff on runway'
        });
    }

    /**
     * Select image for takeoff action
     */
    async selectForTakeoff(characterId) {
        return this.select(characterId, {
            action: 'takeoff',
            game_state: 'mission_start',
            context: 'accelerating on runway'
        });
    }

    /**
     * Select image for in-flight
     */
    async selectForFlying(characterId) {
        return this.select(characterId, {
            action: 'flying',
            game_state: 'in_flight'
        });
    }

    /**
     * Select image for descending/landing approach
     */
    async selectForDescending(characterId, location = '') {
        return this.select(characterId, {
            action: 'landing',
            game_state: 'arriving',
            context: location ? `descending to ${location}` : 'approaching destination'
        });
    }

    /**
     * Select image for hovering (pre-transform)
     */
    async selectForHovering(characterId) {
        return this.select(characterId, {
            action: 'hovering',
            emotion: 'focused',
            game_state: 'pre_transform'
        });
    }

    /**
     * Select image for alert/ready state
     */
    async selectForAlert(characterId) {
        return this.select(characterId, {
            emotion: 'determined',
            action: 'alert',
            game_state: 'pre_transform',
            context: 'ready to transform'
        });
    }

    /**
     * Select image for celebration (mission complete)
     */
    async selectForCelebrating(characterId) {
        return this.select(characterId, {
            emotion: 'excited',
            action: 'celebrating',
            game_state: 'mission_complete'
        });
    }

    /**
     * Select image for victory pose
     */
    async selectForVictory(characterId) {
        return this.select(characterId, {
            emotion: 'happy',
            action: 'victory',
            game_state: 'mission_complete'
        });
    }

    /**
     * Select image for returning flight
     */
    async selectForReturning(characterId) {
        return this.select(characterId, {
            action: 'flying',
            game_state: 'returning',
            context: 'returning to base after mission'
        });
    }

    // ==================== API Methods ====================

    /**
     * Generic image selection (main method)
     * @param {string} characterId - Character ID (e.g., 'jett', 'donnie')
     * @param {Object} params - Selection parameters
     * @returns {Promise<Object>} - Selected image info
     */
    async select(characterId, params = {}) {
        // Check cache first
        const cacheKey = this.getCacheKey(characterId, params);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }

        // Try API if online
        if (this.isOnline) {
            try {
                const result = await this.fetchFromApi(characterId, params);
                this.setCache(cacheKey, result);
                return result;
            } catch (e) {
                console.warn('[ImageSelector] API request failed:', e.message);
                this.isOnline = false;
            }
        }

        // Fallback to local selection
        return this.offlineFallback(characterId, params);
    }

    /**
     * Fetch image selection from API
     */
    async fetchFromApi(characterId, params) {
        const queryParams = new URLSearchParams();

        if (params.emotion) queryParams.set('emotion', params.emotion);
        if (params.action) queryParams.set('action', params.action);
        if (params.mission_type) queryParams.set('mission_type', params.mission_type);
        if (params.game_state) queryParams.set('game_state', params.game_state);
        if (params.context) queryParams.set('context', params.context);

        const url = `${this.apiBase}/select/${characterId}?${queryParams.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();

        return {
            primary: data.image_path,
            filename: data.filename,
            category: data.category,
            confidence: data.confidence,
            alternatives: data.alternatives || []
        };
    }

    /**
     * Get transformation sequence for a character
     * @param {string} characterId - Character ID
     * @param {Object} options - Options
     * @returns {Promise<Array<string>>} - Array of frame paths
     */
    async getTransformSequence(characterId, options = {}) {
        const { frameCount = null, useInterpolated = true, reverse = false } = options;

        if (this.isOnline) {
            try {
                const queryParams = new URLSearchParams();
                if (frameCount) queryParams.set('frame_count', frameCount);
                queryParams.set('use_interpolated', useInterpolated);

                const url = `${this.apiBase}/transform/${characterId}?${queryParams.toString()}`;
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    let frames = data.frames;
                    if (reverse) {
                        frames = [...frames].reverse();
                    }
                    return frames;
                }
            } catch (e) {
                console.warn('[ImageSelector] Transform sequence API failed:', e.message);
            }
        }

        // Fallback: generate frame paths locally
        return this.getLocalTransformFrames(characterId, frameCount, reverse);
    }

    /**
     * Select image for mission context
     */
    async selectForMission(characterId, missionType, phase = 'active') {
        if (this.isOnline) {
            try {
                const url = `${this.apiBase}/mission/${characterId}?mission_type=${missionType}&phase=${phase}`;
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    return {
                        primary: data.image_path,
                        filename: data.filename,
                        category: data.category,
                        confidence: data.confidence,
                        alternatives: data.alternatives || []
                    };
                }
            } catch (e) {
                console.warn('[ImageSelector] Mission API failed:', e.message);
            }
        }

        // Fallback
        return this.offlineFallback(characterId, { mission_type: missionType, phase });
    }

    /**
     * Select image for dialogue
     */
    async selectForDialogue(characterId, emotion = 'neutral', dialogueType = 'conversation') {
        if (this.isOnline) {
            try {
                const url = `${this.apiBase}/dialogue/${characterId}?emotion=${emotion}&dialogue_type=${dialogueType}`;
                const response = await fetch(url);

                if (response.ok) {
                    const data = await response.json();
                    return {
                        primary: data.image_path,
                        filename: data.filename,
                        category: data.category,
                        confidence: data.confidence,
                        alternatives: data.alternatives || []
                    };
                }
            } catch (e) {
                console.warn('[ImageSelector] Dialogue API failed:', e.message);
            }
        }

        // Fallback
        return this.offlineFallback(characterId, { emotion, dialogue_type: dialogueType });
    }

    // ==================== Offline Fallback ====================

    /**
     * Local image selection when API is unavailable
     */
    offlineFallback(characterId, params) {
        // 驗證 characterId 是否有效
        const validCharacters = ['jett', 'jerome', 'donnie', 'chase', 'flip', 'todd', 'paul', 'bello'];

        // NPC 使用特殊 ID，映射到 jett
        if (characterId && characterId.toLowerCase().startsWith('npc_')) {
            console.log(`[ImageSelector] NPC character "${characterId}", using jett fallback`);
            const validCharId = 'jett';
            const fallback = `assets/images/characters/${validCharId}/all/action_pose_v1.png`;
            return {
                primary: fallback,
                filename: fallback,
                category: 'npc_fallback',
                confidence: 0.3,
                alternatives: []
            };
        }

        const validCharId = (characterId && validCharacters.includes(characterId.toLowerCase()))
            ? characterId.toLowerCase()
            : 'jett';

        // 如果 characterId 無效，記錄警告
        if (characterId && !validCharacters.includes(characterId.toLowerCase())) {
            console.warn(`[ImageSelector] Invalid characterId: "${characterId}", using fallback: jett`);
        }

        const fallback = `assets/images/characters/${validCharId}/all/action_pose_v1.png`;

        return {
            primary: fallback,
            filename: fallback,
            category: 'fallback_placeholder',
            confidence: 0.3,
            alternatives: []
        };
    }

    /**
     * Get local transform frames (fallback)
     */
    getLocalTransformFrames(characterId, frameCount = 241, reverse = false) {
        const basePath = `assets/images/characters/${characterId}/transform_frames`;
        const frames = [];
        const totalFrames = 241;
        const step = frameCount ? Math.max(1, Math.floor(totalFrames / frameCount)) : 1;
        const actualCount = frameCount || totalFrames;

        for (let i = 0; i < actualCount; i++) {
            const frameIndex = Math.min(i * step, totalFrames - 1);
            frames.push(`${basePath}/frame_${String(frameIndex).padStart(4, '0')}.png`);
        }

        if (reverse) {
            frames.reverse();
        }

        return frames;
    }

    // ==================== Batch Operations ====================

    /**
     * Preload multiple images for a scene
     * @param {string} characterId - Character ID
     * @param {Array<Object>} selections - Array of selection params
     * @returns {Promise<Object>} - Object with named results
     */
    async preloadForScene(characterId, selections) {
        const results = {};
        const promises = [];

        for (const [name, params] of Object.entries(selections)) {
            promises.push(
                this.select(characterId, params)
                    .then(result => { results[name] = result; })
                    .catch(e => {
                        console.warn(`[ImageSelector] Failed to load ${name}:`, e);
                        results[name] = this.offlineFallback(characterId, params);
                    })
            );
        }

        await Promise.all(promises);
        return results;
    }

    /**
     * Preload images for launch scene
     */
    async preloadForLaunch(characterId) {
        return this.preloadForScene(characterId, {
            ready: { action: 'idle', emotion: 'determined', game_state: 'mission_start' },
            takeoff: { action: 'takeoff', game_state: 'mission_start' },
            flying: { action: 'flying', game_state: 'in_flight' }
        });
    }

    /**
     * Preload images for arrival scene
     */
    async preloadForArrival(characterId, location = '') {
        return this.preloadForScene(characterId, {
            descending: { action: 'landing', game_state: 'arriving', context: `descending to ${location}` },
            hovering: { action: 'hovering', emotion: 'focused', game_state: 'pre_transform' },
            alert: { emotion: 'determined', action: 'alert', game_state: 'pre_transform' }
        });
    }

    /**
     * Preload images for return scene
     */
    async preloadForReturn(characterId) {
        return this.preloadForScene(characterId, {
            celebrating: { emotion: 'excited', action: 'celebrating', game_state: 'mission_complete' },
            takeoff: { action: 'takeoff', context: 'leaving destination after mission' },
            flying: { action: 'flying', game_state: 'returning' },
            landing: { action: 'landing', context: 'landing at home base hangar' }
        });
    }

    // ==================== Cache Management ====================

    getCacheKey(characterId, params) {
        return `${characterId}:${JSON.stringify(params)}`;
    }

    getFromCache(key) {
        const entry = this.cache.get(key);
        if (entry && Date.now() - entry.timestamp < this.cacheTimeout) {
            return entry.data;
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }

    // ==================== Image Preloader ====================

    /**
     * Preload actual image files into browser cache
     * @param {Array<string>} paths - Array of image paths
     * @param {Function} onProgress - Progress callback (loaded, total)
     * @returns {Promise<Array<HTMLImageElement>>}
     */
    async preloadImages(paths, onProgress = null) {
        let loaded = 0;
        const total = paths.length;
        const images = [];

        const loadImage = (path) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    loaded++;
                    if (onProgress) onProgress(loaded, total);
                    resolve(img);
                };
                img.onerror = () => {
                    loaded++;
                    if (onProgress) onProgress(loaded, total);
                    resolve(null); // Don't reject, just return null for failed images
                };
                img.src = path;
            });
        };

        for (const path of paths) {
            const img = await loadImage(path);
            images.push(img);
        }

        return images;
    }

    /**
     * Preload images in parallel with concurrency limit
     */
    async preloadImagesParallel(paths, concurrency = 4, onProgress = null) {
        let loaded = 0;
        const total = paths.length;
        const images = new Array(paths.length);

        const loadImage = async (path, index) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    loaded++;
                    if (onProgress) onProgress(loaded, total);
                    images[index] = img;
                    resolve(img);
                };
                img.onerror = () => {
                    loaded++;
                    if (onProgress) onProgress(loaded, total);
                    images[index] = null;
                    resolve(null);
                };
                img.src = path;
            });
        };

        // Process in batches
        for (let i = 0; i < paths.length; i += concurrency) {
            const batch = paths.slice(i, i + concurrency);
            await Promise.all(batch.map((path, j) => loadImage(path, i + j)));
        }

        return images;
    }
}

// Create singleton instance
const imageSelector = new ImageSelectorService();

// Make available globally
window.imageSelector = imageSelector;

export { ImageSelectorService, imageSelector };
