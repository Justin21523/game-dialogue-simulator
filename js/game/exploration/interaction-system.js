/**
 * InteractionSystem - 互動系統管理器
 * 統一處理 NPC 對話、物品撿取、建築進入等互動
 */

import { eventBus } from '../../core/event-bus.js';
import { missionManager } from '../../managers/mission-manager.js';

export class InteractionSystem {
    constructor(world, options = {}) {
        this.world = world;

        // 互動範圍
        this.interactRange = options.interactRange ?? 80;

        // ✅ 添加 partnerSystem 引用（用於多角色互動檢測）
        this.partnerSystem = options.partnerSystem || null;

        // 當前互動目標
        this.currentTarget = null;
        this.highlightedTargets = [];

        // 互動狀態
        this.isInteracting = false;
        this.interactionCooldown = 0;
        this.cooldownTime = 200;  // 200ms 冷卻

        // 玩家參考
        this.player = null;

        // 互動提示
        this.interactionKey = 'E';
        this.showHint = true;

        // 互動歷史
        this.interactionHistory = [];
        this.maxHistorySize = 50;

        // 事件監聽
        this.setupEventListeners();
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        eventBus.on('INTERACTION_COMPLETE', (data) => {
            this.onInteractionComplete(data);
        });

        eventBus.on('DIALOGUE_END', () => {
            this.isInteracting = false;
        });

        eventBus.on('BUILDING_EXIT', () => {
            this.isInteracting = false;
        });
    }

    /**
     * 設定當前玩家
     * @param {PlayerCharacter} player - 玩家角色
     */
    setPlayer(player) {
        this.player = player;
    }

    /**
     * 更新互動系統
     * @param {number} dt - 時間差（秒）
     */
    update(dt) {
        if (!this.player) return;

        // 更新冷卻
        if (this.interactionCooldown > 0) {
            this.interactionCooldown -= dt * 1000;
        }

        // 如果正在互動中，不更新目標
        if (this.isInteracting) return;

        // 尋找最近的可互動目標
        this.findInteractableTargets();
    }

    /**
     * 尋找可互動目標 (Stage 4: Check ALL active partners, not just main player)
     */
    findInteractableTargets() {
        this.highlightedTargets = [];
        let nearest = null;
        let nearestDist = this.interactRange;
        let nearestPlayer = null;

        // ===== Stage 4: Iterate through ALL active partners =====
        const allPartners = this.partnerSystem?.getActivePartners() || new Map([[this.player.characterId, this.player]]);

        for (const [id, partner] of allPartners) {
            const playerCenterX = partner.x + partner.width / 2;
            const playerCenterY = partner.y + partner.height / 2;

            // 檢查 NPC
            for (const npc of this.world.npcs.values()) {
                const dist = this.getDistance(playerCenterX, playerCenterY, npc);
                if (dist < this.interactRange) {
                    if (!this.highlightedTargets.includes(npc)) {
                        this.highlightedTargets.push(npc);
                    }
                    if (dist < nearestDist && npc.canInteract()) {
                        nearest = npc;
                        nearestDist = dist;
                        nearestPlayer = partner;
                    }
                }
            }

            // 檢查物品
            for (const item of this.world.items.values()) {
                if (item.isCollected) continue;

                const dist = this.getDistance(playerCenterX, playerCenterY, item);
                if (dist < this.interactRange) {
                    if (!this.highlightedTargets.includes(item)) {
                        this.highlightedTargets.push(item);
                    }
                    // 物品優先度略低於 NPC
                    if (dist < nearestDist - 10) {
                        nearest = item;
                        nearestDist = dist;
                        nearestPlayer = partner;
                    }
                }
            }

            // 檢查建築入口
            for (const building of this.world.buildings.values()) {
                const entrance = building.entrance || building;
                const dist = this.getDistance(playerCenterX, playerCenterY, entrance);
                if (dist < this.interactRange) {
                    if (!this.highlightedTargets.includes(building)) {
                        this.highlightedTargets.push(building);
                    }
                    if (dist < nearestDist) {
                        nearest = building;
                        nearestDist = dist;
                        nearestPlayer = partner;
                    }
                }
            }

            // 檢查能力障礙物
            for (const blocker of this.world.blockers.values()) {
                if (blocker.isResolved) continue;

                const dist = this.getDistance(playerCenterX, playerCenterY, blocker);
                if (dist < this.interactRange && blocker.canInteract(partner)) {
                    if (!this.highlightedTargets.includes(blocker)) {
                        this.highlightedTargets.push(blocker);
                    }
                    if (dist < nearestDist) {
                        nearest = blocker;
                        nearestDist = dist;
                        nearestPlayer = partner;
                    }
                }
            }
        }

        this.currentTarget = nearest;
        this.interactingPlayer = nearestPlayer;  // Remember which partner can interact
    }

