import { eventBus } from '../eventBus.js';
import { EVENTS } from '../eventNames.js';

import { ExplorationMission, type ExplorationMissionData } from './explorationMission.js';
import { Objective, type ObjectiveData, type ObjectiveSerialized } from './objective.js';

export const QuestStatus = {
    PENDING: 'pending',
    OFFERED: 'offered',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ABANDONED: 'abandoned'
} as const;

export type QuestStatus = (typeof QuestStatus)[keyof typeof QuestStatus];

export type QuestType = 'main' | 'sub' | 'side' | 'dynamic';

export type QuestParticipant = {
    characterId: string;
    role: 'leader' | 'support';
    contribution: number;
    objectivesCompleted: string[];
    joinedAt: number;
};

export type QuestRequirements = {
    minLevel: number;
    requiredCharacters: string[];
    prerequisiteQuests: string[];
    requiredItems: string[];
};

export type QuestAIContext = {
    ragSessionId: string | null;
    conversationHistory: Array<Record<string, unknown>>;
    playerChoices: Array<Record<string, unknown>>;
    worldEvents: Array<Record<string, unknown>>;
    lastAIEvaluation: Record<string, unknown> | null;
    dynamicBranches: string[];
    memory: {
        keyMoments: Array<Record<string, unknown>>;
        npcRelationships: Record<string, number>;
        specialActions: Array<Record<string, unknown>>;
        failedAttempts: Array<Record<string, unknown>>;
        helpReceived: Array<Record<string, unknown>>;
        last_update?: number;
        recent_events?: Array<Record<string, unknown>>;
    };
};

export type QuestData = ExplorationMissionData & {
    questId?: string;
    templateId?: string | null;
    type?: QuestType;
    parentQuestId?: string | null;
    relatedNPCs?: string[];
    questGiverNPC?: string | null;
    participants?: QuestParticipant[];
    objectives?: ObjectiveData[];
    aiContext?: Partial<QuestAIContext>;
    requirements?: Partial<QuestRequirements>;
    createdAt?: number;
    offeredAt?: number | null;
    startedAt?: number | null;
    completedAt?: number | null;
    aiGenerated?: boolean;
    aiGeneratedIntroduction?: string | null;
    traceId?: string | null;
};

export type QuestSerialized = ReturnType<Quest['serialize']>;

function isQuestStatus(value: unknown): value is QuestStatus {
    return (
        value === QuestStatus.PENDING ||
        value === QuestStatus.OFFERED ||
        value === QuestStatus.ACTIVE ||
        value === QuestStatus.COMPLETED ||
        value === QuestStatus.ABANDONED
    );
}

export class Quest extends ExplorationMission {
    public questId: string;
    public templateId: string | null;
    public override type: QuestType;
    public override status: QuestStatus;
    public parentQuestId: string | null;
    public relatedNPCs: string[];
    public questGiverNPC: string | null;

    public participants: QuestParticipant[];
    public objectives: Objective[];

    public aiContext: QuestAIContext;
    public requirements: QuestRequirements;

    public createdAt: number;
    public offeredAt: number | null;
    public startedAt: number | null;
    public completedAt: number | null;

    public aiGenerated: boolean;
    public aiGeneratedIntroduction: string | null;
    public traceId: string | null;

