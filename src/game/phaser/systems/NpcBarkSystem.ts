import type Phaser from 'phaser';

import { isDialogueConditionMet } from '../../../shared/dialogue/conditionEvaluator';
import type { DialogueLine } from '../../../shared/types/Dialogue';
import type { SpawnedNpc } from './NpcBehaviorSystem';

type BarkState = {
    wasNear: boolean;
    nextAtMs: number;
    text: Phaser.GameObjects.Text | null;
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
            const lines = npc.def.barks ?? [];
            if (lines.length === 0) continue;

            const state = this.ensureState(npc.sprite, timeMs);
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
                state.nextAtMs = timeMs + randBetween(1800, 4600);
                continue;
            }

            if (state.text) continue;
            if (timeMs < state.nextAtMs) continue;

            const visible = lines.filter(isLineVisible);
            if (visible.length === 0) continue;
            const picked = visible[randBetween(0, visible.length - 1)];
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

            state.nextAtMs = timeMs + randBetween(9000, 16000);
        }
    }

    private ensureState(sprite: Phaser.GameObjects.Sprite, timeMs: number): BarkState {
        const existing = this.states.get(sprite);
        if (existing) return existing;
        const state: BarkState = {
            wasNear: false,
            nextAtMs: timeMs + randBetween(4000, 9000),
            text: null
        };
        this.states.set(sprite, state);
        return state;
    }
}

function randBetween(min: number, max: number): number {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
}

