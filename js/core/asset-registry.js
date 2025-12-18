/**
 * AssetRegistry - 統一資產註冊表
 * 管理所有遊戲資產的 assetKey → 路徑映射，並提供多級 fallback 機制
 */

export class AssetRegistry {
    constructor() {
        // 資產註冊表：category → assetKey → path
        this.registry = {
            backgrounds: new Map(),
            buildings: new Map(),
            npcs: new Map(),
            items: new Map(),
            models3d: new Map(),
            portraits: new Map()
        };

        // Fallback 優先級：每個分類的預設資產
        this.defaults = {
            backgrounds: null,       // 稍後設定
            buildings: null,
            npcs: null,
            items: null,
            models3d: null,
            portraits: null
        };

        // 統計資訊
        this.stats = {
            registered: 0,
            fallbackHits: 0,
            missingAssets: new Set()
        };

        // API 設定
        this.apiBase = 'http://localhost:8001/api/v1';
        this.manifestLoaded = false;

        // 初始化資產
        this._initializeAssets();
    }

    /**
     * 初始化資產註冊表
     * 這裡註冊所有已知的資產 key
     */
    _initializeAssets() {
        console.log('[AssetRegistry] Initializing asset registry...');

        // ===== 背景圖 =====
        this._registerBackground('paris_morning_clear', 'assets/images/backgrounds/paris_morning.png');
        this._registerBackground('paris_sunset_clear', 'assets/images/backgrounds/paris_sunset.png');
        this._registerBackground('tokyo_night', 'assets/images/backgrounds/tokyo_night.png');
        this._registerBackground('new_york_day', 'assets/images/backgrounds/new_york_day.png');
        this._registerBackground('london_afternoon', 'assets/images/backgrounds/london_afternoon.png');
        this._registerBackground('sydney_morning', 'assets/images/backgrounds/sydney_morning.png');
        this._registerBackground('rio_carnival', 'assets/images/backgrounds/rio_carnival.png');
        this._registerBackground('cairo_desert', 'assets/images/backgrounds/cairo_desert.png');

        // 預設背景
        this.defaults.backgrounds = 'assets/images/backgrounds/generic_sky.png';

        // ===== 建築物 =====
        this._registerBuilding('paris_cafe', 'assets/images/buildings/paris_cafe.png');
        this._registerBuilding('paris_shop', 'assets/images/buildings/paris_shop.png');
        this._registerBuilding('tokyo_temple', 'assets/images/buildings/tokyo_temple.png');
        this._registerBuilding('new_york_skyscraper', 'assets/images/buildings/ny_building.png');
        this._registerBuilding('generic_building', 'assets/images/buildings/generic_building.png');

        // 預設建築
        this.defaults.buildings = 'assets/images/buildings/generic_building.png';

        // ===== NPC 圖片（2D sprite）=====
        this._registerNPC('paris_shopkeeper', 'assets/images/npcs/paris/shopkeeper.png');
        this._registerNPC('paris_child', 'assets/images/npcs/paris/child.png');
        this._registerNPC('tokyo_citizen', 'assets/images/npcs/tokyo/citizen.png');
        this._registerNPC('generic_npc', 'assets/images/npcs/generic_person.png');

        // 預設 NPC
        this.defaults.npcs = 'assets/images/npcs/generic_person.png';

        // ===== 物品 =====
        this._registerItem('package', 'assets/images/items/package.png');
        this._registerItem('coin', 'assets/images/items/coin.png');
        this._registerItem('gift', 'assets/images/items/gift.png');
        this._registerItem('letter', 'assets/images/items/letter.png');

        // 預設物品
        this.defaults.items = 'assets/images/items/generic_item.png';

        // ===== 3D 模型 =====
        // 主角色
        this._registerModel3D('character_jett', 'assets/models/characters/jett.glb');
        this._registerModel3D('character_jerome', 'assets/models/characters/jerome.glb');
        this._registerModel3D('character_donnie', 'assets/models/characters/donnie.glb');
        this._registerModel3D('character_chase', 'assets/models/characters/chase.glb');

        // NPC 模型
        this._registerModel3D('npc_paris_shopkeeper', 'assets/models/npcs/paris_shopkeeper.glb');
        this._registerModel3D('npc_tokyo_child', 'assets/models/npcs/tokyo_child.glb');
        this._registerModel3D('npc_generic', 'assets/models/npcs/generic_npc.glb');

        // 預設 3D 模型（null 表示使用程式生成的 placeholder）
        this.defaults.models3d = null;

        console.log('[AssetRegistry] Registered assets:', this.getStats());
    }