    constructor(data: QuestData = {}) {
        super(data);

        this.status = isQuestStatus(data.status) ? data.status : QuestStatus.PENDING;
        this.questId = data.questId ?? this.id;
        this.templateId = data.templateId ?? null;
        this.type = data.type ?? 'main';

        this.parentQuestId = data.parentQuestId ?? null;
        this.relatedNPCs = data.relatedNPCs ?? [];
        this.questGiverNPC = data.questGiverNPC ?? null;

        this.participants = data.participants ?? [];
        this.objectives = (data.objectives ?? []).map((obj) => (obj instanceof Objective ? obj : new Objective(obj)));

        this.aiContext = {
            ragSessionId: data.aiContext?.ragSessionId ?? null,
            conversationHistory: data.aiContext?.conversationHistory ?? [],
            playerChoices: data.aiContext?.playerChoices ?? [],
            worldEvents: data.aiContext?.worldEvents ?? [],
            lastAIEvaluation: data.aiContext?.lastAIEvaluation ?? null,
            dynamicBranches: data.aiContext?.dynamicBranches ?? [],
            memory: {
                keyMoments: data.aiContext?.memory?.keyMoments ?? [],
                npcRelationships: data.aiContext?.memory?.npcRelationships ?? {},
                specialActions: data.aiContext?.memory?.specialActions ?? [],
                failedAttempts: data.aiContext?.memory?.failedAttempts ?? [],
                helpReceived: data.aiContext?.memory?.helpReceived ?? []
            }
        };

        this.requirements = {
            minLevel: data.requirements?.minLevel ?? 1,
            requiredCharacters: data.requirements?.requiredCharacters ?? [],
            prerequisiteQuests: data.requirements?.prerequisiteQuests ?? [],
            requiredItems: data.requirements?.requiredItems ?? []
        };

        this.createdAt = data.createdAt ?? Date.now();
        this.offeredAt = data.offeredAt ?? null;
        this.startedAt = data.startedAt ?? null;
        this.completedAt = data.completedAt ?? null;

        this.aiGenerated = Boolean(data.aiGenerated);
        this.aiGeneratedIntroduction = data.aiGeneratedIntroduction ?? null;
        this.traceId = data.traceId ?? null;
    }

    offer(): boolean {
        if (this.status !== QuestStatus.PENDING) return false;
        this.status = QuestStatus.OFFERED;
        this.offeredAt = Date.now();
        eventBus.emit(EVENTS.QUEST_OFFERED, { quest: this });
        return true;
    }

    accept(): boolean {
        if (this.status !== QuestStatus.OFFERED) return false;
        this.status = QuestStatus.ACTIVE;
        this.startedAt = Date.now();
        if (this.objectives.length > 0) {
            this.objectives[0].activate();
        }
        eventBus.emit(EVENTS.QUEST_ACCEPTED, { quest: this });
        eventBus.emit(EVENTS.QUEST_ACTIVATED, { quest: this });
        return true;
    }

    abandon(): boolean {
        if (this.status !== QuestStatus.ACTIVE && this.status !== QuestStatus.OFFERED) return false;
        const previousStatus = this.status;
        this.status = QuestStatus.ABANDONED;
        eventBus.emit(EVENTS.QUEST_ABANDONED, { quest: this, previousStatus });
        return true;
    }

    override complete(completionData: { completion_type?: string; reward_modifier?: number; ai_summary?: string | null } = {}): void {
        if (this.status === QuestStatus.COMPLETED) return;
        this.status = QuestStatus.COMPLETED;
        this.completedAt = Date.now();
        this.completionType = completionData.completion_type ?? this.completionType ?? 'full';
        this.rewardModifier = completionData.reward_modifier ?? this.rewardModifier ?? 1.0;
        this.aiSummary = completionData.ai_summary ?? this.aiSummary ?? null;

        eventBus.emit(EVENTS.QUEST_COMPLETED, {
            quest: this,
            rewards: this.calculateRewards(),
            stats: this.stats,
            completionType: this.completionType,
            aiSummary: this.aiSummary
        });
    }

    addParticipant(characterId: string, role: QuestParticipant['role'] = 'support'): QuestParticipant {
        const existing = this.participants.find((p) => p.characterId === characterId);
        if (existing) return existing;

        const participant: QuestParticipant = {
            characterId,
            role,
            contribution: 0,
            objectivesCompleted: [],
            joinedAt: Date.now()
        };

        this.participants.push(participant);
        eventBus.emit(EVENTS.QUEST_PARTICIPANT_ADDED, { quest: this, participant });
        return participant;
    }

