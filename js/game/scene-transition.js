/**
 * SceneTransition - 場景轉場系統
 *
 * 提供多種視覺轉場效果，用於遊戲場景切換
 * - 淡入/淡出 (Fade In/Out)
 * - 交叉淡化 (Cross Fade)
 * - 起飛轉場 (Takeoff)
 * - 降落轉場 (Landing)
 * - 擦除轉場 (Wipe)
 *
 * 使用範例:
 * ```javascript
 * const transition = new SceneTransition(canvas);
 *
 * // 簡單淡出/淡入
 * await transition.fadeOut(500);
 * // 切換場景內容
 * await transition.fadeIn(500);
 *
 * // 起飛轉場
 * await transition.takeoff({
 *   duration: 1500,
 *   color: '#1A237E',
 *   onHalfway: () => console.log('轉場中點')
 * });
 * ```
 */

export class SceneTransition {
    /**
     * 建構場景轉場管理器
     * @param {HTMLCanvasElement} canvas - Canvas 元素
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isTransitioning = false;
        this.currentAnimation = null;

        // 預設設定
        this.defaults = {
            duration: 500,
            color: '#000000',
            easing: 'easeInOut'
        };
    }

    /**
     * 取得緩動函數
     * @param {string} type - 緩動類型 ('linear', 'easeIn', 'easeOut', 'easeInOut')
     * @returns {Function} 緩動函數
     * @private
     */
    _getEasingFunction(type) {
        const easings = {
            linear: t => t,
            easeIn: t => t * t,
            easeOut: t => t * (2 - t),
            easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            easeInCubic: t => t * t * t,
            easeOutCubic: t => (--t) * t * t + 1,
            easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
        };
        return easings[type] || easings.easeInOut;
    }

    /**
     * 核心動畫迴圈
     * @param {Function} drawFrame - 繪製每一幀的回呼函數 (progress: 0~1)
     * @param {number} duration - 持續時間 (毫秒)
     * @param {string} easing - 緩動類型
     * @returns {Promise} 動畫完成的 Promise
     * @private
     */
    _animate(drawFrame, duration, easing = 'easeInOut') {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const easingFn = this._getEasingFunction(easing);

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const rawProgress = Math.min(elapsed / duration, 1);
                const progress = easingFn(rawProgress);

                drawFrame(progress);

                if (rawProgress < 1) {
                    this.currentAnimation = requestAnimationFrame(animate);
                } else {
                    this.currentAnimation = null;
                    this.isTransitioning = false;
                    resolve();
                }
            };

