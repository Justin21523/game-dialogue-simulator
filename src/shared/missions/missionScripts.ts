import missionsJson from '../../data/missions.json';

export type MissionPhaseId =
    | 'dispatch'
    | 'launch'
    | 'flight'
    | 'arrival'
    | 'transform'
    | 'landing'
    | 'solve'
    | 'return'
    | 'debrief';

export type MissionPhase = {
    phaseId: MissionPhaseId;
    label: string;
    timeLimitMs?: number;
    hooks?: MissionPhaseHook[];
};

export type MissionPhaseHook =
    | { type: 'require_ability'; ability: string; targetId?: string; message?: string }
    | { type: 'gate_world_flag'; flag: string; message?: string }
    | { type: 'gate_item'; itemId: string; quantity: number; message?: string }
    | { type: 'spawn_interactable'; locationId: string; interactableId: string };

export type MissionScriptRewards = {
    money: number;
    exp: number;
};

export type MissionScript = {
    scriptId: string;
    title: string;
    missionType: string;
    description: string;
    locationName: string;
    fuelCost: number;
    rewards: MissionScriptRewards;
    questTemplateId: string;
    explorationStart: { locationId: string; spawnPoint: string };
    phases: MissionPhase[];
};

type RawMissionScripts = {
    mission_scripts: Array<{
        script_id: string;
        title: string;
        mission_type: string;
        description: string;
        location_name: string;
        fuel_cost: number;
        rewards: { money: number; exp: number };
        quest_template_id: string;
        exploration_start: { location_id: string; spawn_point: string };
        phases: Array<{ phase_id: string; label: string; time_limit_ms?: number; hooks?: unknown[] }>;
    }>;
};

const raw = missionsJson as RawMissionScripts;
const scriptById = new Map<string, MissionScript>();

function asPhaseId(value: string): MissionPhaseId | null {
    switch (value) {
        case 'dispatch':
        case 'launch':
        case 'flight':
        case 'arrival':
        case 'transform':
        case 'landing':
        case 'solve':
        case 'return':
        case 'debrief':
            return value;
        default:
            return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function toPhaseHook(raw: unknown): MissionPhaseHook | null {
    if (!isRecord(raw)) return null;
    const type = String(raw.type ?? '').trim();
    if (!type) return null;

    if (type === 'require_ability') {
        const ability = String(raw.ability ?? '').trim();
        if (!ability) return null;
        const targetId = typeof raw.target_id === 'string' && raw.target_id.trim().length > 0 ? raw.target_id : undefined;
        const message = typeof raw.message === 'string' && raw.message.trim().length > 0 ? raw.message : undefined;
        return { type: 'require_ability', ability, targetId, message };
    }

    if (type === 'gate_world_flag') {
        const flag = String(raw.flag ?? '').trim();
        if (!flag) return null;
        const message = typeof raw.message === 'string' && raw.message.trim().length > 0 ? raw.message : undefined;
        return { type: 'gate_world_flag', flag, message };
    }

    if (type === 'gate_item') {
        const itemId = String(raw.item_id ?? '').trim();
        if (!itemId) return null;
        const qtyRaw = typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) ? Math.floor(raw.quantity) : 1;
        const quantity = Math.max(1, qtyRaw);
        const message = typeof raw.message === 'string' && raw.message.trim().length > 0 ? raw.message : undefined;
        return { type: 'gate_item', itemId, quantity, message };
    }

    if (type === 'spawn_interactable') {
        const locationId = String(raw.location_id ?? '').trim();
        const interactableId = String(raw.interactable_id ?? '').trim();
        if (!locationId || !interactableId) return null;
        return { type: 'spawn_interactable', locationId, interactableId };
    }

    return null;
}

for (const entry of raw.mission_scripts ?? []) {
    if (!entry || typeof entry.script_id !== 'string' || !entry.script_id) continue;
    if (!entry.title || !entry.mission_type || !entry.description || !entry.location_name) continue;
    if (typeof entry.quest_template_id !== 'string' || !entry.quest_template_id) continue;
    if (!entry.exploration_start || typeof entry.exploration_start.location_id !== 'string') continue;

    const phases: MissionPhase[] = (entry.phases ?? [])
        .map((p) => {
            const phaseId = asPhaseId(String(p.phase_id ?? '').trim());
            if (!phaseId) return null;
            const label = String(p.label ?? '').trim();
            if (!label) return null;
            const timeLimitMs = typeof p.time_limit_ms === 'number' && Number.isFinite(p.time_limit_ms) ? Math.max(0, p.time_limit_ms) : undefined;
            const hooks = Array.isArray(p.hooks) ? p.hooks.map(toPhaseHook).filter((h): h is MissionPhaseHook => Boolean(h)) : [];

            const base: MissionPhase = timeLimitMs !== undefined ? { phaseId, label, timeLimitMs } : { phaseId, label };
            return hooks.length > 0 ? { ...base, hooks } : base;
        })
        .filter((p): p is MissionPhase => Boolean(p));

    const script: MissionScript = {
        scriptId: entry.script_id,
        title: entry.title,
        missionType: entry.mission_type,
        description: entry.description,
        locationName: entry.location_name,
        fuelCost: typeof entry.fuel_cost === 'number' && Number.isFinite(entry.fuel_cost) ? Math.max(0, entry.fuel_cost) : 0,
        rewards: {
            money: Math.max(0, Math.floor(entry.rewards?.money ?? 0)),
            exp: Math.max(0, Math.floor(entry.rewards?.exp ?? 0))
        },
        questTemplateId: entry.quest_template_id,
        explorationStart: {
            locationId: entry.exploration_start.location_id,
            spawnPoint: entry.exploration_start.spawn_point ?? 'default'
        },
        phases
    };

    scriptById.set(script.scriptId, script);
}

export function listMissionScripts(): MissionScript[] {
    return Array.from(scriptById.values());
}

export function getMissionScript(scriptId: string): MissionScript | null {
    return scriptById.get(scriptId) ?? null;
}
