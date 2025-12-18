/**
 * Landing Screen - 手動降落控制
 * 玩家需要手動控制飛機降落到基地跑道
 */

import { gameState } from '../../core/game-state.js';
import { eventBus } from '../../core/event-bus.js';  // ===== Sprint 3.4c: 新增 =====
import { audioManager } from '../../core/audio-manager.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';

export class LandingScreen {
    constructor(containerId, missionData, isSummonMission = false) {
        this.container = document.getElementById(containerId);
        this.missionData = missionData;
        this.isSummonMission = isSummonMission;  // ===== Sprint 3.4c: 支援召喚任務 =====

        // 飛機狀態
        this.planeX = 640;
        this.planeY = 100; // 從高空開始
        this.planeVX = 0;
        this.planeVY = 0;
        this.altitude = 500; // 高度（像素）

        // 目標跑道
        this.runwayX = 640;
        this.runwayY = 650;
        this.runwayWidth = 200;
        this.runwayHeight = 40;

        // 控制
        this.keys = {};
        this.isLanded = false;
        this.landingSuccess = false;

        // Canvas
        this.canvas = null;
        this.ctx = null;

        // 時間
        this.lastTime = 0;

        // 圖片
        this.characterImage = null;

        // ===== 🆕 Transform 動畫幀系統 =====
        this.transformFrames = [];
        this.currentFrameIndex = 0;
        this.frameInterval = 1000 / 30; // 30fps = ~33.33ms per frame
        this.lastFrameUpdateTime = 0;
        this.totalFrames = 241;
        this.charId = null;
    }

    async render() {
        // Get mission from active missions (same logic as Transform screen)
        let mission;
        if (typeof this.missionData === 'string') {
            mission = gameState.activeMissions.find(m => m.id === this.missionData);
        } else {
            mission = this.missionData;
        }

        if (!mission && gameState.activeMissions.length > 0) {
            mission = gameState.activeMissions[0];
        }

        // Get character ID (same logic as Transform screen)
        this.charId = mission?.assignedCharId || mission?.characterId || 'jett';
        const char = gameState.getCharacter(this.charId);

        console.log('[Landing] Mission:', mission, 'Character ID:', this.charId, 'Character:', char?.name);

        // Load character image using AI asset manager (same as Transform)
        this.characterImage = aiAssetManager.getCharacterPlaceholder(this.charId);

        // ===== 🆕 預載 Transform 動畫幀 =====
        console.log('[Landing] Preloading Transform animation frames...');
        await this.preloadTransformFrames(this.charId);

        this.container.innerHTML = `
            <div class="screen landing-screen enhanced">
                <!-- Canvas 層：動畫背景 -->
                <canvas id="landing-bg-canvas" class="landing-canvas-bg"></canvas>

                <!-- 角色容器 - 類似 Transform -->
                <div class="landing-character-container">
                    <img id="landing-character-img"
                         src="${this.characterImage}"
                         class="landing-character-image"
                         alt="${char?.name || 'Character'}">
                </div>

                <!-- HUD 覆蓋層 -->
                <div class="landing-hud">
                    <div class="hud-title">🛬 LANDING APPROACH</div>

                    <div class="altitude-meter">
                        <div class="meter-label">ALTITUDE</div>
                        <div class="meter-value" id="altitude-value">500m</div>
                        <div class="meter-bar">
                            <div id="altitude-bar" class="meter-fill"></div>
                        </div>
                    </div>

                    <div class="landing-controls">
                        <div class="control-row">
                            <div class="keys">
                                <span class="key">↑</span>
                                <span class="key">↓</span>
                                <span class="key">←</span>
                                <span class="key">→</span>
                            </div>
                            <div class="desc">CONTROL</div>
                        </div>
                        <div class="control-row">
                            <div class="keys">
                                <span class="key space">SPACE</span>
                            </div>
                            <div class="desc">SLOW DOWN</div>
                        </div>
                    </div>

                    <div class="landing-tip">
                        ⚠️ Land slowly on the runway!
                    </div>
                </div>

                <!-- 隱藏的遊戲 Canvas（用於碰撞檢測） -->
                <canvas id="landing-canvas" style="display: none;"></canvas>
            </div>
        `;

        this.initCanvas();
        this.setupControls();
        this.startLoop();
        this.addStyles();
    }

