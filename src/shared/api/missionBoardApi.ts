import { getJson, isOfflineBackendError, postJson } from './http';

export type TutorialHintResponse = {
    topic: string;
    content: string;
    tips?: string[];
    related_topics?: string[];
    character_id?: string | null;
};

function buildLocalGuide(params: { topic: string; content: string; tips?: string[]; characterId?: string | null }): TutorialHintResponse {
    return {
        topic: params.topic,
        content: params.content,
        tips: params.tips ?? [],
        related_topics: [],
        character_id: params.characterId ?? null
    };
}

export async function fetchCharacterGuide(params: { characterId: string; language?: 'en' | 'zh' }): Promise<TutorialHintResponse> {
    const query = new URLSearchParams();
    if (params.language) query.set('language', params.language);
    const path = `/tutorial/character/${encodeURIComponent(params.characterId)}${query.toString() ? `?${query}` : ''}`;
    try {
        return await getJson<TutorialHintResponse>(path, { timeoutMs: 60000 });
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return buildLocalGuide({
                topic: `Character: ${params.characterId}`,
                content: 'Offline guide: This character is ready for missions and exploration.',
                tips: ['Pick a mission that matches the objective.', 'Refuel before dispatching.', 'Use companions in exploration to solve skill-gated tasks.'],
                characterId: params.characterId
            });
        }
        throw err;
    }
}

export async function fetchMissionTypeGuide(params: { missionType: string; language?: 'en' | 'zh' }): Promise<TutorialHintResponse> {
    const query = new URLSearchParams();
    if (params.language) query.set('language', params.language);
    const path = `/tutorial/mission-type/${encodeURIComponent(params.missionType)}${query.toString() ? `?${query}` : ''}`;
    try {
        return await getJson<TutorialHintResponse>(path, { timeoutMs: 60000 });
    } catch (err) {
        if (isOfflineBackendError(err)) {
            const type = params.missionType.toLowerCase();
            const tips: string[] = [];
            if (type.includes('delivery')) tips.push('Plan a safe route and keep speed stable.');
            if (type.includes('rescue') || type.includes('animal')) tips.push('Prioritize safety and keep an eye on hazards.');
            if (type.includes('construction') || type.includes('repair')) tips.push('Bring engineering support to unlock fixes.');
            if (type.includes('exploration')) tips.push('Look for secrets and interactable hotspots.');
            if (tips.length === 0) tips.push('Focus on the mission objective and keep fuel in reserve.');

            return buildLocalGuide({
                topic: `Mission Type: ${params.missionType}`,
                content: 'Offline guide: Use the mission board to dispatch, then complete the flight and continue in exploration.',
                tips
            });
        }
        throw err;
    }
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

function hashString32(input: string): number {
    // FNV-1a 32-bit
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
        hash >>>= 0;
    }
    return hash >>> 0;
}

function mulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function clampDifficulty(raw: string | null | undefined): string {
    const normalized = (raw ?? 'medium').trim().toLowerCase();
    if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard') return normalized;
    return 'medium';
}

