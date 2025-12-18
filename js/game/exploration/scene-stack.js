/**
 * SceneStack - 場景堆疊管理器
 * 處理建築進入/離開、場景切換、過渡動畫
 */

export class SceneStack {
    constructor(options = {}) {
        // 場景堆疊
        this.stack = [];

        // 當前場景
        this.currentScene = null;

        // 過渡設定
        this.transitionDuration = options.transitionDuration ?? 500;
        this.isTransitioning = false;
        this.transitionProgress = 0;
        this.transitionType = null;  // 'enter' | 'exit'

        // 過渡效果
        this.transitionEffect = options.transitionEffect ?? 'fade';

        // 回調
        this.onSceneChange = options.onSceneChange ?? null;
        this.onTransitionStart = options.onTransitionStart ?? null;
        this.onTransitionEnd = options.onTransitionEnd ?? null;

        // 建築內部生成器 (可注入 AI 生成)
        this.interiorGenerator = options.interiorGenerator ?? null;

        // 場景快取
        this.sceneCache = new Map();
        this.maxCacheSize = options.maxCacheSize ?? 5;
    }

    /**
     * 進入建築/場景
     * @param {string} sceneId - 場景 ID
     * @param {Object} sceneData - 場景資料
     * @param {Object} options - 進入選項
     * @returns {Promise<boolean>}
     */
    async enterScene(sceneId, sceneData = {}, options = {}) {
        if (this.isTransitioning) {
            console.warn('SceneStack: Already transitioning');
            return false;
        }

        // 儲存當前場景到堆疊
        if (this.currentScene) {
            this.stack.push({
                id: this.currentScene.id,
                data: this.currentScene.data,
                playerPosition: options.playerPosition || null,
                timestamp: Date.now()
            });
        }

        // 開始過渡
        this.isTransitioning = true;
        this.transitionType = 'enter';

        if (this.onTransitionStart) {
            this.onTransitionStart({ type: 'enter', sceneId });
        }

        // 執行過渡動畫
        await this.playTransition(options.transition || this.transitionEffect);

        // 載入或生成新場景
        let newScene = this.sceneCache.get(sceneId);
        if (!newScene) {
            newScene = await this.loadOrGenerateScene(sceneId, sceneData);
            this.cacheScene(sceneId, newScene);
        }

        // 設定當前場景
        this.currentScene = {
            id: sceneId,
            data: newScene,
            type: sceneData.type || 'interior',
            parentBuilding: sceneData.parentBuilding || null,
            entryPoint: sceneData.entryPoint || { x: 100, y: 400 }
        };

        this.isTransitioning = false;

        if (this.onTransitionEnd) {
            this.onTransitionEnd({ type: 'enter', sceneId });
        }

        if (this.onSceneChange) {
            this.onSceneChange(this.currentScene, 'enter');
        }

        console.log(`SceneStack: Entered scene "${sceneId}", stack depth: ${this.stack.length}`);
        return true;
    }

    /**
     * 離開當前場景，返回上一層
     * @param {Object} options - 離開選項
     * @returns {Promise<boolean>}
     */
    async exitScene(options = {}) {
        if (this.isTransitioning) {
            console.warn('SceneStack: Already transitioning');
            return false;
        }

        if (this.stack.length === 0) {
            console.warn('SceneStack: No scene to return to');
            return false;
        }

        // 開始過渡
        this.isTransitioning = true;
        this.transitionType = 'exit';

        if (this.onTransitionStart) {
            this.onTransitionStart({ type: 'exit', sceneId: this.currentScene?.id });
        }

        // 執行過渡動畫
        await this.playTransition(options.transition || this.transitionEffect);

        // 取出上一層場景
        const previousScene = this.stack.pop();

        // 設定當前場景
        this.currentScene = {
            id: previousScene.id,
            data: previousScene.data,
            type: previousScene.data?.type || 'exterior',
            returnPosition: previousScene.playerPosition
        };

        this.isTransitioning = false;

        if (this.onTransitionEnd) {
            this.onTransitionEnd({ type: 'exit', sceneId: previousScene.id });
        }

        if (this.onSceneChange) {
            this.onSceneChange(this.currentScene, 'exit');
        }

        console.log(`SceneStack: Exited to scene "${previousScene.id}", stack depth: ${this.stack.length}`);
        return true;
    }

