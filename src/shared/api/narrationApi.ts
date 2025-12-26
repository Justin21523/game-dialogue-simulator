import { postJson } from './http';

export type NarrationResponse = {
    character_id: string;
    phase: string;
    narration: string;
    location: string;
};

export async function generateNarration(params: {
    characterId: string;
    phase: string;
    location: string;
    problem?: string | null;
    solution?: string | null;
    npcName?: string | null;
    conditions?: string | null;
    currentArea?: string | null;
    result?: string | null;
}): Promise<NarrationResponse> {
    return postJson<NarrationResponse>(
        '/narration/generate',
        {
            character_id: params.characterId,
            phase: params.phase,
            location: params.location,
            problem: params.problem ?? null,
            solution: params.solution ?? null,
            npc_name: params.npcName ?? null,
            conditions: params.conditions ?? null,
            current_area: params.currentArea ?? null,
            result: params.result ?? null
        },
        { timeoutMs: 60000 }
    );
}

