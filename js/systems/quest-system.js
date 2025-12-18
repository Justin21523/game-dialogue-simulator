/**
 * QuestSystem - AI 驅動的任務管理系統
 * 管理任務生命週期、AI 整合、記憶系統
 */

import { Quest, QuestStatus, QuestStateMachine, Objective } from '../models/quest.js';
import { eventBus } from '../core/event-bus.js';
import { aiService } from '../core/ai-service.js';  // Checkpoint 3

export class QuestSystem {
  constructor() {
    // 任務容器
    this.offeredQuests = new Map();      // 已提供但未接受的任務
    this.activeQuest = null;             // 當前進行中的任務（只允許一個）
    this.completedQuests = [];           // 已完成任務（保留最近 10 個）
    this.abandonedQuests = [];           // 已放棄任務

    // 狀態機
    this.stateMachine = new QuestStateMachine();

    // Agent 調用日誌
    this.agentCallLog = [];
    this.maxLogSize = 100;

    // 主角 ID（預設 jett）
    this.mainCharacterId = 'jett';

    // Checkpoint 4: 當前控制的角色（用於貢獻度追蹤）
    this.currentControlledCharacter = 'jett';

    // 初始化狀態
    this.initialized = false;

    console.log('[QuestSystem] Initialized');
  }

  /**
   * 初始化系統
   * @param {Object} options - 選項
   */
  async initialize(options = {}) {
    if (this.initialized) {
      console.warn('[QuestSystem] Already initialized');
      return;
    }

    this.mainCharacterId = options.mainCharacter || 'jett';

    // 設定事件監聽器（允許外部管理事件）
    if (options.attachEventListeners !== false) {
      this.setupEventListeners();
    }

    // 從 LocalStorage 載入任務
    this.loadFromStorage();

    this.initialized = true;
    console.log('[QuestSystem] Initialization complete');
  }

  /**
   * 設定事件監聽器
   */
  setupEventListeners() {
    // 監聽任務相關事件
    eventBus.on('QUEST_ACCEPTED', (data) => this.onQuestAccepted(data));
    eventBus.on('QUEST_COMPLETED', (data) => this.onQuestCompleted(data));
    eventBus.on('QUEST_ABANDONED', (data) => this.onQuestAbandoned(data));

    // ===== Checkpoint 4: 監聽遊戲事件以更新任務進度 =====

    // NPC 互動事件
    eventBus.on('NPC_INTERACTION', (data) => this.handleNPCInteraction(data));
    eventBus.on('DIALOGUE_END', (data) => this.handleDialogueEnd(data));

    // 物品相關事件
    eventBus.on('ITEM_COLLECTED', (data) => this.handleItemCollected(data));
    eventBus.on('DELIVER_ITEM', (data) => this.handleItemDelivered(data));

    // 探索相關事件
    eventBus.on('AREA_EXPLORED', (data) => this.handleAreaExplored(data));
    eventBus.on('LOCATION_DISCOVERED', (data) => this.handleLocationDiscovered(data));

    // 建築物互動事件
    eventBus.on('BUILDING_ENTERED', (data) => this.handleBuildingEntered(data));
    eventBus.on('BUILDING_EXITED', (data) => this.handleBuildingExited(data));

    // 角色相關事件
    eventBus.on('PARTNER_SUMMONED', (data) => this.handlePartnerSummoned(data));
    eventBus.on('CHARACTER_SWITCHED', (data) => this.handleCharacterSwitched(data));

    // 自訂動作事件
    eventBus.on('CUSTOM_ACTION', (data) => this.handleCustomAction(data));

    console.log('[QuestSystem] Event listeners set up (Checkpoint 4)');
  }

  /**
   * 創建測試任務（用於 Checkpoint 1 測試）
   * @param {Object} data - 任務資料
   * @returns {Quest}
   */
  createTestQuest(data = {}) {
    const quest = new Quest({
      questId: data.id || `test_quest_${Date.now()}`,
      title: data.title || 'Test Quest',
      description: data.description || 'A test quest for development',
      type: data.type || 'main',
      status: QuestStatus.PENDING,
      relatedNPCs: data.relatedNPCs || ['test_npc'],
      objectives: data.objectives || [
        {
          id: 'obj_1',
          type: 'talk',
          title: 'Talk to test NPC',
          description: 'Start a conversation',
          requiredCount: 1
        }
      ],
      rewards: data.rewards || {
        money: 100,
        exp: 50,
        items: []
      }
    });

    console.log(`[QuestSystem] Created test quest: ${quest.questId}`);
    return quest;
  }

