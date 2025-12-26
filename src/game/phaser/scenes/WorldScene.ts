import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { getLocation, getNpc } from '../../../shared/data/gameData';
import { eventBus } from '../../../shared/eventBus';
import { EVENTS } from '../../../shared/eventNames';
import { companionManager } from '../../../shared/systems/companionManager';
import { worldStateManager } from '../../../shared/systems/worldStateManager';
import { missionManager } from '../../../shared/quests/missionManager';
import type { CompanionAbility } from '../../../shared/types/Companion';
import type { ColliderDefinition, DoorDefinition, InteractableDefinition, LocationDefinition, PropDefinition, SecretDefinition } from '../../../shared/types/World';
import { NpcBehaviorSystem, type SpawnedNpc } from '../systems/NpcBehaviorSystem';
import { ParallaxSystem } from '../systems/ParallaxSystem';

export type WorldSceneInitData = {
    charId?: string;
    locationId?: string;
    spawnPoint?: string;
};

type SpawnedInteractable = {
    id: string;
    kind: 'interactable' | 'door' | 'prop';
    interactableType?: InteractableDefinition['type'] | 'door' | 'prop';
    requiredAbility?: CompanionAbility;
    targetLocationId?: string;
    targetSpawnPoint?: string;
    message?: string;
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

const DEFAULT_GROUND_Y = 760;
const INTERACT_RANGE = 150;
const PLAYER_SPEED = 320;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

export class WorldScene extends Phaser.Scene {
    private charId = 'jett';
    private locationId = 'base_airport';
    private spawnPoint = 'default';

    private location!: LocationDefinition;
    private groundY = DEFAULT_GROUND_Y;

    private parallax = new ParallaxSystem(this);
    private npcBehavior = new NpcBehaviorSystem();

    private player!: Phaser.Physics.Arcade.Sprite;
    private npcs: SpawnedNpc[] = [];
    private interactables: SpawnedInteractable[] = [];
    private exits: SpawnedExit[] = [];
    private colliders!: Phaser.Physics.Arcade.StaticGroup;

    private keys?: {
        a: Phaser.Input.Keyboard.Key;
        d: Phaser.Input.Keyboard.Key;
        e: Phaser.Input.Keyboard.Key;
        c: Phaser.Input.Keyboard.Key;
    };
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

    private promptText?: Phaser.GameObjects.Text;
    private inputLocked = false;
    private lastPersistAtMs = 0;

    constructor() {
        super({ key: 'WorldScene' });
    }

    init(data: WorldSceneInitData): void {
        this.charId = typeof data.charId === 'string' && data.charId ? data.charId : 'jett';
        this.locationId = typeof data.locationId === 'string' && data.locationId ? data.locationId : 'base_airport';
        this.spawnPoint = typeof data.spawnPoint === 'string' && data.spawnPoint ? data.spawnPoint : 'default';

        const loc = getLocation(this.locationId);
        if (!loc) {
            this.locationId = 'base_airport';
        }
        const resolved = getLocation(this.locationId);
        if (!resolved) throw new Error(`[WorldScene] Unknown location: ${this.locationId}`);
        this.location = resolved;
        this.groundY = DEFAULT_GROUND_Y;
    }

    preload(): void {
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

    create(): void {
        companionManager.initialize();
        worldStateManager.initialize();
        void missionManager.initialize({ mainCharacter: this.charId });

        this.physics.world.setBounds(0, 0, this.location.worldWidth, GAME_HEIGHT);
        this.cameras.main.setBounds(0, 0, this.location.worldWidth, GAME_HEIGHT);

        this.parallax.create(this.locationId, this.location.parallax, this.location.worldWidth);

        this.colliders = this.physics.add.staticGroup();

        this.createGround();
        this.createPlayer();
        this.createProps(this.location.props ?? []);
        this.createDoors(this.location.doors ?? []);
        this.createInteractables(this.location.interactables);
        this.createExits(this.location.exits);
        this.createNpcs();
        this.createColliders(this.location.colliders ?? []);
        this.createHud();
        this.setupInput();

        this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

        eventBus.emit(EVENTS.LOCATION_CHANGED, { locationId: this.locationId });
        eventBus.emit(EVENTS.LOCATION_ENTERED, { locationId: this.locationId, actorId: this.charId });

        this.registerUiLocks();
        this.persistPlayerState(this.time.now);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.parallax.destroy();
        });
    }

    update(timeMs: number, deltaMs: number): void {
        const dt = Math.min(deltaMs / 1000, 0.1);

        this.parallax.update(this.cameras.main);
        this.npcBehavior.update(this.npcs, timeMs, dt);
        this.updatePrompt();
        this.checkSecrets(this.location.secrets ?? []);

        if (this.keys) {
            this.updatePlayerMovement();
            if (Phaser.Input.Keyboard.JustDown(this.keys.e)) {
                this.handleInteract();
            }
            if (Phaser.Input.Keyboard.JustDown(this.keys.c)) {
                eventBus.emit(EVENTS.UI_TOGGLE_COMPANION_PANEL, { actorId: this.charId });
            }
        }

        if (timeMs - this.lastPersistAtMs > 1000) {
            this.persistPlayerState(timeMs);
        }

        void dt;
    }

    private createGround(): void {
        const floorKey = `world-floor:${this.locationId}`;
        if (!this.textures.exists(floorKey)) {
            const g = this.add.graphics({ x: 0, y: 0 });
            const base = this.location.theme?.includes('interior') ? 0x2b2b2b : 0x223322;
            const stripe = this.location.theme?.includes('interior') ? 0x444444 : 0x1f8b4c;
            g.fillStyle(base, 1);
            g.fillRect(0, 0, 512, 256);
            g.fillStyle(stripe, 1);
            g.fillRect(0, 0, 512, 64);
            g.generateTexture(floorKey, 512, 256);
            g.destroy();
        }

        this.add.tileSprite(this.location.worldWidth / 2, this.groundY + 150, this.location.worldWidth, 320, floorKey).setDepth(10);
    }

    private createPlayer(): void {
        const spawn = this.location.spawnPoints[this.spawnPoint] ?? this.location.spawnPoints.default ?? { x: 320, y: this.groundY };
        const playerKey = this.getCharacterTextureKey('player', this.charId);
        const texture = this.textures.exists(playerKey) ? playerKey : 'world-character-fallback';

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
            const texture = this.textures.exists(key) ? key : 'world-character-fallback';
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
                dir: 1,
                pathIndex: 0,
                waitUntilMs: 0
            });
        }
    }

    private createProps(props: PropDefinition[]): void {
        for (const def of props) {
            const texture = this.getPropTexture(def.type);
            const sprite = this.add.sprite(def.x, def.y, texture).setOrigin(0.5, 1).setDepth(20);
            const label = this.add
                .text(sprite.x, sprite.y - sprite.displayHeight - 10, def.label ?? '', {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '16px',
                    fontStyle: '800',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(2000)
                .setVisible(Boolean(def.label));

            if (def.collides) {
                const w = def.width ?? sprite.displayWidth;
                const h = def.height ?? sprite.displayHeight;
                const collider = this.colliders.create(def.x, def.y - h / 2, 'world-solid');
                collider.setVisible(false);
                collider.setDisplaySize(w, h);
                (collider.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
            }

            this.interactables.push({
                id: def.propId,
                kind: 'prop',
                interactableType: 'prop',
                sprite,
                label,
                requiredAbility: undefined,
                targetLocationId: undefined,
                targetSpawnPoint: undefined,
                message: def.message,
                state: 'idle'
            });
        }
    }

    private createDoors(doors: DoorDefinition[]): void {
        for (const door of doors) {
            const sprite = this.add.sprite(door.x, door.y, 'world-door').setOrigin(0.5, 1).setDepth(25);
            sprite.setDisplaySize(door.width, door.height);

            const label = this.add
                .text(door.x, door.y - door.height - 10, door.label, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '16px',
                    fontStyle: '900',
                    color: '#00eaff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(2000);

            this.interactables.push({
                id: door.doorId,
                kind: 'door',
                interactableType: 'door',
                targetLocationId: door.targetLocationId,
                targetSpawnPoint: door.targetSpawnPoint,
                sprite,
                label,
                state: 'idle'
            });
        }
    }

    private createInteractables(defs: InteractableDefinition[]): void {
        for (const def of defs) {
            const texture =
                def.type === 'quest_target'
                    ? 'world-relay'
                    : def.type === 'exit_hint'
                      ? 'world-exit'
                      : def.type === 'pickup'
                        ? 'world-item'
                        : def.type === 'terminal'
                          ? 'world-terminal'
                          : def.type === 'sign'
                            ? 'world-sign'
                            : def.type === 'door'
                              ? 'world-door'
                              : 'world-item';

            const sprite = this.add.sprite(def.x, def.y, texture).setOrigin(0.5, 1).setDepth(22);

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
                id: def.interactableId,
                kind: 'interactable',
                interactableType: def.type,
                requiredAbility: def.requiredAbility,
                targetLocationId: def.targetLocationId,
                targetSpawnPoint: def.targetSpawnPoint,
                message: def.message,
                sprite,
                label,
                state: 'idle'
            });
        }
    }

    private createExits(exits: LocationDefinition['exits']): void {
        for (const exit of exits) {
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

    private createColliders(defs: ColliderDefinition[]): void {
        for (const def of defs) {
            const sprite = this.colliders.create(def.x, def.y, 'world-solid');
            sprite.setVisible(false);
            sprite.setDisplaySize(def.width, def.height);
            (sprite.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        }

        this.physics.add.collider(this.player, this.colliders);
        for (const npc of this.npcs) {
            this.physics.add.collider(npc.sprite, this.colliders);
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
            e: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
            c: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C)
        };
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    private updatePlayerMovement(): void {
        if (this.inputLocked) {
            const body = this.player.body as Phaser.Physics.Arcade.Body;
            body.setVelocity(0, 0);
            return;
        }
        if (!this.keys) return;

        const cursors = this.cursors;
        const rightDown = this.keys.d.isDown || (cursors?.right?.isDown ?? false);
        const leftDown = this.keys.a.isDown || (cursors?.left?.isDown ?? false);
        const velocity = rightDown ? PLAYER_SPEED : leftDown ? -PLAYER_SPEED : 0;

        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(velocity, 0);
        if (velocity !== 0) {
            this.player.setFlipX(velocity < 0);
        }

        this.player.y = this.groundY;
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
        if (target.kind === 'exit') return 'Press E to travel';
        if (target.kind === 'door') return `Press E to enter`;
        if (target.kind === 'interactable') return 'Press E to interact';
        if (target.kind === 'prop') return target.label ? `Press E to read` : 'Press E';
        return null;
    }

    private handleInteract(): void {
        if (this.inputLocked) return;
        const target = this.findNearestTarget();
        if (!target) return;

        if (target.kind === 'npc') {
            eventBus.emit(EVENTS.DIALOGUE_OPEN, { npcId: target.npcId, actorId: this.charId });
            return;
        }

        if (target.kind === 'exit') {
            if (!worldStateManager.isLocationUnlocked(target.targetLocationId)) {
                this.flashPrompt('This destination is locked.');
                return;
            }
            this.transitionToLocation(target.targetLocationId, target.targetSpawnPoint);
            return;
        }

        const obj = this.interactables.find((o) => o.id === target.id) ?? null;
        if (!obj || obj.state === 'completed') return;

        if (target.kind === 'door') {
            if (obj.targetLocationId) {
                this.transitionToLocation(obj.targetLocationId, obj.targetSpawnPoint ?? 'default');
            }
            return;
        }

        if (target.kind === 'prop' && obj.message) {
            this.flashPrompt(obj.message);
            return;
        }

        if (obj.requiredAbility && !companionManager.isAbilityAvailable(obj.requiredAbility)) {
            this.flashPrompt(`Requires ${obj.requiredAbility}. Press C to call a companion.`);
            return;
        }

        if (obj.kind === 'interactable' && obj.targetLocationId && obj.targetSpawnPoint) {
            this.transitionToLocation(obj.targetLocationId, obj.targetSpawnPoint);
            return;
        }

        if (obj.kind === 'interactable') {
            if (obj.requiredAbility) {
                eventBus.emit(EVENTS.COMPANION_ABILITY_USED, {
                    ability: obj.requiredAbility,
                    targetId: obj.id,
                    actorId: this.charId
                });
            } else if (obj.id) {
                eventBus.emit(EVENTS.CUSTOM_ACTION, { actionTarget: obj.id, actorId: this.charId });
            }

            if (obj.kind === 'interactable' && obj.id && obj.message) {
                this.flashPrompt(obj.message);
            } else {
                this.flashPrompt('Interaction complete!');
            }

            if (obj.kind === 'interactable' && obj.interactableType === 'pickup') {
                eventBus.emit(EVENTS.ITEM_COLLECTED, { itemId: obj.id, quantity: 1, actorId: this.charId });
                obj.sprite.setVisible(false);
                obj.label.setText('Collected');
                obj.label.setAlpha(0.65);
                obj.state = 'completed';
                return;
            }

            obj.state = 'completed';
            obj.sprite.setTint(0x4caf50);
        }
    }

    private transitionToLocation(locationId: string, spawnPoint: string): void {
        this.cameras.main.fadeOut(220, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start('WorldScene', { charId: this.charId, locationId, spawnPoint });
        });
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
        | { kind: 'interactable'; id: string }
        | { kind: 'door'; id: string }
        | { kind: 'prop'; id: string; label: string | null }
        | { kind: 'exit'; targetLocationId: string; targetSpawnPoint: string }
        | null {
        const px = this.player.x;
        const py = this.player.y;

        let best:
            | { dist: number; kind: 'npc'; npcId: string; name: string }
            | { dist: number; kind: 'interactable'; id: string }
            | { dist: number; kind: 'door'; id: string }
            | { dist: number; kind: 'prop'; id: string; label: string | null }
            | { dist: number; kind: 'exit'; targetLocationId: string; targetSpawnPoint: string }
            | null = null;

        for (const npc of this.npcs) {
            const range = npc.def.interactionRadius ?? INTERACT_RANGE;
            const d = Phaser.Math.Distance.Between(px, py, npc.sprite.x, npc.sprite.y);
            if (d > range) continue;
            if (!best || d < best.dist) {
                best = { kind: 'npc', npcId: npc.npcId, name: npc.def.displayName, dist: d };
            }
        }

        for (const obj of this.interactables) {
            const d = Phaser.Math.Distance.Between(px, py, obj.sprite.x, obj.sprite.y);
            if (d > INTERACT_RANGE) continue;
            if (!best || d < best.dist) {
                const label = obj.kind === 'prop' ? (obj.label.text ? obj.label.text : null) : null;
                best = { kind: obj.kind === 'door' ? 'door' : obj.kind === 'prop' ? 'prop' : 'interactable', id: obj.id, dist: d, label } as any;
            }
        }

        for (const ex of this.exits) {
            const bounds = ex.zone.getBounds();
            if (!bounds.contains(px, py)) continue;
            if (!best) {
                best = { kind: 'exit', targetLocationId: ex.targetLocationId, targetSpawnPoint: ex.targetSpawnPoint, dist: 0 };
            }
        }

        if (!best) return null;
        const { dist, ...rest } = best;
        void dist;
        return rest as any;
    }

    private checkSecrets(secrets: SecretDefinition[]): void {
        if (secrets.length === 0) return;
        const px = this.player.x;
        const py = this.player.y;

        for (const secret of secrets) {
            if (worldStateManager.hasWorldFlag(secret.worldFlag)) continue;
            const rect = new Phaser.Geom.Rectangle(secret.x - secret.width / 2, secret.y - secret.height, secret.width, secret.height);
            if (!rect.contains(px, py)) continue;

            worldStateManager.setWorldFlag(secret.worldFlag);
            if (secret.rewardItemId) {
                worldStateManager.addItem(secret.rewardItemId, 1);
            }
            const rewardText = secret.message ?? 'Secret discovered!';
            this.flashPrompt(rewardText);
        }
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

    private persistPlayerState(timeMs: number): void {
        const state = {
            locationId: this.locationId,
            spawnPoint: this.spawnPoint,
            x: this.player?.x ?? 0,
            y: this.player?.y ?? 0,
            movementMode: 'walk' as const
        };
        worldStateManager.setLastPlayerState(state);
        this.lastPersistAtMs = timeMs;
    }

    private ensureFallbackTextures(): void {
        if (!this.textures.exists('world-character-fallback')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xe31d2b, 1);
            g.fillRoundedRect(0, 0, 240, 300, 42);
            g.fillStyle(0xffffff, 0.9);
            g.fillRoundedRect(26, 60, 188, 34, 18);
            g.generateTexture('world-character-fallback', 240, 300);
            g.destroy();
        }

        if (!this.textures.exists('world-relay')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x777777, 1);
            g.fillRoundedRect(0, 0, 140, 180, 24);
            g.lineStyle(6, 0xff3333, 1);
            g.strokeRoundedRect(16, 20, 108, 140, 18);
            g.fillStyle(0xff3333, 0.25);
            g.fillRoundedRect(24, 30, 92, 120, 16);
            g.generateTexture('world-relay', 140, 180);
            g.destroy();
        }

        if (!this.textures.exists('world-exit')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x3a3a3a, 1);
            g.fillRoundedRect(0, 0, 140, 200, 26);
            g.lineStyle(8, 0x00eaff, 0.8);
            g.strokeRoundedRect(12, 18, 116, 160, 24);
            g.generateTexture('world-exit', 140, 200);
            g.destroy();
        }

        if (!this.textures.exists('world-item')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffd700, 1);
            g.fillRoundedRect(0, 0, 64, 64, 14);
            g.lineStyle(4, 0xffffff, 0.9);
            g.strokeRoundedRect(10, 10, 44, 44, 10);
            g.generateTexture('world-item', 64, 64);
            g.destroy();
        }

        if (!this.textures.exists('world-door')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x4b3a2f, 1);
            g.fillRoundedRect(0, 0, 120, 220, 18);
            g.fillStyle(0x000000, 0.25);
            g.fillRoundedRect(18, 24, 84, 160, 12);
            g.fillStyle(0xffd700, 0.9);
            g.fillCircle(96, 110, 8);
            g.generateTexture('world-door', 120, 220);
            g.destroy();
        }

        if (!this.textures.exists('world-terminal')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x2b2b2b, 1);
            g.fillRoundedRect(0, 0, 140, 160, 18);
            g.fillStyle(0x00eaff, 0.25);
            g.fillRoundedRect(14, 18, 112, 84, 14);
            g.fillStyle(0xffffff, 0.08);
            g.fillRoundedRect(14, 112, 112, 34, 12);
            g.generateTexture('world-terminal', 140, 160);
            g.destroy();
        }

        if (!this.textures.exists('world-sign')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x1a1a1a, 1);
            g.fillRoundedRect(0, 0, 180, 120, 16);
            g.lineStyle(6, 0xffffff, 0.25);
            g.strokeRoundedRect(10, 10, 160, 100, 12);
            g.generateTexture('world-sign', 180, 120);
            g.destroy();
        }

        if (!this.textures.exists('world-solid')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, 2, 2);
            g.generateTexture('world-solid', 2, 2);
            g.destroy();
        }

        if (!this.textures.exists('world-prop:see-through')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffffff, 0.2);
            g.fillRoundedRect(0, 0, 120, 120, 14);
            g.generateTexture('world-prop:see-through', 120, 120);
            g.destroy();
        }
    }

    private getPropTexture(type: PropDefinition['type']): string {
        const key = `world-prop:${type}`;
        if (this.textures.exists(key)) return key;
        const g = this.add.graphics({ x: 0, y: 0 });
        if (type === 'crate') {
            g.fillStyle(0x8b5a2b, 1);
            g.fillRoundedRect(0, 0, 110, 90, 12);
            g.lineStyle(6, 0x2b1a0a, 0.6);
            g.strokeRoundedRect(10, 10, 90, 70, 10);
        } else if (type === 'lamp') {
            g.fillStyle(0x2d2d2d, 1);
            g.fillRect(54, 0, 12, 200);
            g.fillStyle(0xffd700, 0.85);
            g.fillCircle(60, 30, 22);
        } else if (type === 'bench') {
            g.fillStyle(0x5c4033, 1);
            g.fillRoundedRect(0, 0, 220, 60, 14);
            g.fillRect(20, 60, 14, 50);
            g.fillRect(186, 60, 14, 50);
        } else if (type === 'fence') {
            g.fillStyle(0x444444, 1);
            g.fillRect(0, 0, 240, 80);
            g.fillStyle(0xffffff, 0.1);
            for (let x = 12; x < 240; x += 30) {
                g.fillRect(x, 0, 8, 80);
            }
        } else if (type === 'sign') {
            g.fillStyle(0x1a1a1a, 1);
            g.fillRoundedRect(0, 0, 200, 120, 16);
            g.lineStyle(6, 0xffffff, 0.25);
            g.strokeRoundedRect(10, 10, 180, 100, 12);
        } else {
            g.fillStyle(0xffffff, 0.2);
            g.fillRoundedRect(0, 0, 120, 120, 14);
        }
        g.generateTexture(key, 240, 220);
        g.destroy();
        return key;
    }

    private getCharacterTextureKey(kind: string, characterId: string): string {
        return `world-${kind}-${characterId}`;
    }

    private getCharacterTexturePath(characterId: string): string {
        return `assets/images/characters/${characterId}/all/action_pose_v1.png`;
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Sprite, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }
}
