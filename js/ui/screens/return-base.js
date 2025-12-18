/**
 * Enhanced Return Screen for Super Wings Simulator
 * Complete return sequence: Celebrate → Reverse Transform → Takeoff → Fly → Land
 */

import { gameState } from '../../core/game-state.js';
import { CONFIG } from '../../config.js';
import { audioManager } from '../../core/audio-manager.js';
import { TransformationBackground, TRANSFORMATION_COLORS } from '../effects/transformation-background.js';
import { GlowBurst } from '../effects/glow-burst.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';
import { aiService } from '../../core/ai-service.js';

// Animation phases
const PHASE = {
    LOADING: 'loading',
    CELEBRATING: 'celebrating',
    REVERSE_TRANSFORM: 'reverse_transform',
    TAKEOFF: 'takeoff',
    FLYING: 'flying',
    LANDING: 'landing',
    COMPLETE: 'complete'
};

export class ReturnScreen {
    constructor(containerId, missionData, onComplete) {
        this.container = document.getElementById(containerId);
        this.missionId = missionData?.mission?.id || missionData?.missionId || missionData || null;
        this.resultData = missionData && missionData.mission ? missionData : null;
        this.onComplete = onComplete;

        // State
        this.phase = PHASE.LOADING;
        this.phaseStartTime = 0;

        // Character data
        this.char = null;
        this.mission = null;

        // Images (AI selected)
        this.images = {
            celebrating: null,
            takeoff: null,
            flying: null,
            landing: null
        };
        this.currentImageKey = 'celebrating';

        // Transform frames for reverse animation
        this.transformFrames = [];
        this.currentFrameIndex = 0;

        // Canvas & Effects
        this.canvas = null;
        this.ctx = null;
        this.bgCanvas = null;
        this.bgEffect = null;
        this.glowCanvas = null;
        this.glowEffect = null;

        // Visual state
        this.characterY = 0;
        this.characterScale = 1;
        this.characterRotation = 0;
        this.characterOpacity = 1;
        this.confettiParticles = [];
        this.clouds = [];
        this.celebrationSoundPlayed = false;
        this.takeoffSoundPlayed = false;
        this.landingSoundPlayed = false;
        this.narrationText = '';

        // Timing
        this.lastTime = 0;
        this.animationId = null;

        // Phase durations (ms)
        this.phaseDurations = {
            celebrating: 2000,
            reverse_transform: 2500,
            takeoff: 1500,
            flying: 2000,
            landing: 1500
        };
    }

    async render() {
        // Get mission and character
        this.mission = this.resultData?.mission
            || gameState.activeMissions.find(m => m.id === this.missionId)
            || null;

        this.char = this.resultData?.char
            ? gameState.getCharacter(this.resultData.char.id) || this.resultData.char
            : (this.mission ? gameState.getCharacter(this.mission.assignedCharId) : null);

        if (!this.mission || !this.char) {
            this.container.innerHTML = `
                <div class="screen return-screen return-error">
                    <div class="error-message">
                        Return flight unavailable. Returning to hangar...
                    </div>
                </div>
            `;
            setTimeout(() => this.onComplete?.(), 1000);
            return;
        }

        // Render loading state
        this.renderLoadingState();

        // Load images and transform frames
        await this.loadResources();

        // Narration (non-blocking)
        this.loadNarration();

        // Render main UI
        this.renderMainUI();

        // Apply narration text if preloaded
        this.applyNarrationText();

        // Fetch narration (non-blocking)
        this.loadNarration();

        // Initialize systems
        this.initCanvas();
        this.initBackgroundEffect();
        this.initGlowEffect();
        this.initClouds();
        this.initConfetti();

        // Add styles
        this.addStyles();

        // Start animation
        this.phase = PHASE.CELEBRATING;
        this.phaseStartTime = performance.now();
        this.startLoop();

        // Play celebration sound
        audioManager.playSound('mission_complete');
    }

