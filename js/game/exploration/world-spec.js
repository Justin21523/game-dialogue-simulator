/**
 * WorldSpec - 世界規格定義
 * 定義 AI 生成的世界內容的資料結構
 */

/**
 * WorldSpec 資料結構
 * @typedef {Object} WorldSpec
 * @property {string} theme - 主題（paris_afternoon, tokyo_night等）
 * @property {string} backgroundKey - 背景資產 key
 * @property {string} destination - 目的地（paris, tokyo等）
 * @property {string} timeOfDay - 時間（morning, afternoon, evening, night）
 * @property {string} weather - 天氣（clear, rainy, cloudy, snowy）
 * @property {Array<NPCSpec>} npcs - NPC 列表
 * @property {Array<BuildingSpec>} buildings - 建築列表
 * @property {Array<ItemSpec>} items - 物品列表
 * @property {Array<POISpec>} poi - 興趣點列表（可選）
 * @property {Object} metadata - 元資料（生成時間、traceId等）
 */

/**
 * NPC 規格
 * @typedef {Object} NPCSpec
 * @property {string} id - NPC ID
 * @property {string} name - 名字
 * @property {string} archetype - 原型（paris_shopkeeper, tokyo_child等）
 * @property {string} role - 角色（citizen, shopkeeper, questgiver等）
 * @property {number} x - X 座標
 * @property {number} y - Y 座標
 * @property {string} personality - 性格（friendly, shy, cheerful等）
 * @property {Array<Object>} dialogues - 對話列表（可選）
 * @property {string} modelKey - 3D 模型資產 key（可選）
 */

/**
 * 建築規格
 * @typedef {Object} BuildingSpec
 * @property {string} id - 建築 ID
 * @property {string} name - 名字
 * @property {string} assetKey - 資產 key
 * @property {number} x - X 座標
 * @property {number} y - Y 座標
 * @property {number} width - 寬度
 * @property {number} height - 高度
 * @property {string} type - 類型（shop, house, cafe等）
 */

/**
 * 物品規格
 * @typedef {Object} ItemSpec
 * @property {string} id - 物品 ID
 * @property {string} name - 名字
 * @property {string} assetKey - 資產 key
 * @property {number} x - X 座標
 * @property {number} y - Y 座標
 * @property {string} type - 類型（package, coin, gift等）
 */

/**
 * 興趣點規格
 * @typedef {Object} POISpec
 * @property {string} id - POI ID
 * @property {string} name - 名字
 * @property {string} type - 類型（fountain, park, shop_zone等）
 * @property {number} x - X 座標
 * @property {number} y - Y 座標
 * @property {number} radius - 影響半徑
 */

/**
 * 驗證 WorldSpec
 * @param {WorldSpec} worldSpec - 世界規格
 * @returns {{valid: boolean, errors: Array<string>}}
 */
