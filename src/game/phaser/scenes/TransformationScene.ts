import Phaser from 'phaser';

import { audioManager } from '../../../shared/audio/audioManager';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { eventBus } from '../../../shared/eventBus';
import { EVENTS } from '../../../shared/eventNames';
import { GAME_CONFIG, type CharacterId } from '../../../shared/gameConfig';
import { emitHudUpdate } from '../../../shared/hudEvents';
import type { HudState } from '../../../shared/types/Scene';
import { GlowBurstEffect } from '../systems/GlowBurstEffect';
import { TransformationBackgroundEffect } from '../systems/TransformationBackgroundEffect';

type SequenceManifest = {
    total_images?: number;
    images?: Array<{ index: number; path: string }>;
};

type TransformInitData = {
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

const AUTO_STEP_INTERVAL_MS = 650;
const STEP_DIM_IN_MS = 140;
const STEP_DIM_HOLD_MS = 90;
const STEP_DIM_OUT_MS = 360;
const FRAME_TARGET_HEIGHT = 780;

export class TransformationScene extends Phaser.Scene {
    private missionType = 'Delivery';
    private missionId = 'm_local';
    private charId: CharacterId = 'jett';
    private location = 'Destination';
    private score = 0;
    private flightStats: TransformInitData['flightStats'] | null = null;

    private bgTextureKey = '';
    private glowTextureKey = '';
    private bgTexture?: Phaser.Textures.CanvasTexture;
    private glowTexture?: Phaser.Textures.CanvasTexture;
    private bgImage?: Phaser.GameObjects.Image;
    private glowImage?: Phaser.GameObjects.Image;

    private bgEffect?: TransformationBackgroundEffect;
    private glowEffect?: GlowBurstEffect;
    private glowActive = false;

    private manifestKey = '';
    private frameKeys: string[] = [];
    private frameSprite?: Phaser.GameObjects.Image;
    private frameDimOverlay?: Phaser.GameObjects.Rectangle;

    private loadingLabel?: Phaser.GameObjects.Text;
    private loadingBarBack?: Phaser.GameObjects.Rectangle;
    private loadingBarFill?: Phaser.GameObjects.Rectangle;

    private shoutText?: Phaser.GameObjects.Text;
    private controlsText?: Phaser.GameObjects.Text;

    private spaceKey?: Phaser.Input.Keyboard.Key;
    private leftKey?: Phaser.Input.Keyboard.Key;
    private rightKey?: Phaser.Input.Keyboard.Key;
    private enterKey?: Phaser.Input.Keyboard.Key;

    private currentFrameIndex = 0;
    private hasFinishedFrames = false;
    private autoFinishAtMs: number | null = null;
    private frameStepInProgress = false;
    private nextAutoStepAtMs = 0;

    constructor() {
        super({ key: 'TransformationScene' });
    }

    init(data: TransformInitData) {
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
        this.bgTextureKey = `tf-bg-${this.missionId}`;
        this.glowTextureKey = `tf-glow-${this.missionId}`;
    }

    preload() {
        const manifestPath = `assets/images/characters/${this.charId}/animation_sequence/sequence_manifest.json`;
        if (!this.cache.json.exists(this.manifestKey)) {
            this.load.json(this.manifestKey, manifestPath);
        }
    }

    create() {
        eventBus.emit(EVENTS.MISSION_PHASE_CHANGED, { phaseId: 'transform', missionId: this.missionId, actorId: this.charId });
        const hudState: HudState = {
            score: this.score,
            distance: 0,
            speed: 0,
            missionType: this.missionType,
            status: 'ready'
        };
        emitHudUpdate(hudState);

        this.createCanvasEffects();
        this.createLoadingUI();
        this.beginFrameLoading();

        if (this.input.keyboard) {
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
            this.leftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
            this.rightKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
            this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        }

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.cleanupTextures();
        });
    }

    update(timeMs: number, deltaMs: number) {
        this.bgEffect?.update(timeMs, deltaMs);
        if (this.bgTexture) this.bgTexture.refresh();

        if (this.glowActive) {
            const done = this.glowEffect?.update(timeMs) ?? true;
            if (this.glowTexture) this.glowTexture.refresh();
            if (done) {
                this.glowActive = false;
                this.glowImage?.setVisible(false);
                this.finishTransitionOut(timeMs);
            }
        }

        if (!this.frameSprite || this.frameKeys.length === 0) return;
        if (this.hasFinishedFrames) {
            if (this.autoFinishAtMs !== null && timeMs >= this.autoFinishAtMs) {
                this.autoFinishAtMs = null;
                this.startGlowBurst(timeMs);
            }
            return;
        }

        const enterJustDown = Boolean(this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey));
        if (enterJustDown) {
            this.finishFrames(timeMs);
            return;
        }

        const leftJustDown = Boolean(this.leftKey && Phaser.Input.Keyboard.JustDown(this.leftKey));
        if (leftJustDown) {
            this.transitionToFrameIndex(Math.max(0, this.currentFrameIndex - 1));
            this.nextAutoStepAtMs = timeMs + AUTO_STEP_INTERVAL_MS;
        }

        const rightJustDown = Boolean(this.rightKey && Phaser.Input.Keyboard.JustDown(this.rightKey));
        if (rightJustDown) {
            this.transitionToFrameIndex(Math.min(this.frameKeys.length - 1, this.currentFrameIndex + 1));
            this.nextAutoStepAtMs = timeMs + AUTO_STEP_INTERVAL_MS;
        }

        const isPlaying = Boolean(this.spaceKey?.isDown);
        if (!isPlaying) {
            this.nextAutoStepAtMs = 0;
            return;
        }
        if (this.frameStepInProgress) return;

        if (this.nextAutoStepAtMs <= 0) {
            this.nextAutoStepAtMs = timeMs + AUTO_STEP_INTERVAL_MS;
            return;
        }

        if (timeMs < this.nextAutoStepAtMs) return;
        this.nextAutoStepAtMs = timeMs + AUTO_STEP_INTERVAL_MS;

        if (this.currentFrameIndex < this.frameKeys.length - 1) {
            this.transitionToFrameIndex(this.currentFrameIndex + 1);
            return;
        }

        this.finishFrames(timeMs);
    }

    private createCanvasEffects() {
        this.cleanupTextures();

        const bgTexture = this.textures.createCanvas(this.bgTextureKey, GAME_WIDTH, GAME_HEIGHT);
        if (!bgTexture) throw new Error('Failed to create transformation background canvas texture');
        this.bgTexture = bgTexture;
        this.bgImage = this.add.image(0, 0, this.bgTextureKey).setOrigin(0, 0).setDepth(0);

        const bgCtx = bgTexture.context;
        if (!bgCtx) throw new Error('Missing transformation background canvas context');
        this.bgEffect = new TransformationBackgroundEffect(bgTexture.canvas, bgCtx);
        this.bgEffect.resize(GAME_WIDTH, GAME_HEIGHT);

        const colors = GAME_CONFIG.TRANSFORMATION_COLORS[this.charId] ?? GAME_CONFIG.TRANSFORMATION_COLORS.jett;
        this.bgEffect.setColors(colors.background, colors.lines);
        const now = this.time.now;
        this.bgEffect.start(now);
        this.bgEffect.fadeIn(now, 400);

        const glowTexture = this.textures.createCanvas(this.glowTextureKey, GAME_WIDTH, GAME_HEIGHT);
        if (!glowTexture) throw new Error('Failed to create transformation glow canvas texture');
        this.glowTexture = glowTexture;
        this.glowImage = this.add
            .image(0, 0, this.glowTextureKey)
            .setOrigin(0, 0)
            .setDepth(5)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setVisible(false);

        const glowCtx = glowTexture.context;
        if (!glowCtx) throw new Error('Missing transformation glow canvas context');
        this.glowEffect = new GlowBurstEffect(glowTexture.canvas, glowCtx);
        this.glowEffect.resize(GAME_WIDTH, GAME_HEIGHT);
    }

    private createLoadingUI() {
        this.loadingLabel = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, 'Loading transformation...', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '28px',
                fontStyle: '800',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setOrigin(0.5)
            .setDepth(20);

        this.loadingBarBack = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 720, 26, 0x000000, 0.45).setDepth(20);
        this.loadingBarFill = this.add
            .rectangle(GAME_WIDTH / 2 - 360 + 4, GAME_HEIGHT / 2, 0, 18, 0x00eaff, 0.95)
            .setOrigin(0, 0.5)
            .setDepth(21);
    }

    private beginFrameLoading() {
        const manifest = this.cache.json.get(this.manifestKey) as SequenceManifest | undefined;
        const images = manifest?.images ?? [];
        const framePaths = images.map((img) => `assets/images/characters/${this.charId}/animation_sequence/${img.path}`);

        if (framePaths.length === 0) {
            this.frameKeys = [];
            this.showFallbackFrame();
            return;
        }

        const frameKeys: string[] = [];
        let pendingLoads = 0;

        for (let i = 0; i < framePaths.length; i += 1) {
            const key = this.getFrameTextureKey(i);
            if (this.textures.exists(key)) {
                frameKeys.push(key);
                continue;
            }
            pendingLoads += 1;
            frameKeys.push(key);
            this.load.image(key, framePaths[i]);
        }

        this.frameKeys = frameKeys;

        if (pendingLoads === 0) {
            this.onFramesReady();
            return;
        }

        const onProgress = (value: number) => {
            if (!this.loadingBarFill) return;
            const width = 720 - 8;
            this.loadingBarFill.width = Math.max(0, Math.floor(width * value));
        };

        const onComplete = () => {
            this.load.off('progress', onProgress);
            this.load.off('complete', onComplete);
            this.onFramesReady();
        };

        this.load.on('progress', onProgress);
        this.load.on('complete', onComplete);
        this.load.start();
    }

    private showFallbackFrame() {
        if (this.loadingLabel) {
            this.loadingLabel.setText('No frames found. Continuing...');
        }

        this.time.delayedCall(700, () => {
            this.onFramesReady();
        });
    }

    private onFramesReady() {
        this.loadingLabel?.destroy();
        this.loadingBarBack?.destroy();
        this.loadingBarFill?.destroy();
        this.loadingLabel = undefined;
        this.loadingBarBack = undefined;
        this.loadingBarFill = undefined;

        if (this.frameKeys.length > 0) {
            const sprite = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, this.frameKeys[0]).setDepth(10);
            this.setSpriteDisplayHeight(sprite, FRAME_TARGET_HEIGHT);
            this.frameSprite = sprite;
        }

        if (!this.frameDimOverlay) {
            this.frameDimOverlay = this.add
                .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
                .setOrigin(0, 0)
                .setDepth(11);
        }

        const shout = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.22, `${GAME_CONFIG.CHARACTERS[this.charId].name}, TRANSFORM!`, {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '72px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 10
            })
            .setOrigin(0.5)
            .setDepth(30)
            .setAlpha(0)
            .setScale(0.85);
        this.shoutText = shout;

        this.tweens.add({
            targets: shout,
            alpha: 1,
            scale: 1,
            duration: 550,
            ease: 'Back.easeOut',
            yoyo: true,
            hold: 900,
            onComplete: () => {
                shout.setVisible(false);
            }
        });

        this.controlsText = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT - 90, 'Hold SPACE to play  |  ← / → step  |  ENTER finish', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '22px',
                fontStyle: '800',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setOrigin(0.5)
            .setDepth(30)
            .setAlpha(0.9);

        audioManager.playSound('transform_ready');
    }

    private applyFrameIndex(index: number): void {
        if (!this.frameSprite) return;
        if (this.frameKeys.length === 0) return;
        this.currentFrameIndex = index;
        const key = this.frameKeys[index];
        this.frameSprite.setTexture(key);
        this.setSpriteDisplayHeight(this.frameSprite, FRAME_TARGET_HEIGHT);
    }

    private finishFrames(timeMs: number) {
        this.hasFinishedFrames = true;
        this.applyFrameIndex(this.frameKeys.length > 0 ? this.frameKeys.length - 1 : 0);
        this.controlsText?.setText('Transform complete!');

        if (this.frameSprite) {
            this.tweens.add({
                targets: this.frameSprite,
                scale: this.frameSprite.scaleX * 1.03,
                duration: 300,
                yoyo: true,
                ease: 'Sine.easeInOut'
            });
        }

        this.autoFinishAtMs = timeMs + 300;
    }

    private startGlowBurst(timeMs: number) {
        if (!this.glowEffect || !this.glowTexture) {
            this.finishTransitionOut(timeMs);
            return;
        }
        const colors = GAME_CONFIG.TRANSFORMATION_COLORS[this.charId] ?? GAME_CONFIG.TRANSFORMATION_COLORS.jett;
        this.glowEffect.clear();
        this.glowEffect.startBurst(timeMs, colors.glow);
        this.glowImage?.setVisible(true);
        this.glowActive = true;

        this.bgEffect?.accelerate(timeMs, 3, 800);
        this.bgEffect?.fadeOut(timeMs, 600);
    }

    private finishTransitionOut(timeMs: number) {
        this.time.delayedCall(400, () => {
            this.scene.start('LandingScene', {
                missionType: this.missionType,
                charId: this.charId,
                missionId: this.missionId,
                location: this.location,
                score: this.score,
                flightStats: this.flightStats ?? undefined
            });
        });

        this.bgEffect?.fadeOut(timeMs, 500);
    }

    private cleanupTextures() {
        if (this.textures.exists(this.bgTextureKey)) {
            this.textures.remove(this.bgTextureKey);
        }
        if (this.textures.exists(this.glowTextureKey)) {
            this.textures.remove(this.glowTextureKey);
        }
    }

    private transitionToFrameIndex(nextIndex: number): void {
        if (!this.frameSprite) return;
        if (this.frameKeys.length === 0) return;
        if (nextIndex === this.currentFrameIndex) return;
        if (this.frameStepInProgress) return;

        this.frameStepInProgress = true;

        const overlay = this.frameDimOverlay;
        if (!overlay) {
            this.applyFrameIndex(nextIndex);
            this.frameStepInProgress = false;
            return;
        }

        this.tweens.killTweensOf(overlay);
        overlay.setAlpha(0);

        this.tweens.add({
            targets: overlay,
            alpha: 0.38,
            duration: STEP_DIM_IN_MS,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.time.delayedCall(STEP_DIM_HOLD_MS, () => {
                    this.applyFrameIndex(nextIndex);

                    if (this.frameSprite) {
                        this.tweens.add({
                            targets: this.frameSprite,
                            scaleX: this.frameSprite.scaleX * 1.01,
                            scaleY: this.frameSprite.scaleY * 1.01,
                            duration: 180,
                            yoyo: true,
                            ease: 'Sine.easeInOut'
                        });
                    }

                    this.tweens.add({
                        targets: overlay,
                        alpha: 0,
                        duration: STEP_DIM_OUT_MS,
                        ease: 'Quad.easeIn',
                        onComplete: () => {
                            this.frameStepInProgress = false;
                        }
                    });
                });
            }
        });
    }

    private getFrameTextureKey(frameIndex: number): string {
        return `tf-frame-${this.charId}-${frameIndex}`;
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Image, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }
}
