/**
 * PartnerArrival - 夥伴入場動畫效果
 * 顯示起飛、飛行、變身、降落序列
 */

import { eventBus } from '../../core/event-bus.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';

export class PartnerArrival {
    constructor(container, options = {}) {
        this.container = container;

        // 配置
        this.windowWidth = options.windowWidth ?? 300;
        this.windowHeight = options.windowHeight ?? 200;
        this.position = options.position ?? 'top-right';

        // 狀態
        this.isPlaying = false;
        this.currentPhase = null;
        this.phaseTimer = null;
        this.animationFrame = null;

        // 當前角色資料
        this.characterId = null;
        this.charData = null;
        this.phases = [];
        this.phaseIndex = 0;

        // DOM 參考
        this.arrivalWindow = null;
        this.phaseDisplay = null;
        this.progressBar = null;

        // 動畫資源
        this.frameImages = new Map();

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        this.arrivalWindow = document.createElement('div');
        this.arrivalWindow.className = `partner-arrival-window ${this.position} hidden`;
        this.arrivalWindow.style.width = `${this.windowWidth}px`;
        this.arrivalWindow.style.height = `${this.windowHeight}px`;

        this.arrivalWindow.innerHTML = `
            <div class="arrival-header">
                <span class="arrival-title">夥伴入場中</span>
                <span class="arrival-character-name"></span>
            </div>
            <div class="arrival-display">
                <div class="arrival-animation">
                    <img class="arrival-frame" src="" alt="">
                    <div class="arrival-fallback">
                        <span class="fallback-icon"></span>
                    </div>
                </div>
                <div class="arrival-effects">
                    <div class="speed-lines"></div>
                    <div class="glow-effect"></div>
                    <div class="particles"></div>
                </div>
            </div>
            <div class="arrival-phase-indicator">
                <div class="phase-dots"></div>
                <span class="phase-name"></span>
            </div>
            <div class="arrival-progress">
                <div class="progress-bar"></div>
            </div>
        `;

        this.container.appendChild(this.arrivalWindow);

        // 取得參考
        this.characterNameEl = this.arrivalWindow.querySelector('.arrival-character-name');
        this.animationEl = this.arrivalWindow.querySelector('.arrival-animation');
        this.frameEl = this.arrivalWindow.querySelector('.arrival-frame');
        this.fallbackEl = this.arrivalWindow.querySelector('.arrival-fallback');
        this.fallbackIconEl = this.arrivalWindow.querySelector('.fallback-icon');
        this.phaseDotsEl = this.arrivalWindow.querySelector('.phase-dots');
        this.phaseNameEl = this.arrivalWindow.querySelector('.phase-name');
        this.progressBar = this.arrivalWindow.querySelector('.progress-bar');
        this.speedLinesEl = this.arrivalWindow.querySelector('.speed-lines');
        this.glowEffectEl = this.arrivalWindow.querySelector('.glow-effect');
        this.particlesEl = this.arrivalWindow.querySelector('.particles');
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        eventBus.on('PARTNER_ARRIVAL_START', (data) => this.startArrival(data));
        eventBus.on('PARTNER_ARRIVAL_CANCEL', () => this.cancel());
    }

    /**
     * 開始入場序列
     * @param {Object} data - 入場資料
     */
    async startArrival(data) {
        if (this.isPlaying) {
            this.cancel();
        }

        this.characterId = data.characterId;
        this.charData = data.charData;
        this.phases = data.phases || this.getDefaultPhases();
        this.phaseIndex = 0;
        this.isPlaying = true;

        // 更新顯示
        this.characterNameEl.textContent = this.charData.name || this.characterId;
        this.updatePhaseDots();

        // 預載資源
        await this.preloadAssets();

        // 顯示視窗
        this.arrivalWindow.classList.remove('hidden');
        this.arrivalWindow.classList.add('entering');

        // 開始第一個階段
        await this.playNextPhase();
    }

    /**
     * 取得預設階段
     */
    getDefaultPhases() {
        return [
            { name: 'takeoff', duration: 1500, label: '起飛' },
            { name: 'flying', duration: 1000, label: '飛行中' },
            { name: 'transform', duration: 2000, label: '變身' }
        ];
    }

