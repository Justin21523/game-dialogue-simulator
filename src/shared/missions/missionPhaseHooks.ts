import { getLocation } from '../data/gameData';
import { eventBus } from '../eventBus';
import { EVENTS } from '../eventNames';
import { worldStateManager } from '../systems/worldStateManager';
import { CompanionAbility, type CompanionAbility as CompanionAbilityType } from '../types/Companion';
import type { Mission } from '../types/Game';
import type { InteractableDefinition, MissionSessionPhaseId } from '../types/World';

import { getMissionScript, type MissionPhaseHook } from './missionScripts';

function coerceAbility(value: string | undefined): CompanionAbilityType | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return (Object.values(CompanionAbility) as string[]).includes(trimmed) ? (trimmed as CompanionAbilityType) : undefined;
}

function buildSpawnInteractable(hook: Extract<MissionPhaseHook, { type: 'spawn_interactable' }>): { locationId: string; interactable: InteractableDefinition } | null {
    const locationId = hook.locationId;
    const interactableId = hook.interactableId;
    if (!locationId || !interactableId) return null;

    const location = getLocation(locationId);
    const fallback = location?.interactables?.find((i) => i.interactableId === interactableId) ?? null;

    const x = typeof hook.x === 'number' && Number.isFinite(hook.x) ? hook.x : fallback?.x;
    const y = typeof hook.y === 'number' && Number.isFinite(hook.y) ? hook.y : fallback?.y;
    const label = typeof hook.label === 'string' && hook.label.trim().length > 0 ? hook.label.trim() : fallback?.label;
    const typeRaw = typeof hook.interactableType === 'string' && hook.interactableType.trim().length > 0 ? hook.interactableType.trim() : fallback?.type;
    if (typeof x !== 'number' || typeof y !== 'number' || !label || !typeRaw) return null;

    const requiredAbility = coerceAbility(hook.requiredAbility) ?? fallback?.requiredAbility;
    const targetLocationId = hook.targetLocationId ?? fallback?.targetLocationId;
    const targetSpawnPoint = hook.targetSpawnPoint ?? fallback?.targetSpawnPoint;
    const message = hook.message ?? fallback?.message;

    return {
        locationId,
        interactable: {
            interactableId,
            type: typeRaw as InteractableDefinition['type'],
            x,
            y,
            label,
            requiredAbility,
            targetLocationId,
            targetSpawnPoint,
            message
        }
    };
}

export function applyMissionPhaseHooks(params: { mission: Mission; phaseId: MissionSessionPhaseId }): void {
    const mission = params.mission;
    const scriptId = mission.missionScriptId ?? null;
    if (!scriptId) return;

    const script = getMissionScript(scriptId);
    const phase = script?.phases.find((p) => p.phaseId === params.phaseId) ?? null;
    const hooks = phase?.hooks ?? [];
    if (hooks.length === 0) return;

    worldStateManager.initialize();
    const session = worldStateManager.getActiveMissionSession();
    if (!session) return;
    if (session.mission.id !== mission.id) return;

    const existingLogIds = new Set(session.log.map((e) => e.id));
    const existingSpawnKeys = new Set(
        session.spawnedInteractables.map((s) => `${s.locationId}:${s.interactable.interactableId}`)
    );
    const nextSpawned = session.spawnedInteractables.slice();
    const newlySpawned: Array<{ locationId: string; interactable: InteractableDefinition }> = [];

    const appendLogOnce = (id: string, entry: Omit<Parameters<typeof worldStateManager.appendMissionLog>[0], 'id'>): void => {
        if (existingLogIds.has(id)) return;
        existingLogIds.add(id);
        worldStateManager.appendMissionLog({ id, ...entry });
    };

    for (let i = 0; i < hooks.length; i += 1) {
        const hook = hooks[i];
        if (!hook) continue;

        if (hook.type === 'require_ability') {
            const target = hook.targetId ? ` for ${hook.targetId}` : '';
            const text = hook.message ?? `Requires companion ability: ${hook.ability}${target}.`;
            appendLogOnce(`hook:${mission.id}:${params.phaseId}:require_ability:${hook.ability}:${hook.targetId ?? i}`, {
                phaseId: params.phaseId,
                kind: 'system',
                title: 'Requirement',
                text
            });
            continue;
        }

        if (hook.type === 'gate_world_flag') {
            const text = hook.message ?? `Requires world flag: ${hook.flag}.`;
            appendLogOnce(`hook:${mission.id}:${params.phaseId}:gate_world_flag:${hook.flag}`, {
                phaseId: params.phaseId,
                kind: 'system',
                title: 'Gate',
                text
            });
            continue;
        }

        if (hook.type === 'gate_item') {
            const text = hook.message ?? `Requires item: ${hook.itemId} x${hook.quantity}.`;
            appendLogOnce(`hook:${mission.id}:${params.phaseId}:gate_item:${hook.itemId}:${hook.quantity}`, {
                phaseId: params.phaseId,
                kind: 'system',
                title: 'Gate',
                text
            });
            continue;
        }

        if (hook.type === 'spawn_interactable') {
            const spawned = buildSpawnInteractable(hook);
            if (!spawned) {
                appendLogOnce(`hook:${mission.id}:${params.phaseId}:spawn_interactable:missing:${hook.locationId}:${hook.interactableId}`, {
                    phaseId: params.phaseId,
                    kind: 'system',
                    title: 'Spawn',
                    text: `Unable to spawn interactable: ${hook.interactableId} (missing definition).`
                });
                continue;
            }

            const key = `${spawned.locationId}:${spawned.interactable.interactableId}`;
            if (existingSpawnKeys.has(key)) continue;
            existingSpawnKeys.add(key);
            nextSpawned.push(spawned);
            newlySpawned.push(spawned);

            appendLogOnce(`hook:${mission.id}:${params.phaseId}:spawn_interactable:${key}`, {
                phaseId: params.phaseId,
                kind: 'system',
                title: 'Objective',
                text: `New interactable available: ${spawned.interactable.label}.`
            });
        }
    }

    if (newlySpawned.length === 0) return;
    worldStateManager.updateActiveMissionSession({ spawnedInteractables: nextSpawned });

    for (const spawn of newlySpawned) {
        eventBus.emit(EVENTS.MISSION_INTERACTABLE_SPAWNED, spawn);
    }
}

