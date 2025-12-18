/**
 * SceneManager - 場景管理器
 * 負責場景切換、預載、狀態追蹤與 ParallaxBackground 協調
 */

import { ParallaxBackground, SCENE_PRESETS } from './parallax-background.js';

export class SceneManager {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        // 當前場景
        this.currentScene = null;
        this.currentSceneType = null; // 'flight', 'base', 'destination'
        this.currentSceneData = null;

        // 場景實例
        this.activeBackground = new ParallaxBackground(width, height);
        this.preloadedBackground = null;

        // 場景歷史
        this.sceneHistory = [];
        this.maxHistorySize = 5;

        // 載入狀態
        this.isLoading = false;
        this.isTransitioning = false;
        this.transitionProgress = 0;

        // 場景設定
        this.sceneConfig = {
            flight: {
                defaultWeather: 'clear',
                availableWeathers: Object.keys(SCENE_PRESETS.flight)
            },
            base: {
                defaultScene: 'world_airport',
                availableScenes: SCENE_PRESETS.base
            },
            destination: {
                availableDestinations: SCENE_PRESETS.destinations
            }
        };

        // 預載策略
        this.preloadStrategy = {
            enabled: true,
            predictive: true, // 預測性預載下一個可能場景
            maxPreload: 1 // 最多預載幾個場景
        };
    }

    /**
     * 載入場景（根據類型自動選擇）
     * @param {string} sceneType - 場景類型: 'flight', 'base', 'destination'
     * @param {Object} options - 場景選項
     * @returns {Promise<void>}
     */
    async loadScene(sceneType, options = {}) {
        if (this.isLoading) {
            console.warn('SceneManager: Already loading a scene');
            return;
        }

        this.isLoading = true;

        try {
            // 保存場景歷史
            if (this.currentScene) {
                this.addToHistory({
                    type: this.currentSceneType,
                    data: this.currentSceneData,
                    timestamp: Date.now()
                });
            }

            // 根據場景類型載入
            switch (sceneType) {
                case 'flight':
                    await this.loadFlightScene(options.weather);
                    break;
                case 'base':
                    await this.loadBaseScene(options.scene);
                    break;
                case 'destination':
                    await this.loadDestinationScene(options.location);
                    break;
                default:
                    throw new Error(`Unknown scene type: ${sceneType}`);
            }

            // 更新當前場景狀態
            this.currentSceneType = sceneType;
            this.currentSceneData = options;
            this.currentScene = {
                type: sceneType,
                ...options,
                loadedAt: Date.now()
            };

            // 預載下一個可能的場景
            if (this.preloadStrategy.enabled && this.preloadStrategy.predictive) {
                this.predictAndPreloadNext(sceneType, options);
            }

        } catch (error) {
            console.error('SceneManager: Failed to load scene', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 載入飛行場景
     * @param {string} weather - 天氣類型
     */
    async loadFlightScene(weather = 'clear') {
        const validWeather = this.sceneConfig.flight.availableWeathers.includes(weather)
            ? weather
            : this.sceneConfig.flight.defaultWeather;

        await this.activeBackground.loadFlightScene(validWeather);

        console.log(`SceneManager: Loaded flight scene with weather: ${validWeather}`);
    }

    /**
     * 載入基地場景
     * @param {string} scene - 基地場景類型
     */
    async loadBaseScene(scene = 'world_airport') {
        const validScene = this.sceneConfig.base.availableScenes.includes(scene)
            ? scene
            : this.sceneConfig.base.defaultScene;

        await this.activeBackground.loadBaseScene(validScene);

        console.log(`SceneManager: Loaded base scene: ${validScene}`);
    }

    /**
     * 載入目的地場景
     * @param {string} location - 目的地代碼
     */
    async loadDestinationScene(location) {
        if (!this.sceneConfig.destination.availableDestinations.includes(location)) {
            console.warn(`SceneManager: Invalid destination: ${location}, using default`);
            location = this.sceneConfig.destination.availableDestinations[0];
        }

        await this.activeBackground.loadDestinationScene(location);

        console.log(`SceneManager: Loaded destination scene: ${location}`);
    }

    /**
     * 預載下一個場景
     * @param {string} sceneType - 場景類型
     * @param {Object} options - 場景選項
     */
    async preloadScene(sceneType, options = {}) {
        if (!this.preloadStrategy.enabled) return;

        try {
            // 創建新的背景實例用於預載
            if (!this.preloadedBackground) {
                this.preloadedBackground = new ParallaxBackground(this.width, this.height);
            }

            // 根據類型預載
            switch (sceneType) {
                case 'flight':
                    await this.preloadedBackground.loadFlightScene(options.weather || 'clear');
                    break;
                case 'base':
                    await this.preloadedBackground.loadBaseScene(options.scene || 'world_airport');
                    break;
                case 'destination':
                    if (options.location) {
                        await this.preloadedBackground.loadDestinationScene(options.location);
                    }
                    break;
            }

            console.log(`SceneManager: Preloaded ${sceneType} scene`, options);

        } catch (error) {
            console.error('SceneManager: Failed to preload scene', error);
        }
    }

    /**
     * 預測並預載下一個場景
     * @param {string} currentType - 當前場景類型
     * @param {Object} currentOptions - 當前場景選項
     */
    predictAndPreloadNext(currentType, currentOptions) {
        // 預測邏輯：根據當前場景預測下一個場景
        const predictions = {
            'base': () => {
                // 基地場景後通常是飛行場景
                if (currentOptions.scene === 'runway') {
                    this.preloadScene('flight', { weather: 'clear' });
                }
            },
            'flight': () => {
                // 飛行場景後通常是目的地場景
                // 這裡可以根據任務資料預測目的地
                // 暫時先不預載，因為不確定目的地
            },
            'destination': () => {
                // 目的地場景後可能返回基地或開始新飛行
                this.preloadScene('flight', { weather: 'clear' });
            }
        };

        const predictFn = predictions[currentType];
        if (predictFn) {
            predictFn();
        }
    }

    /**
     * 切換到預載的場景
     * @param {Object} transitionOptions - 過渡選項
     */
    switchToPreloaded(transitionOptions = {}) {
        if (!this.preloadedBackground || !this.preloadedBackground.isLoaded) {
            console.warn('SceneManager: No preloaded scene available');
            return false;
        }

        // 交換背景實例
        const temp = this.activeBackground;
        this.activeBackground = this.preloadedBackground;
        this.preloadedBackground = temp;

        // 更新場景資訊
        this.currentScene = {
            ...this.preloadedBackground.currentScene,
            loadedAt: Date.now()
        };

        console.log('SceneManager: Switched to preloaded scene');
        return true;
    }

    /**
     * 平滑過渡到新場景
     * @param {string} sceneType - 場景類型
     * @param {Object} options - 場景選項
     * @param {number} duration - 過渡時長（毫秒）
     * @returns {Promise<void>}
     */
    async transitionToScene(sceneType, options = {}, duration = 1000) {
        if (this.isTransitioning) {
            console.warn('SceneManager: Already transitioning');
            return;
        }

        this.isTransitioning = true;
        this.transitionProgress = 0;

        try {
            // 先預載新場景
            await this.preloadScene(sceneType, options);

            // 執行淡入淡出過渡
            const startTime = Date.now();

            await new Promise((resolve) => {
                const transitionFrame = () => {
                    const elapsed = Date.now() - startTime;
                    this.transitionProgress = Math.min(elapsed / duration, 1);

                    if (this.transitionProgress >= 1) {
                        resolve();
                    } else {
                        requestAnimationFrame(transitionFrame);
                    }
                };
                requestAnimationFrame(transitionFrame);
            });

            // 切換到預載場景
            this.switchToPreloaded();

            // 更新場景狀態
            this.currentSceneType = sceneType;
            this.currentSceneData = options;

        } finally {
            this.isTransitioning = false;
            this.transitionProgress = 0;
        }
    }

    /**
     * 切換天氣（僅限飛行場景）
     * @param {string} newWeather - 新天氣
     * @param {number} duration - 過渡時長
     */
    async changeWeather(newWeather, duration = 1000) {
        if (this.currentSceneType !== 'flight') {
            console.warn('SceneManager: Can only change weather in flight scenes');
            return;
        }

        await this.activeBackground.transitionWeather(newWeather, duration);

        // 更新場景資料
        if (this.currentSceneData) {
            this.currentSceneData.weather = newWeather;
        }
    }

    /**
     * 新增到場景歷史
     * @param {Object} sceneData - 場景資料
     */
    addToHistory(sceneData) {
        this.sceneHistory.push(sceneData);

        // 限制歷史記錄大小
        if (this.sceneHistory.length > this.maxHistorySize) {
            this.sceneHistory.shift();
        }
    }

    /**
     * 返回上一個場景
     * @returns {Promise<boolean>}
     */
    async goBack() {
        if (this.sceneHistory.length === 0) {
            console.warn('SceneManager: No scene history available');
            return false;
        }

        const previousScene = this.sceneHistory.pop();

        await this.loadScene(previousScene.type, previousScene.data);

        return true;
    }

    /**
     * 取得當前場景資訊
     * @returns {Object}
     */
    getCurrentSceneInfo() {
        return {
            type: this.currentSceneType,
            data: this.currentSceneData,
            scene: this.currentScene,
            isLoading: this.isLoading,
            isTransitioning: this.isTransitioning,
            background: {
                isLoaded: this.activeBackground.isLoaded,
                currentScene: this.activeBackground.currentScene,
                currentWeather: this.activeBackground.currentWeather,
                currentDestination: this.activeBackground.currentDestination
            }
        };
    }

    /**
     * 更新背景（傳遞給 ParallaxBackground）
     * @param {number} dt - Delta time (秒)
     * @param {number} speed - 遊戲速度
     */
    update(dt, speed) {
        if (this.activeBackground.isLoaded) {
            this.activeBackground.update(dt, speed);
        }
    }

    /**
     * 繪製背景（傳遞給 ParallaxBackground）
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     */
    draw(ctx) {
        if (this.activeBackground.isLoaded) {
            this.activeBackground.draw(ctx);
        }

        // 如果正在過渡，繪製淡入淡出效果
        if (this.isTransitioning && this.transitionProgress > 0) {
            this.drawTransitionOverlay(ctx);
        }
    }

    /**
     * 繪製過渡遮罩
     * @param {CanvasRenderingContext2D} ctx
     */
    drawTransitionOverlay(ctx) {
        const alpha = this.transitionProgress < 0.5
            ? this.transitionProgress * 2  // 淡出（0 -> 1）
            : (1 - this.transitionProgress) * 2;  // 淡入（1 -> 0）

        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * 調整大小
     * @param {number} width - 新寬度
     * @param {number} height - 新高度
     */
    resize(width, height) {
        this.width = width;
        this.height = height;

        if (this.activeBackground) {
            this.activeBackground.resize(width, height);
        }

        if (this.preloadedBackground) {
            this.preloadedBackground.resize(width, height);
        }
    }

    /**
     * 清理資源
     */
    dispose() {
        this.activeBackground = null;
        this.preloadedBackground = null;
        this.sceneHistory = [];
        this.currentScene = null;
        this.currentSceneType = null;
        this.currentSceneData = null;
    }

    /**
     * 取得場景統計資訊
     * @returns {Object}
     */
    getStats() {
        return {
            currentScene: this.currentSceneType,
            historySize: this.sceneHistory.length,
            isLoading: this.isLoading,
            isTransitioning: this.isTransitioning,
            preloadEnabled: this.preloadStrategy.enabled,
            hasPreloaded: this.preloadedBackground !== null && this.preloadedBackground.isLoaded
        };
    }

    /**
     * 設定預載策略
     * @param {Object} strategy - 預載策略設定
     */
    setPreloadStrategy(strategy) {
        this.preloadStrategy = {
            ...this.preloadStrategy,
            ...strategy
        };
    }

    /**
     * 驗證場景是否可用
     * @param {string} sceneType - 場景類型
     * @param {Object} options - 場景選項
     * @returns {boolean}
     */
    validateScene(sceneType, options = {}) {
        switch (sceneType) {
            case 'flight':
                return !options.weather ||
                    this.sceneConfig.flight.availableWeathers.includes(options.weather);
            case 'base':
                return !options.scene ||
                    this.sceneConfig.base.availableScenes.includes(options.scene);
            case 'destination':
                return options.location &&
                    this.sceneConfig.destination.availableDestinations.includes(options.location);
            default:
                return false;
        }
    }

    /**
     * 取得隨機場景（用於測試或隨機事件）
     * @param {string} sceneType - 場景類型
     * @returns {Object}
     */
    getRandomScene(sceneType) {
        const random = (arr) => arr[Math.floor(Math.random() * arr.length)];

        switch (sceneType) {
            case 'flight':
                return {
                    type: 'flight',
                    weather: random(this.sceneConfig.flight.availableWeathers)
                };
            case 'base':
                return {
                    type: 'base',
                    scene: random(this.sceneConfig.base.availableScenes)
                };
            case 'destination':
                return {
                    type: 'destination',
                    location: random(this.sceneConfig.destination.availableDestinations)
                };
            default:
                return null;
        }
    }
}

/**
 * 場景轉換效果枚舉
 */
export const TRANSITION_EFFECTS = {
    FADE: 'fade',
    SLIDE_LEFT: 'slide_left',
    SLIDE_RIGHT: 'slide_right',
    ZOOM_IN: 'zoom_in',
    ZOOM_OUT: 'zoom_out',
    DISSOLVE: 'dissolve'
};

/**
 * 場景管理工具函數
 */
export const SceneUtils = {
    /**
     * 取得場景顯示名稱
     * @param {string} sceneType - 場景類型
     * @param {Object} options - 場景選項
     * @returns {string}
     */
    getSceneDisplayName(sceneType, options = {}) {
        const names = {
            flight: {
                clear: '晴空飛行',
                sunset: '日落飛行',
                sunrise: '日出飛行',
                night: '夜間飛行',
                stormy: '暴風雨飛行',
                cloudy: '多雲飛行',
                rainy: '雨中飛行',
                rainbow: '彩虹飛行'
            },
            base: {
                world_airport: '世界機場',
                hangar_interior: '機庫內部',
                runway: '起飛跑道'
            },
            destination: {
                paris: '巴黎',
                tokyo: '東京',
                new_york: '紐約',
                london: '倫敦',
                sydney: '雪梨',
                cairo: '開羅',
                rio: '里約熱內盧',
                beijing: '北京',
                mumbai: '孟買',
                rome: '羅馬',
                dubai: '杜拜',
                moscow: '莫斯科',
                barcelona: '巴塞隆納',
                amsterdam: '阿姆斯特丹',
                bangkok: '曼谷',
                singapore: '新加坡',
                istanbul: '伊斯坦堡',
                athens: '雅典',
                nairobi: '奈洛比',
                mexico_city: '墨西哥城'
            }
        };

        if (sceneType === 'flight' && options.weather) {
            return names.flight[options.weather] || '飛行場景';
        } else if (sceneType === 'base' && options.scene) {
            return names.base[options.scene] || '基地場景';
        } else if (sceneType === 'destination' && options.location) {
            return names.destination[options.location] || '目的地場景';
        }

        return '未知場景';
    },

    /**
     * 取得場景圖示
     * @param {string} sceneType - 場景類型
     * @returns {string}
     */
    getSceneIcon(sceneType) {
        const icons = {
            flight: '✈️',
            base: '🏢',
            destination: '🌍'
        };
        return icons[sceneType] || '📍';
    }
};
