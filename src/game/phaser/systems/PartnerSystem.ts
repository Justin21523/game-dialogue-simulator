import Phaser from 'phaser';

import { eventBus } from '../../../shared/eventBus';
import { EVENTS } from '../../../shared/eventNames';
import { GAME_CONFIG, type CharacterId } from '../../../shared/gameConfig';

export type PartnerSystemOptions = {
    callCooldownMs?: number;
    followDistance?: number;
    followSpeed?: number;
    spawnOffsetX?: number;
    spawnOffsetY?: number;
};

type PartnerEntry = {
    charId: CharacterId;
    sprite: Phaser.Physics.Arcade.Sprite;
    aiControlled: boolean;
};

const DEFAULT_OPTIONS: Required<PartnerSystemOptions> = {
    callCooldownMs: 5000,
    followDistance: 180,
    followSpeed: 360,
    spawnOffsetX: 140,
    spawnOffsetY: 0
};

export class PartnerSystem {
    private readonly scene: Phaser.Scene;
    private readonly options: Required<PartnerSystemOptions>;

    private readonly partners = new Map<CharacterId, PartnerEntry>();
    private readonly partnerOrder: CharacterId[] = [];
    private current: PartnerEntry | null = null;

    private lastCallTimeMs = 0;

    constructor(scene: Phaser.Scene, options: PartnerSystemOptions = {}) {
        this.scene = scene;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    initialize(startingCharId: CharacterId, spawnX: number, spawnY: number): PartnerEntry {
        const entry = this.spawnCharacter(startingCharId, spawnX, spawnY);
        entry.aiControlled = false;
        this.current = entry;
        eventBus.emit(EVENTS.CHARACTER_SWITCHED, { characterId: startingCharId, actorId: startingCharId });
        return entry;
    }

    getCurrent(): PartnerEntry {
        if (!this.current) {
            throw new Error('[PartnerSystem] Not initialized');
        }
        return this.current;
    }

    getActiveCharacterIds(): CharacterId[] {
        return [...this.partnerOrder];
    }

    getEntry(charId: CharacterId): PartnerEntry | null {
        return this.partners.get(charId) ?? null;
    }

    callPartner(charId: CharacterId): boolean {
        const nowMs = Date.now();
        if (nowMs - this.lastCallTimeMs < this.options.callCooldownMs) {
            return false;
        }

        this.lastCallTimeMs = nowMs;

        if (this.partners.has(charId)) {
            this.switchTo(charId);
            return true;
        }

        const current = this.getCurrent();
        const entry = this.spawnCharacter(
            charId,
            current.sprite.x + this.options.spawnOffsetX,
            current.sprite.y + this.options.spawnOffsetY
        );
        entry.aiControlled = true;

        eventBus.emit(EVENTS.PARTNER_SUMMONED, { partnerId: charId, actorId: charId });
        return true;
    }

    dismissPartner(charId: CharacterId): boolean {
        const entry = this.partners.get(charId);
        if (!entry) return false;
        if (this.current?.charId === charId) return false;
        entry.sprite.destroy();
        this.partners.delete(charId);
        const index = this.partnerOrder.indexOf(charId);
        if (index >= 0) this.partnerOrder.splice(index, 1);
        return true;
    }

    switchTo(charId: CharacterId): boolean {
        const next = this.partners.get(charId);
        if (!next) return false;
        if (this.current?.charId === charId) return true;

        const prev = this.current;
        if (prev) prev.aiControlled = true;
        next.aiControlled = false;
        this.current = next;

        eventBus.emit(EVENTS.CHARACTER_SWITCHED, { characterId: charId, actorId: charId });
        return true;
    }

    switchNext(): void {
        if (this.partnerOrder.length === 0) return;
        const current = this.getCurrent();
        const index = this.partnerOrder.indexOf(current.charId);
        const nextId = this.partnerOrder[(index + 1) % this.partnerOrder.length] ?? current.charId;
        this.switchTo(nextId);
    }

    switchPrevious(): void {
        if (this.partnerOrder.length === 0) return;
        const current = this.getCurrent();
        const index = this.partnerOrder.indexOf(current.charId);
        const nextIndex = (index - 1 + this.partnerOrder.length) % this.partnerOrder.length;
        const nextId = this.partnerOrder[nextIndex] ?? current.charId;
        this.switchTo(nextId);
    }

    update(dt: number): void {
        const current = this.current;
        if (!current) return;

        for (const entry of this.partners.values()) {
            if (!entry.aiControlled) continue;
            this.updateAiFollow(entry, current, dt);
        }
    }

    private updateAiFollow(entry: PartnerEntry, leader: PartnerEntry, dt: number): void {
        const body = entry.sprite.body as Phaser.Physics.Arcade.Body;
        if (!body) return;

        const dx = leader.sprite.x - entry.sprite.x;
        const targetSign = dx === 0 ? 0 : dx > 0 ? 1 : -1;
        const dist = Math.abs(dx);
        const desired = dist > this.options.followDistance ? targetSign : 0;

        const vx = desired * this.options.followSpeed;
        body.setVelocityX(vx);

        // If stuck above ground, let physics settle.
        if (dist < this.options.followDistance * 0.5) {
            body.setVelocityX(Phaser.Math.Linear(body.velocity.x, 0, dt * 6));
        }
    }

    private spawnCharacter(charId: CharacterId, x: number, y: number): PartnerEntry {
        const key = this.getTextureKey(charId);
        const fallback = 'explore-character-fallback';
        const texture = this.scene.textures.exists(key) ? key : fallback;

        const sprite = this.scene.physics.add.sprite(x, y, texture);
        sprite.setDepth(20);
        sprite.setCollideWorldBounds(true);
        sprite.setOrigin(0.5, 1);

        this.setSpriteDisplayHeight(sprite, 520);

        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setSize(sprite.displayWidth * 0.5, sprite.displayHeight * 0.75, true);
        body.setOffset(sprite.displayWidth * 0.25, sprite.displayHeight * 0.25);

        const entry: PartnerEntry = { charId, sprite, aiControlled: true };
        this.partners.set(charId, entry);
        this.partnerOrder.push(charId);

        return entry;
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Sprite, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }

    private getTextureKey(charId: CharacterId): string {
        return `explore-char-${charId}`;
    }
}

export function getExplorationCharacterTexturePath(charId: string): string {
    return `assets/images/characters/${charId}/all/standing_pose_v1.png`;
}