    renderLoadingState() {
        this.container.innerHTML = `
            <div class="screen return-screen return-loading">
                <div class="loading-indicator">
                    <div class="loading-spinner"></div>
                    <span>Mission Complete!</span>
                </div>
            </div>
        `;
    }

    async loadResources() {
        console.log(`[Return] Loading resources for ${this.char.id}...`);

        const { selections, cache } = await aiAssetManager.getReturnImages(this.char.id);
        this.images = selections;
        this.loadedImages = cache;

        // Load transform frames for reverse animation
        const { frames, cache: frameCache } = await aiAssetManager.getTransformFrames(this.char.id, {
            frameCount: 30,
            useInterpolated: true,
            reverse: true
        });
        this.transformFrames = frames;
        this.frameCache = frameCache;

        // 取得 AI 動畫規劃（若可用則覆蓋相位時長）
        try {
            const plan = await aiService.planAnimation('return_sequence', {
                characterId: this.char?.id || 'jett',  // ← 添加必填參數
                durationMs: 9000,
                context: { character: this.char.id, mission: this.mission?.id }
            });
            if (plan?.phases) {
                plan.phases.forEach(p => {
                    if (this.phaseDurations[p.name]) {
                        this.phaseDurations[p.name] = p.duration_ms || this.phaseDurations[p.name];
                    }
                });
            }
        } catch (e) {
            // ignore plan errors
        }
    }

    renderMainUI() {
        const destination = this.mission.destination || 'Mission Site';

        this.container.innerHTML = `
            <div class="screen return-screen">
                <!-- Background effect canvas -->
                <canvas id="return-bg-canvas" class="return-bg-canvas"></canvas>

                <!-- Main canvas (clouds, confetti) -->
                <canvas id="return-canvas" class="return-canvas"></canvas>

                <!-- Ground layer -->
                <div id="return-ground" class="return-ground">
                    <div class="ground-surface"></div>
                    <div class="ground-runway"></div>
                </div>

                <!-- Character layer -->
                <div id="return-character-container" class="return-character-container">
                    <img id="return-character" class="return-character"
                         src="${this.images.celebrating?.primary || ''}" alt="${this.char.name}">
                </div>

                <!-- Glow effect canvas -->
                <canvas id="return-glow-canvas" class="return-glow-canvas"></canvas>

                <div class="return-narration" id="return-narration"></div>

                <!-- UI overlay -->
                <div class="return-ui">
                    <div id="return-title" class="return-title">
                        MISSION ACCOMPLISHED!
                    </div>

                    <div id="return-status" class="return-status"></div>

                    <div id="return-destination" class="return-destination">
                        <span class="dest-label">Returning from</span>
                        <span class="dest-name">${destination}</span>
                    </div>
                </div>

                <!-- Flash overlay -->
                <div id="return-flash" class="return-flash"></div>
            </div>
        `;
    }

