import type { CharacterState, Mission, Resources } from './Game';
import type { AchievementState, StatisticsState } from './Progress';

export type SaveSnapshot = {
    version: 1 | 2;
    resources: Resources;
    characters: CharacterState[];
    missions: Mission[];
    selectedCharacterId: string;
    statistics?: StatisticsState;
    achievements?: AchievementState;
};

