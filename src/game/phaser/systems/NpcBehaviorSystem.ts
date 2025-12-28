import type Phaser from 'phaser';

import type { NpcDefinition, NpcPatrolPoint } from '../../../shared/types/World';

export type SpawnedNpc = {
    npcId: string;
    def: NpcDefinition;
    sprite: Phaser.Physics.Arcade.Sprite;
    label: Phaser.GameObjects.Text;
    baseY: number;
    dir: -1 | 1;
    pathIndex: number;
    waitUntilMs: number;
    rng: number;
    idleAnimation: NpcDefinition['idleAnimation'];
};

export class NpcBehaviorSystem {
    update(npcs: SpawnedNpc[], timeMs: number, dt: number): void {
        for (const npc of npcs) {
            this.updateSingle(npc, timeMs, dt);
            npc.sprite.setDepth(Math.floor(npc.sprite.y) + 2);
            npc.label.setPosition(npc.sprite.x, npc.sprite.y - npc.sprite.displayHeight - 10);
        }
    }

    private updateSingle(npc: SpawnedNpc, timeMs: number, dt: number): void {
        const path = npc.def.patrolPath;
        if (path && path.points.length > 0) {
            if (npc.waitUntilMs > timeMs) return;

            const current = path.points[npc.pathIndex] ?? path.points[0];
            const targetX = current.x;
            const targetY = typeof current.y === 'number' && Number.isFinite(current.y) ? current.y : npc.baseY;
            const dx = targetX - npc.sprite.x;
            const dy = targetY - npc.baseY;
            const dir = dx < 0 ? -1 : 1;
            npc.dir = dir;
            npc.sprite.setFlipX(dir < 0);

            const move = Math.min(Math.abs(dx), path.speed * dt);
            npc.sprite.x += dir * move;

            if (Math.abs(dy) > 0.5) {
                const stepY = Math.min(Math.abs(dy), path.speed * dt * 0.35);
                npc.baseY += Math.sign(dy) * stepY;
            } else {
                npc.baseY = targetY;
            }

            if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) {
                npc.sprite.x = targetX;
                npc.baseY = targetY;

                const waitMs = resolveWaitMs(npc, current);
                npc.waitUntilMs = timeMs + waitMs;
                npc.pathIndex = (npc.pathIndex + 1) % path.points.length;
            }

            this.applyIdle(npc, timeMs);
            return;
        }

        const legacy = npc.def.patrol;
        if (!legacy) return;

        npc.sprite.x += npc.dir * legacy.speed * dt;
        if (npc.sprite.x > legacy.maxX) npc.dir = -1;
        if (npc.sprite.x < legacy.minX) npc.dir = 1;
        npc.sprite.setFlipX(npc.dir < 0);

        this.applyIdle(npc, timeMs);
    }

    private applyIdle(npc: SpawnedNpc, timeMs: number): void {
        const idle = npc.idleAnimation ?? npc.def.idleAnimation ?? 'none';
        if (idle === 'bob') {
            npc.sprite.y = npc.baseY + Math.sin(timeMs / 500) * 3;
        } else if (idle === 'bob_slow') {
            npc.sprite.y = npc.baseY + Math.sin(timeMs / 900) * 2.25;
        } else if (idle === 'bob_fast') {
            npc.sprite.y = npc.baseY + Math.sin(timeMs / 320) * 3.8;
        } else {
            npc.sprite.y = npc.baseY;
        }
    }
}

function nextRng(npc: SpawnedNpc): number {
    let x = npc.rng >>> 0;
    if (x === 0) x = 0x9e3779b9;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    npc.rng = x;
    return x;
}

function randBetween(npc: SpawnedNpc, min: number, max: number): number {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    if (b <= a) return a;
    const r = nextRng(npc) / 4294967296;
    return Math.floor(r * (b - a + 1)) + a;
}

function resolveWaitMs(npc: SpawnedNpc, point: NpcPatrolPoint): number {
    if (typeof point.waitMs === 'number' && Number.isFinite(point.waitMs)) {
        return Math.max(0, Math.floor(point.waitMs));
    }

    const min = typeof point.waitMsMin === 'number' && Number.isFinite(point.waitMsMin) ? Math.max(0, Math.floor(point.waitMsMin)) : null;
    const max = typeof point.waitMsMax === 'number' && Number.isFinite(point.waitMsMax) ? Math.max(0, Math.floor(point.waitMsMax)) : null;
    if (min === null || max === null) return 0;
    return randBetween(npc, min, Math.max(min, max));
}
