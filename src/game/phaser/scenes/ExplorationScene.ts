import Phaser from 'phaser';

import { generateNpcs } from '../../../shared/api/npcApi';
import { generateWorld, type WorldSpec } from '../../../shared/api/worldApi';
import { eventBus } from '../../../shared/eventBus';
import { EVENTS } from '../../../shared/eventNames';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { GAME_CONFIG, type CharacterId } from '../../../shared/gameConfig';
import { missionManager } from '../../../shared/quests/missionManager';
import { ObjectiveType } from '../../../shared/quests/objective';
import { Quest, QuestStatus } from '../../../shared/quests/quest';
import { PartnerSystem, getExplorationCharacterTexturePath } from '../systems/PartnerSystem';

type ExplorationInitData = {
    charId?: string;
    destination?: string;
};

const WORLD_WIDTH = 6400;
const GROUND_Y = GAME_HEIGHT - 180;

const HOLD_TO_FLY_MS = 380;

type PlayerMode = 'walking' | 'flying';

export class ExplorationScene extends Phaser.Scene {
    private charId: CharacterId = 'jett';
    private destination = 'paris';

    private partnerSystem!: PartnerSystem;
    private mode: PlayerMode = 'walking';

    private bgFar!: Phaser.GameObjects.TileSprite;
    private bgNear!: Phaser.GameObjects.TileSprite;
    private ground!: Phaser.Physics.Arcade.StaticGroup;

    private npc!: Phaser.Physics.Arcade.Sprite;
    private portal!: Phaser.Physics.Arcade.Sprite;
    private items!: Phaser.Physics.Arcade.Group;
    private decorObjects: Phaser.GameObjects.GameObject[] = [];
    private loadingText?: Phaser.GameObjects.Text;

    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private keyA?: Phaser.Input.Keyboard.Key;
    private keyD?: Phaser.Input.Keyboard.Key;
    private keyW?: Phaser.Input.Keyboard.Key;
    private keyS?: Phaser.Input.Keyboard.Key;
    private keyE?: Phaser.Input.Keyboard.Key;
    private keyQ?: Phaser.Input.Keyboard.Key;
    private keyR?: Phaser.Input.Keyboard.Key;
    private keyTab?: Phaser.Input.Keyboard.Key;
    private keySpace?: Phaser.Input.Keyboard.Key;
    private numberKeys: Phaser.Input.Keyboard.Key[] = [];

    private hudText?: Phaser.GameObjects.Text;
    private promptText?: Phaser.GameObjects.Text;

    private inventory = new Set<string>();
    private exploredAreas = new Set<string>();

    private spaceDownAtMs: number | null = null;
    private cameraFollowCharId: CharacterId | null = null;

    constructor() {
        super({ key: 'ExplorationScene' });
    }

    init(data: ExplorationInitData) {
        const requested = (data.charId ?? 'jett').toLowerCase();
        if (requested in GAME_CONFIG.CHARACTERS) {
            this.charId = requested as CharacterId;
        } else {
            this.charId = 'jett';
        }

        this.destination = data.destination ?? 'paris';
    }

    preload() {
        this.ensureTextures();

        // Preload all character standing poses so partners can be summoned freely.
        for (const id of Object.keys(GAME_CONFIG.CHARACTERS)) {
            const charId = id as CharacterId;
            const key = `explore-char-${charId}`;
            if (!this.textures.exists(key)) {
                this.load.image(key, getExplorationCharacterTexturePath(charId));
            }
        }

        if (!this.textures.exists('explore-npc')) {
            this.load.image('explore-npc', 'assets/images/characters/jerome/all/ready_stance_v1.png');
        }
        if (!this.textures.exists('explore-item')) {
            this.load.image('explore-item', 'assets/images/ui/icon_box_1.png');
        }
        if (!this.textures.exists('explore-portal')) {
            this.load.image('explore-portal', 'assets/images/ui/icon_door_1.png');
        }
    }

    create() {
        void missionManager.initialize({ mainCharacter: this.charId });
        this.ensureDemoQuest();

        this.physics.world.gravity.y = 1000;
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);

