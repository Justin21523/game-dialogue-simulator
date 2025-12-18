/**
 * BackgroundObjects - 管理飛行場景中的裝飾性背景物件
 *
 * 功能：
 * - 物件池系統 (Object Pooling) 提升效能
 * - 多層視差滾動 (近景/中景/遠景)
 * - 地點特定物件集 (倫敦、巴黎、東京等)
 * - 支援雲朵、鳥類、氣球、地標等各類物件
 */

export class BackgroundObjects {
    constructor(gameWidth, gameHeight, location = 'generic') {
        this.width = gameWidth;
        this.height = gameHeight;
        this.location = location;

        // 物件池系統
        this.pool = {
            active: [],    // 當前畫面上的物件
            inactive: []   // 待重用的物件
        };

        // 生成計時器
        this.spawnTimer = 0;
        this.spawnInterval = 2.0; // 每 2 秒嘗試生成

        // 圖片資源快取
        this.imageCache = new Map();

        // 初始化物件庫
        this.initializeObjectLibrary();

        // 預載入常用圖片
        this.preloadAssets();
    }

    /**
     * 初始化物件庫 - 定義各類別物件的配置
     */
    initializeObjectLibrary() {
        this.objectLibrary = {
            // 雲朵 - 遠景裝飾
            clouds: {
                layer: 'far',           // 視差層級
                speedFactor: 0.3,       // 移動速度倍率
                spawnChance: 0.4,       // 生成機率
                sizes: ['small', 'medium', 'large'],
                paths: [
                    'assets/images/objects/nature/clouds_objects/cloud_small_1_v1.png',
                    'assets/images/objects/nature/clouds_objects/cloud_small_1_v2.png',
                    'assets/images/objects/nature/clouds_objects/cloud_small_1_v3.png',
                    'assets/images/objects/nature/clouds_objects/cloud_medium_1_v1.png',
                    'assets/images/objects/nature/clouds_objects/cloud_medium_1_v2.png',
                    'assets/images/objects/nature/clouds_objects/cloud_large_1_v1.png',
                    'assets/images/objects/nature/clouds_objects/cloud_large_1_v2.png',
                    'assets/images/objects/nature/clouds_objects/cloud_wispy_v1.png',
                    'assets/images/objects/nature/clouds_objects/cloud_wispy_v2.png',
                ],
                scale: { min: 0.8, max: 1.5 },
                alpha: { min: 0.4, max: 0.7 }
            },

            // 鳥類 - 中景動態物件
            birds: {
                layer: 'mid',
                speedFactor: 0.6,
                spawnChance: 0.15,
                paths: [
                    'assets/images/objects/nature/birds/bird_single_v1.png',
                    'assets/images/objects/nature/birds/bird_single_v2.png',
                    'assets/images/objects/nature/birds/bird_single_v3.png',
                    'assets/images/objects/nature/birds/bird_seagull_v1.png',
                    'assets/images/objects/nature/birds/bird_seagull_v2.png',
                    'assets/images/objects/nature/birds/bird_flock_small_v1.png',
                    'assets/images/objects/nature/birds/bird_flock_small_v2.png',
                ],
                scale: { min: 0.5, max: 1.0 },
                alpha: { min: 0.6, max: 0.9 },
                animation: 'flap' // 拍翅動畫
            },

            // 氣球 - 中景裝飾
            balloons: {
                layer: 'mid',
                speedFactor: 0.5,
                spawnChance: 0.1,
                paths: [
                    'assets/images/objects/vehicles/air/balloon_hot_air_v1.png',
                    'assets/images/objects/vehicles/air/balloon_hot_air_v2.png',
                    'assets/images/objects/vehicles/air/balloon_hot_air_v3.png',
                    'assets/images/objects/vehicles/air/balloon_party_v1.png',
                    'assets/images/objects/vehicles/air/balloon_party_v2.png',
                    'assets/images/objects/vehicles/air/balloon_party_v3.png',
                ],
                scale: { min: 0.6, max: 1.2 },
                alpha: { min: 0.7, max: 1.0 },
                animation: 'float' // 浮動動畫
            },

            // 樹木 - 地面遠景
            trees: {
                layer: 'ground',
                speedFactor: 1.2,
                spawnChance: 0.2,
                paths: [
                    'assets/images/objects/nature/trees/tree_evergreen_v1.png',
                    'assets/images/objects/nature/trees/tree_evergreen_v2.png',
                    'assets/images/objects/nature/trees/tree_palm_v1.png',
                    'assets/images/objects/nature/trees/tree_palm_v2.png',
                    'assets/images/objects/nature/trees/tree_cherry_blossom_v1.png',
                    'assets/images/objects/nature/trees/tree_autumn_v1.png',
                ],
                scale: { min: 0.4, max: 0.8 },
                alpha: { min: 0.5, max: 0.8 },
                yOffset: 'ground' // 固定在底部
            }
        };

        // 地點特定地標
        this.landmarkSets = {
            london: [
                'assets/images/objects/landmarks/london/big_ben_v1.png',
                'assets/images/objects/landmarks/london/big_ben_v2.png',
                'assets/images/objects/landmarks/london/london_phone_booth_v1.png',
                'assets/images/objects/landmarks/london/london_phone_booth_v2.png',
                'assets/images/objects/landmarks/london/london_mailbox_v1.png',
            ],
            paris: [
                'assets/images/objects/landmarks/paris/eiffel_tower_v1.png',
                'assets/images/objects/landmarks/paris/eiffel_tower_v2.png',
            ],
            tokyo: [
                'assets/images/objects/landmarks/tokyo/tokyo_tower_v1.png',
                'assets/images/objects/landmarks/tokyo/tokyo_tower_v2.png',
            ],
            new_york: [
                'assets/images/objects/landmarks/new_york/statue_liberty_v1.png',
                'assets/images/objects/landmarks/new_york/statue_liberty_v2.png',
                'assets/images/objects/landmarks/new_york/ny_hotdog_stand_v1.png',
                'assets/images/objects/landmarks/new_york/ny_fire_hydrant_v1.png',
            ],
            cairo: [
                'assets/images/objects/landmarks/cairo/pyramid_v1.png',
                'assets/images/objects/landmarks/cairo/pyramid_v2.png',
            ]
        };

        // 地標配置
        if (this.landmarkSets[this.location]) {
            this.objectLibrary.landmarks = {
                layer: 'ground',
                speedFactor: 1.0,
                spawnChance: 0.08,
                paths: this.landmarkSets[this.location],
                scale: { min: 0.5, max: 1.0 },
                alpha: { min: 0.6, max: 0.9 },
                yOffset: 'ground'
            };
        }
    }

