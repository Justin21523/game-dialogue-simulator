/**
 * MissionManager - Phase 1 foundation
 * - Centralizes quest/mission state (main + sub) with clear records
 * - Maps game events to objective progress (talk/collect/explore/deliver/assist/custom)
 * - Emits observability events so UI stays decoupled
 */
import { eventBus } from '../core/event-bus.js';
import { questSystem } from '../systems/quest-system.js';
import { QuestStatus, QuestStateMachine, ObjectiveType, Quest } from '../models/quest.js';
import { aiService } from '../core/ai-service.js';

class MissionManager {
  constructor() {
    this.quests = new Map();               // questId -> Quest
    this.records = new Map();              // questId -> { type, status, participants, timestamps }
        this.offered = new Set();              // questIds that are offered
        this.activeMain = null;                // questId of active main quest
        this.activeSubs = new Set();           // questIds of active sub quests
        this.completed = new Set();            // questIds completed
        this.abandoned = new Set();            // questIds abandoned
    this.stateMachine = new QuestStateMachine();
    this.initialized = false;
    this.log = [];
    this.maxLog = 200;
    this.storageKey = 'missionManagerState';

    // Simple ID helper
    this._idCounter = 0;

    // 最近事件（Context Agent 用）
    this.recentEvents = [];

    // 狀態流/Agent 摘要
    this.stateLog = [];
  }

    /**
     * Initialize MissionManager and wire event mapping.
     * @param {Object} options
     * @param {string} [options.mainCharacter='jett']
     */
  async initialize(options = {}) {
    if (this.initialized) return;

    this.mainCharacter = options.mainCharacter || 'jett';

    // Initialize QuestSystem without attaching its own listeners (we drive events here)
    await questSystem.initialize({ attachEventListeners: false, mainCharacter: this.mainCharacter });

    // Load persisted state (quests + records)
    this.loadFromStorage();

    this.registerEventListeners();
    this.initialized = true;
    this.logEvent('init', { message: 'MissionManager initialized' });
  }

  registerEventListeners() {
        // Quest lifecycle passthrough (keeps MissionManager in sync if quests are completed externally)
    eventBus.on('QUEST_ACCEPTED', ({ quest }) => {
      if (quest?.questId) this.syncAccepted(quest);
    });
    eventBus.on('QUEST_COMPLETED', ({ quest }) => {
      if (quest?.questId) this.markCompleted(quest.questId, { source: 'quest_event' });
    });
        eventBus.on('QUEST_ABANDONED', ({ quest }) => {
            if (quest?.questId) this.markAbandoned(quest.questId, { source: 'quest_event' });
        });

        // Progress-driving game events
        const mapper = (type) => (data) => this.routeProgressEvent(type, data);
    eventBus.on('NPC_INTERACTION', mapper('NPC_INTERACTION'));
    eventBus.on('DIALOGUE_END', mapper('DIALOGUE_END'));
    eventBus.on('ITEM_COLLECTED', mapper('ITEM_COLLECTED'));
    eventBus.on('DELIVER_ITEM', mapper('DELIVER_ITEM'));
        eventBus.on('AREA_EXPLORED', mapper('AREA_EXPLORED'));
        eventBus.on('LOCATION_DISCOVERED', mapper('LOCATION_DISCOVERED'));
        eventBus.on('BUILDING_ENTERED', mapper('BUILDING_ENTERED'));
        eventBus.on('BUILDING_EXITED', mapper('BUILDING_EXITED'));
    eventBus.on('PARTNER_SUMMONED', mapper('PARTNER_SUMMONED'));
    eventBus.on('CHARACTER_SWITCHED', mapper('CHARACTER_SWITCHED'));
    eventBus.on('CUSTOM_ACTION', mapper('CUSTOM_ACTION'));

    // 其他世界事件
    eventBus.on('PORTAL_ENTERED', mapper('PORTAL_ENTERED'));
    eventBus.on('GOAL_REACHED', mapper('GOAL_REACHED'));
    eventBus.on('EVENT_TRIGGERED', mapper('EVENT_TRIGGERED'));

    // 監聽 AI 降級
    eventBus.on('AI_OFFLINE_MODE', () => {
      this.logEvent('ai_offline', { message: 'AI backend unavailable, switching to fallback' });
      eventBus.emit('SHOW_TOAST', {
        message: '⚠️ 任務已轉為離線模式（AI 不可用）',
        type: 'warning',
        duration: 4000,
      });
    });
  }

