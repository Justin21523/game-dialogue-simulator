/**
 * ExplorationMission - 探索任務模型
 * 包含子任務、NPC、物品、建築等場景資料
 */

import { eventBus } from '../core/event-bus.js';

export class ExplorationMission {
    constructor(data = {}) {
        console.log('[ExplorationMission] Constructor received data with:', {
            hasNPCs: !!data.npcs,
            npcCount: data.npcs?.length || 0,
            hasItems: !!data.items,
            itemCount: data.items?.length || 0
        });

        // 基本資訊
        this.id = data.id || `mission_${Date.now()}`;
        this.title = data.title || '探索任務';
        this.description = data.description || '';
        this.destination = data.destination || null;

        // 任務類型
        this.type = data.type || 'exploration';  // exploration, delivery, rescue, collection

        // 難度與獎勵
        this.difficulty = data.difficulty || 1;
        this.rewards = data.rewards || {
            money: 100,
            exp: 50,
            items: []
        };

        // 時間限制
        this.timeLimit = data.timeLimit || null;  // 毫秒，null = 無限
        this.startTime = null;
        this.elapsedTime = 0;

        // 子任務
        this.subTasks = (data.subTasks || []).map(t => new SubTask(t));
        this.currentTaskIndex = 0;

        // 場景元素
        this.npcs = data.npcs || [];
        this.items = data.items || [];
        this.buildings = data.buildings || [];
        this.blockers = data.blockers || [];

        console.log(`[ExplorationMission] Stored ${this.npcs.length} NPCs, ${this.items.length} items in mission`);

        // 世界設定
        this.worldConfig = data.worldConfig || {
            width: 3000,
            isInfinite: true,
            backgroundTheme: 'city',
            groundY: 500
        };

        // 進度追蹤
        this.collectedItems = [];
        this.talkedNPCs = [];
        this.resolvedBlockers = [];
        this.completedSubTasks = [];

        // 狀態
        this.status = 'pending';  // pending, active, completed, failed
        this.completionRate = 0;

        // 統計
        this.stats = {
            itemsCollected: 0,
            npcsInteracted: 0,
            blockersResolved: 0,
            partnersUsed: [],
            abilitiesUsed: 0,
            distanceTraveled: 0
        };

        // ===== AI Context Tracking (Stage 2) =====
        this.aiContext = {
            conversationHistory: [],    // All NPC dialogue
            playerChoices: [],          // Player choice records
            worldEvents: [],            // World events
            lastAIEvaluation: null,     // Last AI evaluation
            dynamicBranches: []         // AI-added branches
        };

        // Alternative completion tracking
        this.alternativeCompletions = new Map();

        // RAG session ID (managed by AIMissionOrchestrator)
        this.ragSessionId = null;
    }

    /**
     * 開始任務
     */
    start() {
        if (this.status !== 'pending') return false;

        this.status = 'active';
        this.startTime = Date.now();

        eventBus.emit('MISSION_STARTED', { mission: this });

        return true;
    }

    /**
     * 更新任務
     * @param {number} dt - 時間差（秒）
     */
    update(dt) {
        if (this.status !== 'active') return;

        // 更新時間
        this.elapsedTime = Date.now() - this.startTime;

        // 檢查時間限制
        if (this.timeLimit && this.elapsedTime >= this.timeLimit) {
            this.fail('時間到！');
            return;
        }

        // 更新完成率
        this.updateCompletionRate();
    }

    /**
     * 更新完成率
     */
    updateCompletionRate() {
        if (this.subTasks.length === 0) {
            this.completionRate = 0;
            return;
        }

        const completed = this.subTasks.filter(t => t.status === 'completed').length;
        this.completionRate = completed / this.subTasks.length;
    }

    /**
     * 取得當前子任務
     * @returns {SubTask|null}
     */
    getCurrentTask() {
        // 找到第一個未完成的任務
        return this.subTasks.find(t => t.status !== 'completed') || null;
    }

    /**
     * 取得所有活動中的子任務
     * @returns {Array<SubTask>}
     */
    getActiveTasks() {
        return this.subTasks.filter(t => t.status === 'active' || t.status === 'pending');
    }

    /**
     * 記錄物品收集
     * @param {string} itemId - 物品 ID
     */
    recordItemCollected(itemId) {
        if (!this.collectedItems.includes(itemId)) {
            this.collectedItems.push(itemId);
            this.stats.itemsCollected++;

            // 檢查相關子任務
            this.checkFetchTasks(itemId);

            eventBus.emit('MISSION_PROGRESS', {
                mission: this,
                type: 'item_collected',
                itemId: itemId
            });
        }
    }

