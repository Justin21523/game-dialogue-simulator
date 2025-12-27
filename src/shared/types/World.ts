import type { CompanionAbility } from './Companion.js';
import type { DialogueLine } from './Dialogue.js';

export type NpcPatrol = {
    minX: number;
    maxX: number;
    speed: number;
};

export type NpcPatrolPoint = {
    x: number;
    waitMs?: number;
};

export type NpcPatrolPath = {
    speed: number;
    points: NpcPatrolPoint[];
};

export type NpcDefinition = {
    npcId: string;
    displayName: string;
    characterId: string;
    portrait?: 'grid' | 'profile' | 'none';
    dialogueId: string;
    dialogueIdActive?: string;
    dialogueIdRepeat?: string;
    patrol?: NpcPatrol;
    patrolPath?: NpcPatrolPath;
    interactionRadius?: number;
    idleAnimation?: 'none' | 'bob' | 'bob_slow' | 'bob_fast';
    barks?: DialogueLine[];
};

export type NpcSpawn = {
    npcId: string;
    x: number;
    y: number;
};

export type InteractableType = 'quest_target' | 'exit_hint' | 'pickup' | 'terminal' | 'sign' | 'door';

export type InteractableDefinition = {
    interactableId: string;
    type: InteractableType;
    x: number;
    y: number;
    label: string;
    requiredAbility?: CompanionAbility;
    targetLocationId?: string;
    targetSpawnPoint?: string;
    message?: string;
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

export type ParallaxLayerKind = 'solid' | 'noise' | 'stripes';

export type ParallaxLayerDefinition = {
    id: string;
    kind: ParallaxLayerKind;
    color: string;
    alpha?: number;
    speed: number;
};

export type ParallaxDefinition = {
    layers: ParallaxLayerDefinition[];
};

export type LocationTheme =
    | 'airport_base'
    | 'warehouse'
    | 'town_outdoor'
    | 'interior_house'
    | 'interior_shop'
    | 'interior_garage'
    | 'interior_secret'
    | 'park_outdoor';

export type PropType = 'sign' | 'crate' | 'lamp' | 'fence' | 'bench' | 'decor' | 'building';

export type PropDefinition = {
    propId: string;
    type: PropType;
    x: number;
    y: number;
    label?: string;
    collides?: boolean;
    width?: number;
    height?: number;
    message?: string;
};

export type DoorDefinition = {
    doorId: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    targetLocationId: string;
    targetSpawnPoint: string;
    requiredWorldFlag?: string;
    requiredItemId?: string;
    requiredItemQty?: number;
};

export type SecretDefinition = {
    secretId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    worldFlag: string;
    rewardCurrency?: number;
    rewardExp?: number;
    rewardItemId?: string;
    message?: string;
};

export type ColliderDefinition = {
    colliderId: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type LocationDefinition = {
    locationId: string;
    displayName: string;
    worldWidth: number;
    worldHeight: number;
    theme?: LocationTheme;
    spawnPoints: Record<string, { x: number; y: number }>;
    npcSpawns: NpcSpawn[];
    interactables: InteractableDefinition[];
    props?: PropDefinition[];
    doors?: DoorDefinition[];
    secrets?: SecretDefinition[];
    colliders?: ColliderDefinition[];
    parallax?: ParallaxDefinition;
    exits: ExitDefinition[];
};

export type PlayerSaveState = {
    locationId: string;
    spawnPoint: string;
    x: number;
    y: number;
    movementMode?: 'walk' | 'hover';
};

export type WorldStateV1 = {
    version: 1;
    unlockedLocations: string[];
    worldFlags: string[];
    completedQuestTemplates: string[];
};

export type WorldStateV2 = {
    version: 2;
    unlockedLocations: string[];
    worldFlags: string[];
    completedQuestTemplates: string[];
    inventory: Record<string, number>;
    unlockedCompanions: string[];
    unlockedSkills: string[];
    lastPlayerState: PlayerSaveState | null;
};

export type WorldStateV3 = {
    version: 3;
    unlockedLocations: string[];
    discoveredLocations: string[];
    worldFlags: string[];
    completedQuestTemplates: string[];
    inventory: Record<string, number>;
    unlockedCompanions: string[];
    unlockedSkills: string[];
    lastPlayerState: PlayerSaveState | null;
};

export type WorldState = WorldStateV1 | WorldStateV2 | WorldStateV3;