        this.bgFar = this.add.tileSprite(0, 0, WORLD_WIDTH, GAME_HEIGHT, 'explore-bg-far').setOrigin(0, 0).setAlpha(0.25);
        this.bgNear = this.add.tileSprite(0, 0, WORLD_WIDTH, GAME_HEIGHT, 'explore-bg-near').setOrigin(0, 0).setAlpha(0.22);

        this.ground = this.physics.add.staticGroup();
        const groundTile = this.add.tileSprite(WORLD_WIDTH / 2, GROUND_Y + 70, WORLD_WIDTH, 260, 'explore-ground');
        groundTile.setOrigin(0.5, 0.5).setDepth(3);

        const groundBody = this.ground.create(WORLD_WIDTH / 2, GROUND_Y + 110, 'explore-ground') as Phaser.Physics.Arcade.Sprite;
        groundBody.setVisible(false);
        groundBody.setDisplaySize(WORLD_WIDTH, 240);
        groundBody.refreshBody();

        this.partnerSystem = new PartnerSystem(this);
        const starting = this.partnerSystem.initialize(this.charId, 260, GROUND_Y);
        const player = starting.sprite;

        this.physics.add.collider(player, this.ground);

        this.cameras.main.startFollow(player, true, 0.12, 0.12, 0, 120);
        this.cameraFollowCharId = starting.charId;

        this.spawnWorldActors();
        this.setupInput();
        this.setupHud();
        void this.loadWorldContent();

        this.physics.add.collider(this.npc, this.ground);
        this.physics.add.collider(this.portal, this.ground);

