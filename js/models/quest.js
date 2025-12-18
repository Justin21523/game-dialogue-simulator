/**
 * Quest - AI 驅動的任務系統
 * 支援動態生成、分支路徑、替代完成方式、記憶系統
 */

import { ExplorationMission } from './exploration-mission.js';
import { eventBus } from '../core/event-bus.js';

/**
 * Quest 狀態枚舉
 */
export const QuestStatus = {
  PENDING: 'pending',       // 未開始（世界中存在，但玩家未接觸）
  OFFERED: 'offered',       // 已提供給玩家（NPC 對話中提及）
  ACTIVE: 'active',         // 進行中
  COMPLETED: 'completed',   // 已完成
  ABANDONED: 'abandoned'    // 放棄
};

/**
 * Objective 類型枚舉
 */
export const ObjectiveType = {
  TALK: 'talk',             // 與 NPC 對話
  COLLECT: 'collect',       // 收集物品
  DELIVER: 'deliver',       // 交付物品
  EXPLORE: 'explore',       // 到達地點
  ASSIST: 'assist',         // 協助 NPC（使用能力）
  ESCORT: 'escort',         // 護送
  INVESTIGATE: 'investigate', // 調查
  CUSTOM: 'custom'          // 自定義（AI 生成）
};

/**
 * Quest - 任務類別（繼承 ExplorationMission）
 */
export class Quest extends ExplorationMission {
  constructor(data = {}) {
    // 調用父類構造函數
    super(data);

    // 任務特定屬性
    this.questId = data.questId || this.id;
    this.type = data.type || 'main';  // main, sub, side, dynamic

    // 任務關係
    this.parentQuestId = data.parentQuestId || null;
    this.relatedNPCs = data.relatedNPCs || [];
    this.questGiverNPC = data.questGiverNPC || null;  // 任務發起 NPC

    // 參與者（主角 + 夥伴）
    this.participants = data.participants || [];

    // 覆蓋父類的 objectives，使用更豐富的 Objective 類別
    this.objectives = (data.objectives || []).map(obj => {
      if (obj instanceof Objective) return obj;
      return new Objective(obj);
    });

    // AI 上下文（擴展父類的 aiContext）
    this.aiContext = {
      ...(data.aiContext || {}),
      ragSessionId: data.aiContext?.ragSessionId || null,
      conversationHistory: data.aiContext?.conversationHistory || [],
      playerChoices: data.aiContext?.playerChoices || [],
      worldEvents: data.aiContext?.worldEvents || [],
      lastAIEvaluation: data.aiContext?.lastAIEvaluation || null,
      dynamicBranches: data.aiContext?.dynamicBranches || [],
      memory: {
        keyMoments: data.aiContext?.memory?.keyMoments || [],
        npcRelationships: data.aiContext?.memory?.npcRelationships || {},
        specialActions: data.aiContext?.memory?.specialActions || [],
        failedAttempts: data.aiContext?.memory?.failedAttempts || [],
        helpReceived: data.aiContext?.memory?.helpReceived || []
      }
    };

    // 需求條件
    this.requirements = data.requirements || {
      minLevel: 1,
      requiredCharacters: [],
      prerequisiteQuests: [],
      requiredItems: []
    };

    // 時間追蹤
    this.createdAt = data.createdAt || Date.now();
    this.offeredAt = data.offeredAt || null;
    this.startedAt = data.startedAt || null;
    this.completedAt = data.completedAt || null;

    // AI 生成標記
    this.aiGenerated = data.aiGenerated || false;
    this.aiGeneratedIntroduction = data.aiGeneratedIntroduction || null;

    // Trace ID (用於 debug)
    this.traceId = data.traceId || null;

    console.log(`[Quest] Created quest ${this.questId} | Status: ${this.status} | Type: ${this.type}`);
  }

