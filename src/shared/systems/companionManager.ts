import { getCompanion, listCompanions } from '../data/gameData.js';
import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';
import type { CompanionAbility, CompanionState } from '../types/Companion.js';

const STORAGE_KEY = 'sws:companions:v2';

export class CompanionManager {
    private initialized = false;
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
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<CompanionState> | null;

            const calledIds = Array.isArray(parsed?.called) ? parsed?.called.filter((id): id is string => typeof id === 'string') : [];
            this.called = new Set(calledIds);

            const unlockedIds = Array.isArray((parsed as Partial<CompanionState>)?.unlocked)
                ? ((parsed as Partial<CompanionState>).unlocked ?? []).filter((id): id is string => typeof id === 'string')
                : calledIds;
            this.unlocked = new Set(unlockedIds);

            this.selected = typeof (parsed as Partial<CompanionState>)?.selected === 'string' ? (parsed as Partial<CompanionState>).selected ?? null : null;
        } catch {
            // Ignore storage failures.
        }

        // Ensure at least default companions are unlocked for a fresh profile.
        if (this.unlocked.size === 0) {
            for (const def of listCompanions()) {
                if (!def.unlock || def.unlock.type === 'default') {
                    this.unlocked.add(def.companionId);
                }
            }
            if (this.unlocked.size > 0) {
                this.persist();
            }
        }
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
}

export const companionManager = new CompanionManager();