        this.physics.add.overlap(player, this.items, (_p, item) => this.handleItemPickup(item as Phaser.Physics.Arcade.Sprite), undefined, this);
    }

    private async loadWorldContent(): Promise<void> {
        this.loadingText?.destroy();
        this.loadingText = this.add
            .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Loading world...', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '34px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 8
            })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(3000)
            .setAlpha(0.9);

        const traceId = `world_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        try {
            const world = await generateWorld({ destination: this.destination, missionType: 'exploration', difficulty: 'normal', traceId });
            this.applyWorldSpec(world);
            this.flashPrompt(`🌍 ${world.destination} world ready`, '#4caf50');
            return;
        } catch (err) {
            console.warn('[ExplorationScene] world generation failed; trying npc fallback', err);
        } finally {
            this.loadingText?.destroy();
            this.loadingText = undefined;
        }

        try {
            const npcs = await generateNpcs({ location: this.destination, locationType: 'outdoor', count: 8 });
            if (npcs.length > 0) {
                this.applyNpcFallback(npcs);
                this.flashPrompt('🌍 NPCs loaded (fallback)', '#ffd700');
            }
        } catch (err) {
            console.warn('[ExplorationScene] npc generation failed; offline fallback', err);
        }
    }

    private applyWorldSpec(world: WorldSpec): void {
        this.clearDecorObjects();

        const scaleX = WORLD_WIDTH / 2000;
        const maxNpcs = Math.min(12, world.npcs.length);
        for (let i = 0; i < maxNpcs; i += 1) {
            const npc = world.npcs[i];
            const x = npc.x * scaleX;
            const y = GROUND_Y + (npc.y - 500);
            const sprite = this.physics.add.sprite(
                x,
                y,
                this.textures.exists('explore-npc') ? 'explore-npc' : 'explore-character-fallback'
            );
            sprite.setOrigin(0.5, 1);
            sprite.setDepth(8);
            sprite.setImmovable(true);
            const body = sprite.body as Phaser.Physics.Arcade.Body;
            body.setAllowGravity(false);

            const tint = npc.has_quest ? 0xffd700 : npc.type === 'shopkeeper' ? 0x55aaff : 0xffffff;
            sprite.setTint(tint);
            this.setSpriteDisplayHeight(sprite, npc.has_quest ? 420 : 360);

            const label = this.add
                .text(sprite.x, sprite.y - sprite.displayHeight - 10, npc.name, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '18px',
                    fontStyle: '900',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(40);

            this.decorObjects.push(sprite, label);
        }

        const maxBuildings = Math.min(6, world.buildings.length);
        for (let i = 0; i < maxBuildings; i += 1) {
            const building = world.buildings[i];
            const x = building.x * scaleX;
            const width = Math.max(120, building.width) * 0.9;
            const height = Math.max(160, building.height) * 0.9;
            const rect = this.add
                .rectangle(x, GROUND_Y - height / 2, width, height, 0xffffff, 0.08)
                .setOrigin(0.5, 0.5)
                .setDepth(6);

            const title = this.add
                .text(rect.x, rect.y - rect.height / 2 - 6, building.name, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '16px',
                    fontStyle: '800',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(7);

            this.decorObjects.push(rect, title);
        }

        const maxItems = Math.min(12, world.items.length);
        const itemTexture = this.textures.exists('explore-item') ? 'explore-item' : 'explore-item-fallback';
        for (let i = 0; i < maxItems; i += 1) {
            const item = world.items[i];
            const x = item.x * scaleX;
            const sprite = this.items.create(x, GROUND_Y - 40, itemTexture) as Phaser.Physics.Arcade.Sprite;
            sprite.setDepth(9);
            sprite.setData('itemId', item.id);
            sprite.setScale(0.8);
            const body = sprite.body as Phaser.Physics.Arcade.Body;
            body.setAllowGravity(false);
            body.setImmovable(true);
        }
    }

    private applyNpcFallback(npcs: Array<{ npcId: string; name: string; role: string }>): void {
        this.clearDecorObjects();

        const spacing = 520;
        const startX = 1200;

        for (let i = 0; i < npcs.length; i += 1) {
            const npc = npcs[i];
            const x = startX + i * spacing;
            const sprite = this.physics.add.sprite(
                x,
                GROUND_Y,
                this.textures.exists('explore-npc') ? 'explore-npc' : 'explore-character-fallback'
            );
            sprite.setOrigin(0.5, 1);
            sprite.setDepth(8);
            sprite.setImmovable(true);
            const body = sprite.body as Phaser.Physics.Arcade.Body;
            body.setAllowGravity(false);
            sprite.setTint(0xffffff);
            this.setSpriteDisplayHeight(sprite, 340);

            const label = this.add
                .text(sprite.x, sprite.y - sprite.displayHeight - 10, npc.name, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '18px',
                    fontStyle: '900',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(40);

            this.decorObjects.push(sprite, label);
        }
    }

    private clearDecorObjects(): void {
        for (const obj of this.decorObjects) {
            obj.destroy();
        }
        this.decorObjects = [];
    }

    private ensureDemoQuest(): void {
        if (missionManager.getActiveMainQuest()) return;
        if (missionManager.getQuest('explore_demo')) return;

        const quest = new Quest({
            questId: 'explore_demo',
            title: 'Exploration Demo Quest',
            description: 'Talk → Collect → Portal → Deliver',
            type: 'main',
            status: QuestStatus.PENDING,
            relatedNPCs: ['npc_quest'],
            objectives: [
                {
                    id: 'talk_npc',
                    type: ObjectiveType.TALK,
                    title: 'Talk to the quest NPC',
                    requiredCount: 1,
                    conditions: [{ npc_id: 'npc_quest' }]
                },
                {
                    id: 'collect_item',
                    type: ObjectiveType.COLLECT,
                    title: 'Collect the mission item',
                    requiredCount: 1,
                    conditions: [{ item_id: 'mission_item' }]
                },
                {
                    id: 'enter_portal',
                    type: ObjectiveType.EXPLORE,
                    title: 'Enter the portal',
                    requiredCount: 1,
                    conditions: [{ building_id: 'vehicle_portal', area: 'vehicle_portal' }]
                },
                {
                    id: 'deliver_item',
                    type: ObjectiveType.DELIVER,
                    title: 'Deliver the item to the NPC',
                    requiredCount: 1,
                    conditions: [{ item_id: 'mission_item', npc_id: 'npc_quest' }]
                }
            ],
            rewards: { money: 180, exp: 90, items: [] }
        });

        missionManager.offerQuest(quest, { type: 'main' });
        void missionManager.acceptQuest(quest.questId, { type: 'main', actorId: this.charId });
    }

    update(timeMs: number, deltaMs: number) {
        const dt = Math.min(deltaMs / 1000, 0.1);

        let current = this.partnerSystem.getCurrent();
        let player = current.sprite;
        let body = player.body as Phaser.Physics.Arcade.Body;

        const moveLeft = Boolean(this.cursors?.left?.isDown || this.keyA?.isDown);
        const moveRight = Boolean(this.cursors?.right?.isDown || this.keyD?.isDown);
        const moveUp = Boolean(this.cursors?.up?.isDown || this.keyW?.isDown);
        const moveDown = Boolean(this.cursors?.down?.isDown || this.keyS?.isDown);
        const interact = Boolean(this.keyE && Phaser.Input.Keyboard.JustDown(this.keyE));

        if (this.keyQ && Phaser.Input.Keyboard.JustDown(this.keyQ)) {
            this.partnerSystem.switchPrevious();
            this.ensureCameraFollow();
        }
        if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
            this.partnerSystem.switchNext();
            this.ensureCameraFollow();
        }

        if (this.keyTab && Phaser.Input.Keyboard.JustDown(this.keyTab)) {
            const next = this.pickNextInactivePartner();
            if (next) {
                if (this.partnerSystem.callPartner(next)) {
                    const entry = this.partnerSystem.getEntry(next);
                    if (entry) {
                        this.physics.add.collider(entry.sprite, this.ground);
                        this.physics.add.overlap(
                            entry.sprite,
                            this.items,
                            (_p, item) => this.handleItemPickup(item as Phaser.Physics.Arcade.Sprite),
                            undefined,
                            this
                        );
                    }
                }
            }
        }

        for (let i = 0; i < this.numberKeys.length; i += 1) {
            const key = this.numberKeys[i];
            if (!key || !Phaser.Input.Keyboard.JustDown(key)) continue;
            const charIds = Object.keys(GAME_CONFIG.CHARACTERS) as CharacterId[];
            const target = charIds[i];
            if (!target) continue;
            if (!this.partnerSystem.switchTo(target)) {
                if (this.partnerSystem.callPartner(target)) {
                    const entry = this.partnerSystem.getEntry(target);
                    if (entry) {
                        this.physics.add.collider(entry.sprite, this.ground);
                        this.physics.add.overlap(
                            entry.sprite,
                            this.items,
                            (_p, item) => this.handleItemPickup(item as Phaser.Physics.Arcade.Sprite),
                            undefined,
                            this
                        );
                    }
                }
                this.partnerSystem.switchTo(target);
            }
            this.ensureCameraFollow();
        }

        current = this.partnerSystem.getCurrent();
        player = current.sprite;
        body = player.body as Phaser.Physics.Arcade.Body;

        this.updatePlayerMode(timeMs, body);

        if (this.mode === 'walking') {
            const axis = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
            body.setVelocityX(axis * 520);
            if (axis !== 0) player.setFlipX(axis < 0);

            const grounded = body.blocked.down || body.touching.down;
            if (grounded && this.keySpace && Phaser.Input.Keyboard.JustDown(this.keySpace)) {
                body.setVelocityY(-650);
            }
        } else {
            const axisX = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
            const axisY = (moveDown ? 1 : 0) - (moveUp ? 1 : 0);
            body.setVelocity(axisX * 520, axisY * 480);
            if (axisX !== 0) player.setFlipX(axisX < 0);

            const nearGround = player.y >= GROUND_Y - 10;
            if (nearGround && moveDown) {
                this.setMode('walking', body);
            }
        }

        this.partnerSystem.update(dt);

        this.bgFar.tilePositionX = this.cameras.main.scrollX * 0.12;
        this.bgNear.tilePositionX = this.cameras.main.scrollX * 0.24;

        if (interact) {
            this.tryInteract();
        }

        this.checkExplorationTriggers();
        this.updateHud();
    }

    private updatePlayerMode(timeMs: number, body: Phaser.Physics.Arcade.Body): void {
        if (!this.keySpace) return;
        const isDown = Boolean(this.keySpace.isDown);

        if (this.mode === 'walking') {
            const grounded = body.blocked.down || body.touching.down;
            if (!grounded) {
                this.spaceDownAtMs = null;
            } else if (isDown && this.spaceDownAtMs === null) {
                this.spaceDownAtMs = timeMs;
            } else if (!isDown) {
                this.spaceDownAtMs = null;
            }

            if (isDown && grounded && this.spaceDownAtMs !== null && timeMs - this.spaceDownAtMs > HOLD_TO_FLY_MS) {
                this.setMode('flying', body);
                this.spaceDownAtMs = null;
            }
            return;
        }

        // flying mode: tap space to add a small boost burst.
        if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
            body.velocity.y -= 120;
        }
    }

    private setMode(mode: PlayerMode, body: Phaser.Physics.Arcade.Body): void {
        if (this.mode === mode) return;
        this.mode = mode;
        if (mode === 'flying') {
            body.setAllowGravity(false);
            body.setVelocity(0, 0);
        } else {
            body.setAllowGravity(true);
        }
    }

    private tryInteract(): void {
        const current = this.partnerSystem.getCurrent();
        const player = current.sprite;
        const dxNpc = Math.abs(player.x - this.npc.x);
        const dyNpc = Math.abs(player.y - this.npc.y);
        const canTalk = dxNpc < 190 && dyNpc < 180;

        if (canTalk) {
            if (this.inventory.has('mission_item')) {
                this.inventory.delete('mission_item');
                eventBus.emit(EVENTS.DELIVER_ITEM, { npcId: 'npc_quest', itemId: 'mission_item', actorId: current.charId });
                this.flashPrompt('📦 Delivered!', '#4caf50');
            } else {
                eventBus.emit(EVENTS.NPC_INTERACTION, { npc: { npcId: 'npc_quest' }, actorId: current.charId });
                this.flashPrompt('🗣️ Talked to NPC!', '#00eaff');
            }
            return;
        }

        const dxPortal = Math.abs(player.x - this.portal.x);
        const canPortal = dxPortal < 180 && player.y > this.portal.y - 220;
        if (canPortal) {
            eventBus.emit(EVENTS.PORTAL_ENTERED, { buildingId: 'vehicle_portal', actorId: current.charId });
            this.flashPrompt('🌀 Portal entered!', '#ffd700');
        }
    }

    private handleItemPickup(item: Phaser.Physics.Arcade.Sprite): void {
        const id = (item.getData('itemId') as string | undefined) ?? 'mission_item';
        if (!this.inventory.has(id)) {
            this.inventory.add(id);
            const current = this.partnerSystem.getCurrent();
            eventBus.emit(EVENTS.ITEM_COLLECTED, { itemId: id, item: { id }, actorId: current.charId });
            this.flashPrompt('📦 Item collected!', '#ffd700');
        }
        item.destroy();
    }

    private checkExplorationTriggers(): void {
        const current = this.partnerSystem.getCurrent();
        const playerX = current.sprite.x;

        if (playerX > 1200 && !this.exploredAreas.has('zone_a')) {
            this.exploredAreas.add('zone_a');
            eventBus.emit(EVENTS.AREA_EXPLORED, { area: 'zone_a', actorId: current.charId });
        }

        if (playerX > 2600 && !this.exploredAreas.has('zone_b')) {
            this.exploredAreas.add('zone_b');
            eventBus.emit(EVENTS.AREA_EXPLORED, { area: 'zone_b', actorId: current.charId });
        }
    }

    private setupInput(): void {
        if (!this.input.keyboard) return;
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyTab = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
        this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        this.numberKeys = [];
        const digitKeys = [
            Phaser.Input.Keyboard.KeyCodes.ONE,
            Phaser.Input.Keyboard.KeyCodes.TWO,
            Phaser.Input.Keyboard.KeyCodes.THREE,
            Phaser.Input.Keyboard.KeyCodes.FOUR,
            Phaser.Input.Keyboard.KeyCodes.FIVE,
            Phaser.Input.Keyboard.KeyCodes.SIX,
            Phaser.Input.Keyboard.KeyCodes.SEVEN,
            Phaser.Input.Keyboard.KeyCodes.EIGHT
        ];
        for (const code of digitKeys) {
            this.numberKeys.push(this.input.keyboard.addKey(code));
        }
    }

    private ensureCameraFollow(): void {
        const current = this.partnerSystem.getCurrent();
        if (this.cameraFollowCharId === current.charId) return;
        this.cameraFollowCharId = current.charId;
        this.cameras.main.startFollow(current.sprite, true, 0.12, 0.12, 0, 120);
    }

    private setupHud(): void {
        this.hudText = this.add
            .text(24, 24, '', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '20px',
                fontStyle: '800',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setScrollFactor(0)
            .setDepth(2000);

        this.promptText = this.add
            .text(GAME_WIDTH / 2, 80, '', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '28px',
                fontStyle: '900',
                color: '#00eaff',
                stroke: '#000000',
                strokeThickness: 8
            })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(2001)
            .setAlpha(0);
    }

    private updateHud(): void {
        if (!this.hudText) return;
        const current = this.partnerSystem.getCurrent();
        const partners = this.partnerSystem.getActiveCharacterIds().length;
        const items = this.inventory.size;
        const quest = missionManager.getActiveMainQuest();
        const objective = quest?.getPendingObjectives()?.[0] ?? null;
        const questLine = quest
            ? `Quest: ${quest.title}\nObjective: ${objective ? `${objective.title} (${objective.getProgressText()})` : 'All done!'}`
            : 'Quest: none';

        this.hudText.setText(
            `EXPLORATION · ${this.destination.toUpperCase()}\n` +
                `Character: ${GAME_CONFIG.CHARACTERS[current.charId].name} (${current.charId})\n` +
                `Mode: ${this.mode.toUpperCase()}  |  Partners: ${partners}  |  Items: ${items}\n` +
                `${questLine}`
        );
    }

    private flashPrompt(message: string, color: string): void {
        if (!this.promptText) return;
        this.promptText.setText(message);
        this.promptText.setColor(color);
        this.promptText.setAlpha(1);
        this.tweens.killTweensOf(this.promptText);
        this.tweens.add({
            targets: this.promptText,
            alpha: 0,
            duration: 900,
            ease: 'Cubic.easeOut'
        });
    }

    private pickNextInactivePartner(): CharacterId | null {
        const active = new Set(this.partnerSystem.getActiveCharacterIds());
        const all = Object.keys(GAME_CONFIG.CHARACTERS) as CharacterId[];
        for (const id of all) {
            if (!active.has(id)) return id;
        }
        return null;
    }

    private spawnWorldActors(): void {
        this.items = this.physics.add.group();

        const itemX = 1500;
        const itemTexture = this.textures.exists('explore-item') ? 'explore-item' : 'explore-item-fallback';
        const item = this.items.create(itemX, GROUND_Y - 40, itemTexture) as Phaser.Physics.Arcade.Sprite;
        item.setDepth(10);
        item.setCircle(item.width * 0.35);
        item.setData('itemId', 'mission_item');
        const itemBody = item.body as Phaser.Physics.Arcade.Body;
        itemBody.setAllowGravity(false);
        itemBody.setImmovable(true);

        this.npc = this.physics.add.sprite(900, GROUND_Y, this.textures.exists('explore-npc') ? 'explore-npc' : 'explore-character-fallback');
        this.npc.setDepth(10);
        this.npc.setImmovable(true);
        const npcBody = this.npc.body as Phaser.Physics.Arcade.Body;
        npcBody.setAllowGravity(false);
        this.npc.setTint(0x55aaff);
        this.npc.setOrigin(0.5, 1);
        this.setSpriteDisplayHeight(this.npc, 460);

        this.add
            .text(this.npc.x, this.npc.y - this.npc.displayHeight - 14, 'Quest NPC', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '22px',
                fontStyle: '900',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setOrigin(0.5, 1)
            .setDepth(50);

        const portalTexture = this.textures.exists('explore-portal') ? 'explore-portal' : 'explore-portal-fallback';
        this.portal = this.physics.add.sprite(3200, GROUND_Y, portalTexture);
        this.portal.setDepth(10);
        this.portal.setImmovable(true);
        const portalBody = this.portal.body as Phaser.Physics.Arcade.Body;
        portalBody.setAllowGravity(false);
        this.portal.setOrigin(0.5, 1);
        this.setSpriteDisplayHeight(this.portal, 340);

        this.add
            .text(this.portal.x, this.portal.y - this.portal.displayHeight - 10, 'Portal', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '20px',
                fontStyle: '900',
                color: '#ffd700',
                stroke: '#000000',
                strokeThickness: 6
            })
            .setOrigin(0.5, 1)
            .setDepth(50);
    }

    private ensureTextures(): void {
        if (!this.textures.exists('explore-bg-far')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x102236, 1);
            g.fillRect(0, 0, 512, 512);
            g.fillStyle(0xffffff, 0.05);
            for (let i = 0; i < 120; i += 1) {
                g.fillCircle(
                    Phaser.Math.Between(0, 512),
                    Phaser.Math.Between(0, 512),
                    Phaser.Math.Between(2, 8)
                );
            }
            g.generateTexture('explore-bg-far', 512, 512);
            g.destroy();
        }

        if (!this.textures.exists('explore-bg-near')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x16405c, 1);
            g.fillRect(0, 0, 512, 512);
            g.lineStyle(6, 0xffffff, 0.06);
            for (let x = -256; x < 512 * 2; x += 44) {
                g.beginPath();
                g.moveTo(x, 0);
                g.lineTo(x + 220, 512);
                g.strokePath();
            }
            g.generateTexture('explore-bg-near', 512, 512);
            g.destroy();
        }

        if (!this.textures.exists('explore-ground')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x2b2b2b, 1);
            g.fillRect(0, 0, 512, 256);
            g.fillStyle(0x1f8b4c, 1);
            g.fillRect(0, 0, 512, 70);
            g.fillStyle(0xffffff, 0.06);
            for (let i = 0; i < 180; i += 1) {
                g.fillCircle(
                    Phaser.Math.Between(0, 512),
                    Phaser.Math.Between(70, 256),
                    Phaser.Math.Between(1, 3)
                );
            }
            g.generateTexture('explore-ground', 512, 256);
            g.destroy();
        }

        if (!this.textures.exists('explore-character-fallback')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xe31d2b, 1);
            g.fillRoundedRect(0, 0, 240, 280, 40);
            g.fillStyle(0xffffff, 0.85);
            g.fillRoundedRect(30, 50, 180, 36, 18);
            g.fillStyle(0x000000, 0.25);
            g.fillRoundedRect(40, 105, 160, 16, 8);
            g.generateTexture('explore-character-fallback', 240, 280);
            g.destroy();
        }

        if (!this.textures.exists('explore-item-fallback')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffd700, 1);
            g.fillRoundedRect(0, 0, 48, 48, 10);
            g.lineStyle(4, 0xffffff, 0.85);
            g.strokeRoundedRect(6, 6, 36, 36, 8);
            g.generateTexture('explore-item-fallback', 48, 48);
            g.destroy();
        }

        if (!this.textures.exists('explore-portal-fallback')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x3a3a3a, 1);
            g.fillRoundedRect(0, 0, 120, 180, 26);
            g.lineStyle(8, 0x00eaff, 0.8);
            g.strokeRoundedRect(10, 16, 100, 150, 24);
            g.fillStyle(0x00eaff, 0.25);
            g.fillRoundedRect(18, 26, 84, 130, 18);
            g.generateTexture('explore-portal-fallback', 120, 180);
            g.destroy();
        }
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Sprite, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }
}
