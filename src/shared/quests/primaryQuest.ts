import { worldStateManager } from '../systems/worldStateManager';
import { missionManager } from './missionManager';
import { QuestStatus, type Quest } from './quest';

export function getPrimaryQuest(): Quest | null {
    worldStateManager.initialize();
    const session = worldStateManager.getActiveMissionSession();
    const missionQuestId = session?.missionQuestId ?? null;

    if (missionQuestId) {
        const quest = missionManager.getQuest(missionQuestId);
        if (quest && quest.status !== QuestStatus.COMPLETED && quest.status !== QuestStatus.ABANDONED) {
            return quest;
        }
    }

    return missionManager.getActiveMainQuest();
}

