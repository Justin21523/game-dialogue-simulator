import { companionManager } from '../systems/companionManager';
import { worldStateManager } from '../systems/worldStateManager';
import { missionManager } from '../quests/missionManager';
import type { DialogueCondition } from '../types/Dialogue';

export function isDialogueConditionMet(cond: DialogueCondition | undefined): boolean {
    if (!cond) return true;

    worldStateManager.initialize();
    companionManager.initialize();

    const flagsAll = cond.flags_all ?? [];
    for (const flag of flagsAll) {
        if (!worldStateManager.hasWorldFlag(flag)) return false;
    }

    const flagsNone = cond.flags_none ?? [];
    for (const flag of flagsNone) {
        if (worldStateManager.hasWorldFlag(flag)) return false;
    }

    const flagsAny = cond.flags_any ?? [];
    if (flagsAny.length > 0 && !flagsAny.some((flag) => worldStateManager.hasWorldFlag(flag))) {
        return false;
    }

    const hasItems = cond.has_items ?? [];
    for (const itemId of hasItems) {
        if (!worldStateManager.hasItem(itemId, 1)) return false;
    }

    const missingItems = cond.missing_items ?? [];
    for (const itemId of missingItems) {
        if (worldStateManager.hasItem(itemId, 1)) return false;
    }

    if (cond.quest_active) {
        const active = missionManager.getActiveQuests();
        const isActive = active.some((q) => q.templateId === cond.quest_active);
        if (!isActive) return false;
    }

    if (cond.quest_not_active) {
        const active = missionManager.getActiveQuests();
        const isActive = active.some((q) => q.templateId === cond.quest_not_active);
        if (isActive) return false;
    }

    if (cond.quest_completed) {
        if (!worldStateManager.isQuestTemplateCompleted(cond.quest_completed)) return false;
    }

    if (cond.quest_not_completed) {
        if (worldStateManager.isQuestTemplateCompleted(cond.quest_not_completed)) return false;
    }

    return true;
}

