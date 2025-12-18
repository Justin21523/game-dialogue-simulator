import { gameState } from '../../core/game-state.js';
import { CONFIG } from '../../config.js';
import { audioManager } from '../../core/audio-manager.js';
import { TransformationBackground } from '../effects/transformation-background.js';
import { GlowBurst } from '../effects/glow-burst.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';
import { aiService } from '../../core/ai-service.js';

/**
 * EnhancedTransformationScreen - 增強版變身過場動畫
 * 使用 241 幀插值動畫，30fps 播放約 8 秒
 * 包含：速度線背景、幀動畫序列、發光擴散效果
 */
export class TransformationScreen {
    constructor(containerId, missionId, onComplete) {
        this.container = document.getElementById(containerId);
        this.missionId = missionId;
        this.onComplete = onComplete;

        // Canvas 效果
        this.bgCanvas = null;
        this.glowCanvas = null;
        this.bgEffect = null;
        this.glowEffect = null;

        // 角色資料
        this.character = null;
        this.colors = null;

        // 幀動畫配置
        this.frameConfig = {
            fps: 30,                    // 30 幀每秒
            totalFrames: 241,           // 總幀數
            frameInterval: 1000 / 30,   // ~33.33ms 每幀
            totalDuration: 241 / 30 * 1000, // ~8033ms
        };

        // 預載的幀圖片
        this.frames = [];
        this.currentFrameIndex = 0;
        this.animationId = null;
        this.lastFrameTime = 0;
        this.frameKeyHandler = null;
        this.manualMode = true;
        this.transformSoundPlayed = false;
        this.planDurationMs = this.frameConfig.totalDuration;

    }

    render() {
        // ===== 🆕 支援召喚任務：直接使用 missionData 物件 =====
        let mission;
        if (typeof this.missionId === 'object') {
            // missionId 實際上是 missionData 物件（召喚任務）
            mission = this.missionId;
            this.missionId = mission.id;
            console.log('[Transformation] Using summon mission data directly:', mission);
        } else {
            // 正常任務：從 gameState 查找
            mission = gameState.activeMissions.find(m => m.id === this.missionId);
        }

        if (!mission) {
            console.error('[Transformation] Mission not found!');
            window.game.renderHangar();
            return;
        }

        this.character = gameState.getCharacter(mission.assignedCharId || mission.characterId);
        this.colors = CONFIG.TRANSFORMATION_COLORS[this.character.id] || CONFIG.TRANSFORMATION_COLORS.jett;

        // 備用圖片
        const planeImg = aiAssetManager.getCharacterPlaceholder(this.character.id);

        this.container.innerHTML = `
            <div class="screen transformation-screen enhanced">
                <!-- Canvas 層：速度線背景 -->
                <canvas id="tf-bg-canvas" class="tf-canvas-layer bg-layer"></canvas>

                <!-- Canvas 層：發光效果 -->
                <canvas id="tf-glow-canvas" class="tf-canvas-layer glow-layer"></canvas>

                <!-- 舊版背景效果（備用） -->
                <div class="tf-bg-effect-legacy hidden"></div>
                <div class="tf-spotlight"></div>

                <!-- 角色容器 -->
                <div class="tf-character-container">
                    <!-- 幀動畫容器 -->
                    <div id="tf-frame-container" class="tf-frame-container">
                        <img id="tf-frame-image" src="${planeImg}" class="tf-frame-image">
                    </div>

                    <!-- 載入進度 -->
                    <div id="tf-loading" class="tf-loading">
                        <div class="tf-loading-bar">
                            <div id="tf-loading-progress" class="tf-loading-progress"></div>
                        </div>
                        <div id="tf-loading-text" class="tf-loading-text">Loading...</div>
                    </div>

                    <!-- 閃光效果 -->
                    <div class="tf-flash"></div>
                </div>

                <!-- 文字覆蓋 -->
                <div class="tf-text-overlay hidden">
                    <h1 class="tf-shout">${this.character.name}, TRANSFORM!</h1>
                </div>

                <!-- 進度指示器 -->
                <div class="tf-progress-container">
                    <div id="tf-progress-bar" class="tf-progress-bar"></div>
                </div>

                <div class="tf-controls">
                    <span class="pill">Space / → Next Frame</span>
                    <span class="pill">← Previous Frame</span>
                    <span class="pill">Enter Finish</span>
                </div>
            </div>
        `;

        // 初始化 Canvas
        this.initCanvasEffects();

        // 開始動畫序列
        this.startEnhancedSequence();
    }

