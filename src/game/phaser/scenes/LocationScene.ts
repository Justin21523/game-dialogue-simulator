import Phaser from 'phaser';

import { getLocation, getNpc } from '../../../shared/data/gameData';
import { eventBus } from '../../../shared/eventBus';
import { EVENTS } from '../../../shared/eventNames';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import type { CompanionAbility } from '../../../shared/types/Companion';
import type { LocationDefinition, NpcDefinition } from '../../../shared/types/World';
import { companionManager } from '../../../shared/systems/companionManager';
import { worldStateManager } from '../../../shared/systems/worldStateManager';
import { missionManager } from '../../../shared/quests/missionManager';

export type LocationSceneInitData = {
    charId?: string;
    spawnPoint?: string;
};

type SpawnedNpc = {
    npcId: string;
    def: NpcDefinition;
    sprite: Phaser.Physics.Arcade.Sprite;
    label: Phaser.GameObjects.Text;
    dir: -1 | 1;
};

type SpawnedInteractable = {
    interactableId: string;
    type: string;
    requiredAbility?: CompanionAbility;
    sprite: Phaser.GameObjects.Sprite;
    label: Phaser.GameObjects.Text;
    state: 'idle' | 'completed';
};

type SpawnedExit = {
    exitId: string;
    targetLocationId: string;
    targetSpawnPoint: string;
    zone: Phaser.GameObjects.Zone;
    label: Phaser.GameObjects.Text;
};

const INTERACT_RANGE = 150;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

export abstract class LocationScene extends Phaser.Scene {
    protected charId = 'jett';
    protected spawnPoint = 'default';
    protected locationId = 'base_airport';
    protected location!: LocationDefinition;

    protected player!: Phaser.Physics.Arcade.Sprite;
    protected npcs: SpawnedNpc[] = [];
    protected interactables: SpawnedInteractable[] = [];
    protected exits: SpawnedExit[] = [];

    private bgFar!: Phaser.GameObjects.TileSprite;
    private bgNear!: Phaser.GameObjects.TileSprite;
    private groundY = 780;

    private keys?: {
        a: Phaser.Input.Keyboard.Key;
        d: Phaser.Input.Keyboard.Key;
        w: Phaser.Input.Keyboard.Key;
        s: Phaser.Input.Keyboard.Key;
        e: Phaser.Input.Keyboard.Key;
        c: Phaser.Input.Keyboard.Key;
    };

    private promptText?: Phaser.GameObjects.Text;
    private inputLocked = false;

    protected abstract getDefaultLocationId(): string;

    init(data: LocationSceneInitData) {
        const requested = typeof data.charId === 'string' ? data.charId : 'jett';
        this.charId = requested;
        this.spawnPoint = typeof data.spawnPoint === 'string' ? data.spawnPoint : 'default';
        this.locationId = this.getDefaultLocationId();

        const loc = getLocation(this.locationId);
        if (!loc) throw new Error(`[LocationScene] Unknown location: ${this.locationId}`);
        this.location = loc;
    }

    preload() {
        this.ensureFallbackTextures();

        const playerKey = this.getCharacterTextureKey('player', this.charId);
        if (!this.textures.exists(playerKey)) {
            this.load.image(playerKey, this.getCharacterTexturePath(this.charId));
        }

        for (const spawn of this.location.npcSpawns) {
            const npc = getNpc(spawn.npcId);
            if (!npc) continue;
            const key = this.getCharacterTextureKey('npc', npc.characterId);
            if (!this.textures.exists(key)) {
                this.load.image(key, this.getCharacterTexturePath(npc.characterId));
            }
        }
    }

    create() {
        companionManager.initialize();
        worldStateManager.initialize();
        void missionManager.initialize({ mainCharacter: this.charId });

        this.physics.world.setBounds(0, 0, this.location.worldWidth, GAME_HEIGHT);
        this.cameras.main.setBounds(0, 0, this.location.worldWidth, GAME_HEIGHT);

        this.createBackground();
        this.createPlayer();
        this.createNpcs();
        this.createInteractables();
        this.createExits();
        this.createHud();
        this.setupInput();

        this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

        eventBus.emit(EVENTS.LOCATION_CHANGED, { locationId: this.locationId });
        eventBus.emit(EVENTS.LOCATION_ENTERED, { locationId: this.locationId, actorId: this.charId });

        this.registerUiLocks();
    }

