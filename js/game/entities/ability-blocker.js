/**
 * AbilityBlocker - 能力障礙物
 * 需要特定角色能力才能通過或解決的障礙
 */

import { BaseEntity } from './base-entity.js';
import { BLOCKER_ABILITY_MAP } from '../abilities/ability-definitions.js';

export class AbilityBlocker extends BaseEntity {
    constructor(blockerId, data = {}) {
        super(data.x || 0, data.y || 0, data.width || 100, data.height || 100);

        this.entityType = 'blocker';
        this.blockerId = blockerId;

        // 障礙類型
        this.blockerType = data.blockerType || 'gap';  // gap, soft_ground, blocked_path, animal, traffic

        // 需求資訊
        this.requiredAbility = data.requiredAbility || BLOCKER_ABILITY_MAP[this.blockerType]?.requiredAbility;
        this.requiredCharacter = data.requiredCharacter || BLOCKER_ABILITY_MAP[this.blockerType]?.requiredCharacter;

        // 提示文字
        this.hintText = data.hintText || BLOCKER_ABILITY_MAP[this.blockerType]?.hint || '需要特殊能力';

        // 狀態
        this.isResolved = false;
        this.isInteractable = true;
        this.blockMovement = data.blockMovement ?? true;

        // 視覺
        this.glowIntensity = 0;
        this.glowDirection = 1;
        this.pulseTimer = 0;

        // 圖片資源
        this.imageSrc = data.imageSrc || null;
        this.resolvedImageSrc = data.resolvedImageSrc || null;
        this.image = null;
        this.resolvedImage = null;
        this.imageLoaded = false;

        // 動物資料（animal 類型）
        this.animalData = data.animalData || null;

        // 交通資料（traffic 類型）
        this.trafficData = data.trafficData || null;

        // 解決後的通道
        this.resolvedPassage = data.resolvedPassage || null;

        // 解決動畫
        this.resolveAnimation = {
            active: false,
            progress: 0,
            duration: 1000
        };

        // 載入圖片
        if (this.imageSrc) {
            this.loadImage();
        }
    }

    /**
     * 載入圖片
     */
    loadImage() {
        this.image = new Image();
        this.image.onload = () => {
            this.imageLoaded = true;
        };
        this.image.onerror = () => {
            console.warn(`AbilityBlocker: Failed to load image for ${this.blockerId}`);
        };
        this.image.src = this.imageSrc;

        if (this.resolvedImageSrc) {
            this.resolvedImage = new Image();
            this.resolvedImage.src = this.resolvedImageSrc;
        }
    }

    /**
     * 更新
     * @param {number} dt - 時間差（秒）
     */
    update(dt) {
        // 更新發光效果
        if (!this.isResolved) {
            this.pulseTimer += dt;
            this.glowIntensity = 0.3 + Math.sin(this.pulseTimer * 3) * 0.2;
        }

        // 更新解決動畫
        if (this.resolveAnimation.active) {
            this.resolveAnimation.progress += (dt * 1000) / this.resolveAnimation.duration;
            if (this.resolveAnimation.progress >= 1) {
                this.resolveAnimation.active = false;
                this.resolveAnimation.progress = 1;
            }
        }
    }

    /**
     * 檢查玩家是否可以互動
     * @param {PlayerCharacter} player - 玩家角色
     * @returns {boolean}
     */
    canInteract(player) {
        if (this.isResolved) return false;
        if (!this.isInteractable) return false;

        // 檢查角色是否正確
        if (this.requiredCharacter) {
            if (player.characterId !== this.requiredCharacter) return false;
        }

        // 檢查是否有所需能力
        if (this.requiredAbility) {
            const hasAbility = player.abilities?.some(a => a.id === this.requiredAbility);
            if (!hasAbility) return false;
        }

        return true;
    }

    /**
     * 取得為什麼無法互動的原因
     * @param {PlayerCharacter} player - 玩家角色
     * @returns {string|null}
     */
    getBlockedReason(player) {
        if (this.isResolved) return '已解決';

        if (this.requiredCharacter && player.characterId !== this.requiredCharacter) {
            return this.hintText;
        }

        if (this.requiredAbility) {
            const hasAbility = player.abilities?.some(a => a.id === this.requiredAbility);
            if (!hasAbility) {
                return this.hintText;
            }
        }

        return null;
    }

    /**
     * 解決障礙
     */
    resolve() {
        if (this.isResolved) return false;

        this.isResolved = true;
        this.blockMovement = false;
        this.isInteractable = false;

        // 開始解決動畫
        this.resolveAnimation.active = true;
        this.resolveAnimation.progress = 0;

        return true;
    }