    /**
     * 載入或生成場景
     * @param {string} sceneId - 場景 ID
     * @param {Object} sceneData - 場景資料
     * @returns {Promise<Object>}
     */
    async loadOrGenerateScene(sceneId, sceneData) {
        // 如果有預定義的場景資料，直接使用
        if (sceneData.predefined) {
            return sceneData;
        }

        // 如果有內部生成器，使用 AI 生成
        if (this.interiorGenerator) {
            try {
                const generated = await this.interiorGenerator.generate(sceneId, sceneData);
                return generated;
            } catch (error) {
                console.error('SceneStack: Failed to generate interior', error);
            }
        }

        // 預設場景結構
        return this.createDefaultInterior(sceneId, sceneData);
    }

    /**
     * 創建預設內部場景
     * @param {string} sceneId - 場景 ID
     * @param {Object} sceneData - 場景資料
     * @returns {Object}
     */
    createDefaultInterior(sceneId, sceneData) {
        const buildingTypes = {
            shop: {
                width: 800,
                height: 600,
                background: '#F5F5DC',
                npcs: [
                    { id: `${sceneId}_shopkeeper`, name: '店主', x: 400, y: 350 }
                ],
                items: [],
                exits: [
                    { x: 50, y: 500, targetScene: null }  // null = 返回上一層
                ]
            },
            house: {
                width: 600,
                height: 500,
                background: '#FAEBD7',
                npcs: [],
                items: [],
                exits: [
                    { x: 50, y: 400, targetScene: null }
                ]
            },
            restaurant: {
                width: 1000,
                height: 600,
                background: '#FFF8DC',
                npcs: [
                    { id: `${sceneId}_chef`, name: '廚師', x: 700, y: 350 },
                    { id: `${sceneId}_waiter`, name: '服務生', x: 300, y: 400 }
                ],
                items: [],
                exits: [
                    { x: 50, y: 500, targetScene: null }
                ]
            },
            office: {
                width: 800,
                height: 500,
                background: '#E8E8E8',
                npcs: [],
                items: [],
                exits: [
                    { x: 50, y: 400, targetScene: null }
                ]
            }
        };

        const buildingType = sceneData.buildingType || 'shop';
        const template = buildingTypes[buildingType] || buildingTypes.shop;

        return {
            id: sceneId,
            type: 'interior',
            buildingType: buildingType,
            ...template,
            ...sceneData
        };
    }

    /**
     * 執行過渡動畫
     * @param {string} effect - 效果類型
     * @returns {Promise<void>}
     */
    async playTransition(effect = 'fade') {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const duration = this.transitionDuration;

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                this.transitionProgress = Math.min(elapsed / duration, 1);

                if (this.transitionProgress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.transitionProgress = 0;
                    resolve();
                }
            };

