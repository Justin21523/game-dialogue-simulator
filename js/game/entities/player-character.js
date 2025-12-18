/**
 * PlayerCharacter - 可控制的玩家角色
 * 繼承自 BaseEntity，支援走路、飛行、互動等行為
 */
import { BaseEntity } from './base-entity.js';
import { CONFIG } from '../../config.js';
import { imageSelector } from '../../core/image-selector-service.js';
import { ABILITY_DEFINITIONS } from '../abilities/ability-definitions.js';

export class PlayerCharacter extends BaseEntity {
    constructor(characterId, characterData, options = {}) {
        super(
            options.x ?? 200,
            options.y ?? 400,
            options.width ?? 120,
            options.height ?? 120
        );

        // 角色資訊
        this.characterId = characterId;
        this.characterData = characterData;
        this.name = characterData?.name || characterId;
        this.color = characterData?.color || '#E31D2B';
        this.type = characterData?.type || 'Delivery';

        // 移動參數
        this.walkSpeed = options.walkSpeed ?? 300;
        this.flySpeed = options.flySpeed ?? 450;
        this.jumpForce = options.jumpForce ?? 550;
        this.maxFlySpeed = options.maxFlySpeed ?? 600;

        // 狀態
        this.mode = 'walking';         // walking, flying, interacting
        this.isGrounded = true;
        this.isFlying = false;
        this.facingRight = true;
        this.isAIControlled = false;

        // 動畫狀態
        this.animState = 'idle';       // idle, walk, fly, jump
        this.animationFrames = {};
        this.currentFrame = 0;

        // 能力系統 - 從 ABILITY_DEFINITIONS 載入
        this.abilities = ABILITY_DEFINITIONS[characterId] || [];
        this.cooldowns = new Map();

        // 物品欄
        this.inventory = [];
        this.maxInventorySize = 10;

        // 能力加成
        this.speedMultiplier = 1;
        this.jumpMultiplier = 1;

        // 互動狀態
        this.nearbyInteractable = null;

        // 強制可見並確保尺寸存在
        this.isVisible = true;
        this.width = options.width ?? this.width;
        this.height = options.height ?? this.height;

        // 載入角色圖片
        this._loadCharacterImages();
    }

    /**
     * 載入角色圖片
     */
    async _loadCharacterImages() {
        console.log(`[PlayerCharacter] Loading images for ${this.characterId}...`);
        try {
            const selection = await imageSelector.select(this.characterId, {
                action: 'idle',
                emotion: 'neutral',
                game_state: 'exploration'
            });

            console.log(`[PlayerCharacter] Image selector returned:`, selection);

            if (selection?.primary) {
                console.log(`[PlayerCharacter] Loading image from: ${selection.primary}`);
                await this.loadImage(selection.primary);
                console.log(`[PlayerCharacter] ✅ Image loaded successfully for ${this.characterId}`);
            } else {
                console.warn(`[PlayerCharacter] ❌ No primary image found for ${this.characterId}`);
                // 嘗試使用備用路徑
                await this.loadFallbackImage();
            }
        } catch (e) {
            console.error(`[PlayerCharacter] ❌ Failed to load character image for ${this.characterId}:`, e);
            // 嘗試載入備用圖片
            await this.loadFallbackImage();
        }
    }

    /**
     * 載入備用圖片
     */
    async loadFallbackImage() {
        const fallbackPaths = [
            `assets/images/characters/${this.characterId}/neutral.png`,
            `assets/images/characters/${this.characterId}/idle.png`,
            `assets/images/characters/${this.characterId}/default.png`,
            `assets/images/characters/default_character.png`
        ];

        for (const path of fallbackPaths) {
            try {
                console.log(`[PlayerCharacter] Trying fallback: ${path}`);
                await this.loadImage(path);
                console.log(`[PlayerCharacter] ✅ Fallback image loaded: ${path}`);
                return;
            } catch (e) {
                console.warn(`[PlayerCharacter] Fallback failed for ${path}`);
            }
        }

        console.error(`[PlayerCharacter] ❌ All fallback images failed for ${this.characterId}`);
    }

    /**
     * 處理輸入
     * @param {Object} input - 輸入狀態快照
     */
    handleInput(input) {
        if (this.isAIControlled || this.mode === 'interacting') return;

        const axis = {
            x: (input.right ? 1 : 0) - (input.left ? 1 : 0),
            y: (input.down ? 1 : 0) - (input.up ? 1 : 0)
        };

        // 水平移動
        const currentSpeed = this.mode === 'flying' ? this.flySpeed : this.walkSpeed;
        this.vx = axis.x * currentSpeed * this.speedMultiplier;

        // 更新朝向
        if (axis.x !== 0) {
            this.facingRight = axis.x > 0;
        }

        // 飛行模式的垂直移動
        if (this.mode === 'flying') {
            this.vy = axis.y * this.flySpeed * this.speedMultiplier;

            // 限制最大速度
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed > this.maxFlySpeed) {
                const ratio = this.maxFlySpeed / speed;
                this.vx *= ratio;
                this.vy *= ratio;
            }
        }

        // 跳躍
        if (input.jump && this.isGrounded && this.mode === 'walking') {
            this.vy = -this.jumpForce * this.jumpMultiplier;
            this.isGrounded = false;
            this.animState = 'jump';
        }

        // 長按跳躍 -> 飛行模式
        if (input.holdJump && !this.isFlying) {
            this.startFlying();
        }

        // 降落 (飛行中按下)
        if (input.down && this.mode === 'flying' && this.isGrounded) {
            this.stopFlying();
        }