    update(timeMs: number, deltaMs: number) {
        const dt = Math.min(deltaMs / 1000, 0.1);
        this.updateNpcPatrol(dt);
        this.updatePrompt();
        this.updateBackground();

        if (!this.keys) return;
        if (this.inputLocked) {
            const body = this.player.body as Phaser.Physics.Arcade.Body;
            body.setVelocity(0, 0);
            return;
        }

        const axisX = (this.keys.d.isDown ? 1 : 0) - (this.keys.a.isDown ? 1 : 0);
        const axisY = (this.keys.s.isDown ? 1 : 0) - (this.keys.w.isDown ? 1 : 0);
        const speedX = 420;
        const speedY = 220;
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(axisX * speedX, axisY * speedY);

        if (axisX !== 0) this.player.setFlipX(axisX < 0);

        // Depth sorting: lower y appears in front.
        this.player.setDepth(30 + Math.floor(this.player.y / 10));
        for (const npc of this.npcs) {
            npc.sprite.setDepth(30 + Math.floor(npc.sprite.y / 10));
            npc.label.setPosition(npc.sprite.x, npc.sprite.y - npc.sprite.displayHeight - 10);
        }
        for (const obj of this.interactables) {
            obj.label.setPosition(obj.sprite.x, obj.sprite.y - obj.sprite.displayHeight - 10);
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.e)) {
            this.handleInteract();
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.c)) {
            eventBus.emit(EVENTS.UI_TOGGLE_COMPANION_PANEL, { actorId: this.charId });
        }

        void timeMs;
    }

    protected onExit(toLocationId: string, spawnPoint: string): void {
        const nextSceneKey = this.getSceneKeyForLocation(toLocationId);
        this.scene.start(nextSceneKey, { charId: this.charId, spawnPoint });
    }

    protected getSceneKeyForLocation(locationId: string): string {
        switch (locationId) {
            case 'base_airport':
                return 'BaseLocationScene';
            case 'warehouse_district':
                return 'WarehouseLocationScene';
            default:
                return 'BaseLocationScene';
        }
    }

    private createBackground(): void {
        const farKey = `loc-${this.locationId}-far`;
        const nearKey = `loc-${this.locationId}-near`;
        if (!this.textures.exists(farKey)) {
            const g = this.add.graphics({ x: 0, y: 0 });
            const base = this.locationId === 'warehouse_district' ? 0x1a1f2a : 0x102236;
            g.fillStyle(base, 1);
            g.fillRect(0, 0, 512, 512);
            g.fillStyle(0xffffff, 0.05);
            for (let i = 0; i < 120; i += 1) {
                g.fillCircle(Phaser.Math.Between(0, 512), Phaser.Math.Between(0, 512), Phaser.Math.Between(2, 8));
            }
            g.generateTexture(farKey, 512, 512);
            g.destroy();
        }
        if (!this.textures.exists(nearKey)) {
            const g = this.add.graphics({ x: 0, y: 0 });
            const base = this.locationId === 'warehouse_district' ? 0x243042 : 0x16405c;
            g.fillStyle(base, 1);
            g.fillRect(0, 0, 512, 512);
            g.lineStyle(6, 0xffffff, 0.06);
            for (let x = -256; x < 512 * 2; x += 44) {
                g.beginPath();
                g.moveTo(x, 0);
                g.lineTo(x + 220, 512);
                g.strokePath();
            }
            g.generateTexture(nearKey, 512, 512);
            g.destroy();
        }

        this.bgFar = this.add.tileSprite(0, 0, this.location.worldWidth, GAME_HEIGHT, farKey).setOrigin(0, 0).setAlpha(0.65);
        this.bgNear = this.add.tileSprite(0, 0, this.location.worldWidth, GAME_HEIGHT, nearKey).setOrigin(0, 0).setAlpha(0.55);

        const floorKey = `loc-${this.locationId}-floor`;
        if (!this.textures.exists(floorKey)) {
            const g = this.add.graphics({ x: 0, y: 0 });
            const floor = this.locationId === 'warehouse_district' ? 0x2f2f2f : 0x223322;
            const stripe = this.locationId === 'warehouse_district' ? 0x444444 : 0x1f8b4c;
            g.fillStyle(floor, 1);
            g.fillRect(0, 0, 512, 256);
            g.fillStyle(stripe, 1);
            g.fillRect(0, 0, 512, 64);
            g.generateTexture(floorKey, 512, 256);
            g.destroy();
        }

        this.add.tileSprite(this.location.worldWidth / 2, this.groundY + 150, this.location.worldWidth, 320, floorKey).setDepth(1);
    }

    private updateBackground(): void {
        this.bgFar.tilePositionX = this.cameras.main.scrollX * 0.08;
        this.bgNear.tilePositionX = this.cameras.main.scrollX * 0.18;
    }

    private createPlayer(): void {
        const spawn = this.location.spawnPoints[this.spawnPoint] ?? this.location.spawnPoints.default ?? { x: 320, y: this.groundY };
        const playerKey = this.getCharacterTextureKey('player', this.charId);
        const texture = this.textures.exists(playerKey) ? playerKey : 'loc-character-fallback';

        this.player = this.physics.add.sprite(spawn.x, spawn.y, texture);
        this.player.setOrigin(0.5, 1);
        this.player.setCollideWorldBounds(true);
        this.setSpriteDisplayHeight(this.player, 520);

        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        body.setSize(this.player.displayWidth * 0.5, this.player.displayHeight * 0.65, true);
        body.setOffset(this.player.displayWidth * 0.25, this.player.displayHeight * 0.35);
    }

    private createNpcs(): void {
        for (const spawn of this.location.npcSpawns) {
            const def = getNpc(spawn.npcId);
            if (!def) continue;

            const key = this.getCharacterTextureKey('npc', def.characterId);
            const texture = this.textures.exists(key) ? key : 'loc-character-fallback';
            const sprite = this.physics.add.sprite(spawn.x, spawn.y, texture);
            sprite.setOrigin(0.5, 1);
            sprite.setImmovable(true);
            sprite.setCollideWorldBounds(true);
            this.setSpriteDisplayHeight(sprite, 420);

            const body = sprite.body as Phaser.Physics.Arcade.Body;
            body.setAllowGravity(false);
            body.setImmovable(true);

            const label = this.add
                .text(sprite.x, sprite.y - sprite.displayHeight - 10, def.displayName, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '20px',
                    fontStyle: '900',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(2000);

            this.npcs.push({
                npcId: def.npcId,
                def,
                sprite,
                label,
                dir: 1
            });
        }
    }

    private createInteractables(): void {
        for (const def of this.location.interactables) {
            const texture = def.type === 'quest_target' ? 'loc-relay' : def.type === 'exit_hint' ? 'loc-exit' : 'loc-item';
            const sprite = this.add.sprite(def.x, def.y, texture);
            sprite.setOrigin(0.5, 1);
            sprite.setDepth(10);

            const label = this.add
                .text(sprite.x, sprite.y - sprite.displayHeight - 10, def.label, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '18px',
                    fontStyle: '800',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(2000);

            this.interactables.push({
                interactableId: def.interactableId,
                type: def.type,
                requiredAbility: def.requiredAbility,
                sprite,
                label,
                state: 'idle'
            });
        }
    }

    private createExits(): void {
        for (const exit of this.location.exits) {
            const zone = this.add.zone(exit.x, exit.y, exit.width, exit.height);
            zone.setOrigin(0.5, 1);

            const targetName = getLocation(exit.targetLocationId)?.displayName ?? exit.targetLocationId;
            const label = this.add
                .text(exit.x, exit.y - exit.height + 24, `EXIT → ${targetName}`, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '16px',
                    fontStyle: '900',
                    color: '#00eaff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(2000);

            this.exits.push({
                exitId: exit.exitId,
                targetLocationId: exit.targetLocationId,
                targetSpawnPoint: exit.targetSpawnPoint,
                zone,
                label
            });
        }
    }

    private createHud(): void {
        this.promptText = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT - 80, '', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '26px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 8
            })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(5000)
            .setAlpha(0);
    }

    private setupInput(): void {
        if (!this.input.keyboard) return;
        this.keys = {
            a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            e: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
            c: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C)
        };
    }

    private updateNpcPatrol(dt: number): void {
        for (const npc of this.npcs) {
            const patrol = npc.def.patrol;
            if (!patrol) continue;

            npc.sprite.x += npc.dir * patrol.speed * dt;
            if (npc.sprite.x > patrol.maxX) npc.dir = -1;
            if (npc.sprite.x < patrol.minX) npc.dir = 1;
            npc.sprite.setFlipX(npc.dir < 0);
        }
    }

    private updatePrompt(): void {
        if (!this.promptText) return;
        const prompt = this.getNearestPrompt();
        if (!prompt) {
            this.promptText.setAlpha(0);
            return;
        }

        this.promptText.setText(prompt);
        this.promptText.setAlpha(1);
    }

    private getNearestPrompt(): string | null {
        if (this.inputLocked) return 'Dialogue open';
        const target = this.findNearestTarget();
        if (!target) return null;

        if (target.kind === 'npc') return `Press E to talk to ${target.name}`;
        if (target.kind === 'interactable') return `Press E to interact`;
        if (target.kind === 'exit') return `Press E to travel`;
        return null;
    }

    private handleInteract(): void {
        const target = this.findNearestTarget();
        if (!target) return;

        if (target.kind === 'npc') {
            eventBus.emit(EVENTS.DIALOGUE_OPEN, { npcId: target.npcId, actorId: this.charId });
            return;
        }

        if (target.kind === 'exit') {
            if (!worldStateManager.isLocationUnlocked(target.targetLocationId)) {
                this.flashPrompt('This destination is locked. Start the quest to unlock it.');
                return;
            }
            this.cameras.main.fadeOut(220, 0, 0, 0);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                this.onExit(target.targetLocationId, target.targetSpawnPoint);
            });
            return;
        }

        if (target.kind === 'interactable') {
            const obj = this.interactables.find((o) => o.interactableId === target.interactableId) ?? null;
            if (!obj) return;
            if (obj.state === 'completed') return;

            if (obj.requiredAbility && !companionManager.isAbilityAvailable(obj.requiredAbility)) {
                this.flashPrompt(`Requires ${obj.requiredAbility}. Press C to call a companion.`);
                return;
            }

            if (obj.requiredAbility) {
                eventBus.emit(EVENTS.COMPANION_ABILITY_USED, {
                    ability: obj.requiredAbility,
                    targetId: obj.interactableId,
                    actorId: this.charId
                });
            } else {
                eventBus.emit(EVENTS.CUSTOM_ACTION, { actionTarget: obj.interactableId, actorId: this.charId });
            }

            obj.state = 'completed';
            obj.sprite.setTint(0x4caf50);
            this.flashPrompt('Interaction complete!');
        }
    }

    private flashPrompt(message: string): void {
        if (!this.promptText) return;
        this.promptText.setText(message);
        this.promptText.setAlpha(1);
        this.tweens.killTweensOf(this.promptText);
        this.tweens.add({
            targets: this.promptText,
            alpha: 0,
            duration: 1100,
            ease: 'Cubic.easeOut'
        });
    }

    private findNearestTarget():
        | { kind: 'npc'; npcId: string; name: string }
        | { kind: 'interactable'; interactableId: string }
        | { kind: 'exit'; targetLocationId: string; targetSpawnPoint: string }
        | null {
        const px = this.player.x;
        const py = this.player.y;

        let best: { dist: number } & (
            | { kind: 'npc'; npcId: string; name: string }
            | { kind: 'interactable'; interactableId: string }
            | { kind: 'exit'; targetLocationId: string; targetSpawnPoint: string }
        ) | null = null;

        for (const npc of this.npcs) {
            const d = Phaser.Math.Distance.Between(px, py, npc.sprite.x, npc.sprite.y);
            if (d > INTERACT_RANGE) continue;
            if (!best || d < best.dist) {
                best = { kind: 'npc', npcId: npc.npcId, name: npc.def.displayName, dist: d };
            }
        }

        for (const obj of this.interactables) {
            const d = Phaser.Math.Distance.Between(px, py, obj.sprite.x, obj.sprite.y);
            if (d > INTERACT_RANGE) continue;
            if (!best || d < best.dist) {
                best = { kind: 'interactable', interactableId: obj.interactableId, dist: d };
            }
        }

        for (const ex of this.exits) {
            const bounds = ex.zone.getBounds();
            const inside = bounds.contains(px, py);
            if (!inside) continue;
            if (!best) {
                best = { kind: 'exit', targetLocationId: ex.targetLocationId, targetSpawnPoint: ex.targetSpawnPoint, dist: 0 };
            }
        }

        if (!best) return null;
        const { dist, ...rest } = best;
        void dist;
        return rest;
    }

    private registerUiLocks(): void {
        const onOpened = (payload: unknown) => {
            if (!isRecord(payload)) return;
            if (payload.npcId !== undefined && payload.npcId !== null && typeof payload.npcId !== 'string') return;
            this.inputLocked = true;
        };
        const onClosed = () => {
            this.inputLocked = false;
        };

        eventBus.on(EVENTS.DIALOGUE_UI_OPENED, onOpened);
        eventBus.on(EVENTS.DIALOGUE_UI_CLOSED, onClosed);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            eventBus.off(EVENTS.DIALOGUE_UI_OPENED, onOpened);
            eventBus.off(EVENTS.DIALOGUE_UI_CLOSED, onClosed);
        });
    }

    private ensureFallbackTextures(): void {
        if (!this.textures.exists('loc-character-fallback')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xe31d2b, 1);
            g.fillRoundedRect(0, 0, 240, 300, 42);
            g.fillStyle(0xffffff, 0.9);
            g.fillRoundedRect(26, 60, 188, 34, 18);
            g.generateTexture('loc-character-fallback', 240, 300);
            g.destroy();
        }

        if (!this.textures.exists('loc-relay')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x777777, 1);
            g.fillRoundedRect(0, 0, 140, 180, 24);
            g.lineStyle(6, 0xff3333, 1);
            g.strokeRoundedRect(16, 20, 108, 140, 18);
            g.fillStyle(0xff3333, 0.25);
            g.fillRoundedRect(24, 30, 92, 120, 16);
            g.generateTexture('loc-relay', 140, 180);
            g.destroy();
        }

        if (!this.textures.exists('loc-exit')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x3a3a3a, 1);
            g.fillRoundedRect(0, 0, 140, 200, 26);
            g.lineStyle(8, 0x00eaff, 0.8);
            g.strokeRoundedRect(12, 18, 116, 160, 24);
            g.generateTexture('loc-exit', 140, 200);
            g.destroy();
        }

        if (!this.textures.exists('loc-item')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffd700, 1);
            g.fillRoundedRect(0, 0, 64, 64, 14);
            g.lineStyle(4, 0xffffff, 0.9);
            g.strokeRoundedRect(10, 10, 44, 44, 10);
            g.generateTexture('loc-item', 64, 64);
            g.destroy();
        }
    }

    private getCharacterTextureKey(kind: string, characterId: string): string {
        return `loc-${kind}-${characterId}`;
    }

    private getCharacterTexturePath(characterId: string): string {
        // Use a universally available sprite first to avoid missing textures.
        return `assets/images/characters/${characterId}/all/action_pose_v1.png`;
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Sprite, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }
}
