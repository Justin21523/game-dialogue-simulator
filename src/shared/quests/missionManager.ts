import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';

import { ObjectiveType } from './objective.js';
import type { Objective } from './objective.js';
import { Quest, QuestStatus, type QuestSerialized } from './quest.js';
import { QuestStateMachine } from './questStateMachine.js';

const EXPLORE_EVENT_TYPES = new Set<string>([
    EVENTS.AREA_EXPLORED,
    EVENTS.LOCATION_DISCOVERED,
    EVENTS.BUILDING_ENTERED,
    EVENTS.PORTAL_ENTERED
]);

const LOCATION_EVENT_TYPES = new Set<string>([EVENTS.LOCATION_ENTERED, EVENTS.LOCATION_DISCOVERED]);

const COMPANION_INTERACTION_EVENT_TYPES = new Set<string>([EVENTS.COMPANION_ABILITY_USED, EVENTS.CUSTOM_ACTION]);

const ASSIST_EVENT_TYPES = new Set<string>([EVENTS.PARTNER_SUMMONED, EVENTS.COMPANION_CALLED, EVENTS.CUSTOM_ACTION]);

export type MissionRecord = {
    questId: string;
    type: 'main' | 'sub';
    status: string;
    participants: Array<Record<string, unknown>>;
    createdAt: number;
    offeredAt: number | null;
    startedAt: number | null;
};

type RecentEvent = {
    eventType: string;
    actorId: string;
    payload: unknown;
    timestamp: number;
};

type StateLogEntry = {
    type: string;
    detail: Record<string, unknown>;
    timestamp: number;
};

type InitializeOptions = {
    mainCharacter?: string;
};

type AcceptOptions = {
    type?: 'main' | 'sub';
    actorId?: string;
};

export class MissionManager {
    public quests = new Map<string, Quest>();
    public records = new Map<string, MissionRecord>();
    public offered = new Set<string>();
    public activeMain: string | null = null;
    public activeSubs = new Set<string>();
    public completed = new Set<string>();
    public abandoned = new Set<string>();

    public stateMachine = new QuestStateMachine();
    public initialized = false;

    public log: Array<{ type: string; detail: unknown; timestamp: number }> = [];
    public maxLog = 200;
    public storageKey = 'missionManagerState';

    public mainCharacter = 'jett';

    public recentEvents: RecentEvent[] = [];
    public stateLog: StateLogEntry[] = [];

    private listenersRegistered = false;

    async initialize(options: InitializeOptions = {}): Promise<void> {
        if (this.initialized) return;
        this.mainCharacter = options.mainCharacter ?? 'jett';
        this.loadFromStorage();
        this.registerEventListeners();
        this.initialized = true;
        this.logEvent('init', { message: 'MissionManager initialized' });
        eventBus.emit(EVENTS.MISSION_MANAGER_READY, { activeMain: this.activeMain });
    }

    private registerEventListeners(): void {
        if (this.listenersRegistered) return;
        this.listenersRegistered = true;

        // Keep MissionManager in sync if quests are completed externally.
        eventBus.on<{ quest?: Quest }>(EVENTS.QUEST_ACCEPTED, ({ quest }) => {
            if (quest?.questId) this.syncAccepted(quest);
        });
        eventBus.on<{ quest?: Quest }>(EVENTS.QUEST_COMPLETED, ({ quest }) => {
            if (quest?.questId) this.markCompleted(quest.questId, { source: 'quest_event' });
        });
        eventBus.on<{ quest?: Quest }>(EVENTS.QUEST_ABANDONED, ({ quest }) => {
            if (quest?.questId) this.markAbandoned(quest.questId, { source: 'quest_event' });
        });

        // Progress-driving game events (Phaser/React UI should emit, MissionManager maps).
        const mapper =
            (type: string) =>
            (data: unknown): void => {
                if (!data || typeof data !== 'object') {
                    this.routeProgressEvent(type, {});
                    return;
                }
                this.routeProgressEvent(type, data as Record<string, unknown>);
            };

        eventBus.on(EVENTS.NPC_INTERACTION, mapper(EVENTS.NPC_INTERACTION));
        eventBus.on(EVENTS.DIALOGUE_END, mapper(EVENTS.DIALOGUE_END));
        eventBus.on(EVENTS.ITEM_COLLECTED, mapper(EVENTS.ITEM_COLLECTED));
        eventBus.on(EVENTS.DELIVER_ITEM, mapper(EVENTS.DELIVER_ITEM));
        eventBus.on(EVENTS.AREA_EXPLORED, mapper(EVENTS.AREA_EXPLORED));
        eventBus.on(EVENTS.LOCATION_DISCOVERED, mapper(EVENTS.LOCATION_DISCOVERED));
        eventBus.on(EVENTS.LOCATION_ENTERED, mapper(EVENTS.LOCATION_ENTERED));
        eventBus.on(EVENTS.BUILDING_ENTERED, mapper(EVENTS.BUILDING_ENTERED));
        eventBus.on(EVENTS.BUILDING_EXITED, mapper(EVENTS.BUILDING_EXITED));
        eventBus.on(EVENTS.PARTNER_SUMMONED, mapper(EVENTS.PARTNER_SUMMONED));
        eventBus.on(EVENTS.COMPANION_CALLED, mapper(EVENTS.COMPANION_CALLED));
        eventBus.on(EVENTS.COMPANION_ABILITY_USED, mapper(EVENTS.COMPANION_ABILITY_USED));
        eventBus.on(EVENTS.CHARACTER_SWITCHED, mapper(EVENTS.CHARACTER_SWITCHED));
        eventBus.on(EVENTS.CUSTOM_ACTION, mapper(EVENTS.CUSTOM_ACTION));
        eventBus.on(EVENTS.PORTAL_ENTERED, mapper(EVENTS.PORTAL_ENTERED));
    }

