/**
 * ExplorationPhysics - 2D 探索模式物理系統
 * 處理重力、地面碰撞、摩擦力等
 */
export class ExplorationPhysics {
    constructor(options = {}) {
        // 物理常數
        this.gravity = options.gravity ?? 1200;      // 重力加速度 (px/s²)
        this.groundY = options.groundY ?? 500;       // 地面 Y 座標
        this.friction = options.friction ?? 0.85;    // 地面摩擦係數
        this.airResistance = options.airResistance ?? 0.98; // 空氣阻力

        // 邊界
        this.worldBounds = {
            top: options.topBound ?? 0,
            bottom: options.bottomBound ?? 600
        };
    }

    /**
     * 更新單個實體的物理狀態
     * @param {Object} entity - 實體物件
     * @param {number} dt - 時間差 (秒)
     */
    update(entity, dt) {
        if (!entity.isActive) return;

        // 儲存上一幀狀態
        const wasGrounded = entity.isGrounded;
        entity.isGrounded = false;

        // 套用重力 (非飛行模式)
        if (!entity.isFlying) {
            entity.vy += this.gravity * dt;
        }

        // 速度更新
        entity.vx += (entity.ax || 0) * dt;
        entity.vy += (entity.ay || 0) * dt;

        // 位置更新
        entity.x += entity.vx * dt;
        entity.y += entity.vy * dt;

        // 地面碰撞
        if (!entity.isFlying && entity.y + entity.height > this.groundY) {
            entity.y = this.groundY - entity.height;
            entity.vy = 0;
            entity.isGrounded = true;

            // 地面摩擦
            entity.vx *= this.friction;

            // 速度過小時停止
            if (Math.abs(entity.vx) < 5) {
                entity.vx = 0;
            }
        }

        // 天花板碰撞
        if (entity.y < this.worldBounds.top) {
            entity.y = this.worldBounds.top;
            entity.vy = Math.max(0, entity.vy);
        }

        // 飛行模式的空氣阻力
        if (entity.isFlying) {
            entity.vx *= this.airResistance;
            entity.vy *= this.airResistance;
        }

        // 著陸事件
        if (!wasGrounded && entity.isGrounded && entity.onLand) {
            entity.onLand();
        }
    }

    /**
     * 批次更新多個實體
     * @param {Iterable} entities - 實體集合
     * @param {number} dt - 時間差 (秒)
     */
    updateAll(entities, dt) {
        for (const entity of entities) {
            this.update(entity, dt);
        }
    }

    /**
     * AABB 碰撞檢測
     * @param {Object} a - 實體 A
     * @param {Object} b - 實體 B
     * @returns {boolean}
     */
    checkCollision(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }

    /**
     * 取得碰撞資訊
     * @param {Object} a - 實體 A
     * @param {Object} b - 實體 B
     * @returns {Object|null} - 碰撞資訊或 null
     */
    getCollisionInfo(a, b) {
        if (!this.checkCollision(a, b)) return null;

        // 計算重疊量
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

        // 判斷碰撞方向
        const aCenterX = a.x + a.width / 2;
        const aCenterY = a.y + a.height / 2;
        const bCenterX = b.x + b.width / 2;
        const bCenterY = b.y + b.height / 2;

        const dx = aCenterX - bCenterX;
        const dy = aCenterY - bCenterY;

        let direction;
        if (overlapX < overlapY) {
            direction = dx > 0 ? 'right' : 'left';
        } else {
            direction = dy > 0 ? 'bottom' : 'top';
        }

        return {
            overlapX,
            overlapY,
            direction,
            normal: {
                x: direction === 'left' ? -1 : (direction === 'right' ? 1 : 0),
                y: direction === 'top' ? -1 : (direction === 'bottom' ? 1 : 0)
            }
        };
    }

    /**
     * 解決碰撞 (將實體推出)
     * @param {Object} entity - 要移動的實體
     * @param {Object} obstacle - 障礙物
     */
    resolveCollision(entity, obstacle) {
        const info = this.getCollisionInfo(entity, obstacle);
        if (!info) return;

        // 根據碰撞方向推出
        if (info.direction === 'left') {
            entity.x = obstacle.x - entity.width;
            entity.vx = Math.min(0, entity.vx);
        } else if (info.direction === 'right') {
            entity.x = obstacle.x + obstacle.width;
            entity.vx = Math.max(0, entity.vx);
        } else if (info.direction === 'top') {
            entity.y = obstacle.y - entity.height;
            entity.vy = Math.min(0, entity.vy);
            entity.isGrounded = true;
        } else if (info.direction === 'bottom') {
            entity.y = obstacle.y + obstacle.height;
            entity.vy = Math.max(0, entity.vy);
        }
    }

    /**
     * 設定地面高度
     * @param {number} y - 新的地面 Y 座標
     */
    setGroundY(y) {
        this.groundY = y;
    }

    /**
     * 檢查點是否在地面上
     * @param {number} x - X 座標
     * @param {number} y - Y 座標
     * @returns {boolean}
     */
    isOnGround(x, y) {
        return y >= this.groundY;
    }
}
