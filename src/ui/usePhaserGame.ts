import React from 'react';
import type Phaser from 'phaser';

import { createPhaserGame, type InitialPhaserParams } from '../game/phaser/config/phaserConfig';

function setInitialRegistry(game: Phaser.Game, initial: InitialPhaserParams): void {
    game.registry.set('game:mode', initial.mode);
    if (initial.mode === 'flight') {
        game.registry.set('flight:init', initial.flight);
    } else {
        game.registry.set('exploration:init', initial.exploration);
    }
}

function restartFromBoot(game: Phaser.Game, initial: InitialPhaserParams): void {
    setInitialRegistry(game, initial);

    const activeSceneKeys = game.scene.getScenes(true).map((scene) => scene.scene.key);
    for (const key of activeSceneKeys) {
        if (key === 'UIScene') continue;
        game.scene.stop(key);
    }

    game.scene.start('BootScene');
}

export function usePhaserGame(
    parentRef: React.RefObject<HTMLDivElement | null>,
    enabled: boolean,
    initial?: InitialPhaserParams
): void {
    const gameRef = React.useRef<Phaser.Game | null>(null);
    const initialKeyRef = React.useRef<string | null>(null);

    const buildInitialKey = React.useCallback((value: InitialPhaserParams | undefined): string | null => {
        if (!value) return null;
        if (value.mode === 'flight') {
            return `flight:${value.flight.charId}:${value.flight.missionId ?? ''}:${value.flight.missionType}:${value.flight.location ?? ''}`;
        }
        return `exploration:${value.exploration.charId}:${value.exploration.startLocationId ?? ''}:${value.exploration.spawnPoint ?? ''}`;
    }, []);

    React.useEffect(() => {
        const parent = parentRef.current;
        if (!parent) return;

        return () => {
            gameRef.current?.destroy(true);
            gameRef.current = null;
            initialKeyRef.current = null;

            while (parent.firstChild) {
                parent.removeChild(parent.firstChild);
            }
        };
    }, [parentRef]);

    React.useEffect(() => {
        const parent = parentRef.current;
        if (!parent) return;
        const nextKey = buildInitialKey(initial);

        if (!enabled) {
            if (!gameRef.current) return;
            gameRef.current.destroy(true);
            gameRef.current = null;
            initialKeyRef.current = null;
            while (parent.firstChild) {
                parent.removeChild(parent.firstChild);
            }
            return;
        }

        if (!gameRef.current) {
            gameRef.current = createPhaserGame(parent, initial);
            initialKeyRef.current = nextKey;
            return;
        }

        if (nextKey && initialKeyRef.current !== nextKey) {
            try {
                restartFromBoot(gameRef.current, initial as InitialPhaserParams);
                initialKeyRef.current = nextKey;
                return;
            } catch (err) {
                console.warn('[phaser] restart failed; recreating game', err);
            }

            gameRef.current.destroy(true);
            gameRef.current = null;
            while (parent.firstChild) parent.removeChild(parent.firstChild);
            gameRef.current = createPhaserGame(parent, initial);
            initialKeyRef.current = nextKey;
        }
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
        buildInitialKey,
        parentRef
    ]);
}