        // 更新動畫狀態
        this._updateAnimState(axis);
    }

    /**
     * 開始飛行
     */
    startFlying() {
        this.mode = 'flying';
        this.isFlying = true;
        this.animState = 'fly';
    }

    /**
     * 停止飛行
     */
    stopFlying() {
        this.mode = 'walking';
        this.isFlying = false;
        this.animState = this.isGrounded ? 'idle' : 'jump';
    }

    /**
     * 著陸回調
     */
    onLand() {
        if (this.mode === 'walking') {
            this.animState = 'idle';
        }
    }

    /**
     * 更新動畫狀態
     */
    _updateAnimState(axis) {
        if (this.mode === 'flying') {
            this.animState = 'fly';
        } else if (!this.isGrounded) {
            this.animState = 'jump';
        } else if (axis.x !== 0) {
            this.animState = 'walk';
        } else {
            this.animState = 'idle';
        }
    }

    /**
     * 更新角色
     * @param {number} dt - 時間差
     */
    update(dt) {
        // 更新冷卻時間
        for (const [abilityId, cooldown] of this.cooldowns) {
            if (cooldown > 0) {
                this.cooldowns.set(abilityId, cooldown - dt * 1000);
            }
        }

        // 動畫更新
        this.animationTimer += dt;
        if (this.animationTimer >= this.animationSpeed) {
            this.animationTimer = 0;
            this.currentFrame++;
        }
    }

    /**
     * 繪製角色
     * @param {CanvasRenderingContext2D} ctx
     * @param {Camera} camera
     */
    draw(ctx, camera) {
        if (!this.isVisible) return;

        // 計算螢幕座標
        let screenX = this.x;
        let screenY = this.y;

        if (camera) {
            screenX = camera.getRelativeX(this.x);
            screenY = this.y - camera.y;
        }

        ctx.save();

        // 水平翻轉
        if (!this.facingRight) {
            ctx.translate(screenX + this.width, screenY);
            ctx.scale(-1, 1);
            screenX = 0;
            screenY = 0;
        }

        // 繪製圖片
        if (this.imageLoaded && this.image) {
            ctx.drawImage(this.image, screenX, screenY, this.width, this.height);
        } else {
            // ✅ 佔位符 - 使用友好的藍色圓形代替紅磚
            ctx.fillStyle = '#446DFF';
            ctx.beginPath();
            ctx.arc(screenX + this.width / 2, screenY + this.height / 2, this.width / 2, 0, Math.PI * 2);
            ctx.fill();

            // 顯示加載提示
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Loading...', screenX + this.width / 2, screenY + this.height / 2);

            // 角色名稱在下方
            ctx.font = 'bold 12px Arial';
            ctx.fillText(this.name, screenX + this.width / 2, screenY + this.height / 2 + 25);

            // 除錯描邊
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX, screenY, this.width, this.height);
        }

        ctx.restore();

        // 繪製名稱標籤
        this._drawNameTag(ctx, camera);
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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(screenX, this.y - 25, this.width, 20);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, screenX + this.width / 2, this.y - 10);
        ctx.restore();
    }

    /**
     * 添加物品到物品欄
     * @param {Object} item
     * @returns {boolean} - 是否成功
     */
    addItem(item) {
        if (this.inventory.length >= this.maxInventorySize) {
            return false;
        }
        this.inventory.push(item);
        return true;
    }

    /**
     * 移除物品
     * @param {string} itemId
     * @returns {Object|null} - 移除的物品
     */
    removeItem(itemId) {
        const index = this.inventory.findIndex(i => i.id === itemId);
        if (index === -1) return null;
        return this.inventory.splice(index, 1)[0];
    }

    /**
     * 檢查是否有指定物品
     * @param {string} itemId
     * @returns {boolean}
     */
    hasItem(itemId) {
        return this.inventory.some(i => i.id === itemId);
    }

    /**
     * 檢查是否有指定能力
     * @param {string} abilityId
     * @returns {boolean}
     */
    hasAbility(abilityId) {
        return this.abilities.some(a => a.id === abilityId);
    }

    /**
     * 使用能力
     * @param {string} abilityId
     * @returns {boolean} - 是否成功
     */
    useAbility(abilityId) {
        const ability = this.abilities.find(a => a.id === abilityId);
        if (!ability) return false;

        // 檢查冷卻
        const cooldown = this.cooldowns.get(abilityId) || 0;
        if (cooldown > 0) return false;

        // 設定冷卻
        if (ability.cooldown) {
            this.cooldowns.set(abilityId, ability.cooldown);
        }

        return true;
    }

    /**
     * 設定為 AI 控制
     * @param {boolean} controlled
     */
    setAIControlled(controlled) {
        this.isAIControlled = controlled;
    }

    /**
     * 進入互動模式
     */
    enterInteractionMode() {
        this.mode = 'interacting';
        this.vx = 0;
        this.vy = 0;
    }

    /**
     * 離開互動模式
     */
    exitInteractionMode() {
        this.mode = this.isFlying ? 'flying' : 'walking';
    }

    /**
     * 取得角色狀態快照 (用於存檔)
     */
    getState() {
        return {
            characterId: this.characterId,
            x: this.x,
            y: this.y,
            mode: this.mode,
            inventory: [...this.inventory],
            isFlying: this.isFlying
        };
    }

    /**
     * 從狀態恢復
     * @param {Object} state
     */
    loadState(state) {
        this.x = state.x;
        this.y = state.y;
        this.mode = state.mode;
        this.inventory = [...state.inventory];
        this.isFlying = state.isFlying;
    }
}
