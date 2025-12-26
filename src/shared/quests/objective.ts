export const ObjectiveType = {
    TALK: 'talk',
    COLLECT: 'collect',
    DELIVER: 'deliver',
    EXPLORE: 'explore',
    GO_TO_LOCATION: 'go_to_location',
    FIX_BUILD: 'fix_build',
    ASSIST: 'assist',
    ESCORT: 'escort',
    INVESTIGATE: 'investigate',
    CLEAR_MANAGE: 'clear_manage',
    DIG_RECOVER: 'dig_recover',
    CUSTOM: 'custom'
} as const;

export type ObjectiveType = (typeof ObjectiveType)[keyof typeof ObjectiveType];

export type ObjectiveStatus = 'pending' | 'active' | 'completed';

export type ObjectiveCondition = Record<string, string>;

export type ObjectiveData = {
    id?: string;
    type?: ObjectiveType;
    title?: string;
    description?: string;
    status?: ObjectiveStatus;
    progress?: number;
    currentCount?: number;
    requiredCount?: number;
    conditions?: ObjectiveCondition[];
    optional?: boolean;
    alternatives?: Array<Record<string, unknown>>;
    assignedCharacter?: string | null;
    isDynamic?: boolean;
    aiGenerated?: boolean;
    aiReasoning?: string | null;
    hint?: string;
};

export type ObjectiveSerialized = Required<Pick<ObjectiveData, 'id' | 'type' | 'title' | 'description'>> &
    Omit<ObjectiveData, 'id' | 'type' | 'title' | 'description'>;

export class Objective {
    public id: string;
    public type: ObjectiveType;
    public title: string;
    public description: string;

    public status: ObjectiveStatus;
    public progress: number;
    public currentCount: number;
    public requiredCount: number;

    public conditions: ObjectiveCondition[];
    public optional: boolean;
    public alternatives: Array<Record<string, unknown>>;

    public assignedCharacter: string | null;
    public completedBy?: string;

    public isDynamic: boolean;
    public aiGenerated: boolean;
    public aiReasoning: string | null;
    public hint: string;

    constructor(data: ObjectiveData = {}) {
        this.id = data.id ?? `obj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        this.type = data.type ?? ObjectiveType.TALK;
        this.title = data.title ?? 'Objective';
        this.description = data.description ?? '';

        this.status = data.status ?? 'pending';
        this.progress = data.progress ?? 0;
        this.currentCount = data.currentCount ?? 0;
        this.requiredCount = data.requiredCount ?? 1;

        this.conditions = data.conditions ?? [];

        this.optional = Boolean(data.optional);
        this.alternatives = data.alternatives ?? [];

        this.assignedCharacter = data.assignedCharacter ?? null;

        this.isDynamic = Boolean(data.isDynamic);
        this.aiGenerated = Boolean(data.aiGenerated);
        this.aiReasoning = data.aiReasoning ?? null;
        this.hint = data.hint ?? '';
    }

    activate(): void {
        if (this.status !== 'pending') return;
        this.status = 'active';
    }

    updateProgress(count: number): void {
        this.currentCount = Math.max(0, count);
        this.progress = this.requiredCount > 0 ? this.currentCount / this.requiredCount : 1;

        if (this.progress >= 1 && this.status !== 'completed') {
            this.complete();
        }
    }

    complete(): void {
        this.status = 'completed';
        this.progress = 1;
        this.currentCount = this.requiredCount;
    }

    getProgressText(): string {
        if (this.requiredCount <= 1) {
            if (this.status === 'completed') return 'Done';
            if (this.status === 'active') return 'In progress';
            return 'Pending';
        }

        return `${this.currentCount}/${this.requiredCount}`;
    }

    serialize(): ObjectiveSerialized {
        return {
            id: this.id,
            type: this.type,
            title: this.title,
            description: this.description,
            status: this.status,
            progress: this.progress,
            currentCount: this.currentCount,
            requiredCount: this.requiredCount,
            conditions: this.conditions,
            optional: this.optional,
            alternatives: this.alternatives,
            assignedCharacter: this.assignedCharacter,
            isDynamic: this.isDynamic,
            aiGenerated: this.aiGenerated,
            aiReasoning: this.aiReasoning,
            hint: this.hint
        };
    }

    deserialize(data: ObjectiveSerialized): void {
        this.id = data.id;
        this.type = data.type ?? ObjectiveType.TALK;
        this.title = data.title ?? 'Objective';
        this.description = data.description ?? '';
        this.status = data.status ?? 'pending';
        this.progress = data.progress ?? 0;
        this.currentCount = data.currentCount ?? 0;
        this.requiredCount = data.requiredCount ?? 1;
        this.conditions = data.conditions ?? [];
        this.optional = Boolean(data.optional);
        this.alternatives = data.alternatives ?? [];
        this.assignedCharacter = data.assignedCharacter ?? null;
        this.isDynamic = Boolean(data.isDynamic);
        this.aiGenerated = Boolean(data.aiGenerated);
        this.aiReasoning = data.aiReasoning ?? null;
        this.hint = data.hint ?? '';
    }
}
