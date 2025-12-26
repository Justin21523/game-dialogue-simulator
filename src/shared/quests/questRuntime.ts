import { missionManager } from './missionManager.js';
import { createQuestFromTemplate } from './questTemplateFactory.js';
import { worldStateManager } from '../systems/worldStateManager.js';

export async function startQuestFromTemplate(templateId: string, options: { actorId: string; type?: 'main' | 'sub' } ): Promise<string> {
    const type = options.type ?? 'main';
    const actorId = options.actorId;

    await missionManager.initialize({ mainCharacter: actorId });
    worldStateManager.initialize();

    const quest = createQuestFromTemplate(templateId, { actorId });
    missionManager.offerQuest(quest, { type });
    await missionManager.acceptQuest(quest.questId, { type, actorId });
    return quest.questId;
}
