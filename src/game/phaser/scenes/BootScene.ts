import Phaser from 'phaser';

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
            const init = this.registry.get('exploration:init') as ExplorationInit | undefined;
            const charId = init?.charId ?? 'jett';
            const startLocationId = init?.startLocationId ?? 'base_airport';
            const spawnPoint = init?.spawnPoint ?? 'default';

            const startSceneKey = startLocationId === 'warehouse_district' ? 'WarehouseLocationScene' : 'BaseLocationScene';
            this.scene.start(startSceneKey, { charId, spawnPoint });
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
