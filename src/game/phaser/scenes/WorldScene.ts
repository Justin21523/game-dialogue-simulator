import Phaser from 'phaser';

import { audioManager } from '../../../shared/audio/audioManager';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { getLocation, getNpc } from '../../../shared/data/gameData';
import { eventBus } from '../../../shared/eventBus';
import { EVENTS } from '../../../shared/eventNames';
import { ObjectiveType, type Objective } from '../../../shared/quests/objective';
import { getObjectiveTargetHint } from '../../../shared/quests/objectiveTargets';
import { SKILL_EXPLORATION_FLIGHT } from '../../../shared/skills/skillIds';
import { companionManager } from '../../../shared/systems/companionManager';
import { worldStateManager } from '../../../shared/systems/worldStateManager';
import { missionManager } from '../../../shared/quests/missionManager';
import type { CompanionAbility } from '../../../shared/types/Companion';
import type { ColliderDefinition, DoorDefinition, InteractableDefinition, LocationDefinition, PropDefinition, SecretDefinition } from '../../../shared/types/World';
import { NpcBarkSystem } from '../systems/NpcBarkSystem';
import { NpcBehaviorSystem, type SpawnedNpc } from '../systems/NpcBehaviorSystem';
import { ParallaxSystem } from '../systems/ParallaxSystem';
import { getThemeParallaxLayers, resolveThemedPropAsset } from '../themes/themeAssets';
import type { ParallaxAssetLayer, ThemedPropAsset } from '../themes/themeAssets';

export type WorldSceneInitData = {
    charId?: string;
    locationId?: string;
    spawnPoint?: string;
    x?: number;
    y?: number;
    movementMode?: 'walk' | 'hover';
};