    /**
     * 計算距離
     */
    getDistance(px, py, entity) {
        const ex = entity.x + (entity.width || 0) / 2;
        const ey = entity.y + (entity.height || 0) / 2;
        return Math.sqrt((px - ex) ** 2 + (py - ey) ** 2);
    }

    /**
     * 嘗試互動
     * @returns {boolean} 是否成功開始互動
     */
    tryInteract() {
        if (!this.currentTarget) return false;
        if (this.isInteracting) return false;
        if (this.interactionCooldown > 0) return false;

        const target = this.currentTarget;
        const targetType = this.getTargetType(target);

        // 記錄互動歷史
        this.recordInteraction(target, targetType);

        // 根據類型執行互動
        switch (targetType) {
            case 'npc':
                return this.interactWithNPC(target);
            case 'item':
                return this.interactWithItem(target);
            case 'building':
                return this.interactWithBuilding(target);
            case 'blocker':
                return this.interactWithBlocker(target);
            default:
                console.warn('InteractionSystem: Unknown target type', targetType);
                return false;
        }
    }

    /**
     * 與 NPC 互動 (Updated for Checkpoint 2 - Quest System)
     */
    async interactWithNPC(npc) {
        this.isInteracting = true;
        this.interactionCooldown = this.cooldownTime;

        // ===== Checkpoint 2: Get quest context from QuestSystem =====
        const questContext = await this.getMissionContextForNPC(npc);

        console.log(`[InteractionSystem] Interacting with NPC ${npc.npcId} | Quest NPC: ${questContext.isQuestNPC} | Has Offered: ${questContext.hasOfferedQuest}`);

        // Generate AI dialogue with full context
        let aiDialogue = null;
        try {
            const { aiService } = await import('../../core/ai-service.js');

            aiDialogue = await aiService.generateNPCDialogue({
                npc_id: npc.npcId,
                npc_type: npc.type || 'resident',
                player_id: this.player.characterId,
                quest_context: questContext,  // 使用 quest_context 而非 mission_context
                previous_interactions: npc.interactionHistory || [],
                world_state: this.world.getState?.() || {},
                is_quest_npc: questContext.isQuestNPC,
                has_offered_quest: questContext.hasOfferedQuest,
                active_quest_id: questContext.activeQuestId
            });
        } catch (e) {
            console.warn('[InteractionSystem] AI dialogue generation failed, using fallback', e);
        }

        // Fallback to old dialogue if AI fails
        const dialogue = aiDialogue || npc.startInteraction();

        // ===== Checkpoint 2: Emit START_DIALOGUE with quest context =====
        eventBus.emit('START_DIALOGUE', {
            npc: npc,
            player: this.player,
            dialogue: dialogue,
            questContext: questContext,  // 傳遞完整的任務上下文
            canOfferQuest: questContext.isQuestNPC && !questContext.hasOfferedQuest && !questContext.activeQuestId,
            actorId: this.player?.characterId
        });

        // Track interaction
        eventBus.emit('NPC_INTERACTION', {
            npc: npc,
            player: this.player,
            actorId: this.player?.characterId,
            timestamp: Date.now()
        });

        return true;
    }

    /**
     * Get quest context for NPC (Updated for Checkpoint 2)
     * @param {Object} npc - The NPC being interacted with
     * @returns {Object} Quest context
     */
    async getMissionContextForNPC(npc) {
        const questContext = missionManager.buildContextForNPC(npc);

        return {
            ...questContext,
            playerLevel: this.player?.level || 1,
            worldDestination: this.world.destination || 'Unknown',
            availableCharacters: this.partnerSystem
                ? Array.from(this.partnerSystem.getActivePartners().keys())
                : [this.player?.characterId || 'jett'],
            currentPlayer: this.player?.characterId || 'jett'
        };
    }

    /**
     * 與物品互動
     */
    interactWithItem(item) {
        this.interactionCooldown = this.cooldownTime;

        // 嘗試撿取
        const result = item.pickup(this.player);

        if (result.success) {
            if (this.world?.collectedItems) {
                this.world.collectedItems.add(item.itemId || item.id);
            }
            // 添加到玩家物品欄
            eventBus.emit('ITEM_COLLECTED', {
                player: this.player,
                item: result.item,
                actorId: this.interactingPlayer?.characterId || this.player?.characterId
            });

            // 播放音效
            eventBus.emit('PLAY_SOUND', { sound: 'pickup' });

            // 移除物品（如果不可重生）
            if (!item.respawnable) {
                this.world.removeItem(item.itemId);
            }
        } else {
            // 顯示無法撿取原因
            eventBus.emit('SHOW_TOAST', {
                message: result.reason,
                type: 'warning'
            });
        }

        return result.success;
    }

