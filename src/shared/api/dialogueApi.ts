import { postJson } from './http';

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
    return postJson<DialogueResponse>(
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
    const query = new URLSearchParams();
    query.set('situation', params.situation);
    const path = `/dialogue/transformation/${encodeURIComponent(params.characterId)}?${query.toString()}`;
    const res = await postJson<TransformationCallResponse>(path, null, { timeoutMs: 60000 });
    return res.transformation_call;
}