    initCanvas() {
        this.canvas = document.getElementById('landing-canvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx = this.canvas.getContext('2d');

        // ===== 🔥 CRAZY MODE: Background Animation Canvas =====
        this.bgCanvas = document.getElementById('landing-bg-canvas');
        if (this.bgCanvas) {
            this.bgCanvas.width = window.innerWidth;
            this.bgCanvas.height = window.innerHeight;
            this.bgCtx = this.bgCanvas.getContext('2d');

            // 🔥 CRAZY MODE: 100 lines instead of 30!
            this.bgLines = [];
            for (let i = 0; i < 100; i++) {
                this.bgLines.push({
                    x: Math.random() * this.bgCanvas.width,
                    y: Math.random() * this.bgCanvas.height,
                    length: 80 + Math.random() * 200, // 🔥 Longer lines
                    speed: 400 + Math.random() * 600, // 🔥 Much faster
                    opacity: 0.3 + Math.random() * 0.5, // 🔥 More visible
                    thickness: 2 + Math.random() * 3 // 🔥 Thicker lines
                });
            }
        }

        // ===== 角色圖片動畫 =====
        this.charImg = document.getElementById('landing-character-img');
        this.charY = -100; // 從上方開始
        this.charTargetY = 0; // 目標：畫面中央
        this.charBounce = 0;

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.bgCanvas) {
                this.bgCanvas.width = window.innerWidth;
                this.bgCanvas.height = window.innerHeight;
            }
        });
    }

    setupControls() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.code === 'Space') {
                e.preventDefault();
                this.keys.space = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            if (e.code === 'Space') {
                this.keys.space = false;
            }
        });
    }

    startLoop() {
        this.lastTime = performance.now();
        this.animate();
    }

    animate(time = performance.now()) {
        if (this.isLanded) return;

        const dt = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;

        this.update(dt);
        this.draw();

        requestAnimationFrame((t) => this.animate(t));
    }

    update(dt) {
        // Update background animation
        this.updateBackground(dt);

        // Update character entrance animation
        this.updateCharacterAnimation(dt);

        // Gravity (continuous descent)
        this.planeVY += 50 * dt;

        // Controls
        if (this.keys['a']) this.planeVX -= 300 * dt;
        if (this.keys['d']) this.planeVX += 300 * dt;
        if (this.keys['w']) this.planeVY -= 200 * dt; // Pull up
        if (this.keys['s']) this.planeVY += 200 * dt; // Accelerate descent
        if (this.keys.space) {
            // Space to slow down
            this.planeVX *= 0.95;
            this.planeVY *= 0.95;
        }

        // Speed limits
        this.planeVX = Math.max(-200, Math.min(200, this.planeVX));
        this.planeVY = Math.max(-100, Math.min(300, this.planeVY));

        // Drag
        this.planeVX *= 0.98;

        // Update position
        this.planeX += this.planeVX * dt;
        this.planeY += this.planeVY * dt;

        // Boundaries
        this.planeX = Math.max(50, Math.min(this.canvas.width - 50, this.planeX));

        // Altitude calculation
        this.altitude = Math.max(0, this.runwayY - this.planeY);

        // Check landing
        if (this.planeY >= this.runwayY - 20) {
            this.checkLanding();
        }

        // Update HUD
        this.updateHUD();
    }

    updateBackground(dt) {
        if (!this.bgLines || !this.bgCanvas) return;

        // 🔥 CRAZY MODE: EXTREME speed multiplier
        // planeVY ranges from ~50 to 300, let's make it super dramatic!
        const baseSpeed = this.planeVY / 50; // Much more sensitive
        const speedMultiplier = Math.max(1, baseSpeed * 2); // 2x amplification!

        // Move lines downward based on falling speed
        for (let line of this.bgLines) {
            line.y += line.speed * speedMultiplier * dt;

            // Wrap around when reaching bottom
            if (line.y > this.bgCanvas.height + line.length) {
                line.y = -line.length;
                line.x = Math.random() * this.bgCanvas.width;
            }
        }

        // Draw the background
        this.drawBackground();
    }

    drawBackground() {
        if (!this.bgCtx || !this.bgCanvas) return;

        // Clear background canvas
        this.bgCtx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);

        // Draw gradient background (darker for better contrast)
        const gradient = this.bgCtx.createLinearGradient(0, 0, 0, this.bgCanvas.height);
        gradient.addColorStop(0, '#0a1a2e');
        gradient.addColorStop(0.5, '#1a3050');
        gradient.addColorStop(1, '#2a5080');
        this.bgCtx.fillStyle = gradient;
        this.bgCtx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);

        // 🔥 CRAZY MODE: Draw thicker, brighter lines with glow
        for (let line of this.bgLines) {
            this.bgCtx.globalAlpha = line.opacity;
            this.bgCtx.lineWidth = line.thickness;

            // Add glow effect
            this.bgCtx.shadowBlur = 10;
            this.bgCtx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            this.bgCtx.strokeStyle = '#ffffff';

            this.bgCtx.beginPath();
            this.bgCtx.moveTo(line.x, line.y);
            this.bgCtx.lineTo(line.x, line.y + line.length);
            this.bgCtx.stroke();
        }

        // Reset shadow
        this.bgCtx.shadowBlur = 0;
        this.bgCtx.globalAlpha = 1.0;
    }

    /**
     * 🆕 預載 Transform 動畫幀（241 幀）
     */
    async preloadTransformFrames(characterId) {
        try {
            const { frames, cache } = await aiAssetManager.getTransformFrames(characterId, {
                frameCount: this.totalFrames,
                useInterpolated: true,
                reverse: false
            });

            this.transformFrames = [];
            let loadedCount = 0;

            frames.forEach((path, index) => {
                const img = cache[path];
                if (img) {
                    this.transformFrames[index] = img;
                    loadedCount++;
                } else {
                    console.warn(`[Landing] Failed to load frame: ${path}`);
                }
            });

            // Fallback: use placeholder if no frames loaded
            if (this.transformFrames.length === 0) {
                const placeholder = new Image();
                placeholder.src = this.characterImage;
                this.transformFrames = [placeholder];
            }

            console.log(`[Landing] Loaded ${loadedCount}/${this.totalFrames} transform frames`);
        } catch (error) {
            console.error('[Landing] Error loading transform frames:', error);
            // Fallback: use static placeholder
            const placeholder = new Image();
            placeholder.src = this.characterImage;
            this.transformFrames = [placeholder];
        }
    }

    /**
     * 🆕 更新角色動畫：循環播放 Transform 幀 + 位置映射
     */
    updateCharacterAnimation(dt) {
        if (!this.charImg) return;

        // ===== 🆕 Frame Animation: Cycle through Transform frames at 30fps =====
        const currentTime = performance.now();
        if (currentTime - this.lastFrameUpdateTime >= this.frameInterval && !this.isLanded) {
            this.lastFrameUpdateTime = currentTime;

            // Cycle to next frame
            this.currentFrameIndex = (this.currentFrameIndex + 1) % this.transformFrames.length;

            // Update image source
            if (this.transformFrames[this.currentFrameIndex]) {
                this.charImg.src = this.transformFrames[this.currentFrameIndex].src;
            }
        }

        // ===== Position Mapping: Map game physics position to screen position =====
        // planeY ranges from ~100 (top) to runwayY (bottom ~600)
        const gameHeight = this.runwayY - 100; // Total distance to fall
        const currentHeight = this.planeY - 100; // Current position from top
        const progressRatio = currentHeight / gameHeight; // 0 to 1

        // Map to screen: start at -200px (top) to +300px (bottom)
        const screenTop = -200;
        const screenBottom = 300;
        const screenRange = screenBottom - screenTop;
        const verticalPosition = screenTop + (progressRatio * screenRange);

        // 🔥🔥 ULTRA CRAZY MODE: INSANE horizontal wobble (based on speed)
        const wobbleIntensity = Math.abs(this.planeVX) / 20; // Super sensitive
        const wobbleFrequency = 150; // Much faster wobble
        const wobble = Math.sin(performance.now() / wobbleFrequency) * wobbleIntensity * 40; // DOUBLE amplitude!

        // 🔥🔥 ULTRA CRAZY MODE: EXTREME tilt
        const tilt = (this.planeVX / 80) * 45; // Max 45 degrees!

        // 🔥 Subtle scaling based on height (getting closer to ground)
        const scale = 1 + (progressRatio * 0.2); // Grow slightly as approaching ground

        // Apply transform to character image
        let transform = `translateY(${verticalPosition}px) translateX(${wobble}px)`;
        transform += ` rotate(${tilt}deg)`;
        transform += ` scale(${scale})`;

        this.charImg.style.transform = transform;

        console.log(`[Landing] planeY: ${this.planeY.toFixed(0)}, progress: ${(progressRatio * 100).toFixed(0)}%, screenY: ${verticalPosition.toFixed(0)}px, frame: ${this.currentFrameIndex}/${this.transformFrames.length}`);
    }

    checkLanding() {
        const onRunway = Math.abs(this.planeX - this.runwayX) < this.runwayWidth / 2;
        const speedOK = Math.abs(this.planeVY) < 100 && Math.abs(this.planeVX) < 100;

        this.isLanded = true;

        if (onRunway && speedOK) {
            this.landingSuccess = true;
            this.handleSuccessfulLanding();
        } else {
            this.landingSuccess = false;
            this.handleCrash();
        }
    }

    handleSuccessfulLanding() {
        console.log('[LandingScreen] ===== SUCCESSFUL LANDING =====');
        console.log('[LandingScreen] this.isSummonMission:', this.isSummonMission);
        console.log('[LandingScreen] this.missionData:', this.missionData);

        audioManager.playSound('success');

        // ===== 🆕 恢復預設角色圖片（停止動畫循環）=====
        this.restoreDefaultCharacterImage();

        // 顯示成功訊息
        const successMsg = document.createElement('div');
        successMsg.className = 'landing-result success';

        // ===== Sprint 3.4c: 召喚任務返回探索模式 =====
        if (this.isSummonMission) {
            console.log('[LandingScreen] ✅ Processing SUMMON mission flow');
            successMsg.innerHTML = `
                <h2>✅ PERFECT LANDING!</h2>
                <p>Partner arriving at exploration zone...</p>
            `;
            this.container.appendChild(successMsg);

            setTimeout(() => {
                const characterId = this.missionData?.characterId || this.missionData?.assignedCharId;

                console.log('[LandingScreen] Summon mission complete, returning to exploration');

                // ===== 🆕 清除 Landing UI，準備返回探索模式 =====
                this.container.innerHTML = '';
                console.log('[LandingScreen] Cleared landing UI');

                // 發送 SUMMON_FLOW_RETURN 事件，由 ExplorationScreen 處理
                eventBus.emit('SUMMON_FLOW_RETURN', {
                    characterId: characterId,
                    missionData: this.missionData
                });
            }, 2000);
        } else {
            // ===== 🆕 主任務：進入探索模式 =====
            successMsg.innerHTML = `
                <h2>✅ PERFECT LANDING!</h2>
                <p>Entering exploration mode...</p>
            `;
            this.container.appendChild(successMsg);

            setTimeout(() => {
                console.log('[Landing] Main mission landing complete, starting exploration mode');
                window.game.renderExplorationMode(this.missionData);
            }, 2000);
        }
    }

    handleCrash() {
        console.log('[Landing] CRASH! Showing retry dialog');
        audioManager.playSound('error');

        // ===== 🆕 恢復預設角色圖片（停止動畫循環）=====
        this.restoreDefaultCharacterImage();

        // Crash animation effect (like hitting storm cloud)
        this.playCrashAnimation();

        // Show failure message with retry button and backdrop
        setTimeout(() => {
            // Create backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'crash-backdrop';
            document.body.appendChild(backdrop);

            // Create crash dialog
            const crashMsg = document.createElement('div');
            crashMsg.className = 'landing-result crash';
            crashMsg.innerHTML = `
                <h2>❌ CRASH LANDING!</h2>
                <p>Too fast or missed the runway</p>
                <button id="retry-landing" class="landing-retry-btn">🔄 Try Again</button>
            `;
            document.body.appendChild(crashMsg);

            console.log('[Landing] Crash dialog and backdrop added to body');

            // Add retry button listener
            const retryBtn = document.getElementById('retry-landing');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    console.log('[Landing] Retry clicked');
                    backdrop.remove();
                    crashMsg.remove();
                    this.resetLanding();
                });
            }
        }, 500); // Small delay so player sees the crash animation first
    }

    playCrashAnimation() {
        if (!this.charImg) return;

        // Add crash effect class for shake and flash
        this.charImg.classList.add('crash-effect');

        // Create explosion particles
        this.createCrashParticles();

        // Remove effect after animation
        setTimeout(() => {
            if (this.charImg) {
                this.charImg.classList.remove('crash-effect');
            }
        }, 1000);
    }

    createCrashParticles() {
        const container = this.charImg.parentElement;
        if (!container) return;

        // 🔥 CRAZY MODE: 40 particles instead of 15!
        for (let i = 0; i < 40; i++) {
            const particle = document.createElement('div');
            particle.className = 'crash-particle';

            // Random direction and distance
            const angle = (Math.PI * 2 * i) / 40 + (Math.random() - 0.5) * 0.5;
            const distance = 150 + Math.random() * 250; // 🔥 Much further!
            const endX = Math.cos(angle) * distance;
            const endY = Math.sin(angle) * distance;

            particle.style.setProperty('--end-x', `${endX}px`);
            particle.style.setProperty('--end-y', `${endY}px`);

            // 🔥 Random size variation
            const size = 8 + Math.random() * 8;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;

            container.appendChild(particle);

            // Remove particle after animation
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 1000);
        }
    }

    /**
     * 🆕 恢復預設角色圖片（降落完成後）
     */
    restoreDefaultCharacterImage() {
        if (!this.charImg) return;

        console.log('[Landing] Restoring default character image');

        // Switch back to static placeholder image
        this.charImg.src = this.characterImage;

        // Note: Frame animation will stop automatically because
        // updateCharacterAnimation checks !this.isLanded
    }

    resetLanding() {
        this.planeX = 640;
        this.planeY = 100;
        this.planeVX = 0;
        this.planeVY = 0;
        this.altitude = 500;
        this.isLanded = false;
        this.landingSuccess = false;

        // ===== 🆕 重置幀動畫索引 =====
        this.currentFrameIndex = 0;
        this.lastFrameUpdateTime = 0;

        const resultEl = this.container.querySelector('.landing-result');
        if (resultEl) resultEl.remove();

        this.lastTime = performance.now();
        this.animate();
    }

    updateHUD() {
        const altitudeValue = document.getElementById('altitude-value');
        const altitudeBar = document.getElementById('altitude-bar');

        if (altitudeValue) {
            altitudeValue.textContent = `${Math.round(this.altitude)}m`;
        }

        if (altitudeBar) {
            const percent = Math.min(100, (this.altitude / 500) * 100);
            altitudeBar.style.height = `${percent}%`;
        }
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 清空
        this.ctx.clearRect(0, 0, w, h);

        // 背景漸層（天空）
        const gradient = this.ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, '#87CEEB');
        gradient.addColorStop(0.7, '#E0F7FA');
        gradient.addColorStop(1, '#90EE90');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, w, h);

        // 雲朵（簡單）
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 5; i++) {
            const x = (w / 6) * (i + 0.5);
            const y = 100 + Math.sin(this.lastTime / 1000 + i) * 20;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 40, 0, Math.PI * 2);
            this.ctx.arc(x + 30, y, 50, 0, Math.PI * 2);
            this.ctx.arc(x + 60, y, 40, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // 跑道
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(
            this.runwayX - this.runwayWidth / 2,
            this.runwayY - this.runwayHeight / 2,
            this.runwayWidth,
            this.runwayHeight
        );

        // 跑道標線
        this.ctx.fillStyle = '#fff';
        for (let i = 0; i < 5; i++) {
            const x = this.runwayX - 80 + i * 40;
            this.ctx.fillRect(x, this.runwayY - 3, 25, 6);
        }

        // 對準指示器
        if (this.altitude < 300) {
            const inRange = Math.abs(this.planeX - this.runwayX) < this.runwayWidth / 2;
            this.ctx.strokeStyle = inRange ? '#4CAF50' : '#FF5252';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.planeX, this.planeY + 30);
            this.ctx.lineTo(this.runwayX, this.runwayY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // 飛機（簡單三角形）
        this.ctx.save();
        this.ctx.translate(this.planeX, this.planeY);

        // 傾斜角度（根據速度）
        const tilt = this.planeVX * 0.001;
        this.ctx.rotate(tilt);

        this.ctx.fillStyle = '#E31D2B';
        this.ctx.beginPath();
        this.ctx.moveTo(0, -30);
        this.ctx.lineTo(-20, 10);
        this.ctx.lineTo(20, 10);
        this.ctx.closePath();
        this.ctx.fill();

        // 機翼
        this.ctx.fillStyle = '#0077BE';
        this.ctx.fillRect(-25, 0, 50, 8);

        this.ctx.restore();

        // 速度指示
        if (this.altitude < 200) {
            const speed = Math.sqrt(this.planeVX * this.planeVX + this.planeVY * this.planeVY);
            const speedOK = speed < 141; // sqrt(100^2 + 100^2)

            this.ctx.fillStyle = speedOK ? '#4CAF50' : '#FF5252';
            this.ctx.font = 'bold 24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                `SPEED: ${Math.round(speed)} ${speedOK ? '✓' : '⚠️ TOO FAST'}`,
                w / 2,
                50
            );
        }
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .landing-screen {
                position: relative;
                width: 100%;
                height: 100%;
                background: #000;
            }

            #landing-canvas {
                display: block;
                width: 100%;
                height: 100%;
            }

            .landing-hud {
                position: absolute;
                top: 20px;
                right: 20px;
                background: var(--bg-panel);
                padding: 20px;
                border-radius: 12px;
                min-width: 250px;
                box-shadow: var(--shadow-lg);
            }

            .hud-title {
                font-size: 1.2rem;
                font-weight: bold;
                color: var(--color-primary);
                margin-bottom: 15px;
                text-align: center;
            }

            .altitude-meter {
                margin-bottom: 20px;
            }

            .meter-label {
                font-size: 0.8rem;
                color: var(--text-secondary);
                margin-bottom: 5px;
            }

            .meter-value {
                font-size: 1.5rem;
                font-weight: bold;
                color: var(--color-accent);
                margin-bottom: 10px;
            }

            .meter-bar {
                height: 100px;
                background: var(--bg-secondary);
                border-radius: 8px;
                overflow: hidden;
                position: relative;
            }

            .meter-fill {
                position: absolute;
                bottom: 0;
                width: 100%;
                background: linear-gradient(to top, #4CAF50, #FFD700, #FF5252);
                transition: height 0.1s;
            }

            .landing-controls {
                margin: 20px 0;
            }

            .control-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }

            .keys {
                display: flex;
                gap: 3px;
            }

            .key {
                background: var(--bg-card);
                color: var(--text-main);
                padding: 4px 8px;
                border-radius: 4px;
                font-weight: bold;
                font-size: 0.8rem;
                min-width: 24px;
                text-align: center;
                border: 1px solid var(--border-color);
            }

            .key.space {
                min-width: 60px;
            }

            .desc {
                color: var(--text-secondary);
                font-size: 0.9rem;
            }

            .landing-tip {
                margin-top: 15px;
                padding: 10px;
                background: var(--color-warning);
                color: #333;
                border-radius: 6px;
                font-size: 0.85rem;
                text-align: center;
                font-weight: bold;
            }

            .landing-result {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--bg-panel);
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
                text-align: center;
                min-width: 400px;
                animation: resultPop 0.3s ease-out;
                z-index: 99999;
                border: 3px solid var(--border-color);
            }

            /* Modal backdrop for crash dialog */
            .crash-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                z-index: 99998;
                animation: fadeIn 0.3s ease-out;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes resultPop {
                from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
                to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }

            .landing-result h2 {
                font-size: 2rem;
                margin-bottom: 15px;
            }

            .landing-result.success h2 {
                color: var(--color-success);
            }

            .landing-result.crash h2 {
                color: var(--color-danger);
            }

            .landing-result p {
                font-size: 1.1rem;
                color: var(--text-secondary);
                margin-bottom: 20px;
            }

            .landing-retry-btn {
                padding: 12px 32px;
                font-size: 1.1rem;
                font-weight: bold;
                background: linear-gradient(135deg, #ff6b6b, #ff5252);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(255, 82, 82, 0.4);
                transition: all 0.3s ease;
                text-transform: uppercase;
            }

            .landing-retry-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(255, 82, 82, 0.6);
                background: linear-gradient(135deg, #ff5252, #ff3838);
            }

            .landing-retry-btn:active {
                transform: translateY(0);
            }

            /* Enhanced Landing Screen - Transform-like Style */
            .landing-screen.enhanced {
                overflow: hidden;
            }

            .landing-canvas-bg {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1;
            }

            .landing-character-container {
                position: absolute;
                top: 25%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 600px;
                height: 600px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2;
                pointer-events: none;
            }

            .landing-character-image {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                filter: drop-shadow(0 0 30px rgba(255, 255, 255, 0.3));
                animation: characterGlow 2s ease-in-out infinite;
            }

            @keyframes characterGlow {
                0%, 100% {
                    filter: drop-shadow(0 0 30px rgba(255, 255, 255, 0.3));
                }
                50% {
                    filter: drop-shadow(0 0 50px rgba(255, 255, 255, 0.6));
                }
            }

            /* Crash Animation Effects */
            .landing-character-image.crash-effect {
                animation: crashShake 0.5s ease-in-out, crashFlash 0.1s ease-in-out 3;
            }

            @keyframes crashShake {
                0%, 100% { transform: translate(0, 0) rotate(0deg); }
                10% { transform: translate(-10px, 5px) rotate(-5deg); }
                20% { transform: translate(10px, -5px) rotate(5deg); }
                30% { transform: translate(-8px, -5px) rotate(-3deg); }
                40% { transform: translate(8px, 5px) rotate(3deg); }
                50% { transform: translate(-5px, 0) rotate(-2deg); }
                60% { transform: translate(5px, -2px) rotate(2deg); }
                70% { transform: translate(-3px, 2px) rotate(-1deg); }
                80% { transform: translate(3px, -2px) rotate(1deg); }
                90% { transform: translate(-1px, 0) rotate(-0.5deg); }
            }

            @keyframes crashFlash {
                0%, 100% {
                    filter: drop-shadow(0 0 30px rgba(255, 0, 0, 0.8));
                    opacity: 1;
                }
                50% {
                    filter: drop-shadow(0 0 50px rgba(255, 0, 0, 1));
                    opacity: 0.7;
                }
            }

            .crash-particle {
                position: absolute;
                width: 8px;
                height: 8px;
                background: radial-gradient(circle, #ff4444, #ff8800);
                border-radius: 50%;
                pointer-events: none;
                animation: particleExplode 0.8s ease-out forwards;
                box-shadow: 0 0 10px rgba(255, 68, 68, 0.8);
            }

            @keyframes particleExplode {
                0% {
                    transform: translate(0, 0) scale(1);
                    opacity: 1;
                }
                100% {
                    transform: translate(var(--end-x), var(--end-y)) scale(0);
                    opacity: 0;
                }
            }

            .landing-hud {
                z-index: 3;
            }

            @media (max-width: 768px) {
                .landing-character-container {
                    width: 400px;
                    height: 400px;
                }
            }

            @media (max-width: 480px) {
                .landing-character-container {
                    width: 300px;
                    height: 300px;
                }

                .landing-hud {
                    top: 10px;
                    right: 10px;
                    padding: 15px;
                    min-width: 200px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