    /**
     * 與建築互動
     */
    interactWithBuilding(building) {
        this.isInteracting = true;
        this.interactionCooldown = this.cooldownTime;

        eventBus.emit('ENTER_BUILDING', {
            building: building,
            player: this.player,
            playerPosition: { x: this.player.x, y: this.player.y },
            actorId: this.interactingPlayer?.characterId || this.player?.characterId
        });

        // Testing-village delivery hub: auto deliver if parcel collected
        if (building.buildingId === 'delivery_hub' && this.world?.collectedItems?.has('mission_item')) {
            eventBus.emit('DELIVER_ITEM', {
                buildingId: 'delivery_hub',
                itemId: 'mission_item',
                actorId: this.interactingPlayer?.characterId || this.player?.characterId
            });
        }

        // Portal building triggers mode switch event
        if (building.buildingId === 'vehicle_portal') {
            eventBus.emit('PORTAL_ENTERED', {
                targetMode: 'vehicle',
                buildingId: 'vehicle_portal',
                actorId: this.interactingPlayer?.characterId || this.player?.characterId
            });
        }

        return true;
    }

    /**
     * 與能力障礙物互動
     */
    interactWithBlocker(blocker) {
        this.interactionCooldown = this.cooldownTime;

        // 使用能力解決障礙
        eventBus.emit('USE_ABILITY_ON_BLOCKER', {
            blocker: blocker,
            player: this.player
        });

        return true;
    }

    /**
     * 取得目標類型
     */
    getTargetType(target) {
        if (!target) return null;

        if (target.entityType) {
            return target.entityType;  // npc, item, building, blocker
        }

        // 降級檢測
        if (target.dialogues !== undefined) return 'npc';
        if (target.pickup !== undefined) return 'item';
        if (target.entrance !== undefined || target.buildingType !== undefined) return 'building';
        if (target.requiredAbility !== undefined && target.blockerType !== undefined) return 'blocker';

        return 'unknown';
    }

    /**
     * 交付物品給 NPC
     * @param {string} npcId - NPC ID
     * @param {string} itemId - 物品 ID
     * @returns {Object} 交付結果
     */
    deliverItemToNPC(npcId, itemId) {
        const npc = this.world.npcs.get(npcId);
        if (!npc) {
            return { success: false, reason: '找不到 NPC' };
        }

        const result = npc.receiveItem(itemId);

        if (result.success) {
            eventBus.emit('ITEM_DELIVERED', {
                npc: npc,
                itemId: itemId,
                player: this.player
            });

            // 如果完成任務
            if (result.questComplete) {
                eventBus.emit('QUEST_COMPLETE', {
                    questId: result.questId,
                    npc: npc
                });
            }
        }

        return result;
    }

    /**
     * 互動完成回調
     */
    onInteractionComplete(data) {
        this.isInteracting = false;
        this.interactionCooldown = this.cooldownTime;

        // 處理互動結果
        if (data.reward) {
            eventBus.emit('RECEIVE_REWARD', data.reward);
        }

        if (data.nextQuest) {
            eventBus.emit('QUEST_AVAILABLE', data.nextQuest);
        }
    }

    /**
     * 記錄互動歷史
     */
    recordInteraction(target, type) {
        this.interactionHistory.push({
            type: type,
            targetId: target.npcId || target.itemId || target.buildingId || target.id,
            timestamp: Date.now(),
            playerPosition: { x: this.player.x, y: this.player.y }
        });

        // 限制歷史大小
        if (this.interactionHistory.length > this.maxHistorySize) {
            this.interactionHistory.shift();
        }
    }