    initCanvas() {
        this.canvas = document.getElementById('return-canvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx = this.canvas.getContext('2d');
    }

    initBackgroundEffect() {
        this.bgCanvas = document.getElementById('return-bg-canvas');
        this.bgCanvas.width = window.innerWidth;
        this.bgCanvas.height = window.innerHeight;

        this.bgEffect = new TransformationBackground(this.bgCanvas);

        const colors = TRANSFORMATION_COLORS[this.char.id] || TRANSFORMATION_COLORS.jett;
        this.bgEffect.setColors(colors.background, colors.lines);

        // Start with slow upward motion
        this.bgEffect.config.baseSpeed = 100;
        this.bgEffect.config.lineCount = 25;

        this.bgEffect.start();
        this.bgEffect.fadeProgress = 0.3;
    }

    initGlowEffect() {
        this.glowCanvas = document.getElementById('return-glow-canvas');
        this.glowCanvas.width = window.innerWidth;
        this.glowCanvas.height = window.innerHeight;

        this.glowEffect = new GlowBurst(this.glowCanvas);

        const colors = TRANSFORMATION_COLORS[this.char.id] || TRANSFORMATION_COLORS.jett;
        this.glowEffect.setColor(colors.lines);
    }

    initClouds() {
        this.clouds = [];
        for (let i = 0; i < 15; i++) {
            this.clouds.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: 40 + Math.random() * 80,
                speed: 50 + Math.random() * 100,
                opacity: 0.3 + Math.random() * 0.4
            });
        }
    }

    initConfetti() {
        this.confettiParticles = [];
        const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD'];

        for (let i = 0; i < 100; i++) {
            this.confettiParticles.push({
                x: Math.random() * window.innerWidth,
                y: -20 - Math.random() * 200,
                vx: (Math.random() - 0.5) * 100,
                vy: 100 + Math.random() * 200,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 500,
                size: 5 + Math.random() * 10,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1
            });
        }
    }

    startLoop() {
        this.lastTime = performance.now();
        this.animate();
    }

    animate() {
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        this.update(dt, now);
        this.draw();

        if (this.phase !== PHASE.COMPLETE) {
            this.animationId = requestAnimationFrame(() => this.animate());
        }
    }

    update(dt, now) {
        const elapsed = now - this.phaseStartTime;

        switch (this.phase) {
            case PHASE.CELEBRATING:
                this.updateCelebrating(dt, elapsed);
                if (elapsed > this.phaseDurations.celebrating) {
                    this.transitionToPhase(PHASE.REVERSE_TRANSFORM, now);
                }
                break;

            case PHASE.REVERSE_TRANSFORM:
                this.updateReverseTransform(dt, elapsed);
                if (elapsed > this.phaseDurations.reverse_transform) {
                    this.transitionToPhase(PHASE.TAKEOFF, now);
                }
                break;

            case PHASE.TAKEOFF:
                this.updateTakeoff(dt, elapsed);
                if (elapsed > this.phaseDurations.takeoff) {
                    this.transitionToPhase(PHASE.FLYING, now);
                }
                break;

            case PHASE.FLYING:
                this.updateFlying(dt, elapsed);
                if (elapsed > this.phaseDurations.flying) {
                    this.transitionToPhase(PHASE.LANDING, now);
                }
                break;

            case PHASE.LANDING:
                this.updateLanding(dt, elapsed);
                if (elapsed > this.phaseDurations.landing) {
                    this.transitionToPhase(PHASE.COMPLETE, now);
                }
                break;
        }

        // Update particles
        this.updateConfetti(dt);
        this.updateClouds(dt);

        // Update character element
        this.updateCharacterElement();
    }

    updateCelebrating(dt, elapsed) {
        const progress = Math.min(elapsed / this.phaseDurations.celebrating, 1);

        // Bounce effect
        const bounce = Math.sin(elapsed / 150) * 10;
        this.characterY = bounce;
        this.characterScale = 1 + Math.sin(elapsed / 200) * 0.05;

        // Show title
        const titleEl = document.getElementById('return-title');
        if (titleEl && progress > 0.1) {
            titleEl.classList.add('visible');
        }

        // Keep confetti active
        if (progress < 0.8) {
            this.addConfetti(2);
        }

        // Play celebration sound once
        if (!this.celebrationSoundPlayed) {
            this.celebrationSoundPlayed = true;
            this.playAISound('celebration', 'victory');
        }
    }

    updateReverseTransform(dt, elapsed) {
        const progress = Math.min(elapsed / this.phaseDurations.reverse_transform, 1);
        const eased = this.easeInOutQuad(progress);

        // Glow effect at start
        if (progress < 0.1 && !this.reverseGlowTriggered) {
            this.reverseGlowTriggered = true;
            this.glowEffect.trigger();
        }

        // Rotation during transform
        this.characterRotation = eased * 720;
        this.characterScale = 1 - eased * 0.2 + Math.sin(elapsed / 100) * 0.1;

        // Update transform frame
        if (this.transformFrames.length > 0) {
            const frameIndex = Math.floor(eased * (this.transformFrames.length - 1));
            if (frameIndex !== this.currentFrameIndex) {
                this.currentFrameIndex = frameIndex;
                this.setCharacterImage(null, this.transformFrames[frameIndex]);
            }
        }

        // Background speeds up
        if (this.bgEffect) {
            this.bgEffect.config.baseSpeed = 100 + eased * 300;
            this.bgEffect.fadeProgress = 0.3 + eased * 0.4;
        }

        // Status text
        const statusEl = document.getElementById('return-status');
        if (statusEl && progress > 0.3) {
            statusEl.textContent = 'TRANSFORMING...';
            statusEl.classList.add('visible');
        }
    }

    updateTakeoff(dt, elapsed) {
        const progress = Math.min(elapsed / this.phaseDurations.takeoff, 1);
        const eased = this.easeInQuad(progress);

        // Character rises
        this.characterY = -eased * 200;
        this.characterScale = 0.8 + eased * 0.2;
        this.characterRotation = 0;

        // Use takeoff image
        if (this.currentImageKey !== 'takeoff') {
            this.setCharacterImage('takeoff');
        }

        // Background accelerates
        if (this.bgEffect) {
            this.bgEffect.config.baseSpeed = 400 + eased * 400;
        }

        // Ground moves down
        const groundEl = document.getElementById('return-ground');
        if (groundEl) {
            groundEl.style.transform = `translateY(${eased * 100}%)`;
        }

        // Takeoff sound once
        if (!this.takeoffSoundPlayed && progress > 0.1) {
            this.takeoffSoundPlayed = true;
            this.playAISound('flight', 'takeoff');
        }

        // Update status
        const statusEl = document.getElementById('return-status');
        if (statusEl) {
            statusEl.textContent = 'DEPARTING...';
        }

        // Hide destination info
        const destEl = document.getElementById('return-destination');
        if (destEl && progress > 0.3) {
            destEl.classList.add('hidden');
        }
    }

    updateFlying(dt, elapsed) {
        const progress = Math.min(elapsed / this.phaseDurations.flying, 1);

        // Gentle bob during flight
        const bob = Math.sin(elapsed / 200) * 8;
        this.characterY = -200 + bob;
        this.characterScale = 1;

        // Use flying image
        if (this.currentImageKey !== 'flying') {
            this.setCharacterImage('flying');
        }

        // Maintain speed
        if (this.bgEffect) {
            this.bgEffect.config.baseSpeed = 600;
            this.bgEffect.fadeProgress = 0.5;
        }

        // Update status
        const statusEl = document.getElementById('return-status');
        if (statusEl) {
            statusEl.textContent = 'RETURNING TO BASE...';
        }

        // Hide title
        const titleEl = document.getElementById('return-title');
        if (titleEl && progress > 0.2) {
            titleEl.classList.remove('visible');
        }
    }

    updateLanding(dt, elapsed) {
        const progress = Math.min(elapsed / this.phaseDurations.landing, 1);
        const eased = this.easeOutQuad(progress);

        // Character descends
        this.characterY = -200 + eased * 200;
        this.characterScale = 1 - eased * 0.1;

        // Use landing image
        if (this.currentImageKey !== 'landing') {
            this.setCharacterImage('landing');
        }

        // Background slows
        if (this.bgEffect) {
            this.bgEffect.config.baseSpeed = 600 * (1 - eased * 0.8);
            this.bgEffect.fadeProgress = 0.5 * (1 - eased);
        }

        // Ground rises
        const groundEl = document.getElementById('return-ground');
        if (groundEl) {
            groundEl.style.transform = `translateY(${100 - eased * 100}%)`;
        }

        // Final status
        const statusEl = document.getElementById('return-status');
        if (statusEl) {
            statusEl.textContent = 'LANDING AT BASE...';
        }

        if (!this.landingSoundPlayed && progress > 0.2) {
            this.landingSoundPlayed = true;
            this.playAISound('environment', 'landing');
        }
    }

    transitionToPhase(nextPhase, now) {
        this.phase = nextPhase;
        this.phaseStartTime = now;

        if (nextPhase === PHASE.COMPLETE) {
            this.triggerComplete();
        }
    }

    setCharacterImage(key, directPath = null) {
        const charEl = document.getElementById('return-character');
        if (!charEl) return;

        if (directPath) {
            charEl.src = directPath;
            this.currentImageKey = 'transform_frame';
        } else if (key && this.images[key]?.primary) {
            charEl.src = this.images[key].primary;
            this.currentImageKey = key;
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

    updateCharacterElement() {
        const container = document.getElementById('return-character-container');
        if (container) {
            container.style.transform = `
                translateY(${this.characterY}px)
                scale(${this.characterScale})
                rotate(${this.characterRotation}deg)
            `;
            container.style.opacity = this.characterOpacity;
        }
    }

    addConfetti(count) {
        const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1'];
        for (let i = 0; i < count; i++) {
            this.confettiParticles.push({
                x: Math.random() * window.innerWidth,
                y: -20,
                vx: (Math.random() - 0.5) * 150,
                vy: 150 + Math.random() * 200,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 500,
                size: 6 + Math.random() * 8,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1
            });
        }
    }

    updateConfetti(dt) {
        this.confettiParticles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 200 * dt; // gravity
            p.rotation += p.rotationSpeed * dt;
            p.life -= 0.3 * dt;
        });

        this.confettiParticles = this.confettiParticles.filter(p =>
            p.life > 0 && p.y < window.innerHeight + 50
        );
    }

    updateClouds(dt) {
        const speed = this.phase === PHASE.FLYING ? 1 : 0.3;

        this.clouds.forEach(cloud => {
            cloud.x -= cloud.speed * speed * dt;

            if (cloud.x < -cloud.size * 2) {
                cloud.x = window.innerWidth + cloud.size;
                cloud.y = Math.random() * window.innerHeight;
            }
        });
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.clearRect(0, 0, w, h);

        // Draw clouds
        this.drawClouds();

        // Draw confetti
        this.drawConfetti();
    }

    drawClouds() {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

        this.clouds.forEach(cloud => {
            this.ctx.globalAlpha = cloud.opacity;
            this.ctx.beginPath();
            this.ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
            this.ctx.arc(cloud.x + cloud.size * 0.5, cloud.y - cloud.size * 0.3, cloud.size * 0.6, 0, Math.PI * 2);
            this.ctx.arc(cloud.x + cloud.size, cloud.y, cloud.size * 0.7, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.globalAlpha = 1;
    }

    drawConfetti() {
        this.confettiParticles.forEach(p => {
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation * Math.PI / 180);
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            this.ctx.restore();
        });
    }

    triggerComplete() {
        // Flash effect
        const flash = document.getElementById('return-flash');
        if (flash) {
            flash.classList.add('active');
        }

        // Transition
        setTimeout(() => {
            this.cleanup();
            this.onComplete?.();
        }, 800);
    }

    async loadNarration() {
        try {
            const res = await aiService.generateNarration({
                characterId: this.char?.id,
                phase: 'return',
                location: this.mission?.location,
                problem: this.mission?.description,
                result: 'success'
            });
            this.narrationText = res?.narration || '';
            this.applyNarrationText();
            if (res?.offline) {
                aiService.notifyOffline('Return narration');
            }
        } catch (e) {
            // ignore
        }
    }

    applyNarrationText() {
        const el = document.getElementById('return-narration');
        if (el && this.narrationText) {
            el.textContent = this.narrationText;
        }
    }

    cleanup() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.bgEffect) {
            this.bgEffect.destroy();
        }
        if (this.glowEffect) {
            this.glowEffect.destroy();
        }
    }

    easeInQuad(t) {
        return t * t;
    }

    easeOutQuad(t) {
        return t * (2 - t);
    }

    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    addStyles() {
        if (document.getElementById('return-screen-styles')) return;

        const style = document.createElement('style');
        style.id = 'return-screen-styles';
        style.textContent = `
            .return-screen {
                position: relative;
                width: 100%;
                height: 100%;
                overflow: hidden;
                background: #000;
            }

            .return-screen.return-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #1A237E 0%, #0D1137 100%);
            }

            .return-screen.return-error {
                display: flex;
                align-items: center;
                justify-content: center;
                background: #1A237E;
            }

            .error-message {
                color: #fff;
                font-size: 18px;
                text-align: center;
            }

            .return-bg-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1;
            }

            .return-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 2;
            }

            .return-ground {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 30%;
                z-index: 3;
                transform: translateY(100%);
                transition: transform 0.3s ease;
            }

            .ground-surface {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 100%;
                background: linear-gradient(to top,
                    #2d3436 0%,
                    #636e72 100%
                );
            }

            .ground-runway {
                position: absolute;
                bottom: 20%;
                left: 30%;
                right: 30%;
                height: 10px;
                background: repeating-linear-gradient(
                    90deg,
                    #fff 0px,
                    #fff 40px,
                    transparent 40px,
                    transparent 80px
                );
                opacity: 0.8;
            }

            .return-character-container {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 5;
                transition: opacity 0.3s ease;
            }

            .return-character {
                width: 350px;
                height: auto;
                filter: drop-shadow(0 0 30px rgba(255, 215, 0, 0.5));
            }

            .return-glow-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 6;
                pointer-events: none;
            }

            .return-narration {
                position: absolute;
                bottom: 30px;
                left: 30px;
                max-width: 440px;
                background: rgba(0,0,0,0.55);
                color: #e6f7ff;
                padding: 10px 14px;
                border-left: 3px solid #FFD700;
                border-radius: 6px;
                font-size: 14px;
                line-height: 1.4;
                z-index: 9;
            }

            .return-ui {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10;
                pointer-events: none;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                padding: 32px;
            }

            .return-title {
                font-size: 48px;
                font-weight: 700;
                color: #FFD700;
                text-shadow: 0 0 40px rgba(255, 215, 0, 0.8),
                             0 4px 8px rgba(0, 0, 0, 0.5);
                text-transform: uppercase;
                letter-spacing: 6px;
                opacity: 0;
                transform: translateY(-20px);
                transition: all 0.5s ease;
            }

            .return-title.visible {
                opacity: 1;
                transform: translateY(0);
            }

            .return-status {
                font-size: 24px;
                font-weight: 600;
                color: #fff;
                text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
                letter-spacing: 3px;
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .return-status.visible {
                opacity: 1;
            }

            .return-destination {
                display: flex;
                flex-direction: column;
                align-items: center;
                background: rgba(0, 0, 0, 0.6);
                padding: 16px 32px;
                border-radius: 12px;
                backdrop-filter: blur(4px);
                transition: opacity 0.3s ease, transform 0.3s ease;
            }

            .return-destination.hidden {
                opacity: 0;
                transform: translateY(20px);
            }

            .dest-label {
                font-size: 12px;
                color: #00eaff;
                text-transform: uppercase;
                letter-spacing: 2px;
            }

            .dest-name {
                font-size: 20px;
                font-weight: 600;
                color: #fff;
                margin-top: 4px;
            }

            .return-flash {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: #fff;
                opacity: 0;
                z-index: 100;
                pointer-events: none;
            }

            .return-flash.active {
                animation: flash-effect 0.8s ease-out forwards;
            }

            @keyframes flash-effect {
                0% { opacity: 0; }
                30% { opacity: 1; }
                100% { opacity: 1; }
            }

            /* Responsive */
            @media (max-width: 768px) {
                .return-character {
                    width: 250px;
                }

                .return-title {
                    font-size: 28px;
                    letter-spacing: 3px;
                }

                .return-status {
                    font-size: 18px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
