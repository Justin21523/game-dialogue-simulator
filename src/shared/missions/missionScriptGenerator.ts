import { getQuestTemplate } from '../data/gameData';
import { worldStateManager } from '../systems/worldStateManager';
import type { Mission } from '../types/Game';
import { generateLocalMissions } from '../missionGenerator';

import { listMissionScripts, type MissionScript } from './missionScripts';

function isQuestTemplateAvailable(templateId: string): boolean {
    const template = getQuestTemplate(templateId);
    if (!template) return false;

    worldStateManager.initialize();

    if (!template.repeatable && worldStateManager.isQuestTemplateCompleted(templateId)) {
        return false;
    }

    for (const flag of template.prerequisites.requiredWorldFlags ?? []) {
        if (!worldStateManager.hasWorldFlag(flag)) return false;
    }

    for (const requiredTemplate of template.prerequisites.completedQuestTemplates ?? []) {
        if (!worldStateManager.isQuestTemplateCompleted(requiredTemplate)) return false;
    }

    return true;
}

export function listAvailableMissionScripts(): MissionScript[] {
    const scripts = listMissionScripts();
    return scripts.filter((s) => isQuestTemplateAvailable(s.questTemplateId));
}

function createMissionFromScript(script: MissionScript): Mission {
    return {
        id: `${script.scriptId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: script.title,
        type: script.missionType,
        description: script.description,
        location: script.locationName,
        fuelCost: script.fuelCost,
        rewardMoney: script.rewards.money,
        rewardExp: script.rewards.exp,
        campaignId: null,
        campaignTheme: null,
        missionScriptId: script.scriptId,
        questTemplateId: script.questTemplateId,
        explorationStartLocationId: script.explorationStart.locationId,
        explorationSpawnPoint: script.explorationStart.spawnPoint
    };
}

export function generateScriptMissions(count = 15, fallbackLevel = 1): Mission[] {
    const available = listAvailableMissionScripts();
    if (available.length === 0) {
        return generateLocalMissions(count, fallbackLevel);
    }

    const missions: Mission[] = [];
    for (let i = 0; i < count; i += 1) {
        const script = available[Math.floor(Math.random() * available.length)];
        if (!script) break;
        missions.push(createMissionFromScript(script));
    }
    return missions;
}
