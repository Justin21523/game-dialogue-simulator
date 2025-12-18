/**
 * ExplorationAssetLoader - 探索系統資產載入器
 * 管理所有探索相關資產的載入、快取和存取
 */

import { eventBus } from './event-bus.js';

// 資產路徑配置
const ASSET_PATHS = {
    npcs: 'assets/images/npcs',
    items: 'assets/images/items',
    interiors: 'assets/images/interiors',
    fallback: 'assets/images/fallback'
};

// 所有可用目的地
const DESTINATIONS = [
    'paris', 'tokyo', 'new_york', 'cairo',
    'sydney', 'rio', 'beijing', 'london'
];

// NPC 原型
const NPC_ARCHETYPES = [
    'shopkeeper', 'child', 'elder', 'official', 'artist',
    'scientist', 'athlete', 'chef'
];

// 物品類別
const ITEM_CATEGORIES = [
    'packages', 'collectibles', 'keys', 'tools', 'quest_items', 'ability_items', 'food'
];

// 建築類型
const BUILDING_TYPES = [
    'shop', 'restaurant', 'public_building', 'residence', 'special'
];

class ExplorationAssetLoader {
    constructor() {
        // 快取
        this.cache = {
            npcs: new Map(),
            items: new Map(),
            interiors: new Map(),
            loaded: new Set()
        };

        // 載入狀態
        this.isLoading = false;
        this.loadProgress = 0;

        // 預設/後備圖片
        this.fallbacks = {
            npc: null,
            item: null,
            interior: null
        };
    }

    /**
     * 初始化載入器，載入後備圖片
     */
    async init() {
        try {
            // 載入後備圖片
            this.fallbacks.npc = await this.loadImage(`${ASSET_PATHS.fallback}/npc_placeholder.png`);
            this.fallbacks.item = await this.loadImage(`${ASSET_PATHS.fallback}/item_placeholder.png`);
            this.fallbacks.interior = await this.loadImage(`${ASSET_PATHS.fallback}/interior_placeholder.png`);

            console.log('[AssetLoader] 初始化完成');
            return true;
        } catch (error) {
            console.warn('[AssetLoader] 無法載入後備圖片:', error);
            return false;
        }
    }

    /**
     * 載入單張圖片
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load: ${src}`));
            img.src = src;
        });
    }

    /**
     * 載入特定目的地的所有資產
     */
    async loadDestinationAssets(destination) {
        if (this.cache.loaded.has(destination)) {
            console.log(`[AssetLoader] ${destination} 已載入，使用快取`);
            return;
        }

        this.isLoading = true;
        this.loadProgress = 0;
        eventBus.emit('ASSETS_LOADING', { destination, progress: 0 });

        const assets = [];

        // 1. NPC 肖像
        for (const archetype of NPC_ARCHETYPES) {
            const npcId = `${destination}_${archetype}`;
            assets.push({
                type: 'npc',
                id: npcId,
                path: `${ASSET_PATHS.npcs}/${destination}/${npcId}_portrait.png`
            });
        }

        // 2. 食物
        const foodItems = this.getFoodItemsForDestination(destination);
        for (const itemId of foodItems) {
            assets.push({
                type: 'item',
                id: itemId,
                path: `${ASSET_PATHS.items}/food/${destination}/${itemId}.png`
            });
        }

        // 3. 目的地風格建築內部
        for (const btype of ['shop', 'restaurant']) {
            const variants = this.getBuildingVariants(btype);
            for (const variant of variants.slice(0, 2)) {
                assets.push({
                    type: 'interior',
                    id: `${destination}_${btype}_${variant}`,
                    path: `${ASSET_PATHS.interiors}/${destination}/${btype}/${variant}_bg.png`
                });
            }
        }

        // 載入所有資產
        const total = assets.length;
        let loaded = 0;

        for (const asset of assets) {
            try {
                const img = await this.loadImage(asset.path);
                this.cacheAsset(asset.type, asset.id, img);
            } catch (error) {
                console.warn(`[AssetLoader] 無法載入 ${asset.path}，使用後備`);
                this.cacheAsset(asset.type, asset.id, this.getFallback(asset.type));
            }

            loaded++;
            this.loadProgress = (loaded / total) * 100;
            eventBus.emit('ASSETS_LOADING', { destination, progress: this.loadProgress });
        }

        this.cache.loaded.add(destination);
        this.isLoading = false;
        eventBus.emit('ASSETS_LOADED', { destination });
        console.log(`[AssetLoader] ${destination} 載入完成 (${loaded} 個資產)`);
    }

    /**
     * 載入通用資產（所有目的地共用）
     */
    async loadCommonAssets() {
        if (this.cache.loaded.has('common')) {
            return;
        }

        const assets = [];

        // 通用物品
        for (const category of ITEM_CATEGORIES) {
            if (category === 'food') continue; // 食物按目的地載入

            const items = this.getItemsForCategory(category);
            for (const itemId of items) {
                assets.push({
                    type: 'item',
                    id: itemId,
                    path: `${ASSET_PATHS.items}/${category}/${itemId}.png`
                });
            }
        }

        // 通用建築內部
        for (const btype of BUILDING_TYPES) {
            const variants = this.getBuildingVariants(btype);
            for (const variant of variants.slice(0, 3)) {
                assets.push({
                    type: 'interior',
                    id: `${btype}_${variant}`,
                    path: `${ASSET_PATHS.interiors}/${btype}/${variant}_bg.png`
                });
            }
        }

        // 載入
        for (const asset of assets) {
            try {
                const img = await this.loadImage(asset.path);
                this.cacheAsset(asset.type, asset.id, img);
            } catch (error) {
                this.cacheAsset(asset.type, asset.id, this.getFallback(asset.type));
            }
        }

        this.cache.loaded.add('common');
        console.log(`[AssetLoader] 通用資產載入完成`);
    }

