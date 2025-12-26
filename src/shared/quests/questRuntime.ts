import { missionManager } from './missionManager.js';
import { createQuestFromTemplate } from './questTemplateFactory.js';
import { worldStateManager } from '../systems/worldStateManager.js';
import { getQuestTemplate } from '../data/gameData.js';

export async function startQuestFromTemplate(templateId: string, options: { actorId: string; type?: 'main' | 'sub' } ): Promise<string> {
    const actorId = options.actorId;

    await missionManager.initialize({ mainCharacter: actorId });
    worldStateManager.initialize();

    const template = getQuestTemplate(templateId);
    if (!template) {
        throw new Error(`[QuestRuntime] Unknown quest template: ${templateId}`);
    }

    const type = options.type ?? (template.type === 'main' ? 'main' : 'sub');

    if (!template.repeatable && worldStateManager.isQuestTemplateCompleted(templateId)) {
        throw new Error(`[QuestRuntime] Quest template is not repeatable: ${templateId}`);
    }

    for (const flag of template.prerequisites.requiredWorldFlags ?? []) {
        if (!worldStateManager.hasWorldFlag(flag)) {
            throw new Error(`[QuestRuntime] Missing prerequisite world flag: ${flag}`);
        }
    }

    for (const requiredTemplate of template.prerequisites.completedQuestTemplates ?? []) {
        if (!worldStateManager.isQuestTemplateCompleted(requiredTemplate)) {
            throw new Error(`[QuestRuntime] Missing prerequisite quest completion: ${requiredTemplate}`);
        }
    }

    // Avoid creating duplicates if an unfinished instance already exists in the save.
    const existing = Array.from(missionManager.quests.values()).find(
        (q) => q.templateId === templateId && q.status !== 'completed' && q.status !== 'abandoned'
    );
    if (existing) {
        if (existing.status === 'offered') {
            await missionManager.acceptQuest(existing.questId, { type, actorId });
        }
        return existing.questId;
    }

    const quest = createQuestFromTemplate(templateId, { actorId });
    missionManager.offerQuest(quest, { type });
    await missionManager.acceptQuest(quest.questId, { type, actorId });
    return quest.questId;
}
