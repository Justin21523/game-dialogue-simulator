import { getQuestTemplate } from '../data/gameData.js';
import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';
import type { FlightResult } from '../flightEvents.js';
import { CompanionAbility, type CompanionAbility as CompanionAbilityType } from '../types/Companion.js';
import type { Mission } from '../types/Game.js';
import type {
    ActiveMissionSession,
    InteractableDefinition,
    MissionLogEntry,
    MissionLogKind,
    MissionSessionPhaseId,
    PlayerSaveState,
    WorldState,
    WorldStateV1,
    WorldStateV2,
    WorldStateV3
} from '../types/World.js';

const STORAGE_KEY = 'sws:world:v3';

const DEFAULT_STATE: WorldStateV3 = {
    version: 3,
    unlockedLocations: ['base_airport', 'town_district', 'warehouse_district'],
    discoveredLocations: ['base_airport'],
    worldFlags: [],
    completedQuestTemplates: [],
    inventory: {},
    unlockedCompanions: [],
    unlockedSkills: [],
    lastPlayerState: null,
    activeMissionSession: null
};

function uniq(values: string[]): string[] {
    return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function coerceString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function coerceNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function coerceAbility(value: unknown): CompanionAbilityType | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return (Object.values(CompanionAbility) as string[]).includes(trimmed) ? (trimmed as CompanionAbilityType) : undefined;
}

function coerceMissionPhaseId(value: unknown): MissionSessionPhaseId | null {
    const phase = coerceString(value);
    if (!phase) return null;
    const lowered = phase.toLowerCase();
    const allowed: MissionSessionPhaseId[] = [
        'dispatch',
        'launch',
        'flight',
        'arrival',
        'transform',
        'landing',
        'solve',
        'return',
        'debrief'
    ];
    return (allowed as string[]).includes(lowered) ? (lowered as MissionSessionPhaseId) : null;
}

function coerceMission(value: unknown): Mission | null {
    if (!isRecord(value)) return null;
    const id = coerceString(value.id);
    const title = coerceString(value.title);
    const type = coerceString(value.type);
    const description = coerceString(value.description);
    const location = coerceString(value.location);
    const fuelCost = coerceNumber(value.fuelCost);
    const rewardMoney = coerceNumber(value.rewardMoney);
    const rewardExp = coerceNumber(value.rewardExp);
    if (!id || !title || !type || !description || !location) return null;
    if (fuelCost === null || rewardMoney === null || rewardExp === null) return null;

    return {
        id,
        title,
        type,
        description,
        location,
        fuelCost,
        rewardMoney,
        rewardExp,
        campaignId: coerceString(value.campaignId) ?? null,
        campaignTheme: coerceString(value.campaignTheme) ?? null,
        missionScriptId: coerceString(value.missionScriptId) ?? null,
        questTemplateId: coerceString(value.questTemplateId) ?? null,
        explorationStartLocationId: coerceString(value.explorationStartLocationId) ?? null,
        explorationSpawnPoint: coerceString(value.explorationSpawnPoint) ?? null
    };
}

function coerceFlightResult(value: unknown): FlightResult | null {
    if (!isRecord(value)) return null;
    const missionId = coerceString(value.missionId);
    const missionType = coerceString(value.missionType);
    const charId = coerceString(value.charId);
    const score = coerceNumber(value.score);
    const success = typeof value.success === 'boolean' ? value.success : null;
    if (!missionId || !missionType || !charId || score === null || success === null) return null;

    const flightStats = isRecord(value.flightStats)
        ? {
              coinsCollected: Math.max(0, Math.floor(coerceNumber(value.flightStats.coinsCollected) ?? 0)),
              obstaclesHit: Math.max(0, Math.floor(coerceNumber(value.flightStats.obstaclesHit) ?? 0)),
              flightTime: Math.max(0, coerceNumber(value.flightStats.flightTime) ?? 0),
              boostsUsed: Math.max(0, Math.floor(coerceNumber(value.flightStats.boostsUsed) ?? 0)),
              distance: Math.max(0, coerceNumber(value.flightStats.distance) ?? 0)
          }
        : undefined;

    return { missionId, missionType, charId, score, success, flightStats };
}

