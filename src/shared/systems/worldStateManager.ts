import { getQuestTemplate } from '../data/gameData.js';
import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';
import type { PlayerSaveState, WorldState, WorldStateV1, WorldStateV2 } from '../types/World.js';

const STORAGE_KEY = 'sws:world:v2';

const DEFAULT_STATE: WorldStateV2 = {
    version: 2,
    unlockedLocations: ['base_airport', 'town_district'],
    worldFlags: [],
    completedQuestTemplates: [],
    inventory: {},
    unlockedCompanions: [],
    unlockedSkills: [],
    lastPlayerState: null
};

function uniq(values: string[]): string[] {
    return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

export class WorldStateManager {
    private initialized = false;
    private listenersRegistered = false;
    private state: WorldStateV2 = { ...DEFAULT_STATE };

    initialize(): void {
        if (this.initialized) return;
        this.initialized = true;
        this.load();
        this.registerListeners();
    }

    getState(): WorldStateV2 {
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

    private load(): void {
        try {
            const raw =
                globalThis.localStorage?.getItem(STORAGE_KEY) ??
                // Backwards compatibility (pre-v2 saves).
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
                    version: 2,
                    unlockedLocations: uniq([...DEFAULT_STATE.unlockedLocations, ...unlocked]),
                    worldFlags: uniq(flags),
                    completedQuestTemplates: uniq(completed),
                    inventory,
                    unlockedCompanions: uniq(unlockedCompanions),
                    unlockedSkills: uniq(unlockedSkills),
                    lastPlayerState:
                        lastPlayerState && lastPlayerState.locationId && Number.isFinite(lastPlayerState.x) && Number.isFinite(lastPlayerState.y)
                            ? lastPlayerState
                            : null
                };
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
                worldFlags: v1.worldFlags,
                completedQuestTemplates: v1.completedQuestTemplates
            };
        } catch {
            // Ignore corrupted state.
        }
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
