/**
 * Camera - 2D 攝影機系統
 * 處理視角跟隨、邊界限制、平滑移動等
 */
export class Camera {
    constructor(viewWidth, viewHeight, options = {}) {
        // 視窗尺寸
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;

        // 攝影機位置 (左上角)
        this.x = 0;
        this.y = 0;

        // 目標位置 (用於平滑跟隨)
        this.targetX = 0;
        this.targetY = 0;

        // 跟隨設定
        this.followTarget = null;
        this.followOffsetX = options.followOffsetX ?? -viewWidth / 3;  // 跟隨目標的 X 偏移
        this.followOffsetY = options.followOffsetY ?? -viewHeight / 2; // 跟隨目標的 Y 偏移
        this.smoothing = options.smoothing ?? 0.1;                      // 平滑係數 (0-1)

        // 世界邊界
        this.worldBounds = {
            left: options.worldLeft ?? 0,
            right: options.worldRight ?? Infinity,
            top: options.worldTop ?? 0,
            bottom: options.worldBottom ?? Infinity
        };

        // 是否無限循環
        this.isInfinite = options.isInfinite ?? true;
        this.segmentWidth = options.segmentWidth ?? 1920;

        // 震動效果
        this.shakeIntensity = 0;
        this.shakeDecay = 0.9;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;

        // 縮放
        this.zoom = options.zoom ?? 1;
        this.targetZoom = 1;
        this.zoomSmoothing = 0.05;
    }

    /**
     * 設定跟隨目標
     * @param {Object} target - 要跟隨的實體 (需有 x, y 屬性)
     */
    follow(target) {
        this.followTarget = target;
    }

    /**
     * 停止跟隨
     */
    stopFollow() {
        this.followTarget = null;
    }

    /**
     * 更新攝影機
     * @param {number} dt - 時間差 (秒)
     */
    update(dt) {
        // 跟隨目標
        if (this.followTarget) {
            this.targetX = this.followTarget.x + this.followOffsetX;
            this.targetY = this.followTarget.y + this.followOffsetY;
        }

        // 平滑移動
        this.x += (this.targetX - this.x) * this.smoothing;
        this.y += (this.targetY - this.y) * this.smoothing;

        // 縮放平滑
        this.zoom += (this.targetZoom - this.zoom) * this.zoomSmoothing;

        // 邊界限制 (非無限模式)
        if (!this.isInfinite) {
            this.x = Math.max(this.worldBounds.left, this.x);
            this.x = Math.min(this.worldBounds.right - this.viewWidth, this.x);
        }

        // Y 軸邊界
        this.y = Math.max(this.worldBounds.top, this.y);
        this.y = Math.min(this.worldBounds.bottom - this.viewHeight, this.y);

        // 震動效果
        if (this.shakeIntensity > 0.1) {
            this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeIntensity *= this.shakeDecay;
        } else {
            this.shakeIntensity = 0;
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
        }
    }

    /**
     * 觸發震動效果
     * @param {number} intensity - 震動強度
     */
    shake(intensity = 10) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    }

    /**
     * 設定縮放
     * @param {number} zoom - 縮放比例
     */
    setZoom(zoom) {
        this.targetZoom = Math.max(0.5, Math.min(2, zoom));
    }

    /**
     * 將世界座標轉換為螢幕座標
     * @param {number} worldX - 世界 X 座標
     * @param {number} worldY - 世界 Y 座標
     * @returns {Object} - 螢幕座標
     */
    worldToScreen(worldX, worldY) {
        const effectiveX = this.x + this.shakeOffsetX;
        const effectiveY = this.y + this.shakeOffsetY;

        return {
            x: (worldX - effectiveX) * this.zoom,
            y: (worldY - effectiveY) * this.zoom
        };
    }

    /**
     * 將螢幕座標轉換為世界座標
     * @param {number} screenX - 螢幕 X 座標
     * @param {number} screenY - 螢幕 Y 座標
     * @returns {Object} - 世界座標
     */
    screenToWorld(screenX, screenY) {
        const effectiveX = this.x + this.shakeOffsetX;
        const effectiveY = this.y + this.shakeOffsetY;

        return {
            x: screenX / this.zoom + effectiveX,
            y: screenY / this.zoom + effectiveY
        };
    }

    /**
     * 檢查物件是否在視野內
     * @param {Object} entity - 實體 (需有 x, y, width, height)
     * @param {number} margin - 邊距
     * @returns {boolean}
     */
    isVisible(entity, margin = 100) {
        const screenPos = this.worldToScreen(entity.x, entity.y);

        return screenPos.x + entity.width * this.zoom > -margin &&
               screenPos.x < this.viewWidth + margin &&
               screenPos.y + entity.height * this.zoom > -margin &&
               screenPos.y < this.viewHeight + margin;
    }

    /**
     * 取得無限循環模式下的包裝 X 座標
     * @param {number} worldX - 世界 X 座標
     * @returns {number} - 包裝後的 X 座標
     */
    wrapX(worldX) {
        if (!this.isInfinite) return worldX;

        const wrapped = ((worldX % this.segmentWidth) + this.segmentWidth) % this.segmentWidth;
        return wrapped;
    }

    /**
     * 取得相對於攝影機的有效 X 座標 (考慮無限循環)
     * @param {number} worldX - 世界 X 座標
     * @returns {number} - 相對 X 座標
     */
    getRelativeX(worldX) {
        if (!this.isInfinite) {
            return worldX - this.x;
        }

        // 無限循環模式
        const cameraX = this.wrapX(this.x);
        let relX = this.wrapX(worldX) - cameraX;

        // 處理跨越邊界的情況
        if (relX > this.segmentWidth / 2) {
            relX -= this.segmentWidth;
        } else if (relX < -this.segmentWidth / 2) {
            relX += this.segmentWidth;
        }

        return relX;
    }

    /**
     * 套用攝影機變換到 Canvas
     * @param {CanvasRenderingContext2D} ctx
     */
    applyTransform(ctx) {
        const effectiveX = this.x + this.shakeOffsetX;
        const effectiveY = this.y + this.shakeOffsetY;

        ctx.save();
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-effectiveX, -effectiveY);
    }

    /**
     * 還原攝影機變換
     * @param {CanvasRenderingContext2D} ctx
     */
    resetTransform(ctx) {
        ctx.restore();
    }

    /**
     * 立即移動到指定位置
     * @param {number} x - X 座標
     * @param {number} y - Y 座標
     */
    moveTo(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
    }

    /**
     * 取得攝影機視野範圍
     * @returns {Object} - 視野邊界
     */
    getViewBounds() {
        return {
            left: this.x,
            right: this.x + this.viewWidth / this.zoom,
            top: this.y,
            bottom: this.y + this.viewHeight / this.zoom
        };
    }
}