    /**
     * Create or register a quest in the manager.
     * @param {Quest} quest
     * @param {Object} options
     * @param {'main'|'sub'} [options.type='sub']
     * @returns {Quest}
     */
    registerQuest(quest, options = {}) {
        if (!(quest instanceof Quest)) {
            throw new Error('[MissionManager] registerQuest expects a Quest instance');
        }

        const type = options.type || quest.type || 'sub';
        quest.type = type;

        this.quests.set(quest.questId, quest);
        this.records.set(quest.questId, {
            questId: quest.questId,
            type,
            status: quest.status,
            participants: quest.participants || [],
            createdAt: quest.createdAt || Date.now(),
            offeredAt: quest.offeredAt || null,
            startedAt: quest.startedAt || null,
        });

        return quest;
    }

    /**
     * Offer a quest to the player (record is created here).
     */
  offerQuest(quest, options = {}) {
    const registered = this.registerQuest(quest, options);

    if (!this.stateMachine.canTransition(registered.status, QuestStatus.OFFERED)) {
      this.logEvent('offer_skipped', { questId: registered.questId, from: registered.status });
      return registered;
    }

    registered.offer();
    this.offered.add(registered.questId);
    const rec = this.records.get(registered.questId);
    if (rec) rec.offeredAt = Date.now();

    eventBus.emit('MISSION_RECORD_CREATED', { quest: registered, record: rec });
    eventBus.emit('MISSION_STATE_CHANGED', { quest: registered, status: registered.status, type: rec?.type });
    this.logEvent('offer', { questId: registered.questId, type: rec?.type });
    this.saveToStorage();
    return registered;
  }

    /**
     * Accept a quest as main or sub.
     */
    async acceptQuest(questId, options = {}) {
        const quest = this.quests.get(questId);
        if (!quest) throw new Error(`[MissionManager] Quest ${questId} not found`);

        const type = options.type || quest.type || 'sub';
        const actor = options.actorId || this.mainCharacter;

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
      rec.startedAt = quest.startedAt || Date.now();
      rec.type = type;
    }