    /**
     * 記錄 NPC 對話
     * @param {string} npcId - NPC ID
     */
    recordNPCTalked(npcId) {
        if (!this.talkedNPCs.includes(npcId)) {
            this.talkedNPCs.push(npcId);
            this.stats.npcsInteracted++;

            // 檢查相關子任務
            this.checkTalkTasks(npcId);

            eventBus.emit('MISSION_PROGRESS', {
                mission: this,
                type: 'npc_talked',
                npcId: npcId
            });
        }
    }

    /**
     * 記錄物品交付
     * @param {string} npcId - NPC ID
     * @param {string} itemId - 物品 ID
     */
    recordItemDelivered(npcId, itemId) {
        // 檢查交付任務
        this.checkDeliveryTasks(npcId, itemId);

        eventBus.emit('MISSION_PROGRESS', {
            mission: this,
            type: 'item_delivered',
            npcId: npcId,
            itemId: itemId
        });
    }

    /**
     * 記錄障礙解決
     * @param {string} blockerId - 障礙 ID
     */
    recordBlockerResolved(blockerId) {
        if (!this.resolvedBlockers.includes(blockerId)) {
            this.resolvedBlockers.push(blockerId);
            this.stats.blockersResolved++;

            // 檢查相關子任務
            this.checkAbilityTasks(blockerId);

            eventBus.emit('MISSION_PROGRESS', {
                mission: this,
                type: 'blocker_resolved',
                blockerId: blockerId
            });
        }
    }

    /**
     * 記錄使用的夥伴
     * @param {string} characterId - 角色 ID
     */
    recordPartnerUsed(characterId) {
        if (!this.stats.partnersUsed.includes(characterId)) {
            this.stats.partnersUsed.push(characterId);
        }
    }

    /**
     * 記錄能力使用
     */
    recordAbilityUsed() {
        this.stats.abilitiesUsed++;
    }

    /**
     * 檢查收集任務
     */
    checkFetchTasks(itemId) {
        for (const task of this.subTasks) {
            if (task.type === 'fetch' && task.status !== 'completed') {
                if (task.targetItems?.includes(itemId)) {
                    task.recordProgress(itemId);
                }
            }
        }
    }

    /**
     * 檢查對話任務
     */
    checkTalkTasks(npcId) {
        for (const task of this.subTasks) {
            if (task.type === 'talk' && task.status !== 'completed') {
                if (task.targetNPC === npcId) {
                    task.complete();
                }
            }
        }
    }

    /**
     * 檢查交付任務
     */
    checkDeliveryTasks(npcId, itemId) {
        for (const task of this.subTasks) {
            if (task.type === 'fetch' && task.status !== 'completed') {
                if (task.deliverTo === npcId && task.targetItems?.includes(itemId)) {
                    task.recordDelivery(itemId);
                }
            }
        }
    }

    /**
     * 檢查能力任務
     */
    checkAbilityTasks(blockerId) {
        for (const task of this.subTasks) {
            if (task.type === 'ability' && task.status !== 'completed') {
                if (task.targetBlocker === blockerId) {
                    task.complete();
                }
            }
        }
    }

    /**
     * 完成子任務
     * @param {string} taskId - 子任務 ID
     */
    completeSubTask(taskId) {
        const task = this.subTasks.find(t => t.id === taskId);
        if (task && task.status !== 'completed') {
            task.complete();
            this.completedSubTasks.push(taskId);

            eventBus.emit('SUBTASK_COMPLETED', {
                mission: this,
                task: task
            });

            // 檢查是否全部完成
            this.checkCompletion();
        }
    }

    /**
     * 檢查任務是否完成 (AI-driven evaluation)
     */
    async checkCompletion() {
        // Import aiService dynamically to avoid circular deps
        const { aiService } = await import('../core/ai-service.js');

        try {
            // AI evaluates mission completion (supports partial/alternative completion)
            const evaluation = await aiService.evaluateMissionCompletion({
                mission_id: this.id,
                completed_tasks: this.completedSubTasks,
                alternative_completions: Array.from(this.alternativeCompletions.entries()),
                player_progress: this.stats
            });

            if (evaluation.is_complete) {
                this.complete({
                    completion_type: evaluation.type,
                    reward_modifier: evaluation.reward_modifier,
                    ai_summary: evaluation.summary
                });
            } else if (evaluation.can_continue && evaluation.suggested_tasks) {
                // AI suggests new tasks to continue
                await this.addDynamicTasks(evaluation.suggested_tasks);
            }
        } catch (e) {
            console.warn('[ExplorationMission] AI completion check failed, using fallback', e);
            // Fallback: old logic
            const allCompleted = this.subTasks.every(t => t.status === 'completed');
            if (allCompleted) {
                this.complete();
            }
        }
    }

