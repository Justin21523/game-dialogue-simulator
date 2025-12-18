/**
 * NPC - 非玩家角色實體
 * 可互動的 NPC，支援對話、任務、交易等
 */

import { BaseEntity } from './base-entity.js';
import { CONFIG } from '../../config.js';
import { assetLoader } from '../../core/exploration-asset-loader.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';

export class NPC extends BaseEntity {
    constructor(npcId, data = {}) {
        super(
            data.x ?? 0,
            data.y ?? 400,
            data.width ?? 80,
            data.height ?? 100
        );

        // 基本資訊
        this.npcId = npcId;
        this.type = 'npc';
        this.name = data.name || 'NPC';
        this.role = data.role || 'citizen';  // citizen, shopkeeper, questgiver, etc.
        this.archetype = data.archetype || 'shopkeeper';  // 用於資產載入
        this.destination = data.destination || null;      // 用於資產載入
        this.description = data.description || '';

        // 外觀
        this.portraitPath = data.portraitPath || null;
        this.spritePath = data.spritePath || null;
        this.color = data.color || '#4A90D9';

        // 動畫狀態
        this.animState = 'idle';  // idle, talking, walking
        this.facingRight = data.facingRight ?? true;

        // 對話系統
        this.dialogues = data.dialogues || [];
        this.currentDialogueIndex = 0;
        this.dialogueState = {};  // 用於追蹤對話分支

        // 任務相關
        this.quests = data.quests || [];
        this.hasActiveQuest = false;
        this.hasCompletableQuest = false;
        this.questMarkerType = null;  // 'available', 'in_progress', 'completable'

        // 需求物品 (交付任務)
        this.requiredItems = data.requiredItems || [];
        this.receivedItems = [];

        // 獎勵
        this.rewards = data.rewards || {
            money: 0,
            items: [],
            reputation: 0
        };

        // 互動設定
        this.canInteract = true;
        this.isInteracting = false;
        this.interactCooldown = 0;
        this.interactCooldownMax = 500;  // 毫秒

        // 移動行為 (簡單巡邏)
        this.isMoving = data.isMoving ?? false;
        this.patrolPath = data.patrolPath || [];
        this.patrolIndex = 0;
        this.patrolWaitTime = 0;
        this.patrolWaitDuration = data.patrolWaitDuration ?? 2000;
        this.moveSpeed = data.moveSpeed ?? 50;

        // 情緒/表情
        this.emotion = 'neutral';  // neutral, happy, sad, angry, surprised
        this.emotionTimer = 0;

        // 載入圖片
        this._loadImages();
    }

    /**
     * 載入 NPC 圖片
     */
    async _loadImages() {
        // 優先：AI 動態生成 NPC 肖像
        try {
            const { selection } = await aiAssetManager.preloadNPCPortrait(this.archetype, {
                emotion: this.emotion || 'neutral',
                destination: this.destination,
                age: this.age || 'adult',
                role: this.role
            });

            if (selection && selection.primary) {
                await this.loadPortrait(selection.primary);
                console.log(`[NPC] AI portrait loaded for ${this.name}:`, selection.primary);
                // AI 成功，直接返回
                if (this.portraitLoaded) {
                    this._loadSprite();
                    return;
                }
            }
        } catch (e) {
            console.warn(`[NPC] AI portrait generation failed for ${this.name}, using fallback:`, e);
        }

        // 次要：嘗試從資產載入器取得肖像
        if (this.destination && this.archetype) {
            const portrait = assetLoader.getNPCPortrait(this.destination, this.archetype);
            if (portrait) {
                this.portraitImage = portrait;
            }
        }

        // 備用：從指定路徑載入肖像
        if (!this.portraitImage && this.portraitPath) {
            try {
                await this.loadPortrait(this.portraitPath);
            } catch (e) {
                console.warn(`Failed to load NPC portrait: ${this.portraitPath}`);
            }
        }

        this._loadSprite();
    }

    /**
     * 載入精靈圖（分離出來避免重複）
     */
    async _loadSprite() {
        // 載入精靈圖
        if (this.spritePath) {
            try {
                await this.loadImage(this.spritePath);
            } catch (e) {
                console.warn(`Failed to load NPC sprite: ${this.spritePath}`);
            }
        }
    }

