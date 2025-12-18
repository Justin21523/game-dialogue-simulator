/**
 * WorldGenerator - AI 世界生成器（前端）
 * 調用後端 API 生成動態探索世界
 */

export class WorldGenerator {
    constructor() {
        this.apiBase = 'http://localhost:8001/api/v1';
        this.cache = new Map();
        this.cacheTimeout = 10 * 60 * 1000; // 10 分鐘緩存
    }

    /**
     * 從 AI 生成世界
     * @param {string} destination - 目的地（paris, tokyo, london 等）
     * @param {Object} options - 選項
     * @returns {Promise<Object>} WorldSpec
     */
    async generateFromAI(destination, options = {}) {
        const {
            missionType = null,
            difficulty = 'normal',
            useCache = false
        } = options;

        // 生成 trace ID 用於除錯
        const traceId = `world_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        console.log(`[WorldGenerator] 🌍 Generating world for ${destination} (trace: ${traceId})`);

        // 檢查緩存
        const cacheKey = `${destination}_${missionType}_${difficulty}`;
        if (useCache) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                console.log(`[WorldGenerator] ✅ Using cached world`);
                return cached;
            }
        }

        try {
            // 調用後端 API（帶 5 秒 timeout）
            const fetchPromise = fetch(`${this.apiBase}/world/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destination,
                    mission_type: missionType,
                    difficulty,
                    trace_id: traceId
                })
            });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('World generation timeout (5s)')), 5000);
            });

            const response = await Promise.race([fetchPromise, timeoutPromise]);

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'World generation failed');
            }

            const worldSpec = data.world_spec;

            console.log(`[WorldGenerator] ✅ Generated world:`, {
                theme: worldSpec.theme,
                background: worldSpec.background_key,
                npcs: worldSpec.npcs.length,
                buildings: worldSpec.buildings.length,
                items: worldSpec.items.length,
                time: data.generation_time?.toFixed(2) + 's'
            });

            // 緩存結果
            this.setCache(cacheKey, worldSpec);

            return worldSpec;

        } catch (error) {
            console.error('[WorldGenerator] ❌ AI generation failed:', error);

            // 回退到程序化生成
            console.log('[WorldGenerator] 🔄 Falling back to procedural generation');
            return this.generateProcedural(destination, options);
        }
    }

    /**
     * 程序化世界生成（fallback）
     * 當 AI API 失敗時使用
     */
    generateProcedural(destination, options = {}) {
        console.log(`[WorldGenerator] 🎲 Generating procedural world for ${destination}`);

        const npcs = [];
        const npcCount = 12;
        const npcNames = ['Explorer Charlie', 'Villager Alex', 'Tourist Emma',
                          'Local Guide Max', 'Shopkeeper Lily', 'Street Artist Sam',
                          'Friendly Stranger', 'Curious Child', 'Elderly Resident',
                          'Park Visitor', 'Cafe Owner', 'Museum Guide'];

        // 生成 NPC（確保位置不重疊）
        const positions = [];
        for (let i = 0; i < npcCount; i++) {
            let x, y, attempts = 0;
            do {
                x = Math.random() * 1600 + 200;
                y = 500;
                attempts++;
            } while (attempts < 30 && positions.some(p => Math.abs(p.x - x) < 150));

            positions.push({ x, y });

            npcs.push({
                id: `npc_${destination}_${i + 1}`,
                name: npcNames[i] || `NPC ${i + 1}`,
                type: Math.random() > 0.3 ? 'resident' : 'shopkeeper',
                x,
                y,
                dialogue: [
                    `Welcome to ${destination}!`,
                    'How can I help you?',
                    'Enjoy your visit!'
                ],
                has_quest: Math.random() < 0.15
            });
        }

        // 生成建築物
        const buildings = [];
        const buildingCount = 4;
        const buildingTypes = ['shop', 'cafe', 'house', 'landmark'];

        for (let i = 0; i < buildingCount; i++) {
            buildings.push({
                id: `building_${i + 1}`,
                name: `${buildingTypes[i]} #${i + 1}`,
                type: buildingTypes[i],
                x: 400 + i * 400,
                y: 400,
                width: 150,
                height: 200,
                can_enter: buildingTypes[i] === 'shop' || buildingTypes[i] === 'cafe'
            });
        }

        // 生成物品
        const items = [];
        const itemCount = 6;

        for (let i = 0; i < itemCount; i++) {
            const itemType = Math.random() > 0.7 ? 'package' : 'coin';
            items.push({
                id: `item_${itemType}_${i + 1}`,
                name: itemType === 'coin' ? 'Coin' : 'Package',
                type: itemType,
                x: Math.random() * 1600 + 200,
                y: 500,
                value: itemType === 'coin' ? 10 : 50
            });
        }

        return {
            destination,
            theme: `${destination}_afternoon`,
            background_key: `${destination}_afternoon_clear`,
            time_of_day: 'afternoon',
            weather: 'clear',
            npcs,
            buildings,
            items,
            pois: [],
            trace_id: `procedural_${Date.now()}`,
            generation_time: 0
        };
    }

    /**
     * 取得可用目的地列表
     */
    async getAvailableDestinations() {
        try {
            const response = await fetch(`${this.apiBase}/world/destinations`);
            const data = await response.json();
            return data.destinations || ['paris', 'tokyo', 'london', 'new_york'];
        } catch (error) {
            console.warn('[WorldGenerator] Failed to fetch destinations:', error);
            return ['paris', 'tokyo', 'london', 'new_york', 'sydney', 'rio', 'moscow', 'dubai'];
        }
    }

    // ===== 緩存管理 =====

    getCacheKey(destination, missionType, difficulty) {
        return `${destination}_${missionType}_${difficulty}`;
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
}

// 建立單例
export const worldGenerator = new WorldGenerator();
