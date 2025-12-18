/**
 * GlowBurst - 發光擴散效果
 * 從角色中心發出水波狀的光芒擴散效果
 */

export class GlowBurst {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.waves = [];
        this.animationId = null;
        this.isRunning = false;

        // 效果配置
        this.config = {
            waveCount: 4,           // 水波圈數
            waveInterval: 150,      // 每圈間隔 (ms)
            maxRadius: 1500,        // 最大擴散半徑 (px)
            waveWidth: 60,          // 水波寬度 (px)
            expansionDuration: 800, // 擴散持續時間 (ms)
            startOpacity: 0.9,      // 起始透明度
            endOpacity: 0,          // 結束透明度
            glowIntensity: 0.6      // 中心發光強度
        };

        // 顏色（將由角色主色設定）
        this.color = '#E31D2B';
        this.centerX = 0;
        this.centerY = 0;

        // 中心發光參數
        this.centerGlow = {
            active: false,
            startTime: 0,
            duration: 300,
            maxRadius: 150
        };

        // Promise resolve 用於等待動畫完成
        this.resolvePromise = null;
    }

    /**
     * 設定發光顏色（角色主色）
     */
    setColor(color) {
        this.color = color;
    }

    /**
     * 調整 Canvas 大小
     */
    resize() {
        const parent = this.canvas.parentElement;
        if (parent) {
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
        } else {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
        // 中心點
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
    }

    /**
     * 觸發發光爆發效果
     * @param {string} color - 發光顏色（角色主色）
     * @param {number} centerX - 中心 X 座標（可選，預設為畫面中心）
     * @param {number} centerY - 中心 Y 座標（可選，預設為畫面中心）
     * @returns {Promise} - 動畫完成時 resolve
     */
    burst(color, centerX = null, centerY = null) {
        this.resize();
        this.setColor(color);

        if (centerX !== null) this.centerX = centerX;
        if (centerY !== null) this.centerY = centerY;

        this.waves = [];
        this.isRunning = true;

        // 啟動中心發光
        this.centerGlow.active = true;
        this.centerGlow.startTime = performance.now();

        // 依序發射水波
        const { waveCount, waveInterval } = this.config;
        for (let i = 0; i < waveCount; i++) {
            setTimeout(() => {
                this.addWave();
            }, i * waveInterval);
        }

        // 開始動畫
        this.animate();

        // 返回 Promise，動畫完成時 resolve
        return new Promise(resolve => {
            this.resolvePromise = resolve;
        });
    }

    /**
     * 添加一個水波
     */
    addWave() {
        this.waves.push({
            radius: 0,
            startTime: performance.now(),
            opacity: this.config.startOpacity
        });
    }

    /**
     * 緩動函數 - easeOutQuad
     */
    easeOutQuad(t) {
        return t * (2 - t);
    }

    /**
     * 緩動函數 - easeOutCubic
     */
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    /**
     * 主動畫迴圈
     */
    animate() {
        if (!this.isRunning) return;

        const now = performance.now();

        // 清除畫布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製中心發光
        this.drawCenterGlow(now);

        // 更新並繪製水波
        let allComplete = true;
        this.waves.forEach(wave => {
            const elapsed = now - wave.startTime;
            const progress = Math.min(elapsed / this.config.expansionDuration, 1);

            if (progress < 1) {
                allComplete = false;
            }

            // 使用緩動函數計算半徑
            const easedProgress = this.easeOutCubic(progress);
            wave.radius = easedProgress * this.config.maxRadius;

            // 透明度隨進度降低
            wave.opacity = this.config.startOpacity * (1 - this.easeOutQuad(progress));

            // 繪製水波
            if (wave.opacity > 0.01) {
                this.drawWave(wave);
            }
        });

        // 檢查中心發光是否完成
        const centerGlowElapsed = now - this.centerGlow.startTime;
        if (centerGlowElapsed > this.centerGlow.duration) {
            this.centerGlow.active = false;
        }

        // 如果所有水波都完成且中心發光結束
        if (allComplete && !this.centerGlow.active && this.waves.every(w => w.opacity <= 0.01)) {
            this.isRunning = false;
            if (this.resolvePromise) {
                this.resolvePromise();
                this.resolvePromise = null;
            }
            return;
        }

        // 繼續動畫
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    /**
     * 繪製單個水波
     */
    drawWave(wave) {
        const { waveWidth } = this.config;
        const ctx = this.ctx;

        // 外圈
        const outerRadius = wave.radius;
        const innerRadius = Math.max(0, wave.radius - waveWidth);

        // 創建環形漸層
        const gradient = ctx.createRadialGradient(
            this.centerX, this.centerY, innerRadius,
            this.centerX, this.centerY, outerRadius
        );

        const colorRgb = this.hexToRgb(this.color);
        gradient.addColorStop(0, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0)`);
        gradient.addColorStop(0.3, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${wave.opacity})`);
        gradient.addColorStop(0.7, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${wave.opacity * 0.8})`);
        gradient.addColorStop(1, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0)`);

        // 繪製環形
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, outerRadius, 0, Math.PI * 2);
        ctx.arc(this.centerX, this.centerY, innerRadius, 0, Math.PI * 2, true);
        ctx.closePath();

        ctx.fillStyle = gradient;
        ctx.fill();
    }

    /**
     * 繪製中心發光效果
     */
    drawCenterGlow(now) {
        if (!this.centerGlow.active) return;

        const elapsed = now - this.centerGlow.startTime;
        const progress = Math.min(elapsed / this.centerGlow.duration, 1);

        // 發光強度先增後減
        let intensity;
        if (progress < 0.3) {
            // 快速增加
            intensity = this.easeOutQuad(progress / 0.3);
        } else {
            // 緩慢減少
            intensity = 1 - this.easeOutQuad((progress - 0.3) / 0.7);
        }

        const radius = this.centerGlow.maxRadius * (0.5 + 0.5 * intensity);
        const opacity = this.config.glowIntensity * intensity;

        const colorRgb = this.hexToRgb(this.color);

        // 創建放射漸層
        const gradient = this.ctx.createRadialGradient(
            this.centerX, this.centerY, 0,
            this.centerX, this.centerY, radius
        );

        gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
        gradient.addColorStop(0.2, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity * 0.9})`);
        gradient.addColorStop(0.5, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity * 0.5})`);
        gradient.addColorStop(1, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0)`);

        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    }

    /**
     * 十六進位顏色轉 RGB
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }

    /**
     * 停止動畫
     */
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * 清除畫布
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 銷毀
     */
    destroy() {
        this.stop();
        this.clear();
        this.waves = [];
    }

    /**
     * 觸發效果（burst 的別名）
     * @returns {Promise}
     */
    trigger() {
        return this.burst(this.color);
    }
}
