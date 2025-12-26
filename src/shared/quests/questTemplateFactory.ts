import { getQuestTemplate } from '../data/gameData.js';

import { ObjectiveType } from './objective.js';
import type { ObjectiveData } from './objective.js';
import { Quest, QuestStatus } from './quest.js';

function uniqueQuestId(templateId: string): string {
    return `${templateId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapStepTypeToObjectiveType(stepType: string): ObjectiveType {
    switch (stepType) {
        case 'talk':
            return ObjectiveType.TALK;
        case 'collect':
            return ObjectiveType.COLLECT;
        case 'go_to_location':
            return ObjectiveType.GO_TO_LOCATION;
        case 'fix_build':
            return ObjectiveType.FIX_BUILD;
        case 'investigate':
            return ObjectiveType.INVESTIGATE;
        case 'clear_manage':
            return ObjectiveType.CLEAR_MANAGE;
        case 'dig_recover':
            return ObjectiveType.DIG_RECOVER;
        default:
            return ObjectiveType.CUSTOM;
    }
}

export function createQuestFromTemplate(templateId: string, options: { questId?: string; actorId?: string } = {}): Quest {
    const template = getQuestTemplate(templateId);
    if (!template) {
        throw new Error(`[QuestTemplateFactory] Unknown quest template: ${templateId}`);
    }

    const questId = options.questId ?? uniqueQuestId(template.templateId);
    const actorId = options.actorId ?? 'jett';

    const objectives: ObjectiveData[] = template.steps.map((step: { id: string; type: string; title: string; requiredCount: number; conditions: Record<string, string>[] }) => ({
        id: step.id,
        type: mapStepTypeToObjectiveType(step.type),
        title: step.title,
        requiredCount: step.requiredCount,
        conditions: step.conditions
    }));

    const quest = new Quest({
        id: questId,
        questId,
        templateId: template.templateId,
        title: template.title,
        description: template.description,
        destination: template.destinationLocationId,
        type: template.type,
        status: QuestStatus.PENDING,
        objectives,
        rewards: { money: template.rewards.currency, exp: template.rewards.exp, items: [] },
        requirements: {
            minLevel: 1,
            prerequisiteQuests: template.prerequisites.completedQuestTemplates,
            requiredCharacters: [],
            requiredItems: []
        }
    });

    quest.addParticipant(actorId, 'leader');
    return quest;
}
