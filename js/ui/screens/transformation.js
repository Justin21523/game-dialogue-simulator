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

        // 幀動畫配置 (動態根據角色實際幀數計算)
        this.frameConfig = {
            fps: 30,                    // 30 幀每秒
            frameInterval: 1000 / 30,   // ~33.33ms 每幀
        };

        // 預載的幀圖片
        this.frames = [];
        this.currentFrameIndex = 0;
        this.animationId = null;
        this.lastFrameTime = 0;
        this.frameKeyHandler = null;
        this.frameClickHandler = null;
        this.manualMode = true;  // 手動播放模式
        this.keyPressed = {};  // 追蹤按鍵狀態，防止重複觸發
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
                    <span class="pill">按住 Space 播放 (30fps)</span>
                    <span class="pill">← 上一幀</span>
                    <span class="pill">Enter 完成</span>
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
            console.log('[Transformation] Phase 4: Starting frame animation...');
            await this.playFrameAnimation(progressBar);
            console.log('[Transformation] Phase 4: Frame animation completed!');

            // Phase 5: 發光擴散 (動畫結束後)
            console.log('[Transformation] Phase 5: Starting glow effect...');
            console.log('[Transformation] glowEffect exists:', !!this.glowEffect);
            console.log('[Transformation] color:', this.colors.glow || this.colors.background);

            if (this.glowEffect) {
                try {
                    await this.glowEffect.burst(this.colors.glow || this.colors.background);
                    console.log('[Transformation] Glow burst completed successfully!');
                } catch (e) {
                    console.error('[Transformation] Glow effect error:', e);
                }
            } else {
                console.log('[Transformation] Using fallback flash effect');
                flash?.classList.add('active');
                await this.wait(500);
                flash?.classList.remove('active');
            }
            console.log('[Transformation] Phase 5: Glow effect completed!');
        } else {
            // 備用：簡單動畫
            loadingDiv.classList.add('hidden');
            textOverlay.classList.remove('hidden');
            await this.wait(1500);
            textOverlay.classList.add('hidden');
            await this.playLegacyTransformation();
        }

        // Phase 6: 過渡結束
        console.log('[Transformation] Phase 6: Starting transition out...');
        if (this.bgEffect) {
            this.bgEffect.accelerate(3, 800);
            await this.bgEffect.fadeOut(600);
            this.bgEffect.stop();
        }

        await this.wait(400);

        // 清理
        console.log('[Transformation] Cleaning up...');
        this.cleanup();

        // 完成
        console.log('[Transformation] Calling onComplete callback...');
        if (this.onComplete) this.onComplete();
    }

    /**
     * 預載所有動畫幀 (各角色幀數不同: Jett=465, Jerome=753, Donnie=417, Chase=369, Flip=385, Todd=321, Paul=513, Bello=289)
     */
    async preloadAllFrames() {
        const progressDiv = document.getElementById('tf-loading-progress');
        const textDiv = document.getElementById('tf-loading-text');

        // 不傳入 frameCount，讓系統返回該角色的所有幀
        const { frames, cache } = await aiAssetManager.getTransformFrames(this.character.id, {
            useInterpolated: true,
            reverse: false
        });

        this.frames = [];
        let loadedCount = 0;
        const total = frames.length;

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

        console.log(`[Transformation] ========================================`);
        console.log(`[Transformation] Character: ${this.character.id}`);
        console.log(`[Transformation] Frames requested: ${total}`);
        console.log(`[Transformation] Frames loaded: ${loadedCount}/${total}`);
        console.log(`[Transformation] Success rate: ${(loadedCount/total*100).toFixed(1)}%`);

        // 更新 frameConfig 使用實際幀數
        this.frameConfig.totalFrames = this.frames.length;
        this.frameConfig.totalDuration = this.frames.length / this.frameConfig.fps * 1000;

        console.log(`[Transformation] Duration: ${(this.frameConfig.totalDuration / 1000).toFixed(2)}s @ ${this.frameConfig.fps}fps`);
        console.log(`[Transformation] First frame: ${frames[0]}`);
        console.log(`[Transformation] Last frame: ${frames[frames.length - 1]}`);
        console.log(`[Transformation] ========================================`);

        return this.frames.length > 0;
    }

    async loadAnimationPlan() {
        // AI 動畫規劃已被移除 - 直接使用實際幀數計算的時長
        // 各角色的動畫時長由其幀數決定 (不固定)
        if (this.frameConfig.totalFrames) {
            this.planDurationMs = this.frameConfig.totalDuration;
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
     * 手動播放幀動畫（按住 Space 以 30fps 播放，← 上一幀，Enter 完成）
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
        let playTimer = null;
        let isPlaying = false;

        const updateFrame = () => {
            if (this.currentFrameIndex >= total) {
                this.currentFrameIndex = total - 1;
            }
            frameImage.src = this.frames[this.currentFrameIndex].src;
            const progress = (this.currentFrameIndex / (total - 1)) * 100;
            if (progressBar) progressBar.style.width = `${progress}%`;
        };

        updateFrame();

        console.log(`[Transformation] Manual mode: ${total} frames, hold Space to play @ ${this.frameConfig.fps}fps`);

        // 播放邏輯（按住 Space 時以 30fps 播放）
        const startPlaying = () => {
            if (isPlaying) return;
            isPlaying = true;

            const playNextFrame = () => {
                if (!isPlaying) return;

                if (this.currentFrameIndex < total - 1) {
                    this.currentFrameIndex++;
                    updateFrame();
                    playTimer = setTimeout(playNextFrame, this.frameConfig.frameInterval);
                } else {
                    // 播放到最後一幀，自動完成
                    isPlaying = false;
                    console.log('[Transformation] Reached last frame, auto-finishing...');
                    // 短暫延遲後自動完成
                    setTimeout(() => {
                        this.finishManualSequence();
                    }, 300);
                }
            };

            playNextFrame();
        };

        const stopPlaying = () => {
            isPlaying = false;
            if (playTimer) {
                clearTimeout(playTimer);
                playTimer = null;
            }
        };

        // 鍵盤事件
        const keyDownHandler = (e) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                startPlaying();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                stopPlaying();
                if (this.currentFrameIndex > 0) {
                    this.currentFrameIndex--;
                    updateFrame();
                }
            } else if (e.code === 'Enter') {
                e.preventDefault();
                stopPlaying();
                console.log('[Transformation] User pressed Enter, finishing...');
                this.finishManualSequence();
            }
        };

        const keyUpHandler = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                stopPlaying();
            }
        };

        window.addEventListener('keydown', keyDownHandler);
        window.addEventListener('keyup', keyUpHandler);

        this.frameKeyHandler = () => {
            window.removeEventListener('keydown', keyDownHandler);
            window.removeEventListener('keyup', keyUpHandler);
            stopPlaying();
        };

        // 等待完成
        await new Promise(resolve => { this.manualResolve = resolve; });

        console.log(`[Transformation] Playback finished. Viewed ${this.currentFrameIndex + 1}/${total} frames`);
    }

    async finishManualSequence() {
        // 防止重複調用
        if (!this.manualResolve) {
            console.log('[Transformation] finishManualSequence already called, skipping');
            return;
        }

        console.log('[Transformation] finishManualSequence called');

        // 清理鍵盤監聽器
        if (this.frameKeyHandler) {
            this.frameKeyHandler();
            this.frameKeyHandler = null;
        }

        // 顯示最終幀的英雄姿態
        const frameImage = document.getElementById('tf-frame-image');
        if (frameImage) frameImage.classList.add('heroic-pose');

        // 完成 Promise
        console.log('[Transformation] Resolving manualResolve');
        this.manualResolve();
        this.manualResolve = null;
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
        console.log('[Transformation] Cleaning up...');

        // 停止幀動畫
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // 清理鍵盤監聽器
        if (this.frameKeyHandler) {
            window.removeEventListener('keydown', this.frameKeyHandler);
            this.frameKeyHandler = null;
        }

        // 清理點擊監聽器
        const frameContainer = document.getElementById('tf-frame-container');
        if (this.frameClickHandler && frameContainer) {
            frameContainer.removeEventListener('click', this.frameClickHandler);
            this.frameClickHandler = null;
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
