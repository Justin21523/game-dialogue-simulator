export const CompanionAbility = {
    ENGINEERING: 'ENGINEERING',
    POLICE: 'POLICE',
    ESPIONAGE: 'ESPIONAGE',
    DIGGING: 'DIGGING',
    ANIMAL_RESCUE: 'ANIMAL_RESCUE'
} as const;

export type CompanionAbility = (typeof CompanionAbility)[keyof typeof CompanionAbility];

export type CompanionDefinition = {
    companionId: string;
    displayName: string;
    characterId: string;
    abilities: CompanionAbility[];
};

export type CompanionState = {
    called: string[];
};

