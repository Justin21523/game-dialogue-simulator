export const CompanionAbility = {
    ENGINEERING: 'ENGINEERING',
    POLICE: 'POLICE',
    ESPIONAGE: 'ESPIONAGE',
    DIGGING: 'DIGGING',
    ANIMAL_RESCUE: 'ANIMAL_RESCUE'
} as const;

export type CompanionAbility = (typeof CompanionAbility)[keyof typeof CompanionAbility];

export type CompanionCategory = CompanionAbility | 'SUPPORT';

export type CompanionUnlock =
    | { type: 'default' }
    | { type: 'world_flag'; flag: string }
    | { type: 'quest_completed'; templateId: string };

export type CompanionDefinition = {
    companionId: string;
    displayName: string;
    characterId: string;
    category?: CompanionCategory;
    abilities: CompanionAbility[];
    unlock?: CompanionUnlock;
};

export type CompanionState = {
    version: 2;
    unlocked: string[];
    selected: string | null;
    called: string[];
};