    /**
     * 初始化 Canvas 效果
     */
    initCanvasEffects() {
        // 背景 Canvas
        this.bgCanvas = document.getElementById('tf-bg-canvas');
        if (this.bgCanvas) {
            this.bgEffect = new TransformationBackground(this.bgCanvas);
            this.bgEffect.setColors(this.colors.background, this.colors.lines);
        }

        // 發光 Canvas
        this.glowCanvas = document.getElementById('tf-glow-canvas');
        if (this.glowCanvas) {
            this.glowEffect = new GlowBurst(this.glowCanvas);
        }

        // 監聽視窗大小變化
        this.resizeHandler = () => {
            if (this.bgEffect) this.bgEffect.resize();
            if (this.glowEffect) this.glowEffect.resize();
        };
        window.addEventListener('resize', this.resizeHandler);
    }

    /**
     * 增強版動畫序列
     */
    async startEnhancedSequence() {
        const loadingDiv = document.getElementById('tf-loading');
        const textOverlay = this.container.querySelector('.tf-text-overlay');
        const flash = this.container.querySelector('.tf-flash');
        const progressBar = document.getElementById('tf-progress-bar');

        // Phase 1: 背景淡入 + 開始速度線 (0-500ms)
        if (this.bgEffect) {
            this.bgEffect.start();
            await this.bgEffect.fadeIn(400);
        }
        await this.wait(100);

        // Phase 2: 預載所有幀並顯示進度
        await this.loadAnimationPlan();
        const framesLoaded = await this.preloadAllFrames();

        if (framesLoaded) {
            // 隱藏載入畫面
            loadingDiv?.classList.add('hidden');

            // Phase 3: 顯示變身口號 (500-2000ms)
            textOverlay?.classList.remove('hidden');
            textOverlay?.classList.add('anim-zoom-in');

            if (!this.transformSoundPlayed) {
                this.transformSoundPlayed = true;
                this.playAISound('transformation', 'transform_ready');
            }

            await this.wait(1200);
            textOverlay?.classList.add('hidden');
            await this.wait(300);

            // Phase 4: 手動逐幀播放（按 Space / → 下一幀，← 上一幀）
            await this.playFrameAnimation(progressBar);

            // Phase 5: 發光擴散 (動畫結束後)
            if (this.glowEffect) {
                await this.glowEffect.burst(this.colors.glow || this.colors.background);
            } else {
                flash.classList.add('active');
                await this.wait(500);
                flash.classList.remove('active');
            }
        } else {
            // 備用：簡單動畫
            loadingDiv.classList.add('hidden');
            textOverlay.classList.remove('hidden');
            await this.wait(1500);
            textOverlay.classList.add('hidden');
            await this.playLegacyTransformation();
        }

        // Phase 6: 過渡結束
        if (this.bgEffect) {
            this.bgEffect.accelerate(3, 800);
            await this.bgEffect.fadeOut(600);
            this.bgEffect.stop();
        }

        await this.wait(400);

        // 清理
        this.cleanup();

        // 完成
        if (this.onComplete) this.onComplete();
    }

    /**
     * 預載所有 241 幀圖片
     */
    async preloadAllFrames() {
        const progressDiv = document.getElementById('tf-loading-progress');
        const textDiv = document.getElementById('tf-loading-text');

        const { frames, cache } = await aiAssetManager.getTransformFrames(this.character.id, {
            frameCount: this.frameConfig.totalFrames,
            useInterpolated: true,
            reverse: false
        });

        this.frames = [];
        let loadedCount = 0;
        const total = frames.length || this.frameConfig.totalFrames;

        frames.forEach((path, index) => {
            const img = cache[path];
            if (img) {
                this.frames[index] = img;
                loadedCount++;
            } else {
                console.warn(`Failed to load frame: ${path}`);
            }

            const progress = (loadedCount / total) * 100;
            if (progressDiv) progressDiv.style.width = `${progress}%`;
            if (textDiv) textDiv.textContent = `Loading... ${Math.round(progress)}%`;
        });

        // Fallback: ensure at least one frame exists
        if (!this.frames.length) {
            const placeholder = new Image();
            placeholder.src = aiAssetManager.getCharacterPlaceholder(this.character.id);
            this.frames = [placeholder];
            loadedCount = 1;
        }

        console.log(`Loaded ${loadedCount}/${total} frames`);
        return this.frames.length > 0;
    }

    async loadAnimationPlan() {
        try {
            const plan = await aiService.planAnimation('transformation_sequence', {
                characterId: this.character?.id || 'jett',  // ← 添加必填參數
                durationMs: this.frameConfig.totalDuration,
                context: { character: this.character?.id }
            });
            if (plan?.duration_ms) {
                this.planDurationMs = plan.duration_ms;
                this.frameConfig.frameInterval = plan.duration_ms / this.frameConfig.totalFrames;
            }
        } catch (e) {
            // use defaults
        }
    }

