import Phaser from 'phaser';

import { audioManager } from '../../../shared/audio/audioManager';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { eventBus } from '../../../shared/eventBus';
import { EVENTS } from '../../../shared/eventNames';
import { GAME_CONFIG, type CharacterId } from '../../../shared/gameConfig';
import { emitHudUpdate } from '../../../shared/hudEvents';
import type { HudState } from '../../../shared/types/Scene';

type ArrivalInitData = {
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

export class ArrivalScene extends Phaser.Scene {
    private missionType = 'Delivery';
    private missionId = 'm_local';
    private charId: CharacterId = 'jett';
    private location = 'Destination';
    private score = 0;
    private flightStats: ArrivalInitData['flightStats'] | null = null;

    constructor() {
        super({ key: 'ArrivalScene' });
    }

    init(data: ArrivalInitData) {
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
    }

    preload() {
        const charKey = this.getCharacterTextureKey(this.charId);
        if (!this.textures.exists(charKey)) {
            this.load.image(charKey, `assets/images/characters/${this.charId}/all/action_pose_v1.png`);
        }
    }

    create() {
        eventBus.emit(EVENTS.MISSION_PHASE_CHANGED, { phaseId: 'arrival', missionId: this.missionId, actorId: this.charId });
        const hudState: HudState = {
            score: this.score,
            distance: 0,
            speed: 0,
            missionType: this.missionType,
            status: 'ready'
        };
        emitHudUpdate(hudState);

        const bg = this.add.graphics();
        bg.fillGradientStyle(0x1a2a44, 0x2c4875, 0x2c4875, 0x446dff, 1);
        bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        const pulse = this.add
            .ellipse(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.65, GAME_HEIGHT * 0.65, 0xffffff, 0.06)
            .setBlendMode(Phaser.BlendModes.SCREEN)
            .setDepth(1);
        this.tweens.add({
            targets: pulse,
            scaleX: 1.06,
            scaleY: 1.06,
            alpha: 0.14,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        const charKey = this.getCharacterTextureKey(this.charId);
        const sprite = this.add.image(GAME_WIDTH / 2, -GAME_HEIGHT * 0.4, charKey).setDepth(5);
        this.setSpriteDisplayHeight(sprite, 520);

        const glow = this.add
            .image(sprite.x, sprite.y, charKey)
            .setDepth(4)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(0xffffff)
            .setAlpha(0.22);
        glow.setScale(sprite.scaleX * 1.02, sprite.scaleY * 1.02);
        this.tweens.add({
            targets: glow,
            alpha: { from: 0.18, to: 0.5 },
            duration: 750,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.tweens.add({
            targets: [sprite, glow],
            y: GAME_HEIGHT / 2 + 40,
            duration: 1400,
            ease: 'Cubic.easeOut'
        });

        this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.16, 'ARRIVED!', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '96px',
                fontStyle: '900',
                color: '#FFD700',
                stroke: '#000000',
                strokeThickness: 10
            })
            .setOrigin(0.5, 0.5)
            .setDepth(10);

        this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.24, String(this.location).toUpperCase(), {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '48px',
                fontStyle: '800',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 8
            })
            .setOrigin(0.5, 0.5)
            .setDepth(10);

        audioManager.playSound('success');

        this.time.delayedCall(2600, () => {
            this.cameras.main.fadeOut(420, 255, 255, 255);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                this.scene.start('TransformationScene', {
                    missionType: this.missionType,
                    charId: this.charId,
                    missionId: this.missionId,
                    location: this.location,
                    score: this.score,
                    flightStats: this.flightStats ?? undefined
                });
            });
        });
    }

    private getCharacterTextureKey(charId: string): string {
        return `arrival-${charId}`;
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Image, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }
}
