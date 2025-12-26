import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';

type DecorLayer = 'far' | 'mid' | 'ground';
type DecorAnimation = 'float' | 'flap' | null;

type DecorConfig = {
    layer: DecorLayer;
    speedFactor: number;
    spawnChance: number;
    paths: string[];
    scale: { min: number; max: number };
    alpha: { min: number; max: number };
    animation?: DecorAnimation;
    yOffset?: 'ground';
};

type DecorObject = {
    sprite: Phaser.GameObjects.Sprite;
    speedFactor: number;
    animation: DecorAnimation;
    animationTimer: number;
    oscillationPhase: number;
    baseY: number;
    baseScale: number;
    floatAmplitude: number;
};

type DecorLibrary = Record<string, DecorConfig>;

const LANDMARK_SETS: Record<string, string[]> = {
    london: [
        'assets/images/objects/landmarks/london/big_ben_v1.png',
        'assets/images/objects/landmarks/london/big_ben_v2.png',
        'assets/images/objects/landmarks/london/london_phone_booth_v1.png',
        'assets/images/objects/landmarks/london/london_phone_booth_v2.png',
        'assets/images/objects/landmarks/london/london_mailbox_v1.png'
    ],
    paris: ['assets/images/objects/landmarks/paris/eiffel_tower_v1.png', 'assets/images/objects/landmarks/paris/eiffel_tower_v2.png'],
    tokyo: ['assets/images/objects/landmarks/tokyo/tokyo_tower_v1.png', 'assets/images/objects/landmarks/tokyo/tokyo_tower_v2.png'],
    new_york: [
        'assets/images/objects/landmarks/new_york/statue_liberty_v1.png',
        'assets/images/objects/landmarks/new_york/statue_liberty_v2.png',
        'assets/images/objects/landmarks/new_york/ny_hotdog_stand_v1.png',
        'assets/images/objects/landmarks/new_york/ny_fire_hydrant_v1.png'
    ],
    cairo: ['assets/images/objects/landmarks/cairo/pyramid_v1.png', 'assets/images/objects/landmarks/cairo/pyramid_v2.png']
};

const BASE_LIBRARY: DecorLibrary = {
    clouds: {
        layer: 'far',
        speedFactor: 0.3,
        spawnChance: 0.4,
        paths: [
            'assets/images/objects/nature/clouds_objects/cloud_small_1_v1.png',
            'assets/images/objects/nature/clouds_objects/cloud_small_1_v2.png',
            'assets/images/objects/nature/clouds_objects/cloud_small_1_v3.png',
            'assets/images/objects/nature/clouds_objects/cloud_medium_1_v1.png',
            'assets/images/objects/nature/clouds_objects/cloud_medium_1_v2.png',
            'assets/images/objects/nature/clouds_objects/cloud_large_1_v1.png',
            'assets/images/objects/nature/clouds_objects/cloud_large_1_v2.png',
            'assets/images/objects/nature/clouds_objects/cloud_wispy_v1.png',
            'assets/images/objects/nature/clouds_objects/cloud_wispy_v2.png'
        ],
        scale: { min: 0.8, max: 1.5 },
        alpha: { min: 0.4, max: 0.7 }
    },
    birds: {
        layer: 'mid',
        speedFactor: 0.6,
        spawnChance: 0.15,
        paths: [
            'assets/images/objects/nature/birds/bird_single_v1.png',
            'assets/images/objects/nature/birds/bird_single_v2.png',
            'assets/images/objects/nature/birds/bird_single_v3.png',
            'assets/images/objects/nature/birds/bird_seagull_v1.png',
            'assets/images/objects/nature/birds/bird_seagull_v2.png',
            'assets/images/objects/nature/birds/bird_flock_small_v1.png',
            'assets/images/objects/nature/birds/bird_flock_small_v2.png'
        ],
        scale: { min: 0.5, max: 1.0 },
        alpha: { min: 0.6, max: 0.9 },
        animation: 'flap'
    },
    balloons: {
        layer: 'mid',
        speedFactor: 0.5,
        spawnChance: 0.1,
        paths: [
            'assets/images/objects/vehicles/air/balloon_hot_air_v1.png',
            'assets/images/objects/vehicles/air/balloon_hot_air_v2.png',
            'assets/images/objects/vehicles/air/balloon_hot_air_v3.png',
            'assets/images/objects/vehicles/air/balloon_party_v1.png',
            'assets/images/objects/vehicles/air/balloon_party_v2.png',
            'assets/images/objects/vehicles/air/balloon_party_v3.png'
        ],
        scale: { min: 0.6, max: 1.2 },
        alpha: { min: 0.7, max: 1.0 },
        animation: 'float'
    },
    trees: {
        layer: 'ground',
        speedFactor: 1.2,
        spawnChance: 0.2,
        paths: [
            'assets/images/objects/nature/trees/tree_evergreen_v1.png',
            'assets/images/objects/nature/trees/tree_evergreen_v2.png',
            'assets/images/objects/nature/trees/tree_palm_v1.png',
            'assets/images/objects/nature/trees/tree_palm_v2.png',
            'assets/images/objects/nature/trees/tree_cherry_blossom_v1.png',
            'assets/images/objects/nature/trees/tree_autumn_v1.png'
        ],
        scale: { min: 0.4, max: 0.8 },
        alpha: { min: 0.5, max: 0.8 },
        yOffset: 'ground'
    }
};

function normalizeLocationKey(raw: string): string {
    const key = raw
        .trim()
        .toLowerCase()
        .replace(/\./g, '')
        .replace(/\s+/g, '_')
        .replace(/__+/g, '_');

    const mapping: Record<string, string> = {
        rio_de_janeiro: 'rio',
        rio: 'rio',
        new_york: 'new_york',
        mexico_city: 'mexico_city',
        hong_kong: 'hong_kong'
    };

    return mapping[key] ?? key;
}