    /**
     * 取得當前互動提示
     * @returns {Object|null}
     */
    getInteractionHint() {
        if (!this.currentTarget || this.isInteracting) return null;

        const target = this.currentTarget;
        const type = this.getTargetType(target);

        let hintText = '';
        let icon = '';

        switch (type) {
            case 'npc':
                icon = '💬';
                hintText = target.getInteractionHint?.() || `與 ${target.name} 對話`;
                if (target.hasCompletableQuest) {
                    icon = '❓';
                    hintText = `完成任務 - ${target.name}`;
                } else if (target.hasAvailableQuest) {
                    icon = '❗';
                    hintText = `接取任務 - ${target.name}`;
                }
                break;

            case 'item':
                icon = '📦';
                hintText = target.getInteractionHint?.(this.player) || `撿取 ${target.name}`;
                if (!target.canBePickedUpBy(this.player)) {
                    icon = '🔒';
                }
                break;

            case 'building':
                icon = '🚪';
                hintText = `進入 ${target.name || '建築'}`;
                break;

            case 'blocker':
                icon = '⚡';
                hintText = target.hintText || '使用能力';
                break;
        }

        return {
            key: this.interactionKey,
            text: hintText,
            icon: icon,
            target: target,
            type: type,
            canInteract: this.canInteractWith(target)
        };
    }

    /**
     * 檢查是否可以與目標互動
     */
    canInteractWith(target) {
        if (!target) return false;

        const type = this.getTargetType(target);

        switch (type) {
            case 'npc':
                return target.canInteract();
            case 'item':
                return target.canBePickedUpBy(this.player);
            case 'building':
                return true;
            case 'blocker':
                return target.canInteract(this.player);
            default:
                return false;
        }
    }

    /**
     * 取得範圍內所有可互動目標
     * @returns {Array}
     */
    getTargetsInRange() {
        return this.highlightedTargets;
    }

    /**
     * 取得當前互動目標
     * @returns {Object|null}
     */
    getCurrentTarget() {
        return this.currentTarget;
    }

    /**
     * 是否正在互動中
     * @returns {boolean}
     */
    isInInteraction() {
        return this.isInteracting;
    }

    /**
     * 強制結束互動
     */
    forceEndInteraction() {
        this.isInteracting = false;
        eventBus.emit('INTERACTION_CANCELLED');
    }

    /**
     * 設定互動範圍
     * @param {number} range - 範圍（像素）
     */
    setInteractRange(range) {
        this.interactRange = Math.max(30, Math.min(200, range));
    }

    /**
     * 繪製互動提示
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     * @param {Camera} camera - 攝影機
     */
    drawInteractionHint(ctx, camera) {
        if (!this.showHint) return;

        const hint = this.getInteractionHint();
        if (!hint) return;

        const target = hint.target;
        const screenX = target.x - camera.x + (target.width || 0) / 2;
        const screenY = target.y - camera.y - 30;

        // 背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.strokeStyle = hint.canInteract ? '#FFD700' : '#666666';
        ctx.lineWidth = 2;

        const text = `[${hint.key}] ${hint.text}`;
        ctx.font = 'bold 14px Arial';
        const textWidth = ctx.measureText(text).width;

        const padding = 10;
        const boxWidth = textWidth + padding * 2 + 20;
        const boxHeight = 30;
        const boxX = screenX - boxWidth / 2;
        const boxY = screenY - boxHeight;

        // 圓角矩形
        this.roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 6);
        ctx.fill();
        ctx.stroke();

        // 圖示
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(hint.icon, boxX + padding, boxY + boxHeight / 2);

        // 文字
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = hint.canInteract ? '#FFFFFF' : '#999999';
        ctx.fillText(text, boxX + padding + 20, boxY + boxHeight / 2);

        // 指向箭頭
        ctx.beginPath();
        ctx.moveTo(screenX - 8, boxY + boxHeight);
        ctx.lineTo(screenX, boxY + boxHeight + 8);
        ctx.lineTo(screenX + 8, boxY + boxHeight);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fill();
    }

    /**
     * 繪製圓角矩形
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * 繪製高亮效果
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     * @param {Camera} camera - 攝影機
     */
    drawHighlights(ctx, camera) {
        for (const target of this.highlightedTargets) {
            if (target === this.currentTarget) continue;

            const screenX = target.x - camera.x;
            const screenY = target.y - camera.y;
            const width = target.width || 50;
            const height = target.height || 50;

            // 淡色高亮
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(screenX - 2, screenY - 2, width + 4, height + 4);
            ctx.setLineDash([]);
        }
    }

    /**
     * 取得互動統計
     * @returns {Object}
     */
    getStats() {
        const stats = {
            total: this.interactionHistory.length,
            byType: {}
        };

        for (const record of this.interactionHistory) {
            stats.byType[record.type] = (stats.byType[record.type] || 0) + 1;
        }

        return stats;
    }

    /**
     * 重置系統
     */
    reset() {
        this.currentTarget = null;
        this.highlightedTargets = [];
        this.isInteracting = false;
        this.interactionCooldown = 0;
        this.interactionHistory = [];
    }

    /**
     * 銷毀
     */
    dispose() {
        this.reset();
        this.player = null;
        this.world = null;
    }
}