            requestAnimationFrame(animate);
        });
    }

    /**
     * 繪製過渡效果
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     * @param {number} width - 畫布寬度
     * @param {number} height - 畫布高度
     */
    drawTransition(ctx, width, height) {
        if (!this.isTransitioning || this.transitionProgress === 0) return;

        switch (this.transitionEffect) {
            case 'fade':
                this.drawFadeTransition(ctx, width, height);
                break;
            case 'door':
                this.drawDoorTransition(ctx, width, height);
                break;
            case 'slide':
                this.drawSlideTransition(ctx, width, height);
                break;
            case 'circle':
                this.drawCircleTransition(ctx, width, height);
                break;
            default:
                this.drawFadeTransition(ctx, width, height);
        }
    }

    /**
     * 淡入淡出過渡
     */
    drawFadeTransition(ctx, width, height) {
        // 進入時：0->1 淡出，離開時：0->1 淡入
        const alpha = this.transitionType === 'enter'
            ? this.transitionProgress
            : 1 - this.transitionProgress;

        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, width, height);
    }

    /**
     * 門打開/關閉過渡
     */
    drawDoorTransition(ctx, width, height) {
        const progress = this.transitionType === 'enter'
            ? this.transitionProgress
            : 1 - this.transitionProgress;

        const doorWidth = width / 2 * (1 - progress);

        ctx.fillStyle = '#4A2C0A';

        // 左門
        ctx.fillRect(0, 0, doorWidth, height);

        // 右門
        ctx.fillRect(width - doorWidth, 0, doorWidth, height);

        // 門框
        ctx.strokeStyle = '#2E1A06';
        ctx.lineWidth = 10;
        ctx.strokeRect(doorWidth, 0, width - doorWidth * 2, height);
    }

    /**
     * 滑動過渡
     */
    drawSlideTransition(ctx, width, height) {
        const progress = this.transitionType === 'enter'
            ? this.transitionProgress
            : 1 - this.transitionProgress;

        const offset = width * progress;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, offset, height);
    }

    /**
     * 圓形擴散過渡
     */
    drawCircleTransition(ctx, width, height) {
        const progress = this.transitionType === 'enter'
            ? this.transitionProgress
            : 1 - this.transitionProgress;

        const maxRadius = Math.sqrt(width * width + height * height) / 2;
        const radius = maxRadius * (1 - progress);

        const cx = width / 2;
        const cy = height / 2;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * 快取場景
     */
    cacheScene(sceneId, sceneData) {
        if (this.sceneCache.size >= this.maxCacheSize) {
            // 移除最舊的快取
            const firstKey = this.sceneCache.keys().next().value;
            this.sceneCache.delete(firstKey);
        }
        this.sceneCache.set(sceneId, sceneData);
    }

    /**
     * 清除場景快取
     */
    clearCache() {
        this.sceneCache.clear();
    }

    /**
     * 取得當前場景深度
     * @returns {number}
     */
    getDepth() {
        return this.stack.length;
    }

    /**
     * 是否在室內
     * @returns {boolean}
     */
    isIndoors() {
        return this.currentScene?.type === 'interior';
    }

    /**
     * 取得當前場景資料
     * @returns {Object|null}
     */
    getCurrentSceneData() {
        return this.currentScene?.data || null;
    }

    /**
     * 取得返回位置
     * @returns {Object|null}
     */
    getReturnPosition() {
        return this.currentScene?.returnPosition || null;
    }

    /**
     * 取得進入點
     * @returns {Object}
     */
    getEntryPoint() {
        return this.currentScene?.entryPoint || { x: 100, y: 400 };
    }

    /**
     * 設定過渡效果
     * @param {string} effect - 效果類型
     */
    setTransitionEffect(effect) {
        const validEffects = ['fade', 'door', 'slide', 'circle'];
        if (validEffects.includes(effect)) {
            this.transitionEffect = effect;
        }
    }

    /**
     * 設定過渡時長
     * @param {number} duration - 時長（毫秒）
     */
    setTransitionDuration(duration) {
        this.transitionDuration = Math.max(100, Math.min(2000, duration));
    }

    /**
     * 設定內部生成器
     * @param {Object} generator - 生成器實例
     */
    setInteriorGenerator(generator) {
        this.interiorGenerator = generator;
    }

    /**
     * 取得場景堆疊狀態
     * @returns {Object}
     */
    getState() {
        return {
            currentScene: this.currentScene,
            stackDepth: this.stack.length,
            stack: this.stack.map(s => ({ id: s.id, type: s.data?.type })),
            isTransitioning: this.isTransitioning,
            transitionProgress: this.transitionProgress
        };
    }

    /**
     * 重置場景堆疊
     */
    reset() {
        this.stack = [];
        this.currentScene = null;
        this.isTransitioning = false;
        this.transitionProgress = 0;
    }

    /**
     * 銷毀
     */
    dispose() {
        this.reset();
        this.clearCache();
        this.onSceneChange = null;
        this.onTransitionStart = null;
        this.onTransitionEnd = null;
    }
}

/**
 * 建築內部場景生成器 (AI 整合介面)
 * 可被替換為實際的 AI 生成實作
 */
export class InteriorGenerator {
    constructor(apiEndpoint = '/api/v1/scenes/interior') {
        this.apiEndpoint = apiEndpoint;
        this.fallbackTemplates = new Map();
    }

    /**
     * 生成建築內部場景
     * @param {string} buildingId - 建築 ID
     * @param {Object} context - 上下文資訊
     * @returns {Promise<Object>}
     */
    async generate(buildingId, context = {}) {
        try {
            const response = await fetch(`${this.apiEndpoint}/${buildingId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    buildingId,
                    buildingType: context.buildingType,
                    destination: context.destination,
                    missionContext: context.missionContext
                })
            });

            if (!response.ok) {
                throw new Error(`API responded with ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.warn('InteriorGenerator: AI generation failed, using fallback', error);
            return this.generateFallback(buildingId, context);
        }
    }

    /**
     * 降級生成
     */
    generateFallback(buildingId, context) {
        return {
            id: buildingId,
            type: 'interior',
            buildingType: context.buildingType || 'generic',
            width: 800,
            height: 500,
            background: '#E8E8E8',
            npcs: [],
            items: [],
            exits: [{ x: 50, y: 400, targetScene: null }]
        };
    }
}