function buildLocalEvent(params: {
    characterId: string;
    location: string;
    missionPhase: string;
    originalProblem: string;
    eventType?: string | null;
    difficulty?: string | null;
}): GameEventResponse {
    const seed = hashString32(
        [params.characterId, params.location, params.missionPhase, params.eventType ?? '', params.difficulty ?? '', params.originalProblem].join('|')
    );
    const rng = mulberry32(seed);

    const difficulty = clampDifficulty(params.difficulty);

    const lowerProblem = params.originalProblem.toLowerCase();
    const relatedAbility = (() => {
        if (lowerProblem.includes('traffic') || lowerProblem.includes('crowd')) return 'POLICE';
        if (lowerProblem.includes('broken') || lowerProblem.includes('repair') || lowerProblem.includes('signal')) return 'ENGINEERING';
        if (lowerProblem.includes('missing') || lowerProblem.includes('mystery') || lowerProblem.includes('suspect')) return 'ESPIONAGE';
        if (lowerProblem.includes('dig') || lowerProblem.includes('tunnel') || lowerProblem.includes('recover')) return 'DIGGING';
        if (lowerProblem.includes('animal') || lowerProblem.includes('rescue')) return 'ANIMAL_RESCUE';
        const abilities = ['ENGINEERING', 'POLICE', 'ESPIONAGE', 'DIGGING', 'ANIMAL_RESCUE'];
        return abilities[Math.floor(rng() * abilities.length)];
    })();

    const templates = [
        {
            name: 'Unexpected Obstacle',
            description: `Something blocks the mission route near ${params.location}.`,
            challenge: 'Choose a safe way to proceed without delaying the mission.'
        },
        {
            name: 'Local Request',
            description: `A citizen asks for help during the ${params.missionPhase} phase.`,
            challenge: 'Decide how to assist while staying on schedule.'
        },
        {
            name: 'Equipment Alert',
            description: 'A system warning appears on the dashboard.',
            challenge: 'Stabilize the situation and continue the mission.'
        }
    ];
    const picked = templates[Math.floor(rng() * templates.length)];

    const choices: EventChoice[] = [
        { option: 'Take a careful approach', outcome: 'You proceed carefully and keep things under control.' },
        { option: 'Call for support', outcome: 'Support arrives and the situation improves.' },
        { option: 'Try a quick workaround', outcome: 'You improvise and push forward under pressure.' }
    ];

    return {
        event_id: `local_evt_${seed.toString(16)}`,
        event_type: params.eventType ?? 'local_event',
        name: picked.name,
        description: picked.description,
        challenge: picked.challenge,
        choices,
        difficulty,
        related_ability: relatedAbility,
        reward_potential: null
    };
}

function resolveLocalEvent(params: { eventId: string; choiceIndex: number }): EventResolveResponse {
    const rawSeed = params.eventId.startsWith('local_evt_') ? params.eventId.slice('local_evt_'.length) : params.eventId;
    const seed = hashString32(rawSeed);
    const rng = mulberry32(seed ^ (params.choiceIndex + 1));

    const baseChance = params.choiceIndex === 0 ? 0.75 : params.choiceIndex === 1 ? 0.6 : 0.45;
    const success = rng() < baseChance;

    const outcome = success
        ? 'Success! The team adapts quickly and keeps the mission on track.'
        : 'Setback. The situation is contained, but it costs time and focus.';

    return {
        event_id: params.eventId,
        success,
        outcome,
        rewards: null,
        penalties: null
    };
}

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

function scoreCharacterForMission(missionType: string, characterId: string): number {
    const type = missionType.toLowerCase();
    const id = characterId.toLowerCase();

    let score = 1;

    const prefers = (keywords: string[], preferred: string[]): boolean =>
        keywords.some((k) => type.includes(k)) && preferred.some((p) => id.includes(p));

    if (prefers(['repair', 'build', 'construction', 'signal', 'relay'], ['donnie', 'builder', 'engineer'])) score += 4;
    if (prefers(['rescue', 'animal'], ['dizzy', 'rescue'])) score += 4;
    if (prefers(['police', 'traffic', 'crowd', 'security'], ['paul', 'jerome', 'police'])) score += 3;
    if (prefers(['mystery', 'investigate', 'spy', 'intel'], ['jerome', 'agent', 'spy'])) score += 3;
    if (id.includes('jett')) score += 2;

    return score;
}

function buildLocalRecommendation(params: {
    missionType: string;
    location: string;
    problemDescription: string;
    availableCharacters: string[];
}): DispatchRecommendation {
    const ranking = params.availableCharacters
        .map((id) => ({ character_id: id, score: scoreCharacterForMission(params.missionType, id) }))
        .sort((a, b) => b.score - a.score);
    const best = ranking[0]?.character_id ?? params.availableCharacters[0] ?? 'jett';
    const alternative = ranking[1]?.character_id ?? null;
    const confidence = ranking.length > 0 ? Math.min(0.95, 0.5 + ranking[0]!.score / 10) : 0.5;

    return {
        recommended_character: best,
        confidence,
        reasoning: `Offline heuristic: matched mission keywords for "${params.missionType}".`,
        alternative,
        mission_tips: [`Location: ${params.location}`, `Problem: ${params.problemDescription}`],
        explanation: 'Backend is unavailable; using local recommendations.'
    };
}

