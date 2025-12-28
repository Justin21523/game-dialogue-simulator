import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import type { ParallaxDefinition, ParallaxLayerDefinition } from '../../../shared/types/World';
import type { ParallaxAssetLayer } from '../themes/themeAssets';

function parseHexColor(hex: string, fallback: number): number {
    const normalized = hex.trim().replace(/^#/, '');
    if (!normalized) return fallback;
    const full = normalized.length === 3 ? normalized.split('').map((c) => `${c}${c}`).join('') : normalized;
    const value = Number.parseInt(full, 16);
    return Number.isFinite(value) ? value : fallback;
}

function normalizeAlpha(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(1, Math.max(0, value));
}

function ensurePatternTexture(scene: Phaser.Scene, key: string, layer: ParallaxLayerDefinition): void {
    if (scene.textures.exists(key)) return;

    const w = 512;
    const h = 512;
    const baseColor = parseHexColor(layer.color, 0x102236);
    const alpha = normalizeAlpha(layer.alpha, 1);

    const g = scene.add.graphics({ x: 0, y: 0 });
    g.fillStyle(baseColor, alpha);
    g.fillRect(0, 0, w, h);

    if (layer.kind === 'noise') {
        g.fillStyle(0xffffff, normalizeAlpha(layer.alpha, 0.08));
        for (let i = 0; i < 160; i += 1) {
            g.fillCircle(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), Phaser.Math.Between(2, 10));
        }
    }

    if (layer.kind === 'stripes') {
        g.lineStyle(6, 0xffffff, normalizeAlpha(layer.alpha, 0.06));
        for (let x = -256; x < w * 2; x += 48) {
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x + 220, h);
            g.strokePath();
        }
    }

    g.generateTexture(key, w, h);
    g.destroy();
}

function getTextureKey(locationId: string, layer: ParallaxLayerDefinition): string {
    const alpha = typeof layer.alpha === 'number' ? Math.round(layer.alpha * 100) : 100;
    const color = layer.color.replace('#', '').toLowerCase();
    return `parallax:${locationId}:${layer.id}:${layer.kind}:${color}:${alpha}`;
}

export class ParallaxSystem {
    private readonly scene: Phaser.Scene;
    private sprites: Phaser.GameObjects.TileSprite[] = [];
    private layers: ParallaxLayerDefinition[] = [];
    private assetLayers: ParallaxAssetLayer[] = [];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    create(locationId: string, def: ParallaxDefinition | undefined, worldWidth: number, assets?: ParallaxAssetLayer[] | null): void {
        this.destroy();

        const assetLayers = (assets ?? []).filter((layer) => Boolean(layer) && this.scene.textures.exists(layer.textureKey));
        if (assetLayers.length > 0) {
            this.assetLayers = assetLayers;
            this.createAssetLayers(assetLayers);
            return;
        }

        const layers = def?.layers?.length ? def.layers : this.getDefaultLayers();
        this.layers = layers;

        // TileSprites are screen-sized and move via tilePositionX for performance.
        for (let i = 0; i < layers.length; i += 1) {
            const layer = layers[i];
            const textureKey = getTextureKey(locationId, layer);
            ensurePatternTexture(this.scene, textureKey, layer);

            const sprite = this.scene.add
                .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, textureKey)
                .setOrigin(0, 0)
                .setScrollFactor(0)
                .setDepth(i);

            // In addition to tilePosition, optionally add slight tinting/alpha.
            const a = normalizeAlpha(layer.alpha, 1);
            sprite.setAlpha(a);

            this.sprites.push(sprite);
        }

        void worldWidth;
    }

    update(camera: Phaser.Cameras.Scene2D.Camera): void {
        if (this.assetLayers.length > 0) {
            for (let i = 0; i < this.sprites.length; i += 1) {
                const sprite = this.sprites[i];
                const layer = this.assetLayers[i];
                sprite.tilePositionX = camera.scrollX * layer.speed;
            }
            return;
        }

        for (let i = 0; i < this.sprites.length; i += 1) {
            const sprite = this.sprites[i];
            const layer = this.layers[i];
            sprite.tilePositionX = camera.scrollX * layer.speed;
        }
    }

    destroy(): void {
        for (const sprite of this.sprites) sprite.destroy();
        this.sprites = [];
        this.layers = [];
        this.assetLayers = [];
    }

    private getDefaultLayers(): ParallaxLayerDefinition[] {
        return [
            { id: 'sky', kind: 'solid', color: '#0b1c2c', alpha: 1, speed: 0 },
            { id: 'clouds', kind: 'noise', color: '#0b1c2c', alpha: 0.12, speed: 0.05 },
            { id: 'far', kind: 'stripes', color: '#102236', alpha: 0.08, speed: 0.12 },
            { id: 'near', kind: 'stripes', color: '#16405c', alpha: 0.1, speed: 0.22 }
        ];
    }

    private createAssetLayers(layers: ParallaxAssetLayer[]): void {
        for (let i = 0; i < layers.length; i += 1) {
            const layer = layers[i];
            const sprite = this.scene.add
                .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, layer.textureKey)
                .setOrigin(0, 0)
                .setScrollFactor(0)
                .setDepth(i);

            sprite.setAlpha(normalizeAlpha(layer.alpha, 1));
            this.sprites.push(sprite);
        }
    }
}
