import Phaser from 'phaser';

import { audioManager } from '../../../shared/audio/audioManager';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { eventBus } from '../../../shared/eventBus';
import { EVENTS } from '../../../shared/eventNames';
import { emitFlightComplete } from '../../../shared/flightEvents';
import { GAME_CONFIG, type CharacterId } from '../../../shared/gameConfig';
import { emitHudUpdate } from '../../../shared/hudEvents';
import type { HudState } from '../../../shared/types/Scene';
import { LandingBackgroundEffect } from '../systems/LandingBackgroundEffect';

type SequenceManifest = {
    images?: Array<{ index: number; path: string }>;
};

type LandingInitData = {
    missionType?: string;
    charId?: string;
    missionId?: string;
    location?: string;
    score?: number;
    flightStats?: {
        coinsCollected: number;
        obstaclesHit: number;
        flightTime: number;
        boostsUsed: number;
        distance: number;
    };
};

const LEGACY_BASE_WIDTH = 1280;
const LEGACY_BASE_HEIGHT = 720;

const LANDING_PHYSICS_MULTIPLIER = 0.42;
const LANDING_GRAVITY = 32;
const LANDING_ALTITUDE_MAX = 550;
const LANDING_FRAME_STEP_INTERVAL_MS = 190;
const LANDING_FRAME_DIM_IN_MS = 120;
const LANDING_FRAME_DIM_HOLD_MS = 80;
const LANDING_FRAME_DIM_OUT_MS = 260;

const LANDING_ALTITUDE_GRAPH_POINTS = 64;
const LANDING_ALTITUDE_GRAPH_SAMPLE_INTERVAL_MS = 120;

export class LandingScene extends Phaser.Scene {
    private missionType = 'Delivery';
    private missionId = 'm_local';
    private charId: CharacterId = 'jett';
    private location = 'Destination';
    private score = 0;
    private flightStats: LandingInitData['flightStats'] | null = null;

    private scaleFactor = 1;

    private planeX = 0;
    private planeY = 0;
    private planeVX = 0;
    private planeVY = 0;
    private altitude = 500;

    private runwayX = 0;
    private runwayY = 0;
    private runwayWidth = 0;
    private runwayHeight = 0;

    private isLanded = false;
    private landingSuccess = false;
    private completionEmitted = false;

    private bgTextureKey = '';
    private bgTexture?: Phaser.Textures.CanvasTexture;
    private bgEffect?: LandingBackgroundEffect;

    private runwayGraphics?: Phaser.GameObjects.Graphics;
    private hudGraphics?: Phaser.GameObjects.Graphics;
    private guideGraphics?: Phaser.GameObjects.Graphics;

    private titleText?: Phaser.GameObjects.Text;
    private altitudeValueText?: Phaser.GameObjects.Text;
    private tipText?: Phaser.GameObjects.Text;
    private speedText?: Phaser.GameObjects.Text;
    private resultText?: Phaser.GameObjects.Text;

    private manifestKey = '';
    private frameKeys: string[] = [];
    private currentFrameIndex = 0;
    private characterSprite?: Phaser.GameObjects.Image;
    private characterTargetHeight = 720;
    private characterBaseScaleX = 1;
    private characterBaseScaleY = 1;
    private fallbackTextureKey = '';
    private frameDimOverlay?: Phaser.GameObjects.Rectangle;
    private frameStepInProgress = false;
    private lastFrameStepAtMs = 0;

    private altitudeHistory: number[] = [];
    private lastAltitudeSampleAtMs = 0;

    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private keyW?: Phaser.Input.Keyboard.Key;
    private keyA?: Phaser.Input.Keyboard.Key;
    private keyS?: Phaser.Input.Keyboard.Key;
    private keyD?: Phaser.Input.Keyboard.Key;
    private keySpace?: Phaser.Input.Keyboard.Key;
    private keyR?: Phaser.Input.Keyboard.Key;
    private canRetry = false;

    constructor() {
        super({ key: 'LandingScene' });
    }

