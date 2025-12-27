import { getBackendAvailability, isOfflineBackendError, postJson } from './http';

export type NarrationResponse = {
    character_id: string;
    phase: string;
    narration: string;
    location: string;
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

function pick(rng: () => number, items: string[]): string {
    return items[Math.floor(rng() * items.length)] ?? items[0] ?? '';
}

function buildLocalNarration(params: {
    characterId: string;
    phase: string;
    location: string;
    problem?: string | null;
    result?: string | null;
}): NarrationResponse {
    const seed = hashString32([params.characterId, params.phase, params.location, params.problem ?? '', params.result ?? ''].join('|'));
    const rng = mulberry32(seed);
    const phase = params.phase.trim().toLowerCase();
    const problem = params.problem ? params.problem : 'the situation';

    const flying = [
        `Cruising toward ${params.location}.`,
        `En route to ${params.location}. Stay alert.`,
        `Almost there—keeping a steady speed.`
    ];
    const arrival = [
        `Arrived at ${params.location}. Time to assess ${problem}.`,
        `Touchdown near ${params.location}. Let's handle ${problem}.`,
        `We're here. Scanning the area for ${problem}.`
    ];
    const success = [
        `Mission complete. ${problem} is resolved.`,
        `All clear. Great work handling ${problem}.`,
        `Problem solved—returning to base soon.`
    ];

    let narration = '';
    if (phase.includes('fly')) narration = pick(rng, flying);
    else if (phase.includes('arriv') || phase.includes('land')) narration = pick(rng, arrival);
    else if (phase.includes('result') || phase.includes('complete') || params.result === 'success') narration = pick(rng, success);
    else narration = pick(rng, [...flying, ...arrival]);

    return { character_id: params.characterId, phase: params.phase, narration, location: params.location };
}

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
    if (getBackendAvailability() === 'unavailable') {
        return buildLocalNarration(params);
    }

    try {
        return await postJson<NarrationResponse>(
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
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return buildLocalNarration(params);
        }
        throw err;
    }
}