    /**
     * 註冊背景資產
     */
    _registerBackground(key, path) {
        this.registry.backgrounds.set(key, path);
        this.stats.registered++;
    }

    /**
     * 註冊建築資產
     */
    _registerBuilding(key, path) {
        this.registry.buildings.set(key, path);
        this.stats.registered++;
    }

    /**
     * 註冊 NPC 資產
     */
    _registerNPC(key, path) {
        this.registry.npcs.set(key, path);
        this.stats.registered++;
    }

    /**
     * 註冊物品資產
     */
    _registerItem(key, path) {
        this.registry.items.set(key, path);
        this.stats.registered++;
    }

    /**
     * 註冊 3D 模型資產
     */
    _registerModel3D(key, path) {
        this.registry.models3d.set(key, path);
        this.stats.registered++;
    }

    /**
     * 取得資產路徑（含 fallback 機制）
     * @param {string} assetKey - 資產 key
     * @param {string} category - 資產分類（backgrounds, buildings, npcs, items, models3d）
     * @returns {string|null} - 資產路徑或 null（表示使用程式生成的 placeholder）
     */
    getAsset(assetKey, category) {
        if (!this.registry[category]) {
            console.warn(`[AssetRegistry] Invalid category: ${category}`);
            return null;
        }

        // Level 1: 嘗試取得指定的 assetKey
        if (this.registry[category].has(assetKey)) {
            return this.registry[category].get(assetKey);
        }

        // Level 2: 使用該分類的預設資產
        if (this.defaults[category]) {
            console.warn(`[AssetRegistry] Asset '${assetKey}' not found in category '${category}', using default`);
            this.stats.fallbackHits++;
            this.stats.missingAssets.add(`${category}:${assetKey}`);
            return this.defaults[category];
        }

        // Level 3: 返回 null，表示使用程式生成的 placeholder
        console.warn(`[AssetRegistry] Asset '${assetKey}' not found, category '${category}' has no default. Will use placeholder.`);
        this.stats.fallbackHits++;
        this.stats.missingAssets.add(`${category}:${assetKey}`);
        return null;
    }

    /**
     * 檢查資產是否存在
     * @param {string} assetKey - 資產 key
     * @param {string} category - 資產分類
     * @returns {boolean}
     */
    exists(assetKey, category) {
        if (!this.registry[category]) {
            return false;
        }
        return this.registry[category].has(assetKey);
    }

    /**
     * 取得分類的預設資產
     * @param {string} category - 資產分類
     * @returns {string|null}
     */
    getFallback(category) {
        return this.defaults[category] || null;
    }

    /**
     * 取得所有已註冊的資產 keys
     * @param {string} category - 資產分類
     * @returns {Array<string>}
     */
    getAssetKeys(category) {
        if (!this.registry[category]) {
            return [];
        }
        return Array.from(this.registry[category].keys());
    }

    /**
     * 隨機選擇一個資產
     * @param {string} category - 資產分類
     * @returns {string|null} - assetKey
     */
    getRandomAssetKey(category) {
        const keys = this.getAssetKeys(category);
        if (keys.length === 0) {
            return null;
        }
        return keys[Math.floor(Math.random() * keys.length)];
    }

    /**
     * 取得統計資訊
     * @returns {Object}
     */
    getStats() {
        return {
            registered: this.stats.registered,
            backgrounds: this.registry.backgrounds.size,
            buildings: this.registry.buildings.size,
            npcs: this.registry.npcs.size,
            items: this.registry.items.size,
            models3d: this.registry.models3d.size,
            portraits: this.registry.portraits.size,
            fallbackHits: this.stats.fallbackHits,
            missingAssets: Array.from(this.stats.missingAssets)
        };
    }

    /**
     * 列印除錯資訊
     */
    debugPrint() {
        const stats = this.getStats();
        console.log('=== AssetRegistry Debug Info ===');
        console.log(`Total registered: ${stats.registered}`);
        console.log(`  - Backgrounds: ${stats.backgrounds}`);
        console.log(`  - Buildings: ${stats.buildings}`);
        console.log(`  - NPCs: ${stats.npcs}`);
        console.log(`  - Items: ${stats.items}`);
        console.log(`  - 3D Models: ${stats.models3d}`);
        console.log(`  - Portraits: ${stats.portraits}`);
        console.log(`Fallback hits: ${stats.fallbackHits}`);
        if (stats.missingAssets.length > 0) {
            console.log(`Missing assets (${stats.missingAssets.length}):`);
            stats.missingAssets.forEach(asset => console.log(`  - ${asset}`));
        }
        console.log('================================');
    }