    /**
     * 載入肖像圖
     */
    loadPortrait(path) {
        return new Promise((resolve, reject) => {
            this.portrait = new Image();
            this.portrait.onload = () => {
                this.portraitLoaded = true;
                resolve();
            };
            this.portrait.onerror = reject;
            this.portrait.src = path;
        });
    }

    /**
     * 更新 NPC
     * @param {number} dt - 時間差 (秒)
     */
    update(dt) {
        // 更新互動冷卻
        if (this.interactCooldown > 0) {
            this.interactCooldown -= dt * 1000;
        }

        // 更新表情計時器
        if (this.emotionTimer > 0) {
            this.emotionTimer -= dt * 1000;
            if (this.emotionTimer <= 0) {
                this.emotion = 'neutral';
            }
        }

        // 更新巡邏行為
        if (this.isMoving && this.patrolPath.length > 0) {
            this._updatePatrol(dt);
        }

        // 更新任務標記
        this._updateQuestMarker();

        // 更新動畫
        this.animationTimer += dt;
    }

    /**
     * 更新巡邏行為
     */
    _updatePatrol(dt) {
        const target = this.patrolPath[this.patrolIndex];
        if (!target) return;

        // 等待中
        if (this.patrolWaitTime > 0) {
            this.patrolWaitTime -= dt * 1000;
            this.animState = 'idle';
            return;
        }

        // 移動到目標點
        const dx = target.x - this.x;
        const distance = Math.abs(dx);

        if (distance < 5) {
            // 到達目標，等待並切換到下一點
            this.patrolWaitTime = this.patrolWaitDuration;
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolPath.length;
            this.animState = 'idle';
        } else {
            // 繼續移動
            const direction = Math.sign(dx);
            this.x += direction * this.moveSpeed * dt;
            this.facingRight = direction > 0;
            this.animState = 'walking';
        }
    }

    /**
     * 更新任務標記
     */
    _updateQuestMarker() {
        if (this.hasCompletableQuest) {
            this.questMarkerType = 'completable';
        } else if (this.hasActiveQuest) {
            this.questMarkerType = 'in_progress';
        } else if (this.quests.length > 0 && this.quests.some(q => !q.started)) {
            this.questMarkerType = 'available';
        } else {
            this.questMarkerType = null;
        }
    }

    /**
     * 檢查是否可以互動
     * @returns {boolean}
     */
    canInteractWith() {
        return this.canInteract && this.interactCooldown <= 0;
    }

    /**
     * 開始互動
     * @returns {Object} - 互動資料
     */
    startInteraction() {
        if (!this.canInteractWith()) {
            return null;
        }

        this.interactCooldown = this.interactCooldownMax;
        this.animState = 'talking';
        this.isInteracting = true;

        // 返回當前對話
        return this.getCurrentDialogue();
    }

    /**
     * 結束互動
     */
    endInteraction() {
        this.isInteracting = false;
        this.animState = 'idle';
    }

    /**
     * 檢查是否有指定任務
     * @param {string} questId - 任務 ID
     * @returns {boolean}
     */
    hasQuest(questId) {
        return this.quests.includes(questId);
    }

    /**
     * 取得當前對話
     * @returns {Object}
     */
    getCurrentDialogue() {
        if (this.dialogues.length === 0) {
            return {
                speaker: this.name,
                text: '你好！',
                type: 'simple',
                portrait: this.portrait
            };
        }

        const dialogue = this.dialogues[this.currentDialogueIndex];
        return {
            speaker: this.name,
            ...dialogue,
            portrait: this.portrait
        };
    }

    /**
     * 前進到下一段對話
     * @returns {Object|null} - 下一段對話或 null (結束)
     */
    advanceDialogue() {
        this.currentDialogueIndex++;

        if (this.currentDialogueIndex >= this.dialogues.length) {
            this.currentDialogueIndex = 0;
            this.animState = 'idle';
            return null;  // 對話結束
        }

        return this.getCurrentDialogue();
    }

