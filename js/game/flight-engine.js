import { InputHandler } from './input.js';
import { Background } from './background.js';
import { ParallaxBackground, SCENE_PRESETS } from './parallax-background.js';
import { Cloud, Obstacle, Collectible } from './entities.js';
import { audioManager } from '../core/audio-manager.js';

export class FlightEngine {
    constructor(canvas, charId, imgPath, onComplete, missionType = 'Delivery', options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.onComplete = onComplete;
        this.missionType = missionType;

        this.input = new InputHandler();

        // 使用新的 2.5D 視差背景系統（可選擇使用舊版）
        this.useParallaxBg = options.useParallax !== false;
        this.weather = options.weather || 'clear';
        this.customBackground = options.customBackground || null; // AI 動態背景

        if (this.useParallaxBg) {
            this.parallaxBg = new ParallaxBackground(this.width, this.height);
            this.background = null; // 不使用舊版
            this.bgReady = false;
            this._initParallaxBackground();
        } else {
            this.background = new Background(this.width, this.height);
            this.parallaxBg = null;
            this.bgReady = true;
        }
        
        // Game State
        this.baseSpeed = 400;
        this.currentSpeed = this.baseSpeed;
        this.distance = 0;
        this.targetDistance = 5000;
        this.score = 0;
        this.isRunning = false;
        
        // Mode Specifics
        this.timeLeft = 60; // For Race mode
        this.rescueCount = 0; // For Rescue mode
        
        // Effects
        this.screenShake = 0;
        this.hitFlashTimer = 0; 
        
        // Player
        this.player = {
            x: 120,
            y: this.height / 2,
            width: 240,   // 更大的機體呈現
            height: 180,
            image: new Image()
        };
        this.player.image.src = imgPath;

        this.entities = [];
        this.spawnTimer = 0;
        
        this.lastTime = 0;
        this.start();
    }

    /**
     * 初始化視差背景
     */
    async _initParallaxBackground() {
        try {
            // 如果有 AI 自定義背景，傳遞給 ParallaxBackground
            if (this.customBackground) {
                await this.parallaxBg.loadFlightScene(this.weather, { customSkyImage: this.customBackground });
            } else {
                await this.parallaxBg.loadFlightScene(this.weather);
            }
            this.bgReady = true;
        } catch (err) {
            console.warn('Failed to load parallax background, falling back to simple background:', err);
            this.background = new Background(this.width, this.height);
            this.useParallaxBg = false;
            this.bgReady = true;
        }
    }

    /**
     * 切換天氣（飛行中）
     */
    async changeWeather(newWeather) {
        if (this.useParallaxBg && this.parallaxBg) {
            this.weather = newWeather;
            await this.parallaxBg.loadFlightScene(newWeather);
        }
    }

    start() {
        this.isRunning = true;
        audioManager.startEngine();
        requestAnimationFrame(this.animate.bind(this));
    }

    animate(timeStamp) {
        if (!this.isRunning) return;
        const dt = Math.min((timeStamp - this.lastTime) / 1000, 0.1);
        this.lastTime = timeStamp;
        this.update(dt);
        this.draw();
        requestAnimationFrame(this.animate.bind(this));
    }

    update(dt) {
        // 1. Movement
        const axis = this.input.axis;
        this.player.x += axis.x * 400 * dt;
        this.player.y += axis.y * 400 * dt;
        this.player.x = Math.max(0, Math.min(this.player.x, this.width - this.player.width));
        this.player.y = Math.max(0, Math.min(this.player.y, this.height - this.player.height));

        // 2. Speed & Boost
        let speedMultiplier = 1.0;
        if (this.input.isBoosting) speedMultiplier = 2.0;
        
        this.currentSpeed = this.baseSpeed * speedMultiplier;
        
        // Race Mode Logic: Time Limit
        if (this.missionType === 'Sports' || this.missionType === 'Race') {
            this.timeLeft -= dt;
            if (this.timeLeft <= 0) {
                // Time Over! Mission Failed (or partial success)
                this.finishGame(false);
            }
        }

        audioManager.setEnginePitch(speedMultiplier);

        if (this.hitFlashTimer > 0) {
            this.currentSpeed *= 0.5;
            this.hitFlashTimer -= dt;
            this.screenShake = 5;
        } else {
            this.screenShake = 0;
        }

        // 3. Spawning
        this.spawnTimer += dt;
        if (this.spawnTimer > 1.0) { 
            const rand = Math.random();
            if (rand < 0.3) {
                this.entities.push(new Obstacle(this.width, this.height));
            } else if (rand < 0.6) {
                this.entities.push(new Collectible(this.width, this.height));
            } else {
                this.entities.push(new Cloud(this.width, this.height));
            }
            this.spawnTimer = 0;
        }

        // 4. Update Entities
        if (this.useParallaxBg && this.parallaxBg) {
            this.parallaxBg.update(dt, this.currentSpeed);
        } else if (this.background) {
            this.background.update(dt, this.currentSpeed);
        }
        this.entities.forEach(e => e.update(dt, this.currentSpeed));
        this.entities = this.entities.filter(e => !e.markedForDeletion);

        // 5. Collision
        this.checkCollisions();

        // 6. Progress
        // 距離只在玩家向右推進時累積，避免自動前進
        if (axis.x > 0) {
            this.distance += this.currentSpeed * dt * axis.x;
        }
        if (this.distance >= this.targetDistance) {
            this.finishGame(true);
        }
    }