    /**
     * 從後端 API 載入完整資產清單
     * @returns {Promise<boolean>} - 成功返回 true
     */
    async loadManifestFromAPI() {
        if (this.manifestLoaded) {
            console.log('[AssetRegistry] Manifest already loaded, skipping');
            return true;
        }

        console.log('[AssetRegistry] 🔍 Loading asset manifest from API...');

        try {
            const response = await fetch(`${this.apiBase}/assets/manifest`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const manifest = await response.json();

            // 註冊背景資產
            this._registerManifestCategory(manifest.backgrounds, 'backgrounds',
                (dest, keys) => {
                    keys.forEach(key => {
                        // 構建路徑：根據 key 推斷路徑
                        const path = this._inferBackgroundPath(key, dest);
                        this._registerBackground(key, path);
                    });
                }
            );

            // 註冊建築資產
            this._registerManifestCategory(manifest.buildings, 'buildings',
                (type, keys) => {
                    keys.forEach(key => {
                        const path = this._inferBuildingPath(key, type);
                        this._registerBuilding(key, path);
                    });
                }
            );

            // 註冊 NPC 資產
            this._registerManifestCategory(manifest.npcs, 'npcs',
                (archetype, keys) => {
                    keys.forEach(key => {
                        const path = this._inferNPCPath(key, archetype);
                        this._registerNPC(key, path);
                    });
                }
            );

            // 註冊物品資產
            this._registerManifestCategory(manifest.items, 'items',
                (itemType, keys) => {
                    keys.forEach(key => {
                        const path = this._inferItemPath(key, itemType);
                        this._registerItem(key, path);
                    });
                }
            );

            // 註冊 3D 模型
            this._registerManifestCategory(manifest.models_3d, 'models3d',
                (category, keys) => {
                    keys.forEach(key => {
                        const path = this._inferModelPath(key, category);
                        this._registerModel3D(key, path);
                    });
                }
            );

            this.manifestLoaded = true;

            console.log('[AssetRegistry] ✅ Manifest loaded:', {
                backgrounds: manifest.stats.total_backgrounds,
                buildings: manifest.stats.total_buildings,
                npcs: manifest.stats.total_npcs,
                items: manifest.stats.total_items,
                models_3d: manifest.stats.total_3d_models
            });

            return true;

        } catch (error) {
            console.warn('[AssetRegistry] ⚠️ Failed to load manifest from API:', error.message);
            console.log('[AssetRegistry] Using hardcoded assets only');
            return false;
        }
    }

    /**
     * 註冊 manifest 分類的輔助方法
     */
    _registerManifestCategory(categoryData, categoryName, registerFn) {
        if (!categoryData) return;

        Object.entries(categoryData).forEach(([subcategory, keys]) => {
            if (Array.isArray(keys) && keys.length > 0) {
                registerFn(subcategory, keys);
            }
        });
    }

    /**
     * 根據 assetKey 推斷背景路徑
     */
    _inferBackgroundPath(key, destination) {
        // 特殊處理天空和雲朵
        if (destination === 'sky') {
            return `assets/images/backgrounds/sky/${key}.png`;
        }
        if (destination === 'clouds') {
            return `assets/images/backgrounds/clouds/${key}.png`;
        }

        // 目的地背景
        // key 格式：destination_layer_variant (例如 paris_buildings_v1)
        return `assets/images/backgrounds/destinations/${destination}/${key}.png`;
    }

    /**
     * 根據 assetKey 推斷建築路徑
     */
    _inferBuildingPath(key, buildingType) {
        // key 格式：type_name (例如 cafe_paris_v1) 或 interior_type_name
        if (buildingType === 'interior') {
            // interior_cafe_modern
            const parts = key.split('_');
            const interiorType = parts[1] || 'generic';
            return `assets/images/interiors/${interiorType}/${key}.png`;
        }
        return `assets/images/objects/${buildingType}/${key}.png`;
    }

    /**
     * 根據 assetKey 推斷 NPC 路徑
     */
    _inferNPCPath(key, archetype) {
        // key 格式：npc_archetype_variant (例如 npc_citizen_paris_01)
        return `assets/images/npcs/${archetype}/${key}.png`;
    }

    /**
     * 根據 assetKey 推斷物品路徑
     */
    _inferItemPath(key, itemType) {
        // key 格式：item_type_variant (例如 item_collectible_coin_gold)
        return `assets/images/items/${itemType}/${key}.png`;
    }

    /**
     * 根據 assetKey 推斷 3D 模型路徑
     */
    _inferModelPath(key, category) {
        // key 格式：model_category_name (例如 model_characters_jett)
        return `assets/models/${category}/${key}.glb`;
    }
}

// 建立全域單例
export const assetRegistry = new AssetRegistry();
