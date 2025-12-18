/**
 * Enhanced Launch Screen for Super Wings Simulator
 * Multi-phase takeoff animation with AI-powered image selection
 */

import { gameState } from '../../core/game-state.js';
import { CONFIG } from '../../config.js';
import { audioManager } from '../../core/audio-manager.js';
import { TransformationBackground, TRANSFORMATION_COLORS } from '../effects/transformation-background.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';
import { aiService } from '../../core/ai-service.js';

// Animation phases
const PHASE = {
    LOADING: 'loading',
    READY: 'ready',
    ACCELERATING: 'accelerating',
    LIFTOFF: 'liftoff',
    TRANSITION: 'transition'
};

export class LaunchScreen {
    constructor(containerId, missionId) {
        this.container = document.getElementById(containerId);
        this.missionId = missionId;

        // Core state
        this.speed = 0;
        this.maxSpeed = 100;
        this.progress = 0;
        this.isLaunching = false;
        this.keyPressed = false;
        this.phase = PHASE.LOADING;
        this.narrationText = '';

        // Character data
        this.char = null;
        this.mission = null;

        // Images (AI selected)
        this.images = {
            ready: null,
            takeoff: null,
            flying: null
        };
        this.loadedImages = {};
        this.currentImageKey = 'ready';

        // Canvas & Effects
        this.canvas = null;
        this.ctx = null;
        this.bgCanvas = null;
        this.bgEffect = null;

        // Visual state
        this.shake = 0;
        this.characterY = 0;
        this.characterScale = 1;
        this.clouds = [];
        this.exhaustParticles = [];

        // Timing
        this.lastTime = 0;
        this.phaseStartTime = 0;
        this.liftoffProgressTarget = 250;
        this.liftoffDelay = 1200;
        this.readySoundPlayed = false;
        this.takeoffSoundPlayed = false;

        // Event handlers (bound)
        this.boundKeyDown = this.handleKeyDown.bind(this);
        this.boundKeyUp = this.handleKeyUp.bind(this);
        this.boundResize = this.handleResize.bind(this);
    }

    async render() {
        // ===== Sprint 3.4a: 支援召喚任務 =====
        // 如果 missionId 是物件，代表是召喚任務，直接使用
        if (typeof this.missionId === 'object' && this.missionId?.isSummonMission) {
            this.mission = this.missionId;
            this.missionId = this.mission.id;
            console.log('[Launch] Summon mission detected:', this.mission.characterId);
        } else {
            // 正常任務：從 gameState 中查找
            this.mission = gameState.activeMissions.find(m => m.id === this.missionId);
        }

        if (!this.mission) {
            window.game.renderHangar();
            return;
        }

        this.char = gameState.getCharacter(this.mission.assignedCharId || this.mission.characterId);
        if (!this.char) {
            console.error('[Launch] Character not found');
            window.game.renderHangar();
            return;
        }

        // Render loading state
        this.renderLoadingState();

        // Load images via AI selection
        await this.loadCharacterImages();

        // Load narration (non-blocking)
        this.loadNarration();

        // Render main UI
        this.renderMainUI();

        // Load animation plan (durations/thresholds)
        this.loadAnimationPlan();

        // Initialize systems
        this.initCanvas();
        this.initBackgroundEffect();
        this.initClouds();

        // Bind events
        this.bindEvents();

        // Start
        this.phase = PHASE.READY;
        audioManager.startEngine();
        this.startLoop();
    }

    /**
     * Show loading indicator while AI selects images
     */
    renderLoadingState() {
        this.container.innerHTML = `
            <div class="screen launch-screen launch-loading">
                <div class="loading-indicator">
                    <div class="loading-spinner"></div>
                    <span>Preparing for Launch...</span>
                </div>
            </div>
        `;
    }

    /**
     * Load character images using AI selection
     */
    async loadCharacterImages() {
        console.log(`[Launch] Loading images for ${this.char.id} via AI...`);

        const { selections, cache } = await aiAssetManager.getLaunchImages(this.char.id);
        this.images = selections;
        this.loadedImages = cache;
    }

