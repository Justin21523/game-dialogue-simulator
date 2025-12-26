import companionsJson from '../../data/companions.json';
import dialoguesJson from '../../data/dialogues.json';
import locationsJson from '../../data/locations.json';
import npcsJson from '../../data/npcs.json';
import questsJson from '../../data/quests.json';

import type { CompanionAbility, CompanionDefinition } from '../types/Companion.js';
import type { DialogueChoice, DialogueDefinition, DialogueNode } from '../types/Dialogue.js';
import type { QuestTemplate, QuestTemplatePrerequisites, QuestTemplateRewards, QuestTemplateStep, QuestStepType } from '../types/QuestTemplate.js';
import type { ExitDefinition, InteractableDefinition, LocationDefinition, NpcDefinition, NpcPatrol, NpcSpawn } from '../types/World.js';

type RawCompanions = {
    companions: Array<{
        companion_id: string;
        display_name: string;
        character_id: string;
        abilities: string[];
    }>;
};

type RawNpcs = {
    npcs: Array<{
        npc_id: string;
        display_name: string;
        character_id: string;
        dialogue_id: string;
        dialogue_id_active?: string;
        dialogue_id_repeat?: string;
        patrol?: { min_x: number; max_x: number; speed: number };
    }>;
};

type RawDialogues = {
    dialogues: Array<{
        dialogue_id: string;
        npc_id: string;
        start_node_id: string;
        nodes: Array<{
            node_id: string;
            speaker_name: string;
            lines: string[];
            choices?: Array<{
                choice_id: string;
                text: string;
                next_node_id?: string | null;
                actions?: Array<Record<string, unknown>>;
            }>;
        }>;
    }>;
};

type RawQuests = {
    quest_templates: Array<{
        template_id: string;
        title: string;
        description: string;
        type: 'main' | 'sub' | 'side';
        destination_location_id: string;
        repeatable: boolean;
        steps: Array<{
            id: string;
            type: string;
            title: string;
            required_count: number;
            conditions: Array<Record<string, string>>;
        }>;
        rewards: {
            currency: number;
            exp: number;
            unlock_locations?: string[];
        };
        prerequisites: {
            required_world_flags: string[];
            completed_quest_templates: string[];
        };
    }>;
};

type RawLocations = {
    locations: Array<{
        location_id: string;
        display_name: string;
        world_width: number;
        world_height: number;
        spawn_points: Record<string, { x: number; y: number }>;
        npc_spawns: Array<{ npc_id: string; x: number; y: number }>;
        interactables: Array<{
            interactable_id: string;
            type: string;
            x: number;
            y: number;
            label: string;
            required_ability?: string;
        }>;
        exits: Array<{
            exit_id: string;
            x: number;
            y: number;
            width: number;
            height: number;
            target_location_id: string;
            target_spawn_point: string;
        }>;
    }>;
};

const rawCompanions = companionsJson as RawCompanions;
const rawDialogues = dialoguesJson as RawDialogues;
const rawLocations = locationsJson as unknown as RawLocations;
const rawNpcs = npcsJson as RawNpcs;
const rawQuests = questsJson as RawQuests;

function toAbility(value: string | undefined): CompanionAbility | null {
    if (!value) return null;
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) return null;
    return trimmed as CompanionAbility;
}

function toQuestStepType(value: string): QuestStepType {
    return value as QuestStepType;
}

const companionById = new Map<string, CompanionDefinition>();
for (const entry of rawCompanions.companions) {
    const abilities = entry.abilities.map(toAbility).filter((a): a is CompanionAbility => Boolean(a));
    companionById.set(entry.companion_id, {
        companionId: entry.companion_id,
        displayName: entry.display_name,
        characterId: entry.character_id,
        abilities
    });
}

const npcById = new Map<string, NpcDefinition>();
for (const entry of rawNpcs.npcs) {
    const patrol: NpcPatrol | undefined = entry.patrol
        ? { minX: entry.patrol.min_x, maxX: entry.patrol.max_x, speed: entry.patrol.speed }
        : undefined;
    npcById.set(entry.npc_id, {
        npcId: entry.npc_id,
        displayName: entry.display_name,
        characterId: entry.character_id,
        dialogueId: entry.dialogue_id,
        dialogueIdActive: typeof entry.dialogue_id_active === 'string' ? entry.dialogue_id_active : undefined,
        dialogueIdRepeat: typeof entry.dialogue_id_repeat === 'string' ? entry.dialogue_id_repeat : undefined,
        patrol
    });
}

