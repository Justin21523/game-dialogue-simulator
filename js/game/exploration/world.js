/**
 * ExplorationWorld - 探索世界容器
 * 管理所有實體、碰撞檢測、無限循環世界
 */

import { CONFIG } from '../../config.js';

export class ExplorationWorld {
    constructor(mission, options = {}) {
        // 任務資料
        this.mission = mission;
        this.destination = mission?.destination || 'generic';

        // 世界設定
        this.bounds = {
            left: options.left ?? 0,
            right: options.right ?? Infinity,
            top: options.top ?? 0,
            bottom: options.bottom ?? 600
        };

        // 無限循環設定
        this.isInfinite = options.isInfinite ?? true;
        this.segmentWidth = options.segmentWidth ?? 1920;
        this.groundY = options.groundY ?? 500;

        // 實體容器
        this.players = new Map();           // characterId -> PlayerCharacter
        this.npcs = new Map();              // npcId -> NPC
        this.items = new Map();             // itemId -> CollectibleItem
        this.buildings = new Map();         // buildingId -> BuildingEntrance
        this.blockers = new Map();          // blockerId -> AbilityBlocker
        this.interactables = new Map();     // interactableId -> Interactable

        // 空間分割 (Grid-based spatial hashing)
        this.spatialGrid = new SpatialGrid(128); // 128px 格子大小

        // 當前控制角色
        this.activePlayerId = null;

        // 互動範圍
        this.interactRange = options.interactRange ?? 80;

        // 事件系統
        this.eventListeners = new Map();

        // 從任務載入實體
        if (mission) {
            this.loadFromMission(mission);
        }
    }

    /**
     * 從任務載入世界實體
     * @param {Object} mission - 任務資料
     */
    loadFromMission(mission) {
        console.log('[ExplorationWorld] loadFromMission called with mission:', {
            hasNPCs: !!mission.npcs,
            npcCount: mission.npcs?.length || 0,
            npcsIsArray: Array.isArray(mission.npcs),
            hasItems: !!mission.items,
            itemCount: mission.items?.length || 0
        });

        // 載入 NPC
        if (mission.npcs && Array.isArray(mission.npcs)) {
            console.log(`[ExplorationWorld] Loading ${mission.npcs.length} NPCs...`);
            mission.npcs.forEach((npcData, index) => {
                console.log(`[ExplorationWorld] Adding NPC ${index+1}/${mission.npcs.length}:`, npcData.id, npcData.name);
                this.addNPC(npcData.id, npcData);
            });
        } else {
            console.warn('[ExplorationWorld] No NPCs to load! mission.npcs:', mission.npcs);
        }

        // 載入物品
        if (mission.items && Array.isArray(mission.items)) {
            mission.items.forEach(itemData => {
                this.addItem(itemData.id, itemData);
            });
        }

        // 載入建築
        if (mission.buildings && Array.isArray(mission.buildings)) {
            mission.buildings.forEach(buildingData => {
                this.addBuilding(buildingData.id, buildingData);
            });
        }

        // 載入能力障礙物
        if (mission.blockers && Array.isArray(mission.blockers)) {
            mission.blockers.forEach(blockerData => {
                this.addBlocker(blockerData.id, blockerData);
            });
        }

        console.log(`ExplorationWorld: Loaded ${this.npcs.size} NPCs, ${this.items.size} items, ${this.buildings.size} buildings`);
    }

    /**
     * 添加玩家角色
     * @param {string} characterId - 角色 ID
     * @param {PlayerCharacter} player - 玩家角色實例
     */
    addPlayer(characterId, player) {
        this.players.set(characterId, player);
        this.spatialGrid.insert(player);

        // 如果是第一個角色，設為活躍
        if (this.activePlayerId === null) {
            this.activePlayerId = characterId;
        }

        this.emit('playerAdded', { characterId, player });
    }

    /**
     * 移除玩家角色
     * @param {string} characterId - 角色 ID
     */
    removePlayer(characterId) {
        const player = this.players.get(characterId);
        if (player) {
            this.spatialGrid.remove(player);
            this.players.delete(characterId);
            this.emit('playerRemoved', { characterId, player });
        }
    }

    /**
     * 取得活躍玩家
     * @returns {PlayerCharacter|null}
     */
    getActivePlayer() {
        return this.players.get(this.activePlayerId) || null;
    }

