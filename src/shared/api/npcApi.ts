import { postJson } from './http';

export type GeneratedNpc = {
    npcId: string;
    name: string;
    role: string;
    personality?: string;
    appearance?: string;
    dialogueStyle?: string;
    locationType?: string;
    hasQuest?: boolean;
    questHint?: string;
};

type NpcGenerateResponse = {
    success: boolean;
    npcs: Array<{
        npc_id: string;
        name: string;
        role: string;
        personality?: string;
        appearance?: string;
        dialogue_style?: string;
        location_type?: string;
        has_quest?: boolean;
        quest_hint?: string;
    }>;
    count: number;
    message?: string | null;
};

export async function generateNpcs(params: {
    location: string;
    locationType?: string;
    role?: string;
    count?: number;
}): Promise<GeneratedNpc[]> {
    const payload: Record<string, unknown> = {
        location: params.location,
        location_type: params.locationType ?? 'outdoor',
        count: params.count ?? 5
    };
    if (params.role) payload.role = params.role;

    const res = await postJson<NpcGenerateResponse>('/npc/generate', payload, { timeoutMs: 60000 });
    if (!res.success) return [];

    return (res.npcs || []).map((npc) => ({
        npcId: npc.npc_id,
        name: npc.name,
        role: npc.role,
        personality: npc.personality,
        appearance: npc.appearance,
        dialogueStyle: npc.dialogue_style,
        locationType: npc.location_type,
        hasQuest: npc.has_quest,
        questHint: npc.quest_hint
    }));
}

