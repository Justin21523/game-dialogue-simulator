import type { CompanionAbility } from './Companion.js';

export type QuestStepType =
    | 'talk'
    | 'go_to_location'
    | 'collect'
    | 'deliver'
    | 'fix_build'
    | 'investigate'
    | 'clear_manage'
    | 'dig_recover'
    | 'escort'
    | 'puzzle_unlock';

export type QuestTemplateStep = {
    id: string;
    type: QuestStepType;
    title: string;
    requiredCount: number;
    conditions: Record<string, string>[];
};

export type QuestTemplateRewards = {
    currency: number;
    exp: number;
    unlockLocations?: string[];
};

export type QuestTemplatePrerequisites = {
    requiredWorldFlags: string[];
    completedQuestTemplates: string[];
};

export type QuestTemplate = {
    templateId: string;
    title: string;
    description: string;
    type: 'main' | 'sub' | 'side';
    destinationLocationId: string;
    repeatable: boolean;
    steps: QuestTemplateStep[];
    rewards: QuestTemplateRewards;
    prerequisites: QuestTemplatePrerequisites;
};

export type QuestTemplateInstanceMeta = {
    templateId: string;
    requiredAbility?: CompanionAbility;
};
