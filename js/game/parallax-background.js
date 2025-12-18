/**
 * ParallaxBackground - 2.5D 多層視差背景系統
 * 支援多層次無限滾動背景，產生深度感
 */

export class ParallaxBackground {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        // 層級定義（從遠到近）
        this.layers = [];

        // 當前場景設定
        this.currentScene = 'flight';  // flight, base, destination
        this.currentWeather = 'clear'; // clear, sunset, night, stormy, etc.
        this.currentDestination = null;

        // 載入狀態
        this.isLoaded = false;
        this.loadPromise = null;

        // 基礎路徑
        this.basePath = 'assets/images/backgrounds';
    }

    /**
     * 載入飛行場景（天空 + 雲層）
     * @param {string} weather - 天氣類型: clear, sunset, sunrise, night, stormy, cloudy, rainy, rainbow
     * @param {object} options - 額外選項，包含 customSkyImage
     */
    async loadFlightScene(weather = 'clear', options = {}) {
        this.currentScene = 'flight';
        this.currentWeather = weather;

        const weatherMap = {
            'clear': 'blue',
            'sunset': 'sunset',
            'sunrise': 'sunrise',
            'night': 'night',
            'stormy': 'stormy',
            'cloudy': 'cloudy',
            'rainy': 'rainy',
            'rainbow': 'rainbow'
        };

        const weatherKey = weatherMap[weather] || 'blue';

        // 定義層級 - 如果有 AI 自定義背景，使用它作為天空層
        const skyImage = options.customSkyImage || `${this.basePath}/sky/sky_${weatherKey}_gradient_v1.png`;

        const layerDefs = [
            {
                id: 'sky',
                images: [skyImage],
                speed: 0.05,
                y: 0,
                height: this.height
            },
            {
                id: 'clouds_far',
                images: this.getVariants(`${this.basePath}/clouds/clouds_far_white`, 3),
                speed: 0.15,
                y: 50,
                height: this.height * 0.4,
                transparent: true
            },
            {
                id: 'clouds_near',
                images: this.getVariants(`${this.basePath}/clouds/clouds_near_white`, 3),
                speed: 0.4,
                y: 100,
                height: this.height * 0.5,
                transparent: true
            }
        ];

        // 特殊天氣調整雲層
        if (weather === 'sunset' || weather === 'sunrise') {
            layerDefs[1].images = this.getVariants(`${this.basePath}/clouds/clouds_far_sunset`, 3);
            layerDefs[2].images = this.getVariants(`${this.basePath}/clouds/clouds_near_sunset`, 3);
        } else if (weather === 'stormy') {
            layerDefs[1].images = this.getVariants(`${this.basePath}/clouds/clouds_storm_dark`, 3);
            layerDefs[2].images = this.getVariants(`${this.basePath}/clouds/clouds_storm_dark`, 3);
        } else if (weather === 'rainy') {
            layerDefs[1].images = this.getVariants(`${this.basePath}/clouds/clouds_rain_gray`, 3);
            layerDefs[2].images = this.getVariants(`${this.basePath}/clouds/clouds_rain_gray`, 3);
        }

        await this.loadLayers(layerDefs);
    }

    /**
     * 載入目的地場景
     * @param {string} location - 地點代碼: paris, tokyo, new_york, etc.
     */
    async loadDestinationScene(location) {
        this.currentScene = 'destination';
        this.currentDestination = location;

        const destPath = `${this.basePath}/destinations/${location}`;

        const layerDefs = [
            {
                id: 'sky',
                images: [`${destPath}/${location}_sky_v1.png`],
                speed: 0.05,
                y: 0,
                height: this.height
            },
            {
                id: 'landmark',
                images: this.getVariants(`${destPath}/${location}_landmark`, 3),
                speed: 0.2,
                y: this.height * 0.1,
                height: this.height * 0.6,
                transparent: true
            },
            {
                id: 'buildings',
                images: this.getVariants(`${destPath}/${location}_buildings`, 3),
                speed: 0.5,
                y: this.height * 0.3,
                height: this.height * 0.7
            },
            {
                id: 'ground',
                images: this.getVariants(`${destPath}/${location}_ground`, 3),
                speed: 0.8,
                y: this.height * 0.7,
                height: this.height * 0.3,
                transparent: true
            }
        ];

        await this.loadLayers(layerDefs);
    }

    /**
     * 載入基地場景
     * @param {string} scene - 場景類型: world_airport, hangar_interior, runway
     */
    async loadBaseScene(scene = 'world_airport') {
        this.currentScene = 'base';

        const basePath = `${this.basePath}/base`;

        const layerDefs = [
            {
                id: 'far',
                images: this.getVariants(`${basePath}/${scene}_far`, 3),
                speed: 0.1,
                y: 0,
                height: this.height
            },
            {
                id: 'mid',
                images: this.getVariants(`${basePath}/${scene}_mid`, 3),
                speed: 0.3,
                y: this.height * 0.2,
                height: this.height * 0.8
            },
            {
                id: 'near',
                images: this.getVariants(`${basePath}/${scene}_near`, 3),
                speed: 0.6,
                y: this.height * 0.5,
                height: this.height * 0.5,
                transparent: true
            }
        ];

        await this.loadLayers(layerDefs);
    }

    /**
     * 取得變體檔案路徑
     */
    getVariants(basePath, count) {
        const variants = [];
        for (let i = 1; i <= count; i++) {
            variants.push(`${basePath}_v${i}.png`);
        }
        return variants;
    }

    /**
     * 載入層級
     */
    async loadLayers(layerDefs) {
        this.layers = [];

        const loadPromises = layerDefs.map(async (def) => {
            const layer = new ParallaxLayer(
                this.width,
                def.height,
                def.speed,
                def.y,
                def.transparent || false
            );

            // 隨機選擇一個變體
            const imageUrl = def.images[Math.floor(Math.random() * def.images.length)];
            await layer.loadImage(imageUrl);

            layer.id = def.id;
            return layer;
        });

        this.layers = await Promise.all(loadPromises);
        this.isLoaded = true;
    }

    /**
     * 更新所有層級
     * @param {number} dt - Delta time in seconds
     * @param {number} speed - Current game speed
     */
    update(dt, speed) {
        for (const layer of this.layers) {
            layer.update(dt, speed);
        }
    }

    /**
     * 繪製所有層級
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        // 從遠到近繪製
        for (const layer of this.layers) {
            layer.draw(ctx);
        }
    }

    /**
     * 調整大小
     */
    resize(width, height) {
        this.width = width;
        this.height = height;

        for (const layer of this.layers) {
            layer.resize(width, layer.originalHeight * (height / this.height));
        }
    }

    /**
     * 切換天氣（平滑過渡）
     */
    async transitionWeather(newWeather, duration = 1000) {
        // TODO: 實作平滑過渡效果
        await this.loadFlightScene(newWeather);
    }
}