  /**
   * 提供任務給玩家（NPC 對話時）
   */
  offer() {
    if (this.status !== QuestStatus.PENDING) {
      console.warn(`[Quest] Cannot offer quest ${this.questId} - status is ${this.status}`);
      return false;
    }

    this.status = QuestStatus.OFFERED;
    this.offeredAt = Date.now();

    eventBus.emit('QUEST_OFFERED', { quest: this });
    console.log(`[Quest] Quest ${this.questId} offered to player`);

    return true;
  }

  /**
   * 接受任務
   */
  accept() {
    if (this.status !== QuestStatus.OFFERED) {
      console.warn(`[Quest] Cannot accept quest ${this.questId} - status is ${this.status}`);
      return false;
    }

    this.status = QuestStatus.ACTIVE;
    this.startedAt = Date.now();

    // 啟動第一個目標
    if (this.objectives.length > 0) {
      this.objectives[0].activate();
    }

    eventBus.emit('QUEST_ACCEPTED', { quest: this });
    eventBus.emit('QUEST_ACTIVATED', { quest: this });
    console.log(`[Quest] Quest ${this.questId} accepted and activated`);

    return true;
  }

  /**
   * 放棄任務
   */
  abandon() {
    if (this.status !== QuestStatus.ACTIVE && this.status !== QuestStatus.OFFERED) {
      console.warn(`[Quest] Cannot abandon quest ${this.questId} - status is ${this.status}`);
      return false;
    }

    const oldStatus = this.status;
    this.status = QuestStatus.ABANDONED;

    eventBus.emit('QUEST_ABANDONED', { quest: this, previousStatus: oldStatus });
    console.log(`[Quest] Quest ${this.questId} abandoned (was ${oldStatus})`);

    return true;
  }

  /**
   * 完成任務
   * @param {Object} completionData - 完成資料
   */
  complete(completionData = {}) {
    if (this.status === QuestStatus.COMPLETED) {
      console.warn(`[Quest] Quest ${this.questId} already completed`);
      return;
    }

    this.status = QuestStatus.COMPLETED;
    this.completedAt = Date.now();
    this.completionType = completionData.completion_type || 'full';
    this.rewardModifier = completionData.reward_modifier || 1.0;
    this.aiSummary = completionData.ai_summary || null;

    eventBus.emit('QUEST_COMPLETED', {
      quest: this,
      rewards: this.calculateRewards(),
      stats: this.stats,
      completionType: this.completionType,
      aiSummary: this.aiSummary
    });

    console.log(`[Quest] Quest ${this.questId} completed | Type: ${this.completionType} | Modifier: ${this.rewardModifier}`);
  }

  /**
   * 添加參與者
   * @param {string} characterId - 角色 ID
   * @param {string} role - 角色（leader/support）
   */
  addParticipant(characterId, role = 'support') {
    const existing = this.participants.find(p => p.characterId === characterId);
    if (existing) {
      console.warn(`[Quest] Character ${characterId} already participating in quest ${this.questId}`);
      return existing;
    }

    const participant = {
      characterId: characterId,
      role: role,
      contribution: 0,
      objectivesCompleted: [],
      joinedAt: Date.now()
    };

    this.participants.push(participant);
    eventBus.emit('QUEST_PARTICIPANT_ADDED', { quest: this, participant });
    console.log(`[Quest] Added participant ${characterId} to quest ${this.questId} as ${role}`);

    return participant;
  }

  /**
   * 記錄角色貢獻
   * @param {string} characterId - 角色 ID
   * @param {string} objectiveId - 目標 ID
   * @param {string} contributionType - 貢獻類型
   */
  recordContribution(characterId, objectiveId, contributionType = 'completed_objective') {
    let participant = this.participants.find(p => p.characterId === characterId);

    if (!participant) {
      // 自動添加參與者（如果是夥伴協助）
      participant = this.addParticipant(characterId, 'support');
    }

    // 記錄完成的目標
    if (!participant.objectivesCompleted.includes(objectiveId)) {
      participant.objectivesCompleted.push(objectiveId);
    }

    // 更新貢獻度
    const contributionWeights = {
      'completed_objective': 1.0,
      'helped_complete': 0.5,
      'collected_item': 0.3,
      'defeated_enemy': 0.4,
      'talked_to_npc': 0.2
    };

    const weight = contributionWeights[contributionType] || 0.1;
    participant.contribution = Math.min(1.0, participant.contribution + weight);

    console.log(`[Quest] ${characterId} contributed to quest ${this.questId} | Type: ${contributionType} | Total: ${(participant.contribution * 100).toFixed(0)}%`);
  }

