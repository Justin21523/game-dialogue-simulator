import companionsJson from '../../data/companions.json';
import dialoguesJson from '../../data/dialogues.json';
import locationsJson from '../../data/locations.json';
import npcsJson from '../../data/npcs.json';
import questsJson from '../../data/quests.json';

import type { CompanionAbility, CompanionCategory, CompanionDefinition, CompanionUnlock } from '../types/Companion.js';
import type { DialogueChoice, DialogueCondition, DialogueDefinition, DialogueLine, DialogueNode } from '../types/Dialogue.js';
import type { QuestTemplate, QuestTemplatePrerequisites, QuestTemplateRewards, QuestTemplateStep, QuestStepType } from '../types/QuestTemplate.js';
import type {
    ColliderDefinition,
    DoorDefinition,
    ExitDefinition,
    InteractableDefinition,
    LocationDefinition,
    LocationTheme,
    NpcBarks,
    NpcDefinition,
    NpcIdleAnimation,
    NpcPatrol,
    NpcPatrolPath,
    NpcSpawn,
    ParallaxDefinition,
    PropDefinition,
    SecretDefinition
} from '../types/World.js';

type RawCompanions = {
    companions: Array<{
        companion_id: string;
        display_name: string;
        character_id: string;
        category?: string;
        abilities: string[];
        unlock?: { type: string; flag?: string; template_id?: string };
    }>;
};

type RawNpcs = {
    npcs: Array<{
        npc_id: string;
        display_name: string;
        character_id: string;
        portrait?: string;
        dialogue_id: string;
        dialogue_id_active?: string;
        dialogue_id_repeat?: string;
        patrol?: { min_x: number; max_x: number; speed: number };
        patrol_path?: {
            speed: number;
            points: Array<{ x: number; y?: number; wait_ms?: number; wait_ms_min?: number; wait_ms_max?: number }>;
        };
        interaction_radius?: number;
        idle_animation?: string;
        idle_variants?: string[];
        barks?:
            | unknown[]
            | {
                  lines?: unknown[];
                  chance?: number;
                  cooldown_ms_min?: number;
                  cooldown_ms_max?: number;
                  initial_delay_ms_min?: number;
                  initial_delay_ms_max?: number;
              };
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
            lines: unknown[];
            choices?: Array<{
                choice_id: string;
                text: string;
                next_node_id?: string | null;
                actions?: Array<Record<string, unknown>>;
                if?: Record<string, unknown>;
                disabled_text?: string;
                hide_if_unavailable?: boolean;
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
        theme?: string;
        spawn_points: Record<string, { x: number; y: number }>;
        npc_spawns: Array<{ npc_id: string; x: number; y: number }>;
        interactables: Array<{
            interactable_id: string;
            type: string;
            x: number;
            y: number;
            label: string;
            required_ability?: string;
            target_location_id?: string;
            target_spawn_point?: string;
            message?: string;
        }>;
        props?: Array<{
            prop_id: string;
            type: string;
            x: number;
            y: number;
            label?: string;
            collides?: boolean;
            width?: number;
            height?: number;
            message?: string;
        }>;
        doors?: Array<{
            door_id: string;
            label: string;
            x: number;
            y: number;
            width: number;
            height: number;
            target_location_id: string;
            target_spawn_point: string;
            required_world_flag?: string;
            required_item_id?: string;
            required_item_qty?: number;
        }>;
        secrets?: Array<{
            secret_id: string;
            x: number;
            y: number;
            width: number;
            height: number;
            world_flag: string;
            reward_currency?: number;
            reward_exp?: number;
            reward_item_id?: string;
            message?: string;
        }>;
        colliders?: Array<{
            collider_id: string;
            x: number;
            y: number;
            width: number;
            height: number;
        }>;
        parallax?: {
            layers: Array<{ id: string; kind: string; color: string; alpha?: number; speed: number }>;
        };
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

function toCompanionCategory(value: string | undefined): CompanionCategory | null {
    if (!value) return null;
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) return null;
    return trimmed as CompanionCategory;
}

function toCompanionUnlock(raw: RawCompanions['companions'][number]['unlock'] | undefined): CompanionUnlock | undefined {
    if (!raw) return undefined;
    const type = String(raw.type ?? '').trim();
    if (type === 'default') return { type: 'default' };
    if (type === 'world_flag' && raw.flag) return { type: 'world_flag', flag: String(raw.flag) };
    if (type === 'quest_completed' && raw.template_id) return { type: 'quest_completed', templateId: String(raw.template_id) };
    return undefined;
}

function toQuestStepType(value: string): QuestStepType {
    return value as QuestStepType;
}

function toLocationTheme(value: string | undefined): LocationTheme | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed as LocationTheme;
}

function toIdleAnimation(value: string | undefined): NpcIdleAnimation | undefined {
    if (!value) return undefined;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return undefined;
    const allowed: NpcIdleAnimation[] = ['none', 'bob', 'bob_slow', 'bob_fast'];
    return (allowed as string[]).includes(trimmed) ? (trimmed as NpcIdleAnimation) : undefined;
}

function toBarkConfig(raw: RawNpcs['npcs'][number]['barks']): NpcBarks | undefined {
    const clamp01 = (value: unknown): number | undefined => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
        return Math.min(1, Math.max(0, value));
    };

    const asMs = (value: unknown): number | undefined => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
        const ms = Math.max(0, Math.floor(value));
        return ms > 0 ? ms : undefined;
    };

    const parseLines = (value: unknown): DialogueLine[] => {
        if (!Array.isArray(value)) return [];
        return value.map(toDialogueLine).filter((line): line is DialogueLine => Boolean(line));
    };

    if (Array.isArray(raw)) {
        const lines = parseLines(raw);
        return lines.length > 0 ? { lines } : undefined;
    }

    if (raw && typeof raw === 'object') {
        const data = raw as Record<string, unknown>;
        const lines = parseLines(data.lines);
        if (lines.length === 0) return undefined;

        const chance = clamp01(data.chance);
        const cooldownMsMin = asMs(data.cooldown_ms_min);
        const cooldownMsMax = asMs(data.cooldown_ms_max);
        const initialDelayMsMin = asMs(data.initial_delay_ms_min);
        const initialDelayMsMax = asMs(data.initial_delay_ms_max);

        return {
            lines,
            chance,
            cooldownMsMin,
            cooldownMsMax,
            initialDelayMsMin,
            initialDelayMsMax
        };
    }

    return undefined;
}

