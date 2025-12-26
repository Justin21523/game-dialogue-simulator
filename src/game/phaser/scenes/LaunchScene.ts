import Phaser from 'phaser';

import { audioManager } from '../../../shared/audio/audioManager';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { GAME_CONFIG, type CharacterId } from '../../../shared/gameConfig';

type LaunchInitData = {
    missionType?: string;
    charId?: string;
    missionId?: string;
    location?: string;
};

const PHASE = {
    READY: 'ready',
    ACCELERATING: 'accelerating',
    LIFTOFF: 'liftoff',
    TRANSITION: 'transition'
} as const;

type Phase = (typeof PHASE)[keyof typeof PHASE];

const LAUNCH_PLAYER_TARGET_HEIGHT = 960;

type ChargeLine = {
    rect: Phaser.GameObjects.Rectangle;
    xOffset: number;
    yOffset: number;
    amplitude: number;
    speed: number;
    phase: number;
    baseAlpha: number;
    baseScale: number;
};

export class LaunchScene extends Phaser.Scene {
    private missionType = 'Delivery';
    private charId: CharacterId = 'jett';
    private missionId = 'm_local';
    private location = 'world_airport';

    private phase: Phase = PHASE.READY;

    private speed = 0;
    private maxSpeed = 100;
    private progress = 0;
    private liftoffProgressTarget = 250;

    private lastDt = 0;

    private bgFar!: Phaser.GameObjects.TileSprite;
    private bgNear!: Phaser.GameObjects.TileSprite;
    private clouds!: Phaser.GameObjects.Group;

    private player!: Phaser.GameObjects.Sprite;
    private playerBaseY = GAME_HEIGHT / 2;
    private playerRise = 0;

    private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
    private engineGlow!: Phaser.GameObjects.Ellipse;
    private chargeLines: ChargeLine[] = [];
    private chargeLinesTime = 0;

    private gaugeBar!: Phaser.GameObjects.Rectangle;
    private gaugeText!: Phaser.GameObjects.Text;
    private hintText!: Phaser.GameObjects.Text;

    private spaceKey?: Phaser.Input.Keyboard.Key;
    private wasCharging = false;

    constructor() {
        super({ key: 'LaunchScene' });
    }

    init(data: LaunchInitData) {
        this.missionType = data.missionType ?? 'Delivery';
        this.missionId = data.missionId ?? 'm_local';
        this.location = data.location ?? 'world_airport';

        const requested = (data.charId ?? 'jett').toLowerCase();
        if (requested in GAME_CONFIG.CHARACTERS) {
            this.charId = requested as CharacterId;
        } else {
            this.charId = 'jett';
        }
    }

    preload() {
        const playerTextureKey = this.getLaunchPlayerTextureKey(this.charId);
        if (!this.textures.exists(playerTextureKey)) {
            this.load.image(playerTextureKey, this.getLaunchPlayerTexturePath(this.charId));
        }
    }

    create() {
        this.ensureTextures();

        this.bgFar = this.add
            .tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'bg-far')
            .setScrollFactor(0)
            .setAlpha(0.25);