    /**
     * 預載資源
     */
    async preloadAssets() {
        // 使用 AI 選圖與預載
        try {
            const { selections, cache } = await aiAssetManager.getLaunchImages(this.characterId);
            const takeoffSel = selections.takeoff || selections.ready;
            const flyingSel = selections.flying || selections.ready;

            if (takeoffSel?.primary) {
                const img = cache[takeoffSel.primary];
                if (img) this.frameImages.set('takeoff', img);
            }
            if (flyingSel?.primary) {
                const img = cache[flyingSel.primary];
                if (img) this.frameImages.set('flying', img);
            }
        } catch (e) {
            // 忽略錯誤，使用後續佔位
        }

        try {
            const { frames, cache } = await aiAssetManager.getTransformFrames(this.characterId, { frameCount: 6, useInterpolated: true });
            frames.slice(0, 6).forEach((path, idx) => {
                const img = cache[path];
                if (img) {
                    this.frameImages.set(`transform_${idx + 1}`, img);
                }
            });
        } catch (e) {
            // 靜默失敗，使用佔位
        }

        // 確保至少有佔位圖
        if (!this.frameImages.size) {
            const placeholder = new Image();
            placeholder.src = aiAssetManager.getCharacterPlaceholder(this.characterId);
            this.frameImages.set('takeoff', placeholder);
            this.frameImages.set('flying', placeholder);
            this.frameImages.set('transform_1', placeholder);
        }
    }

    /**
     * 播放下一階段
     */
    async playNextPhase() {
        if (!this.isPlaying || this.phaseIndex >= this.phases.length) {
            this.complete();
            return;
        }

        const phase = this.phases[this.phaseIndex];
        this.currentPhase = phase;

        // 更新 UI
        this.updatePhaseDots();
        this.phaseNameEl.textContent = phase.label || phase.name;

        // 開始階段動畫
        await this.playPhase(phase);

        // 下一階段
        this.phaseIndex++;
        await this.playNextPhase();
    }

    /**
     * 播放單一階段
     */
    playPhase(phase) {
        return new Promise((resolve) => {
            // 設定顯示
            this.setPhaseDisplay(phase);

            // 設定效果
            this.setPhaseEffects(phase);

            // 進度條動畫
            this.animateProgress(phase.duration);

            // 如果是變身階段，播放幀動畫
            if (phase.name === 'transform') {
                this.playTransformAnimation(phase.duration, resolve);
            } else {
                // 其他階段直接等待
                this.phaseTimer = setTimeout(resolve, phase.duration);
            }
        });
    }

    /**
     * 設定階段顯示
     */
    setPhaseDisplay(phase) {
        const frameImage = this.frameImages.get(phase.name);

        if (frameImage) {
            this.frameEl.src = frameImage.src;
            this.frameEl.classList.remove('hidden');
            this.fallbackEl.classList.add('hidden');
        } else {
            this.frameEl.classList.add('hidden');
            this.fallbackEl.classList.remove('hidden');
            this.fallbackIconEl.textContent = this.getPhaseIcon(phase.name);
        }

        // 階段特定樣式
        this.animationEl.className = `arrival-animation phase-${phase.name}`;
    }

    /**
     * 取得階段圖示
     */
    getPhaseIcon(phaseName) {
        const icons = {
            takeoff: '🛫',
            flying: '✈️',
            transform: '⚡',
            landing: '🛬'
        };
        return icons[phaseName] || this.charData?.icon || '✈️';
    }

    /**
     * 設定階段效果
     */
    setPhaseEffects(phase) {
        // 清除現有效果
        this.speedLinesEl.className = 'speed-lines';
        this.glowEffectEl.className = 'glow-effect';
        this.particlesEl.innerHTML = '';

        switch (phase.name) {
            case 'takeoff':
                this.speedLinesEl.classList.add('vertical');
                this.addParticles('smoke', 5);
                break;

            case 'flying':
                this.speedLinesEl.classList.add('horizontal', 'active');
                this.addParticles('wind', 8);
                break;

            case 'transform':
                this.glowEffectEl.classList.add('active');
                this.glowEffectEl.style.backgroundColor = this.charData?.color || '#FFD700';
                this.addParticles('spark', 15);
                break;
        }
    }

