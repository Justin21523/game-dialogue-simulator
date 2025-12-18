/**
 * ExplorationEngine - 2D 橫向捲軸探索引擎
 * 整合物理、攝影機、輸入、渲染等子系統
 */
import { ExplorationPhysics } from './exploration-physics.js';
import { Camera } from './camera.js';
import { InputHandlerExploration } from './input-handler-exploration.js';
import { PlayerCharacter } from '../entities/player-character.js';
import { ParallaxBackground, SCENE_PRESETS } from '../parallax-background.js';
import { audioManager } from '../../core/audio-manager.js';
import { gameState } from '../../core/game-state.js';
import { CONFIG } from '../../config.js';
import { getTestingVillageSpec } from './world-spec.js';
import { missionManager } from '../../managers/mission-manager.js';
import { Quest, ObjectiveType, QuestStatus } from '../../models/quest.js';

export class ExplorationEngine {
    constructor(canvas, mission, characterId, options = {}) {
        // Canvas 設定
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;

        // 任務資訊
        this.mission = mission;
        this.destination = mission?.location || 'paris';

        // 初始化子系統
        this.physics = new ExplorationPhysics({
            gravity: 1200,
            groundY: this.height - 100,
            friction: 0.85
        });

        this.camera = new Camera(this.width, this.height, {
            isInfinite: true,
            segmentWidth: 1920,
            smoothing: 0.08,
            followOffsetX: -this.width / 3,
            followOffsetY: -this.height / 2 + 50
        });

        this.input = new InputHandlerExploration();

        // 背景系統
        this.background = new ParallaxBackground(this.width, this.height);
        this.bgReady = false;

        // 實體容器
        this.players = new Map();      // 所有場上角色
        this.npcs = new Map();         // NPC
        this.items = new Map();        // 物品
        this.buildings = new Map();    // 建築物
        this.blockers = new Map();     // 能力障礙物

        // 當前玩家
        this.currentPlayer = null;
        this.currentPlayerId = characterId;

        // 遊戲狀態
        this.isRunning = false;
        this.isPaused = false;
        this.lastTime = 0;

        // 回調
        this.onComplete = options.onComplete || null;
        this.onPause = options.onPause || null;

        // 除錯模式
        this.debugMode = options.debug || false;

        // 作為 world 供 InteractionSystem 使用
        this.world = this;

        // world-level state for collected items
        this.collectedItems = new Set();

        // 初始化
        this._init(characterId);
    }

    /**
     * 初始化引擎
     */
    async _init(characterId) {
        await missionManager.initialize({ mainCharacter: characterId || 'jett' });

        // 載入背景
        await this._loadBackground();

        // 創建主角
        await this._createMainCharacter(characterId);

        // 設定輸入回調
        this._setupInputCallbacks();

        // 從任務載入實體
        if (this.mission) {
            this._loadMissionEntities();
        } else {
            // 沒任務時載入固定 testing-village 以便驗收
            this._loadTestingVillage();
            this._ensureTestingVillageQuest();
        }
    }

    /**
     * 載入目的地背景
     */
    async _loadBackground() {
        try {
            await this.background.loadDestinationScene(this.destination);
            this.bgReady = true;
        } catch (err) {
            console.warn('Failed to load destination background:', err);
            // 使用預設飛行場景
            await this.background.loadFlightScene('clear');
            this.bgReady = true;
        }
    }

    /**
     * 創建主角
     */
    async _createMainCharacter(characterId) {
        const charData = CONFIG.CHARACTERS[characterId];
        if (!charData) {
            console.error(`Character not found: ${characterId}`);
            return;
        }

        const player = new PlayerCharacter(characterId, charData, {
            x: 200,
            y: this.physics.groundY - 120,
            width: 120,
            height: 120
        });

        this.players.set(characterId, player);
        this.currentPlayer = player;
        this.currentPlayerId = characterId;

        // 攝影機跟隨主角
        this.camera.follow(player);
    }