function toDialogueCondition(raw: unknown): DialogueCondition | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const data = raw as Record<string, unknown>;
    const asStringArray = (value: unknown): string[] | undefined => {
        if (!Array.isArray(value)) return undefined;
        const items = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
        return items.length > 0 ? items : undefined;
    };

    const cond: DialogueCondition = {};
    const flagsAll = asStringArray(data.flags_all);
    const flagsAny = asStringArray(data.flags_any);
    const flagsNone = asStringArray(data.flags_none);
    const hasItems = asStringArray(data.has_items);
    const missingItems = asStringArray(data.missing_items);

    if (flagsAll) cond.flags_all = flagsAll;
    if (flagsAny) cond.flags_any = flagsAny;
    if (flagsNone) cond.flags_none = flagsNone;
    if (hasItems) cond.has_items = hasItems;
    if (missingItems) cond.missing_items = missingItems;

    if (typeof data.quest_active === 'string' && data.quest_active) cond.quest_active = data.quest_active;
    if (typeof data.quest_not_active === 'string' && data.quest_not_active) cond.quest_not_active = data.quest_not_active;
    if (typeof data.quest_completed === 'string' && data.quest_completed) cond.quest_completed = data.quest_completed;
    if (typeof data.quest_not_completed === 'string' && data.quest_not_completed) cond.quest_not_completed = data.quest_not_completed;

    return Object.keys(cond).length > 0 ? cond : undefined;
}

