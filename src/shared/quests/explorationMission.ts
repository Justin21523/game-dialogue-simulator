import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';

export type MissionRewards = {
    money: number;
    exp: number;
    items: string[];
};

export type MissionStatus = 'pending' | 'offered' | 'active' | 'completed' | 'abandoned' | 'failed';

export type ExplorationMissionStats = {
    itemsCollected: number;
    npcsInteracted: number;
    blockersResolved: number;
    partnersUsed: string[];
    abilitiesUsed: number;
    distanceTraveled: number;
};

export type ExplorationMissionAIContext = {
    conversationHistory: Array<Record<string, unknown>>;
    playerChoices: Array<Record<string, unknown>>;
    worldEvents: Array<Record<string, unknown>>;
    lastAIEvaluation: Record<string, unknown> | null;
    dynamicBranches: string[];
};

export type ExplorationMissionData = {
    id?: string;
    title?: string;
    description?: string;
    destination?: string | null;
    type?: string;
    difficulty?: number;
    rewards?: Partial<MissionRewards>;
    timeLimit?: number | null;
    status?: MissionStatus;
    elapsedTime?: number;
    stats?: Partial<ExplorationMissionStats>;
    aiContext?: Partial<ExplorationMissionAIContext>;
    rewardModifier?: number;
    completionType?: string;
    aiSummary?: string | null;
    ragSessionId?: string | null;
};

export type ExplorationMissionSerialized = ReturnType<ExplorationMission['serialize']>;

export class ExplorationMission {
    public id: string;
    public title: string;
    public description: string;
    public destination: string | null;

    public type: string;
    public difficulty: number;
    public rewards: MissionRewards;

    public timeLimit: number | null;
    public startTime: number | null = null;
    public elapsedTime: number;

    public status: MissionStatus;
    public completionRate: number = 0;

    public stats: ExplorationMissionStats;
    public aiContext: ExplorationMissionAIContext;

    public rewardModifier: number;
    public completionType: string;
    public aiSummary: string | null;

    public ragSessionId: string | null;

    constructor(data: ExplorationMissionData = {}) {
        this.id = data.id ?? `mission_${Date.now()}`;
        this.title = data.title ?? 'Exploration Mission';
        this.description = data.description ?? '';
        this.destination = data.destination ?? null;
        this.type = data.type ?? 'exploration';
        this.difficulty = data.difficulty ?? 1;

        const rewardDefaults: MissionRewards = { money: 100, exp: 50, items: [] };
        const rewardOverrides = data.rewards ?? {};
        this.rewards = {
            money: rewardOverrides.money ?? rewardDefaults.money,
            exp: rewardOverrides.exp ?? rewardDefaults.exp,
            items: rewardOverrides.items ?? rewardDefaults.items
        };

        this.timeLimit = data.timeLimit ?? null;
        this.elapsedTime = data.elapsedTime ?? 0;

        this.status = data.status ?? 'pending';

        this.stats = {
            itemsCollected: data.stats?.itemsCollected ?? 0,
            npcsInteracted: data.stats?.npcsInteracted ?? 0,
            blockersResolved: data.stats?.blockersResolved ?? 0,
            partnersUsed: data.stats?.partnersUsed ?? [],
            abilitiesUsed: data.stats?.abilitiesUsed ?? 0,
            distanceTraveled: data.stats?.distanceTraveled ?? 0
        };

        this.aiContext = {
            conversationHistory: data.aiContext?.conversationHistory ?? [],
            playerChoices: data.aiContext?.playerChoices ?? [],
            worldEvents: data.aiContext?.worldEvents ?? [],
            lastAIEvaluation: data.aiContext?.lastAIEvaluation ?? null,
            dynamicBranches: data.aiContext?.dynamicBranches ?? []
        };

        this.rewardModifier = data.rewardModifier ?? 1.0;
        this.completionType = data.completionType ?? 'full';
        this.aiSummary = data.aiSummary ?? null;
        this.ragSessionId = data.ragSessionId ?? null;
    }

    start(): boolean {
        if (this.status !== 'pending') return false;
        this.status = 'active';
        this.startTime = Date.now();
        eventBus.emit(EVENTS.MISSION_STARTED, { mission: this });
        return true;
    }