  /**
   * 添加動態目標（AI 生成）
   * @param {Object} objectiveData - 目標資料
   * @param {string} reason - 添加原因
   */
  addDynamicObjective(objectiveData, reason = '') {
    const objective = new Objective({
      ...objectiveData,
      isDynamic: true,
      aiGenerated: true,
      aiReasoning: reason
    });

    this.objectives.push(objective);
    this.aiContext.dynamicBranches.push(objective.id);

    eventBus.emit('QUEST_OBJECTIVE_ADDED', {
      quest: this,
      objective: objective,
      reason: reason
    });

    console.log(`[Quest] Added dynamic objective to quest ${this.questId} | ${objective.title} | Reason: ${reason}`);

    return objective;
  }

  /**
   * 獲取當前活躍的目標
   * @returns {Objective|null}
   */
  getActiveObjective() {
    return this.objectives.find(obj => obj.status === 'active') || null;
  }

  /**
   * 獲取所有待完成的目標
   * @returns {Array<Objective>}
   */
  getPendingObjectives() {
    return this.objectives.filter(obj => obj.status === 'pending' || obj.status === 'active');
  }

  /**
   * 序列化（用於儲存）
   * @returns {Object}
   */
  serialize() {
    return {
      ...super.serialize(),
      questId: this.questId,
      type: this.type,
      parentQuestId: this.parentQuestId,
      relatedNPCs: this.relatedNPCs,
      questGiverNPC: this.questGiverNPC,
      participants: this.participants,
      objectives: this.objectives.map(obj => obj.serialize()),
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

  /**
   * 反序列化
   * @param {Object} data
   */
  deserialize(data) {
    super.deserialize(data);

    this.questId = data.questId;
    this.type = data.type;
    this.parentQuestId = data.parentQuestId;
    this.relatedNPCs = data.relatedNPCs || [];
    this.questGiverNPC = data.questGiverNPC;
    this.participants = data.participants || [];
    this.aiContext = data.aiContext || this.aiContext;
    this.requirements = data.requirements || this.requirements;
    this.createdAt = data.createdAt;
    this.offeredAt = data.offeredAt;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
    this.aiGenerated = data.aiGenerated;
    this.aiGeneratedIntroduction = data.aiGeneratedIntroduction;
    this.traceId = data.traceId;

    // 重建 objectives
    if (data.objectives) {
      this.objectives = data.objectives.map(objData => {
        const obj = new Objective(objData);
        obj.deserialize(objData);
        return obj;
      });
    }
  }
}

/**
 * Objective - 任務目標
 */
export class Objective {
  constructor(data = {}) {
    this.id = data.id || `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = data.type || ObjectiveType.TALK;
    this.title = data.title || '目標';
    this.description = data.description || '';

    // 進度追蹤
    this.status = data.status || 'pending';  // pending, active, completed
    this.progress = data.progress || 0;      // 0-1
    this.currentCount = data.currentCount || 0;
    this.requiredCount = data.requiredCount || 1;

    // 條件
    this.conditions = data.conditions || [];

    // 可選與替代
    this.optional = data.optional || false;
    this.alternatives = data.alternatives || [];  // 替代路徑

    // 執行者
    this.assignedCharacter = data.assignedCharacter || null;

    // AI 生成標記
    this.isDynamic = data.isDynamic || false;
    this.aiGenerated = data.aiGenerated || false;
    this.aiReasoning = data.aiReasoning || null;

    // 提示
    this.hint = data.hint || '';
  }

  /**
   * 啟用目標
   */
  activate() {
    if (this.status === 'pending') {
      this.status = 'active';
      console.log(`[Objective] Activated: ${this.title}`);
    }
  }

  /**
   * 更新進度
   * @param {number} count - 當前數量
   */
  updateProgress(count) {
    this.currentCount = count;
    this.progress = this.requiredCount > 0 ? count / this.requiredCount : 1;

    if (this.progress >= 1 && this.status !== 'completed') {
      this.complete();
    }
  }

  /**
   * 完成目標
   */
  complete() {
    this.status = 'completed';
    this.progress = 1;
    this.currentCount = this.requiredCount;
    console.log(`[Objective] Completed: ${this.title}`);
  }

  /**
   * 獲取進度文字
   * @returns {string}
   */
  getProgressText() {
    if (this.type === ObjectiveType.TALK) {
      return this.status === 'completed' ? '✓ 完成' : '進行中';
    }
    return `${this.currentCount}/${this.requiredCount}`;
  }

  /**
   * 序列化
   * @returns {Object}
   */
  serialize() {
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

  /**
   * 反序列化
   * @param {Object} data
   */
  deserialize(data) {
    this.id = data.id;
    this.type = data.type;
    this.title = data.title;
    this.description = data.description;
    this.status = data.status;
    this.progress = data.progress;
    this.currentCount = data.currentCount;
    this.requiredCount = data.requiredCount;
    this.conditions = data.conditions || [];
    this.optional = data.optional;
    this.alternatives = data.alternatives || [];
    this.assignedCharacter = data.assignedCharacter;
    this.isDynamic = data.isDynamic;
    this.aiGenerated = data.aiGenerated;
    this.aiReasoning = data.aiReasoning;
    this.hint = data.hint;
  }
}

/**
 * Quest 狀態機
 */
export class QuestStateMachine {
  constructor() {
    // 允許的狀態轉換
    this.transitions = {
      [QuestStatus.PENDING]: [QuestStatus.OFFERED, QuestStatus.ABANDONED],
      [QuestStatus.OFFERED]: [QuestStatus.ACTIVE, QuestStatus.ABANDONED],
      [QuestStatus.ACTIVE]: [QuestStatus.COMPLETED, QuestStatus.ABANDONED],
      [QuestStatus.COMPLETED]: [],  // 終態
      [QuestStatus.ABANDONED]: [QuestStatus.OFFERED]  // 可重新接受
    };
  }

  /**
   * 檢查狀態轉換是否有效
   * @param {string} from - 當前狀態
   * @param {string} to - 目標狀態
   * @returns {boolean}
   */
  canTransition(from, to) {
    return this.transitions[from]?.includes(to) || false;
  }

  /**
   * 執行狀態轉換
   * @param {Quest} quest - 任務物件
   * @param {string} newStatus - 新狀態
   * @param {string} reason - 轉換原因
   * @returns {boolean}
   */
  transition(quest, newStatus, reason = null) {
    const currentStatus = quest.status;

    if (!this.canTransition(currentStatus, newStatus)) {
      console.warn(`[QuestStateMachine] Invalid transition: ${currentStatus} -> ${newStatus}`);
      return false;
    }

    console.log(`[QuestStateMachine] Transitioning quest ${quest.questId}: ${currentStatus} -> ${newStatus} | Reason: ${reason || 'none'}`);

    // 根據目標狀態執行對應方法
    switch (newStatus) {
      case QuestStatus.OFFERED:
        return quest.offer();
      case QuestStatus.ACTIVE:
        return quest.accept();
      case QuestStatus.COMPLETED:
        quest.complete({ reason: reason });
        return true;
      case QuestStatus.ABANDONED:
        return quest.abandon();
      default:
        return false;
    }
  }
}