export function validateWorldSpec(worldSpec) {
    const errors = [];

    // 檢查必要欄位
    if (!worldSpec.theme) {
        errors.push('Missing required field: theme');
    }
    if (!worldSpec.backgroundKey) {
        errors.push('Missing required field: backgroundKey');
    }
    if (!worldSpec.destination) {
        errors.push('Missing required field: destination');
    }

    // 檢查 NPCs
    if (!Array.isArray(worldSpec.npcs)) {
        errors.push('npcs must be an array');
    } else {
        if (worldSpec.npcs.length > 20) {
            errors.push(`Too many NPCs: ${worldSpec.npcs.length} (max: 20)`);
        }

        worldSpec.npcs.forEach((npc, index) => {
            if (!npc.id) errors.push(`NPC ${index}: missing id`);
            if (!npc.name) errors.push(`NPC ${index}: missing name`);
            if (!npc.archetype) errors.push(`NPC ${index}: missing archetype`);
            if (typeof npc.x !== 'number') errors.push(`NPC ${index}: invalid x coordinate`);
            if (typeof npc.y !== 'number') errors.push(`NPC ${index}: invalid y coordinate`);

            // 座標範圍檢查
            if (npc.x < 0 || npc.x > 2000) {
                errors.push(`NPC ${index} (${npc.name}): x coordinate out of bounds (${npc.x})`);
            }
            if (npc.y < 0 || npc.y > 700) {
                errors.push(`NPC ${index} (${npc.name}): y coordinate out of bounds (${npc.y})`);
            }
        });
    }

    // 檢查 Buildings
    if (!Array.isArray(worldSpec.buildings)) {
        errors.push('buildings must be an array');
    } else {
        if (worldSpec.buildings.length > 10) {
            errors.push(`Too many buildings: ${worldSpec.buildings.length} (max: 10)`);
        }

        worldSpec.buildings.forEach((building, index) => {
            if (!building.id) errors.push(`Building ${index}: missing id`);
            if (!building.assetKey) errors.push(`Building ${index}: missing assetKey`);
            if (typeof building.x !== 'number') errors.push(`Building ${index}: invalid x coordinate`);
            if (typeof building.y !== 'number') errors.push(`Building ${index}: invalid y coordinate`);
        });
    }

    // 檢查 Items
    if (!Array.isArray(worldSpec.items)) {
        errors.push('items must be an array');
    } else {
        if (worldSpec.items.length > 30) {
            errors.push(`Too many items: ${worldSpec.items.length} (max: 30)`);
        }

        worldSpec.items.forEach((item, index) => {
            if (!item.id) errors.push(`Item ${index}: missing id`);
            if (!item.assetKey) errors.push(`Item ${index}: missing assetKey`);
            if (typeof item.x !== 'number') errors.push(`Item ${index}: invalid x coordinate`);
            if (typeof item.y !== 'number') errors.push(`Item ${index}: invalid y coordinate`);
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * 建立空的 WorldSpec
 * @param {string} destination - 目的地
 * @returns {WorldSpec}
 */
export function createEmptyWorldSpec(destination = 'generic') {
    return {
        theme: `${destination}_default`,
        backgroundKey: 'generic_sky',
        destination,
        timeOfDay: 'day',
        weather: 'clear',
        npcs: [],
        buildings: [],
        items: [],
        poi: [],
        metadata: {
            generatedAt: new Date().toISOString(),
            version: '1.0.0'
        }
    };
}

/**
 * 合併 WorldSpec（用於覆蓋部分屬性）
 * @param {WorldSpec} baseSpec - 基礎規格
 * @param {Partial<WorldSpec>} overrides - 覆蓋屬性
 * @returns {WorldSpec}
 */
export function mergeWorldSpec(baseSpec, overrides) {
    return {
        ...baseSpec,
        ...overrides,
        npcs: overrides.npcs || baseSpec.npcs,
        buildings: overrides.buildings || baseSpec.buildings,
        items: overrides.items || baseSpec.items,
        poi: overrides.poi || baseSpec.poi,
        metadata: {
            ...baseSpec.metadata,
            ...(overrides.metadata || {})
        }
    };
}

/**
 * 列印 WorldSpec 摘要（用於除錯）
 * @param {WorldSpec} worldSpec - 世界規格
 */
export function printWorldSpecSummary(worldSpec) {
    console.log('=== WorldSpec Summary ===');
    console.log(`Theme: ${worldSpec.theme}`);
    console.log(`Background: ${worldSpec.backgroundKey}`);
    console.log(`Destination: ${worldSpec.destination}`);
    console.log(`Time: ${worldSpec.timeOfDay}, Weather: ${worldSpec.weather}`);
    console.log(`NPCs: ${worldSpec.npcs.length}`);
    console.log(`Buildings: ${worldSpec.buildings.length}`);
    console.log(`Items: ${worldSpec.items.length}`);
    console.log(`POIs: ${worldSpec.poi ? worldSpec.poi.length : 0}`);
    if (worldSpec.metadata) {
        console.log(`Metadata:`, worldSpec.metadata);
    }
    console.log('=========================');
}

/**
 * 固定測試場景：testing-village
 * 保證可重現的 NPC / 物件 / 建築，用於任務閉環驗收
 */
export function getTestingVillageSpec() {
    return {
        theme: 'testing_village',
        backgroundKey: 'generic_sky',
        destination: 'testing_village',
        timeOfDay: 'day',
        weather: 'clear',
        npcs: [
            {
                id: 'npc_quest',
                name: 'Quest Giver',
                archetype: 'quest_giver',
                role: 'questgiver',
                x: 200,
                y: 500,
                personality: 'friendly',
                dialogue: ['Hello, I have a job for you.']
            },
            {
                id: 'npc_side',
                name: 'Helper NPC',
                archetype: 'villager_helper',
                role: 'villager',
                x: 400,
                y: 500,
                personality: 'curious',
                dialogue: ['I might know a clue...']
            }
        ],
        buildings: [
            {
                id: 'delivery_hub',
                name: 'Delivery Hub',
                assetKey: 'generic_building',
                x: 800,
                y: 400,
                width: 160,
                height: 200,
                type: 'hub'
            },
            {
                id: 'vehicle_portal',
                name: 'Vehicle Portal',
                assetKey: 'portal',
                x: 980,
                y: 380,
                width: 120,
                height: 180,
                type: 'portal'
            }
        ],
        items: [
            { id: 'mission_item', name: 'Mission Parcel', assetKey: 'package', x: 600, y: 500, type: 'package' },
            { id: 'bonus_item', name: 'Spare Parts', assetKey: 'gear', x: 650, y: 500, type: 'bonus' }
        ],
        poi: [],
        metadata: {
            generatedAt: new Date().toISOString(),
            version: 'testing-village'
        }
    };
}