    registerQuest(quest: Quest, options: { type?: 'main' | 'sub' } = {}): Quest {
        const type = options.type ?? (quest.type === 'main' ? 'main' : 'sub');
        quest.type = type;

        this.quests.set(quest.questId, quest);
        this.records.set(quest.questId, {
            questId: quest.questId,
            type,
            status: quest.status,
            participants: quest.participants ?? [],
            createdAt: quest.createdAt ?? Date.now(),
            offeredAt: quest.offeredAt ?? null,
            startedAt: quest.startedAt ?? null
        });

        return quest;
    }

    offerQuest(quest: Quest, options: { type?: 'main' | 'sub' } = {}): Quest {
        const registered = this.registerQuest(quest, options);

        if (!this.stateMachine.canTransition(registered.status, QuestStatus.OFFERED)) {
            this.logEvent('offer_skipped', { questId: registered.questId, from: registered.status });
            return registered;
        }

        registered.offer();
        this.offered.add(registered.questId);

        const rec = this.records.get(registered.questId);
        if (rec) rec.offeredAt = Date.now();

        eventBus.emit(EVENTS.MISSION_RECORD_CREATED, { quest: registered, record: rec });
        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, { quest: registered, status: registered.status, type: rec?.type });
        this.logEvent('offer', { questId: registered.questId, type: rec?.type });
        this.saveToStorage();
        return registered;
    }

    async acceptQuest(questId: string, options: AcceptOptions = {}): Promise<Quest> {
        const quest = this.quests.get(questId);
        if (!quest) throw new Error(`[MissionManager] Quest ${questId} not found`);

        const type = options.type ?? (quest.type === 'main' ? 'main' : 'sub');
        const actor = options.actorId ?? this.mainCharacter;

        if (!this.stateMachine.canTransition(quest.status, QuestStatus.ACTIVE)) {
            this.logEvent('accept_skipped', { questId, from: quest.status });
            return quest;
        }

        quest.addParticipant(actor, 'leader');
        quest.accept();

        this.offered.delete(questId);
        if (type === 'main') {
            this.activeMain = questId;
        } else {
            this.activeSubs.add(questId);
        }

        const rec = this.records.get(questId);
        if (rec) {
            rec.status = quest.status;
            rec.startedAt = quest.startedAt ?? Date.now();
            rec.type = type;
        }

        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, { quest, status: quest.status, type });
        this.logEvent('accept', { questId, type });
        this.saveToStorage();
        return quest;
    }

    abandonQuest(questId: string): boolean {
        const quest = this.quests.get(questId);
        if (!quest) return false;
        if (quest.status !== QuestStatus.ACTIVE && quest.status !== QuestStatus.OFFERED) return false;

        quest.abandon();
        this.activeSubs.delete(questId);
        if (this.activeMain === questId) this.activeMain = null;
        this.abandoned.add(questId);
        this.updateRecordStatus(questId, quest.status);

        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, { quest, status: quest.status, type: this.records.get(questId)?.type });
        this.logEvent('abandon', { questId });
        this.saveToStorage();
        return true;
    }

    routeProgressEvent(eventType: string, payload: Record<string, unknown>): void {
        const activeQuests = this.getActiveQuests();
        if (activeQuests.length === 0) return;

        const actorId =
            (payload.character as string | undefined) ||
            (payload.actorId as string | undefined) ||
            (payload.player as { characterId?: string } | undefined)?.characterId ||
            this.mainCharacter;

        this.recentEvents.push({
            eventType,
            actorId,
            payload,
            timestamp: Date.now()
        });
        if (this.recentEvents.length > 30) this.recentEvents.shift();

        for (const quest of activeQuests) {
            let updated = false;
            for (const objective of quest.objectives || []) {
                updated = this.updateObjectiveForEvent(quest, objective, eventType, payload, actorId) || updated;
            }
            if (updated) {
                this.ensureQuestHasActiveObjective(quest);
                this.checkQuestCompletion(quest);
            }
        }
    }

    private ensureQuestHasActiveObjective(quest: Quest): void {
        if (quest.status !== QuestStatus.ACTIVE) return;
        if (quest.objectives.some((o) => o.status === 'active')) return;
        const next = quest.objectives.find((o) => o.status === 'pending');
        next?.activate();
    }

    private updateObjectiveForEvent(
        quest: Quest,
        objective: Objective,
        eventType: string,
        payload: Record<string, unknown>,
        actorId: string
    ): boolean {
        if (objective.status === 'completed') return false;
        if (objective.assignedCharacter && objective.assignedCharacter !== actorId) return false;

        const matcher = (value: string | undefined, keys: string[] = []): boolean => {
            if (!value) return false;

            if (objective.conditions && objective.conditions.some((cond) => keys.some((k) => cond[k] === value))) {
                return true;
            }

            return false;
        };

        switch (objective.type) {
            case ObjectiveType.TALK: {
                if (eventType !== EVENTS.NPC_INTERACTION) break;
                const npcId =
                    (payload.npc as { npcId?: string } | undefined)?.npcId ||
                    (payload.npcId as string | undefined) ||
                    (payload.targetNpcId as string | undefined);

                if (matcher(npcId, ['npc_id', 'target', 'target_npc'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'talk', { npcId, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.COLLECT: {
                if (eventType !== EVENTS.ITEM_COLLECTED) break;
                const itemType = (payload.itemId as string | undefined) || (payload.item as { id?: string; type?: string } | undefined)?.id;
                const qtyRaw = (payload.quantity as number | undefined) || (payload.item as { quantity?: number } | undefined)?.quantity;
                const qty = typeof qtyRaw === 'number' && Number.isFinite(qtyRaw) ? qtyRaw : 1;

                if (matcher(itemType, ['item_type', 'item_id'])) {
                    const next = Math.min(objective.requiredCount || 1, objective.currentCount + qty);
                    objective.updateProgress(next);
                    this.emitObjectiveUpdate(quest, objective, 'collect', { itemType, qty, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.DELIVER: {
                if (eventType !== EVENTS.DELIVER_ITEM) break;
                const itemType = (payload.itemId as string | undefined) || (payload.item as { type?: string } | undefined)?.type;
                const targetId =
                    (payload.npcId as string | undefined) ||
                    (payload.buildingId as string | undefined) ||
                    (payload.npc as { npcId?: string } | undefined)?.npcId;

                if (matcher(itemType, ['item_type', 'item_id']) && matcher(targetId, ['npc_id', 'target_npc', 'building_id'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'deliver', { itemType, targetId, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.EXPLORE: {
                if (!EXPLORE_EVENT_TYPES.has(eventType)) break;
                const area =
                    (payload.area as string | undefined) ||
                    (payload.location as string | undefined) ||
                    (payload.areaId as string | undefined) ||
                    (payload.buildingId as string | undefined) ||
                    (payload.building as { id?: string } | undefined)?.id;

                if (matcher(area, ['area', 'location', 'building_id'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'explore', { area, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.GO_TO_LOCATION: {
                if (!LOCATION_EVENT_TYPES.has(eventType)) break;
                const locationId =
                    (payload.locationId as string | undefined) ||
                    (payload.location as string | undefined) ||
                    (payload.location_id as string | undefined);

                if (matcher(locationId, ['location_id', 'location'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'go_to_location', { locationId, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.FIX_BUILD:
            case ObjectiveType.INVESTIGATE:
            case ObjectiveType.CLEAR_MANAGE:
            case ObjectiveType.DIG_RECOVER: {
                if (!COMPANION_INTERACTION_EVENT_TYPES.has(eventType)) break;

                const targetId =
                    (payload.targetId as string | undefined) ||
                    (payload.actionTarget as string | undefined) ||
                    (payload.target_id as string | undefined);
                const ability =
                    (payload.ability as string | undefined) ||
                    (payload.requiredAbility as string | undefined) ||
                    (payload.required_ability as string | undefined);

                const matches = (objective.conditions ?? []).length
                    ? objective.conditions.some((cond) => {
                          const expectedTarget = (cond.target_id as string | undefined) || (cond.target as string | undefined) || undefined;
                          const expectedAbility =
                              (cond.required_ability as string | undefined) || (cond.ability as string | undefined) || undefined;

                          const targetOk = !expectedTarget || (targetId && expectedTarget === targetId);
                          const abilityOk = !expectedAbility || (ability && expectedAbility.toUpperCase() === ability.toUpperCase());
                          return targetOk && abilityOk;
                      })
                    : true;

                if (matches) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, objective.type, { targetId, ability, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.ASSIST: {
                if (!ASSIST_EVENT_TYPES.has(eventType)) break;
                const partner =
                    (payload.partnerId as string | undefined) ||
                    (payload.companionId as string | undefined) ||
                    (payload.partner as string | undefined) ||
                    (payload.actionTarget as string | undefined);
                const abilities = Array.isArray((payload as { abilities?: unknown }).abilities)
                    ? (((payload as { abilities?: unknown }).abilities as unknown[]).filter((v): v is string => typeof v === 'string') as string[])
                    : [];

                const requiredAbilityMatches =
                    objective.conditions?.some((cond) => {
                        const required = (cond.required_ability as string | undefined) || (cond.ability as string | undefined);
                        if (!required) return false;
                        return abilities.some((a) => a.toUpperCase() === required.toUpperCase());
                    }) ?? false;

                if (requiredAbilityMatches || matcher(partner, ['partner_id', 'ally_id'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'assist', { partner, abilities, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.ESCORT:
            case ObjectiveType.CUSTOM: {
                if (eventType !== EVENTS.CUSTOM_ACTION) break;
                const targetId = (payload.actionTarget as string | undefined) || (payload.targetId as string | undefined) || (payload.target_id as string | undefined);

                const hasConditions = (objective.conditions ?? []).length > 0;
                if (!hasConditions || matcher(targetId, ['target_id', 'target', 'escort_id', 'action_target', 'actionTarget'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, objective.type, { targetId, actorId });
                    return true;
                }
                break;
            }
            default:
                break;
        }

        return false;
    }

    private emitObjectiveUpdate(
        quest: Quest,
        objective: Objective,
        kind: string,
        extra: { actorId?: string } & Record<string, unknown>
    ): void {
        if (extra.actorId && objective.status === 'completed') {
            objective.completedBy = extra.actorId;
        }

        eventBus.emit(EVENTS.OBJECTIVE_PROGRESS_UPDATED, {
            questId: quest.questId,
            objectiveId: objective.id,
            status: objective.status,
            progress: objective.progress,
            kind,
            ...extra
        });

        eventBus.emit(EVENTS.QUEST_PROGRESS_UPDATED, {
            questId: quest.questId,
            questStatus: quest.status,
            objectives: quest.objectives,
            quest
        });

        this.logEvent('objective_update', {
            questId: quest.questId,
            objectiveId: objective.id,
            status: objective.status,
            progress: objective.progress,
            kind,
            extra
        });

        this.pushStateLog('objective_update', {
            questId: quest.questId,
            objectiveId: objective.id,
            status: objective.status,
            progress: objective.progress,
            actorId: extra.actorId
        });

        this.saveToStorage();
    }

    private checkQuestCompletion(quest: Quest): void {
        const required = (quest.objectives || []).filter((o) => !o.optional);
        const completed = required.filter((o) => o.status === 'completed');
        if (required.length > 0 && completed.length === required.length) {
            quest.complete({ completion_type: 'full' });
            this.markCompleted(quest.questId, { source: 'objective_progress' });
            this.saveToStorage();
        }
    }

    markCompleted(questId: string, meta: { source?: string } = {}): void {
        const quest = this.quests.get(questId);
        if (!quest) return;

        this.activeSubs.delete(questId);
        if (this.activeMain === questId) this.activeMain = null;
        this.offered.delete(questId);
        this.completed.add(questId);
        this.updateRecordStatus(questId, QuestStatus.COMPLETED);

        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, { quest, status: QuestStatus.COMPLETED, source: meta.source });
        this.logEvent('complete', { questId, source: meta.source });
        this.saveToStorage();
    }

    markAbandoned(questId: string, meta: { source?: string } = {}): void {
        const quest = this.quests.get(questId);
        if (!quest) return;

        this.activeSubs.delete(questId);
        if (this.activeMain === questId) this.activeMain = null;
        this.offered.delete(questId);
        this.abandoned.add(questId);
        this.updateRecordStatus(questId, QuestStatus.ABANDONED);

        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, { quest, status: QuestStatus.ABANDONED, source: meta.source });
        this.logEvent('abandon', { questId, source: meta.source });
        this.saveToStorage();
    }

    private syncAccepted(quest: Quest): void {
        if (!this.quests.has(quest.questId)) {
            this.registerQuest(quest, { type: quest.type === 'main' ? 'main' : 'sub' });
        }

        if (quest.type === 'main') {
            this.activeMain = quest.questId;
        } else {
            this.activeSubs.add(quest.questId);
        }

        this.offered.delete(quest.questId);
        this.updateRecordStatus(quest.questId, QuestStatus.ACTIVE);
        this.logEvent('sync_accept', { questId: quest.questId });
        this.saveToStorage();
    }

    getActiveMainQuest(): Quest | null {
        return this.activeMain ? this.quests.get(this.activeMain) ?? null : null;
    }

    getActiveSubQuests(): Quest[] {
        return Array.from(this.activeSubs)
            .map((id) => this.quests.get(id))
            .filter((q): q is Quest => Boolean(q));
    }

    getActiveQuests(): Quest[] {
        const quests: Quest[] = [];
        const main = this.getActiveMainQuest();
        if (main) quests.push(main);
        quests.push(...this.getActiveSubQuests());
        return quests;
    }

    getQuest(questId: string): Quest | null {
        return this.quests.get(questId) ?? null;
    }

    private updateRecordStatus(questId: string, status: string): void {
        const rec = this.records.get(questId);
        if (rec) rec.status = status;
    }

    private logEvent(type: string, detail: unknown): void {
        this.log.push({ type, detail, timestamp: Date.now() });
        if (this.log.length > this.maxLog) this.log.shift();
    }

    private pushStateLog(type: string, detail: Record<string, unknown>): void {
        const entry = { type, detail, timestamp: Date.now() };
        this.stateLog.push(entry);
        if (this.stateLog.length > 200) this.stateLog.shift();
        eventBus.emit(EVENTS.MISSION_STATE_LOG, entry);
    }

    saveToStorage(): void {
        try {
            const data = {
                quests: Array.from(this.quests.values()).map((q) => q.serialize()),
                records: Array.from(this.records.values()),
                activeMain: this.activeMain,
                activeSubs: Array.from(this.activeSubs),
                offered: Array.from(this.offered),
                completed: Array.from(this.completed),
                abandoned: Array.from(this.abandoned),
                recentEvents: this.recentEvents,
                stateLog: this.stateLog
            };
            globalThis.localStorage?.setItem(this.storageKey, JSON.stringify(data));
        } catch (err) {
            console.warn('[MissionManager] Failed to save state', err);
        }
    }

    loadFromStorage(): void {
        try {
            const raw = globalThis.localStorage?.getItem(this.storageKey);
            if (!raw) return;
            const data = JSON.parse(raw) as Record<string, unknown> | null;
            if (!data) return;

            this.quests.clear();
            this.records.clear();

            const questsRaw = (data.quests as Array<Record<string, unknown>> | undefined) ?? [];
            for (const qData of questsRaw) {
                const serialized = qData as unknown as QuestSerialized;
                const quest = new Quest(serialized);
                quest.deserialize(serialized);
                this.quests.set(quest.questId, quest);
            }

            const recordsRaw = (data.records as MissionRecord[] | undefined) ?? [];
            for (const rec of recordsRaw) {
                this.records.set(rec.questId, rec);
            }

            this.activeMain = (data.activeMain as string | null | undefined) ?? null;
            this.activeSubs = new Set((data.activeSubs as string[] | undefined) ?? []);
            this.offered = new Set((data.offered as string[] | undefined) ?? []);
            this.completed = new Set((data.completed as string[] | undefined) ?? []);
            this.abandoned = new Set((data.abandoned as string[] | undefined) ?? []);
            this.recentEvents = (data.recentEvents as RecentEvent[] | undefined) ?? [];
            this.stateLog = (data.stateLog as StateLogEntry[] | undefined) ?? [];
        } catch (err) {
            console.warn('[MissionManager] Failed to load state', err);
        }
    }
}

export const missionManager = new MissionManager();