function toDialogueLine(raw: unknown): DialogueLine | null {
    if (typeof raw === 'string') return raw;
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as Record<string, unknown>;
    const text = String(data.text ?? '').trim();
    if (!text) return null;
    const cond = toDialogueCondition(data.if);
    return cond ? { text, if: cond } : { text };
}

const companionById = new Map<string, CompanionDefinition>();
for (const entry of rawCompanions.companions) {
    const abilities = entry.abilities.map(toAbility).filter((a): a is CompanionAbility => Boolean(a));
    const category = toCompanionCategory(entry.category) ?? undefined;
    const unlock = toCompanionUnlock(entry.unlock);
    companionById.set(entry.companion_id, {
        companionId: entry.companion_id,
        displayName: entry.display_name,
        characterId: entry.character_id,
        category,
        abilities,
        unlock
    });
}

const npcById = new Map<string, NpcDefinition>();
for (const entry of rawNpcs.npcs) {
    const patrol: NpcPatrol | undefined = entry.patrol
        ? { minX: entry.patrol.min_x, maxX: entry.patrol.max_x, speed: entry.patrol.speed }
        : undefined;

    const patrolPath: NpcPatrolPath | undefined =
        entry.patrol_path && Array.isArray(entry.patrol_path.points)
            ? {
                  speed: entry.patrol_path.speed,
                  points: entry.patrol_path.points
                      .map((p) => ({
                          x: p.x,
                          y: typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : undefined,
                          waitMs: typeof p.wait_ms === 'number' && Number.isFinite(p.wait_ms) ? p.wait_ms : undefined,
                          waitMsMin: typeof p.wait_ms_min === 'number' && Number.isFinite(p.wait_ms_min) ? p.wait_ms_min : undefined,
                          waitMsMax: typeof p.wait_ms_max === 'number' && Number.isFinite(p.wait_ms_max) ? p.wait_ms_max : undefined
                      }))
                      .filter((p) => Number.isFinite(p.x))
              }
            : undefined;

    const idleAnimation = toIdleAnimation(entry.idle_animation);
    const idleVariants = Array.isArray(entry.idle_variants)
        ? entry.idle_variants.map((v) => toIdleAnimation(v)).filter((v): v is NpcIdleAnimation => Boolean(v))
        : undefined;

    npcById.set(entry.npc_id, {
        npcId: entry.npc_id,
        displayName: entry.display_name,
        characterId: entry.character_id,
        portrait: typeof entry.portrait === 'string' ? (entry.portrait as NpcDefinition['portrait']) : undefined,
        dialogueId: entry.dialogue_id,
        dialogueIdActive: typeof entry.dialogue_id_active === 'string' ? entry.dialogue_id_active : undefined,
        dialogueIdRepeat: typeof entry.dialogue_id_repeat === 'string' ? entry.dialogue_id_repeat : undefined,
        patrol,
        patrolPath,
        interactionRadius: typeof entry.interaction_radius === 'number' ? entry.interaction_radius : undefined,
        idleAnimation,
        idleVariants: idleVariants && idleVariants.length > 0 ? idleVariants : undefined,
        barks: toBarkConfig(entry.barks)
    });
}

