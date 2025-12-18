/**
 * Character3DModel - 3D 角色模型載入器
 * 負責載入 GLTF/GLB 格式的 3D 模型，並提供簡單的動畫控制
 */

import { assetRegistry } from '../../core/asset-registry.js';

export class Character3DModel {
    constructor(modelKey, options = {}) {
        this.modelKey = modelKey;
        this.options = {
            scale: options.scale ?? 1.0,
            offsetY: options.offsetY ?? 0,
            enableAnimations: options.enableAnimations ?? true
        };

        // THREE.js 物件
        this.model = null;          // THREE.Object3D（載入的 GLTF 場景）
        this.mixer = null;          // THREE.AnimationMixer
        this.animations = new Map(); // 動畫名稱 → AnimationAction
        this.currentAnimation = null; // 當前播放的動畫

        // 載入狀態
        this.isLoaded = false;
        this.isLoading = false;
        this.loadError = null;
    }

    /**
     * 載入 3D 模型
     * @returns {Promise<THREE.Object3D>}
     */
    async load() {
        if (this.isLoaded) {
            return this.model;
        }

        if (this.isLoading) {
            // 等待載入完成
            return new Promise((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    if (this.isLoaded) {
                        clearInterval(checkInterval);
                        resolve(this.model);
                    } else if (this.loadError) {
                        clearInterval(checkInterval);
                        reject(this.loadError);
                    }
                }, 100);
            });
        }

        this.isLoading = true;

        try {
            // 從 AssetRegistry 取得模型路徑
            const modelPath = assetRegistry.getAsset(this.modelKey, 'models3d');

            if (!modelPath) {
                throw new Error(`Model not found: ${this.modelKey}`);
            }

            // 使用 GLTFLoader 載入模型
            const gltf = await this._loadGLTF(modelPath);

            this.model = gltf.scene;

            // 縮放
            this.model.scale.set(this.options.scale, this.options.scale, this.options.scale);

            // Y 軸偏移
            this.model.position.y = this.options.offsetY;

            // 設置陰影
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // 載入動畫
            if (this.options.enableAnimations && gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.model);

                gltf.animations.forEach((clip) => {
                    const action = this.mixer.clipAction(clip);
                    this.animations.set(clip.name, action);
                    console.log(`[Character3DModel] Loaded animation: ${clip.name}`);
                });

                // 播放預設動畫（idle 或第一個）
                this.playAnimation('idle') || this.playAnimation(gltf.animations[0].name);
            }

            this.isLoaded = true;
            this.isLoading = false;

            console.log(`[Character3DModel] Loaded model: ${this.modelKey}`);
            return this.model;

        } catch (error) {
            this.loadError = error;
            this.isLoading = false;
            console.error(`[Character3DModel] Failed to load model: ${this.modelKey}`, error);
            throw error;
        }
    }

    /**
     * 使用 GLTFLoader 載入模型
     * @param {string} path - 模型路徑
     * @returns {Promise<Object>} - GLTF 物件
     */
    _loadGLTF(path) {
        return new Promise((resolve, reject) => {
            if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
                reject(new Error('GLTFLoader not available. Please include THREE.js and GLTFLoader.'));
                return;
            }

            const loader = new THREE.GLTFLoader();

            loader.load(
                path,
                (gltf) => resolve(gltf),
                (progress) => {
                    if (progress.lengthComputable) {
                        const percent = (progress.loaded / progress.total) * 100;
                        console.log(`[Character3DModel] Loading ${this.modelKey}: ${percent.toFixed(1)}%`);
                    }
                },
                (error) => reject(error)
            );
        });
    }

    /**
     * 播放動畫
     * @param {string} animationName - 動畫名稱（idle, walk, run 等）
     * @returns {boolean} - 是否成功播放
     */
    playAnimation(animationName) {
        if (!this.mixer || !this.animations.has(animationName)) {
            return false;
        }

        // 停止當前動畫
        if (this.currentAnimation) {
            this.currentAnimation.fadeOut(0.2);
        }

        // 播放新動畫
        const action = this.animations.get(animationName);
        action.reset().fadeIn(0.2).play();
        this.currentAnimation = action;

        return true;
    }

    /**
     * 更新動畫（每幀調用）
     * @param {number} dt - 時間差（秒）
     */
    update(dt) {
        if (this.mixer) {
            this.mixer.update(dt);
        }
    }

    /**
     * 取得模型（用於添加到場景）
     * @returns {THREE.Object3D|null}
     */
    getModel() {
        return this.model;
    }

    /**
     * 銷毀模型
     */
    dispose() {
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }

        if (this.model) {
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
            this.model = null;
        }

        this.animations.clear();
        this.isLoaded = false;

        console.log(`[Character3DModel] Disposed model: ${this.modelKey}`);
    }
}

/**
 * 簡單的模型快取（避免重複載入）
 */
class ModelCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * 取得或載入模型
     * @param {string} modelKey - 模型 key
     * @param {Object} options - 選項
     * @returns {Promise<Character3DModel>}
     */
    async get(modelKey, options = {}) {
        if (!this.cache.has(modelKey)) {
            const model = new Character3DModel(modelKey, options);
            await model.load();
            this.cache.set(modelKey, model);
        }
        return this.cache.get(modelKey);
    }

    /**
     * 清除快取
     */
    clear() {
        for (const model of this.cache.values()) {
            model.dispose();
        }
        this.cache.clear();
    }

    /**
     * 移除特定模型
     * @param {string} modelKey - 模型 key
     */
    remove(modelKey) {
        const model = this.cache.get(modelKey);
        if (model) {
            model.dispose();
            this.cache.delete(modelKey);
        }
    }
}

// 建立全域模型快取
export const modelCache = new ModelCache();