    /**
     * 設定輸入回調
     */
    _setupInputCallbacks() {
        // 互動
        this.input.setInteractCallback(() => {
            this._handleInteraction();
        });

        // 能力
        this.input.setAbilityCallbacks(
            () => this._useAbility(0),
            () => this._useAbility(1)
        );

        // 夥伴選單
        this.input.setPartnerMenuCallback(() => {
            this._openPartnerMenu();
        });

        // 角色切換
        this.input.setCharacterSwitchCallback((index) => {
            this._switchToCharacter(index);
        });
    }

    /**
     * 從任務載入實體
     */
    _loadMissionEntities() {
        // 載入 NPC
        if (this.mission.npcs) {
            for (const npcData of this.mission.npcs) {
                // TODO: 創建 NPC 實體
                // this.npcs.set(npcData.id, new NPC(npcData));
            }
        }

        // 載入物品
        if (this.mission.items) {
            for (const itemData of this.mission.items) {
                // TODO: 創建物品實體
                // this.items.set(itemData.id, new CollectibleItem(itemData));
            }
        }

        // 載入建築物
        if (this.mission.buildings) {
            for (const buildingData of this.mission.buildings) {
                // TODO: 創建建築入口
            }
        }
    }

    /**
     * 固定測試場景：testing-village
     */
    _loadTestingVillage() {
        const spec = getTestingVillageSpec();
        this.destination = spec.destination || 'testing_village';

        // 背景用 preset
        this.background.loadDestinationScene(this.destination).catch(() => {});

        // NPC
        spec.npcs.forEach((npc) => {
            const entity = {
                npcId: npc.id,
                name: npc.name,
                x: npc.x,
                y: npc.y,
                width: 60,
                height: 120,
                entityType: 'npc',
                type: npc.role,
                dialogue: npc.dialogue || [`Hi, I'm ${npc.name}`],
                canInteract() { return true; },
                startInteraction() { return npc.dialogue || [`Hi, I'm ${npc.name}`]; }
            };
            this.npcs.set(npc.id, entity);
        });

        // Items
        spec.items.forEach((item) => {
            const entity = {
                itemId: item.id,
                name: item.name,
                type: item.type,
                x: item.x,
                y: item.y,
                width: 40,
                height: 40,
                entityType: 'item',
                isCollected: false,
                pickup: (player) => {
                    if (entity.isCollected) return { success: false, reason: '已被撿走' };
                    entity.isCollected = true;
                    return { success: true, item: { id: item.id, type: item.type, name: item.name } };
                }
            };
            this.items.set(item.id, entity);
        });

        // Buildings
        spec.buildings.forEach((b) => {
            const entity = {
                buildingId: b.id,
                name: b.name,
                x: b.x,
                y: b.y,
                width: b.width || 160,
                height: b.height || 200,
                entityType: 'building',
                entrance: { x: b.x, y: b.y, width: b.width || 160, height: b.height || 200 },
                type: b.type
            };
            this.buildings.set(b.id, entity);
        });

        console.log('[ExplorationEngine] Testing village loaded with entities:', {
            npcs: this.npcs.size,
            items: this.items.size,
            buildings: this.buildings.size
        });

        // 收集紀錄（用於交付判斷）
        this.collectedItems = new Set();
    }

    /**
     * Create and offer the fixed test quest (talk -> collect -> deliver)
     */
    _ensureTestingVillageQuest() {
        const existing = missionManager.getQuest('testing_main');
        if (existing) return;

        const quest = new Quest({
            questId: 'testing_main',
            title: 'Help the Quest Giver',
            description: 'Talk to the quest giver, pick up the parcel, and return it.',
            type: 'main',
            relatedNPCs: ['npc_quest'],
            questGiverNPC: 'npc_quest',
            status: QuestStatus.PENDING,
            objectives: [
                {
                    id: 'obj_talk',
                    type: ObjectiveType.TALK,
                    title: 'Talk to Quest Giver',
                    description: 'Introduce yourself to the quest giver.',
                    requiredCount: 1,
                    conditions: [{ npc_id: 'npc_quest' }]
                },
                {
                    id: 'obj_partner_collect',
                    type: ObjectiveType.COLLECT,
                    title: 'Have Dizzy pick up the spare parts',
                    description: 'Switch to Dizzy and collect the spare parts.',
                    requiredCount: 1,
                    conditions: [{ item_id: 'bonus_item' }],
                    assignedCharacter: 'dizzy'
                },
                {
                    id: 'obj_collect',
                    type: ObjectiveType.COLLECT,
                    title: 'Pick up the parcel',
                    description: 'Find and pick up the mission parcel.',
                    requiredCount: 1,
                    conditions: [{ item_id: 'mission_item' }]
                },
                {
                    id: 'obj_deliver',
                    type: ObjectiveType.DELIVER,
                    title: 'Deliver the parcel',
                    description: 'Return the parcel to the quest giver or the delivery hub.',
                    requiredCount: 1,
                    conditions: [{ item_id: 'mission_item', npc_id: 'npc_quest' }]
                }
            ],
            rewards: { money: 100, exp: 50 }
        });

        missionManager.offerQuest(quest, { type: 'main' });
    }