    eventBus.emit('MISSION_STATE_CHANGED', { quest, status: quest.status, type });
    this.logEvent('accept', { questId, type });
    this.saveToStorage();
    return quest;
  }

    /**
     * Decline an offered quest.
     */
    declineQuest(questId) {
        const quest = this.quests.get(questId);
        if (!quest) return false;
        if (quest.status !== QuestStatus.OFFERED) return false;

    this.offered.delete(questId);
    quest.status = QuestStatus.ABANDONED;
    this.abandoned.add(questId);
    this.updateRecordStatus(questId, QuestStatus.ABANDONED);

    eventBus.emit('MISSION_STATE_CHANGED', { quest, status: quest.status, type: this.records.get(questId)?.type });
    this.logEvent('decline', { questId });
    this.saveToStorage();
    return true;
  }

    /**
     * Abandon an active quest.
     */
    abandonQuest(questId) {
        const quest = this.quests.get(questId);
        if (!quest) return false;
        if (![QuestStatus.ACTIVE, QuestStatus.OFFERED].includes(quest.status)) return false;

        quest.abandon();
    this.activeSubs.delete(questId);
    if (this.activeMain === questId) this.activeMain = null;
    this.abandoned.add(questId);
    this.updateRecordStatus(questId, quest.status);

    eventBus.emit('MISSION_STATE_CHANGED', { quest, status: quest.status, type: this.records.get(questId)?.type });
    this.logEvent('abandon', { questId });
    this.saveToStorage();
    return true;
  }

    /**
     * Route a gameplay event to all active quests.
     */
  routeProgressEvent(eventType, payload) {
    const activeQuests = this.getActiveQuests();
    if (activeQuests.length === 0) return;

    const actorId = payload?.character || payload?.player?.characterId || payload?.actorId || this.mainCharacter;

    // 記錄事件供 Context Agent
    this.recentEvents.push({
      eventType,
      actorId,
      payload,
      timestamp: Date.now(),
    });
    if (this.recentEvents.length > 30) this.recentEvents.shift();

    for (const quest of activeQuests) {
      let updated = false;
      for (const objective of quest.objectives || []) {
        updated = this.updateObjectiveForEvent(quest, objective, eventType, payload, actorId) || updated;
            }
            if (updated) {
                this.checkQuestCompletion(quest);
            }
        }
    }

    updateObjectiveForEvent(quest, objective, eventType, payload, actorId) {
        if (objective.status === 'completed') return false;
        if (objective.assignedCharacter && objective.assignedCharacter !== actorId) return false;

        const matcher = (value, keys = []) => {
            if (!value) return false;
            if (objective.conditions && objective.conditions.some(cond => keys.some(k => cond[k] === value))) {
                return true;
            }
            const directTargets = [
                objective.target,
                objective.targetId,
                objective.npcId,
                objective.location,
                objective.itemId,
                objective.areaId,
                objective.action,
            ].filter(Boolean);
            return directTargets.includes(value);
        };

        switch (objective.type) {
            case ObjectiveType.TALK: {
                if (eventType !== 'NPC_INTERACTION') break;
                const npcId = payload?.npc?.npcId || payload?.npcId;
            if (matcher(npcId, ['npc_id', 'target', 'target_npc'])) {
                objective.updateProgress(objective.currentCount + 1);
                this.emitObjectiveUpdate(quest, objective, 'talk', { npcId, actorId });
                return true;
            }
            break;
        }
            case ObjectiveType.COLLECT: {
                if (eventType !== 'ITEM_COLLECTED') break;
                const itemType = payload?.itemId || payload?.item?.id || payload?.item?.type;
                const qty = payload?.item?.quantity || payload?.quantity || 1;
                if (matcher(itemType, ['item_type', 'item_id'])) {
                    const next = Math.min(objective.requiredCount || 1, objective.currentCount + qty);
                    objective.updateProgress(next);
                    this.emitObjectiveUpdate(quest, objective, 'collect', { itemType, qty, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.DELIVER: {
                if (eventType !== 'DELIVER_ITEM') break;
                const itemType = payload?.item?.type || payload?.itemId;
                const npcId = payload?.npc?.npcId || payload?.npcId;
                if (matcher(itemType, ['item_type', 'item_id']) && matcher(npcId, ['npc_id', 'target_npc'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'deliver', { itemType, npcId, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.EXPLORE: {
                if (eventType !== 'AREA_EXPLORED' && eventType !== 'LOCATION_DISCOVERED' && eventType !== 'BUILDING_ENTERED' && eventType !== 'PORTAL_ENTERED') break;
                const area = payload?.area || payload?.location || payload?.building?.id || payload?.areaId || payload?.buildingId;
                if (matcher(area, ['area', 'location', 'building_id'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'explore', { area, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.ASSIST: {
                if (eventType !== 'PARTNER_SUMMONED' && eventType !== 'CUSTOM_ACTION') break;
                const partner = payload?.partnerId || payload?.partner || payload?.actionTarget;
                if (matcher(partner, ['partner_id', 'ally_id'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'assist', { partner, actorId });
                    return true;
                }
                break;
            }
            case ObjectiveType.CUSTOM: {
                const action = payload?.action || payload?.type || payload?.customType;
                if (matcher(action, ['action', 'custom_action'])) {
                    objective.updateProgress(objective.currentCount + 1);
                    this.emitObjectiveUpdate(quest, objective, 'custom', { action, actorId });
                    return true;
                }
                break;
            }
            default:
                break;
        }

        return false;
    }

  emitObjectiveUpdate(quest, objective, kind, extra = {}) {
    if (extra.actorId && objective.status === 'completed') {
      objective.completedBy = extra.actorId;
    }
    eventBus.emit('OBJECTIVE_PROGRESS_UPDATED', {
      questId: quest.questId,
      objectiveId: objective.id,
      status: objective.status,
      progress: objective.progress,
      kind,
      ...extra,
    });
    eventBus.emit('QUEST_PROGRESS_UPDATED', {
      questId: quest.questId,
      questStatus: quest.status,
      objectives: quest.objectives,
      quest,
    });
    this.logEvent('objective_update', {
      questId: quest.questId,
      objectiveId: objective.id,
      status: objective.status,
      progress: objective.progress,
      kind,
      extra,
    });
    this.pushStateLog('objective_update', {
      questId: quest.questId,
      objectiveId: objective.id,
      status: objective.status,
      progress: objective.progress,
      actorId: extra.actorId,
    });
    this.saveToStorage();

    // 非阻塞調用 Task Evaluator / Context Agent
    this.evaluateObjectiveAgent(quest, objective, kind, extra).catch((err) => {
      console.warn('[MissionManager] Task evaluator failed (non-blocking)', err);
    });
  }

    checkQuestCompletion(quest) {
      const required = (quest.objectives || []).filter(o => !o.optional);
      const completed = required.filter(o => o.status === 'completed');
      if (required.length > 0 && completed.length === required.length) {
        this.markCompleted(quest.questId, { source: 'objective_progress' });
        quest.complete({ completion_type: 'full' });
        this.saveToStorage();
      }
    }

    markCompleted(questId, meta = {}) {
        const quest = this.quests.get(questId);
        if (!quest) return;

        this.activeSubs.delete(questId);
        if (this.activeMain === questId) this.activeMain = null;
        this.offered.delete(questId);
        this.completed.add(questId);
        this.updateRecordStatus(questId, QuestStatus.COMPLETED);

    eventBus.emit('MISSION_STATE_CHANGED', { quest, status: QuestStatus.COMPLETED, source: meta.source });
    this.logEvent('complete', { questId, source: meta.source });
    this.saveToStorage();
  }

    markAbandoned(questId, meta = {}) {
        const quest = this.quests.get(questId);
        if (!quest) return;

        this.activeSubs.delete(questId);
        if (this.activeMain === questId) this.activeMain = null;
        this.offered.delete(questId);
        this.abandoned.add(questId);
        this.updateRecordStatus(questId, QuestStatus.ABANDONED);

    eventBus.emit('MISSION_STATE_CHANGED', { quest, status: QuestStatus.ABANDONED, source: meta.source });
    this.logEvent('abandon', { questId, source: meta.source });
    this.saveToStorage();
  }

    /**
     * Sync if a quest was accepted outside of MissionManager.
     */
    syncAccepted(quest) {
      if (!quest || !quest.questId) return;
      if (!this.quests.has(quest.questId)) {
        this.registerQuest(quest, { type: quest.type || 'sub' });
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

    /**
     * Context helpers for UI and interaction systems.
     */
    getActiveMainQuest() {
        return this.activeMain ? this.quests.get(this.activeMain) : null;
    }

    getActiveSubQuests() {
        return Array.from(this.activeSubs).map(id => this.quests.get(id)).filter(Boolean);
    }

    getActiveQuests() {
        const quests = [];
        if (this.activeMain) {
            const main = this.quests.get(this.activeMain);
            if (main) quests.push(main);
        }
        for (const id of this.activeSubs) {
            const quest = this.quests.get(id);
            if (quest) quests.push(quest);
        }
        return quests;
    }

  getQuest(questId) {
    return this.quests.get(questId) || null;
  }

    getOfferedQuestsByNPC(npcId) {
        return Array.from(this.offered)
            .map(id => this.quests.get(id))
            .filter(q => q && q.questGiverNPC === npcId);
    }

    isQuestNPC(npcId) {
        return this.getOfferedQuestsByNPC(npcId).length > 0;
    }

    isTargetNPC(npcId) {
        return this.getActiveQuests().some(q => q.relatedNPCs?.includes(npcId));
    }

  getProgressSummaries() {
    return this.getActiveQuests().map((q) => {
      const completedObjectives = q.objectives.filter(o => o.status === 'completed').length;
      const totalObjectives = q.objectives.length;
      return {
        questId: q.questId,
        title: q.title,
        type: q.type,
        status: q.status,
        completedObjectives,
        totalObjectives,
        progress: totalObjectives > 0 ? completedObjectives / totalObjectives : 0,
      };
    });
  }

    /**
     * Phase 2: Dialogue agent to generate intro/options for quest offering
     */
    async generateQuestDialogue(npcData, context = {}) {
        const traceId = this._makeTraceId('dlg');
        const payload = {
            npc_name: npcData.name || npcData.npcId,
            npc_id: npcData.npcId,
            location: context.worldDestination || context.location || '未知地點',
            mission_phase: context.missionPhase || null,
            problem: context.problem || npcData.problem,
            player_id: context.currentPlayer || this.mainCharacter,
            dialogue_history: context.dialogueHistory || [],
            trace_id: traceId,
        };

        const result = await aiService.generateDialogueOptions(payload, { requestId: traceId });
        this.pushStateLog('agent_dialogue', {
            traceId,
            npcId: payload.npc_id,
            input: {
                location: payload.location,
                mission_phase: payload.mission_phase,
                problem: payload.problem
            },
            output: {
                intro: result?.intro?.slice(0, 60),
                options: result?.options?.length || 0,
                hint: result?.hint
            }
        });

        return result || { trace_id: traceId, intro: 'Need help?', options: [{ id: 'accept', text: 'Accept' }, { id: 'decline', text: 'Decline' }] };
    }

    /**
     * Phase 2: Quest planner agent -> build main quest + sub quests.
     */
    async generateQuestPlan(npcData, context = {}) {
        const traceId = this._makeTraceId('plan');
        const payload = {
            destination: context.worldDestination || context.destination || '未知地點',
            difficulty: context.playerLevel || 1,
            availableCharacters: context.availableCharacters || [this.mainCharacter],
            mission_type: npcData.mission_type || npcData.type || 'delivery',
            npc_name: npcData.name || npcData.npcId,
            npc_id: npcData.npcId,
            quest_id: context.questId,
            trace_id: traceId,
        };

        const graph = await aiService.generateMissionGraph(payload, { requestId: traceId });
        this.pushStateLog('agent_plan', {
            traceId,
            npcId: payload.npc_id,
            nodes: graph?.nodes?.length || 0,
            entryPoints: graph?.entry_points || [],
            rewards: graph?.rewards,
            degraded: !graph
        });

        // Build main quest
        const mainQuestId = `main_${Date.now()}_${this._idCounter++}`;
        const objectives = this._nodesToObjectives(graph.nodes || [], graph.entry_points || []);
        const mainQuest = new Quest({
            questId: mainQuestId,
            title: graph.title || `幫助 ${payload.npc_name}`,
            description: graph.description || `${payload.npc_name || 'NPC'} 需要協助`,
            type: 'main',
            status: QuestStatus.PENDING,
            relatedNPCs: [payload.npc_id].filter(Boolean),
            questGiverNPC: payload.npc_id,
            objectives,
            rewards: graph.rewards || { money: 150, exp: 80 },
            aiContext: { traceId, missionGraph: graph },
        });

        // Build one sub quest from alternative path if available
        const subQuests = [];
        const altNode = this._pickAlternativeNode(graph.nodes || [], graph.entry_points || []);
        if (altNode) {
            const subQuest = new Quest({
                questId: `sub_${Date.now()}_${this._idCounter++}`,
                title: altNode.title || '替代路徑',
                description: altNode.description || '嘗試另一種作法',
                type: 'sub',
                status: QuestStatus.PENDING,
                relatedNPCs: [payload.npc_id].filter(Boolean),
                questGiverNPC: payload.npc_id,
                objectives: [this._nodeToObjective(altNode)],
                rewards: graph.rewards || { money: 80, exp: 40 },
                aiContext: { traceId, missionGraph: graph, sourceNode: altNode.id },
            });
            subQuests.push(subQuest);
        }

        return { mainQuest, subQuests, traceId, graph };
    }

    _nodesToObjectives(nodes, entryPoints) {
        const list = [];
        nodes.forEach((node) => {
            list.push(this._nodeToObjective(node, entryPoints.includes(node.id)));
        });
        return list;
    }

    _nodeToObjective(node, isEntry = false) {
        const typeMap = {
            talk: ObjectiveType.TALK,
            explore: ObjectiveType.EXPLORE,
            fetch: ObjectiveType.COLLECT,
            collect: ObjectiveType.COLLECT,
            deliver: ObjectiveType.DELIVER,
            solve: ObjectiveType.CUSTOM,
            rescue: ObjectiveType.ASSIST,
            investigate: ObjectiveType.CUSTOM,
        };
        return {
            id: node.id || `obj_${this._idCounter++}`,
            type: typeMap[node.type] || ObjectiveType.CUSTOM,
            title: node.title || '目標',
            description: node.description || '',
            status: isEntry ? 'active' : 'pending',
            requiredCount: 1,
            conditions: [{ target: node.target || node.id }],
            optional: !!node.optional,
            alternatives: node.alternatives || [],
            assignedCharacter: node.assigned_to || null,
            aiGenerated: true,
        };
    }

    _pickAlternativeNode(nodes, entryPoints) {
        const setEntry = new Set(entryPoints || []);

        // 1) 如果有第二個 entry point，優先用它
        if (entryPoints && entryPoints.length > 1) {
            const second = nodes.find((n) => n.id === entryPoints[1]);
            if (second) return second;
        }

        // 2) 有 alternatives 標記的節點
        const altFromEntry = nodes.find((n) => n.alternatives && n.alternatives.length > 0);
        if (altFromEntry) return altFromEntry;

        // 3) 有 optional 標記的節點
        const optionalNode = nodes.find((n) => n.optional);
        if (optionalNode) return optionalNode;

        // 4) 非入口的常見節點類型
        return nodes.find((n) => !setEntry.has(n.id) && (n.type === 'talk' || n.type === 'explore' || n.type === 'fetch'));
    }

    /**
     * Task Evaluator + Context Agent 整合
     */
  async evaluateObjectiveAgent(quest, objective, kind, extra) {
    const traceId = quest.aiContext?.traceId || this._makeTraceId('eval');
    const actorId = extra?.actorId || extra?.character || this.mainCharacter;

    const payload = {
      quest_id: quest.questId,
      objective_id: objective.id,
      quest_type: quest.type,
      quest_status: quest.status,
      objective_type: objective.type,
      objective_status: objective.status,
      actor_id: actorId,
      progress: objective.progress,
      recent_events: this.recentEvents.slice(-10),
      participants: quest.participants,
      memory: quest.aiContext?.memory || {},
      trace_id: traceId,
    };

    const result = await aiService.evaluateMissionProgress(payload, { requestId: traceId });
    this.pushStateLog('agent_evaluator', {
      traceId,
      success: !!result && !result.degraded,
      degraded: !!result?.degraded,
      hint: result?.hint,
      completed: result?.completed_objectives,
      updated: result?.updated_objectives,
    });

        if (result?.hint) {
            eventBus.emit('SHOW_TOAST', {
                message: `💡 ${result.hint}`,
                type: 'info',
                duration: 4000,
            });
        }

        if (Array.isArray(result?.completed_objectives)) {
            result.completed_objectives.forEach((objId) => {
                const obj = quest.objectives.find((o) => o.id === objId);
                if (obj && obj.status !== 'completed') {
                    obj.complete();
                }
            });
        }

        if (Array.isArray(result?.updated_objectives)) {
            result.updated_objectives.forEach((update) => {
                const obj = quest.objectives.find((o) => o.id === update.id);
                if (obj) {
                    if (update.status) obj.status = update.status;
                    if (typeof update.progress === 'number') obj.progress = update.progress;
                    if (typeof update.currentCount === 'number') obj.currentCount = update.currentCount;
                    if (update.hint) obj.hint = update.hint;
                }
            });
        }

    // Context Agent：更新 quest 記憶
    const ctxRes = await aiService.updateQuestContext(
      {
        quest_id: quest.questId,
        actor_id: actorId,
        memory: {
          ...quest.aiContext?.memory,
                    last_update: Date.now(),
                    recent_events: this.recentEvents.slice(-10),
                },
                trace_id: traceId,
      },
      { requestId: traceId }
    );
    this.pushStateLog('agent_context', {
      traceId,
      saved: ctxRes?.saved,
      offline: ctxRes?.offline,
    });

    // 再次檢查任務完成狀態（可能因 AI 完成了更多目標）
    this.checkQuestCompletion(quest);
  }

    _makeTraceId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Utility used by InteractionSystem to build quest context for NPCs.
     */
    buildContextForNPC(npc) {
        const offered = this.getOfferedQuestsByNPC(npc.npcId);
        const activeMainQuest = this.getActiveMainQuest();
        const activeSubQuests = this.getActiveSubQuests();

        return {
            activeQuestId: activeMainQuest?.questId || null,
            activeMainQuest,
            activeSubQuests,
            offeredQuests: offered,
            hasOfferedQuest: offered.length > 0,
            isQuestNPC: this.isQuestNPC(npc.npcId),
            isTargetNPC: this.isTargetNPC(npc.npcId),
            questProgress: this.getProgressSummaries(),
        };
    }

    /**
     * AI helpers - delegate to QuestSystem for generation (Phase 1 reuse).
     */
    async generateQuestFromNPC(npcData, context = {}) {
        const quest = await questSystem.generateQuestFromNPC(npcData, context);
        return quest;
    }

    createTestQuest(data = {}) {
        return questSystem.createTestQuest(data);
    }

  updateRecordStatus(questId, status) {
    const rec = this.records.get(questId);
    if (rec) rec.status = status;
  }

  logEvent(type, detail) {
    this.log.push({ type, detail, timestamp: Date.now() });
    if (this.log.length > this.maxLog) this.log.shift();
  }

  pushStateLog(type, detail) {
    this.stateLog.push({ type, detail, timestamp: Date.now() });
    if (this.stateLog.length > 200) this.stateLog.shift();
    eventBus.emit('MISSION_STATE_LOG', { type, detail, timestamp: Date.now() });
  }

  saveToStorage() {
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
        stateLog: this.stateLog,
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (err) {
      console.warn('[MissionManager] Failed to save state', err);
    }
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data) return;

      this.quests.clear();
      this.records.clear();

      (data.quests || []).forEach((qData) => {
        const quest = new Quest(qData);
        quest.deserialize(qData);
        this.quests.set(quest.questId, quest);
      });

      (data.records || []).forEach((rec) => {
        this.records.set(rec.questId, rec);
      });

      this.activeMain = data.activeMain || null;
      this.activeSubs = new Set(data.activeSubs || []);
      this.offered = new Set(data.offered || []);
      this.completed = new Set(data.completed || []);
      this.abandoned = new Set(data.abandoned || []);
      this.recentEvents = data.recentEvents || [];
      this.stateLog = data.stateLog || [];
    } catch (err) {
      console.warn('[MissionManager] Failed to load state', err);
    }
  }
}

export const missionManager = new MissionManager();