    /**
     * 選擇對話選項
     * @param {number} choiceIndex - 選項索引
     * @returns {Object|null}
     */
    selectDialogueChoice(choiceIndex) {
        const current = this.dialogues[this.currentDialogueIndex];
        if (!current || !current.choices || !current.choices[choiceIndex]) {
            return this.advanceDialogue();
        }

        const choice = current.choices[choiceIndex];

        // 執行選項效果
        if (choice.effect) {
            this._executeDialogueEffect(choice.effect);
        }

        // 跳轉到指定對話
        if (choice.nextDialogue !== undefined) {
            this.currentDialogueIndex = choice.nextDialogue;
            return this.getCurrentDialogue();
        }

        return this.advanceDialogue();
    }

    /**
     * 執行對話效果
     */
    _executeDialogueEffect(effect) {
        switch (effect.type) {
            case 'start_quest':
                this.startQuest(effect.questId);
                break;
            case 'give_item':
                // 由外部處理
                break;
            case 'change_emotion':
                this.setEmotion(effect.emotion, effect.duration);
                break;
        }
    }

    /**
     * 設定對話
     * @param {Array} dialogues - 對話列表
     */
    setDialogues(dialogues) {
        this.dialogues = dialogues;
        this.currentDialogueIndex = 0;
    }

    /**
     * 重置對話
     */
    resetDialogue() {
        this.currentDialogueIndex = 0;
        this.dialogueState = {};
    }

    /**
     * 檢查是否需要特定物品
     * @param {string} itemId - 物品 ID
     * @returns {boolean}
     */
    needsItem(itemId) {
        return this.requiredItems.some(req =>
            req.itemId === itemId && !this.receivedItems.includes(itemId)
        );
    }

    /**
     * 接收物品
     * @param {string} itemId - 物品 ID
     * @returns {boolean} - 是否成功接收
     */
    receiveItem(itemId) {
        if (!this.needsItem(itemId)) {
            return false;
        }

        this.receivedItems.push(itemId);
        this.setEmotion('happy', 2000);

        // 檢查是否所有物品都已收齊
        const allReceived = this.requiredItems.every(req =>
            this.receivedItems.includes(req.itemId)
        );

        if (allReceived) {
            this.hasCompletableQuest = true;
        }

        return true;
    }

    /**
     * 檢查任務是否可完成
     * @returns {boolean}
     */
    canCompleteQuest() {
        return this.hasCompletableQuest;
    }

    /**
     * 完成任務並獲得獎勵
     * @returns {Object} - 獎勵資料
     */
    completeQuest() {
        if (!this.canCompleteQuest()) {
            return null;
        }

        this.hasCompletableQuest = false;
        this.hasActiveQuest = false;
        this.receivedItems = [];
        this.setEmotion('happy', 3000);

        return { ...this.rewards };
    }

    /**
     * 開始任務
     * @param {string} questId - 任務 ID
     */
    startQuest(questId) {
        const quest = this.quests.find(q => q.id === questId);
        if (quest && !quest.started) {
            quest.started = true;
            this.hasActiveQuest = true;
        }
    }

    /**
     * 設定表情
     * @param {string} emotion - 表情類型
     * @param {number} duration - 持續時間 (毫秒)
     */
    setEmotion(emotion, duration = 2000) {
        this.emotion = emotion;
        this.emotionTimer = duration;
    }

    /**
     * 面向玩家
     * @param {Object} player - 玩家實體
     */
    facePlayer(player) {
        if (player) {
            this.facingRight = player.x > this.x;
        }
    }

    /**
     * 繪製 NPC
     * @param {CanvasRenderingContext2D} ctx
     * @param {Camera} camera
     */
    draw(ctx, camera) {
        if (!this.isVisible) return;

        let screenX = this.x;
        let screenY = this.y;

        if (camera) {
            screenX = camera.getRelativeX(this.x);
            screenY = this.y - camera.y;
        }

        ctx.save();

        // 翻轉處理
        if (!this.facingRight) {
            ctx.translate(screenX + this.width, screenY);
            ctx.scale(-1, 1);
            screenX = 0;
            screenY = 0;
        }

        // 繪製圖片或佔位符
        if (this.imageLoaded && this.image) {
            ctx.drawImage(this.image, screenX, screenY, this.width, this.height);
        } else {
            // 佔位符
            ctx.fillStyle = this.color;
            ctx.fillRect(screenX, screenY, this.width, this.height);

            // 頭部
            ctx.fillStyle = '#FFE4C4';
            ctx.beginPath();
            ctx.arc(
                screenX + this.width / 2,
                screenY + this.height * 0.2,
                this.width * 0.25,
                0, Math.PI * 2
            );
            ctx.fill();
        }

        ctx.restore();

        // 繪製名稱標籤
        this._drawNameTag(ctx, camera);

        // 繪製任務標記
        if (this.questMarkerType) {
            this._drawQuestMarker(ctx, camera);
        }

        // 繪製表情泡泡
        if (this.emotion !== 'neutral') {
            this._drawEmotionBubble(ctx, camera);
        }
    }

