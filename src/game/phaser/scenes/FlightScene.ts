import Phaser from 'phaser';

import { audioManager } from '../../../shared/audio/audioManager';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { gameCommandTarget } from '../../../shared/gameCommands';
import { GAME_CONFIG, type CharacterId } from '../../../shared/gameConfig';
import { emitFlightComplete } from '../../../shared/flightEvents';
import { emitHudUpdate } from '../../../shared/hudEvents';
import type { GameCommand } from '../../../shared/gameCommands';
import type { HudState } from '../../../shared/types/Scene';
import { Player } from '../entities/Player';
import { BackgroundDecorSystem, getDecorAssetEntries } from '../systems/BackgroundDecorSystem';
import { InputSystem } from '../systems/InputSystem';

const FLIGHT_PLAYER_IMAGE: Record<CharacterId, string> = {
    jett: 'flying_pose_v1.png',
    jerome: 'flying_pose_v3.png',
    donnie: 'in_flight_v1.png',
    chase: 'flying_pose_v1.png',
    flip: 'flying_pose_v1.png',
    todd: 'flying_pose_v1.png',
    paul: 'flying_pose_v1.png',
    bello: 'flying_pose_v1.png'
};

const FLIGHT_PLAYER_TARGET_HEIGHT = 720;
const FLIGHT_PLAYER_COLLIDER = { width: 400, height: 280 } as const;

type FlightSceneInitData = {
    missionType?: string;
    charId?: string;
    missionId?: string;
    weather?: string;
    location?: string;
};

type ParallaxLayer = {
    speed: number;
    image1: Phaser.GameObjects.Image;
    image2: Phaser.GameObjects.Image;
};

export class FlightScene extends Phaser.Scene {
    private inputSystem!: InputSystem;
    private player!: Player;
    private playerStartX = 120;
    private wasBoosting = false;

    private baseSpeed = 400;
    private currentSpeed = 400;
    private distance = 0;
    private targetDistance = 5000;
    private score = 0;
    private missionType = 'Delivery';
    private charId: CharacterId = 'jett';
    private missionId = 'm_local';
    private location = 'world_airport';

    private timeLeft = 60;
    private isRunning = false;
    private spawnTimer = 0;
    private hitFlashTimer = 0;
    private coinsCollected = 0;
    private obstaclesHit = 0;
    private boostsUsed = 0;
    private flightTime = 0;

    private weather = 'clear';
    private parallaxAssets: { sky: string; cloudsFar: string; cloudsNear: string } | null = null;
    private parallaxLayers: ParallaxLayer[] = [];
    private hitFlashOverlay!: Phaser.GameObjects.Rectangle;
    private resultText?: Phaser.GameObjects.Text;
    private engineParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
    private speedLinesOverlay!: Phaser.GameObjects.TileSprite;
    private decorSystem?: BackgroundDecorSystem;

    private obstacles!: Phaser.Physics.Arcade.Group;
    private collectibles!: Phaser.Physics.Arcade.Group;
    private clouds!: Phaser.GameObjects.Group;

    private hudEmitAccumulator = 0;
    private hudState: HudState = {
        score: 0,
        distance: 0,
        speed: 0,
        missionType: 'Delivery',
        status: 'ready'
    };

    constructor() {
        super({ key: 'FlightScene' });
    }

    init(data: FlightSceneInitData) {
        this.missionType = data.missionType ?? 'Delivery';
        this.missionId = data.missionId ?? 'm_local';
        this.weather = data.weather ?? 'clear';
        this.location = data.location ?? 'world_airport';
        this.parallaxAssets = this.selectParallaxAssets(this.weather);
        const requested = (data.charId ?? 'jett').toLowerCase();
        if (requested in GAME_CONFIG.CHARACTERS) {
            this.charId = requested as CharacterId;
        } else {
            this.charId = 'jett';
        }
    }

