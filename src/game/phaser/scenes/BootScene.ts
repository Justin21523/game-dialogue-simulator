import Phaser from 'phaser';

import { worldStateManager } from '../../../shared/systems/worldStateManager';

type FlightInit = {
    missionType?: string;
    charId?: string;
    missionId?: string;
    location?: string;
};

type ExplorationInit = {
    charId?: string;
    startLocationId?: string;
    spawnPoint?: string;
};

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    create() {
        const mode = (this.registry.get('game:mode') as string | undefined) ?? 'flight';

        if (mode === 'exploration') {
            worldStateManager.initialize();
            const init = this.registry.get('exploration:init') as ExplorationInit | undefined;
            const charId = init?.charId ?? 'jett';
            const last = worldStateManager.getLastPlayerState();
            const startLocationId = init?.startLocationId ?? last?.locationId ?? 'base_airport';
            const spawnPoint = init?.spawnPoint ?? last?.spawnPoint ?? 'default';

            this.scene.start('WorldScene', { charId, locationId: startLocationId, spawnPoint });
            this.scene.launch('UIScene');
            return;
        }

        const init = this.registry.get('flight:init') as FlightInit | undefined;
        const missionType = init?.missionType ?? 'Delivery';
        const charId = init?.charId ?? 'jett';
        const missionId = init?.missionId ?? 'm_local';
        const location = init?.location ?? 'world_airport';

        this.scene.start('LaunchScene', { missionType, charId, missionId, location });
        this.scene.launch('UIScene');
    }
}