/**
 * ParallaxLayer - 單一視差層
 */
class ParallaxLayer {
    constructor(width, height, speed, yOffset = 0, transparent = false) {
        this.width = width;
        this.height = height;
        this.originalHeight = height;
        this.speed = speed;
        this.yOffset = yOffset;
        this.transparent = transparent;

        this.image = null;
        this.isLoaded = false;

        // 雙重緩衝位置（無縫滾動）
        this.x1 = 0;
        this.x2 = width;
    }

    /**
     * 載入圖片
     */
    async loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.image = img;
                this.isLoaded = true;
                resolve();
            };
            img.onerror = () => {
                console.warn(`Failed to load parallax layer: ${url}`);
                this.isLoaded = false;
                resolve(); // 不中斷，繼續運行
            };
            img.src = url;
        });
    }

    /**
     * 更新位置
     */
    update(dt, gameSpeed) {
        const effectiveSpeed = gameSpeed * this.speed;

        this.x1 -= effectiveSpeed * dt;
        this.x2 -= effectiveSpeed * dt;

        // 無縫循環
        if (this.x1 <= -this.width) {
            this.x1 = this.x2 + this.width;
        }
        if (this.x2 <= -this.width) {
            this.x2 = this.x1 + this.width;
        }
    }

    /**
     * 繪製
     */
    draw(ctx) {
        if (!this.isLoaded || !this.image) return;

        // 繪製兩次以實現無縫滾動
        ctx.drawImage(
            this.image,
            Math.floor(this.x1),
            this.yOffset,
            this.width,
            this.height
        );
        ctx.drawImage(
            this.image,
            Math.floor(this.x2),
            this.yOffset,
            this.width,
            this.height
        );
    }

    /**
     * 調整大小
     */
    resize(width, height) {
        const ratio = width / this.width;
        this.width = width;
        this.height = height;
        this.x1 *= ratio;
        this.x2 = this.x1 + width;
    }
}

/**
 * 場景預設配置
 */
export const SCENE_PRESETS = {
    // 飛行場景天氣
    flight: {
        clear: { sky: 'blue', clouds: 'white' },
        sunset: { sky: 'sunset', clouds: 'sunset' },
        sunrise: { sky: 'sunrise', clouds: 'sunset' },
        night: { sky: 'night', clouds: 'white' },
        stormy: { sky: 'stormy', clouds: 'storm' },
        cloudy: { sky: 'cloudy', clouds: 'white' },
        rainy: { sky: 'rainy', clouds: 'rain' },
        rainbow: { sky: 'rainbow', clouds: 'white' }
    },

    // 目的地列表
    destinations: [
        'paris', 'tokyo', 'new_york', 'london', 'sydney',
        'cairo', 'rio', 'beijing', 'mumbai', 'rome',
        'dubai', 'moscow', 'barcelona', 'amsterdam', 'bangkok',
        'singapore', 'istanbul', 'athens', 'nairobi', 'mexico_city'
    ],

    // 基地場景
    base: ['world_airport', 'hangar_interior', 'runway']
};