const dialogueById = new Map<string, DialogueDefinition>();
for (const entry of rawDialogues.dialogues) {
    const nodes: DialogueNode[] = entry.nodes.map((node) => {
        const choices: DialogueChoice[] | undefined = node.choices?.map((choice) => ({
            choiceId: choice.choice_id,
            text: choice.text,
            nextNodeId: typeof choice.next_node_id === 'string' ? choice.next_node_id : choice.next_node_id ?? null,
            actions: (choice.actions ?? []).map((raw) => {
                const type = String(raw.type ?? '').trim();
                if (type === 'quest_start') {
                    return { type: 'quest_start', questTemplateId: String(raw.quest_template_id ?? '') };
                }
                if (type === 'emit_event') {
                    return {
                        type: 'emit_event',
                        event: String(raw.event ?? ''),
                        payload: (raw.payload as Record<string, unknown> | undefined) ?? undefined
                    };
                }
                return { type: 'close_dialogue' };
            })
        }));

        return {
            nodeId: node.node_id,
            speakerName: node.speaker_name,
            lines: node.lines,
            choices
        };
    });

    dialogueById.set(entry.dialogue_id, {
        dialogueId: entry.dialogue_id,
        npcId: entry.npc_id,
        startNodeId: entry.start_node_id,
        nodes
    });
}

const questTemplateById = new Map<string, QuestTemplate>();
for (const entry of rawQuests.quest_templates) {
    const steps: QuestTemplateStep[] = entry.steps.map((step) => ({
        id: step.id,
        type: toQuestStepType(step.type),
        title: step.title,
        requiredCount: step.required_count,
        conditions: step.conditions
    }));

    const rewards: QuestTemplateRewards = {
        currency: entry.rewards.currency,
        exp: entry.rewards.exp,
        unlockLocations: entry.rewards.unlock_locations
    };

    const prerequisites: QuestTemplatePrerequisites = {
        requiredWorldFlags: entry.prerequisites.required_world_flags ?? [],
        completedQuestTemplates: entry.prerequisites.completed_quest_templates ?? []
    };

    questTemplateById.set(entry.template_id, {
        templateId: entry.template_id,
        title: entry.title,
        description: entry.description,
        type: entry.type,
        destinationLocationId: entry.destination_location_id,
        repeatable: Boolean(entry.repeatable),
        steps,
        rewards,
        prerequisites
    });
}

const locationById = new Map<string, LocationDefinition>();
for (const entry of rawLocations.locations) {
    const spawnPoints = entry.spawn_points ?? {};
    const npcSpawns: NpcSpawn[] = entry.npc_spawns.map((spawn) => ({ npcId: spawn.npc_id, x: spawn.x, y: spawn.y }));
    const interactables: InteractableDefinition[] = entry.interactables.map((raw) => ({
        interactableId: raw.interactable_id,
        type: raw.type as InteractableDefinition['type'],
        x: raw.x,
        y: raw.y,
        label: raw.label,
        requiredAbility: toAbility(raw.required_ability) ?? undefined
    }));
    const exits: ExitDefinition[] = entry.exits.map((raw): ExitDefinition => ({
        exitId: raw.exit_id,
        x: raw.x,
        y: raw.y,
        width: raw.width,
        height: raw.height,
        targetLocationId: raw.target_location_id,
        targetSpawnPoint: raw.target_spawn_point
    }));

    locationById.set(entry.location_id, {
        locationId: entry.location_id,
        displayName: entry.display_name,
        worldWidth: entry.world_width,
        worldHeight: entry.world_height,
        spawnPoints,
        npcSpawns,
        interactables,
        exits
    });
}

export function getCompanion(companionId: string): CompanionDefinition | null {
    return companionById.get(companionId) ?? null;
}

export function listCompanions(): CompanionDefinition[] {
    return [...companionById.values()];
}

export function getNpc(npcId: string): NpcDefinition | null {
    return npcById.get(npcId) ?? null;
}

export function getDialogue(dialogueId: string): DialogueDefinition | null {
    return dialogueById.get(dialogueId) ?? null;
}

export function getQuestTemplate(templateId: string): QuestTemplate | null {
    return questTemplateById.get(templateId) ?? null;
}

export function listQuestTemplates(): QuestTemplate[] {
    return [...questTemplateById.values()];
}

export function getLocation(locationId: string): LocationDefinition | null {
    return locationById.get(locationId) ?? null;
}

export function listLocations(): LocationDefinition[] {
    return [...locationById.values()];
}

export function isLocationKnown(locationId: string): boolean {
    return locationById.has(locationId);
}