    /**
     * 檢查是否阻擋移動
     * @param {Object} entity - 實體
     * @returns {boolean}
     */
    blocksEntity(entity) {
        if (!this.blockMovement) return false;
        if (this.isResolved) return false;

        // 檢查碰撞
        return this.checkCollision(entity);
    }

    /**
     * 碰撞檢測
     */
    checkCollision(entity) {
        return (
            entity.x < this.x + this.width &&
            entity.x + entity.width > this.x &&
            entity.y < this.y + this.height &&
            entity.y + entity.height > this.y
        );
    }

    /**
     * 取得發光顏色
     */
    getGlowColor() {
        const colors = {
            gap: '#FFD700',         // Donnie 黃色
            soft_ground: '#8B4513', // Todd 棕色
            blocked_path: '#8B4513',
            animal: '#FFFFFF',       // Bello 白色
            traffic: '#1E90FF'       // Paul 藍色
        };
        return colors[this.blockerType] || '#FFFFFF';
    }

    /**
     * 繪製
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     * @param {Camera} camera - 攝影機
     * @param {boolean} isHighlighted - 是否高亮
     */
    draw(ctx, camera, isHighlighted = false) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        ctx.save();

        // 解決動畫
        if (this.resolveAnimation.active) {
            ctx.globalAlpha = 1 - this.resolveAnimation.progress;
        }

        // 發光效果
        if (!this.isResolved && (isHighlighted || this.glowIntensity > 0)) {
            const glowColor = this.getGlowColor();
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 20 * this.glowIntensity;
        }

        // 繪製障礙物
        if (this.isResolved && this.resolvedImage) {
            ctx.drawImage(this.resolvedImage, screenX, screenY, this.width, this.height);
        } else if (this.imageLoaded && this.image) {
            ctx.drawImage(this.image, screenX, screenY, this.width, this.height);
        } else {
            this.drawFallback(ctx, screenX, screenY, isHighlighted);
        }

        // 需求提示
        if (!this.isResolved) {
            this.drawRequirementIndicator(ctx, screenX, screenY);
        }

