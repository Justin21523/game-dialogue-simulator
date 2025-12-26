import { getCompanion, listCompanions } from '../data/gameData.js';
import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';
import { worldStateManager } from './worldStateManager.js';
import type { CompanionAbility, CompanionState } from '../types/Companion.js';

const STORAGE_KEY = 'sws:companions:v2';

export class CompanionManager {
    private initialized = false;
    private listenersRegistered = false;
    private called = new Set<string>();
    private unlocked = new Set<string>();
    private selected: string | null = null;

    initialize(): void {
        if (this.initialized) return;
        this.initialized = true;

        try {
            const raw =
                globalThis.localStorage?.getItem(STORAGE_KEY) ??
                // Backwards compatibility (pre-v2 saves).
                globalThis.localStorage?.getItem('sws:companions:v1');
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<CompanionState> | null;

                const calledIds = Array.isArray(parsed?.called) ? parsed?.called.filter((id): id is string => typeof id === 'string') : [];
                this.called = new Set(calledIds);

                const unlockedIds = Array.isArray((parsed as Partial<CompanionState>)?.unlocked)
                    ? ((parsed as Partial<CompanionState>).unlocked ?? []).filter((id): id is string => typeof id === 'string')
                    : calledIds;
                this.unlocked = new Set(unlockedIds);

                this.selected =
                    typeof (parsed as Partial<CompanionState>)?.selected === 'string' ? (parsed as Partial<CompanionState>).selected ?? null : null;
            }
        } catch {
            // Ignore storage failures.
        }

        // Ensure at least default companions are unlocked for a fresh profile.
        this.refreshUnlockedFromWorld();
        this.registerListeners();
    }

    getUnlockedCompanionIds(): string[] {
        this.initialize();
        return [...this.unlocked];
    }

    isCompanionUnlocked(companionId: string): boolean {
        this.initialize();
        return this.unlocked.has(companionId);
    }

    getCalledCompanionIds(): string[] {
        this.initialize();
        return [...this.called];
    }

    isCompanionCalled(companionId: string): boolean {
        this.initialize();
        return this.called.has(companionId);
    }

    getSelectedCompanionId(): string | null {
        this.initialize();
        return this.selected;
    }

    selectCompanion(companionId: string | null): void {
        this.initialize();
        if (companionId && !this.unlocked.has(companionId)) return;
        this.selected = companionId;
        this.persist();
        eventBus.emit(EVENTS.WORLD_STATE_CHANGED, { selectedCompanionId: companionId });
    }

    isAbilityAvailable(ability: CompanionAbility): boolean {
        this.initialize();
        for (const id of this.called) {
            const def = getCompanion(id);
            if (def?.abilities.includes(ability)) return true;
        }
        return false;
    }

    callCompanion(companionId: string, actorId: string): boolean {
        this.initialize();
        const def = getCompanion(companionId);
        if (!def) return false;
        if (!this.unlocked.has(companionId)) return false;
        if (this.called.has(companionId)) return true;

        this.called.add(companionId);
        this.persist();

        eventBus.emit(EVENTS.COMPANION_CALLED, {
            companionId,
            actorId,
            abilities: def.abilities
        });
        return true;
    }

    unlockCompanion(companionId: string): boolean {
        this.initialize();
        if (!companionId) return false;
        const def = getCompanion(companionId);
        if (!def) return false;
        if (this.unlocked.has(companionId)) return true;
        this.unlocked.add(companionId);
        this.persist();
        return true;
    }

    resetCalled(): void {
        this.initialize();
        this.called.clear();
        this.persist();
        eventBus.emit(EVENTS.COMPANIONS_RESET, {});
    }

    listAllCompanions() {
        return listCompanions();
    }

    refreshUnlockedFromWorld(): void {
        worldStateManager.initialize();
        const world = worldStateManager.getState();

        const newlyUnlocked: string[] = [];
        for (const def of listCompanions()) {
            if (this.unlocked.has(def.companionId)) continue;
            if (world.unlockedCompanions.includes(def.companionId)) {
                this.unlocked.add(def.companionId);
                newlyUnlocked.push(def.companionId);
                continue;
            }

            const unlock = def.unlock;
            if (!unlock || unlock.type === 'default') {
                this.unlocked.add(def.companionId);
                newlyUnlocked.push(def.companionId);
                continue;
            }
            if (unlock.type === 'world_flag' && world.worldFlags.includes(unlock.flag)) {
                this.unlocked.add(def.companionId);
                newlyUnlocked.push(def.companionId);
                continue;
            }
            if (unlock.type === 'quest_completed' && world.completedQuestTemplates.includes(unlock.templateId)) {
                this.unlocked.add(def.companionId);
                newlyUnlocked.push(def.companionId);
                continue;
            }
        }

        if (newlyUnlocked.length > 0) {
            worldStateManager.unlockCompanions(newlyUnlocked);
            this.persist();
        }
    }

    private persist(): void {
        try {
            const payload: CompanionState = {
                version: 2,
                unlocked: [...this.unlocked],
                selected: this.selected,
                called: [...this.called]
            };
            globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore write failures.
        }
    }

    private registerListeners(): void {
        if (this.listenersRegistered) return;
        this.listenersRegistered = true;

        eventBus.on(EVENTS.WORLD_STATE_CHANGED, () => {
            this.refreshUnlockedFromWorld();
        });
    }
}

export const companionManager = new CompanionManager();