    checkCollisions() {
        const pBounds = {
            left: this.player.x + 20,
            right: this.player.x + this.player.width - 20,
            top: this.player.y + 20,
            bottom: this.player.y + this.player.height - 20
        };

        this.entities.forEach(e => {
            if (e.type === 'cloud' || e.markedForDeletion) return;

            const eBounds = e.bounds;
            if (pBounds.left < eBounds.right &&
                pBounds.right > eBounds.left &&
                pBounds.top < eBounds.bottom &&
                pBounds.bottom > eBounds.top) {
                
                this.handleCollision(e);
            }
        });
    }

    handleCollision(entity) {
        if (entity.type === 'obstacle') {
            if (this.hitFlashTimer <= 0) {
                this.hitFlashTimer = 1.0;
                audioManager.playSound('hit');
                this.score = Math.max(0, this.score - 20);
            }
        } else if (entity.type === 'collectible') {
            this.score += 50;
            entity.markedForDeletion = true;
            audioManager.playSound('coin');
        }
    }

    finishGame(success) {
        if (!this.isRunning) return;
        this.isRunning = false;
        audioManager.stopEngine();
        
        // Calculate Final Score
        if (success) {
            // Time bonus for races
            if (this.missionType === 'Sports') {
                this.score += Math.floor(this.timeLeft * 10);
            }
        } else {
            // Failed? Maybe half rewards
            this.score = Math.floor(this.score / 2);
        }

        if (this.onComplete) this.onComplete({ score: this.score, success });
    }

    draw() {
        const dx = (Math.random() - 0.5) * this.screenShake;
        const dy = (Math.random() - 0.5) * this.screenShake;
        this.ctx.save();
        this.ctx.translate(dx, dy);
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // 繪製背景
        if (this.useParallaxBg && this.parallaxBg && this.bgReady) {
            this.parallaxBg.draw(this.ctx);
        } else if (this.background) {
            this.background.draw(this.ctx);
        } else {
            // 備用：純色漸層
            const grad = this.ctx.createLinearGradient(0, 0, 0, this.height);
            grad.addColorStop(0, '#1E90FF');
            grad.addColorStop(1, '#87CEEB');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.entities.forEach(e => e.draw(this.ctx));
        this.drawPlayer();
        
        if (this.hitFlashTimer > 0) {
            this.ctx.fillStyle = `rgba(255, 0, 0, ${this.hitFlashTimer * 0.3})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.drawUI();
        this.ctx.restore();
    }

    drawPlayer() {
        this.ctx.save();
        this.ctx.translate(this.player.x + this.player.width/2, this.player.y + this.player.height/2);
        const rotation = this.input.axis.y * 0.1; 
        this.ctx.rotate(rotation);
        
        if (this.player.image.complete && this.player.image.naturalWidth !== 0) {
            this.ctx.drawImage(this.player.image, -this.player.width/2, -this.player.height/2, this.player.width, this.player.height);
        } else {
            this.ctx.fillStyle = '#FFD700';
            this.ctx.fillRect(-this.player.width/2, -this.player.height/2, this.player.width, this.player.height);
        }
        this.ctx.restore();
    }

    drawUI() {
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 24px Segoe UI, Arial';
        this.ctx.shadowColor = "black";
        this.ctx.shadowBlur = 4;

        this.ctx.fillText(`Dist: ${Math.floor(this.distance)}m`, 20, 40);
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillText(`Score: ${this.score}`, 20, 80);

        // Mode Specific UI
        if (this.missionType === 'Sports') {
            this.ctx.fillStyle = this.timeLeft < 10 ? '#FF5252' : 'white';
            this.ctx.fillText(`Time: ${this.timeLeft.toFixed(1)}s`, this.width - 150, 40);
        }

        const barWidth = 400;
        const pct = Math.min(1, this.distance / this.targetDistance);
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(this.width/2 - barWidth/2, 20, barWidth, 15);
        this.ctx.fillStyle = '#4CAF50';
        this.ctx.fillRect(this.width/2 - barWidth/2 + 2, 22, (barWidth-4) * pct, 11);
    }
}
