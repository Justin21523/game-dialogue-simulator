import { getCompanion, listCompanions } from '../data/gameData.js';
import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';
import type { CompanionAbility, CompanionState } from '../types/Companion.js';

const STORAGE_KEY = 'sws:companions:v1';

export class CompanionManager {
    private initialized = false;
    private called = new Set<string>();

    initialize(): void {
        if (this.initialized) return;
        this.initialized = true;

        try {
            const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<CompanionState> | null;
            const ids = Array.isArray(parsed?.called) ? parsed?.called.filter((id): id is string => typeof id === 'string') : [];
            this.called = new Set(ids);
        } catch {
            // Ignore storage failures.
        }
    }

    getCalledCompanionIds(): string[] {
        this.initialize();
        return [...this.called];
    }

    isCompanionCalled(companionId: string): boolean {
        this.initialize();
        return this.called.has(companionId);
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
            const payload: CompanionState = { called: [...this.called] };
            globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore write failures.
        }
    }
}

export const companionManager = new CompanionManager();