    /**
     * 開始遊戲
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastTime = performance.now();

        // 開始遊戲迴圈
        requestAnimationFrame(this._gameLoop.bind(this));

        console.log('ExplorationEngine started');
    }

    /**
     * 暫停遊戲
     */
    pause() {
        this.isPaused = true;
        if (this.onPause) this.onPause();
    }

    /**
     * 繼續遊戲
     */
    resume() {
        this.isPaused = false;
        this.lastTime = performance.now();
    }

    /**
     * 停止遊戲
     */
    stop() {
        this.isRunning = false;
        this.input.destroy();
    }

    /**
     * 主遊戲迴圈
     */
    _gameLoop(timestamp) {
        if (!this.isRunning) return;

        // 計算時間差
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
        this.lastTime = timestamp;

        if (!this.isPaused) {
            this._update(dt);
        }

        this._render();

        // 繼續迴圈
        requestAnimationFrame(this._gameLoop.bind(this));
    }

    /**
     * 更新遊戲狀態
     */
    _update(dt) {
        // 更新輸入
        this.input.update(dt);

        // 更新玩家
        if (this.currentPlayer && !this.currentPlayer.isAIControlled) {
            this.currentPlayer.handleInput(this.input.getSnapshot());
        }

        // 更新所有角色
        for (const player of this.players.values()) {
            player.update(dt);
            this.physics.update(player, dt);
        }

        // 更新 NPC
        for (const npc of this.npcs.values()) {
            npc.update(dt);
        }

        // 更新攝影機
        this.camera.update(dt);

        // 更新背景
        if (this.bgReady) {
            // 根據玩家移動更新背景滾動
            const scrollSpeed = this.currentPlayer?.vx || 0;
            this.background.update(dt, scrollSpeed * 0.5);
        }

        // 檢查互動
        this._updateInteraction();

        // 檢查任務完成
        this._checkMissionCompletion();
    }

    /**
     * 渲染遊戲畫面
     */
    _render() {
        // 清除畫布
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 套用攝影機變換
        this.ctx.save();

        // 繪製背景
        if (this.bgReady) {
            this.background.draw(this.ctx);
        } else {
            // 備用背景
            const grad = this.ctx.createLinearGradient(0, 0, 0, this.height);
            grad.addColorStop(0, '#87CEEB');
            grad.addColorStop(1, '#E0F0FF');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        // 繪製地面
        this._drawGround();

        // 繪製建築物
        for (const building of this.buildings.values()) {
            building.draw(this.ctx, this.camera);
        }

        // 繪製物品
        for (const item of this.items.values()) {
            item.draw(this.ctx, this.camera);
        }

        // 繪製 NPC
        for (const npc of this.npcs.values()) {
            npc.draw(this.ctx, this.camera);
        }

        // 繪製玩家角色
        for (const player of this.players.values()) {
            player.draw(this.ctx, this.camera);
        }

        // 繪製互動提示
        this._drawInteractionPrompt();

        this.ctx.restore();

        // 繪製 HUD (不受攝影機影響)
        this._drawHUD();

        // 除錯資訊
        if (this.debugMode) {
            this._drawDebugInfo();
        }
    }

    /**
     * 繪製地面
     */
    _drawGround() {
        const groundY = this.physics.groundY;

        // 地面
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(0, groundY, this.width, this.height - groundY);

        // 草地
        this.ctx.fillStyle = '#228B22';
        this.ctx.fillRect(0, groundY, this.width, 10);
    }

    /**
     * 繪製互動提示
     */
    _drawInteractionPrompt() {
        const target = this.currentPlayer?.nearbyInteractable;
        if (!target) return;

        const screenX = this.camera.getRelativeX(target.x);
        const screenY = target.y - this.camera.y - 40;

        // 提示框
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(screenX, screenY, target.width, 30);

        // 提示文字
        this.ctx.fillStyle = '#FFFF00';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('按 E 互動', screenX + target.width / 2, screenY + 20);
    }

    /**
     * 繪製 HUD
     */
    _drawHUD() {
        // 任務追蹤 (左上角)
        this._drawMissionTracker();

        // 物品欄 (底部)
        this._drawInventoryBar();

        // 角色切換 (右下角)
        this._drawPartnerSwitcher();
    }

    /**
     * 繪製任務追蹤
     */
    _drawMissionTracker() {
        const x = 20;
        let y = 20;

        // 標題
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x - 10, y - 5, 280, 30);

        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`任務: ${this.mission?.title || '探索區域'}`, x, y + 15);

