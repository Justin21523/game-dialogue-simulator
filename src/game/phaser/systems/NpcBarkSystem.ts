import type Phaser from 'phaser';

import { isDialogueConditionMet } from '../../../shared/dialogue/conditionEvaluator';
import type { DialogueLine } from '../../../shared/types/Dialogue';
import type { SpawnedNpc } from './NpcBehaviorSystem';

type BarkState = {
    wasNear: boolean;
    nextAtMs: number;
    text: Phaser.GameObjects.Text | null;
    rng: number;
};

function getLineText(line: DialogueLine): string {
    return typeof line === 'string' ? line : line.text;
}

function isLineVisible(line: DialogueLine): boolean {
    if (typeof line === 'string') return true;
    return isDialogueConditionMet(line.if);
}

export class NpcBarkSystem {
    private readonly states = new WeakMap<Phaser.GameObjects.Sprite, BarkState>();

    update(
        scene: Phaser.Scene,
        npcs: SpawnedNpc[],
        player: Phaser.GameObjects.Sprite,
        timeMs: number,
        isUiLocked: boolean
    ): void {
        for (const npc of npcs) {
            const barkConfig = npc.def.barks;
            const lines = barkConfig?.lines ?? [];
            if (lines.length === 0) continue;

            const state = this.ensureState(npc.sprite, npc.npcId, timeMs);
            if (state.text) {
                state.text.setX(npc.sprite.x);
                if (!state.text.active) {
                    state.text = null;
                }
            }

            if (isUiLocked) {
                state.wasNear = false;
                continue;
            }

            const dx = player.x - npc.sprite.x;
            const dy = player.y - npc.sprite.y;
            const dist = Math.hypot(dx, dy);
            const radius = Math.max(240, (npc.def.interactionRadius ?? 160) + 60);
            const isNear = dist <= radius;

            if (!isNear) {
                state.wasNear = false;
                continue;
            }

            if (!state.wasNear) {
                state.wasNear = true;
                const minDelay = barkConfig?.initialDelayMsMin ?? 1800;
                const maxDelay = barkConfig?.initialDelayMsMax ?? 4600;
                state.nextAtMs = timeMs + randBetween(state, minDelay, maxDelay);
                continue;
            }

            if (state.text) continue;
            if (timeMs < state.nextAtMs) continue;

            const chance = typeof barkConfig?.chance === 'number' ? Math.min(1, Math.max(0, barkConfig.chance)) : 0.62;
            if (chance < 1 && randFloat(state) > chance) {
                state.nextAtMs = timeMs + randBetween(state, 1200, 2400);
                continue;
            }

            const visible = lines.filter(isLineVisible);
            if (visible.length === 0) continue;
            const picked = visible[randBetween(state, 0, visible.length - 1)];
            const text = getLineText(picked).trim();
            if (!text) continue;

            const bubble = scene.add
                .text(npc.sprite.x, npc.sprite.y - npc.sprite.displayHeight - 24, text, {
                    fontFamily: 'Segoe UI, system-ui, sans-serif',
                    fontSize: '18px',
                    fontStyle: '800',
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 6
                })
                .setOrigin(0.5, 1)
                .setDepth(2600)
                .setAlpha(0);

            state.text = bubble;

            scene.tweens.add({
                targets: bubble,
                alpha: 1,
                duration: 160,
                ease: 'Linear'
            });

            scene.tweens.add({
                targets: bubble,
                y: bubble.y - 26,
                alpha: 0,
                duration: 2200,
                delay: 900,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    bubble.destroy();
                    const current = this.states.get(npc.sprite);
                    if (current && current.text === bubble) {
                        current.text = null;
                    }
                }
            });

            const minCooldown = barkConfig?.cooldownMsMin ?? 9000;
            const maxCooldown = barkConfig?.cooldownMsMax ?? 16000;
            state.nextAtMs = timeMs + randBetween(state, minCooldown, maxCooldown);
        }
    }

    private ensureState(sprite: Phaser.GameObjects.Sprite, npcId: string, timeMs: number): BarkState {
        const existing = this.states.get(sprite);
        if (existing) return existing;
        const seed = hashString32(`npc-bark:${npcId}`);
        const state: BarkState = {
            wasNear: false,
            nextAtMs: timeMs + randBetweenSeed(seed, 4000, 9000),
            text: null,
            rng: seed || 0x9e3779b9
        };
        this.states.set(sprite, state);
        return state;
    }
}

function hashString32(input: string): number {
    // FNV-1a 32-bit
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
        hash >>>= 0;
    }
    return hash >>> 0;
}

function nextRng(state: BarkState): number {
    let x = state.rng >>> 0;
    if (x === 0) x = 0x9e3779b9;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    state.rng = x;
    return x;
}

function randFloat(state: BarkState): number {
    return nextRng(state) / 4294967296;
}

function randBetween(state: BarkState, min: number, max: number): number {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    if (b <= a) return a;
    return Math.floor(randFloat(state) * (b - a + 1)) + a;
}

function randBetweenSeed(seed: number, min: number, max: number): number {
    const x = seed >>> 0;
    const a = Math.ceil(min);
    const b = Math.floor(max);
    if (b <= a) return a;
    return a + (x % (b - a + 1));
}
