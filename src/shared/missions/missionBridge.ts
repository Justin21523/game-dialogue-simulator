import { getLocation } from '../data/gameData';
import type { Mission } from '../types/Game';

export type MissionQuestBridge = {
    questTemplateId: string;
    startLocationId: string;
    spawnPoint: string;
};

const DEFAULT_BRIDGE: MissionQuestBridge = {
    questTemplateId: 'qt_repair_relay_field',
    startLocationId: 'warehouse_district',
    spawnPoint: 'entry'
};

function pickValidSpawnPoint(locationId: string, preferred: string | null): string {
    const loc = getLocation(locationId);
    if (!loc) return DEFAULT_BRIDGE.spawnPoint;

    const spawnPoints = loc.spawnPoints ?? {};
    if (preferred && preferred in spawnPoints) return preferred;
    if (DEFAULT_BRIDGE.spawnPoint in spawnPoints) return DEFAULT_BRIDGE.spawnPoint;
    if ('default' in spawnPoints) return 'default';

    const first = Object.keys(spawnPoints)[0];
    return first ?? 'default';
}

export function resolveMissionQuestBridge(mission: Mission | null | undefined): MissionQuestBridge {
    const questTemplateId =
        typeof mission?.questTemplateId === 'string' && mission.questTemplateId.trim().length > 0 ? mission.questTemplateId : DEFAULT_BRIDGE.questTemplateId;

    const candidateLocation =
        typeof mission?.explorationStartLocationId === 'string' && mission.explorationStartLocationId.trim().length > 0
            ? mission.explorationStartLocationId
            : DEFAULT_BRIDGE.startLocationId;

    const startLocationId = getLocation(candidateLocation) ? candidateLocation : DEFAULT_BRIDGE.startLocationId;

    const preferredSpawn =
        typeof mission?.explorationSpawnPoint === 'string' && mission.explorationSpawnPoint.trim().length > 0 ? mission.explorationSpawnPoint : null;
    const spawnPoint = pickValidSpawnPoint(startLocationId, preferredSpawn);

    return { questTemplateId, startLocationId, spawnPoint };
}