    /**
     * 繪製名稱標籤
     */
    _drawNameTag(ctx, camera) {
        let screenX = this.x;
        if (camera) {
            screenX = camera.getRelativeX(this.x);
        }

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(screenX, this.y - 25, this.width, 20);

        ctx.fillStyle = '#87CEEB';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, screenX + this.width / 2, this.y - 10);
        ctx.restore();
    }

    /**
     * 繪製任務標記
     */
    _drawQuestMarker(ctx, camera) {
        let screenX = this.x;
        if (camera) {
            screenX = camera.getRelativeX(this.x);
        }

        const markerX = screenX + this.width / 2;
        const markerY = this.y - 45;

        const colors = {
            available: '#FFD700',
            in_progress: '#888888',
            completable: '#00FF00'
        };

        const color = colors[this.questMarkerType] || colors.available;

        // 動態浮動
        const float = Math.sin(Date.now() / 300) * 3;

        ctx.save();

        // 標記形狀
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(markerX, markerY + float - 15);
        ctx.lineTo(markerX - 10, markerY + float + 5);
        ctx.lineTo(markerX + 10, markerY + float + 5);
        ctx.closePath();
        ctx.fill();

        // 標記文字
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const symbol = this.questMarkerType === 'completable' ? '?' : '!';
        ctx.fillText(symbol, markerX, markerY + float - 3);

        ctx.restore();
    }

    /**
     * 繪製表情泡泡
     */
    _drawEmotionBubble(ctx, camera) {
        let screenX = this.x;
        if (camera) {
            screenX = camera.getRelativeX(this.x);
        }

        const bubbleX = screenX + this.width + 10;
        const bubbleY = this.y;

        const emotionIcons = {
            happy: '😊',
            sad: '😢',
            angry: '😠',
            surprised: '😮',
            confused: '🤔',
            love: '❤️'
        };

        const icon = emotionIcons[this.emotion] || '💭';

        ctx.save();

        // 泡泡背景
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 表情圖示
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, bubbleX, bubbleY);

        ctx.restore();
    }

    /**
     * 取得 NPC 狀態 (用於存檔)
     * @returns {Object}
     */
    getState() {
        return {
            npcId: this.npcId,
            x: this.x,
            y: this.y,
            currentDialogueIndex: this.currentDialogueIndex,
            dialogueState: { ...this.dialogueState },
            receivedItems: [...this.receivedItems],
            hasActiveQuest: this.hasActiveQuest,
            hasCompletableQuest: this.hasCompletableQuest,
            quests: this.quests.map(q => ({
                id: q.id,
                started: q.started,
                completed: q.completed
            }))
        };
    }

    /**
     * 從狀態恢復
     * @param {Object} state
     */
    loadState(state) {
        if (state.x !== undefined) this.x = state.x;
        if (state.y !== undefined) this.y = state.y;
        if (state.currentDialogueIndex !== undefined) {
            this.currentDialogueIndex = state.currentDialogueIndex;
        }
        if (state.dialogueState) {
            this.dialogueState = { ...state.dialogueState };
        }
        if (state.receivedItems) {
            this.receivedItems = [...state.receivedItems];
        }
        if (state.hasActiveQuest !== undefined) {
            this.hasActiveQuest = state.hasActiveQuest;
        }
        if (state.hasCompletableQuest !== undefined) {
            this.hasCompletableQuest = state.hasCompletableQuest;
        }
    }
}