function buildLocalBestForMissionType(params: { missionType: string; availableCharacters: string[] }): BestForMissionType {
    const ranking = params.availableCharacters
        .map((id) => ({ character_id: id, score: scoreCharacterForMission(params.missionType, id), reason: 'Offline heuristic score' }))
        .sort((a, b) => b.score - a.score);
    const best = ranking[0]?.character_id ?? params.availableCharacters[0] ?? 'jett';
    return {
        mission_type: params.missionType,
        best_character: best,
        ranking,
        reasoning: 'Backend is unavailable; using offline heuristic ranking.'
    };
}

export async function fetchTutorialHint(params: {
    currentSituation: string;
    characterId?: string | null;
    missionType?: string | null;
}): Promise<TutorialHintResponse> {
    try {
        return await postJson<TutorialHintResponse>(
            '/tutorial/hint',
            {
                current_situation: params.currentSituation,
                character_id: params.characterId ?? null,
                mission_type: params.missionType ?? null,
                player_progress: null
            },
            { timeoutMs: 60000 }
        );
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return buildLocalGuide({
                topic: 'Tip',
                content: 'Offline tip: Use the mission board to dispatch, then explore and interact with NPCs to advance quests.',
                tips: ['Press C in exploration to call companions.', 'Press J to open the quest journal.', 'Interact with doors to enter buildings.'],
                characterId: params.characterId ?? null
            });
        }
        throw err;
    }
}

export async function recommendDispatch(params: {
    missionType: string;
    location: string;
    problemDescription: string;
    urgency?: string;
    availableCharacters: string[];
}): Promise<DispatchRecommendation> {
    try {
        return await postJson<DispatchRecommendation>(
            '/dispatch/recommend',
            {
                mission_type: params.missionType,
                location: params.location,
                problem_description: params.problemDescription,
                urgency: params.urgency ?? 'normal',
                available_characters: params.availableCharacters
            },
            { timeoutMs: 60000 }
        );
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return buildLocalRecommendation(params);
        }
        throw err;
    }
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
    try {
        return await getJson<BestForMissionType>(path, { timeoutMs: 30000 });
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return buildLocalBestForMissionType(params);
        }
        throw err;
    }
}

export async function generateMissionEvent(params: {
    characterId: string;
    location: string;
    missionPhase: string;
    originalProblem: string;
    eventType?: string | null;
    difficulty?: string | null;
}): Promise<GameEventResponse> {
    try {
        return await postJson<GameEventResponse>(
            '/events/generate',
            {
                character_id: params.characterId,
                location: params.location,
                mission_phase: params.missionPhase,
                original_problem: params.originalProblem,
                event_type: params.eventType ?? null,
                difficulty: params.difficulty ?? null
            },
            { timeoutMs: 60000 }
        );
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return buildLocalEvent(params);
        }
        throw err;
    }
}

export async function resolveMissionEvent(params: { eventId: string; choiceIndex: number }): Promise<EventResolveResponse> {
    try {
        return await postJson<EventResolveResponse>(
            '/events/resolve',
            { event_id: params.eventId, choice_index: params.choiceIndex },
            { timeoutMs: 60000 }
        );
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return resolveLocalEvent(params);
        }
        throw err;
    }
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
    try {
        return await postJson<PackageResult>(
            '/assets/generate/custom',
            {
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
            },
            { timeoutMs: 180000 }
        );
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return {
                success: false,
                package_id: 'offline',
                mission_name: params.missionName,
                output_dir: '',
                error_message: 'Backend unavailable; asset packaging requires the FastAPI server.'
            };
        }
        throw err;
    }
}
