/**
 * CollectibleItem - 可收集物品實體
 * 處理物品撿取、能力需求、視覺效果
 */

import { BaseEntity } from './base-entity.js';
import { assetLoader } from '../../core/exploration-asset-loader.js';

export class CollectibleItem extends BaseEntity {
    constructor(itemId, data = {}) {
        super(data.x || 0, data.y || 0, data.width || 48, data.height || 48);

        this.entityType = 'item';
        this.itemId = itemId;

        // 物品基本資訊
        this.name = data.name || '物品';
        this.description = data.description || '';
        this.icon = data.icon || '📦';
        this.category = data.category || 'misc';  // quest, consumable, key, collectible, misc

        // 圖片資源
        this.imageSrc = data.imageSrc || null;
        this.image = null;
        this.imageLoaded = false;

        // 能力需求
        this.requiredAbility = data.requiredAbility || null;
        this.requiredCharacter = data.requiredCharacter || null;

        // 任務相關
        this.questId = data.questId || null;
        this.deliverTo = data.deliverTo || null;  // NPC ID
        this.isQuestItem = data.isQuestItem || false;

        // 狀態
        this.isCollected = false;
        this.isInteractable = true;
        this.respawnable = data.respawnable ?? false;
        this.respawnTime = data.respawnTime || 60000;  // 60 秒
        this.lastCollectedTime = 0;

        // 堆疊
        this.stackable = data.stackable ?? true;
        this.maxStack = data.maxStack || 99;
        this.quantity = data.quantity || 1;

        // 效果 (consumable)
        this.effects = data.effects || [];

        // 價值
        this.value = data.value || 0;
        this.sellPrice = data.sellPrice || Math.floor(this.value * 0.5);

        // 動畫效果
        this.bobOffset = Math.random() * Math.PI * 2;
        this.bobSpeed = data.bobSpeed || 2;
        this.bobAmount = data.bobAmount || 5;
        this.glowIntensity = 0;
        this.glowDirection = 1;
        this.rotationAngle = 0;
        this.rotationSpeed = data.rotationSpeed || 0;

        // 粒子效果
        this.sparkles = [];
        this.sparkleTimer = 0;

        // 撿取動畫
        this.pickupAnimation = {
            active: false,
            progress: 0,
            duration: 300,
            startX: 0,
            startY: 0,
            targetX: 0,
            targetY: 0
        };

        // 提示文字
        this.hintText = data.hintText || null;

        // 載入圖片 (優先使用資產載入器)
        this.loadItemImage();
    }

    /**
     * 載入物品圖片
     */
    loadItemImage() {
        // 優先從資產載入器取得
        const cachedImage = assetLoader.getItemIcon(this.itemId);
        if (cachedImage) {
            this.image = cachedImage;
            this.imageLoaded = true;
            return;
        }

        // 備用：從指定路徑載入
        if (this.imageSrc) {
            this.image = new Image();
            this.image.onload = () => {
                this.imageLoaded = true;
            };
            this.image.onerror = () => {
                console.warn(`CollectibleItem: Failed to load image for ${this.itemId}`);
                this.imageLoaded = false;
            };
            this.image.src = this.imageSrc;
        }
    }

    /**
     * 更新物品狀態
     * @param {number} dt - 時間差
     */
    update(dt) {
        if (this.isCollected && !this.pickupAnimation.active) return;

        // 更新浮動動畫
        this.bobOffset += this.bobSpeed * dt;

        // 更新發光效果
        this.glowIntensity += this.glowDirection * dt * 2;
        if (this.glowIntensity >= 1) {
            this.glowIntensity = 1;
            this.glowDirection = -1;
        } else if (this.glowIntensity <= 0.3) {
            this.glowIntensity = 0.3;
            this.glowDirection = 1;
        }

        // 更新旋轉
        if (this.rotationSpeed !== 0) {
            this.rotationAngle += this.rotationSpeed * dt;
        }

        // 更新粒子
        this.updateSparkles(dt);

        // 更新撿取動畫
        if (this.pickupAnimation.active) {
            this.updatePickupAnimation(dt);
        }

        // 檢查重生
        if (this.isCollected && this.respawnable) {
            if (Date.now() - this.lastCollectedTime >= this.respawnTime) {
                this.respawn();
            }
        }
    }