        this.bgNear = this.add
            .tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'bg-near')
            .setScrollFactor(0)
            .setAlpha(0.2);

        this.clouds = this.add.group();
        for (let i = 0; i < 14; i += 1) {
            this.spawnCloud(true);
        }

        this.playerBaseY = GAME_HEIGHT / 2 + 40;
        this.playerRise = 0;
        const playerTextureKey = this.getLaunchPlayerTextureKey(this.charId);
        const initialTexture = this.textures.exists(playerTextureKey) ? playerTextureKey : 'player';
        this.player = this.add.sprite(GAME_WIDTH / 2, this.playerBaseY, initialTexture);
        this.player.setDepth(20);
        this.player.setOrigin(0.5, 0.5);
        this.setSpriteDisplayHeight(this.player, LAUNCH_PLAYER_TARGET_HEIGHT);
        if (this.textures.exists(playerTextureKey)) {
            this.player.clearTint();
        } else {
            this.applyCharacterTint();
        }

        this.engineGlow = this.add
            .ellipse(
                this.player.x - this.player.displayWidth * 0.28,
                this.player.y + this.player.displayHeight * 0.16,
                this.player.displayWidth * 0.42,
                this.player.displayHeight * 0.22,
                0x00eaff,
                0
            )
            .setDepth(12)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.chargeLines = this.createChargeLines();

        this.particles = this.add.particles(0, 0, 'particle', {
            x: () => this.player.x - this.player.displayWidth * 0.3 + Phaser.Math.Between(-22, 22),
            y: () => this.player.y + this.player.displayHeight * 0.18 + Phaser.Math.Between(-18, 18),
            speedY: { min: 160, max: 420 },
            speedX: { min: -60, max: 60 },
            lifespan: { min: 240, max: 620 },
            scale: { start: 1.05, end: 0 },
            alpha: { start: 0.9, end: 0 },
            blendMode: 'ADD',
            quantity: 0,
            frequency: 999999
        });
        this.particles.setDepth(10);

        this.add
            .text(24, 24, 'MISSION', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '14px',
                fontStyle: '800',
                color: '#00eaff'
            })
            .setScrollFactor(0)
            .setDepth(1000);

        this.add
            .text(24, 44, `${this.missionType}`, {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '28px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setScrollFactor(0)
            .setDepth(1000);

        this.add
            .text(24, 78, `${this.location}`, {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '18px',
                fontStyle: '800',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 4
            })
            .setScrollFactor(0)
            .setDepth(1000);

        this.add
            .text(GAME_WIDTH - 24, 28, `${GAME_CONFIG.CHARACTERS[this.charId].name}`, {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '22px',
                fontStyle: '800',
                color: '#ffd700',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(1000);

        const gaugeWidth = 520;
        const gaugeX = GAME_WIDTH / 2 - gaugeWidth / 2;
        const gaugeY = GAME_HEIGHT - 140;
        this.add
            .rectangle(GAME_WIDTH / 2, gaugeY, gaugeWidth, 30, 0x000000, 0.55)
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1000);
        this.gaugeBar = this.add
            .rectangle(gaugeX, gaugeY, 0, 22, 0x00eaff, 1)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(1001);
        this.gaugeText = this.add
            .text(GAME_WIDTH / 2, gaugeY + 38, '0%', {
                fontFamily: 'monospace',
                fontSize: '28px',
                fontStyle: '900',
                color: '#00eaff'
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(1001);

        this.hintText = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT - 70, 'HOLD [SPACE] TO LAUNCH!', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '22px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(1001);

        this.phase = PHASE.READY;
        this.speed = 0;
        this.progress = 0;

        if (this.input.keyboard) {
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        }
    }

    update(timeMs: number, deltaMs: number) {
        const dt = Math.min(deltaMs / 1000, 0.1);
        this.lastDt = dt;
        this.chargeLinesTime += dt;

        if (this.phase === PHASE.TRANSITION) return;

        const spaceDown = Boolean(this.spaceKey?.isDown);
        if (spaceDown && !this.wasCharging && this.phase !== PHASE.LIFTOFF) {
            audioManager.playSound('transform_ready');
        }
        this.wasCharging = spaceDown;

        if (spaceDown && this.phase !== PHASE.LIFTOFF) {
            this.phase = PHASE.ACCELERATING;
            this.speed = Math.min(this.maxSpeed, this.speed + 60 * dt);
        } else if (this.phase !== PHASE.LIFTOFF) {
            this.speed = Math.max(0, this.speed - 40 * dt);
            if (this.speed <= 0.01) this.phase = PHASE.READY;
        }

        const speedRatio = this.speed / this.maxSpeed;

        this.bgFar.tilePositionX += 120 * dt * (0.4 + speedRatio * 2.0);
        this.bgNear.tilePositionX += 220 * dt * (0.5 + speedRatio * 3.0);

        this.updateClouds(dt, speedRatio);
        this.updateParticles(speedRatio);
        this.updatePlayerVisual(timeMs, speedRatio, spaceDown);
        this.updateChargeLines(timeMs, speedRatio, spaceDown);
        this.updateGauge(speedRatio);

        if (this.speed > 80 && this.phase === PHASE.ACCELERATING) {
            this.progress += this.speed * dt;
        }

        if (this.progress > this.liftoffProgressTarget && this.phase === PHASE.ACCELERATING) {
            this.startLiftoff();
        }
    }

    private updateGauge(speedRatio: number) {
        const pct = Math.round(speedRatio * 100);
        const gaugeWidth = 520;
        this.gaugeBar.width = (gaugeWidth - 8) * speedRatio;

        if (pct > 90) {
            this.gaugeBar.fillColor = 0xff3333;
            this.gaugeText.setColor('#ff3333');
            this.hintText.setText('MAXIMUM THRUST!');
        } else if (pct > 0) {
            this.gaugeBar.fillColor = 0x00eaff;
            this.gaugeText.setColor('#00eaff');
            this.hintText.setText('KEEP HOLDING!');
        } else {
            this.gaugeBar.fillColor = 0x00eaff;
            this.gaugeText.setColor('#00eaff');
            this.hintText.setText('HOLD [SPACE] TO LAUNCH!');
        }

        this.gaugeText.setText(`${pct}%`);
    }

    private updateParticles(speedRatio: number) {
        const intensity = Phaser.Math.Clamp(speedRatio * 1.35, 0, 1);
        const quantity = intensity > 0.05 ? Math.ceil(2 + intensity * 8) : 0;
        this.particles.setFrequency(quantity > 0 ? 35 : 999999);
        this.particles.setQuantity(quantity);
    }

    private updatePlayerVisual(timeMs: number, speedRatio: number, spaceDown: boolean) {
        const idleBob = Math.sin(timeMs / 180) * 6;
        const charge = Phaser.Math.Clamp(speedRatio, 0, 1);
        const shakeStrength = (spaceDown || this.phase === PHASE.LIFTOFF) ? Math.pow(charge, 1.25) * 34 : 0;
        const shakeX = shakeStrength > 0 ? (Math.random() - 0.5) * shakeStrength : 0;
        const shakeY = shakeStrength > 0 ? (Math.random() - 0.5) * shakeStrength : 0;

        const y = this.playerBaseY - this.playerRise + idleBob + shakeY;
        this.player.setPosition(GAME_WIDTH / 2 + shakeX, y);

        const wobble = Math.sin(timeMs / 90) * (spaceDown ? 0.012 : 0.006);
        this.player.setRotation(speedRatio * 0.12 + wobble);

        const glowAlphaTarget = (spaceDown || this.phase === PHASE.LIFTOFF) ? Phaser.Math.Clamp(charge * 0.65, 0, 0.65) : 0;
        const glowPulse = 0.08 + Math.sin(timeMs / 70) * 0.06;
        this.engineGlow.setPosition(
            this.player.x - this.player.displayWidth * 0.29 + shakeX * 0.2,
            this.player.y + this.player.displayHeight * 0.18 + shakeY * 0.2
        );
        this.engineGlow.setScale(1 + charge * 0.35, 1 + charge * 0.45);
        this.engineGlow.setAlpha(glowAlphaTarget * (1 + glowPulse));
    }

    private updateChargeLines(timeMs: number, speedRatio: number, spaceDown: boolean) {
        if (this.chargeLines.length === 0) return;

        const charge = Phaser.Math.Clamp(speedRatio * 1.25, 0, 1);
        const intensity = this.phase === PHASE.LIFTOFF ? 1 : spaceDown ? charge : 0;

        for (const line of this.chargeLines) {
            const wobble = Math.sin(this.chargeLinesTime * line.speed + line.phase) * line.amplitude * (0.5 + intensity);
            const jitter = intensity > 0 ? (Math.random() - 0.5) * 10 * intensity : 0;
            line.rect.setPosition(this.player.x + line.xOffset + jitter, this.player.y + line.yOffset + wobble);
            line.rect.setScale(1, line.baseScale + intensity * 1.25);
            line.rect.setAlpha(line.baseAlpha * intensity);
        }

        if (this.phase === PHASE.LIFTOFF) {
            const camZoom = 1 + charge * 0.05 + Math.sin(timeMs / 120) * 0.005;
            this.cameras.main.setZoom(camZoom);
        } else {
            this.cameras.main.setZoom(1);
        }
    }

    private updateClouds(dt: number, speedRatio: number) {
        for (const child of this.clouds.getChildren()) {
            const cloud = child as Phaser.GameObjects.Sprite;
            const factor = cloud.getData('speedFactor') as number | undefined;
            const speedFactor = factor ?? 1;

            cloud.x -= 1600 * dt * speedRatio * speedFactor;
            if (this.phase === PHASE.LIFTOFF) cloud.y -= 120 * dt;

            if (cloud.x < -cloud.displayWidth) {
                cloud.destroy();
                this.spawnCloud(false);
            }
        }
    }

    private spawnCloud(initial: boolean) {
        const size = 80 + Math.random() * 120;
        const y = initial ? Math.random() * (GAME_HEIGHT - size) : GAME_HEIGHT + Math.random() * 120;
        const x = GAME_WIDTH + Math.random() * 600;
        const cloud = this.add.sprite(x, y, 'cloud');
        cloud.setDisplaySize(size, size * 0.6);
        cloud.setAlpha(0.25 + Math.random() * 0.4);
        cloud.setDepth(5);
        cloud.setData('speedFactor', 0.6 + Math.random() * 0.6);
        this.clouds.add(cloud);
    }

    private startLiftoff() {
        this.phase = PHASE.LIFTOFF;
        this.hintText.setText('LIFTOFF!');
        audioManager.playSound('launch');

        this.tweens.add({
            targets: this,
            playerRise: 520,
            duration: 1800,
            ease: 'Cubic.easeOut'
        });

        const nextScaleX = this.player.scaleX * 1.25;
        const nextScaleY = this.player.scaleY * 1.25;
        this.tweens.add({
            targets: this.player,
            scaleX: nextScaleX,
            scaleY: nextScaleY,
            duration: 1800,
            ease: 'Cubic.easeOut'
        });

        this.cameras.main.shake(300, 0.0025);

        this.time.delayedCall(1650, () => {
            this.phase = PHASE.TRANSITION;
            this.cameras.main.fadeOut(260, 255, 255, 255);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                this.scene.start('FlightScene', {
                    missionType: this.missionType,
                    charId: this.charId,
                    missionId: this.missionId,
                    location: this.location
                });
            });
        });
    }

    private applyCharacterTint() {
        const hex = GAME_CONFIG.CHARACTERS[this.charId].color;
        const tint = Number.parseInt(hex.replace('#', ''), 16);
        if (Number.isFinite(tint)) {
            this.player.setTint(tint);
        }
    }

    private ensureTextures() {
        if (!this.textures.exists('bg-far')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x1e90ff, 1);
            g.fillRect(0, 0, 512, 512);
            g.fillStyle(0xffffff, 0.06);
            for (let i = 0; i < 120; i += 1) {
                g.fillCircle(
                    Phaser.Math.Between(0, 512),
                    Phaser.Math.Between(0, 512),
                    Phaser.Math.Between(2, 6)
                );
            }
            g.generateTexture('bg-far', 512, 512);
            g.destroy();
        }

        if (!this.textures.exists('bg-near')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x87ceeb, 1);
            g.fillRect(0, 0, 512, 512);
            g.lineStyle(8, 0xffffff, 0.05);
            for (let i = -512; i < 512 * 2; i += 48) {
                g.beginPath();
                g.moveTo(i, 0);
                g.lineTo(i + 256, 512);
                g.strokePath();
            }
            g.generateTexture('bg-near', 512, 512);
            g.destroy();
        }

        if (!this.textures.exists('player')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xe31d2b, 1);
            g.fillRoundedRect(0, 0, 240, 180, 26);
            g.fillStyle(0xffffff, 0.9);
            g.fillRoundedRect(22, 54, 196, 18, 9);
            g.fillStyle(0xffd700, 0.9);
            g.fillCircle(70, 90, 16);
            g.generateTexture('player', 240, 180);
            g.destroy();
        }

        if (!this.textures.exists('cloud')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffffff, 1);
            g.fillCircle(60, 60, 40);
            g.fillCircle(110, 55, 50);
            g.fillCircle(155, 65, 36);
            g.fillRoundedRect(35, 60, 150, 50, 24);
            g.generateTexture('cloud', 220, 140);
            g.destroy();
        }

        if (!this.textures.exists('particle')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x00eaff, 1);
            g.fillCircle(8, 8, 8);
            g.generateTexture('particle', 16, 16);
            g.destroy();
        }
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Sprite, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }

    private createChargeLines(): ChargeLine[] {
        const lines: ChargeLine[] = [];
        const count = 56;

        for (let i = 0; i < count; i += 1) {
            const width = 6 + Math.random() * 10;
            const height = 70 + Math.random() * 260;
            const xOffset = -this.player.displayWidth * (0.32 + Math.random() * 0.32);
            const yOffset = (Math.random() - 0.5) * this.player.displayHeight * 0.9;
            const baseAlpha = 0.12 + Math.random() * 0.3;
            const baseScale = 0.5 + Math.random() * 0.9;

            const rect = this.add
                .rectangle(this.player.x + xOffset, this.player.y + yOffset, width, height, 0x00eaff, 0)
                .setOrigin(0.5, 0.5)
                .setDepth(11)
                .setBlendMode(Phaser.BlendModes.ADD);

            lines.push({
                rect,
                xOffset,
                yOffset,
                amplitude: 10 + Math.random() * 26,
                speed: 2.5 + Math.random() * 4.5,
                phase: Math.random() * Math.PI * 2,
                baseAlpha,
                baseScale
            });
        }

        return lines;
    }

    private getLaunchPlayerTexturePath(charId: string): string {
        return `assets/images/characters/${charId}/all/takeoff_v1.png`;
    }

    private getLaunchPlayerTextureKey(charId: string): string {
        return `launch-player-${charId}`;
    }
}
