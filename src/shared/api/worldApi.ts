import { postJson } from './http';

export type WorldNpcSpec = {
    id: string;
    name: string;
    type: string;
    archetype?: string | null;
    x: number;
    y: number;
    appearance?: string | null;
    model_key?: string | null;
    dialogue: string[];
    personality?: string | null;
    has_quest: boolean;
    quest_id?: string | null;
};

export type WorldBuildingSpec = {
    id: string;
    name: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    asset_key?: string | null;
    can_enter: boolean;
    interior_id?: string | null;
};

export type WorldItemSpec = {
    id: string;
    name: string;
    type: string;
    x: number;
    y: number;
    asset_key?: string | null;
    value: number;
};

export type WorldPoiSpec = {
    id: string;
    name: string;
    type: string;
    x: number;
    y: number;
    description?: string | null;
};

export type WorldSpec = {
    destination: string;
    theme: string;
    background_key: string;
    time_of_day: string;
    weather: string;
    npcs: WorldNpcSpec[];
    buildings: WorldBuildingSpec[];
    items: WorldItemSpec[];
    pois: WorldPoiSpec[];
    trace_id?: string | null;
    generation_time?: number | null;
};

type WorldGenerateResponse = {
    success: boolean;
    world_spec?: WorldSpec | null;
    error?: string | null;
    generation_time?: number | null;
};

export async function generateWorld(params: {
    destination: string;
    missionType?: string;
    difficulty?: 'easy' | 'normal' | 'hard';
    traceId?: string;
}): Promise<WorldSpec> {
    const payload: Record<string, unknown> = {
        destination: params.destination,
        mission_type: params.missionType ?? 'exploration',
        difficulty: params.difficulty ?? 'normal',
        trace_id: params.traceId ?? null
    };

    const res = await postJson<WorldGenerateResponse>('/world/generate', payload, { timeoutMs: 90000 });
    if (!res.success || !res.world_spec) {
        throw new Error(res.error || 'World generation failed');
    }
    return res.world_spec;
}