    /**
     * 切換控制角色
     * @param {string} characterId - 角色 ID
     * @returns {boolean} - 是否成功切換
     */
    switchActivePlayer(characterId) {
        if (!this.players.has(characterId)) {
            return false;
        }

        const oldActive = this.getActivePlayer();
        if (oldActive) {
            oldActive.setAIControlled(true);
        }

        this.activePlayerId = characterId;
        const newActive = this.getActivePlayer();
        if (newActive) {
            newActive.setAIControlled(false);
        }

        this.emit('playerSwitched', {
            oldId: oldActive?.characterId,
            newId: characterId,
            player: newActive
        });

        return true;
    }

    /**
     * 添加 NPC
     * @param {string} npcId - NPC ID
     * @param {Object} data - NPC 資料
     */
    addNPC(npcId, data) {
        // NPC 類別稍後實作，先用物件暫存
        const npc = {
            ...data,  // 先展開 data
            id: npcId,  // 然後覆蓋關鍵屬性
            type: 'npc',  // 強制設置 type
            x: data.x ?? Math.random() * this.segmentWidth,
            y: data.y ?? this.groundY - 100,
            width: data.width ?? 80,
            height: data.height ?? 100,
            canInteract: () => !data.resolved,
            isVisible: true  // 強制設置為可見
        };

        console.log('[World] addNPC - Created NPC:', npc.id, 'type:', npc.type, 'isVisible:', npc.isVisible);

        this.npcs.set(npcId, npc);
        this.spatialGrid.insert(npc);
        this.interactables.set(npcId, npc);

        // 驗證 NPC 確實被加入
        const verifyNpc = this.npcs.get(npcId);
        console.log('[World] addNPC - Verify stored NPC:', verifyNpc?.id, 'isVisible:', verifyNpc?.isVisible);
    }

    /**
     * 添加可撿取物品
     * @param {string} itemId - 物品 ID
     * @param {Object} data - 物品資料
     */
    addItem(itemId, data) {
        const item = {
            id: itemId,
            ...data,
            type: 'item',
            x: data.x ?? Math.random() * this.segmentWidth,
            y: data.y ?? this.groundY - 50,
            width: data.width ?? 40,
            height: data.height ?? 40,
            collected: false,
            requiredAbility: data.requiredAbility || null,
            canInteract: (player) => {
                if (item.collected) return false;
                if (item.requiredAbility && !player.hasAbility(item.requiredAbility)) {
                    return false;
                }
                return true;
            },
            isVisible: true
        };
        this.items.set(itemId, item);
        this.spatialGrid.insert(item);
        this.interactables.set(itemId, item);
    }

    /**
     * 添加建築入口
     * @param {string} buildingId - 建築 ID
     * @param {Object} data - 建築資料
     */
    addBuilding(buildingId, data) {
        const building = {
            ...data,  // 先展開 data
            id: buildingId,  // 然後覆蓋關鍵屬性
            type: 'building',  // 強制設置 type
            x: data.x ?? Math.random() * this.segmentWidth,
            y: data.y ?? this.groundY - 150,
            width: data.width ?? 150,
            height: data.height ?? 150,
            entranceX: data.entranceX ?? (data.x + 75),
            canInteract: () => true,
            isVisible: true  // 強制設置為可見
        };

        console.log('[World] addBuilding - Created:', building.id, 'type:', building.type, 'isVisible:', building.isVisible);

        this.buildings.set(buildingId, building);
        this.spatialGrid.insert(building);
        this.interactables.set(buildingId, building);
    }

    /**
     * 添加能力障礙物
     * @param {string} blockerId - 障礙物 ID
     * @param {Object} data - 障礙物資料
     */
    addBlocker(blockerId, data) {
        const blocker = {
            ...data,  // 先展開 data
            id: blockerId,  // 然後覆蓋關鍵屬性
            type: 'blocker',  // 強制設置 type
            x: data.x ?? 0,
            y: data.y ?? this.groundY - 50,
            width: data.width ?? 100,
            height: data.height ?? 50,
            requiredAbility: data.requiredAbility,
            isResolved: false,
            canInteract: (player) => {
                if (blocker.isResolved) return false;
                return player.hasAbility(blocker.requiredAbility);
            },
            isVisible: true  // 強制設置為可見
        };

        console.log('[World] addBlocker - Created:', blocker.id, 'type:', blocker.type, 'isVisible:', blocker.isVisible);

        this.blockers.set(blockerId, blocker);
        this.spatialGrid.insert(blocker);
        this.interactables.set(blockerId, blocker);
    }

    /**
     * 移除物品
     * @param {string} itemId - 物品 ID
     */
    removeItem(itemId) {
        const item = this.items.get(itemId);
        if (item) {
            this.spatialGrid.remove(item);
            this.items.delete(itemId);
            this.interactables.delete(itemId);
            this.emit('itemRemoved', { itemId, item });
        }
    }

