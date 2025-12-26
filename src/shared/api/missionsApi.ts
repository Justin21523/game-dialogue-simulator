import type { Mission } from '../types/Game';

import { postJson } from './http';

type MissionGenerateResponse = {
    id: string;
    title: string;
    description: string;
    type: string;
    location: string;
    fuelCost?: number;
    fuel_cost?: number;
    rewardMoney?: number;
    reward_money?: number;
    rewardExp?: number;
    reward_exp?: number;
    campaignId?: string | null;
    campaignTheme?: string | null;
};

export async function generateMission(params: {
    level: number;
    missionType?: string;
    location?: string;
}): Promise<Mission> {
    const payload: Record<string, unknown> = {
        level: params.level
    };
    if (params.missionType) payload.mission_type = params.missionType;
    if (params.location) payload.location = params.location;

    const res = await postJson<MissionGenerateResponse>('/missions/generate', payload, { timeoutMs: 60000 });

    const rewardMoney = res.rewardMoney ?? res.reward_money ?? 100;
    const rewardExp = res.rewardExp ?? res.reward_exp ?? Math.floor(rewardMoney * 0.5);

    return {
        id: res.id,
        title: res.title,
        description: res.description,
        type: res.type,
        location: res.location,
        fuelCost: res.fuelCost ?? res.fuel_cost ?? 10,
        rewardMoney,
        rewardExp,
        campaignId: res.campaignId ?? null,
        campaignTheme: res.campaignTheme ?? null
    };
}

