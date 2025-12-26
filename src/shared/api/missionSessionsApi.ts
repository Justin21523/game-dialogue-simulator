import { deleteJson, getJson, postJson } from './http';

export type MissionSessionStartResponse = {
    session_id: string;
    status: string;
    current_phase: string;
    character_id: string;
};

export type MissionSessionProgressResponse = {
    session_id: string;
    current_phase: string;
    phase_index: number;
    character_id: string;
    location: string;
    events_count: number;
};

export type MissionSessionAdvanceResponse = {
    session_id: string;
    previous_phase: string;
    current_phase: string;
    completed: boolean;
};

export async function startMissionSession(params: {
    missionType: string;
    location: string;
    problemDescription: string;
    characterId: string;
    npcName?: string | null;
}): Promise<MissionSessionStartResponse> {
    return postJson<MissionSessionStartResponse>(
        '/missions/start',
        {
            mission_type: params.missionType,
            location: params.location,
            problem_description: params.problemDescription,
            character_id: params.characterId,
            npc_name: params.npcName ?? null
        },
        { timeoutMs: 60000 }
    );
}

export async function getMissionSessionProgress(sessionId: string): Promise<MissionSessionProgressResponse> {
    return getJson<MissionSessionProgressResponse>(`/missions/progress/${encodeURIComponent(sessionId)}`, { timeoutMs: 30000 });
}

export async function advanceMissionSession(
    sessionId: string,
    params?: { action?: string | null; choice?: string | null }
): Promise<MissionSessionAdvanceResponse> {
    const payload: Record<string, unknown> = {};
    if (params?.action) payload.action = params.action;
    if (params?.choice) payload.choice = params.choice;

    return postJson<MissionSessionAdvanceResponse>(`/missions/advance/${encodeURIComponent(sessionId)}`, payload, { timeoutMs: 60000 });
}

export async function endMissionSession(sessionId: string): Promise<void> {
    await deleteJson(`/missions/${encodeURIComponent(sessionId)}`, { timeoutMs: 30000 });
}