  /**
   * Checkpoint 3: Generate quest from NPC using AI
   * @param {Object} npcData - NPC 資料
   * @param {Object} context - 任務上下文
   * @returns {Promise<Quest>} - AI 生成的任務
   */
  async generateQuestFromNPC(npcData, context = {}) {
    console.log('[QuestSystem] 🤖 Generating quest from NPC using AI:', npcData.npcId);

    const startTime = Date.now();

    try {
      // 準備請求參數
      const requestData = {
        destination: context.destination || context.worldDestination || 'Unknown',
        difficulty: context.playerLevel || 1,
        availableCharacters: context.availableCharacters || [this.mainCharacterId],
        mission_type: npcData.mission_type || this.inferMissionType(npcData),
        npc_id: npcData.npcId,
        npc_name: npcData.name,
        npc_type: npcData.type || 'resident',
        player_level: context.playerLevel || 1
      };

      console.log('[QuestSystem] 📤 Sending request to /missions/generate-graph:', requestData);

      // 呼叫 AI API
      const response = await aiService.generateMissionGraph(requestData);

      console.log('[QuestSystem] 📥 AI response received:', response);

      // 記錄 Agent 調用
      this.logAgentCall('generate-graph', {
        input: requestData,
        output: response,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });

      // 解析 AI 返回的 nodes，轉換成 Objectives
      const objectives = this.parseNodesToObjectives(response.nodes || [], response.entry_points || []);

      // 創建 Quest 對象
      const quest = new Quest({
        questId: `ai_quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: response.title || `幫助 ${npcData.name}`,
        description: response.description || `${npcData.name} 需要你的協助`,
        type: 'main',
        status: QuestStatus.PENDING,
        relatedNPCs: [npcData.npcId],
        questGiverNPC: npcData.npcId,
        objectives: objectives,
        rewards: response.rewards || {
          money: 100 + (context.playerLevel || 1) * 50,
          exp: 50 + (context.playerLevel || 1) * 25,
          items: []
        },
        // AI 上下文
        aiContext: {
          ragSessionId: null,  // 將在 acceptQuest 時創建
          conversationHistory: [],
          playerChoices: [],
          worldEvents: [],
          lastAIEvaluation: null,
          dynamicBranches: response.entry_points || [],
          memory: {
            keyMoments: [],
            npcRelationships: { [npcData.npcId]: 0 },
            specialActions: [],
            failedAttempts: [],
            helpReceived: []
          }
        }
      });

      console.log('[QuestSystem] ✅ AI quest generated:', quest.questId, `(${Date.now() - startTime}ms)`);
      return quest;

    } catch (error) {
      console.error('[QuestSystem] ❌ AI quest generation failed:', error);

      // Fallback: 使用簡單模板
      console.warn('[QuestSystem] Using fallback template quest');

      return this.createTestQuest({
        title: `幫助 ${npcData.name}`,
        description: `${npcData.name} 需要你的幫助`,
        questGiverNPC: npcData.npcId,
        relatedNPCs: [npcData.npcId],
        objectives: [
          {
            id: 'obj_talk',
            type: 'talk',
            title: `與 ${npcData.name} 對話`,
            description: '了解任務詳情',
            requiredCount: 1
          },
          {
            id: 'obj_complete',
            type: 'custom',
            title: '完成請求',
            description: '完成 NPC 的請求',
            requiredCount: 1
          }
        ]
      });
    }
  }

  /**
   * 推斷任務類型（基於 NPC 類型）
   */
  inferMissionType(npcData) {
    const typeMap = {
      'merchant': 'delivery',
      'citizen': 'rescue',
      'police': 'police',
      'athlete': 'sports',
      'builder': 'construction'
    };
    return typeMap[npcData.type] || 'delivery';
  }

  /**
   * 將 AI 返回的 nodes 轉換成 Objective 對象
   */
  parseNodesToObjectives(nodes, entryPoints) {
    if (!nodes || nodes.length === 0) {
      return [{
        id: 'obj_default',
        type: 'custom',
        title: '完成任務',
        description: '完成任務目標',
        requiredCount: 1
      }];
    }

    const objectives = [];

    nodes.forEach((node, index) => {
      const objective = {
        id: node.id || `obj_${index}`,
        type: this.mapNodeTypeToObjectiveType(node.type),
        title: node.title || 'Unknown Objective',
        description: node.description || '',
        status: 'pending',
        progress: 0,
        requiredCount: 1,
        optional: !entryPoints.includes(node.id),  // Entry points are required
        alternatives: node.alternatives || [],
        prerequisites: node.prerequisites || [],
        isDynamic: false,
        aiGenerated: true,
        aiReasoning: `Generated from node type: ${node.type}`
      };

      objectives.push(objective);
    });

    console.log(`[QuestSystem] Parsed ${objectives.length} objectives from ${nodes.length} nodes`);
    return objectives;
  }

  /**
   * 映射 node type 到 objective type
   */
  mapNodeTypeToObjectiveType(nodeType) {
    const typeMap = {
      'talk': 'talk',
      'explore': 'explore',
      'fetch': 'collect',
      'solve': 'custom',
      'rescue': 'assist',
      'deliver': 'deliver',
      'investigate': 'investigate'
    };
    return typeMap[nodeType] || 'custom';
  }

  /**
   * 提供任務給玩家
   * @param {Quest} quest - 任務物件
   * @returns {boolean}
   */
  offerQuest(quest) {
    if (!(quest instanceof Quest)) {
      console.error('[QuestSystem] offerQuest: quest must be a Quest instance');
      return false;
    }

    // 使用狀態機轉換狀態
    if (!this.stateMachine.transition(quest, QuestStatus.OFFERED, 'offered_to_player')) {
      return false;
    }

    // 儲存到 offeredQuests
    this.offeredQuests.set(quest.questId, quest);

    console.log(`[QuestSystem] Quest ${quest.questId} offered to player`);
    return true;
  }

  /**
   * 接受任務
   * @param {string} questId - 任務 ID
   * @returns {boolean}
   */
  async acceptQuest(questId) {
    const quest = this.offeredQuests.get(questId);
    if (!quest) {
      console.error(`[QuestSystem] Quest ${questId} not found in offered quests`);
      return false;
    }

    // 檢查是否已有進行中的任務
    if (this.activeQuest) {
      console.warn(`[QuestSystem] Already have an active quest: ${this.activeQuest.questId}`);
      return false;
    }

    // 使用狀態機轉換狀態
    if (!this.stateMachine.transition(quest, QuestStatus.ACTIVE, 'player_accepted')) {
      return false;
    }

    // 從 offeredQuests 移除，設為 activeQuest
    this.offeredQuests.delete(questId);
    this.activeQuest = quest;

    // 添加主角為參與者
    quest.addParticipant(this.mainCharacterId, 'leader');

    // ===== Checkpoint 3: Create RAG session for quest context =====
    try {
      console.log('[QuestSystem] 🧠 Creating RAG session for quest...');

      const ragResponse = await aiService.createRAGSession({
        type: 'mission',
        mission_id: quest.questId,
        knowledge_domains: ['quest', 'npc', 'world'],
        parent_session: null
      });

      // Store RAG session ID in quest
      quest.aiContext.ragSessionId = ragResponse.session_id;

      console.log('[QuestSystem] ✅ RAG session created:', ragResponse.session_id);

      // Log the Agent call
      this.logAgentCall('create-rag-session', {
        input: { quest_id: quest.questId },
        output: ragResponse,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.warn('[QuestSystem] ⚠️ Failed to create RAG session (non-critical):', error);
      // Non-critical failure - quest can still proceed without RAG session
    }

    // 儲存到 LocalStorage
    this.saveToStorage();

    console.log(`[QuestSystem] Quest ${questId} accepted and set as active`);
    return true;
  }

  /**
   * 拒絕任務
   * @param {string} questId - 任務 ID
   * @returns {boolean}
   */
  declineQuest(questId) {
    const quest = this.offeredQuests.get(questId);
    if (!quest) {
      console.error(`[QuestSystem] Quest ${questId} not found in offered quests`);
      return false;
    }

    // 簡單地從 offeredQuests 移除（不轉換到 abandoned）
    this.offeredQuests.delete(questId);

    console.log(`[QuestSystem] Quest ${questId} declined`);
    eventBus.emit('QUEST_DECLINED', { quest });

    return true;
  }

  /**
   * 放棄任務
   * @param {string} questId - 任務 ID
   * @returns {boolean}
   */
  abandonQuest(questId) {
    let quest = null;

    // 檢查是否是當前進行中的任務
    if (this.activeQuest && this.activeQuest.questId === questId) {
      quest = this.activeQuest;
      this.activeQuest = null;
    } else {
      quest = this.offeredQuests.get(questId);
      if (quest) {
        this.offeredQuests.delete(questId);
      }
    }

    if (!quest) {
      console.error(`[QuestSystem] Quest ${questId} not found`);
      return false;
    }

    // 使用狀態機轉換狀態
    if (!this.stateMachine.transition(quest, QuestStatus.ABANDONED, 'player_abandoned')) {
      return false;
    }

    // ===== Checkpoint 3: Delete RAG session if exists =====
    if (quest.aiContext && quest.aiContext.ragSessionId) {
      this.deleteRAGSession(quest.aiContext.ragSessionId, questId);
    }

    // 記錄到 abandonedQuests
    this.abandonedQuests.push(quest);

    // 儲存到 LocalStorage
    this.saveToStorage();

    console.log(`[QuestSystem] Quest ${questId} abandoned`);
    return true;
  }

  /**
   * 獲取任務
   * @param {string} questId - 任務 ID
   * @returns {Quest|null}
   */
  getQuest(questId) {
    // 檢查 activeQuest
    if (this.activeQuest && this.activeQuest.questId === questId) {
      return this.activeQuest;
    }

    // 檢查 offeredQuests
    if (this.offeredQuests.has(questId)) {
      return this.offeredQuests.get(questId);
    }

    // 檢查 completedQuests
    const completed = this.completedQuests.find(q => q.questId === questId);
    if (completed) return completed;

    // 檢查 abandonedQuests
    const abandoned = this.abandonedQuests.find(q => q.questId === questId);
    if (abandoned) return abandoned;

    return null;
  }

  /**
   * 獲取當前進行中的任務
   * @returns {Quest|null}
   */
  getActiveQuest() {
    return this.activeQuest;
  }

  /**
   * 獲取所有提供中的任務
   * @returns {Array<Quest>}
   */
  getOfferedQuests() {
    return Array.from(this.offeredQuests.values());
  }

  /**
   * 獲取某 NPC 提供的任務
   * @param {string} npcId - NPC ID
   * @returns {Array<Quest>}
   */
  getOfferedQuestsByNPC(npcId) {
    return this.getOfferedQuests().filter(q => q.questGiverNPC === npcId);
  }

  /**
   * 檢查 NPC 是否是任務 NPC
   * @param {string} npcId - NPC ID
   * @returns {boolean}
   */
  isQuestNPC(npcId) {
    return this.getOfferedQuestsByNPC(npcId).length > 0;
  }

  /**
   * 檢查 NPC 是否是任務目標 NPC
   * @param {string} npcId - NPC ID
   * @returns {boolean}
   */
  isTargetNPC(npcId) {
    if (!this.activeQuest) return false;
    return this.activeQuest.relatedNPCs.includes(npcId);
  }

  /**
   * 獲取當前進行中的任務 ID
   * @returns {string|null}
   */
  getActiveQuestId() {
    return this.activeQuest ? this.activeQuest.questId : null;
  }

  /**
   * 獲取任務進度摘要
   * @returns {Object}
   */
  getQuestProgress() {
    if (!this.activeQuest) return null;

    const quest = this.activeQuest;
    const completedObjectives = quest.objectives.filter(obj => obj.status === 'completed').length;
    const totalObjectives = quest.objectives.length;

    return {
      questId: quest.questId,
      title: quest.title,
      status: quest.status,
      completedObjectives: completedObjectives,
      totalObjectives: totalObjectives,
      progress: totalObjectives > 0 ? completedObjectives / totalObjectives : 0
    };
  }

  /**
   * 事件處理：任務接受
   * @param {Object} data - 事件資料
   */
  onQuestAccepted(data) {
    console.log(`[QuestSystem] Quest accepted event: ${data.quest.questId}`);
    // 可以在這裡添加額外處理（如通知後端）
  }

  /**
   * 事件處理：任務完成
   * @param {Object} data - 事件資料
   */
  onQuestCompleted(data) {
    const quest = data.quest;
    console.log(`[QuestSystem] Quest completed event: ${quest.questId}`);

    // 移除 activeQuest
    if (this.activeQuest && this.activeQuest.questId === quest.questId) {
      this.activeQuest = null;
    }

    // 添加到 completedQuests
    this.completedQuests.push(quest);

    // 只保留最近 10 個
    if (this.completedQuests.length > 10) {
      this.completedQuests.shift();
    }

    // 儲存到 LocalStorage
    this.saveToStorage();
  }

  /**
   * 事件處理：任務放棄
   * @param {Object} data - 事件資料
   */
  onQuestAbandoned(data) {
    console.log(`[QuestSystem] Quest abandoned event: ${data.quest.questId}`);
    // 可以在這裡添加額外處理
  }

  /**
   * 事件處理：NPC 互動
   * @param {Object} data - 事件資料
   */
  onNPCInteraction(data) {
    if (!this.activeQuest) return;

    const { npc, player } = data;
    console.log(`[QuestSystem] NPC interaction: ${player.characterId} talked to ${npc.npcId}`);

    // 檢查是否完成 talk 類型的目標
    this.checkObjectiveProgress();
  }

  /**
   * 檢查目標進度
   */
  checkObjectiveProgress() {
    if (!this.activeQuest) return;

    const quest = this.activeQuest;
    let hasUpdate = false;

    for (const objective of quest.objectives) {
      if (objective.status === 'completed') continue;

      // 簡單檢查（詳細實作在 Checkpoint 4）
      if (objective.type === 'talk' && objective.progress >= 1) {
        objective.complete();
        hasUpdate = true;
      }
    }

    if (hasUpdate) {
      // 檢查任務是否完成
      this.checkQuestCompletion();
    }
  }

  /**
   * 檢查任務是否完成
   */
  checkQuestCompletion() {
    if (!this.activeQuest) return;

    const quest = this.activeQuest;
    const requiredObjectives = quest.objectives.filter(obj => !obj.optional);
    const completedRequired = requiredObjectives.filter(obj => obj.status === 'completed');

    if (completedRequired.length >= requiredObjectives.length) {
      // 所有必要目標完成
      console.log(`[QuestSystem] All required objectives completed for quest ${quest.questId}`);
      quest.complete({ completion_type: 'full' });
    }
  }

  /**
   * 記錄 Agent 調用
   * @param {string} agentType - Agent 類型
   * @param {Object} callData - 調用資料
   */
  logAgentCall(agentType, callData) {
    const logEntry = {
      timestamp: Date.now(),
      agent: agentType,
      trace_id: callData.trace_id || null,
      input_summary: this.summarizeInput(callData.input || {}),
      output_summary: this.summarizeOutput(callData.output || {}),
      success: !callData.error,
      error: callData.error || null,
      duration_ms: callData.duration_ms || 0
    };

    this.agentCallLog.push(logEntry);

    // 限制日誌大小
    if (this.agentCallLog.length > this.maxLogSize) {
      this.agentCallLog.shift();
    }

    // 發送到事件總線
    eventBus.emit('AGENT_CALL_LOGGED', logEntry);

    // Console 輸出
    const emoji = logEntry.success ? '✅' : '❌';
    console.log(
      `[QuestSystem] ${emoji} Agent ${logEntry.agent} | ` +
      `Trace: ${logEntry.trace_id || 'N/A'}`
    );
  }

  /**
   * 簡化輸入摘要
   * @param {Object} input
   * @returns {Object}
   */
  summarizeInput(input) {
    return {
      quest_id: input.quest_id,
      npc: input.npc,
      progress: input.progress,
      difficulty: input.difficulty
    };
  }

  /**
   * 簡化輸出摘要
   * @param {Object} output
   * @returns {Object}
   */
  summarizeOutput(output) {
    if (output.objectives) return { objectives: output.objectives };
    if (output.subtask) return { subtask_added: output.subtask };
    if (output.hint) return { hint_provided: output.hint };
    return output;
  }

  /**
   * 獲取 Agent 調用統計
   * @returns {Object}
   */
  getAgentStats() {
    const stats = {
      total_calls: this.agentCallLog.length,
      by_agent: {},
      success_rate: 0,
      avg_duration: 0
    };

    let totalDuration = 0;
    let successCount = 0;

    for (const log of this.agentCallLog) {
      // 按 agent 類型統計
      if (!stats.by_agent[log.agent]) {
        stats.by_agent[log.agent] = { count: 0, success: 0, failed: 0 };
      }
      stats.by_agent[log.agent].count++;
      if (log.success) {
        stats.by_agent[log.agent].success++;
        successCount++;
      } else {
        stats.by_agent[log.agent].failed++;
      }

      totalDuration += log.duration_ms;
    }

    stats.success_rate = stats.total_calls > 0
      ? (successCount / stats.total_calls * 100).toFixed(1) + '%'
      : 'N/A';
    stats.avg_duration = stats.total_calls > 0
      ? (totalDuration / stats.total_calls).toFixed(0) + 'ms'
      : 'N/A';

    return stats;
  }

  /**
   * 儲存到 LocalStorage
   */
  saveToStorage() {
    try {
      const data = {
        activeQuest: this.activeQuest ? this.activeQuest.serialize() : null,
        offeredQuests: Array.from(this.offeredQuests.values()).map(q => q.serialize()),
        completedQuests: this.completedQuests.map(q => q.serialize()),
        abandonedQuests: this.abandonedQuests.map(q => q.serialize())
      };

      localStorage.setItem('questSystem', JSON.stringify(data));
      console.log('[QuestSystem] Saved to LocalStorage');
    } catch (error) {
      console.error('[QuestSystem] Failed to save to LocalStorage', error);
    }
  }

  /**
   * 從 LocalStorage 載入
   */
  loadFromStorage() {
    try {
      const data = localStorage.getItem('questSystem');
      if (!data) {
        console.log('[QuestSystem] No saved data in LocalStorage');
        return;
      }

      const parsed = JSON.parse(data);

      // 載入 activeQuest
      if (parsed.activeQuest) {
        this.activeQuest = new Quest(parsed.activeQuest);
        this.activeQuest.deserialize(parsed.activeQuest);
      }

      // 載入 offeredQuests
      if (parsed.offeredQuests) {
        for (const questData of parsed.offeredQuests) {
          const quest = new Quest(questData);
          quest.deserialize(questData);
          this.offeredQuests.set(quest.questId, quest);
        }
      }

      // 載入 completedQuests
      if (parsed.completedQuests) {
        this.completedQuests = parsed.completedQuests.map(questData => {
          const quest = new Quest(questData);
          quest.deserialize(questData);
          return quest;
        });
      }

      // 載入 abandonedQuests
      if (parsed.abandonedQuests) {
        this.abandonedQuests = parsed.abandonedQuests.map(questData => {
          const quest = new Quest(questData);
          quest.deserialize(questData);
          return quest;
        });
      }

      console.log('[QuestSystem] Loaded from LocalStorage');
    } catch (error) {
      console.error('[QuestSystem] Failed to load from LocalStorage', error);
    }
  }

  // ===== Checkpoint 4: Game Event Handlers =====

  /**
   * 處理 NPC 互動事件
   */
  async handleNPCInteraction(data) {
    if (!this.activeQuest) return;

    const { npc, character, dialogue } = data;
    console.log(`[QuestSystem] 📞 NPC interaction: ${character} → ${npc.npcId}`);

    // 檢查是否有 talk 類型的目標
    this.activeQuest.objectives.forEach(objective => {
      if (objective.type === 'talk' && objective.status !== 'completed') {
        // 檢查是否匹配目標 NPC
        if (this.matchesObjectiveCondition(objective, { npc_id: npc.npcId })) {
          objective.updateProgress(objective.currentCount + 1);

          // 記錄貢獻
          this.activeQuest.recordContribution(character, objective.id, 'talk');

          console.log(`[QuestSystem] ✅ Talk objective progress: ${objective.title} (${objective.progress * 100}%)`);
        }
      }
    });

    // ===== Checkpoint 5: AI 評估 NPC 互動影響 =====
    // 在背景執行 AI 評估（不阻塞主流程）
    this.evaluateNPCInteraction(npc, character, dialogue).catch(err => {
      console.warn('[QuestSystem] NPC interaction evaluation failed (non-critical):', err);
    });

    this.checkQuestCompletion();
  }

  /**
   * 處理對話結束事件
   */
  handleDialogueEnd(data) {
    // 某些任務可能需要對話結束才算完成
    if (!this.activeQuest) return;

    this.checkQuestCompletion();
  }

  /**
   * 處理物品收集事件
   */
  handleItemCollected(data) {
    if (!this.activeQuest) return;

    const { item, character } = data;
    console.log(`[QuestSystem] 📦 Item collected: ${item.type} by ${character}`);

    this.activeQuest.objectives.forEach(objective => {
      if (objective.type === 'collect' && objective.status !== 'completed') {
        if (this.matchesObjectiveCondition(objective, { item_type: item.type })) {
          objective.updateProgress(objective.currentCount + 1);

          // 記錄貢獻
          this.activeQuest.recordContribution(character, objective.id, 'collect');

          console.log(`[QuestSystem] ✅ Collect objective progress: ${objective.title} (${objective.currentCount}/${objective.requiredCount})`);
        }
      }
    });

    this.checkQuestCompletion();
  }

  /**
   * 處理物品交付事件
   */
  handleItemDelivered(data) {
    if (!this.activeQuest) return;

    const { item, npc, character } = data;
    console.log(`[QuestSystem] 📮 Item delivered: ${item.name} to ${npc.npcId} by ${character}`);

    this.activeQuest.objectives.forEach(objective => {
      if (objective.type === 'deliver' && objective.status !== 'completed') {
        if (this.matchesObjectiveCondition(objective, {
          item_id: item.id,
          npc_id: npc.npcId
        })) {
          objective.updateProgress(objective.currentCount + 1);

          // 記錄貢獻
          this.activeQuest.recordContribution(character || this.mainCharacterId, objective.id, 'deliver');

          console.log(`[QuestSystem] ✅ Deliver objective completed: ${objective.title}`);
        }
      }
    });

    this.checkQuestCompletion();
  }

  /**
   * 處理區域探索事件
   */
  handleAreaExplored(data) {
    if (!this.activeQuest) return;

    const { area, character } = data;
    console.log(`[QuestSystem] 🗺️ Area explored: ${area} by ${character}`);

    this.activeQuest.objectives.forEach(objective => {
      if (objective.type === 'explore' && objective.status !== 'completed') {
        if (this.matchesObjectiveCondition(objective, { area_id: area })) {
          objective.updateProgress(1);

          // 記錄貢獻
          this.activeQuest.recordContribution(character, objective.id, 'explore');

          console.log(`[QuestSystem] ✅ Explore objective completed: ${objective.title}`);
        }
      }
    });

    this.checkQuestCompletion();
  }

  /**
   * 處理地點發現事件
   */
  handleLocationDiscovered(data) {
    if (!this.activeQuest) return;

    const { location, character } = data;
    console.log(`[QuestSystem] 📍 Location discovered: ${location} by ${character}`);

    this.activeQuest.objectives.forEach(objective => {
      if (objective.type === 'investigate' && objective.status !== 'completed') {
        if (this.matchesObjectiveCondition(objective, { location_id: location })) {
          objective.updateProgress(objective.currentCount + 1);

          // 記錄貢獻
          this.activeQuest.recordContribution(character, objective.id, 'investigate');
        }
      }
    });

    this.checkQuestCompletion();
  }

  /**
   * 處理建築物進入事件
   */
  handleBuildingEntered(data) {
    if (!this.activeQuest) return;

    const { building, character } = data;
    console.log(`[QuestSystem] 🏠 Building entered: ${building.id} by ${character}`);

    this.activeQuest.objectives.forEach(objective => {
      if (objective.type === 'explore' && objective.status !== 'completed') {
        if (this.matchesObjectiveCondition(objective, { building_id: building.id })) {
          objective.updateProgress(1);

          // 記錄貢獻
          this.activeQuest.recordContribution(character, objective.id, 'explore');
        }
      }
    });

    this.checkQuestCompletion();
  }

  /**
   * 處理建築物離開事件
   */
  handleBuildingExited(data) {
    // 目前不需要特別處理，但保留供未來使用
  }

  /**
   * 處理夥伴召喚事件
   */
  handlePartnerSummoned(data) {
    if (!this.activeQuest) return;

    const { partnerId } = data;
    console.log(`[QuestSystem] 👥 Partner summoned: ${partnerId}`);

    // 某些任務可能需要召喚特定夥伴
    this.activeQuest.objectives.forEach(objective => {
      if (objective.type === 'assist' && objective.status !== 'completed') {
        if (this.matchesObjectiveCondition(objective, { character_id: partnerId })) {
          objective.updateProgress(1);
          console.log(`[QuestSystem] ✅ Assist objective: summoned ${partnerId}`);
        }
      }
    });

    this.checkQuestCompletion();
  }

  /**
   * 處理角色切換事件
   */
  handleCharacterSwitched(data) {
    // 記錄當前控制的角色，供貢獻度追蹤使用
    const { characterId } = data;
    this.currentControlledCharacter = characterId;
  }

  /**
   * 處理自訂動作事件
   */
  handleCustomAction(data) {
    if (!this.activeQuest) return;

    const { action, character } = data;
    console.log(`[QuestSystem] ⚡ Custom action: ${action} by ${character}`);

    this.activeQuest.objectives.forEach(objective => {
      if (objective.type === 'custom' && objective.status !== 'completed') {
        if (this.matchesObjectiveCondition(objective, { action_id: action })) {
          objective.updateProgress(objective.currentCount + 1);

          // 記錄貢獻
          this.activeQuest.recordContribution(character, objective.id, 'custom');
        }
      }
    });

    this.checkQuestCompletion();
  }

  /**
   * 檢查目標條件是否匹配
   * @param {Objective} objective - 目標對象
   * @param {Object} eventData - 事件資料
   * @returns {boolean}
   */
  matchesObjectiveCondition(objective, eventData) {
    // 如果目標沒有條件，則默認匹配
    if (!objective.conditions || objective.conditions.length === 0) {
      return true;
    }

    // 檢查所有條件是否滿足
    return objective.conditions.every(condition => {
      const key = Object.keys(condition)[0];
      const value = condition[key];
      return eventData[key] === value;
    });
  }

  /**
   * Checkpoint 4: 檢查任務是否完成
   */
  checkQuestCompletion() {
    if (!this.activeQuest) return;

    // 檢查所有必要目標是否完成
    const requiredObjectives = this.activeQuest.objectives.filter(obj => !obj.optional);
    const completedRequired = requiredObjectives.filter(obj => obj.status === 'completed');

    const progress = requiredObjectives.length > 0
      ? completedRequired.length / requiredObjectives.length
      : 0;

    console.log(`[QuestSystem] Quest progress: ${completedRequired.length}/${requiredObjectives.length} required objectives`);

    // 所有必要目標完成 → 任務完成
    if (completedRequired.length === requiredObjectives.length && requiredObjectives.length > 0) {
      this.completeQuest();
    }

    // 發送進度更新事件
    eventBus.emit('QUEST_PROGRESS_UPDATED', {
      questId: this.activeQuest.questId,
      progress: progress,
      completedObjectives: completedRequired.length,
      totalObjectives: requiredObjectives.length
    });

    // 儲存進度
    this.saveToStorage();
  }

  /**
   * Checkpoint 4: 完成任務
   */
  completeQuest() {
    if (!this.activeQuest) return;

    const quest = this.activeQuest;

    console.log(`[QuestSystem] 🎉 Quest completed: ${quest.questId}`);

    // 使用狀態機轉換狀態
    if (!this.stateMachine.transition(quest, QuestStatus.COMPLETED, 'all_objectives_completed')) {
      console.error('[QuestSystem] Failed to transition quest to completed state');
      return;
    }

    // 計算最終獎勵（Checkpoint 7 會整合 AI 評估）
    const rewards = quest.rewards || { money: 0, exp: 0, items: [] };

    // 團隊加成（如果有多個角色參與）
    const participantCount = quest.participants.length;
    if (participantCount > 1) {
      rewards.exp = Math.floor(rewards.exp * (1 + (participantCount - 1) * 0.1));
      console.log(`[QuestSystem] Team bonus applied: ${participantCount} participants, +${(participantCount - 1) * 10}% EXP`);
    }

    // 刪除 RAG session
    if (quest.aiContext && quest.aiContext.ragSessionId) {
      this.deleteRAGSession(quest.aiContext.ragSessionId, quest.questId);
    }

    // 移動到 completedQuests
    this.activeQuest = null;
    this.completedQuests.push(quest);

    // 只保留最近 10 個完成任務
    if (this.completedQuests.length > 10) {
      this.completedQuests.shift();
    }

    // 儲存到 LocalStorage
    this.saveToStorage();

    // 發送完成事件
    eventBus.emit('QUEST_COMPLETED', {
      quest: quest,
      rewards: rewards
    });

    console.log(`[QuestSystem] Rewards: ${rewards.money} 金幣, ${rewards.exp} 經驗值`);
  }

  /**
   * Checkpoint 3: Delete RAG session
   * @param {string} sessionId - RAG session ID
   * @param {string} questId - Quest ID (for logging)
   */
  async deleteRAGSession(sessionId, questId) {
    if (!sessionId) return;

    try {
      console.log(`[QuestSystem] 🗑️ Deleting RAG session: ${sessionId} (quest: ${questId})`);

      // Call AI service to delete session (assuming deleteRAGSession exists)
      // Check if the method exists first
      if (typeof aiService.deleteRAGSession === 'function') {
        await aiService.deleteRAGSession(sessionId);
        console.log(`[QuestSystem] ✅ RAG session deleted: ${sessionId}`);
      } else {
        console.warn('[QuestSystem] deleteRAGSession not available in aiService');
      }

      // Log the deletion
      this.logAgentCall('delete-rag-session', {
        input: { session_id: sessionId, quest_id: questId },
        output: { success: true },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.warn(`[QuestSystem] ⚠️ Failed to delete RAG session ${sessionId}:`, error);
      // Non-critical error - continue anyway
    }
  }

  /**
   * Checkpoint 5: 評估 NPC 互動對任務的影響
   * 調用 AI 判斷是否應該：創建子任務、提供提示、解鎖替代路徑、觸發事件
   * @param {Object} npc - NPC 資料
   * @param {string} character - 角色 ID
   * @param {Object} dialogue - 對話內容
   */
  async evaluateNPCInteraction(npc, character, dialogue) {
    if (!this.activeQuest) return;

    const quest = this.activeQuest;

    console.log(`[QuestSystem] 🤖 Evaluating NPC interaction impact: ${character} → ${npc.npcId}`);

    try {
      // 構建請求參數
      const params = {
        npc_id: npc.npcId,
        npc_type: npc.type || 'resident',
        player_id: character,
        dialogue_content: dialogue || {},
        active_mission: {
          quest_id: quest.questId,
          title: quest.title,
          objectives: quest.objectives.map(obj => ({
            id: obj.id,
            type: obj.type,
            title: obj.title,
            status: obj.status,
            progress: obj.progress
          })),
          participants: quest.participants
        },
        interaction_history: quest.aiContext?.conversationHistory || []
      };

      // 調用 AI 評估
      const evaluation = await aiService.evaluateNPCInteraction(params);

      // 記錄 Agent 調用
      this.logAgentCall('evaluate-npc-interaction', {
        input: {
          npc_id: npc.npcId,
          character: character,
          quest_id: quest.questId
        },
        output: evaluation,
        timestamp: new Date().toISOString()
      });

      // 如果是 offline fallback，直接返回
      if (evaluation.offline) {
        console.log('[QuestSystem] Using offline fallback for NPC interaction evaluation');
        return;
      }

      // 處理 AI 建議：創建子任務
      if (evaluation.creates_subtask && evaluation.subtask_data) {
        const subtaskData = evaluation.subtask_data;
        console.log(`[QuestSystem] 🆕 AI suggests creating subtask: ${subtaskData.title}`);

        // 創建動態 objective
        const newObjective = new Objective({
          id: `dynamic_${Date.now()}`,
          type: subtaskData.type || 'custom',
          title: subtaskData.title,
          description: subtaskData.description,
          optional: true,
          isDynamic: true,
          aiGenerated: true,
          aiReasoning: `Generated from interaction with ${npc.npcId}`,
          conditions: subtaskData.conditions || {}
        });

        quest.objectives.push(newObjective);
        quest.aiContext.memory.keyMoments.push(
          `Dynamic subtask created: ${subtaskData.title} (from NPC ${npc.npcId})`
        );

        // 發送事件通知 UI 更新
        eventBus.emit('QUEST_OBJECTIVE_ADDED', {
          questId: quest.questId,
          objective: newObjective
        });

        console.log(`[QuestSystem] ✅ Dynamic objective added: ${newObjective.title}`);
      }

      // 處理 AI 建議：提供提示
      if (evaluation.provides_hint && evaluation.hint) {
        console.log(`[QuestSystem] 💡 AI provides hint: ${evaluation.hint}`);

        quest.aiContext.memory.keyMoments.push(
          `Hint received from ${npc.npcId}: ${evaluation.hint}`
        );

        // 發送提示事件
        eventBus.emit('QUEST_HINT_PROVIDED', {
          questId: quest.questId,
          hint: evaluation.hint,
          npcId: npc.npcId
        });
      }

      // 處理 AI 建議：解鎖替代路徑
      if (evaluation.unlocks_alternative && evaluation.alternative_data) {
        const altData = evaluation.alternative_data;
        console.log(`[QuestSystem] 🔓 AI unlocks alternative path: ${altData.title}`);

        quest.aiContext.memory.keyMoments.push(
          `Alternative path unlocked: ${altData.title} (from NPC ${npc.npcId})`
        );

        // 發送替代路徑事件
        eventBus.emit('QUEST_ALTERNATIVE_UNLOCKED', {
          questId: quest.questId,
          alternative: altData,
          npcId: npc.npcId
        });
      }

      // 處理 AI 建議：觸發事件
      if (evaluation.triggers_event && evaluation.event_data) {
        const eventData = evaluation.event_data;
        console.log(`[QuestSystem] ⚡ AI triggers event: ${eventData.type}`);

        quest.aiContext.memory.keyMoments.push(
          `Event triggered: ${eventData.type} - ${eventData.description} (from NPC ${npc.npcId})`
        );

        // 發送世界事件
        eventBus.emit('QUEST_EVENT_TRIGGERED', {
          questId: quest.questId,
          event: eventData,
          npcId: npc.npcId
        });
      }

      // 記錄 NPC 關係變化（如果 AI 有提供）
      if (evaluation.relationship_change) {
        const currentRelation = quest.aiContext.memory.npcRelationships[npc.npcId] || 0;
        quest.aiContext.memory.npcRelationships[npc.npcId] = currentRelation + evaluation.relationship_change;
        console.log(`[QuestSystem] 💝 NPC relationship updated: ${npc.npcId} → ${quest.aiContext.memory.npcRelationships[npc.npcId]}`);
      }

      // 儲存更新
      this.saveToStorage();

    } catch (error) {
      console.error('[QuestSystem] ❌ Failed to evaluate NPC interaction:', error);
      // Non-critical error - quest continues normally
    }
  }

  /**
   * 清除所有任務（用於測試）
   */
  clearAll() {
    this.offeredQuests.clear();
    this.activeQuest = null;
    this.completedQuests = [];
    this.abandonedQuests = [];
    this.agentCallLog = [];

    localStorage.removeItem('questSystem');
    console.log('[QuestSystem] Cleared all quests');
  }
}

// 創建單例
export const questSystem = new QuestSystem();
