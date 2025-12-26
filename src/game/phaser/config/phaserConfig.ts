import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';
import { ArrivalScene } from '../scenes/ArrivalScene';
import { BaseLocationScene } from '../scenes/BaseLocationScene';
import { BootScene } from '../scenes/BootScene';
import { ExplorationScene } from '../scenes/ExplorationScene';
import { FlightScene } from '../scenes/FlightScene';
import { LandingScene } from '../scenes/LandingScene';
import { LaunchScene } from '../scenes/LaunchScene';
import { TransformationScene } from '../scenes/TransformationScene';
import { UIScene } from '../scenes/UIScene';
import { WarehouseLocationScene } from '../scenes/WarehouseLocationScene';
import { WorldScene } from '../scenes/WorldScene';

export type InitialFlightParams = {
    missionType: string;
    charId: string;
    missionId?: string;
    location?: string;
};

export type InitialExplorationParams = {
    charId: string;
    startLocationId?: string;
    spawnPoint?: string;
};

export type InitialPhaserParams =
    | { mode: 'flight'; flight: InitialFlightParams }
    | { mode: 'exploration'; exploration: InitialExplorationParams };

export function createPhaserGame(parent: HTMLElement, initial?: InitialPhaserParams): Phaser.Game {
    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent,
        backgroundColor: '#000000',
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: GAME_WIDTH,
            height: GAME_HEIGHT
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { x: 0, y: 0 },
                debug: false
            }
        },
        callbacks: {
            preBoot: (game) => {
                if (initial) {
                    game.registry.set('game:mode', initial.mode);
                    if (initial.mode === 'flight') {
                        game.registry.set('flight:init', initial.flight);
                    } else {
                        game.registry.set('exploration:init', initial.exploration);
                    }
                }
            }
        },
        scene: [
            BootScene,
            LaunchScene,
            FlightScene,
            ArrivalScene,
            TransformationScene,
            LandingScene,
            ExplorationScene,
            WorldScene,
            BaseLocationScene,
            WarehouseLocationScene,
            UIScene
        ]
    };

    return new Phaser.Game(config);
}