    /**
     * 完成任務 (supports alternative completion)
     * @param {Object} completionData - Completion metadata
     */
    complete(completionData = {}) {
        if (this.status === 'completed') return;

        this.status = 'completed';
        this.completionRate = 1;

        // Store completion type and modifier
        this.completionType = completionData.completion_type || 'full';
        this.rewardModifier = completionData.reward_modifier || 1.0;
        this.aiSummary = completionData.ai_summary || null;

        eventBus.emit('MISSION_COMPLETED', {
            mission: this,
            rewards: this.calculateRewards(),
            stats: this.stats,
            completionType: this.completionType,
            aiSummary: this.aiSummary
        });
    }

    /**
     * 任務失敗
     * @param {string} reason - 失敗原因
     */
    fail(reason = '') {
        if (this.status === 'failed') return;

        this.status = 'failed';

        eventBus.emit('MISSION_FAILED', {
            mission: this,
            reason: reason
        });
    }

    /**
     * 計算獎勵 (with AI reward modifier)
     * @returns {Object}
     */
    calculateRewards() {
        const baseRewards = { ...this.rewards };

        // 根據完成速度加成
        if (this.timeLimit) {
            const timeRatio = 1 - (this.elapsedTime / this.timeLimit);
            if (timeRatio > 0.5) {
                baseRewards.money = Math.floor(baseRewards.money * 1.2);
                baseRewards.exp = Math.floor(baseRewards.exp * 1.2);
            }
        }

        // 根據使用的夥伴數量
        if (this.stats.partnersUsed.length >= 3) {
            baseRewards.exp = Math.floor(baseRewards.exp * 1.1);
        }

        // Apply AI reward modifier (alternative completion may have lower rewards)
        if (this.rewardModifier) {
            baseRewards.money = Math.floor(baseRewards.money * this.rewardModifier);
            baseRewards.exp = Math.floor(baseRewards.exp * this.rewardModifier);
        }

        return baseRewards;
    }

    /**
     * Add dynamically generated tasks to mission (AI-driven)
     * @param {Array} aiTasks - Tasks generated by AI
     */
    async addDynamicTasks(aiTasks) {
        if (!aiTasks || aiTasks.length === 0) return;

        for (const taskData of aiTasks) {
            const task = new SubTask({
                ...taskData,
                isDynamic: true,
                aiGenerated: true,
                optional: true  // Dynamic tasks are usually optional
            });
            this.subTasks.push(task);
            this.aiContext.dynamicBranches.push(task.id);
        }

        eventBus.emit('DYNAMIC_TASKS_ADDED', {
            mission: this,
            newTasks: aiTasks
        });

        console.log(`[ExplorationMission] Added ${aiTasks.length} dynamic tasks`);
    }

    /**
     * Get current active task
     * @returns {SubTask|null}
     */
    getCurrentTask() {
        if (this.currentTaskIndex >= this.subTasks.length) return null;
        return this.subTasks[this.currentTaskIndex];
    }

    /**
     * Record alternative completion method
     * @param {string} method - Completion method description
     * @param {any} data - Associated data
     */
    recordAlternativeCompletion(method, data) {
        this.alternativeCompletions.set(method, {
            timestamp: Date.now(),
            data
        });
        console.log(`[ExplorationMission] Alternative completion recorded: ${method}`);
    }

    /**
     * 取得剩餘時間
     * @returns {number|null} 毫秒
     */
    getRemainingTime() {
        if (!this.timeLimit) return null;
        return Math.max(0, this.timeLimit - this.elapsedTime);
    }