function pickRandom<T>(values: T[]): T | null {
    if (values.length === 0) return null;
    return values[Math.floor(Math.random() * values.length)] ?? null;
}

function getDepthForLayer(layer: DecorLayer): number {
    switch (layer) {
        case 'far':
            return 3;
        case 'ground':
            return 4;
        case 'mid':
            return 6;
    }
}

export function getDecorTextureKey(path: string): string {
    return `decor-${path.replace(/[^a-z0-9]+/gi, '-').replace(/(^-+|-+$)/g, '').toLowerCase()}`;
}

export function getDecorAssetEntries(location: string): Array<{ key: string; path: string }> {
    const locationKey = normalizeLocationKey(location);
    const entries: Array<{ key: string; path: string }> = [];

    const basePaths = Object.values(BASE_LIBRARY).flatMap((config) => config.paths);
    for (const path of basePaths) {
        entries.push({ key: getDecorTextureKey(path), path });
    }

    const landmarks = LANDMARK_SETS[locationKey];
    if (landmarks) {
        for (const path of landmarks) {
            entries.push({ key: getDecorTextureKey(path), path });
        }
    }

    return entries;
}

function createDecorLibrary(location: string): DecorLibrary {
    const locationKey = normalizeLocationKey(location);
    const library: DecorLibrary = { ...BASE_LIBRARY };

    const landmarks = LANDMARK_SETS[locationKey];
    if (landmarks) {
        library.landmarks = {
            layer: 'ground',
            speedFactor: 1.0,
            spawnChance: 0.08,
            paths: landmarks,
            scale: { min: 0.5, max: 1.0 },
            alpha: { min: 0.6, max: 0.9 },
            yOffset: 'ground'
        };
    }

    return library;
}

export class BackgroundDecorSystem {
    private readonly scene: Phaser.Scene;
    private readonly objectLibrary: DecorLibrary;
    private readonly active: DecorObject[] = [];
    private readonly inactive: Phaser.GameObjects.Sprite[] = [];

    private spawnTimer = 0;
    private spawnInterval = 2.0;

    constructor(scene: Phaser.Scene, params: { location: string }) {
        this.scene = scene;
        this.objectLibrary = createDecorLibrary(params.location);
    }

    setSpawnRate(intervalSeconds: number): void {
        this.spawnInterval = Math.max(0.5, intervalSeconds);
    }

    clear(): void {
        for (const obj of this.active) {
            obj.sprite.setActive(false).setVisible(false);
            this.inactive.push(obj.sprite);
        }
        this.active.length = 0;
        this.spawnTimer = 0;
    }

    update(dt: number, baseSpeed: number): void {
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.trySpawnObject();
        }

        for (let i = this.active.length - 1; i >= 0; i -= 1) {
            const obj = this.active[i];
            obj.sprite.x -= baseSpeed * obj.speedFactor * dt;
            obj.animationTimer += dt;

            if (obj.animation === 'float') {
                obj.sprite.y = obj.baseY + Math.sin(obj.animationTimer * 2 + obj.oscillationPhase) * obj.floatAmplitude;
            } else if (obj.animation === 'flap') {
                const flapScale = 1 + Math.sin(obj.animationTimer * 8 + obj.oscillationPhase) * 0.05;
                obj.sprite.setScale(obj.baseScale * flapScale);
            } else {
                obj.sprite.setScale(obj.baseScale);
            }

            if (obj.sprite.x + obj.sprite.displayWidth < 0) {
                obj.sprite.setActive(false).setVisible(false);
                this.inactive.push(obj.sprite);
                this.active.splice(i, 1);
            }
        }
    }

    private trySpawnObject(): void {
        const eligibleTypes = Object.keys(this.objectLibrary).filter((type) => {
            const config = this.objectLibrary[type];
            return Boolean(config) && Math.random() < config.spawnChance;
        });

        const pickedType = pickRandom(eligibleTypes);
        if (!pickedType) return;
        this.spawnObject(pickedType);
    }

    private spawnObject(type: string): void {
        const config = this.objectLibrary[type];
        if (!config) return;

        const chosenPath = pickRandom(config.paths);
        if (!chosenPath) return;

        const textureKey = getDecorTextureKey(chosenPath);
        if (!this.scene.textures.exists(textureKey)) {
            return;
        }

        const sprite = this.inactive.pop() ?? this.scene.add.sprite(0, 0, textureKey);
        sprite.setTexture(textureKey);
        sprite.setActive(true).setVisible(true);

        const scale = config.scale.min + Math.random() * (config.scale.max - config.scale.min);
        const alpha = config.alpha.min + Math.random() * (config.alpha.max - config.alpha.min);

        let y: number;
        if (config.yOffset === 'ground') {
            sprite.setOrigin(0.5, 1);
            y = GAME_HEIGHT - 14;
        } else {
            sprite.setOrigin(0.5, 0.5);
            y = Math.random() * (GAME_HEIGHT * 0.7);
        }

        const x = GAME_WIDTH + 80 + Math.random() * 380;

        sprite.setPosition(x, y);
        sprite.setAlpha(alpha);
        sprite.setDepth(getDepthForLayer(config.layer));
        sprite.setScale(scale);

        const animation = config.animation ?? null;

        this.active.push({
            sprite,
            speedFactor: config.speedFactor,
            animation,
            animationTimer: 0,
            oscillationPhase: Math.random() * Math.PI * 2,
            baseY: y,
            baseScale: scale,
            floatAmplitude: animation === 'float' ? 6 + Math.random() * 10 : 0
        });
    }
}