    init(data: LandingInitData) {
        this.missionType = data.missionType ?? 'Delivery';
        this.missionId = data.missionId ?? 'm_local';
        this.location = data.location ?? 'Destination';
        this.score = typeof data.score === 'number' ? data.score : 0;
        this.flightStats = data.flightStats ?? null;

        const requested = (data.charId ?? 'jett').toLowerCase();
        if (requested in GAME_CONFIG.CHARACTERS) {
            this.charId = requested as CharacterId;
        } else {
            this.charId = 'jett';
        }

        this.manifestKey = `tf-manifest-${this.charId}`;
        this.bgTextureKey = `landing-bg-${this.missionId}`;
        this.fallbackTextureKey = `landing-static-${this.charId}`;
    }

    preload() {
        const manifestPath = `assets/images/characters/${this.charId}/animation_sequence/sequence_manifest.json`;
        if (!this.cache.json.exists(this.manifestKey)) {
            this.load.json(this.manifestKey, manifestPath);
        }

        if (!this.textures.exists(this.fallbackTextureKey)) {
            this.load.image(this.fallbackTextureKey, `assets/images/characters/${this.charId}/all/action_pose_v1.png`);
        }
    }

    create() {
        eventBus.emit(EVENTS.MISSION_PHASE_CHANGED, { phaseId: 'landing', missionId: this.missionId, actorId: this.charId });
        const hudState: HudState = {
            score: this.score,
            distance: 0,
            speed: 0,
            missionType: this.missionType,
            status: 'ready'
        };
        emitHudUpdate(hudState);

        this.scaleFactor = Math.min(GAME_WIDTH / LEGACY_BASE_WIDTH, GAME_HEIGHT / LEGACY_BASE_HEIGHT);

        this.resetLandingState();
        this.resetAltitudeHistory(this.time.now);

        this.createBackground();
        this.createRunway();
        this.createHud();
        this.createCharacterSprite();
        this.createFrameOverlay();
        this.setupControls();

        this.ensureFrameTextures();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.cleanupTextures();
        });
    }

    update(timeMs: number, deltaMs: number) {
        const dt = Math.min(deltaMs / 1000, 0.1);

        if (this.isLanded) {
            if (this.canRetry && this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
                this.resetLanding();
            }
            return;
        }

        if (!this.isLanded) {
            this.updatePlanePhysics(dt);
            this.updateFrameAnimation(timeMs);
            this.sampleAltitudeHistory(timeMs);
        }

        this.updateBackground(deltaMs);
        this.updateCharacterTransform(timeMs);
        this.updateGuideLine();
        this.updateHud();
        this.updateSpeedIndicator();
    }

    private resetLandingState(): void {
        const s = this.scaleFactor;
        this.planeX = 640 * s;
        this.planeY = 100 * s;
        this.planeVX = 0;
        this.planeVY = 0;
        this.altitude = LANDING_ALTITUDE_MAX;

        this.runwayX = 640 * s;
        this.runwayY = 650 * s;
        this.runwayWidth = 200 * s;
        this.runwayHeight = 40 * s;

        this.isLanded = false;
        this.landingSuccess = false;
        this.completionEmitted = false;
        this.canRetry = false;

        this.currentFrameIndex = 0;
        this.lastFrameStepAtMs = 0;
        this.frameStepInProgress = false;
    }

    private createBackground(): void {
        this.cleanupTextures();

        const bgTexture = this.textures.createCanvas(this.bgTextureKey, GAME_WIDTH, GAME_HEIGHT);
        if (!bgTexture) throw new Error('Failed to create landing background canvas texture');
        this.bgTexture = bgTexture;

        const bgCtx = bgTexture.context;
        if (!bgCtx) throw new Error('Missing landing background canvas context');

        this.bgEffect = new LandingBackgroundEffect(bgTexture.canvas, bgCtx);
        const s = this.scaleFactor;
        this.bgEffect.config.lengthMin = 80 * s;
        this.bgEffect.config.lengthMax = 280 * s;
        this.bgEffect.config.speedMin = 160 * s;
        this.bgEffect.config.speedMax = 420 * s;
        this.bgEffect.config.thicknessMin = 2 * s;
        this.bgEffect.config.thicknessMax = 5 * s;
        this.bgEffect.resize(GAME_WIDTH, GAME_HEIGHT);
        this.bgEffect.start();

        this.add.image(0, 0, this.bgTextureKey).setOrigin(0, 0).setDepth(0);
    }

    private createRunway(): void {
        const g = this.add.graphics().setDepth(15);
        g.fillStyle(0x444444, 1);
        g.fillRect(
            this.runwayX - this.runwayWidth / 2,
            this.runwayY - this.runwayHeight / 2,
            this.runwayWidth,
            this.runwayHeight
        );

        g.fillStyle(0xffffff, 1);
        const stripeCount = 5;
        const stripeWidth = 25 * this.scaleFactor;
        const stripeHeight = 6 * this.scaleFactor;
        const startX = this.runwayX - 80 * this.scaleFactor;
        for (let i = 0; i < stripeCount; i += 1) {
            g.fillRect(startX + i * 40 * this.scaleFactor, this.runwayY - stripeHeight / 2, stripeWidth, stripeHeight);
        }

        this.runwayGraphics = g;
        this.guideGraphics = this.add.graphics().setDepth(16);
    }

    private createHud(): void {
        this.titleText = this.add
            .text(60, 50, '🛬 LANDING APPROACH', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '34px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 8
            })
            .setDepth(30);

        this.altitudeValueText = this.add
            .text(60, 110, 'ALTITUDE 500m', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '26px',
                fontStyle: '800',
                color: '#00eaff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setDepth(30);

        this.tipText = this.add
            .text(60, 150, '⚠️ Land slowly on the runway!  (WASD/Arrows + SPACE to slow)', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '22px',
                fontStyle: '800',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setDepth(30);

        this.speedText = this.add
            .text(GAME_WIDTH / 2, 80, '', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '34px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 8
            })
            .setOrigin(0.5, 0.5)
            .setDepth(30)
            .setVisible(false);

        this.hudGraphics = this.add.graphics().setDepth(29);
    }

    private createCharacterSprite(): void {
        const sprite = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.fallbackTextureKey).setDepth(20);
        this.setSpriteDisplayHeight(sprite, this.characterTargetHeight);
        this.characterBaseScaleX = sprite.scaleX;
        this.characterBaseScaleY = sprite.scaleY;
        this.characterSprite = sprite;
    }

    private createFrameOverlay(): void {
        if (this.frameDimOverlay) return;
        this.frameDimOverlay = this.add
            .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
            .setOrigin(0, 0)
            .setDepth(21);
    }

    private setupControls(): void {
        if (!this.input.keyboard) return;

        this.cursors = this.input.keyboard.createCursorKeys();
        this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    }

    private updatePlanePhysics(dt: number): void {
        const s = this.scaleFactor;
        const p = LANDING_PHYSICS_MULTIPLIER;

        this.planeVY += LANDING_GRAVITY * s * p * dt;

        const left = Boolean(this.cursors?.left?.isDown || this.keyA?.isDown);
        const right = Boolean(this.cursors?.right?.isDown || this.keyD?.isDown);
        const up = Boolean(this.cursors?.up?.isDown || this.keyW?.isDown);
        const down = Boolean(this.cursors?.down?.isDown || this.keyS?.isDown);
        const slow = Boolean(this.keySpace?.isDown);

        if (left) this.planeVX -= 300 * s * p * dt;
        if (right) this.planeVX += 300 * s * p * dt;
        if (up) this.planeVY -= 200 * s * p * dt;
        if (down) this.planeVY += 200 * s * p * dt;

        if (slow) {
            this.planeVX *= 0.95;
            this.planeVY *= 0.95;
        }

        this.planeVX = Phaser.Math.Clamp(this.planeVX, -200 * s * p, 200 * s * p);
        this.planeVY = Phaser.Math.Clamp(this.planeVY, -100 * s * p, 300 * s * p);

        this.planeVX *= 0.985;

        this.planeX += this.planeVX * dt;
        this.planeY += this.planeVY * dt;

        this.planeX = Phaser.Math.Clamp(this.planeX, 50 * s, GAME_WIDTH - 50 * s);

        this.altitude = Math.max(0, (this.runwayY - this.planeY) / s);

        if (this.planeY >= this.runwayY - 20 * s) {
            this.checkLanding();
        }
    }

    private updateBackground(deltaMs: number): void {
        this.bgEffect?.update(deltaMs, this.planeVY / this.scaleFactor);
        this.bgTexture?.refresh();
    }

    private updateFrameAnimation(timeMs: number): void {
        if (!this.characterSprite) return;
        if (this.frameKeys.length === 0) return;

        const altitudePct = Phaser.Math.Clamp(this.altitude / LANDING_ALTITUDE_MAX, 0, 1);
        const fallPct = 1 - altitudePct;
        const targetIndex = Math.round(fallPct * (this.frameKeys.length - 1));
        if (targetIndex === this.currentFrameIndex) return;

        const canStep = timeMs - this.lastFrameStepAtMs >= LANDING_FRAME_STEP_INTERVAL_MS;
        if (!canStep) return;

        const direction = targetIndex > this.currentFrameIndex ? 1 : -1;
        const nextIndex = Phaser.Math.Clamp(this.currentFrameIndex + direction, 0, this.frameKeys.length - 1);
        this.transitionToFrameIndex(nextIndex, timeMs);
    }

    private updateCharacterTransform(timeMs: number): void {
        if (!this.characterSprite) return;

        const s = this.scaleFactor;
        const altitudePct = Phaser.Math.Clamp(this.altitude / LANDING_ALTITUDE_MAX, 0, 1);
        const fallPct = 1 - altitudePct;

        const wobbleIntensity = Math.abs(this.planeVX) / (20 * s);
        const wobble = Math.sin(timeMs / 170) * wobbleIntensity * 30 * s;

        const tiltDeg = (this.planeVX / (90 * s)) * 40;
        const scale = 1 + fallPct * 0.18;

        this.characterSprite.setRotation(Phaser.Math.DegToRad(tiltDeg));
        this.characterSprite.setScale(this.characterBaseScaleX * scale, this.characterBaseScaleY * scale);

        const xMin = this.characterSprite.displayWidth * 0.25;
        const xMax = GAME_WIDTH - xMin;
        const targetX = Phaser.Math.Clamp(this.planeX + wobble, xMin, xMax);
        const targetY = this.planeY - this.characterSprite.displayHeight * 0.5;

        this.characterSprite.setPosition(targetX, targetY);
    }

    private updateGuideLine(): void {
        if (!this.guideGraphics) return;

        this.guideGraphics.clear();
        if (this.altitude >= 300) return;

        const inRange = Math.abs(this.planeX - this.runwayX) < this.runwayWidth / 2;
        const color = inRange ? 0x4caf50 : 0xff5252;
        this.guideGraphics.lineStyle(4, color, 0.9);
        this.guideGraphics.beginPath();
        this.guideGraphics.moveTo(this.planeX, this.planeY + 30 * this.scaleFactor);
        this.guideGraphics.lineTo(this.runwayX, this.runwayY);
        this.guideGraphics.strokePath();
    }

    private updateHud(): void {
        if (!this.altitudeValueText || !this.hudGraphics) return;

        this.altitudeValueText.setText(`ALTITUDE ${Math.round(this.altitude)}m`);

        const panelWidth = 220;
        const panelHeight = 300;
        const panelX = GAME_WIDTH - panelWidth - 60;
        const panelY = 160;
        const padding = 14;

        const graphX = panelX + padding;
        const graphY = panelY + padding;
        const graphWidth = panelWidth - padding * 2;
        const graphHeight = panelHeight - padding * 2;

        const points = this.altitudeHistory.length > 0 ? this.altitudeHistory : [Phaser.Math.Clamp(this.altitude / LANDING_ALTITUDE_MAX, 0, 1)];
        const latestPct = points[points.length - 1] ?? 0;
        const horizonY = graphY + (1 - latestPct) * graphHeight;

        this.hudGraphics.clear();
        this.hudGraphics.fillStyle(0x000000, 0.45);
        this.hudGraphics.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 18);

        this.hudGraphics.lineStyle(1, 0xffffff, 0.14);
        for (let i = 1; i < 5; i += 1) {
            const y = graphY + (graphHeight * i) / 5;
            this.hudGraphics.beginPath();
            this.hudGraphics.moveTo(graphX, y);
            this.hudGraphics.lineTo(graphX + graphWidth, y);
            this.hudGraphics.strokePath();
        }

        this.hudGraphics.fillStyle(0xff3333, 0.6);
        this.hudGraphics.beginPath();
        this.hudGraphics.moveTo(graphX, graphY + graphHeight);
        for (let i = 0; i < points.length; i += 1) {
            const t = points.length === 1 ? 1 : i / (points.length - 1);
            const x = graphX + t * graphWidth;
            const y = graphY + (1 - points[i]) * graphHeight;
            this.hudGraphics.lineTo(x, y);
        }
        this.hudGraphics.lineTo(graphX + graphWidth, graphY + graphHeight);
        this.hudGraphics.closePath();
        this.hudGraphics.fillPath();

        this.hudGraphics.lineStyle(4, 0xffffff, 0.65);
        this.hudGraphics.beginPath();
        this.hudGraphics.moveTo(graphX, horizonY);
        this.hudGraphics.lineTo(graphX + graphWidth, horizonY);
        this.hudGraphics.strokePath();

        this.hudGraphics.lineStyle(3, 0xffffff, 0.22);
        this.hudGraphics.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 18);
    }

    private updateSpeedIndicator(): void {
        if (!this.speedText) return;

        if (this.altitude >= 200 || this.isLanded) {
            this.speedText.setVisible(false);
            return;
        }

        const speed = Math.sqrt(this.planeVX * this.planeVX + this.planeVY * this.planeVY);
        const speedOK = speed < Math.sqrt(100 * 100 + 100 * 100) * this.scaleFactor;

        this.speedText.setVisible(true);
        this.speedText.setColor(speedOK ? '#4CAF50' : '#FF5252');
        this.speedText.setText(`SPEED: ${Math.round(speed)} ${speedOK ? '✓' : '⚠️ TOO FAST'}`);
    }

    private checkLanding(): void {
        const s = this.scaleFactor;
        const onRunway = Math.abs(this.planeX - this.runwayX) < this.runwayWidth / 2;
        const speedOK = Math.abs(this.planeVY) < 100 * s && Math.abs(this.planeVX) < 100 * s;

        this.isLanded = true;
        this.landingSuccess = onRunway && speedOK;

        if (this.landingSuccess) {
            this.handleSuccessfulLanding();
        } else {
            this.handleCrash();
        }
    }

    private handleSuccessfulLanding(): void {
        audioManager.playSound('success');

        this.resultText?.destroy();
        this.resultText = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 240, '✅ PERFECT LANDING!', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '76px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 10
            })
            .setOrigin(0.5, 0.5)
            .setDepth(40);

        this.applyCharacterTexture(this.fallbackTextureKey);

        this.time.delayedCall(2000, () => {
            this.emitCompletion(true);
        });
    }

    private handleCrash(): void {
        audioManager.playSound('error');
        this.canRetry = true;

        this.resultText?.destroy();
        this.resultText = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 240, '❌ CRASH LANDING!\nPress R to retry', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '64px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 10,
                align: 'center'
            })
            .setOrigin(0.5, 0.5)
            .setDepth(40);

        this.time.delayedCall(250, () => {
            this.cameras.main.shake(450, 0.006);
        });

        this.applyCharacterTexture(this.fallbackTextureKey);
    }

    private resetLanding(): void {
        this.resetLandingState();
        this.resetAltitudeHistory(this.time.now);
        this.bgEffect?.start();
        this.resultText?.destroy();
        this.resultText = undefined;
        this.speedText?.setVisible(false);
        this.guideGraphics?.clear();

        if (this.frameKeys.length > 0) {
            this.applyCharacterTexture(this.frameKeys[0]);
        } else {
            this.applyCharacterTexture(this.fallbackTextureKey);
        }
    }

    private emitCompletion(success: boolean): void {
        if (this.completionEmitted) return;
        this.completionEmitted = true;

        emitFlightComplete({
            missionId: this.missionId,
            missionType: this.missionType,
            charId: this.charId,
            score: this.score,
            success,
            flightStats: this.flightStats ?? undefined
        });
    }

    private ensureFrameTextures(): void {
        const manifest = this.cache.json.get(this.manifestKey) as SequenceManifest | undefined;
        const images = manifest?.images ?? [];
        const framePaths = images.map((img) => `assets/images/characters/${this.charId}/animation_sequence/${img.path}`);

        if (framePaths.length === 0) {
            this.frameKeys = [];
            return;
        }

        const frameKeys: string[] = [];
        let pendingLoads = 0;

        for (let i = 0; i < framePaths.length; i += 1) {
            const key = this.getFrameTextureKey(i);
            frameKeys.push(key);
            if (this.textures.exists(key)) continue;
            pendingLoads += 1;
            this.load.image(key, framePaths[i]);
        }

        this.frameKeys = frameKeys;
        this.currentFrameIndex = 0;

        if (pendingLoads === 0) {
            if (this.frameKeys.length > 0) {
                this.applyCharacterTexture(this.frameKeys[0]);
            }
            return;
        }

        const loadingText = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Loading landing frames...', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '28px',
                fontStyle: '800',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setOrigin(0.5)
            .setDepth(50);

        const onComplete = () => {
            this.load.off('complete', onComplete);
            loadingText.destroy();
            if (this.frameKeys.length > 0) {
                this.applyCharacterTexture(this.frameKeys[0]);
            }
        };

        this.load.on('complete', onComplete);
        this.load.start();
    }

    private cleanupTextures(): void {
        if (this.textures.exists(this.bgTextureKey)) {
            this.textures.remove(this.bgTextureKey);
        }
    }

    private getFrameTextureKey(frameIndex: number): string {
        return `tf-frame-${this.charId}-${frameIndex}`;
    }

    private applyCharacterTexture(textureKey: string): void {
        if (!this.characterSprite) return;
        if (!this.textures.exists(textureKey)) return;

        this.characterSprite.setTexture(textureKey);
        this.setSpriteDisplayHeight(this.characterSprite, this.characterTargetHeight);
        this.characterBaseScaleX = this.characterSprite.scaleX;
        this.characterBaseScaleY = this.characterSprite.scaleY;
    }

    private transitionToFrameIndex(nextIndex: number, timeMs: number): void {
        if (!this.characterSprite) return;
        if (this.frameKeys.length === 0) return;
        if (nextIndex === this.currentFrameIndex) return;
        if (this.frameStepInProgress) return;

        this.frameStepInProgress = true;
        this.lastFrameStepAtMs = timeMs;

        const overlay = this.frameDimOverlay;
        if (!overlay) {
            this.currentFrameIndex = nextIndex;
            const key = this.frameKeys[nextIndex];
            if (key) this.applyCharacterTexture(key);
            this.frameStepInProgress = false;
            return;
        }

        this.tweens.killTweensOf(overlay);
        overlay.setAlpha(0);

        this.tweens.add({
            targets: overlay,
            alpha: 0.22,
            duration: LANDING_FRAME_DIM_IN_MS,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.time.delayedCall(LANDING_FRAME_DIM_HOLD_MS, () => {
                    this.currentFrameIndex = nextIndex;
                    const key = this.frameKeys[nextIndex];
                    if (key) this.applyCharacterTexture(key);

                    this.tweens.add({
                        targets: overlay,
                        alpha: 0,
                        duration: LANDING_FRAME_DIM_OUT_MS,
                        ease: 'Quad.easeIn',
                        onComplete: () => {
                            this.frameStepInProgress = false;
                        }
                    });
                });
            }
        });
    }

    private resetAltitudeHistory(timeMs: number): void {
        const pct = Phaser.Math.Clamp(this.altitude / LANDING_ALTITUDE_MAX, 0, 1);
        this.altitudeHistory = new Array(LANDING_ALTITUDE_GRAPH_POINTS).fill(pct);
        this.lastAltitudeSampleAtMs = timeMs;
    }

    private sampleAltitudeHistory(timeMs: number): void {
        if (this.altitudeHistory.length === 0) {
            this.resetAltitudeHistory(timeMs);
            return;
        }

        if (timeMs - this.lastAltitudeSampleAtMs < LANDING_ALTITUDE_GRAPH_SAMPLE_INTERVAL_MS) return;
        this.lastAltitudeSampleAtMs = timeMs;

        const pct = Phaser.Math.Clamp(this.altitude / LANDING_ALTITUDE_MAX, 0, 1);
        this.altitudeHistory.push(pct);
        if (this.altitudeHistory.length > LANDING_ALTITUDE_GRAPH_POINTS) {
            this.altitudeHistory.shift();
        }
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Image, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }
}