        ctx.restore();
    }

    /**
     * 繪製降級圖形
     */
    drawFallback(ctx, x, y, isHighlighted) {
        const color = this.getBlockerColor();

        // 根據類型繪製不同形狀
        switch (this.blockerType) {
            case 'gap':
                this.drawGap(ctx, x, y);
                break;
            case 'soft_ground':
            case 'blocked_path':
                this.drawBlockedPath(ctx, x, y, color);
                break;
            case 'animal':
                this.drawAnimal(ctx, x, y);
                break;
            case 'traffic':
                this.drawTraffic(ctx, x, y);
                break;
            default:
                this.drawDefaultBlocker(ctx, x, y, color);
        }

        // 高亮邊框
        if (isHighlighted) {
            ctx.strokeStyle = this.getGlowColor();
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, this.width, this.height);
        }
    }

    /**
     * 繪製缺口
     */
    drawGap(ctx, x, y) {
        // 斷裂的地面
        ctx.fillStyle = '#2C1810';
        ctx.fillRect(x, y, this.width, this.height);

        // 裂縫紋理
        ctx.strokeStyle = '#1A0E08';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(x + this.width * (i + 1) / 4, y);
            ctx.lineTo(x + this.width * (i + 1) / 4 + 10, y + this.height);
            ctx.stroke();
        }

        // 缺口標誌
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠️', x + this.width / 2, y + this.height / 2);
    }

    /**
     * 繪製阻擋路徑
     */
    drawBlockedPath(ctx, x, y, color) {
        // 土堆/障礙
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y + this.height);
        ctx.lineTo(x + this.width / 2, y);
        ctx.lineTo(x + this.width, y + this.height);
        ctx.closePath();
        ctx.fill();

        // 岩石紋理
        ctx.fillStyle = '#5D4037';
        for (let i = 0; i < 5; i++) {
            const rx = x + Math.random() * this.width * 0.8 + this.width * 0.1;
            const ry = y + this.height / 2 + Math.random() * this.height * 0.3;
            const rs = 8 + Math.random() * 12;
            ctx.beginPath();
            ctx.arc(rx, ry, rs, 0, Math.PI * 2);
            ctx.fill();
        }

        // 標誌
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⛏️', x + this.width / 2, y + this.height - 20);
    }

    /**
     * 繪製動物
     */
    drawAnimal(ctx, x, y) {
        // 動物圓圈
        ctx.fillStyle = '#90EE90';
        ctx.beginPath();
        ctx.arc(x + this.width / 2, y + this.height / 2, this.width / 2 - 5, 0, Math.PI * 2);
        ctx.fill();

        // 動物圖示
        const animalIcon = this.animalData?.icon || '🐾';
        ctx.font = '32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(animalIcon, x + this.width / 2, y + this.height / 2);

        // 對話氣泡
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(x + this.width - 15, y + 15, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '14px Arial';
        ctx.fillStyle = '#333';
        ctx.fillText('?', x + this.width - 15, y + 17);
    }

    /**
     * 繪製交通
     */
    drawTraffic(ctx, x, y) {
        // 紅綠燈柱
        ctx.fillStyle = '#333';
        ctx.fillRect(x + this.width / 2 - 5, y + this.height / 2, 10, this.height / 2);

        // 燈箱
        ctx.fillStyle = '#222';
        ctx.fillRect(x + this.width / 2 - 20, y, 40, 50);

        // 紅燈
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(x + this.width / 2, y + 15, 10, 0, Math.PI * 2);
        ctx.fill();

        // 黃燈 (暗)
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(x + this.width / 2, y + 35, 10, 0, Math.PI * 2);
        ctx.fill();

        // 障礙物
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(x, y + this.height - 30, this.width, 20);

        // 警告線
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 25, y + this.height - 25);
            ctx.lineTo(x + i * 25 + 15, y + this.height - 15);
            ctx.stroke();
        }
    }

    /**
     * 繪製預設障礙物
     */
    drawDefaultBlocker(ctx, x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, this.width, this.height);

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, this.width, this.height);

        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFF';
        ctx.fillText('🔒', x + this.width / 2, y + this.height / 2);
    }

    /**
     * 繪製需求指示器
     */
    drawRequirementIndicator(ctx, x, y) {
        // 角色圖示
        const characterIcons = {
            donnie: '🟡',
            todd: '🟤',
            bello: '⚪',
            paul: '🔵',
            chase: '🔵',
            jett: '🔴',
            flip: '🟣',
            jerome: '🟢'
        };

        const icon = characterIcons[this.requiredCharacter] || '❓';

        // 背景圓
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(x + this.width / 2, y - 20, 18, 0, Math.PI * 2);
        ctx.fill();

        // 圖示
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, x + this.width / 2, y - 20);
    }

    /**
     * 取得障礙物顏色
     */
    getBlockerColor() {
        const colors = {
            gap: '#2C1810',
            soft_ground: '#8B4513',
            blocked_path: '#795548',
            animal: '#90EE90',
            traffic: '#FF6B6B'
        };
        return colors[this.blockerType] || '#666666';
    }

    /**
     * 取得互動提示
     * @param {PlayerCharacter} player - 玩家角色
     * @returns {string}
     */
    getInteractionHint(player) {
        if (this.isResolved) return '已解決';

        if (this.canInteract(player)) {
            switch (this.blockerType) {
                case 'gap': return '建造橋樑';
                case 'soft_ground': return '鑽探地面';
                case 'blocked_path': return '開挖隧道';
                case 'animal': return '與動物對話';
                case 'traffic': return '控制交通';
                default: return '使用能力';
            }
        }

        return this.hintText;
    }

    /**
     * 取得碰撞邊界
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
     */
    serialize() {
        return {
            blockerId: this.blockerId,
            x: this.x,
            y: this.y,
            blockerType: this.blockerType,
            isResolved: this.isResolved
        };
    }

    /**
     * 反序列化
     */
    deserialize(data) {
        this.x = data.x;
        this.y = data.y;
        this.isResolved = data.isResolved;
        if (this.isResolved) {
            this.blockMovement = false;
            this.isInteractable = false;
        }
    }
}

/**
 * 障礙物工廠
 */
export class BlockerFactory {
    static templates = new Map();

    /**
     * 註冊模板
     */
    static registerTemplate(templateId, template) {
        this.templates.set(templateId, template);
    }

    /**
     * 創建障礙物
     */
    static create(templateId, overrides = {}) {
        const template = this.templates.get(templateId);
        const data = template ? { ...template, ...overrides } : overrides;
        return new AbilityBlocker(templateId, data);
    }

    /**
     * 從任務資料創建障礙物列表
     */
    static createFromMission(blockersData) {
        return blockersData.map(data => {
            if (data.templateId) {
                return this.create(data.templateId, data);
            }
            return new AbilityBlocker(data.id || `blocker_${Date.now()}`, data);
        });
    }
}

// 註冊預設模板
BlockerFactory.registerTemplate('gap_small', {
    blockerType: 'gap',
    width: 100,
    height: 50
});

BlockerFactory.registerTemplate('gap_large', {
    blockerType: 'gap',
    width: 200,
    height: 50
});

BlockerFactory.registerTemplate('dirt_pile', {
    blockerType: 'soft_ground',
    width: 80,
    height: 60
});

BlockerFactory.registerTemplate('rock_wall', {
    blockerType: 'blocked_path',
    width: 100,
    height: 150
});

BlockerFactory.registerTemplate('traffic_light', {
    blockerType: 'traffic',
    width: 60,
    height: 120
});