    /**
     * 更新世界
     * @param {number} dt - 時間差
     */
    update(dt) {
        // 更新空間網格中所有實體的位置
        for (const player of this.players.values()) {
            this.spatialGrid.update(player);
        }

        // 處理無限循環位置包裝
        if (this.isInfinite) {
            for (const player of this.players.values()) {
                player.x = this.wrapPosition(player.x);
            }
        }
    }

    /**
     * 無限循環位置包裝
     * @param {number} x - X 座標
     * @returns {number} - 包裝後的 X 座標
     */
    wrapPosition(x) {
        return ((x % this.segmentWidth) + this.segmentWidth) % this.segmentWidth;
    }

    /**
     * 計算兩點間的循環距離
     * @param {number} x1 - 第一點 X
     * @param {number} x2 - 第二點 X
     * @returns {number} - 最短距離
     */
    getWrappedDistance(x1, x2) {
        if (!this.isInfinite) {
            return Math.abs(x2 - x1);
        }

        const direct = Math.abs(x2 - x1);
        const wrapped = this.segmentWidth - direct;
        return Math.min(direct, wrapped);
    }

    /**
     * 找出最近的可互動物件
     * @param {PlayerCharacter} player - 玩家角色
     * @returns {Object|null} - 最近的可互動物件
     */
    findNearestInteractable(player) {
        let nearest = null;
        let nearestDist = this.interactRange;

        for (const entity of this.interactables.values()) {
            if (!entity.isVisible) continue;
            if (entity.canInteract && !entity.canInteract(player)) continue;

            const dist = this.getDistanceToEntity(player, entity);
            if (dist < nearestDist) {
                nearest = entity;
                nearestDist = dist;
            }
        }

        return nearest;
    }

    /**
     * 計算玩家與實體的距離
     * @param {PlayerCharacter} player - 玩家
     * @param {Object} entity - 實體
     * @returns {number} - 距離
     */
    getDistanceToEntity(player, entity) {
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const ex = entity.x + (entity.width || 0) / 2;
        const ey = entity.y + (entity.height || 0) / 2;

        const dx = this.isInfinite ? this.getWrappedDistance(px, ex) : Math.abs(px - ex);
        const dy = Math.abs(py - ey);

        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 取得指定區域內的所有實體
     * @param {number} x - 中心 X
     * @param {number} y - 中心 Y
     * @param {number} radius - 半徑
     * @returns {Array} - 實體列表
     */
    getEntitiesInRadius(x, y, radius) {
        return this.spatialGrid.queryRadius(x, y, radius);
    }

    /**
     * 取得所有可見實體
     * @returns {Array}
     */
    getAllVisibleEntities() {
        const entities = [];

        // 🐛 Debug: Log what we're checking (only log once every 60 calls)
        if (!this._getAllVisibleCallCount) this._getAllVisibleCallCount = 0;
        this._getAllVisibleCallCount++;

        if (this._getAllVisibleCallCount % 60 === 0) {
            console.log('[World] getAllVisibleEntities check #', this._getAllVisibleCallCount);
            console.log('[World] - Players map size:', this.players.size);
            console.log('[World] - NPCs map size:', this.npcs.size);
            console.log('[World] - Items map size:', this.items.size);
            console.log('[World] - Buildings map size:', this.buildings.size);
            console.log('[World] - Blockers map size:', this.blockers.size);
        }

        for (const player of this.players.values()) {
            if (this._getAllVisibleCallCount % 60 === 0) {
                console.log('[World] Player:', player.characterId, 'isVisible:', player.isVisible);
            }
            if (player.isVisible) entities.push(player);
        }

        for (const npc of this.npcs.values()) {
            if (this._getAllVisibleCallCount % 60 === 0) {
                console.log('[World] NPC:', npc.id, 'isVisible:', npc.isVisible);
            }
            if (npc.isVisible) {
                entities.push(npc);
            }
        }

        for (const item of this.items.values()) {
            if (this._getAllVisibleCallCount % 60 === 0) {
                console.log('[World] Item:', item.id, 'isVisible:', item.isVisible, 'collected:', item.collected);
            }
            if (item.isVisible && !item.collected) entities.push(item);
        }

        for (const building of this.buildings.values()) {
            if (this._getAllVisibleCallCount % 60 === 0) {
                console.log('[World] Building:', building.id, 'isVisible:', building.isVisible);
            }
            if (building.isVisible) entities.push(building);
        }

        for (const blocker of this.blockers.values()) {
            if (this._getAllVisibleCallCount % 60 === 0) {
                console.log('[World] Blocker:', blocker.id, 'isVisible:', blocker.isVisible, 'isResolved:', blocker.isResolved);
            }
            if (blocker.isVisible && !blocker.isResolved) entities.push(blocker);
        }

        if (this._getAllVisibleCallCount % 60 === 0) {
            console.log('[World] → Returning', entities.length, 'visible entities');
        }

        return entities;
    }

    /**
     * 事件系統 - 監聽
     * @param {string} event - 事件名稱
     * @param {Function} callback - 回調函數
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * 事件系統 - 觸發
     * @param {string} event - 事件名稱
     * @param {Object} data - 事件資料
     */
    emit(event, data) {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => callback(data));
    }

