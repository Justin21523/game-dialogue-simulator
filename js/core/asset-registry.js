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
}

// 建立全域單例
export const assetRegistry = new AssetRegistry();
