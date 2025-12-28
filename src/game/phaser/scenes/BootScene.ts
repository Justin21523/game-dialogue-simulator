import Phaser from 'phaser';

import { worldStateManager } from '../../../shared/systems/worldStateManager';
import type { MissionSessionPhaseId } from '../../../shared/types/World';

type FlightInit = {
    missionType?: string;
    charId?: string;
    missionId?: string;
    location?: string;
    resumePhaseId?: MissionSessionPhaseId;
};

type ExplorationInit = {
    charId?: string;
    startLocationId?: string;
    spawnPoint?: string;
    x?: number;
    y?: number;
    movementMode?: 'walk' | 'hover';
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
            const x = typeof init?.x === 'number' && Number.isFinite(init.x) ? init.x : last?.x;
            const y = typeof init?.y === 'number' && Number.isFinite(init.y) ? init.y : last?.y;
            const movementMode = init?.movementMode ?? last?.movementMode;

            this.scene.start('WorldScene', { charId, locationId: startLocationId, spawnPoint, x, y, movementMode });
            this.scene.launch('UIScene');
            return;
        }

        const init = this.registry.get('flight:init') as FlightInit | undefined;
        const missionType = init?.missionType ?? 'Delivery';
        const charId = init?.charId ?? 'jett';
        const missionId = init?.missionId ?? 'm_local';
        const location = init?.location ?? 'world_airport';

        const resumePhaseId = init?.resumePhaseId ?? null;
        const payload = { missionType, charId, missionId, location };

        if (resumePhaseId === 'flight') {
            this.scene.start('FlightScene', payload);
        } else if (resumePhaseId === 'arrival') {
            this.scene.start('ArrivalScene', payload);
        } else if (resumePhaseId === 'transform') {
            this.scene.start('TransformationScene', payload);
        } else if (resumePhaseId === 'landing') {
            this.scene.start('LandingScene', payload);
        } else {
            // Default flow begins at launch.
            this.scene.start('LaunchScene', payload);
        }
        this.scene.launch('UIScene');
    }
}