    /**
     * 更新閃光粒子
     */
    updateSparkles(dt) {
        this.sparkleTimer += dt;

        // 生成新粒子
        if (this.sparkleTimer >= 0.3 && !this.isCollected) {
            this.sparkleTimer = 0;
            this.sparkles.push({
                x: this.x + Math.random() * this.width,
                y: this.y + Math.random() * this.height,
                size: 2 + Math.random() * 3,
                alpha: 1,
                vx: (Math.random() - 0.5) * 20,
                vy: -20 - Math.random() * 30
            });
        }

        // 更新粒子
        for (let i = this.sparkles.length - 1; i >= 0; i--) {
            const s = this.sparkles[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.alpha -= dt * 2;

            if (s.alpha <= 0) {
                this.sparkles.splice(i, 1);
            }
        }
    }

    /**
     * 更新撿取動畫
     */
    updatePickupAnimation(dt) {
        const anim = this.pickupAnimation;
        anim.progress += (dt * 1000) / anim.duration;

        if (anim.progress >= 1) {
            anim.active = false;
            anim.progress = 0;
            return;
        }

        // 使用 ease-out 曲線
        const t = 1 - Math.pow(1 - anim.progress, 3);

        this.x = anim.startX + (anim.targetX - anim.startX) * t;
        this.y = anim.startY + (anim.targetY - anim.startY) * t - Math.sin(t * Math.PI) * 50;
    }

    /**
     * 檢查玩家是否可以撿取此物品
     * @param {PlayerCharacter} player - 玩家角色
     * @returns {boolean}
     */
    canBePickedUpBy(player) {
        if (this.isCollected) return false;
        if (!this.isInteractable) return false;

        // 檢查能力需求
        if (this.requiredAbility) {
            const hasAbility = player.abilities?.some(a => a.id === this.requiredAbility);
            if (!hasAbility) return false;
        }

        // 檢查角色需求
        if (this.requiredCharacter) {
            if (player.characterId !== this.requiredCharacter) return false;
        }

        return true;
    }

    /**
     * 取得無法撿取的原因
     * @param {PlayerCharacter} player - 玩家角色
     * @returns {string|null}
     */
    getPickupBlockedReason(player) {
        if (this.isCollected) return '已被收集';

        if (this.requiredAbility) {
            const hasAbility = player.abilities?.some(a => a.id === this.requiredAbility);
            if (!hasAbility) {
                return this.hintText || `需要特殊能力才能取得`;
            }
        }

        if (this.requiredCharacter) {
            if (player.characterId !== this.requiredCharacter) {
                return this.hintText || `需要特定角色才能取得`;
            }
        }

        return null;
    }

    /**
     * 執行撿取
     * @param {PlayerCharacter} player - 玩家角色
     * @returns {Object} 撿取結果
     */
    pickup(player) {
        if (!this.canBePickedUpBy(player)) {
            return {
                success: false,
                reason: this.getPickupBlockedReason(player)
            };
        }

        // 標記為已收集
        this.isCollected = true;
        this.lastCollectedTime = Date.now();

        // 開始撿取動畫
        this.startPickupAnimation(player);

        return {
            success: true,
            item: this.toInventoryItem()
        };
    }

    /**
     * 開始撿取動畫
     */
    startPickupAnimation(player) {
        this.pickupAnimation.active = true;
        this.pickupAnimation.progress = 0;
        this.pickupAnimation.startX = this.x;
        this.pickupAnimation.startY = this.y;
        this.pickupAnimation.targetX = player.x + player.width / 2;
        this.pickupAnimation.targetY = player.y;
    }

    /**
     * 轉換為物品欄物品
     * @returns {Object}
     */
    toInventoryItem() {
        return {
            id: this.itemId,
            name: this.name,
            description: this.description,
            icon: this.icon,
            imageSrc: this.imageSrc,
            category: this.category,
            quantity: this.quantity,
            stackable: this.stackable,
            maxStack: this.maxStack,
            questId: this.questId,
            deliverTo: this.deliverTo,
            isQuestItem: this.isQuestItem,
            effects: this.effects,
            value: this.value,
            sellPrice: this.sellPrice
        };
    }

    /**
     * 重生物品
     */
    respawn() {
        this.isCollected = false;
        this.isInteractable = true;
        this.glowIntensity = 0.3;
    }

    /**
     * 繪製物品
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     * @param {Camera} camera - 攝影機
     * @param {boolean} isHighlighted - 是否高亮
     */
    draw(ctx, camera, isHighlighted = false) {
        if (this.isCollected && !this.pickupAnimation.active) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // 浮動偏移
        const bobY = Math.sin(this.bobOffset) * this.bobAmount;

        ctx.save();

        // 繪製粒子
        this.drawSparkles(ctx, camera);

        // 發光效果
        if (isHighlighted || this.isQuestItem) {
            const glowColor = this.getGlowColor();
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 15 * this.glowIntensity;
        }

        // 旋轉
        if (this.rotationSpeed !== 0) {
            ctx.translate(screenX + this.width / 2, screenY + bobY + this.height / 2);
            ctx.rotate(this.rotationAngle);
            ctx.translate(-(screenX + this.width / 2), -(screenY + bobY + this.height / 2));
        }

        // 繪製物品
        if (this.imageLoaded && this.image) {
            ctx.drawImage(
                this.image,
                screenX,
                screenY + bobY,
                this.width,
                this.height
            );
        } else {
            this.drawFallback(ctx, screenX, screenY + bobY, isHighlighted);
        }

        // 需求提示
        if (this.requiredAbility || this.requiredCharacter) {
            this.drawRequirementHint(ctx, screenX, screenY + bobY);
        }

        ctx.restore();
    }

    /**
     * 繪製閃光粒子
     */
    drawSparkles(ctx, camera) {
        for (const s of this.sparkles) {
            ctx.fillStyle = `rgba(255, 255, 200, ${s.alpha})`;
            ctx.beginPath();
            ctx.arc(s.x - camera.x, s.y - camera.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * 繪製降級圖示
     */
    drawFallback(ctx, x, y, isHighlighted) {
        // 背景圓
        const bgColor = this.getCategoryColor();
        ctx.fillStyle = isHighlighted ? this.lightenColor(bgColor, 30) : bgColor;
        ctx.beginPath();
        ctx.arc(x + this.width / 2, y + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();

        // 邊框
        ctx.strokeStyle = this.darkenColor(bgColor, 30);
        ctx.lineWidth = 2;
        ctx.stroke();

        // Emoji 圖示
        ctx.font = `${this.width * 0.6}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, x + this.width / 2, y + this.height / 2);
    }

    /**
     * 繪製需求提示
     */
    drawRequirementHint(ctx, x, y) {
        // 鎖頭圖示
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(x + this.width - 8, y + 8, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔒', x + this.width - 8, y + 8);
    }

    /**
     * 取得發光顏色
     */
    getGlowColor() {
        const colors = {
            quest: '#FFD700',
            key: '#FF6B6B',
            consumable: '#4ECDC4',
            collectible: '#9B59B6',
            misc: '#95A5A6'
        };
        return colors[this.category] || colors.misc;
    }

    /**
     * 取得類別顏色
     */
    getCategoryColor() {
        const colors = {
            quest: '#FFF3CD',
            key: '#FFE5E5',
            consumable: '#E0F7F6',
            collectible: '#F3E5F5',
            misc: '#F5F5F5'
        };
        return colors[this.category] || colors.misc;
    }

    /**
     * 顏色加亮
     */
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
    }

    /**
     * 顏色加深
     */
    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
    }

    /**
     * 取得互動提示文字
     * @param {PlayerCharacter} player - 玩家角色
     * @returns {string}
     */
    getInteractionHint(player) {
        if (!this.canBePickedUpBy(player)) {
            const reason = this.getPickupBlockedReason(player);
            return reason || '無法撿取';
        }
        return `撿取 ${this.name}`;
    }

    /**
     * 取得碰撞邊界
     * @returns {Object}
     */
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }

    /**
     * 序列化
     * @returns {Object}
     */
    serialize() {
        return {
            itemId: this.itemId,
            x: this.x,
            y: this.y,
            isCollected: this.isCollected,
            lastCollectedTime: this.lastCollectedTime
        };
    }

    /**
     * 從序列化資料還原
     * @param {Object} data - 序列化資料
     */
    deserialize(data) {
        this.x = data.x;
        this.y = data.y;
        this.isCollected = data.isCollected;
        this.lastCollectedTime = data.lastCollectedTime;
    }
}

/**
 * 物品工廠 - 創建預定義物品
 */
export class ItemFactory {
    static templates = new Map();

    /**
     * 註冊物品模板
     * @param {string} templateId - 模板 ID
     * @param {Object} template - 模板資料
     */
    static registerTemplate(templateId, template) {
        this.templates.set(templateId, template);
    }

    /**
     * 創建物品實例
     * @param {string} templateId - 模板 ID
     * @param {Object} overrides - 覆蓋屬性
     * @returns {CollectibleItem}
     */
    static create(templateId, overrides = {}) {
        const template = this.templates.get(templateId);
        if (!template) {
            console.warn(`ItemFactory: Unknown template "${templateId}"`);
            return new CollectibleItem(templateId, overrides);
        }

        const data = { ...template, ...overrides };
        return new CollectibleItem(templateId, data);
    }

    /**
     * 從任務資料創建物品列表
     * @param {Array} itemsData - 物品資料陣列
     * @returns {Array<CollectibleItem>}
     */
    static createFromMission(itemsData) {
        return itemsData.map(data => {
            if (data.templateId) {
                return this.create(data.templateId, data);
            }
            return new CollectibleItem(data.id || `item_${Date.now()}`, data);
        });
    }
}

// 註冊常用物品模板
ItemFactory.registerTemplate('package', {
    name: '包裹',
    icon: '📦',
    category: 'quest',
    isQuestItem: true
});

ItemFactory.registerTemplate('letter', {
    name: '信件',
    icon: '✉️',
    category: 'quest',
    isQuestItem: true
});

ItemFactory.registerTemplate('key', {
    name: '鑰匙',
    icon: '🔑',
    category: 'key'
});

ItemFactory.registerTemplate('coin', {
    name: '金幣',
    icon: '🪙',
    category: 'collectible',
    value: 10,
    respawnable: true,
    respawnTime: 30000
});

ItemFactory.registerTemplate('gem', {
    name: '寶石',
    icon: '💎',
    category: 'collectible',
    value: 50
});

ItemFactory.registerTemplate('food', {
    name: '食物',
    icon: '🍎',
    category: 'consumable',
    effects: [{ type: 'heal', amount: 10 }]
});

ItemFactory.registerTemplate('tool', {
    name: '工具',
    icon: '🔧',
    category: 'misc'
});
