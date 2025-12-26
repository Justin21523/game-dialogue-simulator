import React from 'react';
import type Phaser from 'phaser';

import { createPhaserGame, type InitialPhaserParams } from '../game/phaser/config/phaserConfig';

export function usePhaserGame(
    parentRef: React.RefObject<HTMLDivElement | null>,
    enabled: boolean,
    initial?: InitialPhaserParams
): void {
    const gameRef = React.useRef<Phaser.Game | null>(null);

    React.useEffect(() => {
        const parent = parentRef.current;
        if (!parent) return;

        return () => {
            gameRef.current?.destroy(true);
            gameRef.current = null;

            while (parent.firstChild) {
                parent.removeChild(parent.firstChild);
            }
        };
    }, [parentRef]);

    React.useEffect(() => {
        const parent = parentRef.current;
        if (!parent) return;
        if (!enabled) {
            if (!gameRef.current) return;
            gameRef.current.destroy(true);
            gameRef.current = null;
            while (parent.firstChild) {
                parent.removeChild(parent.firstChild);
            }
            return;
        }

        if (gameRef.current) return;
        gameRef.current = createPhaserGame(parent, initial);
    }, [
        enabled,
        initial?.mode,
        initial && initial.mode === 'flight' ? initial.flight.charId : undefined,
        initial && initial.mode === 'flight' ? initial.flight.missionId : undefined,
        initial && initial.mode === 'flight' ? initial.flight.missionType : undefined,
        initial && initial.mode === 'flight' ? initial.flight.location : undefined,
        initial && initial.mode === 'exploration' ? initial.exploration.charId : undefined,
        initial && initial.mode === 'exploration' ? initial.exploration.startLocationId : undefined,
        initial && initial.mode === 'exploration' ? initial.exploration.spawnPoint : undefined,
        parentRef
    ]);
}