        // 子任務列表
        y += 40;
        if (this.mission?.subTasks) {
            for (const task of this.mission.subTasks) {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(x - 10, y - 5, 260, 25);

                this.ctx.fillStyle = task.isCompleted ? '#4CAF50' : 'white';
                this.ctx.font = '14px Arial';
                const prefix = task.isCompleted ? '✓ ' : '○ ';
                this.ctx.fillText(prefix + task.description, x, y + 12);

                y += 30;
            }
        }
    }

    /**
     * 繪製物品欄
     */
    _drawInventoryBar() {
        const slotSize = 48;
        const padding = 4;
        const slots = 10;
        const barWidth = (slotSize + padding) * slots + padding;
        const x = (this.width - barWidth) / 2;
        const y = this.height - slotSize - padding - 10;

        // 背景
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x, y, barWidth, slotSize + padding * 2);

        // 格子
        for (let i = 0; i < slots; i++) {
            const slotX = x + padding + i * (slotSize + padding);
            const slotY = y + padding;

            // 格子背景
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.fillRect(slotX, slotY, slotSize, slotSize);

            // 物品
            const item = this.currentPlayer?.inventory[i];
            if (item) {
                // TODO: 繪製物品圖示
                this.ctx.fillStyle = '#FFD700';
                this.ctx.fillRect(slotX + 4, slotY + 4, slotSize - 8, slotSize - 8);
            }

            // 快捷鍵數字
            this.ctx.fillStyle = 'white';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(String((i + 1) % 10), slotX + slotSize / 2, slotY + slotSize - 4);
        }
    }

    /**
     * 繪製角色切換器
     */
    _drawPartnerSwitcher() {
        const size = 50;
        const padding = 5;
        const x = this.width - size - 20;
        let y = this.height - 200;

        for (const [charId, player] of this.players) {
            const isActive = charId === this.currentPlayerId;

            // 背景
            this.ctx.fillStyle = isActive ? 'rgba(255, 215, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(x, y, size, size);

            // 角色顏色
            this.ctx.fillStyle = player.color;
            this.ctx.fillRect(x + 5, y + 5, size - 10, size - 10);

            // 名稱
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.name.charAt(0), x + size / 2, y + size / 2 + 4);

            y += size + padding;
        }
    }

    /**
     * 繪製除錯資訊
     */
    _drawDebugInfo() {
        const x = this.width - 200;
        let y = 20;
        const lineHeight = 18;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x - 10, y - 5, 190, 120);

        this.ctx.fillStyle = '#00FF00';
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'left';

        const player = this.currentPlayer;
        if (player) {
            this.ctx.fillText(`Pos: ${Math.round(player.x)}, ${Math.round(player.y)}`, x, y);
            y += lineHeight;
            this.ctx.fillText(`Vel: ${Math.round(player.vx)}, ${Math.round(player.vy)}`, x, y);
            y += lineHeight;
            this.ctx.fillText(`Mode: ${player.mode}`, x, y);
            y += lineHeight;
            this.ctx.fillText(`Grounded: ${player.isGrounded}`, x, y);
            y += lineHeight;
            this.ctx.fillText(`Flying: ${player.isFlying}`, x, y);
            y += lineHeight;
            this.ctx.fillText(`Camera: ${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`, x, y);
        }
    }

    /**
     * 更新互動檢測
     */
    _updateInteraction() {
        if (!this.currentPlayer) return;

        const player = this.currentPlayer;
        let nearest = null;
        let nearestDist = 100; // 互動範圍

        // 檢查 NPC
        for (const npc of this.npcs.values()) {
            const dist = player.distanceTo(npc);
            if (dist < nearestDist) {
                nearest = npc;
                nearestDist = dist;
            }
        }

        // 檢查物品
        for (const item of this.items.values()) {
            const dist = player.distanceTo(item);
            if (dist < nearestDist) {
                nearest = item;
                nearestDist = dist;
            }
        }

        // 檢查建築
        for (const building of this.buildings.values()) {
            const dist = player.distanceTo(building);
            if (dist < nearestDist) {
                nearest = building;
                nearestDist = dist;
            }
        }

        player.nearbyInteractable = nearest;
    }

    /**
     * 處理互動
     */
    _handleInteraction() {
        const target = this.currentPlayer?.nearbyInteractable;
        if (!target) return;

        console.log('Interacting with:', target);

        // TODO: 根據目標類型執行互動
        // if (target instanceof NPC) { ... }
        // if (target instanceof CollectibleItem) { ... }
        // if (target instanceof Building) { ... }
    }

    /**
     * 使用能力
     */
    _useAbility(index) {
        if (!this.currentPlayer) return;

        const abilities = this.currentPlayer.abilities;
        if (index >= abilities.length) return;

        const ability = abilities[index];
        console.log('Using ability:', ability?.name);

        // TODO: 執行能力效果
    }

    /**
     * 開啟夥伴選單
     */
    _openPartnerMenu() {
        console.log('Opening partner menu');
        // TODO: 顯示夥伴選擇 UI
    }

    /**
     * 切換到指定角色
     */
    _switchToCharacter(index) {
        const characterIds = Array.from(this.players.keys());
        if (index >= characterIds.length) return;

        const targetId = characterIds[index];
        if (targetId === this.currentPlayerId) return;

        const target = this.players.get(targetId);
        if (!target) return;

        // 舊角色變 AI 控制
        if (this.currentPlayer) {
            this.currentPlayer.setAIControlled(true);
        }

        // 切換到新角色
        target.setAIControlled(false);
        this.currentPlayer = target;
        this.currentPlayerId = targetId;

        // 攝影機跟隨
        this.camera.follow(target);

        console.log('Switched to character:', targetId);
    }

    /**
     * 呼叫夥伴
     */
    async callPartner(characterId) {
        if (this.players.has(characterId)) {
            console.log('Partner already in scene');
            return false;
        }

        const charData = CONFIG.CHARACTERS[characterId];
        if (!charData) return false;

        // 創建夥伴角色
        const partner = new PlayerCharacter(characterId, charData, {
            x: this.currentPlayer.x + 200,
            y: 0, // 從天空降落
            width: 120,
            height: 120
        });

        partner.setAIControlled(true);
        this.players.set(characterId, partner);

        // TODO: 播放入場動畫

        console.log('Partner called:', characterId);
        return true;
    }

    /**
     * 檢查任務完成
     */
    _checkMissionCompletion() {
        if (!this.mission) return;

        // 檢查所有子任務
        const allCompleted = this.mission.subTasks?.every(t => t.isCompleted) ?? false;

        if (allCompleted && this.onComplete) {
            this.onComplete({
                mission: this.mission,
                score: this._calculateScore()
            });
        }
    }

    /**
     * 計算分數
     */
    _calculateScore() {
        let score = 0;

        // 完成的子任務
        if (this.mission?.subTasks) {
            score += this.mission.subTasks.filter(t => t.isCompleted).length * 100;
        }

        // 收集的物品
        if (this.currentPlayer) {
            score += this.currentPlayer.inventory.length * 50;
        }

        return score;
    }

    /**
     * 調整 Canvas 大小
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;

        this.camera.viewWidth = width;
        this.camera.viewHeight = height;

        if (this.background) {
            this.background.resize(width, height);
        }

        // 更新地面高度
        this.physics.setGroundY(height - 100);
    }
}
