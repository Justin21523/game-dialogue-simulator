/**
 * AbilityEffects - 能力視覺效果系統
 * 處理各種能力使用時的粒子、動畫、視覺效果
 */

import { eventBus } from '../../core/event-bus.js';

export class AbilityEffects {
    constructor(ctx) {
        this.ctx = ctx;

        // 效果列表
        this.effects = [];

        // 持續效果（跟隨角色）
        this.persistentEffects = new Map();

        // 效果池（物件池）
        this.effectPool = {
            particle: [],
            ring: [],
            trail: [],
            text: []
        };

        // 事件監聽
        this.setupEventListeners();
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        eventBus.on('ABILITY_EFFECT', (data) => this.createEffect(data));
        eventBus.on('ABILITY_ACTIVATED', (data) => this.startPersistentEffect(data));
        eventBus.on('ABILITY_DEACTIVATED', (data) => this.stopPersistentEffect(data));
        eventBus.on('BUILD_BRIDGE', (data) => this.playBuildEffect(data));
        eventBus.on('DIG_TUNNEL', (data) => this.playDigEffect(data));
        eventBus.on('LANDING_EFFECT', (data) => this.playLandingEffect(data));
    }

    /**
     * 創建能力效果
     */
    createEffect(data) {
        const { ability, position } = data;
        const animationType = ability.animation || 'default';

        switch (animationType) {
            case 'speed_boost':
                this.createSpeedBoostEffect(position);
                break;
            case 'call':
                this.createCallEffect(position);
                break;
            case 'build':
                this.createBuildEffect(position);
                break;
            case 'drill':
            case 'tunnel':
                this.createDrillEffect(position);
                break;
            case 'transform':
                this.createTransformEffect(position);
                break;
            case 'stealth':
                this.createStealthEffect(position);
                break;
            case 'talk':
                this.createTalkEffect(position);
                break;
            case 'siren':
                this.createSirenEffect(position);
                break;
            case 'stunt':
                this.createStuntEffect(position);
                break;
            case 'dance':
                this.createDanceEffect(position);
                break;
            default:
                this.createDefaultEffect(position, ability);
        }
    }

    /**
     * 速度提升效果
     */
    createSpeedBoostEffect(position) {
        // 爆發粒子
        for (let i = 0; i < 20; i++) {
            this.addParticle({
                x: position.x,
                y: position.y,
                vx: (Math.random() - 0.5) * 300,
                vy: (Math.random() - 0.5) * 300,
                size: 5 + Math.random() * 10,
                color: '#FFD700',
                alpha: 1,
                decay: 2,
                type: 'spark'
            });
        }

        // 衝擊環
        this.addRing({
            x: position.x,
            y: position.y,
            radius: 10,
            maxRadius: 100,
            color: '#FFD700',
            lineWidth: 4,
            speed: 300
        });

        // 文字提示
        this.addFloatingText({
            x: position.x,
            y: position.y - 50,
            text: '⚡ 加速!',
            color: '#FFD700',
            size: 24
        });
    }