    preload() {
        const assets = this.parallaxAssets ?? this.selectParallaxAssets(this.weather);
        this.parallaxAssets = assets;

        for (const entry of getDecorAssetEntries(this.location)) {
            if (!this.textures.exists(entry.key)) {
                this.load.image(entry.key, entry.path);
            }
        }

        const playerTextureKey = this.getFlightPlayerTextureKey(this.charId);
        if (!this.textures.exists(playerTextureKey)) {
            this.load.image(playerTextureKey, this.getFlightPlayerTexturePath(this.charId));
        }
        if (!this.textures.exists('flight-sky')) {
            this.load.image('flight-sky', assets.sky);
        }
        if (!this.textures.exists('flight-clouds-far')) {
            this.load.image('flight-clouds-far', assets.cloudsFar);
        }
        if (!this.textures.exists('flight-clouds-near')) {
            this.load.image('flight-clouds-near', assets.cloudsNear);
        }
    }

    create() {
        this.ensureTextures();
        this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

        this.attachCommandListener();
        audioManager.startEngine();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            audioManager.stopEngine();
        });

        const skyKey = this.textures.exists('flight-sky') ? 'flight-sky' : 'bg-far';
        const cloudsFarKey = this.textures.exists('flight-clouds-far') ? 'flight-clouds-far' : 'bg-near';
        const cloudsNearKey = this.textures.exists('flight-clouds-near') ? 'flight-clouds-near' : 'bg-near';

        this.parallaxLayers = [
            this.createParallaxLayer(skyKey, 0.05, 0, GAME_HEIGHT, 0),
            this.createParallaxLayer(cloudsFarKey, 0.15, 50, GAME_HEIGHT * 0.4, 1),
            this.createParallaxLayer(cloudsNearKey, 0.4, 100, GAME_HEIGHT * 0.5, 2)
        ];

        this.speedLinesOverlay = this.add
            .tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'flight-speedlines')
            .setScrollFactor(0)
            .setDepth(900)
            .setAlpha(0)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.clouds = this.add.group();
        this.obstacles = this.physics.add.group();
        this.collectibles = this.physics.add.group();
        this.decorSystem = new BackgroundDecorSystem(this, { location: this.location });

        this.inputSystem = new InputSystem(this);
        this.player = new Player(this, 120, GAME_HEIGHT / 2);
        const playerTextureKey = this.getFlightPlayerTextureKey(this.charId);
        if (this.textures.exists(playerTextureKey)) {
            this.player.sprite.setTexture(playerTextureKey);
            this.player.sprite.clearTint();
        } else {
            this.applyCharacterTint();
        }
        this.setSpriteDisplayHeight(this.player.sprite, FLIGHT_PLAYER_TARGET_HEIGHT);
        this.playerStartX = Math.max(260, Math.ceil(this.player.sprite.displayWidth / 2) + 40);
        this.player.sprite.setPosition(this.playerStartX, GAME_HEIGHT / 2);
        const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
        body.setSize(FLIGHT_PLAYER_COLLIDER.width, FLIGHT_PLAYER_COLLIDER.height, true);

        this.engineParticles = this.add.particles(0, 0, 'flight-particle', {
            x: () => this.player.sprite.x - this.player.sprite.displayWidth * 0.28 + Phaser.Math.Between(-16, 16),
            y: () => this.player.sprite.y + this.player.sprite.displayHeight * 0.18 + Phaser.Math.Between(-14, 14),
            speedX: { min: -900, max: -520 },
            speedY: { min: -110, max: 110 },
            lifespan: { min: 160, max: 420 },
            scale: { start: 0.95, end: 0 },
            alpha: { start: 0.75, end: 0 },
            blendMode: 'ADD',
            quantity: 1,
            frequency: 90
        });
        this.engineParticles.setDepth(24);

        this.physics.add.overlap(
            this.player.sprite,
            this.obstacles,
            (_player, obstacle) => this.handleObstacleHit(obstacle as Phaser.Physics.Arcade.Sprite),
            undefined,
            this
        );

        this.physics.add.overlap(
            this.player.sprite,
            this.collectibles,
            (_player, collectible) => this.handleCollectible(collectible as Phaser.Physics.Arcade.Sprite),
            undefined,
            this
        );

        this.hitFlashOverlay = this.add
            .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff0000, 0)
            .setScrollFactor(0)
            .setDepth(1000);

        this.resetRun();
        this.isRunning = true;
        this.emitHudState();
    }

    update(timeMs: number, deltaMs: number) {
        if (!this.isRunning) return;

        const dt = Math.min(deltaMs / 1000, 0.1);
        this.flightTime += dt;

        const axis = this.inputSystem.axis;
        this.player.update(axis, dt);

        let speedMultiplier = 1.0;
        const boosting = this.inputSystem.isBoosting;
        if (boosting) speedMultiplier = 2.0;
        this.currentSpeed = this.baseSpeed * speedMultiplier;
        audioManager.setEnginePitch(speedMultiplier);

        if (boosting && !this.wasBoosting) {
            audioManager.playSound('boost');
            this.boostsUsed += 1;
        }
        this.wasBoosting = boosting;

        const speedLineAlpha = boosting ? 0.22 : 0;
        this.speedLinesOverlay.setAlpha(speedLineAlpha);
        if (speedLineAlpha > 0) {
            this.speedLinesOverlay.tilePositionX += this.currentSpeed * dt * 0.9;
            this.speedLinesOverlay.tilePositionY = Math.sin(timeMs / 180) * 6;
        }

        if (boosting) {
            this.engineParticles.setFrequency(28);
            this.engineParticles.setQuantity(4);
        } else {
            this.engineParticles.setFrequency(90);
            this.engineParticles.setQuantity(1);
        }

        if (this.hitFlashTimer > 0) {
            this.currentSpeed *= 0.5;
            this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
            this.hitFlashOverlay.setAlpha(this.hitFlashTimer * 0.3);
        } else {
            this.hitFlashOverlay.setAlpha(0);
        }

        if (this.missionType === 'Sports' || this.missionType === 'Race') {
            this.timeLeft -= dt;
            if (this.timeLeft <= 0) {
                this.finishGame(false);
                return;
            }
        }

        this.updateParallaxLayers(dt);
        this.decorSystem?.update(dt, this.currentSpeed);

        this.spawnTimer += dt;
        if (this.spawnTimer > 1.0) {
            this.spawnEntity();
            this.spawnTimer = 0;
        }

        this.updateEntities(dt);

        if (axis.x > 0) {
            this.distance += this.currentSpeed * dt * axis.x;
        }
        if (this.distance >= this.targetDistance) {
            this.finishGame(true);
            return;
        }

        this.hudEmitAccumulator += dt;
        if (this.hudEmitAccumulator >= 0.25) {
            this.hudEmitAccumulator = 0;
            this.emitHudState();
        }
    }

    private resetRun() {
        this.distance = 0;
        this.score = 0;
        this.timeLeft = 60;
        this.spawnTimer = 0;
        this.hitFlashTimer = 0;
        this.wasBoosting = false;
        this.currentSpeed = this.baseSpeed;
        this.hudEmitAccumulator = 0;
        this.coinsCollected = 0;
        this.obstaclesHit = 0;
        this.boostsUsed = 0;
        this.flightTime = 0;

        this.resetParallaxPositions();

        this.obstacles.clear(true, true);
        this.collectibles.clear(true, true);
        this.clouds.clear(true, true);
        this.decorSystem?.clear();

        this.hudState = {
            score: this.score,
            distance: this.distance,
            speed: this.currentSpeed,
            missionType: this.missionType,
            status: 'running',
            timeLeft: this.missionType === 'Sports' || this.missionType === 'Race' ? this.timeLeft : undefined
        };
    }

    private emitHudState() {
        this.hudState = {
            score: this.score,
            distance: this.distance,
            speed: this.currentSpeed,
            missionType: this.missionType,
            status: this.isRunning ? 'running' : this.hudState.status,
            timeLeft: this.missionType === 'Sports' || this.missionType === 'Race' ? this.timeLeft : undefined
        };
        emitHudUpdate(this.hudState);
    }

    private spawnEntity() {
        const roll = Math.random();
        if (roll < 0.3) {
            this.spawnObstacle();
        } else if (roll < 0.6) {
            this.spawnCollectible();
        } else {
            this.spawnCloud();
        }
    }

    private spawnCloud() {
        const size = 60 + Math.random() * 80;
        const y = Math.random() * (GAME_HEIGHT - size) + size / 2;
        const cloud = this.add.sprite(GAME_WIDTH + size / 2, y, 'cloud');
        cloud.setDisplaySize(size, size * 0.6);
        cloud.setAlpha(0.3 + Math.random() * 0.4);
        cloud.setDepth(5);
        cloud.setData('speedFactor', 0.8 + Math.random() * 0.4);
        this.clouds.add(cloud);
    }

    private spawnObstacle() {
        const size = 80;
        const y = Math.random() * (GAME_HEIGHT - size) + size / 2;
        const obstacle = this.physics.add.sprite(GAME_WIDTH + size / 2, y, 'obstacle');
        obstacle.setDisplaySize(size, size);
        obstacle.setDepth(20);
        obstacle.setImmovable(true);
        obstacle.body.setSize(size * 0.6, size * 0.6, true);
        this.obstacles.add(obstacle);
    }

    private spawnCollectible() {
        const size = 40;
        const y = Math.random() * (GAME_HEIGHT - size) + size / 2;
        const collectible = this.physics.add.sprite(GAME_WIDTH + size / 2, y, 'collectible');
        collectible.setDisplaySize(size, size);
        collectible.setDepth(15);
        collectible.body.setSize(size * 0.6, size * 0.6, true);
        collectible.setData('baseY', collectible.y);
        collectible.setData('timer', 0);
        collectible.setData('oscillationOffset', Math.random() * Math.PI * 2);
        this.collectibles.add(collectible);
    }

    private updateEntities(dt: number) {
        for (const child of this.clouds.getChildren()) {
            const cloud = child as Phaser.GameObjects.Sprite;
            const factor = cloud.getData('speedFactor') as number | undefined;
            const speedFactor = factor ?? 1;
            cloud.x -= this.currentSpeed * dt * speedFactor;
            if (cloud.x + cloud.displayWidth / 2 < 0) cloud.destroy();
        }

        for (const child of this.obstacles.getChildren()) {
            const obstacle = child as Phaser.Physics.Arcade.Sprite;
            obstacle.x -= this.currentSpeed * dt;
            if (obstacle.x + obstacle.displayWidth / 2 < 0) obstacle.destroy();
        }

        for (const child of this.collectibles.getChildren()) {
            const collectible = child as Phaser.Physics.Arcade.Sprite;
            collectible.x -= this.currentSpeed * dt;

            const baseY = collectible.getData('baseY') as number | undefined;
            const timer = (collectible.getData('timer') as number | undefined) ?? 0;
            const offset = (collectible.getData('oscillationOffset') as number | undefined) ?? 0;
            const nextTimer = timer + dt * 5;
            collectible.setData('timer', nextTimer);
            if (typeof baseY === 'number') {
                collectible.y = baseY + Math.sin(nextTimer + offset) * 10;
            }

            if (collectible.x + collectible.displayWidth / 2 < 0) collectible.destroy();
        }
    }

    private handleObstacleHit(_obstacle: Phaser.Physics.Arcade.Sprite) {
        if (this.hitFlashTimer > 0) return;
        this.hitFlashTimer = 1.0;
        this.cameras.main.shake(1000, 0.004);
        this.score = Math.max(0, this.score - 20);
        this.obstaclesHit += 1;
        audioManager.playSound('hit');
        this.emitHudState();
    }

    private handleCollectible(collectible: Phaser.Physics.Arcade.Sprite) {
        this.score += 50;
        this.coinsCollected += 1;
        collectible.destroy();
        audioManager.playSound('coin');
        this.emitHudState();
    }

    private finishGame(success: boolean) {
        if (!this.isRunning) return;
        this.isRunning = false;
        audioManager.stopEngine();

        if (success) {
            if (this.missionType === 'Sports') {
                this.score += Math.floor(this.timeLeft * 10);
            }
            this.hudState.status = 'ready';
            audioManager.playSound('mission_complete');
        } else {
            this.score = Math.floor(this.score / 2);
            this.hudState.status = 'ready';
            audioManager.playSound('error');
        }

        this.emitHudState();
        this.resultText?.destroy();
        this.resultText = undefined;

        if (success) {
            this.cameras.main.fadeOut(260, 255, 255, 255);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                this.scene.start('ArrivalScene', {
                    missionId: this.missionId,
                    missionType: this.missionType,
                    charId: this.charId,
                    location: this.location,
                    score: this.score,
                    flightStats: {
                        coinsCollected: this.coinsCollected,
                        obstaclesHit: this.obstaclesHit,
                        flightTime: this.flightTime,
                        boostsUsed: this.boostsUsed,
                        distance: this.distance
                    }
                });
            });
            return;
        }

        emitFlightComplete({
            missionId: this.missionId,
            missionType: this.missionType,
            charId: this.charId,
            score: this.score,
            success,
            flightStats: {
                coinsCollected: this.coinsCollected,
                obstaclesHit: this.obstaclesHit,
                flightTime: this.flightTime,
                boostsUsed: this.boostsUsed,
                distance: this.distance
            }
        });
    }

    private attachCommandListener() {
        const onCommand = (event: Event) => {
            const command = (event as CustomEvent<GameCommand>).detail;
            if (command.type === 'flight:restart') {
                this.restartRun();
            }
        };

        gameCommandTarget.addEventListener('game:command', onCommand);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            gameCommandTarget.removeEventListener('game:command', onCommand);
        });
    }

    private restartRun() {
        this.isRunning = true;
        this.resetRun();
        audioManager.startEngine();
        this.player.sprite.setPosition(this.playerStartX, GAME_HEIGHT / 2);
        this.player.sprite.rotation = 0;
        this.hitFlashOverlay.setAlpha(0);
        this.resultText?.destroy();
        this.resultText = undefined;
        this.emitHudState();
    }

    private applyCharacterTint() {
        const configEntry = GAME_CONFIG.CHARACTERS[this.charId];
        const hex = configEntry?.color ?? GAME_CONFIG.CHARACTERS.jett.color;
        const tint = Number.parseInt(hex.replace('#', ''), 16);
        if (Number.isFinite(tint)) {
            this.player.sprite.setTint(tint);
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

        if (!this.textures.exists('obstacle')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x555555, 1);
            g.fillCircle(34, 38, 28);
            g.fillCircle(58, 34, 32);
            g.fillCircle(46, 52, 26);
            g.lineStyle(4, 0xff5252, 1);
            g.strokeCircle(34, 38, 28);
            g.strokeCircle(58, 34, 32);
            g.fillStyle(0xffd700, 1);
            g.beginPath();
            g.moveTo(46, 20);
            g.lineTo(34, 48);
            g.lineTo(52, 48);
            g.lineTo(40, 76);
            g.closePath();
            g.fillPath();
            g.generateTexture('obstacle', 100, 100);
            g.destroy();
        }

        if (!this.textures.exists('collectible')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffd700, 1);
            g.fillCircle(32, 32, 28);
            g.fillStyle(0xfffacd, 1);
            g.fillCircle(32, 32, 16);
            g.generateTexture('collectible', 64, 64);
            g.destroy();
        }

        if (!this.textures.exists('flight-particle')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x00eaff, 1);
            g.fillCircle(8, 8, 8);
            g.generateTexture('flight-particle', 16, 16);
            g.destroy();
        }

        if (!this.textures.exists('flight-speedlines')) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.clear();
            g.lineStyle(3, 0xffffff, 0.18);
            for (let i = -128; i < 512; i += 24) {
                g.beginPath();
                g.moveTo(i, 0);
                g.lineTo(i - 180, 256);
                g.strokePath();
            }
            g.generateTexture('flight-speedlines', 256, 256);
            g.destroy();
        }
    }

    private setSpriteDisplayHeight(sprite: Phaser.GameObjects.Sprite, targetHeight: number): void {
        const sourceHeight = sprite.height;
        if (sourceHeight <= 0) return;
        const scale = targetHeight / sourceHeight;
        sprite.setScale(scale);
    }

    private createParallaxLayer(textureKey: string, speed: number, y: number, height: number, depth: number): ParallaxLayer {
        const image1 = this.add
            .image(0, y, textureKey)
            .setOrigin(0, 0)
            .setDisplaySize(GAME_WIDTH, height)
            .setScrollFactor(0)
            .setDepth(depth);
        const image2 = this.add
            .image(GAME_WIDTH, y, textureKey)
            .setOrigin(0, 0)
            .setDisplaySize(GAME_WIDTH, height)
            .setScrollFactor(0)
            .setDepth(depth);

        return { speed, image1, image2 };
    }

    private resetParallaxPositions() {
        for (const layer of this.parallaxLayers) {
            layer.image1.x = 0;
            layer.image2.x = GAME_WIDTH;
        }
    }

    private updateParallaxLayers(dt: number) {
        for (const layer of this.parallaxLayers) {
            const dx = this.currentSpeed * layer.speed * dt;
            layer.image1.x -= dx;
            layer.image2.x -= dx;

            if (layer.image1.x <= -GAME_WIDTH) {
                layer.image1.x = layer.image2.x + GAME_WIDTH;
            }
            if (layer.image2.x <= -GAME_WIDTH) {
                layer.image2.x = layer.image1.x + GAME_WIDTH;
            }
        }
    }

    private selectParallaxAssets(weather: string): { sky: string; cloudsFar: string; cloudsNear: string } {
        const basePath = 'assets/images/backgrounds';
        const weatherMap: Record<string, string> = {
            clear: 'blue',
            sunset: 'sunset',
            sunrise: 'sunrise',
            night: 'night',
            stormy: 'stormy',
            cloudy: 'cloudy',
            rainy: 'rainy',
            rainbow: 'rainbow'
        };
        const weatherKey = weatherMap[weather] ?? 'blue';

        const sky = `${basePath}/sky/sky_${weatherKey}_gradient_v1.png`;

        let cloudsFarBase = 'clouds_far_white';
        let cloudsNearBase = 'clouds_near_white';

        if (weather === 'sunset' || weather === 'sunrise') {
            cloudsFarBase = 'clouds_far_sunset';
            cloudsNearBase = 'clouds_near_sunset';
        } else if (weather === 'stormy') {
            cloudsFarBase = 'clouds_storm_dark';
            cloudsNearBase = 'clouds_storm_dark';
        } else if (weather === 'rainy') {
            cloudsFarBase = 'clouds_rain_gray';
            cloudsNearBase = 'clouds_rain_gray';
        }

        const farVariant = 1 + Math.floor(Math.random() * 3);
        const nearVariant = 1 + Math.floor(Math.random() * 3);

        const cloudsFar = `${basePath}/clouds/${cloudsFarBase}_v${farVariant}.png`;
        const cloudsNear = `${basePath}/clouds/${cloudsNearBase}_v${nearVariant}.png`;

        return { sky, cloudsFar, cloudsNear };
    }

    private getFlightPlayerTexturePath(charId: string): string {
        const character = charId.toLowerCase() as CharacterId;
        const filename = FLIGHT_PLAYER_IMAGE[character] ?? 'flying_pose_v1.png';
        return `assets/images/characters/${charId}/all/${filename}`;
    }

    private getFlightPlayerTextureKey(charId: string): string {
        return `flight-player-${charId}`;
    }
}
