/**
 * TransformationBackground - Canvas 速度線背景動畫
 * 為變身過場創造動態的垂直速度線效果
 */

export class TransformationBackground {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.lines = [];
        this.animationId = null;
        this.isRunning = false;

        // 動畫參數
        this.config = {
            lineCount: 60,           // 線條數量
            lineWidthMin: 2,         // 最小線條寬度
            lineWidthMax: 5,         // 最大線條寬度
            lineGapMin: 12,          // 最小間距
            lineGapMax: 30,          // 最大間距
            baseSpeed: 800,          // 基礎速度 (px/s)
            speedVariation: 0.4,     // 速度變化幅度 (±40%)
            rhythmCycle: 2500,       // 節奏週期 (ms)
            opacityMin: 0.5,         // 最小透明度
            opacityMax: 0.95         // 最大透明度
        };

        // 顏色配置
        this.colors = {
            background: '#1A237E',   // 背景色
            lines: '#FFD700'         // 線條色
        };

        // 時間追蹤
        this.startTime = 0;
        this.lastFrameTime = 0;

        // 淡入/淡出
        this.fadeProgress = 0;
        this.fadeTarget = 0;
        this.fadeDuration = 500;
        this.fadeStartTime = 0;
    }

    /**
     * 設定角色專屬顏色
     */
    setColors(backgroundColor, lineColor) {
        this.colors.background = backgroundColor;
        this.colors.lines = lineColor;
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
        this.initLines();
    }

    /**
     * 初始化線條
     */
    initLines() {
        this.lines = [];
        const { lineCount, lineWidthMin, lineWidthMax, lineGapMin, lineGapMax,
                opacityMin, opacityMax, speedVariation } = this.config;

        let xPos = 0;
        for (let i = 0; i < lineCount; i++) {
            const gap = this.randomRange(lineGapMin, lineGapMax);
            xPos += gap;

            // 如果超出畫面寬度就重置
            if (xPos > this.canvas.width) {
                xPos = this.randomRange(0, lineGapMax);
            }

            this.lines.push({
                x: xPos,
                y: this.randomRange(-this.canvas.height, 0), // 從畫面外開始
                width: this.randomRange(lineWidthMin, lineWidthMax),
                height: this.canvas.height * this.randomRange(0.3, 0.8), // 不同長度
                opacity: this.randomRange(opacityMin, opacityMax),
                speedMultiplier: 1 + this.randomRange(-speedVariation, speedVariation),
                phase: this.randomRange(0, Math.PI * 2) // 隨機相位，產生錯落感
            });
        }
    }

    /**
     * 產生隨機數
     */
    randomRange(min, max) {
        return min + Math.random() * (max - min);
    }

    /**
     * 計算當前節奏速度倍率
     * 產生快-慢-快的波動效果
     */
    getRhythmMultiplier(time) {
        const { rhythmCycle } = this.config;
        // 使用正弦波產生平滑的速度變化
        // 範圍從 0.6 到 1.4
        const phase = (time % rhythmCycle) / rhythmCycle * Math.PI * 2;
        return 0.8 + 0.4 * Math.sin(phase);
    }

    /**
     * 開始動畫
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.startTime = performance.now();
        this.lastFrameTime = this.startTime;
        this.resize();
        this.animate();
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
     * 淡入效果
     */
    fadeIn(duration = 500) {
        this.fadeDuration = duration;
        this.fadeStartTime = performance.now();
        this.fadeTarget = 1;
        return new Promise(resolve => {
            const checkFade = () => {
                if (this.fadeProgress >= 1) {
                    resolve();
                } else {
                    requestAnimationFrame(checkFade);
                }
            };
            checkFade();
        });
    }

    /**
     * 淡出效果
     */
    fadeOut(duration = 500) {
        this.fadeDuration = duration;
        this.fadeStartTime = performance.now();
        this.fadeTarget = 0;
        return new Promise(resolve => {
            const checkFade = () => {
                if (this.fadeProgress <= 0) {
                    resolve();
                } else {
                    requestAnimationFrame(checkFade);
                }
            };
            checkFade();
        });
    }

    /**
     * 主動畫迴圈
     */
    animate() {
        if (!this.isRunning) return;

        const now = performance.now();
        const deltaTime = (now - this.lastFrameTime) / 1000; // 轉換為秒
        const elapsedTime = now - this.startTime;
        this.lastFrameTime = now;

        // 更新淡入/淡出
        this.updateFade(now);

        // 清除畫布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製背景
        this.ctx.globalAlpha = this.fadeProgress;
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 計算當前節奏速度
        const rhythmMultiplier = this.getRhythmMultiplier(elapsedTime);

        // 更新並繪製線條
        this.lines.forEach(line => {
            // 計算這條線的個別速度（包含節奏和個別變化）
            const linePhaseOffset = Math.sin(elapsedTime / 1000 + line.phase) * 0.2;
            const speed = this.config.baseSpeed * line.speedMultiplier * rhythmMultiplier * (1 + linePhaseOffset);

            // 更新位置
            line.y += speed * deltaTime;

            // 如果線條完全移出畫面底部，重置到頂部
            if (line.y > this.canvas.height) {
                line.y = -line.height;
                // 重新隨機化一些屬性
                line.opacity = this.randomRange(this.config.opacityMin, this.config.opacityMax);
            }

            // 繪製線條
            this.ctx.globalAlpha = this.fadeProgress * line.opacity;
            this.ctx.fillStyle = this.colors.lines;
            this.ctx.fillRect(line.x, line.y, line.width, line.height);
        });

        // 繼續動畫
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    /**
     * 更新淡入/淡出進度
     */
    updateFade(now) {
        if (this.fadeProgress !== this.fadeTarget) {
            const elapsed = now - this.fadeStartTime;
            const progress = Math.min(elapsed / this.fadeDuration, 1);

            if (this.fadeTarget > this.fadeProgress) {
                // 淡入
                this.fadeProgress = progress;
            } else {
                // 淡出
                this.fadeProgress = 1 - progress;
            }
        }
    }

    /**
     * 加速效果（用於過場結束時）
     */
    accelerate(targetSpeedMultiplier = 3, duration = 1000) {
        const originalSpeed = this.config.baseSpeed;
        const startTime = performance.now();

        return new Promise(resolve => {
            const updateSpeed = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // 使用 ease-in 曲線
                const eased = progress * progress;
                this.config.baseSpeed = originalSpeed * (1 + (targetSpeedMultiplier - 1) * eased);

                if (progress < 1) {
                    requestAnimationFrame(updateSpeed);
                } else {
                    this.config.baseSpeed = originalSpeed;
                    resolve();
                }
            };
            updateSpeed();
        });
    }

    /**
     * 銷毀
     */
    destroy() {
        this.stop();
        this.lines = [];
    }
}

// 角色專屬顏色配置
export const TRANSFORMATION_COLORS = {
    jett: {
        background: '#1A237E',  // 深藍
        lines: '#FFD700'        // 金黃
    },
    jerome: {
        background: '#BF360C',  // 深橙紅
        lines: '#FFFFFF'        // 白
    },
    donnie: {
        background: '#4A148C',  // 深紫
        lines: '#00BCD4'        // 青藍
    },
    chase: {
        background: '#E65100',  // 橙
        lines: '#E0E0E0'        // 銀白
    },
    flip: {
        background: '#00695C',  // 藍綠
        lines: '#FFEB3B'        // 黃
    },
    todd: {
        background: '#1B5E20',  // 深綠
        lines: '#FF9800'        // 橙
    },
    paul: {
        background: '#B71C1C',  // 深紅
        lines: '#FFFFFF'        // 白
    },
    bello: {
        background: '#212121',  // 黑
        lines: '#FFC107'        // 金
    }
};