    /**
     * 取得格式化的剩餘時間
     * @returns {string}
     */
    getFormattedRemainingTime() {
        const remaining = this.getRemainingTime();
        if (remaining === null) return '';

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * 序列化 (includes AI context)
     * @returns {Object}
     */
    serialize() {
        return {
            id: this.id,
            status: this.status,
            startTime: this.startTime,
            elapsedTime: this.elapsedTime,
            collectedItems: this.collectedItems,
            talkedNPCs: this.talkedNPCs,
            resolvedBlockers: this.resolvedBlockers,
            completedSubTasks: this.completedSubTasks,
            subTasks: this.subTasks.map(t => t.serialize()),
            stats: this.stats,
            // AI context
            aiContext: this.aiContext,
            alternativeCompletions: Array.from(this.alternativeCompletions.entries()),
            completionType: this.completionType,
            rewardModifier: this.rewardModifier
        };
    }

    /**
     * 反序列化
     * @param {Object} data
     */
    deserialize(data) {
        this.status = data.status;
        this.startTime = data.startTime;
        this.elapsedTime = data.elapsedTime;
        this.collectedItems = data.collectedItems || [];
        this.talkedNPCs = data.talkedNPCs || [];
        this.resolvedBlockers = data.resolvedBlockers || [];
        this.completedSubTasks = data.completedSubTasks || [];
        this.stats = data.stats || this.stats;

        // 還原子任務狀態
        if (data.subTasks) {
            data.subTasks.forEach((taskData, index) => {
                if (this.subTasks[index]) {
                    this.subTasks[index].deserialize(taskData);
                }
            });
        }

        this.updateCompletionRate();
    }
}

/**
 * SubTask - 子任務
 */
export class SubTask {
    constructor(data = {}) {
        this.id = data.id || `subtask_${Date.now()}`;
        this.title = data.title || '子任務';
        this.description = data.description || '';

        // 類型
        this.type = data.type || 'talk';  // talk, fetch, ability, escort, explore

        // 目標
        this.targetNPC = data.targetNPC || null;
        this.targetItems = data.targetItems || [];
        this.targetBlocker = data.targetBlocker || null;
        this.targetLocation = data.targetLocation || null;
        this.deliverTo = data.deliverTo || null;

        // 數量需求
        this.requiredCount = data.requiredCount || 1;
        this.currentCount = 0;

        // 狀態
        this.status = data.status || 'pending';  // pending, active, completed

        // 進度追蹤
        this.collectedItems = [];
        this.deliveredItems = [];

        // 順序
        this.order = data.order ?? 0;
        this.prerequisite = data.prerequisite || null;  // 前置任務 ID

        // 提示
        this.hint = data.hint || '';

        // 標記
        this.markerPosition = data.markerPosition || null;
    }

    /**
     * 啟用任務
     */
    activate() {
        if (this.status === 'pending') {
            this.status = 'active';
        }
    }

    /**
     * 記錄進度
     * @param {string} itemId - 物品 ID
     */
    recordProgress(itemId) {
        if (!this.collectedItems.includes(itemId)) {
            this.collectedItems.push(itemId);
            this.currentCount = this.collectedItems.length;

            // 如果不需要交付，收集完即完成
            if (!this.deliverTo && this.currentCount >= this.requiredCount) {
                this.complete();
            }
        }
    }

    /**
     * 記錄交付
     * @param {string} itemId - 物品 ID
     */
    recordDelivery(itemId) {
        if (this.collectedItems.includes(itemId) && !this.deliveredItems.includes(itemId)) {
            this.deliveredItems.push(itemId);

            if (this.deliveredItems.length >= this.requiredCount) {
                this.complete();
            }
        }
    }

    /**
     * 完成任務
     */
    complete() {
        this.status = 'completed';
        this.currentCount = this.requiredCount;
    }

    /**
     * 取得進度比例
     * @returns {number} 0-1
     */
    getProgress() {
        if (this.deliverTo) {
            return this.deliveredItems.length / this.requiredCount;
        }
        return this.currentCount / this.requiredCount;
    }

    /**
     * 取得進度文字
     * @returns {string}
     */
    getProgressText() {
        if (this.type === 'talk') {
            return this.status === 'completed' ? '完成' : '進行中';
        }

        if (this.deliverTo) {
            return `${this.deliveredItems.length}/${this.requiredCount}`;
        }

        return `${this.currentCount}/${this.requiredCount}`;
    }

    /**
     * 序列化
     */
    serialize() {
        return {
            id: this.id,
            status: this.status,
            currentCount: this.currentCount,
            collectedItems: this.collectedItems,
            deliveredItems: this.deliveredItems
        };
    }

    /**
     * 反序列化
     */
    deserialize(data) {
        this.status = data.status;
        this.currentCount = data.currentCount;
        this.collectedItems = data.collectedItems || [];
        this.deliveredItems = data.deliveredItems || [];
    }
}

/**
 * 任務類型定義
 */
export const MISSION_TYPES = {
    exploration: {
        name: '探索',
        description: '探索目的地，與當地人互動'
    },
    delivery: {
        name: '配送',
        description: '將包裹送達指定地點'
    },
    rescue: {
        name: '救援',
        description: '幫助有困難的人'
    },
    collection: {
        name: '收集',
        description: '收集指定的物品'
    }
};

/**
 * 子任務類型定義
 */
export const SUBTASK_TYPES = {
    talk: {
        name: '對話',
        icon: '💬',
        description: '與指定 NPC 對話'
    },
    fetch: {
        name: '收集',
        icon: '📦',
        description: '收集指定物品'
    },
    ability: {
        name: '能力',
        icon: '⚡',
        description: '使用特定能力解決問題'
    },
    escort: {
        name: '護送',
        icon: '🚶',
        description: '護送 NPC 到目的地'
    },
    explore: {
        name: '探索',
        icon: '🔍',
        description: '到達指定位置'
    }
};