    async playAISound(category, soundType) {
        try {
            const sound = await aiService.generateSound(category, soundType, { durationMs: 2000 });
            if (sound?.audio_url) {
                const audio = new Audio(sound.audio_url);
                audio.play();
            }
        } catch (e) {
            // ignore
        }
    }

    /**
     * 手動逐幀播放（Space/→ 下一幀，← 上一幀，Enter 完成）
     */
    async playFrameAnimation(progressBar) {
        if (!this.frames.length) {
            await this.playLegacyTransformation();
            return;
        }

        const frameImage = document.getElementById('tf-frame-image');
        if (!frameImage) return;

        this.currentFrameIndex = 0;
        const total = this.frames.length;

        const updateFrame = () => {
            frameImage.src = this.frames[this.currentFrameIndex].src;
            const progress = (this.currentFrameIndex / (total - 1)) * 100;
            if (progressBar) progressBar.style.width = `${progress}%`;
        };

        updateFrame();

        const handler = (e) => {
            if (e.code === 'Space' || e.code === 'ArrowRight') {
                e.preventDefault();
                if (this.currentFrameIndex < total - 1) {
                    this.currentFrameIndex++;
                    updateFrame();
                } else {
                    // 完成
                    this.finishManualSequence();
                }
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (this.currentFrameIndex > 0) {
                    this.currentFrameIndex--;
                    updateFrame();
                }
            } else if (e.code === 'Enter') {
                this.finishManualSequence();
            }
        };

        this.frameKeyHandler = handler;
        window.addEventListener('keydown', handler);

        // 點擊圖片也可下一幀
        const frameContainer = document.getElementById('tf-frame-container');
        if (frameContainer) {
            frameContainer.addEventListener('click', () => handler(new KeyboardEvent('keydown', { code: 'Space' })));
        }

        // 等待 finishManualSequence 觸發
        await new Promise(resolve => { this.manualResolve = resolve; });
    }

    async finishManualSequence() {
        if (this.frameKeyHandler) {
            window.removeEventListener('keydown', this.frameKeyHandler);
            this.frameKeyHandler = null;
        }
        const frameImage = document.getElementById('tf-frame-image');
        if (frameImage) frameImage.classList.add('heroic-pose');
        if (this.manualResolve) {
            this.manualResolve();
            this.manualResolve = null;
        }
    }

    /**
     * 舊版變身動畫（備用）
     */
    async playLegacyTransformation() {
        const frameImage = document.getElementById('tf-frame-image');
        const flash = this.container.querySelector('.tf-flash');

        if (!frameImage) return;

        // 飛機形態
        let takeoffSrc = aiAssetManager.getCharacterPlaceholder(this.character.id);
        try {
            const { selection } = await aiAssetManager.preloadProfileImage(this.character.id, {
                action: 'takeoff',
                game_state: 'mission_start',
                context: 'legacy_transform_takeoff'
            });
            takeoffSrc = selection?.primary || takeoffSrc;
        } catch (e) {
            // fallback 直接使用佔位
        }

        frameImage.src = takeoffSrc;
        frameImage.classList.add('anim-spin-fast');

        await this.wait(1000);

        // 閃光切換
        flash.classList.add('active');
        await this.wait(100);

        // 機器人形態
        frameImage.classList.remove('anim-spin-fast');
        let heroSrc = aiAssetManager.getCharacterPlaceholder(this.character.id);
        try {
            const { selection } = await aiAssetManager.preloadProfileImage(this.character.id, {
                action: 'heroic_pose',
                emotion: 'proud',
                context: 'legacy_transform_hero'
            });
            heroSrc = selection?.primary || heroSrc;
        } catch (e) {
            // 使用佔位
        }

        frameImage.src = heroSrc;
        frameImage.classList.add('anim-hero-landing');

        flash.classList.remove('active');

        await this.wait(2000);
    }

    /**
     * 使用 AI API 獲取變身幀（備用方案）
     */
    async getTransformFramesFromAPI(frameCount = 241) {
        try {
            const response = await fetch(
                `${this.aiApiBase}/transform/${this.character.id}?frame_count=${frameCount}&use_interpolated=true`
            );
            if (response.ok) {
                const data = await response.json();
                return data.frames;
            }
        } catch (e) {
            console.warn('Transform frames API not available:', e);
        }
        return [];
    }

    /**
     * 清理資源
     */
    cleanup() {
        // 停止幀動畫
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.frameKeyHandler) {
            window.removeEventListener('keydown', this.frameKeyHandler);
            this.frameKeyHandler = null;
        }

        // 清空幀緩存
        this.frames = [];

        // 移除事件監聽
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }

        // 銷毀效果
        if (this.bgEffect) {
            this.bgEffect.destroy();
            this.bgEffect = null;
        }
        if (this.glowEffect) {
            this.glowEffect.destroy();
            this.glowEffect = null;
        }
    }

    /**
     * 等待工具函數
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