    /**
     * 添加粒子效果
     */
    addParticles(type, count) {
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = `particle ${type}`;
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 0.5}s`;
            this.particlesEl.appendChild(particle);
        }
    }

    /**
     * 播放變身幀動畫
     */
    playTransformAnimation(duration, onComplete) {
        const frameCount = 6;
        const frameInterval = duration / frameCount;
        let currentFrame = 1;

        const nextFrame = () => {
            if (!this.isPlaying || currentFrame > frameCount) {
                onComplete();
                return;
            }

            const frameImage = this.frameImages.get(`transform_${currentFrame}`);
            if (frameImage) {
                this.frameEl.src = frameImage.src;
                this.frameEl.classList.remove('hidden');
                this.fallbackEl.classList.add('hidden');
            } else {
                // 使用降級顯示
                this.fallbackIconEl.textContent = currentFrame <= 3 ? '✈️' : '🤖';
            }

            // 閃爍效果
            this.animationEl.classList.add('flash');
            setTimeout(() => {
                this.animationEl.classList.remove('flash');
            }, 100);

            currentFrame++;
            this.phaseTimer = setTimeout(nextFrame, frameInterval);
        };

        nextFrame();
    }

    /**
     * 動畫進度條
     */
    animateProgress(duration) {
        this.progressBar.style.transition = 'none';
        this.progressBar.style.width = '0%';

        // 強制重繪
        this.progressBar.offsetHeight;

        this.progressBar.style.transition = `width ${duration}ms linear`;
        this.progressBar.style.width = '100%';
    }

    /**
     * 更新階段點
     */
    updatePhaseDots() {
        this.phaseDotsEl.innerHTML = '';

        this.phases.forEach((phase, index) => {
            const dot = document.createElement('span');
            dot.className = 'phase-dot';

            if (index < this.phaseIndex) {
                dot.classList.add('completed');
            } else if (index === this.phaseIndex) {
                dot.classList.add('current');
            }

            dot.title = phase.label || phase.name;
            this.phaseDotsEl.appendChild(dot);
        });
    }

    /**
     * 完成入場
     */
    complete() {
        this.isPlaying = false;

        // 完成效果
        this.arrivalWindow.classList.add('complete');

        // 通知完成
        eventBus.emit('PARTNER_ARRIVAL_END', {
            characterId: this.characterId
        });

        // 延遲隱藏
        setTimeout(() => {
            this.hide();
        }, 500);
    }

    /**
     * 取消入場
     */
    cancel() {
        clearTimeout(this.phaseTimer);
        cancelAnimationFrame(this.animationFrame);

        this.isPlaying = false;
        this.hide();

        eventBus.emit('PARTNER_ARRIVAL_CANCELLED', {
            characterId: this.characterId
        });
    }

    /**
     * 隱藏視窗
     */
    hide() {
        this.arrivalWindow.classList.remove('entering', 'complete');
        this.arrivalWindow.classList.add('leaving');

        setTimeout(() => {
            this.arrivalWindow.classList.add('hidden');
            this.arrivalWindow.classList.remove('leaving');
            this.reset();
        }, 300);
    }

    /**
     * 重置狀態
     */
    reset() {
        this.characterId = null;
        this.charData = null;
        this.phases = [];
        this.phaseIndex = 0;
        this.currentPhase = null;
        this.frameImages.clear();

        this.progressBar.style.width = '0%';
        this.particlesEl.innerHTML = '';
        this.speedLinesEl.className = 'speed-lines';
        this.glowEffectEl.className = 'glow-effect';
    }

    /**
     * 設定視窗位置
     * @param {string} position - 位置 (top-left, top-right, bottom-left, bottom-right)
     */
    setPosition(position) {
        this.arrivalWindow.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
        this.arrivalWindow.classList.add(position);
        this.position = position;
    }

    /**
     * 設定視窗大小
     * @param {number} width - 寬度
     * @param {number} height - 高度
     */
    setSize(width, height) {
        this.windowWidth = width;
        this.windowHeight = height;
        this.arrivalWindow.style.width = `${width}px`;
        this.arrivalWindow.style.height = `${height}px`;
    }

    /**
     * 是否正在播放
     * @returns {boolean}
     */
    isAnimating() {
        return this.isPlaying;
    }

    /**
     * 取得當前階段
     * @returns {Object|null}
     */
    getCurrentPhase() {
        return this.currentPhase;
    }

    /**
     * 銷毀
     */
    dispose() {
        this.cancel();

        if (this.arrivalWindow && this.arrivalWindow.parentNode) {
            this.arrivalWindow.parentNode.removeChild(this.arrivalWindow);
        }

        this.frameImages.clear();
    }
}

/**
 * 降落效果
 * 在遊戲場景中顯示角色降落
 */
export class LandingEffect {
    constructor(ctx) {
        this.ctx = ctx;
        this.effects = [];
    }

    /**
     * 添加降落效果
     * @param {number} x - X 位置
     * @param {number} y - Y 位置
     * @param {string} color - 顏色
     */
    addLanding(x, y, color = '#FFD700') {
        // 塵埃雲
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI / 4) + (Math.random() * Math.PI / 2);
            const speed = 50 + Math.random() * 100;
            this.effects.push({
                type: 'dust',
                x: x,
                y: y,
                vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
                vy: -Math.sin(angle) * speed,
                size: 10 + Math.random() * 20,
                alpha: 0.8,
                color: '#D2B48C'
            });
        }

        // 衝擊環
        this.effects.push({
            type: 'ring',
            x: x,
            y: y,
            radius: 10,
            maxRadius: 80,
            alpha: 1,
            color: color,
            speed: 200
        });

        // 星星閃光
        for (let i = 0; i < 5; i++) {
            this.effects.push({
                type: 'star',
                x: x + (Math.random() - 0.5) * 60,
                y: y - 20 - Math.random() * 40,
                size: 5 + Math.random() * 10,
                alpha: 1,
                rotation: Math.random() * Math.PI * 2,
                color: color
            });
        }
    }

    /**
     * 更新效果
     * @param {number} dt - 時間差（秒）
     */
    update(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];

            switch (effect.type) {
                case 'dust':
                    effect.x += effect.vx * dt;
                    effect.y += effect.vy * dt;
                    effect.vy += 200 * dt;  // 重力
                    effect.alpha -= dt * 2;
                    effect.size *= 1 + dt;
                    break;

                case 'ring':
                    effect.radius += effect.speed * dt;
                    effect.alpha = 1 - (effect.radius / effect.maxRadius);
                    break;

                case 'star':
                    effect.alpha -= dt * 3;
                    effect.y -= 50 * dt;
                    effect.rotation += dt * 5;
                    break;
            }

            // 移除完成的效果
            if (effect.alpha <= 0 || (effect.type === 'ring' && effect.radius >= effect.maxRadius)) {
                this.effects.splice(i, 1);
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
            this.ctx.globalAlpha = effect.alpha;

            switch (effect.type) {
                case 'dust':
                    this.ctx.fillStyle = effect.color;
                    this.ctx.beginPath();
                    this.ctx.arc(screenX, screenY, effect.size, 0, Math.PI * 2);
                    this.ctx.fill();
                    break;

                case 'ring':
                    this.ctx.strokeStyle = effect.color;
                    this.ctx.lineWidth = 3;
                    this.ctx.beginPath();
                    this.ctx.arc(screenX, screenY, effect.radius, 0, Math.PI * 2);
                    this.ctx.stroke();
                    break;

                case 'star':
                    this.ctx.translate(screenX, screenY);
                    this.ctx.rotate(effect.rotation);
                    this.drawStar(0, 0, effect.size, effect.color);
                    break;
            }

            this.ctx.restore();
        }
    }

    /**
     * 繪製星星
     */
    drawStar(x, y, size, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();

        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI / 2);
            const outerX = x + Math.cos(angle) * size;
            const outerY = y + Math.sin(angle) * size;

            if (i === 0) {
                this.ctx.moveTo(outerX, outerY);
            } else {
                this.ctx.lineTo(outerX, outerY);
            }

            const innerAngle = angle + Math.PI / 4;
            const innerX = x + Math.cos(innerAngle) * (size * 0.4);
            const innerY = y + Math.sin(innerAngle) * (size * 0.4);
            this.ctx.lineTo(innerX, innerY);
        }

        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * 是否有效果正在播放
     * @returns {boolean}
     */
    hasEffects() {
        return this.effects.length > 0;
    }

    /**
     * 清除所有效果
     */
    clear() {
        this.effects = [];
    }
}
