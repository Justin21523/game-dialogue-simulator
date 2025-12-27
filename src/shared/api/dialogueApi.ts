import { getBackendAvailability, isOfflineBackendError, postJson } from './http';

export type DialogueResponse = {
    character_id: string;
    dialogue: string;
    dialogue_type: string;
};

export type TransformationCallResponse = {
    character_id: string;
    transformation_call: string;
    situation: string;
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

function pick<T>(rng: () => number, items: T[]): T {
    if (items.length === 0) {
        throw new Error('pick() requires a non-empty array');
    }
    return items[Math.floor(rng() * items.length)]!;
}

function buildLocalDialogue(params: {
    characterId: string;
    dialogueType: string;
    situation: string;
    missionPhase?: string | null;
    emotion?: string;
    speakingTo?: string;
    location?: string | null;
    problem?: string | null;
}): DialogueResponse {
    const seed = hashString32(
        [
            params.characterId,
            params.dialogueType,
            params.situation,
            params.missionPhase ?? '',
            params.emotion ?? '',
            params.speakingTo ?? '',
            params.location ?? '',
            params.problem ?? ''
        ].join('|')
    );
    const rng = mulberry32(seed);

    const location = params.location ? params.location : 'the area';
    const problem = params.problem ? params.problem : 'the situation';
    const type = params.dialogueType.trim().toLowerCase();

    const greetings = [
        `Roger! Heading to ${location}.`,
        `All set! Let's help out in ${location}.`,
        `Mission accepted. Next stop: ${location}.`
    ];
    const encouragement = [
        `We can do this. Stay focused!`,
        `Let's keep it steady and safe.`,
        `No worries—I've got this.`
    ];
    const update = [
        `We're on it. The issue is: ${problem}.`,
        `Quick status: dealing with ${problem}.`,
        `Eyes open—${problem} could get tricky.`
    ];

    let dialogue = '';
    if (type.includes('greeting') || type.includes('dispatch')) {
        dialogue = pick(rng, greetings);
    } else if (type.includes('update') || type.includes('narration')) {
        dialogue = pick(rng, update);
    } else if (type.includes('celebrate') || type.includes('success')) {
        dialogue = `Great job! ${problem} is handled.`;
    } else {
        dialogue = pick(rng, encouragement);
    }

    return {
        character_id: params.characterId,
        dialogue,
        dialogue_type: params.dialogueType
    };
}

export async function generateDialogue(params: {
    characterId: string;
    dialogueType: string;
    situation: string;
    missionPhase?: string | null;
    emotion?: string;
    speakingTo?: string;
    dialogueHistory?: string[] | null;
    location?: string | null;
    problem?: string | null;
}): Promise<DialogueResponse> {
    if (getBackendAvailability() === 'unavailable') {
        return buildLocalDialogue(params);
    }

    try {
        return await postJson<DialogueResponse>(
            '/dialogue/generate',
            {
                character_id: params.characterId,
                dialogue_type: params.dialogueType,
                situation: params.situation,
                mission_phase: params.missionPhase ?? null,
                emotion: params.emotion ?? 'happy',
                speaking_to: params.speakingTo ?? 'child',
                dialogue_history: params.dialogueHistory ?? null,
                location: params.location ?? null,
                problem: params.problem ?? null
            },
            { timeoutMs: 60000 }
        );
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return buildLocalDialogue(params);
        }
        throw err;
    }
}

export async function generateGreeting(params: {
    characterId: string;
    location: string;
    problem?: string | null;
}): Promise<string> {
    const res = await generateDialogue({
        characterId: params.characterId,
        dialogueType: 'greeting',
        situation: `Starting mission to ${params.location}`,
        missionPhase: 'dispatch',
        emotion: 'happy',
        speakingTo: 'child',
        location: params.location,
        problem: params.problem ?? null
    });
    return res.dialogue;
}

export async function generateTransformationCall(params: { characterId: string; situation: string }): Promise<string> {
    if (getBackendAvailability() === 'unavailable') {
        return `Time to transform!`;
    }

    const query = new URLSearchParams();
    query.set('situation', params.situation);
    const path = `/dialogue/transformation/${encodeURIComponent(params.characterId)}?${query.toString()}`;
    try {
        const res = await postJson<TransformationCallResponse>(path, null, { timeoutMs: 60000 });
        return res.transformation_call;
    } catch (err) {
        if (isOfflineBackendError(err)) {
            return `Time to transform!`;
        }
        throw err;
    }
}