    update(_dtSeconds: number): void {
        if (this.status !== 'active') return;
        if (this.startTime === null) this.startTime = Date.now();
        this.elapsedTime = Date.now() - this.startTime;

        if (this.timeLimit !== null && this.elapsedTime >= this.timeLimit) {
            this.fail('Time is up!');
        }
    }

    complete(completionData: { completion_type?: string; reward_modifier?: number; ai_summary?: string | null } = {}): void {
        if (this.status === 'completed') return;
        this.status = 'completed';
        this.completionRate = 1;
        this.completionType = completionData.completion_type ?? this.completionType ?? 'full';
        this.rewardModifier = completionData.reward_modifier ?? this.rewardModifier ?? 1.0;
        this.aiSummary = completionData.ai_summary ?? this.aiSummary ?? null;

        eventBus.emit(EVENTS.MISSION_COMPLETED, {
            mission: this,
            rewards: this.calculateRewards(),
            stats: this.stats,
            completionType: this.completionType,
            aiSummary: this.aiSummary
        });
    }

    fail(reason: string): void {
        if (this.status === 'failed') return;
        this.status = 'failed';
        eventBus.emit(EVENTS.MISSION_FAILED, { mission: this, reason });
    }

    calculateRewards(): MissionRewards {
        const rewards: MissionRewards = { ...this.rewards, items: [...this.rewards.items] };

        if (this.timeLimit !== null && this.timeLimit > 0 && this.elapsedTime > 0) {
            const timeRatio = 1 - this.elapsedTime / this.timeLimit;
            if (timeRatio > 0.5) {
                rewards.money = Math.floor(rewards.money * 1.2);
                rewards.exp = Math.floor(rewards.exp * 1.2);
            }
        }

        if (this.stats.partnersUsed.length >= 3) {
            rewards.exp = Math.floor(rewards.exp * 1.1);
        }

        rewards.money = Math.floor(rewards.money * this.rewardModifier);
        rewards.exp = Math.floor(rewards.exp * this.rewardModifier);
        return rewards;
    }

    serialize() {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            destination: this.destination,
            type: this.type,
            difficulty: this.difficulty,
            rewards: this.rewards,
            timeLimit: this.timeLimit,
            startTime: this.startTime,
            elapsedTime: this.elapsedTime,
            status: this.status,
            completionRate: this.completionRate,
            stats: this.stats,
            aiContext: this.aiContext,
            rewardModifier: this.rewardModifier,
            completionType: this.completionType,
            aiSummary: this.aiSummary,
            ragSessionId: this.ragSessionId
        };
    }

    deserialize(data: ExplorationMissionSerialized): void {
        this.id = typeof data.id === 'string' ? data.id : this.id;
        this.title = typeof data.title === 'string' ? data.title : this.title;
        this.description = typeof data.description === 'string' ? data.description : this.description;
        this.destination = typeof data.destination === 'string' || data.destination === null ? data.destination : this.destination;
        this.type = typeof data.type === 'string' ? data.type : this.type;
        this.difficulty = typeof data.difficulty === 'number' ? data.difficulty : this.difficulty;
        this.rewards = (data.rewards as MissionRewards | undefined) ?? this.rewards;
        this.timeLimit = (data.timeLimit as number | null | undefined) ?? this.timeLimit;
        this.startTime = (data.startTime as number | null | undefined) ?? this.startTime;
        this.elapsedTime = typeof data.elapsedTime === 'number' ? data.elapsedTime : this.elapsedTime;
        this.status = (data.status as MissionStatus | undefined) ?? this.status;
        this.completionRate = typeof data.completionRate === 'number' ? data.completionRate : this.completionRate;
        this.stats = (data.stats as ExplorationMissionStats | undefined) ?? this.stats;
        this.aiContext = (data.aiContext as ExplorationMissionAIContext | undefined) ?? this.aiContext;
        this.rewardModifier = typeof data.rewardModifier === 'number' ? data.rewardModifier : this.rewardModifier;
        this.completionType = typeof data.completionType === 'string' ? data.completionType : this.completionType;
        this.aiSummary = typeof data.aiSummary === 'string' || data.aiSummary === null ? data.aiSummary : this.aiSummary;
        this.ragSessionId = typeof data.ragSessionId === 'string' || data.ragSessionId === null ? data.ragSessionId : this.ragSessionId;
    }
}
