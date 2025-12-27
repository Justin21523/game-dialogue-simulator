import { deleteJson, getBackendAvailability, getJson, isOfflineBackendError, postJson } from './http';

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

function isLocalSession(sessionId: string): boolean {
    return sessionId.startsWith('local_');
}

function buildLocalSession(characterId: string): MissionSessionStartResponse {
    return {
        session_id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        status: 'offline',
        current_phase: 'dispatch',
        character_id: characterId
    };
}

export async function startMissionSession(params: {
    missionType: string;
    location: string;
    problemDescription: string;
    characterId: string;
    npcName?: string | null;
}): Promise<MissionSessionStartResponse> {
    if (getBackendAvailability() === 'unavailable') {
        return buildLocalSession(params.characterId);
    }

    try {
        return await postJson<MissionSessionStartResponse>(
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
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return buildLocalSession(params.characterId);
        }
        throw err;
    }
}

export async function getMissionSessionProgress(sessionId: string): Promise<MissionSessionProgressResponse> {
    if (isLocalSession(sessionId)) {
        return {
            session_id: sessionId,
            current_phase: 'dispatch',
            phase_index: 0,
            character_id: 'unknown',
            location: 'offline',
            events_count: 0
        };
    }
    return getJson<MissionSessionProgressResponse>(`/missions/progress/${encodeURIComponent(sessionId)}`, { timeoutMs: 30000 });
}

export async function advanceMissionSession(
    sessionId: string,
    params?: { action?: string | null; choice?: string | null }
): Promise<MissionSessionAdvanceResponse> {
    if (isLocalSession(sessionId)) {
        return { session_id: sessionId, previous_phase: 'dispatch', current_phase: 'dispatch', completed: false };
    }
    const payload: Record<string, unknown> = {};
    if (params?.action) payload.action = params.action;
    if (params?.choice) payload.choice = params.choice;

    return postJson<MissionSessionAdvanceResponse>(`/missions/advance/${encodeURIComponent(sessionId)}`, payload, { timeoutMs: 60000 });
}

export async function endMissionSession(sessionId: string): Promise<void> {
    if (isLocalSession(sessionId)) return;
    await deleteJson(`/missions/${encodeURIComponent(sessionId)}`, { timeoutMs: 30000 });
}