            this.isTransitioning = true;
            this.currentAnimation = requestAnimationFrame(animate);
        });
    }

    /**
     * 淡出效果 (畫面漸黑/漸白)
     * @param {number} duration - 持續時間 (毫秒)
     * @param {Object} options - 選項 { color, easing, onComplete }
     * @returns {Promise}
     */
    async fadeOut(duration = this.defaults.duration, options = {}) {
        const {
            color = this.defaults.color,
            easing = this.defaults.easing,
            onComplete = null
        } = options;

        await this._animate((progress) => {
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = progress;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1;
        }, duration, easing);

        if (onComplete) onComplete();
    }

    /**
     * 淡入效果 (畫面從黑/白漸現)
     * @param {number} duration - 持續時間 (毫秒)
     * @param {Object} options - 選項 { color, easing, onComplete }
     * @returns {Promise}
     */
    async fadeIn(duration = this.defaults.duration, options = {}) {
        const {
            color = this.defaults.color,
            easing = this.defaults.easing,
            onComplete = null
        } = options;

        await this._animate((progress) => {
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 1 - progress;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1;
        }, duration, easing);

        if (onComplete) onComplete();
    }

    /**
     * 交叉淡化 (適合兩個場景重疊切換)
     * @param {HTMLCanvasElement} fromCanvas - 來源場景 Canvas
     * @param {HTMLCanvasElement} toCanvas - 目標場景 Canvas
     * @param {number} duration - 持續時間
     * @param {Object} options - 選項
     * @returns {Promise}
     */
    async crossFade(fromCanvas, toCanvas, duration = 1000, options = {}) {
        const { easing = this.defaults.easing, onComplete = null } = options;

        await this._animate((progress) => {
            // 繪製來源場景 (淡出)
            this.ctx.globalAlpha = 1 - progress;
            this.ctx.drawImage(fromCanvas, 0, 0, this.canvas.width, this.canvas.height);

            // 繪製目標場景 (淡入)
            this.ctx.globalAlpha = progress;
            this.ctx.drawImage(toCanvas, 0, 0, this.canvas.width, this.canvas.height);

            this.ctx.globalAlpha = 1;
        }, duration, easing);

        if (onComplete) onComplete();
    }

    /**
     * 起飛轉場 (從基地飛向天空)
     * 特效：速度線、光暈、加速模糊
     * @param {Object} options - 選項
     * @returns {Promise}
     */
    async takeoff(options = {}) {
        const {
            duration = 1500,
            color = '#1A237E',        // 深藍背景
            accentColor = '#FFD700',  // 金色速度線
            glowColor = '#E31D2B',    // 紅色光暈
            onHalfway = null,         // 中點回呼 (可切換場景)
            onComplete = null
        } = options;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        let halfwayTriggered = false;

        await this._animate((progress) => {
            // 背景漸變 (深藍 → 亮白)
            const bgAlpha = Math.min(progress * 1.5, 1);
            this.ctx.fillStyle = color;
            this.ctx.fillRect(0, 0, w, h);

            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.globalAlpha = bgAlpha * 0.8;
            this.ctx.fillRect(0, 0, w, h);
            this.ctx.globalAlpha = 1;

            // 放射狀速度線 (Radial Speed Lines)
            const lineCount = 30;
            const lineLength = 200 + progress * 800;
            const lineOpacity = Math.min(progress * 2, 1);

            this.ctx.strokeStyle = accentColor;
            this.ctx.globalAlpha = lineOpacity * 0.6;
            this.ctx.lineWidth = 3 + progress * 5;

            for (let i = 0; i < lineCount; i++) {
                const angle = (Math.PI * 2 * i) / lineCount;
                const startDist = 50 + progress * 100;
                const x1 = cx + Math.cos(angle) * startDist;
                const y1 = cy + Math.sin(angle) * startDist;
                const x2 = cx + Math.cos(angle) * lineLength;
                const y2 = cy + Math.sin(angle) * lineLength;

                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
            }

            // 中心光暈 (Glow)
            if (progress < 0.7) {
                const glowRadius = 100 + progress * 300;
                const gradient = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
                gradient.addColorStop(0, `${glowColor}${Math.floor((1 - progress) * 255).toString(16).padStart(2, '0')}`);
                gradient.addColorStop(1, 'rgba(255,255,255,0)');

                this.ctx.fillStyle = gradient;
                this.ctx.globalAlpha = 1 - progress;
                this.ctx.fillRect(0, 0, w, h);
            }

            // 最終白光閃爍
            if (progress > 0.85) {
                const flashIntensity = (progress - 0.85) / 0.15;
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.globalAlpha = flashIntensity;
                this.ctx.fillRect(0, 0, w, h);
            }

            this.ctx.globalAlpha = 1;

            // 中點回呼 (切換場景)
            if (progress >= 0.5 && !halfwayTriggered && onHalfway) {
                halfwayTriggered = true;
                onHalfway();
            }

        }, duration, 'easeInCubic');

        if (onComplete) onComplete();
    }

    /**
     * 降落轉場 (從天空降落到目的地)
     * 特效：減速、雲層、降落閃光
     * @param {Object} options - 選項
     * @returns {Promise}
     */
    async landing(options = {}) {
        const {
            duration = 1500,
            skyColor = '#87CEEB',      // 天空藍
            groundColor = '#228B22',   // 草地綠
            cloudColor = '#FFFFFF',    // 白雲
            onHalfway = null,
            onComplete = null
        } = options;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const cy = h / 2;

        // 雲朵資料
        const clouds = Array.from({ length: 8 }, (_, i) => ({
            x: Math.random() * w,
            y: Math.random() * h,
            size: 50 + Math.random() * 100,
            speed: 0.3 + Math.random() * 0.5
        }));

        let halfwayTriggered = false;

        await this._animate((progress) => {
            // 天空漸變
            const skyGradient = this.ctx.createLinearGradient(0, 0, 0, h);
            skyGradient.addColorStop(0, skyColor);
            skyGradient.addColorStop(1, groundColor);
            this.ctx.fillStyle = skyGradient;
            this.ctx.fillRect(0, 0, w, h);

            // 雲朵移動 (由快到慢)
            const cloudSpeed = (1 - progress) * 5;
            this.ctx.fillStyle = cloudColor;
            this.ctx.globalAlpha = 0.7;

            clouds.forEach(cloud => {
                cloud.y += cloudSpeed * cloud.speed;
                if (cloud.y > h + 100) cloud.y = -100;

                // 繪製簡單雲朵 (三個圓形)
                this.ctx.beginPath();
                this.ctx.arc(cloud.x, cloud.y, cloud.size * 0.5, 0, Math.PI * 2);
                this.ctx.arc(cloud.x - cloud.size * 0.4, cloud.y + cloud.size * 0.2, cloud.size * 0.4, 0, Math.PI * 2);
                this.ctx.arc(cloud.x + cloud.size * 0.4, cloud.y + cloud.size * 0.2, cloud.size * 0.4, 0, Math.PI * 2);
                this.ctx.fill();
            });

            this.ctx.globalAlpha = 1;

            // 地面接近 (底部暗化)
            if (progress > 0.6) {
                const groundAlpha = (progress - 0.6) / 0.4;
                this.ctx.fillStyle = groundColor;
                this.ctx.globalAlpha = groundAlpha * 0.8;
                this.ctx.fillRect(0, h * 0.6, w, h * 0.4);
                this.ctx.globalAlpha = 1;
            }

            // 降落閃光 (最後一刻)
            if (progress > 0.9) {
                const flashIntensity = (progress - 0.9) / 0.1;
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.globalAlpha = flashIntensity * 0.5;
                this.ctx.fillRect(0, 0, w, h);
                this.ctx.globalAlpha = 1;
            }

            // 中點回呼
            if (progress >= 0.5 && !halfwayTriggered && onHalfway) {
                halfwayTriggered = true;
                onHalfway();
            }

        }, duration, 'easeOutCubic');

        if (onComplete) onComplete();
    }

    /**
     * 水平擦除轉場 (從左到右或從右到左)
     * @param {string} direction - 方向 ('left', 'right')
     * @param {number} duration - 持續時間
     * @param {Object} options - 選項
     * @returns {Promise}
     */
    async wipeHorizontal(direction = 'right', duration = 800, options = {}) {
        const {
            color = this.defaults.color,
            easing = 'easeInOut',
            onComplete = null
        } = options;

        const w = this.canvas.width;
        const h = this.canvas.height;

        await this._animate((progress) => {
            this.ctx.fillStyle = color;

            if (direction === 'right') {
                // 從左到右
                this.ctx.fillRect(0, 0, w * progress, h);
            } else {
                // 從右到左
                this.ctx.fillRect(w * (1 - progress), 0, w * progress, h);
            }
        }, duration, easing);

        if (onComplete) onComplete();
    }

    /**
     * 垂直擦除轉場 (從上到下或從下到上)
     * @param {string} direction - 方向 ('down', 'up')
     * @param {number} duration - 持續時間
     * @param {Object} options - 選項
     * @returns {Promise}
     */
    async wipeVertical(direction = 'down', duration = 800, options = {}) {
        const {
            color = this.defaults.color,
            easing = 'easeInOut',
            onComplete = null
        } = options;

        const w = this.canvas.width;
        const h = this.canvas.height;

        await this._animate((progress) => {
            this.ctx.fillStyle = color;

            if (direction === 'down') {
                // 從上到下
                this.ctx.fillRect(0, 0, w, h * progress);
            } else {
                // 從下到上
                this.ctx.fillRect(0, h * (1 - progress), w, h * progress);
            }
        }, duration, easing);

        if (onComplete) onComplete();
    }

    /**
     * 圓形擴散轉場 (從中心向外或從外向內)
     * @param {string} direction - 方向 ('out', 'in')
     * @param {number} duration - 持續時間
     * @param {Object} options - 選項
     * @returns {Promise}
     */
    async circleWipe(direction = 'out', duration = 1000, options = {}) {
        const {
            color = this.defaults.color,
            centerX = this.canvas.width / 2,
            centerY = this.canvas.height / 2,
            easing = 'easeInOut',
            onComplete = null
        } = options;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const maxRadius = Math.sqrt(w * w + h * h) / 2;

        await this._animate((progress) => {
            const radius = direction === 'out' ? maxRadius * progress : maxRadius * (1 - progress);

            this.ctx.save();

            if (direction === 'out') {
                // 從中心向外遮罩
                this.ctx.fillStyle = color;
                this.ctx.fillRect(0, 0, w, h);

                // 挖空圓形
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                // 從外向內遮罩
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                this.ctx.clip();

                this.ctx.fillStyle = color;
                this.ctx.fillRect(0, 0, w, h);
            }

            this.ctx.restore();
        }, duration, easing);

        if (onComplete) onComplete();
    }

    /**
     * 停止當前轉場動畫
     */
    stop() {
        if (this.currentAnimation) {
            cancelAnimationFrame(this.currentAnimation);
            this.currentAnimation = null;
            this.isTransitioning = false;
        }
    }

    /**
     * 清空 Canvas
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 組合轉場序列 (鏈式呼叫)
     * @param {Array<Function>} transitions - 轉場函數陣列
     * @returns {Promise}
     *
     * @example
     * await transition.sequence([
     *   () => transition.fadeOut(300),
     *   () => transition.wipeHorizontal('right', 500),
     *   () => transition.fadeIn(300)
     * ]);
     */
    async sequence(transitions) {
        for (const transitionFn of transitions) {
            await transitionFn();
        }
    }
}