    /**
     * 事件系統 - 移除監聽
     * @param {string} event - 事件名稱
     * @param {Function} callback - 回調函數
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event) || [];
        const index = listeners.indexOf(callback);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }

    /**
     * 取得世界狀態 (用於存檔)
     * @returns {Object}
     */
    getState() {
        return {
            destination: this.destination,
            activePlayerId: this.activePlayerId,
            players: Array.from(this.players.entries()).map(([id, p]) => ({
                id,
                state: p.getState ? p.getState() : { x: p.x, y: p.y }
            })),
            collectedItems: Array.from(this.items.entries())
                .filter(([_, item]) => item.collected)
                .map(([id]) => id),
            resolvedBlockers: Array.from(this.blockers.entries())
                .filter(([_, b]) => b.isResolved)
                .map(([id]) => id)
        };
    }

    /**
     * 從狀態恢復
     * @param {Object} state - 儲存的狀態
     */
    loadState(state) {
        if (state.activePlayerId) {
            this.activePlayerId = state.activePlayerId;
        }

        if (state.collectedItems) {
            state.collectedItems.forEach(itemId => {
                const item = this.items.get(itemId);
                if (item) item.collected = true;
            });
        }

        if (state.resolvedBlockers) {
            state.resolvedBlockers.forEach(blockerId => {
                const blocker = this.blockers.get(blockerId);
                if (blocker) blocker.isResolved = true;
            });
        }
    }

    /**
     * 銷毀世界
     */
    dispose() {
        this.players.clear();
        this.npcs.clear();
        this.items.clear();
        this.buildings.clear();
        this.blockers.clear();
        this.interactables.clear();
        this.spatialGrid.clear();
        this.eventListeners.clear();
    }
}

/**
 * SpatialGrid - 空間分割網格
 * 用於高效的碰撞查詢
 */
class SpatialGrid {
    constructor(cellSize = 128) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    /**
     * 取得實體所在的格子座標
     * @param {Object} entity - 實體
     * @returns {string} - 格子 key
     */
    getKey(entity) {
        const cx = Math.floor(entity.x / this.cellSize);
        const cy = Math.floor(entity.y / this.cellSize);
        return `${cx},${cy}`;
    }

    /**
     * 插入實體
     * @param {Object} entity - 實體
     */
    insert(entity) {
        const key = this.getKey(entity);
        if (!this.cells.has(key)) {
            this.cells.set(key, new Set());
        }
        this.cells.get(key).add(entity);
        entity._gridKey = key;
    }

    /**
     * 移除實體
     * @param {Object} entity - 實體
     */
    remove(entity) {
        if (entity._gridKey && this.cells.has(entity._gridKey)) {
            this.cells.get(entity._gridKey).delete(entity);
        }
    }

    /**
     * 更新實體位置
     * @param {Object} entity - 實體
     */
    update(entity) {
        const newKey = this.getKey(entity);
        if (newKey !== entity._gridKey) {
            this.remove(entity);
            this.insert(entity);
        }
    }

    /**
     * 查詢指定半徑內的實體
     * @param {number} x - 中心 X
     * @param {number} y - 中心 Y
     * @param {number} radius - 半徑
     * @returns {Array} - 實體列表
     */
    queryRadius(x, y, radius) {
        const results = [];
        const cellRadius = Math.ceil(radius / this.cellSize);

        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);

        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dy = -cellRadius; dy <= cellRadius; dy++) {
                const key = `${cx + dx},${cy + dy}`;
                const cell = this.cells.get(key);
                if (cell) {
                    for (const entity of cell) {
                        const dist = Math.sqrt(
                            Math.pow(entity.x - x, 2) +
                            Math.pow(entity.y - y, 2)
                        );
                        if (dist <= radius) {
                            results.push(entity);
                        }
                    }
                }
            }
        }

        return results;
    }

    /**
     * 清空網格
     */
    clear() {
        this.cells.clear();
    }
}