    /**
     * 預載入資源圖片
     */
    preloadAssets() {
        // 預載入部分常用圖片到快取
        const priorityTypes = ['clouds', 'birds'];

        priorityTypes.forEach(type => {
            const config = this.objectLibrary[type];
            if (config && config.paths) {
                config.paths.slice(0, 3).forEach(path => {
                    this.loadImage(path);
                });
            }
        });
    }

    /**
     * 圖片載入與快取
     */
    loadImage(path) {
        if (this.imageCache.has(path)) {
            return this.imageCache.get(path);
        }

        const img = new Image();
        img.src = path;
        this.imageCache.set(path, img);
        return img;
    }

    /**
     * 更新所有物件
     */
    update(dt, baseSpeed) {
        this.spawnTimer += dt;

        // 定期生成新物件
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.trySpawnObject();
        }

        // 更新所有活躍物件
        this.pool.active.forEach(obj => {
            obj.update(dt, baseSpeed);
        });

        // 清理超出畫面的物件並回收到池中
        this.pool.active = this.pool.active.filter(obj => {
            if (obj.markedForDeletion) {
                this.returnToPool(obj);
                return false;
            }
            return true;
        });
    }

    /**
     * 繪製所有物件 (依層級排序)
     */
    draw(ctx) {
        // 依層級排序：far -> mid -> ground
        const layerOrder = { far: 0, mid: 1, ground: 2 };

        const sorted = [...this.pool.active].sort((a, b) => {
            return layerOrder[a.layer] - layerOrder[b.layer];
        });

        sorted.forEach(obj => obj.draw(ctx));
    }

    /**
     * 嘗試生成新物件
     */
    trySpawnObject() {
        // 隨機選擇物件類型
        const types = Object.keys(this.objectLibrary);
        const availableTypes = types.filter(type => {
            const config = this.objectLibrary[type];
            return Math.random() < config.spawnChance;
        });

        if (availableTypes.length === 0) return;

        const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        this.spawnObject(type);
    }

    /**
     * 生成指定類型物件
     */
    spawnObject(type) {
        const config = this.objectLibrary[type];
        if (!config || !config.paths || config.paths.length === 0) return;

        // 從池中獲取或創建新物件
        let obj = this.getFromPool();

        // 隨機選擇圖片
        const imagePath = config.paths[Math.floor(Math.random() * config.paths.length)];
        const image = this.loadImage(imagePath);

        // 計算隨機縮放
        const scale = config.scale.min + Math.random() * (config.scale.max - config.scale.min);

        // 計算位置
        let y;
        if (config.yOffset === 'ground') {
            // 地面物件固定在底部
            y = this.height - 150 * scale;
        } else {
            // 空中物件隨機高度
            y = Math.random() * (this.height * 0.7);
        }

        // 設定物件屬性
        obj.reset({
            x: this.width,
            y: y,
            type: type,
            layer: config.layer,
            image: image,
            imagePath: imagePath,
            scale: scale,
            alpha: config.alpha.min + Math.random() * (config.alpha.max - config.alpha.min),
            speedFactor: config.speedFactor,
            animation: config.animation || null,
            animationTimer: 0,
            oscillationPhase: Math.random() * Math.PI * 2
        });

        this.pool.active.push(obj);
    }

    /**
     * 從物件池獲取物件
     */
    getFromPool() {
        if (this.pool.inactive.length > 0) {
            return this.pool.inactive.pop();
        }
        return new BackgroundObject();
    }

    /**
     * 回收物件到池中
     */
    returnToPool(obj) {
        obj.reset(null);
        this.pool.inactive.push(obj);
    }

    /**
     * 手動添加特定物件 (例如劇情觸發)
     */
    addObject(type, x = null, y = null) {
        this.spawnObject(type);
        if (this.pool.active.length > 0 && (x !== null || y !== null)) {
            const obj = this.pool.active[this.pool.active.length - 1];
            if (x !== null) obj.x = x;
            if (y !== null) obj.y = y;
        }
    }

    /**
     * 清空所有物件
     */
    clear() {
        this.pool.inactive.push(...this.pool.active);
        this.pool.active = [];
    }

    /**
     * 設定生成速率
     */
    setSpawnRate(interval) {
        this.spawnInterval = Math.max(0.5, interval);
    }

    /**
     * 取得當前物件數量
     */
    getObjectCount() {
        return {
            active: this.pool.active.length,
            pooled: this.pool.inactive.length,
            total: this.pool.active.length + this.pool.inactive.length
        };
    }
}

