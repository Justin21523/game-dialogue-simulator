/**
 * BaseEntity - 所有遊戲實體的基礎類別
 * 提供位置、尺寸、速度等基本屬性和碰撞檢測
 */
export class BaseEntity {
    constructor(x = 0, y = 0, width = 64, height = 64) {
        // 位置
        this.x = x;
        this.y = y;

        // 尺寸
        this.width = width;
        this.height = height;

        // 速度
        this.vx = 0;
        this.vy = 0;

        // 加速度
        this.ax = 0;
        this.ay = 0;

        // 狀態
        this.isActive = true;
        this.isVisible = true;
        this.markedForDeletion = false;

        // 圖片
        this.image = null;
        this.imageLoaded = false;

        // 動畫
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.animationSpeed = 0.1; // 秒/幀

        // 碰撞
        this.collisionEnabled = true;
        this.collisionPadding = 0; // 碰撞框內縮
    }

    /**
     * 取得碰撞邊界
     */
    get bounds() {
        const p = this.collisionPadding;
        return {
            left: this.x + p,
            right: this.x + this.width - p,
            top: this.y + p,
            bottom: this.y + this.height - p
        };
    }

    /**
     * 取得中心點
     */
    get center() {
        return {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2
        };
    }

    /**
     * 載入圖片
     * @param {string} src - 圖片路徑
     * @returns {Promise}
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            this.image = new Image();
            this.image.onload = () => {
                this.imageLoaded = true;
                resolve(this.image);
            };
            this.image.onerror = reject;
            this.image.src = src;
        });
    }

    /**
     * 更新實體
     * @param {number} dt - 時間差 (秒)
     */
    update(dt) {
        if (!this.isActive) return;

        // 物理更新
        this.vx += this.ax * dt;
        this.vy += this.ay * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // 動畫更新
        if (this.animationSpeed > 0) {
            this.animationTimer += dt;
            if (this.animationTimer >= this.animationSpeed) {
                this.animationTimer = 0;
                this.animationFrame++;
            }
        }
    }

    /**
     * 繪製實體
     * @param {CanvasRenderingContext2D} ctx
     * @param {Camera} camera - 攝影機 (用於座標轉換)
     */
    draw(ctx, camera = null) {
        if (!this.isVisible) return;

        // 計算螢幕座標
        let screenX = this.x;
        let screenY = this.y;

        if (camera) {
            screenX = this.x - camera.x;
            screenY = this.y - camera.y;
        }

        // 繪製圖片或佔位符
        if (this.imageLoaded && this.image) {
            ctx.drawImage(this.image, screenX, screenY, this.width, this.height);
        } else {
            // 佔位符矩形
            ctx.fillStyle = '#888888';
            ctx.fillRect(screenX, screenY, this.width, this.height);
        }
    }

    /**
     * 繪製碰撞邊界 (除錯用)
     * @param {CanvasRenderingContext2D} ctx
     * @param {Camera} camera
     */
    drawDebugBounds(ctx, camera = null) {
        const b = this.bounds;
        let offsetX = 0, offsetY = 0;

        if (camera) {
            offsetX = -camera.x;
            offsetY = -camera.y;
        }

        ctx.strokeStyle = this.collisionEnabled ? '#00FF00' : '#FF0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            b.left + offsetX,
            b.top + offsetY,
            b.right - b.left,
            b.bottom - b.top
        );
    }

    /**
     * 檢查與另一實體的碰撞
     * @param {BaseEntity} other
     * @returns {boolean}
     */
    collidesWith(other) {
        if (!this.collisionEnabled || !other.collisionEnabled) return false;

        const a = this.bounds;
        const b = other.bounds;

        return a.left < b.right &&
               a.right > b.left &&
               a.top < b.bottom &&
               a.bottom > b.top;
    }

    /**
     * 計算與另一實體的距離
     * @param {BaseEntity} other
     * @returns {number}
     */
    distanceTo(other) {
        const dx = this.center.x - other.center.x;
        const dy = this.center.y - other.center.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 標記為刪除
     */
    destroy() {
        this.markedForDeletion = true;
        this.isActive = false;
        this.isVisible = false;
    }
}