function coerceMissionLogKind(value: unknown): MissionLogKind | null {
    const kind = coerceString(value);
    if (!kind) return null;
    const lowered = kind.toLowerCase();
    const allowed: MissionLogKind[] = ['system', 'dialogue', 'narration', 'event'];
    return (allowed as string[]).includes(lowered) ? (lowered as MissionLogKind) : null;
}

function coerceMissionLogEntry(value: unknown): MissionLogEntry | null {
    if (!isRecord(value)) return null;
    const id = coerceString(value.id);
    const timestamp = coerceNumber(value.timestamp);
    const phaseId = coerceMissionPhaseId(value.phaseId);
    const kind = coerceMissionLogKind(value.kind);
    const text = typeof value.text === 'string' ? value.text : null;
    if (!id || timestamp === null || !phaseId || !kind || !text) return null;

    const title = typeof value.title === 'string' && value.title ? value.title : undefined;
    const eventId = typeof value.eventId === 'string' && value.eventId ? value.eventId : undefined;
    const choices = Array.isArray(value.choices)
        ? value.choices
              .map((c): { id: string; text: string; resolved?: boolean } | null => {
                  if (!isRecord(c)) return null;
                  const choiceId = coerceString(c.id);
                  const choiceText = typeof c.text === 'string' ? c.text : null;
                  if (!choiceId || !choiceText) return null;
                  const resolved = typeof c.resolved === 'boolean' ? c.resolved : undefined;
                  return { id: choiceId, text: choiceText, resolved };
              })
              .filter((c): c is { id: string; text: string; resolved?: boolean } => Boolean(c))
        : undefined;

    return { id, timestamp, phaseId, kind, title, text, eventId, choices };
}

function coerceSpawnedInteractable(value: unknown): { locationId: string; interactable: InteractableDefinition } | null {
    if (!isRecord(value)) return null;

    const locationId = coerceString(value.locationId);
    const raw = isRecord(value.interactable) ? value.interactable : null;
    if (!locationId || !raw) return null;

    const interactableId = coerceString(raw.interactableId);
    const type = coerceString(raw.type);
    const x = coerceNumber(raw.x);
    const y = coerceNumber(raw.y);
    const label = coerceString(raw.label);
    if (!interactableId || !type || x === null || y === null || !label) return null;

    const requiredAbility = coerceAbility(raw.requiredAbility);
    const targetLocationId = coerceString(raw.targetLocationId) ?? undefined;
    const targetSpawnPoint = coerceString(raw.targetSpawnPoint) ?? undefined;
    const message = coerceString(raw.message) ?? undefined;

    const interactable: InteractableDefinition = {
        interactableId,
        type: type as InteractableDefinition['type'],
        x,
        y,
        label,
        requiredAbility,
        targetLocationId,
        targetSpawnPoint,
        message
    };

    return { locationId, interactable };
}

function coerceActiveMissionSession(value: unknown): ActiveMissionSession | null {
    if (!isRecord(value)) return null;

    const actorId = coerceString(value.actorId);
    const phaseId = coerceMissionPhaseId(value.phaseId);
    const mission = coerceMission(value.mission);
    if (!actorId || !phaseId || !mission) return null;

    const sessionId = typeof value.sessionId === 'string' && value.sessionId ? value.sessionId : null;
    const missionQuestId = coerceString(value.missionQuestId) ?? null;
    const locationId = typeof value.locationId === 'string' && value.locationId ? value.locationId : null;
    const startedAt = coerceNumber(value.startedAt);
    const updatedAt = coerceNumber(value.updatedAt);
    if (startedAt === null || updatedAt === null) return null;

    const phaseStartedAt = coerceNumber(value.phaseStartedAt) ?? startedAt;
    const inboundFlight = value.inboundFlight ? coerceFlightResult(value.inboundFlight) : null;
    const spawnedInteractables = Array.isArray(value.spawnedInteractables)
        ? value.spawnedInteractables
              .map(coerceSpawnedInteractable)
              .filter((v): v is { locationId: string; interactable: InteractableDefinition } => Boolean(v))
              .slice(-40)
        : [];
    const log = Array.isArray(value.log)
        ? value.log.map(coerceMissionLogEntry).filter((e): e is MissionLogEntry => Boolean(e)).slice(-200)
        : [];

    return {
        sessionId,
        actorId,
        missionQuestId,
        spawnedInteractables,
        phaseId,
        phaseStartedAt,
        locationId,
        mission,
        inboundFlight,
        startedAt,
        updatedAt,
        log
    };
}