const dialogueById = new Map<string, DialogueDefinition>();
for (const entry of rawDialogues.dialogues) {
    const nodes: DialogueNode[] = entry.nodes.map((node) => {
        const lines: DialogueLine[] = (node.lines ?? []).map(toDialogueLine).filter((l): l is DialogueLine => Boolean(l));

        const choices: DialogueChoice[] | undefined = node.choices?.map((choice) => ({
            choiceId: choice.choice_id,
            text: choice.text,
            nextNodeId: typeof choice.next_node_id === 'string' ? choice.next_node_id : choice.next_node_id ?? null,
            if: toDialogueCondition(choice.if),
            disabledText: typeof choice.disabled_text === 'string' ? choice.disabled_text : undefined,
            hideIfUnavailable: typeof choice.hide_if_unavailable === 'boolean' ? choice.hide_if_unavailable : undefined,
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
                if (type === 'set_flag') {
                    return { type: 'set_flag', flag: String(raw.flag ?? '') };
                }
                if (type === 'give_item') {
                    return { type: 'give_item', itemId: String(raw.item_id ?? ''), quantity: Number(raw.quantity ?? 1) };
                }
                if (type === 'take_item') {
                    return { type: 'take_item', itemId: String(raw.item_id ?? ''), quantity: Number(raw.quantity ?? 1) };
                }
                if (type === 'unlock_companion') {
                    return { type: 'unlock_companion', companionId: String(raw.companion_id ?? '') };
                }
                if (type === 'unlock_skill') {
                    return { type: 'unlock_skill', skillId: String(raw.skill_id ?? '') };
                }
                return { type: 'close_dialogue' };
            })
        }));

        return {
            nodeId: node.node_id,
            speakerName: node.speaker_name,
            lines,
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
        requiredAbility: toAbility(raw.required_ability) ?? undefined,
        targetLocationId: typeof raw.target_location_id === 'string' ? raw.target_location_id : undefined,
        targetSpawnPoint: typeof raw.target_spawn_point === 'string' ? raw.target_spawn_point : undefined,
        message: typeof raw.message === 'string' ? raw.message : undefined
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

    const props: PropDefinition[] | undefined = entry.props
        ? entry.props.map((p) => ({
              propId: p.prop_id,
              type: p.type as PropDefinition['type'],
              x: p.x,
              y: p.y,
              label: typeof p.label === 'string' ? p.label : undefined,
              collides: Boolean(p.collides),
              width: typeof p.width === 'number' ? p.width : undefined,
              height: typeof p.height === 'number' ? p.height : undefined,
              message: typeof p.message === 'string' ? p.message : undefined
          }))
        : undefined;

    const doors: DoorDefinition[] | undefined = entry.doors
        ? entry.doors.map((d) => ({
              doorId: d.door_id,
              label: d.label,
              x: d.x,
              y: d.y,
              width: d.width,
              height: d.height,
              targetLocationId: d.target_location_id,
              targetSpawnPoint: d.target_spawn_point,
              requiredWorldFlag: typeof d.required_world_flag === 'string' ? d.required_world_flag : undefined,
              requiredItemId: typeof d.required_item_id === 'string' ? d.required_item_id : undefined,
              requiredItemQty: typeof d.required_item_qty === 'number' && Number.isFinite(d.required_item_qty) ? Math.max(1, Math.floor(d.required_item_qty)) : undefined
          }))
        : undefined;

    const secrets: SecretDefinition[] | undefined = entry.secrets
        ? entry.secrets.map((s) => ({
              secretId: s.secret_id,
              x: s.x,
              y: s.y,
              width: s.width,
              height: s.height,
              worldFlag: s.world_flag,
              rewardCurrency: typeof s.reward_currency === 'number' ? s.reward_currency : undefined,
              rewardExp: typeof s.reward_exp === 'number' ? s.reward_exp : undefined,
              rewardItemId: typeof s.reward_item_id === 'string' ? s.reward_item_id : undefined,
              message: typeof s.message === 'string' ? s.message : undefined
          }))
        : undefined;

    const colliders: ColliderDefinition[] | undefined = entry.colliders
        ? entry.colliders.map((c) => ({
              colliderId: c.collider_id,
              x: c.x,
              y: c.y,
              width: c.width,
              height: c.height
          }))
        : undefined;

    const parallax: ParallaxDefinition | undefined = entry.parallax
        ? {
              layers: entry.parallax.layers.map((l) => ({
                  id: l.id,
                  kind: l.kind as ParallaxDefinition['layers'][number]['kind'],
                  color: l.color,
                  alpha: typeof l.alpha === 'number' ? l.alpha : undefined,
                  speed: l.speed
              }))
          }
        : undefined;

    locationById.set(entry.location_id, {
        locationId: entry.location_id,
        displayName: entry.display_name,
        worldWidth: entry.world_width,
        worldHeight: entry.world_height,
        theme: toLocationTheme(entry.theme),
        spawnPoints,
        npcSpawns,
        interactables,
        props,
        doors,
        secrets,
        colliders,
        parallax,
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