    /**
     * Preload image files into browser cache
     */
    preloadImageFiles(paths) {
        return Promise.all(paths.map(path => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    this.loadedImages[path] = img;
                    resolve(img);
                };
                img.onerror = () => {
                    console.warn(`[Launch] Failed to load: ${path}`);
                    resolve(null);
                };
                img.src = path;
            });
        }));
    }

    /**
     * Render main launch UI
     */
    renderMainUI() {
        this.container.innerHTML = `
            <div class="screen launch-screen">
                <!-- Background effect canvas -->
                <canvas id="launch-bg-canvas" class="launch-bg-canvas"></canvas>

                <!-- Main canvas -->
                <canvas id="launch-canvas" class="launch-canvas"></canvas>

                <!-- Character layer -->
                <div class="launch-character-container">
                    <img id="launch-character" class="launch-character"
                         src="${this.images.ready?.primary || ''}" alt="${this.char.name}">
                </div>

                <!-- UI overlay -->
                <div class="launch-ui">
                    <div class="launch-header">
                        <div class="mission-info">
                            <span class="mission-label">MISSION</span>
                            <span class="mission-destination">${this.mission.destination || 'Unknown'}</span>
                        </div>
                        <div class="character-info">
                            <span class="char-name">${this.char.name}</span>
                        </div>
                    </div>
                    <div class="launch-narration" id="launch-narration"></div>

                    <div class="launch-controls">
                        <div class="rpm-gauge">
                            <div class="rpm-label">THRUST</div>
                            <div class="rpm-bar-container">
                                <div id="rpm-bar" class="rpm-bar"></div>
                                <div class="rpm-markers">
                                    <span>0</span>
                                    <span>50</span>
                                    <span>MAX</span>
                                </div>
                            </div>
                            <div id="rpm-value" class="rpm-value">0%</div>
                        </div>

                        <div id="launch-hint" class="launch-hint anim-pulse">
                            HOLD [SPACE] TO LAUNCH!
                        </div>

                        <div id="launch-status" class="launch-status"></div>
                    </div>
                </div>

                <!-- Flash overlay for transition -->
                <div id="launch-flash" class="launch-flash"></div>
            </div>
        `;

        this.addStyles();
    }

    async loadNarration() {
        try {
            const res = await aiService.generateNarration({
                characterId: this.char?.id,
                phase: 'departure',
                location: this.mission?.destination,
                problem: this.mission?.description
            });
            this.narrationText = res?.narration || '';
            const el = document.getElementById('launch-narration');
            if (el && this.narrationText) {
                el.textContent = this.narrationText;
            }
            if (res?.offline) {
                aiService.notifyOffline('Launch narration');
            }
        } catch (e) {
            // ignore
        }
    }

    /**
     * Initialize main canvas
     */
    initCanvas() {
        this.canvas = document.getElementById('launch-canvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Initialize background speed line effect
     */
    initBackgroundEffect() {
        this.bgCanvas = document.getElementById('launch-bg-canvas');
        this.bgCanvas.width = window.innerWidth;
        this.bgCanvas.height = window.innerHeight;

        this.bgEffect = new TransformationBackground(this.bgCanvas);

        // Use character-specific colors
        const colors = TRANSFORMATION_COLORS[this.char.id] || TRANSFORMATION_COLORS.jett;
        this.bgEffect.setColors(colors.background, colors.lines);

        // Adjust for horizontal motion feel
        this.bgEffect.config.baseSpeed = 200; // Slower initially
        this.bgEffect.config.lineCount = 40;

        this.bgEffect.start();
        this.bgEffect.fadeProgress = 0.3; // Start subtle
    }

    /**
     * Initialize cloud particles
     */
    initClouds() {
        this.clouds = [];
        for (let i = 0; i < 15; i++) {
            this.clouds.push(this.createCloud(true));
        }
    }

    createCloud(randomY = false) {
        const w = this.canvas?.width || window.innerWidth;
        const h = this.canvas?.height || window.innerHeight;
        return {
            x: w + Math.random() * 200,
            y: randomY ? Math.random() * h : h + Math.random() * 100,
            size: 30 + Math.random() * 80,
            speed: 100 + Math.random() * 200,
            opacity: 0.3 + Math.random() * 0.5
        };
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);
        window.addEventListener('resize', this.boundResize);
    }

    unbindEvents() {
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
        window.removeEventListener('resize', this.boundResize);
    }

    handleKeyDown(e) {
        if (e.code === 'Space' && !this.isLaunching) {
            e.preventDefault();
            this.keyPressed = true;

            if (this.phase === PHASE.READY) {
                this.phase = PHASE.ACCELERATING;
                this.phaseStartTime = performance.now();
            }
        }
    }

    handleKeyUp(e) {
        if (e.code === 'Space') {
            this.keyPressed = false;
        }
    }

    handleResize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
        if (this.bgCanvas) {
            this.bgCanvas.width = window.innerWidth;
            this.bgCanvas.height = window.innerHeight;
        }
        if (this.bgEffect) {
            this.bgEffect.resize();
        }
    }

    async loadAnimationPlan() {
        try {
            const plan = await aiService.planAnimation('launch_sequence', {
                characterId: this.char?.id || 'jett',  // ← 添加必填參數
                durationMs: 5000,
                context: { character: this.char.id, mission: this.mission?.id }
            });
            if (plan?.phases) {
                const accel = plan.phases.find(p => p.name === 'accelerating');
                const liftoff = plan.phases.find(p => p.name === 'liftoff');
                if (accel?.duration_ms) {
                    // Roughly tie progress to duration so longer accel requires more progress
                    this.liftoffProgressTarget = 150 + (accel.duration_ms / 1000) * 120;
                }
                if (liftoff?.duration_ms) {
                    this.liftoffDelay = liftoff.duration_ms;
                }
            }
        } catch (e) {
            // Use defaults on failure
        }
    }

    /**
     * Start animation loop
     */
    startLoop() {
        this.lastTime = performance.now();
        requestAnimationFrame(this.animate.bind(this));
    }

    animate(time) {
        if (!document.getElementById('launch-canvas') || this.phase === PHASE.TRANSITION) {
            return;
        }

        const dt = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;

        this.update(dt, time);
        this.draw(time);

        if (!this.isLaunching) {
            requestAnimationFrame(this.animate.bind(this));
        }
    }

    /**
     * Update game state
     */
    update(dt, time) {
        // Speed logic
        if (this.keyPressed && this.phase === PHASE.ACCELERATING) {
            this.speed = Math.min(this.speed + 60 * dt, this.maxSpeed);
        } else if (this.phase !== PHASE.LIFTOFF) {
            this.speed = Math.max(this.speed - 40 * dt, 0);
        }

        // Update audio
        audioManager.setEnginePitch(this.speed / this.maxSpeed);
        if (this.phase === PHASE.READY && !this.readySoundPlayed) {
            this.readySoundPlayed = true;
            this.playAISound('environment', 'ready');
        }

        // Update visual intensity - 非線性增長，高速時振動更劇烈
        const speedRatio = this.speed / this.maxSpeed;
        this.shake = Math.pow(speedRatio, 1.5) * 12; // 從 6 增加到 12，並使用指數增長

        // Update background effect based on speed
        if (this.bgEffect) {
            this.bgEffect.config.baseSpeed = 200 + speedRatio * 600;
            this.bgEffect.fadeProgress = 0.3 + speedRatio * 0.5;
        }

        // Progress toward takeoff
        if (this.speed > 80) {
            this.progress += this.speed * dt;
        }

        // Phase transitions
        this.updatePhase(dt, time);

        // Update character image based on speed
        this.updateCharacterImage();

        // Update UI
        this.updateUI();

        // Update clouds
        this.updateClouds(dt);

        // Update exhaust particles
        this.updateExhaust(dt);
    }

    updatePhase(dt, time) {
        const speedRatio = this.speed / this.maxSpeed;

        // Check for liftoff
        if (this.progress > this.liftoffProgressTarget && this.phase === PHASE.ACCELERATING) {
            this.phase = PHASE.LIFTOFF;
            this.phaseStartTime = time;

            // Accelerate background
            if (this.bgEffect) {
                this.bgEffect.accelerate(3, 800);
            }

            if (!this.takeoffSoundPlayed) {
                this.takeoffSoundPlayed = true;
                this.playAISound('flight', 'takeoff');
            }
        }

        // Liftoff animation
        if (this.phase === PHASE.LIFTOFF) {
            const elapsed = time - this.phaseStartTime;

            // Character rises up
            this.characterY = Math.min(elapsed / 1000 * 200, 300);
            this.characterScale = 1 + elapsed / 2000;

            // Trigger transition
            if (elapsed > this.liftoffDelay && !this.isLaunching) {
                this.triggerTakeoff();
            }
        }

        // Update character element position with shake
        const charEl = document.getElementById('launch-character');
        if (charEl) {
            // 添加振動效果 - 只影響角色
            const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
            const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;

            charEl.style.transform = `
                translate(${shakeX}px, -${this.characterY + shakeY}px)
                scale(${this.characterScale})
            `;
        }
    }

    updateCharacterImage() {
        const speedRatio = this.speed / this.maxSpeed;
        let targetKey = 'ready';

        if (this.phase === PHASE.LIFTOFF) {
            targetKey = 'flying';
        } else if (speedRatio > 0.6) {
            targetKey = 'takeoff';
        } else if (speedRatio > 0.2) {
            targetKey = 'takeoff';
        }

        if (targetKey !== this.currentImageKey && this.images[targetKey]) {
            this.currentImageKey = targetKey;
            const charEl = document.getElementById('launch-character');
            if (charEl && this.images[targetKey]?.primary) {
                charEl.src = this.images[targetKey].primary;
            }
        }
    }

    updateUI() {
        const pct = (this.speed / this.maxSpeed) * 100;

        // RPM bar
        const bar = document.getElementById('rpm-bar');
        if (bar) {
            bar.style.width = `${pct}%`;
            if (pct > 90) {
                bar.style.backgroundColor = '#ff3333';
            } else if (pct > 70) {
                bar.style.backgroundColor = '#ffaa00';
            } else {
                bar.style.backgroundColor = '#00eaff';
            }
        }

        // RPM value
        const valueEl = document.getElementById('rpm-value');
        if (valueEl) {
            valueEl.textContent = `${Math.round(pct)}%`;
        }

        // Launch hint
        const hintEl = document.getElementById('launch-hint');
        if (hintEl) {
            if (pct > 80) {
                hintEl.textContent = 'MAXIMUM THRUST!';
                hintEl.classList.add('max-thrust');
            } else if (pct > 0) {
                hintEl.textContent = 'KEEP HOLDING!';
                hintEl.classList.remove('max-thrust');
            } else {
                hintEl.textContent = 'HOLD [SPACE] TO LAUNCH!';
                hintEl.classList.remove('max-thrust');
            }
        }

        // Status
        const statusEl = document.getElementById('launch-status');
        if (statusEl) {
            if (this.phase === PHASE.LIFTOFF) {
                statusEl.textContent = 'LIFTOFF!';
                statusEl.classList.add('active');
            } else if (this.speed > 80) {
                statusEl.textContent = 'READY FOR TAKEOFF';
                statusEl.classList.add('active');
            } else {
                statusEl.textContent = '';
                statusEl.classList.remove('active');
            }
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

    updateClouds(dt) {
        const speedRatio = this.speed / this.maxSpeed;

        this.clouds.forEach(cloud => {
            // Move clouds based on speed
            cloud.x -= cloud.speed * speedRatio * dt;

            // In liftoff phase, clouds also move down
            if (this.phase === PHASE.LIFTOFF) {
                cloud.y -= 100 * dt;
            }

            // Reset cloud when off screen
            if (cloud.x < -cloud.size) {
                cloud.x = this.canvas.width + Math.random() * 100;
                cloud.y = Math.random() * this.canvas.height;
            }
        });
    }

    updateExhaust(dt) {
        const speedRatio = this.speed / this.maxSpeed;

        // Add new particles
        if (speedRatio > 0.3) {
            for (let i = 0; i < Math.ceil(speedRatio * 3); i++) {
                this.exhaustParticles.push({
                    x: this.canvas.width / 2 + (Math.random() - 0.5) * 80,
                    y: this.canvas.height / 2 + 150 - this.characterY,
                    vx: (Math.random() - 0.5) * 50,
                    vy: 100 + Math.random() * 200,
                    size: 5 + Math.random() * 15,
                    life: 1,
                    decay: 1 + Math.random()
                });
            }
        }

        // Update particles
        this.exhaustParticles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= p.decay * dt;
            p.size *= 0.98;
        });

        // Remove dead particles
        this.exhaustParticles = this.exhaustParticles.filter(p => p.life > 0);
    }

    /**
     * Draw frame
     */
    draw(time) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        // Clear
        this.ctx.clearRect(0, 0, w, h);

        // Apply shake to entire canvas
        this.ctx.save();
        if (this.shake > 0) {
            const dx = (Math.random() - 0.5) * this.shake;
            const dy = (Math.random() - 0.5) * this.shake;
            this.ctx.translate(dx, dy);
        }

        // Draw clouds
        this.drawClouds();

        // Draw exhaust particles
        this.drawExhaust();

        // Draw speed lines (additional overlay)
        if (this.speed > 60) {
            this.drawSpeedLines(cx, cy);
        }

        this.ctx.restore();
    }

    drawClouds() {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

        this.clouds.forEach(cloud => {
            this.ctx.globalAlpha = cloud.opacity * (this.speed / this.maxSpeed);
            this.ctx.beginPath();
            this.ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
            this.ctx.arc(cloud.x + cloud.size * 0.6, cloud.y - cloud.size * 0.2, cloud.size * 0.7, 0, Math.PI * 2);
            this.ctx.arc(cloud.x + cloud.size * 1.2, cloud.y, cloud.size * 0.8, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.globalAlpha = 1;
    }

    drawExhaust() {
        this.exhaustParticles.forEach(p => {
            const gradient = this.ctx.createRadialGradient(
                p.x, p.y, 0,
                p.x, p.y, p.size
            );
            gradient.addColorStop(0, `rgba(0, 200, 255, ${p.life * 0.8})`);
            gradient.addColorStop(0.5, `rgba(100, 150, 255, ${p.life * 0.4})`);
            gradient.addColorStop(1, `rgba(255, 100, 50, 0)`);

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    drawSpeedLines(cx, cy) {
        const speedRatio = this.speed / this.maxSpeed;
        const lineCount = Math.floor(speedRatio * 15);

        this.ctx.strokeStyle = `rgba(255, 255, 255, ${speedRatio * 0.6})`;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';

        for (let i = 0; i < lineCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 150 + Math.random() * 200;
            const len = 50 + Math.random() * 100 * speedRatio;

            const x1 = cx + Math.cos(angle) * dist;
            const y1 = cy + Math.sin(angle) * dist;
            const x2 = cx + Math.cos(angle) * (dist + len);
            const y2 = cy + Math.sin(angle) * (dist + len);

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        }
    }

    /**
     * Trigger takeoff sequence
     */
    triggerTakeoff() {
        this.isLaunching = true;
        this.phase = PHASE.TRANSITION;

        // Audio
        audioManager.playSound('launch');
        audioManager.stopEngine();

        // Flash effect
        const flash = document.getElementById('launch-flash');
        if (flash) {
            flash.classList.add('active');
        }

        // 粒子爆發效果
        this.createTakeoffParticleBurst();

        // 背景特效加速
        if (this.bgEffect) {
            this.bgEffect.accelerate(5, 600); // 更快速度
        }

        // 角色快速放大並淡出
        const charEl = document.getElementById('launch-character');
        if (charEl) {
            charEl.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
            charEl.style.transform = 'translateY(-200px) scale(2)';
            charEl.style.opacity = '0';
        }

        // Cleanup and transition
        setTimeout(() => {
            this.cleanup();

            // ===== 所有任務都先進入 Flight =====
            if (this.mission.isSummonMission) {
                window.game.renderInFlight(this.mission);
            } else {
                window.game.renderInFlight(this.missionId);
            }
        }, 800);
    }

    /**
     * 創建起飛粒子爆發效果
     */
    createTakeoffParticleBurst() {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2 + 100;

        // 創建 50 個粒子向外擴散
        for (let i = 0; i < 50; i++) {
            const angle = (Math.PI * 2 * i) / 50;
            const speed = 200 + Math.random() * 300;

            this.exhaustParticles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 100, // 向上偏移
                size: 15 + Math.random() * 20,
                life: 1,
                decay: 2 + Math.random()
            });
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.unbindEvents();
        if (this.bgEffect) {
            this.bgEffect.destroy();
        }
    }

    /**
     * Add component styles
     */
    addStyles() {
        if (document.getElementById('launch-screen-styles')) return;

        const style = document.createElement('style');
        style.id = 'launch-screen-styles';
        style.textContent = `
            .launch-screen {
                position: relative;
                width: 100%;
                height: 100%;
                overflow: hidden;
                background: #000;
            }

            .launch-screen.launch-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #1A237E 0%, #0D1137 100%);
            }

            .loading-indicator {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                color: #fff;
                font-size: 18px;
            }

            .loading-spinner {
                width: 48px;
                height: 48px;
                border: 4px solid rgba(255,255,255,0.2);
                border-top-color: #00eaff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            .launch-bg-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1;
            }

            .launch-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 2;
            }

            .launch-character-container {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 3;
                pointer-events: none;
            }

            .launch-character {
                width: 400px;
                height: auto;
                filter: drop-shadow(0 0 20px rgba(0, 234, 255, 0.5));
                transition: transform 0.1s ease-out;
            }

            .launch-ui {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10;
                pointer-events: none;
                display: flex;
                flex-direction: column;
            }

            .launch-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding: 24px;
            }

            .mission-info,
            .character-info {
                background: rgba(0, 0, 0, 0.6);
                padding: 12px 20px;
                border-radius: 8px;
                backdrop-filter: blur(4px);
            }

            .launch-narration {
                margin-top: 12px;
                max-width: 520px;
                background: rgba(0, 0, 0, 0.5);
                color: #e6f7ff;
                padding: 10px 14px;
                border-left: 3px solid #00eaff;
                border-radius: 6px;
                font-size: 14px;
                line-height: 1.4;
            }

            .mission-label {
                display: block;
                font-size: 11px;
                color: #00eaff;
                text-transform: uppercase;
                letter-spacing: 2px;
            }

            .mission-destination {
                display: block;
                font-size: 20px;
                color: #fff;
                font-weight: 700;
            }

            .char-name {
                font-size: 16px;
                color: #FFD700;
                font-weight: 600;
            }

            .launch-controls {
                margin-top: auto;
                padding: 32px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
            }

            .rpm-gauge {
                width: 100%;
                max-width: 500px;
                background: rgba(0, 0, 0, 0.7);
                padding: 16px 24px;
                border-radius: 12px;
                backdrop-filter: blur(4px);
            }

            .rpm-label {
                font-size: 12px;
                color: #888;
                text-transform: uppercase;
                letter-spacing: 2px;
                margin-bottom: 8px;
            }

            .rpm-bar-container {
                position: relative;
                height: 24px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                overflow: hidden;
            }

            .rpm-bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #00eaff, #00ff88);
                border-radius: 12px;
                transition: width 0.05s ease-out, background-color 0.2s;
                box-shadow: 0 0 20px rgba(0, 234, 255, 0.5);
            }

            .rpm-markers {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                display: flex;
                justify-content: space-between;
                padding: 4px 8px;
                font-size: 10px;
                color: #666;
            }

            .rpm-value {
                text-align: center;
                font-size: 28px;
                font-weight: 700;
                color: #00eaff;
                margin-top: 8px;
                font-family: monospace;
            }

            .launch-hint {
                font-size: 20px;
                color: #fff;
                text-shadow: 0 0 10px rgba(0, 234, 255, 0.8);
                pointer-events: auto;
            }

            .launch-hint.max-thrust {
                color: #ff3333;
                text-shadow: 0 0 20px rgba(255, 51, 51, 0.8);
                animation: pulse-fast 0.2s ease-in-out infinite;
            }

            @keyframes pulse-fast {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }

            .launch-status {
                font-size: 32px;
                font-weight: 700;
                color: transparent;
                text-transform: uppercase;
                letter-spacing: 4px;
                transition: all 0.3s ease;
            }

            .launch-status.active {
                color: #FFD700;
                text-shadow: 0 0 30px rgba(255, 215, 0, 0.8);
                animation: status-pulse 0.5s ease-in-out infinite;
            }

            @keyframes status-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }

            .launch-flash {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: radial-gradient(circle, #fff 0%, #87CEEB 50%, #fff 100%);
                opacity: 0;
                z-index: 100;
                pointer-events: none;
                transition: opacity 0.1s ease;
            }

            .launch-flash.active {
                animation: flash-effect 0.8s ease-out forwards;
            }

            @keyframes flash-effect {
                0% {
                    opacity: 0;
                    transform: scale(0.8);
                }
                15% {
                    opacity: 0.9;
                    transform: scale(1);
                }
                30% {
                    opacity: 1;
                    transform: scale(1.1);
                }
                100% {
                    opacity: 1;
                    transform: scale(1.5);
                }
            }

            /* Responsive */
            @media (max-width: 768px) {
                .launch-character {
                    width: 280px;
                }

                .launch-header {
                    padding: 16px;
                }

                .launch-controls {
                    padding: 16px;
                }

                .rpm-gauge {
                    padding: 12px 16px;
                }

                .launch-hint {
                    font-size: 16px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
