import type Phaser from 'phaser';

import type { NpcDefinition } from '../../../shared/types/World';

export type SpawnedNpc = {
    npcId: string;
    def: NpcDefinition;
    sprite: Phaser.Physics.Arcade.Sprite;
    label: Phaser.GameObjects.Text;
    baseY: number;
    dir: -1 | 1;
    pathIndex: number;
    waitUntilMs: number;
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
        const idle = npc.def.idleAnimation ?? 'none';
        if (idle === 'bob') {
            npc.sprite.y = npc.baseY + Math.sin(timeMs / 500) * 3;
        } else if (idle === 'bob_slow') {
            npc.sprite.y = npc.baseY + Math.sin(timeMs / 900) * 2.25;
        } else if (idle === 'bob_fast') {
            npc.sprite.y = npc.baseY + Math.sin(timeMs / 320) * 3.8;
        } else {
            npc.sprite.y = npc.baseY;
        }

        const path = npc.def.patrolPath;
        if (path && path.points.length > 0) {
            if (npc.waitUntilMs > timeMs) return;

            const current = path.points[npc.pathIndex] ?? path.points[0];
            const targetX = current.x;
            const dx = targetX - npc.sprite.x;
            const dir = dx < 0 ? -1 : 1;
            npc.dir = dir;
            npc.sprite.setFlipX(dir < 0);

            const move = Math.min(Math.abs(dx), path.speed * dt);
            npc.sprite.x += dir * move;

            if (Math.abs(dx) <= 2) {
                npc.sprite.x = targetX;
                const waitMs = typeof current.waitMs === 'number' ? Math.max(0, current.waitMs) : 0;
                npc.waitUntilMs = timeMs + waitMs;
                npc.pathIndex = (npc.pathIndex + 1) % path.points.length;
            }
            return;
        }

        const legacy = npc.def.patrol;
        if (!legacy) return;

        npc.sprite.x += npc.dir * legacy.speed * dt;
        if (npc.sprite.x > legacy.maxX) npc.dir = -1;
        if (npc.sprite.x < legacy.minX) npc.dir = 1;
        npc.sprite.setFlipX(npc.dir < 0);
    }
}
