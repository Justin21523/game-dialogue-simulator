import type { CompanionAbility } from './Companion.js';

export type NpcPatrol = {
    minX: number;
    maxX: number;
    speed: number;
};

export type NpcDefinition = {
    npcId: string;
    displayName: string;
    characterId: string;
    dialogueId: string;
    dialogueIdActive?: string;
    dialogueIdRepeat?: string;
    patrol?: NpcPatrol;
};

export type NpcSpawn = {
    npcId: string;
    x: number;
    y: number;
};

export type InteractableType = 'quest_target' | 'exit_hint' | 'pickup';

export type InteractableDefinition = {
    interactableId: string;
    type: InteractableType;
    x: number;
    y: number;
    label: string;
    requiredAbility?: CompanionAbility;
};

export type ExitDefinition = {
    exitId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    targetLocationId: string;
    targetSpawnPoint: string;
};

export type LocationDefinition = {
    locationId: string;
    displayName: string;
    worldWidth: number;
    worldHeight: number;
    spawnPoints: Record<string, { x: number; y: number }>;
    npcSpawns: NpcSpawn[];
    interactables: InteractableDefinition[];
    exits: ExitDefinition[];
};

export type WorldState = {
    version: 1;
    unlockedLocations: string[];
    worldFlags: string[];
    completedQuestTemplates: string[];
};