    /**
     * 呼叫效果
     */
    createCallEffect(position) {
        // 電波環
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.addRing({
                    x: position.x,
                    y: position.y,
                    radius: 20,
                    maxRadius: 150,
                    color: '#4ECDC4',
                    lineWidth: 3,
                    speed: 200,
                    dashed: true
                });
            }, i * 200);
        }

        // 電話圖示
        this.addFloatingText({
            x: position.x,
            y: position.y - 60,
            text: '📞',
            size: 32,
            duration: 1500
        });
    }

    /**
     * 建造效果
     */
    createBuildEffect(position) {
        // 工具粒子
        const tools = ['🔧', '🔨', '⚙️', '🪛'];
        for (let i = 0; i < 8; i++) {
            this.addParticle({
                x: position.x + (Math.random() - 0.5) * 100,
                y: position.y,
                vx: (Math.random() - 0.5) * 100,
                vy: -100 - Math.random() * 100,
                text: tools[Math.floor(Math.random() * tools.length)],
                size: 20,
                alpha: 1,
                decay: 1,
                type: 'emoji'
            });
        }

        // 火花
        for (let i = 0; i < 15; i++) {
            this.addParticle({
                x: position.x,
                y: position.y,
                vx: (Math.random() - 0.5) * 200,
                vy: -50 - Math.random() * 150,
                size: 3 + Math.random() * 5,
                color: '#FFA500',
                alpha: 1,
                decay: 3,
                gravity: 200,
                type: 'spark'
            });
        }
    }

    /**
     * 鑽探效果
     */
    createDrillEffect(position) {
        // 土塊粒子
        for (let i = 0; i < 20; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
            const speed = 100 + Math.random() * 200;
            this.addParticle({
                x: position.x,
                y: position.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50,
                size: 8 + Math.random() * 15,
                color: '#8B4513',
                alpha: 1,
                decay: 1.5,
                gravity: 400,
                type: 'dirt'
            });
        }

        // 震動效果
        this.addScreenShake(300, 5);

        // 塵埃雲
        for (let i = 0; i < 5; i++) {
            this.addParticle({
                x: position.x + (Math.random() - 0.5) * 50,
                y: position.y,
                vx: (Math.random() - 0.5) * 30,
                vy: -20 - Math.random() * 30,
                size: 30 + Math.random() * 20,
                color: '#D2B48C',
                alpha: 0.6,
                decay: 0.8,
                type: 'dust'
            });
        }
    }

    /**
     * 變形效果
     */
    createTransformEffect(position) {
        // 閃光
        this.addFlash('#FFFFFF', 100);

        // 能量環
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.addRing({
                    x: position.x,
                    y: position.y,
                    radius: 20 + i * 15,
                    maxRadius: 80 + i * 20,
                    color: '#9B59B6',
                    lineWidth: 5 - i,
                    speed: 150
                });
            }, i * 100);
        }

        // 星星粒子
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            this.addParticle({
                x: position.x + Math.cos(angle) * 30,
                y: position.y + Math.sin(angle) * 30,
                vx: Math.cos(angle) * 100,
                vy: Math.sin(angle) * 100,
                size: 8,
                color: '#FFD700',
                alpha: 1,
                decay: 2,
                type: 'star'
            });
        }
    }

    /**
     * 隱身效果
     */
    createStealthEffect(position) {
        // 漸隱粒子
        for (let i = 0; i < 10; i++) {
            this.addParticle({
                x: position.x + (Math.random() - 0.5) * 60,
                y: position.y + (Math.random() - 0.5) * 80,
                vx: 0,
                vy: -30,
                size: 20 + Math.random() * 20,
                color: 'rgba(100, 100, 255, 0.3)',
                alpha: 0.5,
                decay: 1,
                type: 'ghost'
            });
        }

        this.addFloatingText({
            x: position.x,
            y: position.y - 50,
            text: '👻',
            size: 28
        });
    }

    /**
     * 對話效果
     */
    createTalkEffect(position) {
        // 對話泡泡
        const bubbles = ['💬', '💭', '❤️', '✨'];
        for (let i = 0; i < 4; i++) {
            setTimeout(() => {
                this.addParticle({
                    x: position.x + (Math.random() - 0.5) * 40,
                    y: position.y - 30,
                    vx: (Math.random() - 0.5) * 20,
                    vy: -40 - Math.random() * 20,
                    text: bubbles[i % bubbles.length],
                    size: 20,
                    alpha: 1,
                    decay: 0.8,
                    type: 'emoji'
                });
            }, i * 150);
        }
    }

    /**
     * 警笛效果
     */
    createSirenEffect(position) {
        // 紅藍閃爍
        const colors = ['#FF0000', '#0000FF'];
        for (let i = 0; i < 6; i++) {
            setTimeout(() => {
                this.addFlash(colors[i % 2], 100);
            }, i * 100);
        }

        // 聲波
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.addRing({
                    x: position.x,
                    y: position.y,
                    radius: 30,
                    maxRadius: 200,
                    color: colors[i % 2],
                    lineWidth: 2,
                    speed: 400
                });
            }, i * 150);
        }

        this.addFloatingText({
            x: position.x,
            y: position.y - 60,
            text: '🚨',
            size: 32
        });
    }

    /**
     * 特技效果
     */
    createStuntEffect(position) {
        // 旋轉軌跡
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 4;
            const radius = 20 + i * 2;
            this.addParticle({
                x: position.x + Math.cos(angle) * radius,
                y: position.y + Math.sin(angle) * radius,
                vx: Math.cos(angle + Math.PI / 2) * 50,
                vy: Math.sin(angle + Math.PI / 2) * 50,
                size: 6,
                color: '#00FF00',
                alpha: 1 - i * 0.04,
                decay: 1.5,
                type: 'trail'
            });
        }
    }

    /**
     * 舞蹈效果
     */
    createDanceEffect(position) {
        // 音符
        const notes = ['🎵', '🎶', '🎼', '💫'];
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const angle = Math.random() * Math.PI * 2;
                this.addParticle({
                    x: position.x,
                    y: position.y,
                    vx: Math.cos(angle) * 80,
                    vy: -100 + Math.sin(angle) * 40,
                    text: notes[Math.floor(Math.random() * notes.length)],
                    size: 24,
                    alpha: 1,
                    decay: 0.6,
                    type: 'emoji'
                });
            }, i * 100);
        }

        // 彩虹環
        const rainbowColors = ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF'];
        rainbowColors.forEach((color, i) => {
            setTimeout(() => {
                this.addRing({
                    x: position.x,
                    y: position.y,
                    radius: 20,
                    maxRadius: 60 + i * 10,
                    color: color,
                    lineWidth: 3,
                    speed: 100
                });
            }, i * 50);
        });
    }

    /**
     * 預設效果
     */
    createDefaultEffect(position, ability) {
        // 通用爆發粒子
        for (let i = 0; i < 10; i++) {
            this.addParticle({
                x: position.x,
                y: position.y,
                vx: (Math.random() - 0.5) * 200,
                vy: (Math.random() - 0.5) * 200,
                size: 5 + Math.random() * 8,
                color: '#FFFFFF',
                alpha: 1,
                decay: 2,
                type: 'spark'
            });
        }

        // 圖示
        if (ability.icon) {
            this.addFloatingText({
                x: position.x,
                y: position.y - 40,
                text: ability.icon,
                size: 28
            });
        }
    }

    /**
     * 建橋效果
     */
    playBuildEffect(data) {
        const { position } = data;

        // 建造動畫
        this.createBuildEffect(position);

        // 完成效果
        setTimeout(() => {
            this.addFloatingText({
                x: position.x,
                y: position.y - 30,
                text: '橋樑建造完成!',
                color: '#FFD700',
                size: 18
            });
        }, 1000);
    }

    /**
     * 挖掘效果
     */
    playDigEffect(data) {
        const { position } = data;

        // 挖掘動畫
        this.createDrillEffect(position);

        // 完成效果
        setTimeout(() => {
            this.addFloatingText({
                x: position.x,
                y: position.y - 30,
                text: '通道開啟!',
                color: '#8B4513',
                size: 18
            });
        }, 1000);
    }

    /**
     * 降落效果
     */
    playLandingEffect(data) {
        const { x, y } = data;

        // 塵埃
        for (let i = 0; i < 10; i++) {
            const angle = Math.PI + (Math.random() - 0.5) * Math.PI;
            this.addParticle({
                x: x,
                y: y,
                vx: Math.cos(angle) * (50 + Math.random() * 100),
                vy: Math.sin(angle) * (30 + Math.random() * 50),
                size: 15 + Math.random() * 20,
                color: '#D2B48C',
                alpha: 0.7,
                decay: 1.2,
                type: 'dust'
            });
        }

        // 衝擊環
        this.addRing({
            x: x,
            y: y,
            radius: 10,
            maxRadius: 80,
            color: '#FFD700',
            lineWidth: 3,
            speed: 200
        });
    }

    /**
     * 開始持續效果
     */
    startPersistentEffect(data) {
        const { abilityId } = data;

        // 根據能力類型添加持續效果
        if (abilityId.includes('stealth')) {
            this.persistentEffects.set(abilityId, {
                type: 'stealth',
                particles: []
            });
        } else if (abilityId.includes('speed')) {
            this.persistentEffects.set(abilityId, {
                type: 'speed_trail',
                particles: []
            });
        }
    }

    /**
     * 停止持續效果
     */
    stopPersistentEffect(data) {
        this.persistentEffects.delete(data.abilityId);
    }

    /**
     * 添加粒子
     */
    addParticle(config) {
        this.effects.push({
            ...config,
            createdAt: Date.now()
        });
    }

    /**
     * 添加環形效果
     */
    addRing(config) {
        this.effects.push({
            type: 'ring',
            x: config.x,
            y: config.y,
            radius: config.radius,
            maxRadius: config.maxRadius,
            color: config.color,
            lineWidth: config.lineWidth || 2,
            speed: config.speed || 200,
            dashed: config.dashed || false,
            alpha: 1,
            createdAt: Date.now()
        });
    }

    /**
     * 添加浮動文字
     */
    addFloatingText(config) {
        this.effects.push({
            type: 'text',
            x: config.x,
            y: config.y,
            text: config.text,
            color: config.color || '#FFFFFF',
            size: config.size || 16,
            alpha: 1,
            vy: -30,
            duration: config.duration || 1000,
            createdAt: Date.now()
        });
    }

    /**
     * 添加閃光
     */
    addFlash(color, duration = 100) {
        eventBus.emit('SCREEN_FLASH', { color, duration });
    }

    /**
     * 添加震動
     */
    addScreenShake(duration, intensity) {
        eventBus.emit('SCREEN_SHAKE', { duration, intensity });
    }

    /**
     * 更新效果
     * @param {number} dt - 時間差（秒）
     */
    update(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];

            switch (effect.type) {
                case 'ring':
                    effect.radius += effect.speed * dt;
                    effect.alpha = 1 - (effect.radius / effect.maxRadius);
                    if (effect.radius >= effect.maxRadius) {
                        this.effects.splice(i, 1);
                    }
                    break;

                case 'text':
                    effect.y += effect.vy * dt;
                    effect.alpha -= dt * (1000 / effect.duration);
                    if (effect.alpha <= 0) {
                        this.effects.splice(i, 1);
                    }
                    break;

                default:
                    // 粒子
                    effect.x += (effect.vx || 0) * dt;
                    effect.y += (effect.vy || 0) * dt;

                    if (effect.gravity) {
                        effect.vy += effect.gravity * dt;
                    }

                    effect.alpha -= (effect.decay || 1) * dt;

                    if (effect.alpha <= 0) {
                        this.effects.splice(i, 1);
                    }
            }
        }
    }

    /**
     * 繪製效果
     * @param {Camera} camera - 攝影機
     */
    draw(camera) {
        for (const effect of this.effects) {
            const screenX = effect.x - camera.x;
            const screenY = effect.y - camera.y;

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, effect.alpha);

            switch (effect.type) {
                case 'ring':
                    this.drawRing(effect, screenX, screenY);
                    break;

                case 'text':
                    this.drawText(effect, screenX, screenY);
                    break;

                case 'emoji':
                    this.drawEmoji(effect, screenX, screenY);
                    break;

                case 'spark':
                case 'trail':
                    this.drawSpark(effect, screenX, screenY);
                    break;

                case 'dust':
                case 'ghost':
                    this.drawDust(effect, screenX, screenY);
                    break;

                case 'dirt':
                    this.drawDirt(effect, screenX, screenY);
                    break;

                case 'star':
                    this.drawStar(effect, screenX, screenY);
                    break;

                default:
                    this.drawDefault(effect, screenX, screenY);
            }

            this.ctx.restore();
        }
    }

    /**
     * 繪製環形
     */
    drawRing(effect, x, y) {
        this.ctx.strokeStyle = effect.color;
        this.ctx.lineWidth = effect.lineWidth;

        if (effect.dashed) {
            this.ctx.setLineDash([10, 10]);
        }

        this.ctx.beginPath();
        this.ctx.arc(x, y, effect.radius, 0, Math.PI * 2);
        this.ctx.stroke();

        if (effect.dashed) {
            this.ctx.setLineDash([]);
        }
    }

    /**
     * 繪製文字
     */
    drawText(effect, x, y) {
        this.ctx.font = `bold ${effect.size}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 陰影
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;

        this.ctx.fillStyle = effect.color;
        this.ctx.fillText(effect.text, x, y);
    }

    /**
     * 繪製 Emoji
     */
    drawEmoji(effect, x, y) {
        this.ctx.font = `${effect.size}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(effect.text, x, y);
    }

    /**
     * 繪製火花
     */
    drawSpark(effect, x, y) {
        this.ctx.fillStyle = effect.color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, effect.size, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * 繪製塵埃
     */
    drawDust(effect, x, y) {
        this.ctx.fillStyle = effect.color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, effect.size, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * 繪製土塊
     */
    drawDirt(effect, x, y) {
        this.ctx.fillStyle = effect.color;
        this.ctx.fillRect(x - effect.size / 2, y - effect.size / 2, effect.size, effect.size);
    }

    /**
     * 繪製星星
     */
    drawStar(effect, x, y) {
        this.ctx.fillStyle = effect.color;
        this.ctx.beginPath();

        for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
            const px = x + Math.cos(angle) * effect.size;
            const py = y + Math.sin(angle) * effect.size;

            if (i === 0) {
                this.ctx.moveTo(px, py);
            } else {
                this.ctx.lineTo(px, py);
            }
        }

        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * 繪製預設粒子
     */
    drawDefault(effect, x, y) {
        this.ctx.fillStyle = effect.color || '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(x, y, effect.size || 5, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * 清除所有效果
     */
    clear() {
        this.effects = [];
        this.persistentEffects.clear();
    }

    /**
     * 銷毀
     */
    dispose() {
        this.clear();
        this.ctx = null;
    }
}