    recordContribution(characterId: string, objectiveId: string, contributionType = 'completed_objective'): void {
        let participant = this.participants.find((p) => p.characterId === characterId);
        if (!participant) participant = this.addParticipant(characterId, 'support');

        if (!participant.objectivesCompleted.includes(objectiveId)) {
            participant.objectivesCompleted.push(objectiveId);
        }

        const contributionWeights: Record<string, number> = {
            completed_objective: 1.0,
            helped_complete: 0.5,
            collected_item: 0.3,
            defeated_enemy: 0.4,
            talked_to_npc: 0.2
        };

        const weight = contributionWeights[contributionType] ?? 0.1;
        participant.contribution = Math.min(1.0, participant.contribution + weight);
    }

    addDynamicObjective(objectiveData: ObjectiveData, reason = ''): Objective {
        const objective = new Objective({
            ...objectiveData,
            isDynamic: true,
            aiGenerated: true,
            aiReasoning: reason
        });

        this.objectives.push(objective);
        this.aiContext.dynamicBranches.push(objective.id);

        eventBus.emit(EVENTS.QUEST_OBJECTIVE_ADDED, { quest: this, objective, reason });
        return objective;
    }

    getActiveObjective(): Objective | null {
        return this.objectives.find((o) => o.status === 'active') ?? null;
    }

    getPendingObjectives(): Objective[] {
        return this.objectives.filter((o) => o.status === 'pending' || o.status === 'active');
    }

    override serialize() {
        return {
            ...super.serialize(),
            questId: this.questId,
            templateId: this.templateId,
            type: this.type,
            parentQuestId: this.parentQuestId,
            relatedNPCs: this.relatedNPCs,
            questGiverNPC: this.questGiverNPC,
            participants: this.participants,
            objectives: this.objectives.map((o) => o.serialize()),
            aiContext: this.aiContext,
            requirements: this.requirements,
            createdAt: this.createdAt,
            offeredAt: this.offeredAt,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            aiGenerated: this.aiGenerated,
            aiGeneratedIntroduction: this.aiGeneratedIntroduction,
            traceId: this.traceId
        };
    }

    deserialize(data: QuestSerialized): void {
        super.deserialize(data);

        this.questId = typeof data.questId === 'string' ? data.questId : this.questId;
        this.templateId =
            typeof (data as { templateId?: unknown }).templateId === 'string' ? ((data as { templateId: string }).templateId ?? null) : null;
        this.type = (data.type as QuestType | undefined) ?? this.type;
        this.parentQuestId = (data.parentQuestId as string | null | undefined) ?? this.parentQuestId;
        this.relatedNPCs = (data.relatedNPCs as string[] | undefined) ?? this.relatedNPCs;
        this.questGiverNPC = (data.questGiverNPC as string | null | undefined) ?? this.questGiverNPC;
        this.participants = (data.participants as QuestParticipant[] | undefined) ?? this.participants;
        this.aiContext = (data.aiContext as QuestAIContext | undefined) ?? this.aiContext;
        this.requirements = (data.requirements as QuestRequirements | undefined) ?? this.requirements;
        this.createdAt = typeof data.createdAt === 'number' ? data.createdAt : this.createdAt;
        this.offeredAt = typeof data.offeredAt === 'number' || data.offeredAt === null ? data.offeredAt : this.offeredAt;
        this.startedAt = typeof data.startedAt === 'number' || data.startedAt === null ? data.startedAt : this.startedAt;
        this.completedAt = typeof data.completedAt === 'number' || data.completedAt === null ? data.completedAt : this.completedAt;
        this.aiGenerated = Boolean(data.aiGenerated);
        this.aiGeneratedIntroduction =
            typeof data.aiGeneratedIntroduction === 'string' || data.aiGeneratedIntroduction === null
                ? data.aiGeneratedIntroduction
                : this.aiGeneratedIntroduction;
        this.traceId = typeof data.traceId === 'string' || data.traceId === null ? data.traceId : this.traceId;

        const objectiveData = (data.objectives as ObjectiveSerialized[] | undefined) ?? [];
        this.objectives = objectiveData.map((obj) => {
            const next = new Objective(obj);
            next.deserialize(obj);
            return next;
        });
    }
}