type SpawnedInteractable = {
    id: string;
    kind: 'interactable' | 'door' | 'prop';
    interactableType?: InteractableDefinition['type'] | 'door' | 'prop';
    requiredAbility?: CompanionAbility;
    requiredWorldFlag?: string;
    requiredItemId?: string;
    requiredItemQty?: number;
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
const TILE_SIZE = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

export class WorldScene extends Phaser.Scene {
    private charId = 'jett';
    private locationId = 'base_airport';
    private spawnPoint = 'default';
    private spawnX: number | null = null;
    private spawnY: number | null = null;
    private movementMode: 'walk' | 'hover' = 'walk';

    private location!: LocationDefinition;
    private groundY = DEFAULT_GROUND_Y;

    private parallax = new ParallaxSystem(this);
    private npcBehavior = new NpcBehaviorSystem();
    private npcBarks = new NpcBarkSystem();

    private themedParallaxLayers: ParallaxAssetLayer[] | null = null;
    private themedPropAssets = new Map<string, ThemedPropAsset>();

    private player!: Phaser.Physics.Arcade.Sprite;
    private npcs: SpawnedNpc[] = [];
    private interactables: SpawnedInteractable[] = [];
    private exits: SpawnedExit[] = [];
    private colliders!: Phaser.Physics.Arcade.StaticGroup;
    private tilemap?: Phaser.Tilemaps.Tilemap;
    private tileLayer: Phaser.Tilemaps.TilemapLayer | null = null;

    private keys?: {
        a: Phaser.Input.Keyboard.Key;
        d: Phaser.Input.Keyboard.Key;
        w: Phaser.Input.Keyboard.Key;
        s: Phaser.Input.Keyboard.Key;
        e: Phaser.Input.Keyboard.Key;
        c: Phaser.Input.Keyboard.Key;
        f: Phaser.Input.Keyboard.Key;
    };
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

    private promptText?: Phaser.GameObjects.Text;
    private highlight?: Phaser.GameObjects.Graphics;
    private inputLocked = false;
    private lastPersistAtMs = 0;

    private flightTransition: 'none' | 'takeoff' | 'landing' = 'none';
    private flightEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

    private objectiveMarker?: Phaser.GameObjects.Sprite;
    private ambientEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

    private pulseSprite: Phaser.GameObjects.Sprite | null = null;
    private pulseBaseScale: { x: number; y: number } | null = null;
    private pulseTween?: Phaser.Tweens.Tween;

    constructor() {
        super({ key: 'WorldScene' });
    }

    init(data: WorldSceneInitData): void {
        this.charId = typeof data.charId === 'string' && data.charId ? data.charId : 'jett';
        this.locationId = typeof data.locationId === 'string' && data.locationId ? data.locationId : 'base_airport';
        this.spawnPoint = typeof data.spawnPoint === 'string' && data.spawnPoint ? data.spawnPoint : 'default';
        this.spawnX = typeof data.x === 'number' && Number.isFinite(data.x) ? data.x : null;
        this.spawnY = typeof data.y === 'number' && Number.isFinite(data.y) ? data.y : null;
        this.movementMode = data.movementMode === 'hover' ? 'hover' : 'walk';

        const loc = getLocation(this.locationId);
        if (!loc) {
            this.locationId = 'base_airport';
        }
        const resolved = getLocation(this.locationId);
        if (!resolved) throw new Error(`[WorldScene] Unknown location: ${this.locationId}`);
        this.location = resolved;
        this.groundY = DEFAULT_GROUND_Y;

        this.resolveThemeAssets();
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

        const parallax = this.themedParallaxLayers ?? [];
        for (const layer of parallax) {
            if (this.textures.exists(layer.textureKey)) continue;
            this.load.image(layer.textureKey, layer.path);
        }

        for (const asset of this.themedPropAssets.values()) {
            if (this.textures.exists(asset.textureKey)) continue;
            this.load.image(asset.textureKey, asset.path);
        }
    }

    create(): void {
        companionManager.initialize();
        worldStateManager.initialize();
        void missionManager.initialize({ mainCharacter: this.charId });

        this.physics.world.setBounds(0, 0, this.location.worldWidth, GAME_HEIGHT);
        this.cameras.main.setBounds(0, 0, this.location.worldWidth, GAME_HEIGHT);

        this.parallax.create(this.locationId, this.location.parallax, this.location.worldWidth, this.themedParallaxLayers);

        this.colliders = this.physics.add.staticGroup();

        this.createGround();
        this.createPlayer();
        this.createFlightVfx();
        this.createAmbientVfx();
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
            this.flightEmitter?.destroy();
            this.ambientEmitter?.destroy();
            this.stopPulseSprite();
        });
    }

    update(timeMs: number, deltaMs: number): void {
        const dt = Math.min(deltaMs / 1000, 0.1);

        this.parallax.update(this.cameras.main);
        this.npcBehavior.update(this.npcs, timeMs, dt);
        this.npcBarks.update(this, this.npcs, this.player, timeMs, this.inputLocked);
        this.updatePrompt();
        this.updateHighlight(timeMs);
        this.checkSecrets(this.location.secrets ?? []);
        this.updateObjectiveMarker(timeMs);

        if (this.keys) {
            this.updatePlayerMovement();
            if (Phaser.Input.Keyboard.JustDown(this.keys.e)) {
                this.handleInteract();
            }
            if (Phaser.Input.Keyboard.JustDown(this.keys.c)) {
                eventBus.emit(EVENTS.UI_TOGGLE_COMPANION_PANEL, { actorId: this.charId });
            }
            if (Phaser.Input.Keyboard.JustDown(this.keys.f)) {
                this.toggleFlightMode();
            }
        }

        if (timeMs - this.lastPersistAtMs > 1000) {
            this.persistPlayerState(timeMs);
        }

        void dt;
    }

    private createGround(): void {
        const theme = this.location.theme ?? 'airport_base';
        if (theme === 'town_outdoor' || theme === 'park_outdoor' || theme.startsWith('interior_')) {
            this.createTileBackdrop(theme);
            return;
        }

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

    private createTileBackdrop(theme: string): void {
        const tilesetKey = this.ensureTilesetTexture();
        const cols = Math.max(1, Math.ceil(this.location.worldWidth / TILE_SIZE));
        const rows = Math.max(1, Math.ceil(GAME_HEIGHT / TILE_SIZE));

        const EMPTY = -1;
        const TILE_GRASS = 0;
        const TILE_ROAD = 1;
        const TILE_SIDEWALK = 2;
        const TILE_FLOOR = 3;
        const TILE_WALL = 4;

        const data: number[][] = [];
        for (let y = 0; y < rows; y += 1) {
            const row: number[] = [];
            for (let x = 0; x < cols; x += 1) {
                let t = EMPTY;
                if (theme.startsWith('interior_')) {
                    const isBottomBand = y >= rows - 5;
                    const isWall = x === 0 || x === cols - 1 || y === rows - 5;
                    if (isBottomBand) {
                        t = isWall ? TILE_WALL : TILE_FLOOR;
                    }
                } else {
                    const isGround = y >= rows - 4;
                    const isSidewalk = y === rows - 4;
                    if (isGround) {
                        t = TILE_GRASS;
                    }
                    if (isSidewalk) {
                        const roadStart = Math.floor(cols * 0.2);
                        const roadEnd = Math.floor(cols * 0.8);
                        t = x >= roadStart && x <= roadEnd ? TILE_ROAD : TILE_SIDEWALK;
                    }
                }
                row.push(t);
            }
            data.push(row);
        }

        this.tilemap = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
        const tileset = this.tilemap.addTilesetImage('world-tileset', tilesetKey, TILE_SIZE, TILE_SIZE, 0, 0);
        if (!tileset) return;

        this.tileLayer = this.tilemap.createLayer(0, tileset, 0, 0);
        this.tileLayer?.setDepth(8);
    }

    private ensureTilesetTexture(): string {
        const key = 'world-tileset:v1';
        if (this.textures.exists(key)) return key;

        const columns = 4;
        const rows = 2;
        const width = TILE_SIZE * columns;
        const height = TILE_SIZE * rows;
        const g = this.add.graphics({ x: 0, y: 0 });

        // Tile 0: grass
        g.fillStyle(0x1f8b4c, 1);
        g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0xffffff, 0.06);
        for (let i = 0; i < 40; i += 1) {
            g.fillCircle(Phaser.Math.Between(0, TILE_SIZE), Phaser.Math.Between(0, TILE_SIZE), Phaser.Math.Between(1, 3));
        }

        // Tile 1: road
        g.fillStyle(0x2f2f2f, 1);
        g.fillRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0xffffff, 0.15);
        for (let i = 0; i < 3; i += 1) {
            g.fillRect(TILE_SIZE + 10 + i * 18, 30, 10, 4);
            g.fillRect(TILE_SIZE + 10 + i * 18, 46, 10, 4);
        }

        // Tile 2: sidewalk
        g.fillStyle(0x5c5c5c, 1);
        g.fillRect(TILE_SIZE * 2, 0, TILE_SIZE, TILE_SIZE);
        g.lineStyle(2, 0xffffff, 0.08);
        for (let y = 8; y < TILE_SIZE; y += 16) {
            g.beginPath();
            g.moveTo(TILE_SIZE * 2 + 6, y);
            g.lineTo(TILE_SIZE * 3 - 6, y);
            g.strokePath();
        }

        // Tile 3: interior floor
        g.fillStyle(0x2b2b2b, 1);
        g.fillRect(TILE_SIZE * 3, 0, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0xffffff, 0.06);
        g.fillRect(TILE_SIZE * 3 + 8, 12, TILE_SIZE - 16, TILE_SIZE - 24);

        // Tile 4: wall
        g.fillStyle(0x1a1f2a, 1);
        g.fillRect(0, TILE_SIZE, TILE_SIZE, TILE_SIZE);
        g.lineStyle(4, 0xffffff, 0.06);
        g.strokeRect(6, TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);

        // Tile 5: window
        g.fillStyle(0x1a1f2a, 1);
        g.fillRect(TILE_SIZE, TILE_SIZE, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x00eaff, 0.2);
        g.fillRoundedRect(TILE_SIZE + 10, TILE_SIZE + 12, TILE_SIZE - 20, TILE_SIZE - 28, 10);

        // Tile 6: roof
        g.fillStyle(0x4b3a2f, 1);
        g.fillRect(TILE_SIZE * 2, TILE_SIZE, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x000000, 0.1);
        for (let x = 0; x < TILE_SIZE; x += 10) {
            g.fillRect(TILE_SIZE * 2 + x, TILE_SIZE, 5, TILE_SIZE);
        }

        // Tile 7: decal
        g.fillStyle(0x000000, 0);
        g.fillRect(TILE_SIZE * 3, TILE_SIZE, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0xffd700, 0.25);
        g.fillCircle(TILE_SIZE * 3 + TILE_SIZE / 2, TILE_SIZE + TILE_SIZE / 2, 18);

        g.generateTexture(key, width, height);
        g.destroy();
        return key;
    }

    private createPlayer(): void {
        const spawnFromPoint = this.location.spawnPoints[this.spawnPoint] ?? this.location.spawnPoints.default ?? { x: 320, y: this.groundY };
        const spawn = this.spawnX !== null && this.spawnY !== null ? { x: this.spawnX, y: this.spawnY } : spawnFromPoint;
        const playerKey = this.getCharacterTextureKey('player', this.charId);
        const texture = this.textures.exists(playerKey) ? playerKey : 'world-character-fallback';

        this.player = this.physics.add.sprite(spawn.x, spawn.y, texture);
        this.player.setOrigin(0.5, 1);
        this.player.setCollideWorldBounds(true);
        this.setSpriteDisplayHeight(this.player, 520);
        this.player.setDepth(100);

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
            sprite.setDepth(90);

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
                baseY: sprite.y,
                dir: 1,
                pathIndex: 0,
                waitUntilMs: 0
            });
        }
    }

    private createProps(props: PropDefinition[]): void {
        for (const def of props) {
            const themed = this.themedPropAssets.get(def.propId) ?? null;
            const canUseThemed = Boolean(themed && this.textures.exists(themed.textureKey));
            const texture = canUseThemed ? themed!.textureKey : this.getPropTexture(def.type);
            const sprite = this.add.sprite(def.x, def.y, texture).setOrigin(0.5, 1).setDepth(20);

            if (typeof def.width === 'number' && Number.isFinite(def.width) && typeof def.height === 'number' && Number.isFinite(def.height)) {
                sprite.setDisplaySize(def.width, def.height);
            } else if (canUseThemed) {
                const fallbackHeight = this.getDefaultPropHeight(def.type, def.propId);
                const height = typeof themed?.defaultHeight === 'number' ? themed.defaultHeight : fallbackHeight;
                this.setSpriteDisplayHeight(sprite, height);
            }

            const labelText = typeof def.label === 'string' ? def.label.trim() : '';
            const messageText = typeof def.message === 'string' ? def.message.trim() : '';
            const needsLabel = Boolean(labelText || messageText);
            const label = needsLabel
                ? this.add
                      .text(sprite.x, sprite.y - sprite.displayHeight - 10, labelText, {
                          fontFamily: 'Segoe UI, system-ui, sans-serif',
                          fontSize: '16px',
                          fontStyle: '800',
                          color: '#ffffff',
                          stroke: '#000000',
                          strokeThickness: 6
                      })
                      .setOrigin(0.5, 1)
                      .setDepth(2000)
                      .setVisible(Boolean(labelText))
                : null;

            if (def.collides) {
                const w = def.width ?? sprite.displayWidth;
                const h = def.height ?? sprite.displayHeight;
                const collider = this.colliders.create(def.x, def.y - h / 2, 'world-solid');
                collider.setVisible(false);
                collider.setDisplaySize(w, h);
                (collider.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
            }

            if (messageText) {
                const safeLabel =
                    label ??
                    this.add
                        .text(sprite.x, sprite.y - sprite.displayHeight - 10, '', {
                            fontFamily: 'Segoe UI, system-ui, sans-serif',
                            fontSize: '16px',
                            fontStyle: '800',
                            color: '#ffffff',
                            stroke: '#000000',
                            strokeThickness: 6
                        })
                        .setOrigin(0.5, 1)
                        .setDepth(2000)
                        .setVisible(false);

                this.interactables.push({
                    id: def.propId,
                    kind: 'prop',
                    interactableType: 'prop',
                    sprite,
                    label: safeLabel,
                    requiredAbility: undefined,
                    targetLocationId: undefined,
                    targetSpawnPoint: undefined,
                    message: messageText,
                    state: 'idle'
                });
            }
        }
    }

    private resolveThemeAssets(): void {
        const theme = this.location.theme;
        this.themedParallaxLayers = getThemeParallaxLayers(theme);
        this.themedPropAssets.clear();

        for (const prop of this.location.props ?? []) {
            const asset = resolveThemedPropAsset(theme, prop.type, prop.propId);
            if (asset) {
                this.themedPropAssets.set(prop.propId, asset);
            }
        }
    }

    private getDefaultPropHeight(type: PropDefinition['type'], propId: string): number {
        const id = propId.toLowerCase();
        if (type === 'decor') {
            if (id.includes('traffic')) return 330;
            if (id.includes('stop')) return 250;
            if (id.includes('mail')) return 200;
            if (id.includes('trash') || id.includes('bin')) return 140;
            if (id.includes('bus')) return 240;
            if (id.includes('car') || id.includes('taxi')) return 190;
            if (id.includes('tree')) return 320;
        }

        switch (type) {
            case 'lamp':
                return 280;
            case 'bench':
                return 160;
            case 'fence':
                return 120;
            case 'sign':
                return 140;
            case 'crate':
                return 120;
            case 'building':
                return 560;
            default:
                return 180;
        }
    }

    private createDoors(doors: DoorDefinition[]): void {
        for (const door of doors) {
            const missingFlag = Boolean(door.requiredWorldFlag && !worldStateManager.hasWorldFlag(door.requiredWorldFlag));
            const missingItem = Boolean(
                door.requiredItemId && !worldStateManager.hasItem(door.requiredItemId, door.requiredItemQty ?? 1)
            );
            const isLocked = missingFlag || missingItem;
            const sprite = this.add.sprite(door.x, door.y, 'world-door').setOrigin(0.5, 1).setDepth(25);
            sprite.setDisplaySize(door.width, door.height);
            if (isLocked) {
                sprite.setTint(0x999999);
                sprite.setAlpha(0.7);
            }

            const lockSuffix = missingFlag ? ' (Locked)' : missingItem ? ' (Key Required)' : '';
            const label = this.add
                .text(door.x, door.y - door.height - 10, `${door.label}${lockSuffix}`, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '16px',
                    fontStyle: '900',
                    color: isLocked ? '#ff9800' : '#00eaff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(2000);

            this.interactables.push({
                id: door.doorId,
                kind: 'door',
                interactableType: 'door',
                requiredWorldFlag: door.requiredWorldFlag,
                requiredItemId: door.requiredItemId,
                requiredItemQty: door.requiredItemQty,
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

        this.highlight = this.add.graphics().setDepth(95).setBlendMode(Phaser.BlendModes.ADD);
    }

    private setupInput(): void {
        if (!this.input.keyboard) return;
        this.keys = {
            a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            e: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
            c: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C),
            f: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F)
        };
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    private updatePlayerMovement(): void {
        if (this.flightTransition !== 'none') {
            const body = this.player.body as Phaser.Physics.Arcade.Body;
            body.setVelocity(0, 0);
            return;
        }
        if (this.inputLocked) {
            const body = this.player.body as Phaser.Physics.Arcade.Body;
            body.setVelocity(0, 0);
            return;
        }
        if (!this.keys) return;

        const cursors = this.cursors;
        const rightDown = this.keys.d.isDown || (cursors?.right?.isDown ?? false);
        const leftDown = this.keys.a.isDown || (cursors?.left?.isDown ?? false);
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (this.movementMode === 'hover') {
            const upDown = this.keys.w.isDown || (cursors?.up?.isDown ?? false);
            const downDown = this.keys.s.isDown || (cursors?.down?.isDown ?? false);

            const speedX = PLAYER_SPEED * 1.15;
            const speedY = PLAYER_SPEED * 0.85;
            const vx = rightDown ? speedX : leftDown ? -speedX : 0;
            const vy = downDown ? speedY : upDown ? -speedY : 0;

            body.setVelocity(vx, vy);
            if (vx !== 0) {
                this.player.setFlipX(vx < 0);
            }

            const minY = this.groundY - 520;
            const maxY = this.groundY - 120;
            this.player.y = Phaser.Math.Clamp(this.player.y, minY, maxY);

            if (this.flightEmitter) {
                const intensity = Phaser.Math.Clamp(Math.abs(vx) / speedX, 0, 1);
                this.flightEmitter.frequency = 28 - intensity * 12;
            }
            return;
        }

        const velocity = rightDown ? PLAYER_SPEED : leftDown ? -PLAYER_SPEED : 0;
        body.setVelocity(velocity, 0);
        if (velocity !== 0) {
            this.player.setFlipX(velocity < 0);
        }

        this.player.y = this.groundY;
    }

    private createFlightVfx(): void {
        if (this.flightEmitter) return;
        if (!this.textures.exists('world-vfx-dot')) return;

        const emitter = this.add
            .particles(0, 0, 'world-vfx-dot', {
                speed: { min: 220, max: 420 },
                angle: { min: 140, max: 220 },
                lifespan: { min: 260, max: 520 },
                quantity: 1,
                frequency: 24,
                alpha: { start: 0.22, end: 0 },
                scale: { start: 0.4, end: 0 }
            })
            .setDepth(60)
            .setBlendMode(Phaser.BlendModes.ADD);

        emitter.startFollow(this.player, 0, -220);
        emitter.stop();
        this.flightEmitter = emitter;
    }

    private createAmbientVfx(): void {
        if (this.ambientEmitter) return;
        if (!this.textures.exists('world-vfx-dot')) return;
        const theme = this.location.theme ?? '';
        const isOutdoor = theme === 'town_outdoor' || theme === 'park_outdoor';
        if (!isOutdoor) return;

        const emitter = this.add
            .particles(0, 0, 'world-vfx-dot', {
                x: { min: 0, max: GAME_WIDTH },
                y: { min: 0, max: GAME_HEIGHT - 260 },
                speedX: { min: -12, max: 12 },
                speedY: { min: -26, max: -64 },
                lifespan: { min: 2400, max: 4800 },
                quantity: 1,
                frequency: 180,
                alpha: { start: 0.16, end: 0 },
                scale: { start: 0.25, end: 0 }
            })
            .setDepth(6)
            .setScrollFactor(0)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.ambientEmitter = emitter;
    }

    private toggleFlightMode(): void {
        if (this.inputLocked) return;
        if (this.flightTransition !== 'none') return;
        if (!worldStateManager.isSkillUnlocked(SKILL_EXPLORATION_FLIGHT)) {
            this.flashPrompt('Flight mode is locked. Open Skills (K) to unlock it.');
            return;
        }

        const hoverY = this.groundY - 240;
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);

        if (this.movementMode === 'walk') {
            this.movementMode = 'hover';
            this.flightTransition = 'takeoff';
            audioManager.playSound('launch');
            this.flightEmitter?.start();

            this.tweens.add({
                targets: this.player,
                y: hoverY,
                duration: 520,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    this.flightTransition = 'none';
                    audioManager.playSound('hover');
                }
            });
            return;
        }

        this.flightTransition = 'landing';
        audioManager.playSound('arrival');
        this.flightEmitter?.stop();

        this.tweens.add({
            targets: this.player,
            y: this.groundY,
            duration: 420,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                this.movementMode = 'walk';
                this.flightTransition = 'none';
                this.player.y = this.groundY;
            }
        });
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

    private updateHighlight(timeMs: number): void {
        if (!this.highlight) return;
        this.highlight.clear();
        if (this.inputLocked) {
            this.stopPulseSprite();
            return;
        }

        const target = this.findNearestTarget();
        if (!target) {
            this.stopPulseSprite();
            return;
        }

        let x = 0;
        let y = 0;
        let radius = 70;

        if (target.kind === 'npc') {
            const npc = this.npcs.find((n) => n.npcId === target.npcId);
            if (!npc) {
                this.stopPulseSprite();
                return;
            }
            x = npc.sprite.x;
            y = npc.sprite.y - npc.sprite.displayHeight * 0.5;
            radius = Math.min(95, Math.max(60, (npc.def.interactionRadius ?? INTERACT_RANGE) * 0.5));
            this.setPulseSprite(npc.sprite);
        } else if (target.kind === 'exit') {
            const ex = this.exits.find((e) => e.targetLocationId === target.targetLocationId && e.targetSpawnPoint === target.targetSpawnPoint);
            if (!ex) {
                this.stopPulseSprite();
                return;
            }
            x = ex.zone.x;
            y = ex.zone.y - ex.zone.height * 0.5;
            radius = 90;
            this.stopPulseSprite();
        } else {
            const obj = this.interactables.find((o) => o.id === target.id);
            if (!obj) {
                this.stopPulseSprite();
                return;
            }
            x = obj.sprite.x;
            y = obj.sprite.y - obj.sprite.displayHeight * 0.5;
            radius = obj.kind === 'door' ? 92 : 72;
            this.setPulseSprite(obj.sprite);
        }

        const pulse = 0.2 + Math.sin(timeMs / 280) * 0.08;
        this.highlight.lineStyle(8, 0x00eaff, 0.18 + pulse);
        this.highlight.strokeCircle(x, y, radius);
        this.highlight.lineStyle(3, 0xffffff, 0.08 + pulse * 0.4);
        this.highlight.strokeCircle(x, y, radius - 10);
    }

    private setPulseSprite(sprite: Phaser.GameObjects.Sprite): void {
        if (this.pulseSprite === sprite) return;
        this.stopPulseSprite();
        this.pulseSprite = sprite;
        this.pulseBaseScale = { x: sprite.scaleX, y: sprite.scaleY };
        this.pulseTween = this.tweens.add({
            targets: sprite,
            scaleX: sprite.scaleX * 1.06,
            scaleY: sprite.scaleY * 1.06,
            duration: 420,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private stopPulseSprite(): void {
        if (this.pulseTween) {
            this.pulseTween.stop();
            this.pulseTween = undefined;
        }
        if (this.pulseSprite && this.pulseBaseScale) {
            this.pulseSprite.setScale(this.pulseBaseScale.x, this.pulseBaseScale.y);
        }
        this.pulseSprite = null;
        this.pulseBaseScale = null;
    }

    private getNearestPrompt(): string | null {
        if (this.inputLocked) return 'Dialogue open';
        const target = this.findNearestTarget();
        if (!target) return null;

        if (target.kind === 'npc') return `Press E to talk to ${target.name}`;
        if (target.kind === 'exit') return 'Press E to travel';
        if (target.kind === 'door') {
            const obj = this.interactables.find((o) => o.id === target.id);
            if (obj?.requiredWorldFlag && !worldStateManager.hasWorldFlag(obj.requiredWorldFlag)) return 'Locked door';
            if (obj?.requiredItemId && !worldStateManager.hasItem(obj.requiredItemId, obj.requiredItemQty ?? 1)) return 'Key required';
            return 'Press E to enter';
        }
        if (target.kind === 'interactable') return 'Press E to interact';
        if (target.kind === 'prop') return target.label ? `Press E to read` : 'Press E';
        return null;
    }

    private handleInteract(): void {
        if (this.inputLocked) return;
        const target = this.findNearestTarget();
        if (!target) return;

        if (target.kind === 'npc') {
            audioManager.playSound('button');
            eventBus.emit(EVENTS.DIALOGUE_OPEN, { npcId: target.npcId, actorId: this.charId });
            return;
        }

        if (target.kind === 'exit') {
            if (!worldStateManager.isLocationUnlocked(target.targetLocationId)) {
                audioManager.playSound('error');
                this.flashPrompt('This destination is locked.');
                return;
            }
            audioManager.playSound('button');
            this.transitionToLocation(target.targetLocationId, target.targetSpawnPoint);
            return;
        }

        const obj = this.interactables.find((o) => o.id === target.id) ?? null;
        if (!obj || obj.state === 'completed') return;

        if (target.kind === 'door') {
            if (obj.requiredWorldFlag && !worldStateManager.hasWorldFlag(obj.requiredWorldFlag)) {
                audioManager.playSound('error');
                this.flashPrompt('Locked. Find a clue to open this door.');
                return;
            }
            if (obj.requiredItemId && !worldStateManager.hasItem(obj.requiredItemId, obj.requiredItemQty ?? 1)) {
                audioManager.playSound('error');
                this.flashPrompt('Locked. You need a key item to open this door.');
                return;
            }
            if (obj.targetLocationId) {
                audioManager.playSound('button');
                this.transitionToLocation(obj.targetLocationId, obj.targetSpawnPoint ?? 'default', { via: 'door', doorId: obj.id });
            }
            return;
        }

        if (target.kind === 'prop' && obj.message) {
            audioManager.playSound('button');
            this.flashPrompt(obj.message);
            return;
        }

        if (obj.requiredAbility && !companionManager.isAbilityAvailable(obj.requiredAbility)) {
            audioManager.playSound('error');
            this.flashPrompt(`Requires ${obj.requiredAbility}. Press C to call a companion.`);
            return;
        }

        if (obj.kind === 'interactable' && obj.targetLocationId && obj.targetSpawnPoint) {
            audioManager.playSound('button');
            this.transitionToLocation(obj.targetLocationId, obj.targetSpawnPoint, { via: 'interactable', interactableId: obj.id });
            return;
        }

        if (obj.kind === 'interactable') {
            audioManager.playSound('button');
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

    private transitionToLocation(locationId: string, spawnPoint: string): void;
    private transitionToLocation(
        locationId: string,
        spawnPoint: string,
        meta: { via: 'door' | 'exit' | 'interactable' | 'unknown'; doorId?: string; interactableId?: string }
    ): void;
    private transitionToLocation(
        locationId: string,
        spawnPoint: string,
        meta?: { via: 'door' | 'exit' | 'interactable' | 'unknown'; doorId?: string; interactableId?: string }
    ): void {
        const transitionMeta = meta ?? { via: 'unknown' };
        const fromLocation = this.locationId;
        const fromTheme = this.location.theme ?? null;
        const toTheme = getLocation(locationId)?.theme ?? null;

        const fromInterior = Boolean(fromTheme && fromTheme.startsWith('interior_'));
        const toInterior = Boolean(toTheme && toTheme.startsWith('interior_'));

        if (transitionMeta.via === 'door' && !fromInterior && toInterior) {
            eventBus.emit(EVENTS.BUILDING_ENTERED, {
                buildingId: locationId,
                fromLocationId: fromLocation,
                actorId: this.charId,
                doorId: transitionMeta.doorId
            });
        }
        if (transitionMeta.via === 'door' && fromInterior && !toInterior) {
            eventBus.emit(EVENTS.BUILDING_EXITED, {
                buildingId: fromLocation,
                toLocationId: locationId,
                actorId: this.charId,
                doorId: transitionMeta.doorId
            });
        }

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
            const money = typeof secret.rewardCurrency === 'number' && Number.isFinite(secret.rewardCurrency) ? Math.max(0, secret.rewardCurrency) : 0;
            const exp = typeof secret.rewardExp === 'number' && Number.isFinite(secret.rewardExp) ? Math.max(0, secret.rewardExp) : 0;

            if (money > 0 || exp > 0 || secret.rewardItemId) {
                eventBus.emit(EVENTS.REWARD_GRANTED, {
                    actorId: this.charId,
                    money,
                    exp,
                    itemId: secret.rewardItemId ?? null,
                    itemQty: secret.rewardItemId ? 1 : 0,
                    source: 'secret',
                    sourceId: secret.secretId,
                    message: rewardText
                });
            }
            this.flashPrompt(rewardText);
        }
    }

    private updateObjectiveMarker(timeMs: number): void {
        const quest = missionManager.getActiveMainQuest();
        const objective = quest?.objectives?.find((o) => o.status === 'active') ?? null;
        if (!objective) {
            this.objectiveMarker?.setVisible(false);
            return;
        }

        const target = this.resolveObjectiveTarget(objective);
        if (!target) {
            this.objectiveMarker?.setVisible(false);
            return;
        }

        if (!this.objectiveMarker) {
            this.objectiveMarker = this.add
                .sprite(target.x, target.y, 'world-marker')
                .setOrigin(0.5, 1)
                .setDepth(2600)
                .setBlendMode(Phaser.BlendModes.ADD);
        }

        const bob = Math.sin(timeMs / 180) * 10;
        const pulse = 1 + Math.sin(timeMs / 260) * 0.06;
        const y = target.y - target.height - 24 + bob;

        this.objectiveMarker.setPosition(target.x, y);
        this.objectiveMarker.setScale(pulse);
        this.objectiveMarker.setVisible(true);
    }

    private resolveObjectiveTarget(objective: Objective): { x: number; y: number; height: number } | null {
        const hint = getObjectiveTargetHint(objective);

        if (objective.type === ObjectiveType.GO_TO_LOCATION) {
            const destination = hint.locationId ?? null;
            if (!destination) return null;
            if (destination === this.locationId) return null;
            return this.findTravelMarker(destination);
        }

        if (objective.type === ObjectiveType.TALK || objective.type === ObjectiveType.DELIVER) {
            const npcId = hint.npcId;
            if (!npcId) return null;
            const npc = this.npcs.find((n) => n.npcId === npcId);
            if (npc) {
                return { x: npc.sprite.x, y: npc.sprite.y, height: npc.sprite.displayHeight };
            }
            if (hint.locationId && hint.locationId !== this.locationId) {
                return this.findTravelMarker(hint.locationId);
            }
            return null;
        }

        if (objective.type === ObjectiveType.COLLECT) {
            const itemId = hint.itemId;
            if (!itemId) return null;
            const obj = this.interactables.find((o) => o.id === itemId);
            if (obj) {
                return { x: obj.sprite.x, y: obj.sprite.y, height: obj.sprite.displayHeight };
            }
        }

        if (hint.locationId && hint.locationId !== this.locationId) {
            return this.findTravelMarker(hint.locationId);
        }

        const targetId = hint.targetId;
        if (targetId) {
            const obj = this.interactables.find((o) => o.id === targetId);
            if (obj) {
                return { x: obj.sprite.x, y: obj.sprite.y, height: obj.sprite.displayHeight };
            }
        }

        return null;
    }

    private findTravelMarker(locationId: string): { x: number; y: number; height: number } | null {
        const exit = this.exits.find((e) => e.targetLocationId === locationId);
        if (exit) {
            return { x: exit.zone.x, y: exit.zone.y, height: exit.zone.height };
        }

        const door = this.interactables.find((o) => o.kind === 'door' && o.targetLocationId === locationId);
        if (door) {
            return { x: door.sprite.x, y: door.sprite.y, height: door.sprite.displayHeight };
        }

        return null;
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
            movementMode: this.movementMode
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

        if (!this.textures.exists('world-marker')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffd700, 0.95);
            g.beginPath();
            g.moveTo(32, 0);
            g.lineTo(64, 48);
            g.lineTo(44, 48);
            g.lineTo(44, 90);
            g.lineTo(20, 90);
            g.lineTo(20, 48);
            g.lineTo(0, 48);
            g.closePath();
            g.fillPath();
            g.lineStyle(6, 0xffffff, 0.6);
            g.strokePath();
            g.generateTexture('world-marker', 64, 96);
            g.destroy();
        }

        if (!this.textures.exists('world-vfx-dot')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffffff, 1);
            g.fillCircle(8, 8, 8);
            g.generateTexture('world-vfx-dot', 16, 16);
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
        let texW = 240;
        let texH = 220;
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
        } else if (type === 'building') {
            texW = 520;
            texH = 560;
            g.fillStyle(0x1a1f2a, 1);
            g.fillRoundedRect(0, 0, texW, texH, 28);
            g.fillStyle(0x000000, 0.22);
            g.fillRoundedRect(22, 22, texW - 44, texH - 44, 22);
            g.fillStyle(0x00eaff, 0.14);
            const cols = 4;
            const rows = 3;
            const padX = 70;
            const padY = 110;
            const winW = 70;
            const winH = 60;
            for (let r = 0; r < rows; r += 1) {
                for (let c = 0; c < cols; c += 1) {
                    const x = padX + c * (winW + 55);
                    const y = padY + r * (winH + 70);
                    g.fillRoundedRect(x, y, winW, winH, 14);
                }
            }
            g.fillStyle(0xffd700, 0.22);
            g.fillRoundedRect(90, 44, texW - 180, 44, 18);
            g.lineStyle(6, 0xffffff, 0.14);
            g.strokeRoundedRect(90, 44, texW - 180, 44, 18);
            g.fillStyle(0x4b3a2f, 1);
            g.fillRoundedRect(texW / 2 - 60, texH - 170, 120, 150, 18);
        } else {
            g.fillStyle(0xffffff, 0.2);
            g.fillRoundedRect(0, 0, 120, 120, 14);
        }
        g.generateTexture(key, texW, texH);
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