export class WorldStateManager {
    private initialized = false;
    private listenersRegistered = false;
    private state: WorldStateV3 = { ...DEFAULT_STATE };

    initialize(): void {
        if (this.initialized) return;
        this.initialized = true;
        this.load();
        this.registerListeners();
    }

    getState(): WorldStateV3 {
        this.initialize();
        return this.state;
    }

    isLocationUnlocked(locationId: string): boolean {
        this.initialize();
        return this.state.unlockedLocations.includes(locationId);
    }

    unlockLocations(locationIds: string[]): void {
        this.initialize();
        const next = uniq([...this.state.unlockedLocations, ...locationIds.filter(Boolean)]);
        if (next.length === this.state.unlockedLocations.length) return;
        this.state = { ...this.state, unlockedLocations: next };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    isLocationDiscovered(locationId: string): boolean {
        this.initialize();
        return this.state.discoveredLocations.includes(locationId);
    }

    discoverLocation(locationId: string): void {
        this.initialize();
        if (!locationId) return;
        if (this.state.discoveredLocations.includes(locationId)) return;
        this.state = { ...this.state, discoveredLocations: uniq([...this.state.discoveredLocations, locationId]) };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
        eventBus.emit(EVENTS.LOCATION_DISCOVERED, { locationId });
    }

    isQuestTemplateCompleted(templateId: string): boolean {
        this.initialize();
        return this.state.completedQuestTemplates.includes(templateId);
    }

    markQuestTemplateCompleted(templateId: string): void {
        this.initialize();
        if (!templateId) return;
        if (this.state.completedQuestTemplates.includes(templateId)) return;
        this.state = { ...this.state, completedQuestTemplates: uniq([...this.state.completedQuestTemplates, templateId]) };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    setWorldFlag(flag: string): void {
        this.initialize();
        if (!flag) return;
        if (this.state.worldFlags.includes(flag)) return;
        this.state = { ...this.state, worldFlags: uniq([...this.state.worldFlags, flag]) };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    hasWorldFlag(flag: string): boolean {
        this.initialize();
        return this.state.worldFlags.includes(flag);
    }

    getItemCount(itemId: string): number {
        this.initialize();
        const count = this.state.inventory[itemId];
        return typeof count === 'number' && Number.isFinite(count) ? Math.max(0, count) : 0;
    }

    hasItem(itemId: string, quantity = 1): boolean {
        return this.getItemCount(itemId) >= Math.max(1, quantity);
    }

    addItem(itemId: string, quantity = 1): void {
        this.initialize();
        if (!itemId) return;
        const qty = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
        const current = this.getItemCount(itemId);
        const next = current + qty;
        this.state = { ...this.state, inventory: { ...this.state.inventory, [itemId]: next } };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    removeItem(itemId: string, quantity = 1): boolean {
        this.initialize();
        if (!itemId) return false;
        const qty = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
        const current = this.getItemCount(itemId);
        if (current < qty) return false;
        const next = current - qty;
        const inventory = { ...this.state.inventory };
        if (next <= 0) {
            delete inventory[itemId];
        } else {
            inventory[itemId] = next;
        }
        this.state = { ...this.state, inventory };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
        return true;
    }

    isCompanionUnlocked(companionId: string): boolean {
        this.initialize();
        return this.state.unlockedCompanions.includes(companionId);
    }

    unlockCompanions(companionIds: string[]): void {
        this.initialize();
        const next = uniq([...this.state.unlockedCompanions, ...companionIds.filter(Boolean)]);
        if (next.length === this.state.unlockedCompanions.length) return;
        this.state = { ...this.state, unlockedCompanions: next };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    isSkillUnlocked(skillId: string): boolean {
        this.initialize();
        return this.state.unlockedSkills.includes(skillId);
    }

    unlockSkill(skillId: string): void {
        this.initialize();
        if (!skillId) return;
        if (this.state.unlockedSkills.includes(skillId)) return;
        this.state = { ...this.state, unlockedSkills: uniq([...this.state.unlockedSkills, skillId]) };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    getLastPlayerState(): PlayerSaveState | null {
        this.initialize();
        return this.state.lastPlayerState;
    }

    setLastPlayerState(state: PlayerSaveState): void {
        this.initialize();
        this.state = { ...this.state, lastPlayerState: state };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    getActiveMissionSession(): ActiveMissionSession | null {
        this.initialize();
        return this.state.activeMissionSession;
    }

    setActiveMissionSession(session: ActiveMissionSession | null): void {
        this.initialize();
        this.state = { ...this.state, activeMissionSession: session };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    clearActiveMissionSession(): void {
        this.setActiveMissionSession(null);
    }

    updateActiveMissionSession(patch: Partial<ActiveMissionSession>): void {
        this.initialize();
        const current = this.state.activeMissionSession;
        if (!current) return;
        const updatedAt = Date.now();
        this.state = { ...this.state, activeMissionSession: { ...current, ...patch, updatedAt } };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
    }

    appendMissionLog(entry: Omit<MissionLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): MissionLogEntry | null {
        this.initialize();
        const current = this.state.activeMissionSession;
        if (!current) return null;

        const timestamp = typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
        const id = entry.id && entry.id.trim().length > 0 ? entry.id : `ml_${timestamp}_${Math.random().toString(16).slice(2)}`;

        const phaseId = entry.phaseId;
        const kind = entry.kind;
        const text = entry.text;
        if (!phaseId || !kind || !text) return null;

        const item: MissionLogEntry = {
            id,
            timestamp,
            phaseId,
            kind,
            title: entry.title,
            text,
            eventId: entry.eventId,
            choices: entry.choices
        };

        const nextLog = [...current.log, item].slice(-200);
        this.state = { ...this.state, activeMissionSession: { ...current, log: nextLog, updatedAt: Date.now() } };
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { state: this.state });
        return item;
    }

    private load(): void {
        try {
            const raw =
                globalThis.localStorage?.getItem(STORAGE_KEY) ??
                // Backwards compatibility (pre-v3 saves).
                globalThis.localStorage?.getItem('sws:world:v2') ??
                globalThis.localStorage?.getItem('sws:world:v1');
            if (!raw) return;
            const parsed = JSON.parse(raw) as unknown;
            if (!isRecord(parsed)) return;

            const versionRaw = parsed.version;
            const version = typeof versionRaw === 'number' ? versionRaw : 1;

            const unlocked = Array.isArray(parsed.unlockedLocations) ? parsed.unlockedLocations.filter((v): v is string => typeof v === 'string') : [];
            const flags = Array.isArray(parsed.worldFlags) ? parsed.worldFlags.filter((v): v is string => typeof v === 'string') : [];
            const completed = Array.isArray(parsed.completedQuestTemplates)
                ? parsed.completedQuestTemplates.filter((v): v is string => typeof v === 'string')
                : [];

            if (version === 3) {
                const inventoryRaw = isRecord(parsed.inventory) ? parsed.inventory : {};
                const inventory: Record<string, number> = {};
                for (const [key, value] of Object.entries(inventoryRaw)) {
                    if (typeof key !== 'string' || !key) continue;
                    const n = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
                    if (n > 0) inventory[key] = n;
                }

                const unlockedCompanions = Array.isArray(parsed.unlockedCompanions)
                    ? parsed.unlockedCompanions.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                    : [];
                const unlockedSkills = Array.isArray(parsed.unlockedSkills)
                    ? parsed.unlockedSkills.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                    : [];

                const discoveredLocations = Array.isArray((parsed as { discoveredLocations?: unknown }).discoveredLocations)
                    ? ((parsed as { discoveredLocations?: unknown }).discoveredLocations as unknown[]).filter(
                          (v): v is string => typeof v === 'string' && v.trim().length > 0
                      )
                    : [];

                const lastPlayerState: PlayerSaveState | null = isRecord(parsed.lastPlayerState)
                    ? {
                          locationId: String(parsed.lastPlayerState.locationId ?? ''),
                          spawnPoint: String(parsed.lastPlayerState.spawnPoint ?? 'default'),
                          x: Number(parsed.lastPlayerState.x ?? 0),
                          y: Number(parsed.lastPlayerState.y ?? 0),
                          movementMode:
                              parsed.lastPlayerState.movementMode === 'hover'
                                  ? 'hover'
                                  : parsed.lastPlayerState.movementMode === 'walk'
                                    ? 'walk'
                                    : undefined
                      }
                    : null;

                const activeMissionSession = coerceActiveMissionSession((parsed as { activeMissionSession?: unknown }).activeMissionSession);

                this.state = {
                    version: 3,
                    unlockedLocations: uniq([...DEFAULT_STATE.unlockedLocations, ...unlocked]),
                    discoveredLocations: uniq([...DEFAULT_STATE.discoveredLocations, ...discoveredLocations]),
                    worldFlags: uniq(flags),
                    completedQuestTemplates: uniq(completed),
                    inventory,
                    unlockedCompanions: uniq(unlockedCompanions),
                    unlockedSkills: uniq(unlockedSkills),
                    lastPlayerState:
                        lastPlayerState && lastPlayerState.locationId && Number.isFinite(lastPlayerState.x) && Number.isFinite(lastPlayerState.y)
                            ? lastPlayerState
                            : null,
                    activeMissionSession
                };
                this.applyCompletedQuestUnlocks();
                return;
            }

            if (version === 2) {
                const inventoryRaw = isRecord(parsed.inventory) ? parsed.inventory : {};
                const inventory: Record<string, number> = {};
                for (const [key, value] of Object.entries(inventoryRaw)) {
                    if (typeof key !== 'string' || !key) continue;
                    const n = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
                    if (n > 0) inventory[key] = n;
                }

                const unlockedCompanions = Array.isArray(parsed.unlockedCompanions)
                    ? parsed.unlockedCompanions.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                    : [];
                const unlockedSkills = Array.isArray(parsed.unlockedSkills)
                    ? parsed.unlockedSkills.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                    : [];

                const lastPlayerState: PlayerSaveState | null = isRecord(parsed.lastPlayerState)
                    ? {
                          locationId: String(parsed.lastPlayerState.locationId ?? ''),
                          spawnPoint: String(parsed.lastPlayerState.spawnPoint ?? 'default'),
                          x: Number(parsed.lastPlayerState.x ?? 0),
                          y: Number(parsed.lastPlayerState.y ?? 0),
                          movementMode:
                              parsed.lastPlayerState.movementMode === 'hover'
                                  ? 'hover'
                                  : parsed.lastPlayerState.movementMode === 'walk'
                                    ? 'walk'
                                    : undefined
                      }
                    : null;

                this.state = {
                    version: 3,
                    unlockedLocations: uniq([...DEFAULT_STATE.unlockedLocations, ...unlocked]),
                    discoveredLocations: uniq([...DEFAULT_STATE.discoveredLocations, ...unlocked]),
                    worldFlags: uniq(flags),
                    completedQuestTemplates: uniq(completed),
                    inventory,
                    unlockedCompanions: uniq(unlockedCompanions),
                    unlockedSkills: uniq(unlockedSkills),
                    lastPlayerState:
                        lastPlayerState && lastPlayerState.locationId && Number.isFinite(lastPlayerState.x) && Number.isFinite(lastPlayerState.y)
                            ? lastPlayerState
                            : null,
                    activeMissionSession: null
                };
                this.applyCompletedQuestUnlocks();
                return;
            }

            // v1 migration → v2
            const v1: WorldStateV1 = {
                version: 1,
                unlockedLocations: uniq([...DEFAULT_STATE.unlockedLocations, ...unlocked]),
                worldFlags: uniq(flags),
                completedQuestTemplates: uniq(completed)
            };

            this.state = {
                ...DEFAULT_STATE,
                unlockedLocations: v1.unlockedLocations,
                discoveredLocations: uniq([...DEFAULT_STATE.discoveredLocations, ...v1.unlockedLocations]),
                worldFlags: v1.worldFlags,
                completedQuestTemplates: v1.completedQuestTemplates
            };
            this.applyCompletedQuestUnlocks();
        } catch {
            // Ignore corrupted state.
        }
    }

    private applyCompletedQuestUnlocks(): void {
        const next = new Set(this.state.unlockedLocations);
        for (const templateId of this.state.completedQuestTemplates) {
            const template = getQuestTemplate(templateId);
            if (!template) continue;
            if (template.destinationLocationId) {
                next.add(template.destinationLocationId);
            }
            for (const loc of template.rewards.unlockLocations ?? []) {
                if (loc) next.add(loc);
            }
        }
        if (next.size === this.state.unlockedLocations.length) return;
        this.state = { ...this.state, unlockedLocations: Array.from(next) };
    }

    private persist(): void {
        try {
            globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch {
            // Ignore write failures.
        }
    }

    private registerListeners(): void {
        if (this.listenersRegistered) return;
        this.listenersRegistered = true;

        eventBus.on(EVENTS.LOCATION_ENTERED, (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{ locationId: string }>;
            if (typeof data.locationId !== 'string' || !data.locationId) return;
            this.discoverLocation(data.locationId);
        });

        eventBus.on(EVENTS.ITEM_COLLECTED, (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{ itemId: string; quantity: number }>;
            if (typeof data.itemId !== 'string' || !data.itemId) return;
            const qty = typeof data.quantity === 'number' && Number.isFinite(data.quantity) ? data.quantity : 1;
            this.addItem(data.itemId, qty);
        });

        eventBus.on(EVENTS.DELIVER_ITEM, (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{ itemId: string; quantity: number }>;
            if (typeof data.itemId !== 'string' || !data.itemId) return;
            const qty = typeof data.quantity === 'number' && Number.isFinite(data.quantity) ? data.quantity : 1;
            this.removeItem(data.itemId, qty);
        });

        eventBus.on(EVENTS.QUEST_ACCEPTED, (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{ quest: { destination?: string | null; templateId?: string | null } }>;
            const destination = data.quest?.destination;
            if (typeof destination === 'string' && destination) {
                this.unlockLocations([destination]);
            }

            const templateId = data.quest?.templateId;
            if (typeof templateId === 'string' && templateId) {
                const template = getQuestTemplate(templateId);
                const unlocks = template?.rewards.unlockLocations ?? [];
                if (unlocks.length > 0) {
                    this.unlockLocations(unlocks);
                }
            }
        });

        eventBus.on(EVENTS.QUEST_COMPLETED, (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{ quest: { templateId?: string | null } }>;
            const templateId = data.quest?.templateId;
            if (typeof templateId === 'string' && templateId) {
                this.markQuestTemplateCompleted(templateId);
                const template = getQuestTemplate(templateId);
                const unlocks = template?.rewards.unlockLocations ?? [];
                if (unlocks.length > 0) {
                    this.unlockLocations(unlocks);
                }
            }
        });
    }
}

export const worldStateManager = new WorldStateManager();
