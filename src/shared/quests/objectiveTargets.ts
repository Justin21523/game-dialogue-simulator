import { ObjectiveType, type Objective } from './objective';

export type ObjectiveTargetHint = {
    objectiveType: ObjectiveType;
    locationId: string | null;
    npcId: string | null;
    itemId: string | null;
    targetId: string | null;
    requiredAbility: string | null;
};

function pickFirst(conditions: Array<Record<string, string>> | undefined, keys: string[]): string | null {
    if (!conditions || conditions.length === 0) return null;
    for (const cond of conditions) {
        for (const key of keys) {
            const raw = cond[key];
            if (typeof raw === 'string' && raw.trim().length > 0) return raw;
        }
    }
    return null;
}

export function getObjectiveTargetHint(objective: Objective): ObjectiveTargetHint {
    const conditions = objective.conditions ?? [];
    const locationId = pickFirst(conditions, ['location_id', 'location']);
    const npcId = pickFirst(conditions, ['npc_id', 'target', 'target_npc', 'targetNpcId']);
    const itemId = pickFirst(conditions, ['item_id', 'item_type', 'itemId']);
    const targetId = pickFirst(conditions, ['target_id', 'target', 'action_target', 'actionTarget']);
    const requiredAbility = pickFirst(conditions, ['required_ability', 'ability']);

    return {
        objectiveType: objective.type ?? ObjectiveType.CUSTOM,
        locationId: locationId ?? null,
        npcId: npcId ?? null,
        itemId: itemId ?? null,
        targetId: targetId ?? null,
        requiredAbility: requiredAbility ?? null
    };
}

