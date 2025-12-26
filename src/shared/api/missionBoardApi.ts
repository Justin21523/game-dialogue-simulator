import { getJson, postJson } from './http';

export type TutorialHintResponse = {
    topic: string;
    content: string;
    tips?: string[];
    related_topics?: string[];
    character_id?: string | null;
};

export async function fetchCharacterGuide(params: { characterId: string; language?: 'en' | 'zh' }): Promise<TutorialHintResponse> {
    const query = new URLSearchParams();
    if (params.language) query.set('language', params.language);
    const path = `/tutorial/character/${encodeURIComponent(params.characterId)}${query.toString() ? `?${query}` : ''}`;
    return getJson<TutorialHintResponse>(path, { timeoutMs: 60000 });
}

export async function fetchMissionTypeGuide(params: { missionType: string; language?: 'en' | 'zh' }): Promise<TutorialHintResponse> {
    const query = new URLSearchParams();
    if (params.language) query.set('language', params.language);
    const path = `/tutorial/mission-type/${encodeURIComponent(params.missionType)}${query.toString() ? `?${query}` : ''}`;
    return getJson<TutorialHintResponse>(path, { timeoutMs: 60000 });
}

export type DispatchRecommendation = {
    recommended_character: string;
    confidence: number;
    reasoning: string;
    alternative?: string | null;
    mission_tips?: string[];
    explanation?: string;
};

export type BestForMissionType = {
    mission_type: string;
    best_character: string;
    ranking: Array<{ character_id: string; score: number; reason?: string }>;
    reasoning: string;
};

export type EventChoice = {
    option: string;
    outcome: string;
};

export type GameEventResponse = {
    event_id: string;
    event_type: string;
    name: string;
    description: string;
    challenge: string;
    choices: EventChoice[];
    difficulty: string;
    related_ability: string;
    reward_potential?: string | null;
};

export type EventResolveResponse = {
    event_id: string;
    success: boolean;
    outcome: string;
    rewards?: Record<string, unknown> | null;
    penalties?: Record<string, unknown> | null;
};

export type PackageResult = {
    success: boolean;
    package_id: string;
    mission_name: string;
    output_dir: string;
    manifest_path?: string | null;
    zip_path?: string | null;
    total_assets?: number;
    successful_assets?: number;
    failed_assets?: number;
    error_message?: string | null;
};

export async function fetchTutorialHint(params: {
    currentSituation: string;
    characterId?: string | null;
    missionType?: string | null;
}): Promise<TutorialHintResponse> {
    return postJson<TutorialHintResponse>('/tutorial/hint', {
        current_situation: params.currentSituation,
        character_id: params.characterId ?? null,
        mission_type: params.missionType ?? null,
        player_progress: null
    }, { timeoutMs: 60000 });
}

export async function recommendDispatch(params: {
    missionType: string;
    location: string;
    problemDescription: string;
    urgency?: string;
    availableCharacters: string[];
}): Promise<DispatchRecommendation> {
    return postJson<DispatchRecommendation>('/dispatch/recommend', {
        mission_type: params.missionType,
        location: params.location,
        problem_description: params.problemDescription,
        urgency: params.urgency ?? 'normal',
        available_characters: params.availableCharacters
    }, { timeoutMs: 60000 });
}

export async function bestForMissionType(params: {
    missionType: string;
    availableCharacters: string[];
}): Promise<BestForMissionType> {
    const query = new URLSearchParams();
    if (params.availableCharacters.length > 0) {
        query.set('available_characters', params.availableCharacters.join(','));
    }
    const path = `/dispatch/best-for/${encodeURIComponent(params.missionType)}${query.toString() ? `?${query}` : ''}`;
    return getJson<BestForMissionType>(path, { timeoutMs: 30000 });
}

export async function generateMissionEvent(params: {
    characterId: string;
    location: string;
    missionPhase: string;
    originalProblem: string;
    eventType?: string | null;
    difficulty?: string | null;
}): Promise<GameEventResponse> {
    return postJson<GameEventResponse>('/events/generate', {
        character_id: params.characterId,
        location: params.location,
        mission_phase: params.missionPhase,
        original_problem: params.originalProblem,
        event_type: params.eventType ?? null,
        difficulty: params.difficulty ?? null
    }, { timeoutMs: 60000 });
}

export async function resolveMissionEvent(params: { eventId: string; choiceIndex: number }): Promise<EventResolveResponse> {
    return postJson<EventResolveResponse>(
        '/events/resolve',
        { event_id: params.eventId, choice_index: params.choiceIndex },
        { timeoutMs: 60000 }
    );
}

function normalizeLocation(raw: string): string {
    const key = raw
        .trim()
        .toLowerCase()
        .replace(/\./g, '')
        .replace(/\s+/g, '_')
        .replace(/__+/g, '_');

    const mapping: Record<string, string> = {
        paris: 'paris',
        london: 'london',
        rome: 'rome',
        tokyo: 'tokyo',
        beijing: 'beijing',
        new_york: 'new_york',
        rio_de_janeiro: 'rio',
        rio: 'rio',
        sydney: 'world_airport',
        cairo: 'world_airport',
        moscow: 'world_airport'
    };

    return mapping[key] ?? 'world_airport';
}

function normalizeMissionIcon(missionType: string): string {
    const key = missionType.trim().toLowerCase();
    if (key.includes('delivery')) return 'delivery';
    if (key.includes('rescue')) return 'rescue';
    if (key.includes('construction')) return 'construction';
    if (key.includes('digging') || key.includes('build')) return 'construction';
    if (key.includes('sports') || key.includes('race')) return 'sports';
    if (key.includes('animal')) return 'animal_care';
    if (key.includes('nature')) return 'animal_care';
    if (key.includes('exploration')) return 'exploration';
    if (key.includes('police')) return 'rescue';
    return 'exploration';
}

export async function generateAssetPackage(params: {
    missionName: string;
    mainCharacterId: string;
    location: string;
    missionType: string;
    quality?: 'low' | 'medium' | 'high';
}): Promise<PackageResult> {
    return postJson<PackageResult>('/assets/generate/custom', {
        mission_name: params.missionName,
        main_character_id: params.mainCharacterId,
        supporting_characters: [],
        location: normalizeLocation(params.location),
        sky_type: 'blue_sky',
        time_of_day: 'day',
        mission_type: normalizeMissionIcon(params.missionType),
        include_portraits: true,
        include_states: true,
        include_expressions: false,
        include_transformation: false,
        include_scenes: true,
        include_voice: false,
        include_sounds: false,
        include_animations: false,
        quality: params.quality ?? 'medium',
        dialogue_lines: [],
        output_dir: null,
        create_zip: false
    }, { timeoutMs: 180000 });
}
