import { getQuestTemplate } from '../data/gameData.js';
import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';
import type { WorldState } from '../types/World.js';

const STORAGE_KEY = 'sws:world:v1';

const DEFAULT_STATE: WorldState = {
    version: 1,
    unlockedLocations: ['base_airport'],
    worldFlags: [],
    completedQuestTemplates: []
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
    private state: WorldState = { ...DEFAULT_STATE };

    initialize(): void {
        if (this.initialized) return;
        this.initialized = true;
        this.load();
        this.registerListeners();
    }

    getState(): WorldState {
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

    private load(): void {
        try {
            const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as unknown;
            if (!isRecord(parsed)) return;
            const unlocked = Array.isArray(parsed.unlockedLocations) ? parsed.unlockedLocations.filter((v): v is string => typeof v === 'string') : [];
            const flags = Array.isArray(parsed.worldFlags) ? parsed.worldFlags.filter((v): v is string => typeof v === 'string') : [];
            const completed = Array.isArray(parsed.completedQuestTemplates)
                ? parsed.completedQuestTemplates.filter((v): v is string => typeof v === 'string')
                : [];
            this.state = {
                version: 1,
                unlockedLocations: uniq([...DEFAULT_STATE.unlockedLocations, ...unlocked]),
                worldFlags: uniq(flags),
                completedQuestTemplates: uniq(completed)
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