    /**
     * 快取資產
     */
    cacheAsset(type, id, image) {
        switch (type) {
            case 'npc':
                this.cache.npcs.set(id, image);
                break;
            case 'item':
                this.cache.items.set(id, image);
                break;
            case 'interior':
                this.cache.interiors.set(id, image);
                break;
        }
    }

    /**
     * 取得後備圖片
     */
    getFallback(type) {
        return this.fallbacks[type] || null;
    }

    // ==================== 資產存取方法 ====================

    /**
     * 取得 NPC 肖像
     */
    getNPCPortrait(destination, archetype) {
        const id = `${destination}_${archetype}`;
        return this.cache.npcs.get(id) || this.fallbacks.npc;
    }

    /**
     * 取得物品圖示
     */
    getItemIcon(itemId) {
        return this.cache.items.get(itemId) || this.fallbacks.item;
    }

    /**
     * 取得建築內部背景
     */
    getInteriorBackground(buildingType, variant, destination = null) {
        let id;
        if (destination) {
            id = `${destination}_${buildingType}_${variant}`;
        } else {
            id = `${buildingType}_${variant}`;
        }
        return this.cache.interiors.get(id) || this.fallbacks.interior;
    }

    /**
     * 取得食物圖示
     */
    getFoodIcon(destination, foodId) {
        return this.cache.items.get(foodId) || this.fallbacks.item;
    }

    // ==================== 輔助方法 ====================

    /**
     * 取得特定目的地的食物列表
     */
    getFoodItemsForDestination(destination) {
        const foodMap = {
            paris: ['food_croissant', 'food_baguette', 'food_macaron'],
            tokyo: ['food_sushi', 'food_ramen', 'food_onigiri'],
            new_york: ['food_pizza', 'food_hotdog', 'food_pretzel'],
            cairo: ['food_falafel', 'food_dates'],
            beijing: ['food_dumpling', 'food_mooncake'],
            london: ['food_scone', 'food_fish_chips'],
            sydney: ['food_meat_pie', 'food_lamington'],
            rio: ['food_acai', 'food_brigadeiro']
        };
        return foodMap[destination] || [];
    }

    /**
     * 取得特定類別的物品列表
     */
    getItemsForCategory(category) {
        const itemMap = {
            packages: ['package_standard', 'package_fragile', 'package_gift', 'letter', 'postcard'],
            collectibles: ['coin_gold', 'coin_silver', 'gem_ruby', 'gem_sapphire', 'gem_emerald', 'star_token'],
            keys: ['key_bronze', 'key_silver', 'key_golden', 'keycard'],
            tools: ['tool_wrench', 'tool_flashlight', 'tool_rope', 'tool_map', 'tool_compass'],
            quest_items: ['quest_recipe', 'quest_photo', 'quest_medal', 'quest_toy', 'quest_book', 'quest_instrument'],
            ability_items: ['ability_blueprint', 'ability_drill_bit', 'ability_animal_treat', 'ability_traffic_cone']
        };
        return itemMap[category] || [];
    }

    /**
     * 取得建築類型的變體列表
     */
    getBuildingVariants(buildingType) {
        const variantMap = {
            shop: ['bakery', 'toy_store', 'bookstore', 'flower_shop', 'hardware_store'],
            restaurant: ['cafe', 'pizza_parlor', 'ramen_shop', 'street_food_stall'],
            public_building: ['museum', 'library', 'post_office', 'train_station', 'fire_station'],
            residence: ['living_room', 'kitchen', 'bedroom', 'workshop'],
            special: ['cave', 'greenhouse', 'control_room', 'treasure_room']
        };
        return variantMap[buildingType] || [];
    }

    /**
     * 取得所有可用目的地
     */
    getDestinations() {
        return DESTINATIONS;
    }

    /**
     * 取得目的地本地化名稱
     */
    getDestinationName(destination) {
        const names = {
            paris: '巴黎',
            tokyo: '東京',
            new_york: '紐約',
            cairo: '開羅',
            sydney: '雪梨',
            rio: '里約',
            beijing: '北京',
            london: '倫敦'
        };
        return names[destination] || destination;
    }

    /**
     * 預載入所有資產
     */
    async preloadAll() {
        await this.init();
        await this.loadCommonAssets();

        for (const destination of DESTINATIONS) {
            await this.loadDestinationAssets(destination);
        }

        console.log('[AssetLoader] 所有資產預載入完成');
    }

    /**
     * 清除快取
     */
    clearCache() {
        this.cache.npcs.clear();
        this.cache.items.clear();
        this.cache.interiors.clear();
        this.cache.loaded.clear();
    }

    /**
     * 取得載入統計
     */
    getStats() {
        return {
            npcs: this.cache.npcs.size,
            items: this.cache.items.size,
            interiors: this.cache.interiors.size,
            loadedDestinations: Array.from(this.cache.loaded)
        };
    }
}

// 單例導出
export const assetLoader = new ExplorationAssetLoader();
export { DESTINATIONS, NPC_ARCHETYPES, ITEM_CATEGORIES, BUILDING_TYPES };