/**
 * BackgroundObject - 單一背景物件
 */
class BackgroundObject {
    constructor() {
        this.reset(null);
    }

    reset(config) {
        if (config === null) {
            // 重置為空狀態
            this.x = 0;
            this.y = 0;
            this.type = null;
            this.layer = 'mid';
            this.image = null;
            this.imagePath = null;
            this.scale = 1.0;
            this.alpha = 1.0;
            this.speedFactor = 1.0;
            this.animation = null;
            this.animationTimer = 0;
            this.oscillationPhase = 0;
            this.markedForDeletion = false;
            this.width = 0;
            this.height = 0;
        } else {
            // 設定新配置
            Object.assign(this, config);
            this.markedForDeletion = false;
            this.animationTimer = 0;

            // 計算實際尺寸（需等圖片載入）
            this.updateSize();
        }
    }

    updateSize() {
        if (this.image && this.image.complete && this.image.naturalWidth > 0) {
            this.width = this.image.naturalWidth * this.scale;
            this.height = this.image.naturalHeight * this.scale;
        } else {
            // 預設尺寸
            this.width = 100 * this.scale;
            this.height = 100 * this.scale;
        }
    }

    update(dt, baseSpeed) {
        // 如果圖片剛載入完成，更新尺寸
        if (this.width === 0 || this.height === 0) {
            this.updateSize();
        }

        // 視差滾動移動
        const effectiveSpeed = baseSpeed * this.speedFactor;
        this.x -= effectiveSpeed * dt;

        // 動畫效果
        this.animationTimer += dt;

        if (this.animation === 'float') {
            // 氣球浮動
            this.y += Math.sin(this.animationTimer * 2 + this.oscillationPhase) * 0.3;
        } else if (this.animation === 'flap') {
            // 鳥類拍翅（可用於改變縮放模擬拍翅）
            const flapScale = 1.0 + Math.sin(this.animationTimer * 8 + this.oscillationPhase) * 0.05;
            this.currentScale = this.scale * flapScale;
        } else {
            this.currentScale = this.scale;
        }

        // 標記超出畫面的物件
        if (this.x + this.width < 0) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        if (!this.image || !this.image.complete || this.image.naturalWidth === 0) {
            // 圖片未載入，跳過或繪製佔位符
            return;
        }

        ctx.save();
        ctx.globalAlpha = this.alpha;

        const drawScale = this.currentScale || this.scale;
        const drawWidth = this.image.naturalWidth * drawScale;
        const drawHeight = this.image.naturalHeight * drawScale;

        // 繪製圖片
        ctx.drawImage(
            this.image,
            Math.floor(this.x),
            Math.floor(this.y),
            Math.floor(drawWidth),
            Math.floor(drawHeight)
        );

        ctx.restore();
    }

    /**
     * 取得碰撞邊界（通常背景物件不需要碰撞）
     */
    get bounds() {
        return {
            left: this.x,
            right: this.x + this.width,
            top: this.y,
            bottom: this.y + this.height
        };
    }
}
