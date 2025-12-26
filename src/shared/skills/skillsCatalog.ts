import { SKILL_EXPLORATION_FLIGHT } from './skillIds';

export type SkillDefinition = {
    skillId: string;
    name: string;
    description: string;
};

export const SKILLS: SkillDefinition[] = [
    {
        skillId: SKILL_EXPLORATION_FLIGHT,
        name: 'Exploration Flight',
        description: 'Toggle flight mode in exploration (F) to hover and reach elevated interactions.'
    }
];

