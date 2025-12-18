/**
 * MissionTracker - 任務追蹤 UI 元件
 * 顯示當前任務進度、子任務列表、剩餘時間
 */

import { eventBus } from '../../core/event-bus.js';
import { SUBTASK_TYPES } from '../../models/exploration-mission.js';

export class MissionTracker {
    constructor(container, options = {}) {
        this.container = container;

        // 配置
        this.showTimer = options.showTimer ?? true;
        this.showHints = options.showHints ?? true;
        this.maxVisibleTasks = options.maxVisibleTasks ?? 5;
        this.collapsible = options.collapsible ?? true;

        // 當前任務
        this.mission = null;
        this.quest = null;  // Checkpoint 4: Quest support

        // 狀態
        this.isCollapsed = false;
        this.isMinimized = false;

        // DOM 參考
        this.trackerElement = null;
        this.taskList = null;
        this.timerElement = null;
        this.progressBar = null;

        // 更新間隔
        this.updateInterval = null;

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        this.trackerElement = document.createElement('div');
        this.trackerElement.className = 'mission-tracker';

        this.trackerElement.innerHTML = `
            <div class="tracker-header">
                <div class="header-left">
                    <span class="tracker-icon">📋</span>
                    <span class="tracker-title">任務目標</span>
                    <span class="tracker-trace hidden"></span>
                </div>
                <div class="header-right">
                    <div class="timer-display hidden">
                        <span class="timer-icon">⏱️</span>
                        <span class="timer-value">--:--</span>
                    </div>
                    <button class="tracker-toggle" title="收起/展開">▼</button>
                </div>
            </div>
            <div class="tracker-body">
                <div class="mission-info">
                    <h3 class="mission-title"></h3>
                    <p class="mission-description"></p>
                </div>
                <div class="progress-section">
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill"></div>
                    </div>
                    <span class="progress-text">0%</span>
                </div>
                <div class="task-list"></div>
                <div class="tracker-footer">
                    <span class="tasks-completed">0/0 完成</span>
                    <button class="show-all-btn hidden">顯示全部</button>
                </div>
            </div>
        `;

        this.container.appendChild(this.trackerElement);

        // 取得參考
        this.headerElement = this.trackerElement.querySelector('.tracker-header');
        this.bodyElement = this.trackerElement.querySelector('.tracker-body');
        this.titleElement = this.trackerElement.querySelector('.mission-title');
        this.descriptionElement = this.trackerElement.querySelector('.mission-description');
        this.traceElement = this.trackerElement.querySelector('.tracker-trace');
        this.progressBar = this.trackerElement.querySelector('.progress-bar-fill');
        this.progressText = this.trackerElement.querySelector('.progress-text');
        this.taskList = this.trackerElement.querySelector('.task-list');
        this.timerDisplay = this.trackerElement.querySelector('.timer-display');
        this.timerValue = this.trackerElement.querySelector('.timer-value');
        this.tasksCompletedText = this.trackerElement.querySelector('.tasks-completed');
        this.toggleButton = this.trackerElement.querySelector('.tracker-toggle');
        this.showAllButton = this.trackerElement.querySelector('.show-all-btn');
        this.traceElement = this.trackerElement.querySelector('.tracker-trace');
        this.logContainer = document.createElement('div');
        this.logContainer.className = 'tracker-log';
        this.logContainer.style.marginTop = '8px';
        this.logContainer.style.fontSize = '12px';
        this.logContainer.style.maxHeight = '120px';
        this.logContainer.style.overflowY = 'auto';
        this.logContainer.innerHTML = '<div class="tracker-log-title">狀態流</div><div class="tracker-log-rows"></div>';
        this.trackerElement.appendChild(this.logContainer);
        this.retryBtn = document.createElement('button');
        this.retryBtn.className = 'tracker-retry-btn';
        this.retryBtn.textContent = '🔄 重試 AI';
        this.retryBtn.style.marginTop = '6px';
        this.trackerElement.appendChild(this.retryBtn);

        // 設定按鈕事件
        this.toggleButton.addEventListener('click', () => this.toggle());
        this.showAllButton.addEventListener('click', () => this.showAllTasks());
        this.retryBtn.addEventListener('click', () => this.retryAI());
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        eventBus.on('MISSION_STARTED', (data) => this.setMission(data.mission));
        eventBus.on('MISSION_PROGRESS', () => this.refresh());
        eventBus.on('SUBTASK_COMPLETED', (data) => this.onSubTaskCompleted(data));
        eventBus.on('MISSION_COMPLETED', () => this.onMissionCompleted());
        eventBus.on('MISSION_FAILED', (data) => this.onMissionFailed(data));

        // ===== Checkpoint 4: Quest 進度更新 =====
        eventBus.on('QUEST_ACCEPTED', (data) => this.setQuest(data.quest));
        eventBus.on('QUEST_PROGRESS_UPDATED', () => this.refreshQuest());
        eventBus.on('QUEST_COMPLETED', () => this.onQuestCompleted());
        eventBus.on('MISSION_STATE_LOG', () => this.refreshLogs());
        eventBus.on('AI_OFFLINE_MODE', () => this.showDegradedBadge());

        // ===== Checkpoint 5: 動態 Objective 添加 =====
        eventBus.on('QUEST_OBJECTIVE_ADDED', (data) => this.onObjectiveAdded(data));
        eventBus.on('QUEST_HINT_PROVIDED', (data) => this.onHintProvided(data));
    }

    /**
     * 設定任務
     * @param {ExplorationMission} mission - 任務實例
     */
    setMission(mission) {
        this.mission = mission;

        // 更新基本資訊
        this.titleElement.textContent = mission.title;
        this.descriptionElement.textContent = mission.description;

        // 顯示計時器
        if (this.showTimer && mission.timeLimit) {
            this.timerDisplay.classList.remove('hidden');
            this.startTimer();
        } else {
            this.timerDisplay.classList.add('hidden');
        }

        // 渲染子任務
        this.renderTasks();

        // 開始更新
        this.startUpdate();

        // 顯示追蹤器
        this.trackerElement.classList.remove('hidden');
    }

    /**
     * 渲染子任務列表
     */
    renderTasks() {
        if (!this.mission) return;

        this.taskList.innerHTML = '';
        const tasks = this.mission.subTasks;
        const visibleTasks = this.isCollapsed
            ? tasks.filter(t => t.status !== 'completed').slice(0, this.maxVisibleTasks)
            : tasks.slice(0, this.maxVisibleTasks);

        visibleTasks.forEach((task, index) => {
            const taskElement = this.createTaskElement(task, index);
            this.taskList.appendChild(taskElement);
        });

        // 顯示更多按鈕
        if (tasks.length > this.maxVisibleTasks) {
            this.showAllButton.classList.remove('hidden');
            this.showAllButton.textContent = `顯示全部 (${tasks.length})`;
        } else {
            this.showAllButton.classList.add('hidden');
        }

        // 更新完成計數
        this.updateCompletedCount();
    }

    /**
     * 建立單一任務元素
     */
    createTaskElement(task, index) {
        const element = document.createElement('div');
        element.className = `task-item ${task.status}`;
        element.dataset.taskId = task.id;

        const typeInfo = SUBTASK_TYPES[task.type] || { icon: '📌', name: '任務' };
        const statusIcon = this.getStatusIcon(task.status);

        element.innerHTML = `
            <div class="task-checkbox">
                <span class="checkbox-icon">${statusIcon}</span>
            </div>
            <div class="task-content">
                <div class="task-header">
                    <span class="task-type-icon">${typeInfo.icon}</span>
                    <span class="task-title">${task.title}</span>
                </div>
                ${task.description ? `<p class="task-description">${task.description}</p>` : ''}
                ${task.requiredCount > 1 ? `
                    <div class="task-progress">
                        <div class="task-progress-bar">
                            <div class="task-progress-fill" style="width: ${task.getProgress() * 100}%"></div>
                        </div>
                        <span class="task-progress-text">${task.getProgressText()}</span>
                    </div>
                ` : ''}
                ${this.showHints && task.hint ? `<p class="task-hint">${task.hint}</p>` : ''}
            </div>
            <div class="task-actions">
                ${task.markerPosition ? `<button class="task-locate" title="在地圖上顯示">📍</button>` : ''}
            </div>
        `;

        // 定位按鈕事件
        const locateBtn = element.querySelector('.task-locate');
        if (locateBtn) {
            locateBtn.addEventListener('click', () => {
                eventBus.emit('LOCATE_TASK', { task: task });
            });
        }

        return element;
    }

    /**
     * 取得狀態圖示
     */
    getStatusIcon(status) {
        switch (status) {
            case 'completed': return '✅';
            case 'active': return '🔵';
            case 'pending': return '⚪';
            default: return '⚪';
        }
    }

    /**
     * 更新完成計數
     */
    updateCompletedCount() {
        if (!this.mission) return;

        const total = this.mission.subTasks.length;
        const completed = this.mission.subTasks.filter(t => t.status === 'completed').length;

        this.tasksCompletedText.textContent = `${completed}/${total} 完成`;
    }

    /**
     * 刷新顯示
     */
    refresh() {
        if (!this.mission) return;

        // 更新進度條
        const progress = this.mission.completionRate * 100;
        this.progressBar.style.width = `${progress}%`;
        this.progressText.textContent = `${Math.round(progress)}%`;

        // 更新子任務
        this.renderTasks();
    }

    /**
     * 子任務完成回調
     */
    onSubTaskCompleted(data) {
        const { task } = data;

        // 找到對應元素並添加完成動畫
        const taskElement = this.taskList.querySelector(`[data-task-id="${task.id}"]`);
        if (taskElement) {
            taskElement.classList.add('completing');
            setTimeout(() => {
                taskElement.classList.remove('completing');
                this.refresh();
            }, 500);
        }

        // 播放音效
        eventBus.emit('PLAY_SOUND', { sound: 'task_complete' });
    }

    /**
     * 任務完成回調
     */
    onMissionCompleted() {
        this.stopTimer();
        this.stopUpdate();

        // 添加完成樣式
        this.trackerElement.classList.add('mission-complete');
        this.titleElement.innerHTML = `✅ ${this.mission.title}`;

        // 顯示完成動畫
        this.showCompletionAnimation();
    }

    /**
     * 設定任務為已完成狀態（由 handleComplete 調用）
     * @param {Object} rewards - 獎勵資訊 { money, exp }
     */
    setMissionCompleted(rewards) {
        // 找到任務資訊區域，顯示完成狀態
        const missionInfo = this.trackerElement.querySelector('.mission-info');
        if (missionInfo) {
            // 在任務標題上方插入完成橫幅
            const existingBanner = missionInfo.querySelector('.mission-completed-banner');
            if (!existingBanner) {
                const completedBanner = document.createElement('div');
                completedBanner.className = 'mission-completed-banner';
                completedBanner.innerHTML = `
                    <div class="completed-icon">✅</div>
                    <div class="completed-text">任務完成！</div>
                    <div class="completed-rewards">
                        <span class="reward-item">💰 +$${rewards.money}</span>
                        <span class="reward-item">⭐ +${rewards.exp} EXP</span>
                    </div>
                `;
                missionInfo.insertBefore(completedBanner, missionInfo.firstChild);
            }
        }

        // 添加完成樣式（但不影響其他功能）
        this.trackerElement.classList.add('mission-complete');

        // 停止計時器和更新
        this.stopTimer();
        this.stopUpdate();

        console.log('[MissionTracker] Mission marked as completed with rewards:', rewards);
    }

    /**
     * 任務失敗回調
     */
    onMissionFailed(data) {
        this.stopTimer();
        this.stopUpdate();

        // 添加失敗樣式
        this.trackerElement.classList.add('mission-failed');
        this.titleElement.innerHTML = `❌ ${this.mission.title}`;

        // 顯示失敗原因
        if (data.reason) {
            this.descriptionElement.textContent = data.reason;
        }
    }

    /**
     * 顯示完成動畫
     */
    showCompletionAnimation() {
        // 添加光芒效果
        const glow = document.createElement('div');
        glow.className = 'completion-glow';
        this.trackerElement.appendChild(glow);

        setTimeout(() => {
            glow.remove();
        }, 1500);
    }

    /**
     * 開始計時器
     */
    startTimer() {
        this.stopTimer();

        this.timerInterval = setInterval(() => {
            if (!this.mission || !this.mission.timeLimit) return;

            const remaining = this.mission.getRemainingTime();
            this.timerValue.textContent = this.mission.getFormattedRemainingTime();

            // 低於 30 秒時警告
            if (remaining < 30000) {
                this.timerDisplay.classList.add('warning');
            }

            // 低於 10 秒時危險
            if (remaining < 10000) {
                this.timerDisplay.classList.remove('warning');
                this.timerDisplay.classList.add('danger');
            }
        }, 1000);
    }

    /**
     * 停止計時器
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * 開始更新
     */
    startUpdate() {
        this.stopUpdate();

        this.updateInterval = setInterval(() => {
            if (this.mission) {
                this.mission.update(0.5);  // 每 500ms 更新
            }
        }, 500);
    }

    /**
     * 停止更新
     */
    stopUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * 收起/展開
     */
    toggle() {
        this.isCollapsed = !this.isCollapsed;

        if (this.isCollapsed) {
            this.bodyElement.classList.add('collapsed');
            this.toggleButton.textContent = '▶';
        } else {
            this.bodyElement.classList.remove('collapsed');
            this.toggleButton.textContent = '▼';
        }
    }

    /**
     * 最小化/還原
     */
    minimize() {
        this.isMinimized = !this.isMinimized;

        if (this.isMinimized) {
            this.trackerElement.classList.add('minimized');
        } else {
            this.trackerElement.classList.remove('minimized');
        }
    }

    /**
     * 顯示全部任務
     */
    showAllTasks() {
        if (!this.mission) return;

        // 創建彈窗
        const popup = document.createElement('div');
        popup.className = 'tasks-popup';

        popup.innerHTML = `
            <div class="popup-overlay"></div>
            <div class="popup-content">
                <div class="popup-header">
                    <h3>所有任務</h3>
                    <button class="popup-close">✕</button>
                </div>
                <div class="popup-body">
                    <div class="all-tasks-list"></div>
                </div>
            </div>
        `;

        // 填充任務
        const tasksList = popup.querySelector('.all-tasks-list');
        this.mission.subTasks.forEach((task, index) => {
            const taskElement = this.createTaskElement(task, index);
            tasksList.appendChild(taskElement);
        });

        // 關閉事件
        const closePopup = () => {
            popup.remove();
        };

        popup.querySelector('.popup-close').addEventListener('click', closePopup);
        popup.querySelector('.popup-overlay').addEventListener('click', closePopup);

        document.body.appendChild(popup);
    }

    /**
     * 高亮特定任務
     * @param {string} taskId - 任務 ID
     */
    highlightTask(taskId) {
        const taskElement = this.taskList.querySelector(`[data-task-id="${taskId}"]`);
        if (taskElement) {
            taskElement.classList.add('highlighted');
            setTimeout(() => {
                taskElement.classList.remove('highlighted');
            }, 2000);
        }
    }

    /**
     * 設定可見性
     */
    setVisible(visible) {
        if (visible) {
            this.trackerElement.classList.remove('hidden');
        } else {
            this.trackerElement.classList.add('hidden');
        }
    }

    /**
     * 重置
     */
    reset() {
        this.mission = null;
        this.quest = null;  // Checkpoint 4
        this.stopTimer();
        this.stopUpdate();

        this.taskList.innerHTML = '';
        this.titleElement.textContent = '';
        this.descriptionElement.textContent = '';
        this.progressBar.style.width = '0%';
        this.progressText.textContent = '0%';
        this.timerValue.textContent = '--:--';

        this.trackerElement.classList.remove('mission-complete', 'mission-failed');
        this.timerDisplay.classList.remove('warning', 'danger');
        this.timerDisplay.classList.add('hidden');
    }

    // ===== Checkpoint 4: Quest 支援方法 =====

    /**
     * 設定 Quest
     * @param {Quest} quest - Quest 實例
     */
    setQuest(quest) {
        this.quest = quest;
        this.mission = null;  // 清除舊的 mission

        // 更新基本資訊
        this.titleElement.textContent = quest.title || '未命名任務';
        this.descriptionElement.textContent = quest.description || '';
        if (this.traceElement) {
            const trace = quest.aiContext?.traceId || quest.aiContext?.ragSessionId;
            if (trace) {
                this.traceElement.textContent = `trace:${String(trace).slice(0, 8)}`;
                this.traceElement.classList.remove('hidden');
            } else {
                this.traceElement.classList.add('hidden');
            }
        }

        // 隱藏計時器（Quest 通常沒有時間限制）
        this.timerDisplay.classList.add('hidden');

        // 渲染 objectives
        this.renderQuestObjectives();

        // 更新狀態流
        this.refreshLogs();

        // 顯示追蹤器
        this.trackerElement.classList.remove('hidden');

        console.log('[MissionTracker] Quest set:', quest.questId);
    }

    /**
     * 渲染 Quest objectives
     */
    renderQuestObjectives() {
        if (!this.quest) return;

        this.taskList.innerHTML = '';
        const objectives = this.quest.objectives || [];

        objectives.forEach((objective, index) => {
            const objectiveElement = this.createObjectiveElement(objective, index);
            this.taskList.appendChild(objectiveElement);
        });

        // 更新進度
        this.updateQuestProgress();
    }

    /**
     * 創建單一 Objective 元素
     */
    createObjectiveElement(objective, index) {
        const element = document.createElement('div');
        element.className = `task-item ${objective.status}`;
        if (objective.optional) element.classList.add('optional');
        if (objective.isDynamic) element.classList.add('dynamic');
        element.dataset.objectiveId = objective.id;

        const typeIcon = this.getObjectiveTypeIcon(objective.type);
        const statusIcon = this.getStatusIcon(objective.status);

        element.innerHTML = `
            <div class="task-checkbox">
                <span class="checkbox-icon">${statusIcon}</span>
            </div>
            <div class="task-content">
                <div class="task-header">
                    <span class="task-type-icon">${typeIcon}</span>
                    <span class="task-title">${objective.title || 'Untitled Objective'}</span>
                    ${objective.optional ? '<span class="optional-badge">Optional</span>' : ''}
                    ${objective.aiGenerated ? '<span class="ai-badge">🤖</span>' : ''}
                    ${objective.assignedCharacter ? `<span class="assigned-badge">Assigned: ${objective.assignedCharacter}</span>` : ''}
                </div>
                ${objective.description ? `<p class="task-description">${objective.description}</p>` : ''}
                ${objective.completedBy ? `<p class="task-completed-by">Completed by: ${objective.completedBy}</p>` : ''}
                ${objective.requiredCount > 1 ? `
                    <div class="task-progress">
                        <div class="task-progress-bar">
                            <div class="task-progress-fill" style="width: ${objective.progress * 100}%"></div>
                        </div>
                        <span class="task-progress-text">${objective.currentCount}/${objective.requiredCount}</span>
                    </div>
                ` : ''}
                ${objective.hint ? `<p class="task-hint">💡 ${objective.hint}</p>` : ''}
            </div>
        `;

        return element;
    }

    /**
     * 獲取 Objective 類型圖標
     */
    getObjectiveTypeIcon(type) {
        const icons = {
            'talk': '💬',
            'collect': '📦',
            'deliver': '📮',
            'explore': '🗺️',
            'investigate': '🔍',
            'assist': '🤝',
            'custom': '⚡'
        };
        return icons[type] || '📌';
    }

    /**
     * 更新 Quest 進度
     */
    updateQuestProgress() {
        if (!this.quest) return;

        const requiredObjectives = this.quest.objectives.filter(obj => !obj.optional);
        const completedRequired = requiredObjectives.filter(obj => obj.status === 'completed');

        const progress = requiredObjectives.length > 0
            ? completedRequired.length / requiredObjectives.length
            : 0;

        // 更新進度條
        this.progressBar.style.width = `${progress * 100}%`;
        this.progressText.textContent = `${Math.round(progress * 100)}%`;

        // 更新完成計數
        this.tasksCompletedText.textContent = `${completedRequired.length}/${requiredObjectives.length} 完成`;
    }

    /**
     * 刷新 Quest 顯示
     */
    refreshQuest() {
        if (!this.quest) return;

        // 重新渲染所有 objectives
        this.renderQuestObjectives();

        this.refreshLogs();

        console.log('[MissionTracker] Quest refreshed');
    }

    refreshLogs() {
        if (!this.logContainer || !this.quest) return;
        const rowsContainer = this.logContainer.querySelector('.tracker-log-rows');
        if (!rowsContainer) return;

        const logs = (missionManager.stateLog || [])
            .filter((l) => l.detail?.questId ? l.detail.questId === this.quest.questId : true)
            .slice(-5)
            .reverse();

        if (logs.length === 0) {
            rowsContainer.innerHTML = '<div class="log-empty">尚無紀錄</div>';
            return;
        }

        rowsContainer.innerHTML = logs.map((log) => {
            const ts = new Date(log.timestamp || Date.now());
            const hh = String(ts.getHours()).padStart(2, '0');
            const mm = String(ts.getMinutes()).padStart(2, '0');
            const label = log.type;
            let detailText = '';
            try {
                detailText = typeof log.detail === 'string' ? log.detail : JSON.stringify(log.detail || {});
            } catch (e) {
                detailText = '[unserializable]';
            }
            return `<div class="log-row"><span class="log-time">${hh}:${mm}</span><span class="log-type">${label}</span><span class="log-detail">${detailText}</span></div>`;
        }).join('');
    }

    retryAI() {
        if (!this.quest) return;
        missionManager.pushStateLog('retry_ai', { questId: this.quest.questId });
        const activeObj = this.quest.objectives.find((o) => o.status !== 'completed');
        if (activeObj) {
            missionManager.emitObjectiveUpdate(this.quest, activeObj, 'manual_retry', { actorId: this.quest.participants?.[0]?.characterId });
            eventBus.emit('SHOW_TOAST', { message: '🔄 已向 AI 重新提交任務狀態', type: 'info', duration: 2500 });
        }
    }

    showDegradedBadge() {
        if (!this.traceElement) return;
        this.traceElement.textContent = (this.traceElement.textContent || '') + ' / degraded';
        this.traceElement.classList.remove('hidden');
    }

    /**
     * Quest 完成處理
     */
    onQuestCompleted() {
        if (!this.quest) return;

        console.log('[MissionTracker] Quest completed!');

        // 添加完成樣式
        this.trackerElement.classList.add('mission-complete');

        // 更新進度為 100%
        this.progressBar.style.width = '100%';
        this.progressText.textContent = '100%';

        // 3 秒後自動隱藏
        setTimeout(() => {
            this.trackerElement.classList.add('hidden');
            this.reset();
        }, 3000);
    }

    /**
     * Checkpoint 5: 處理動態添加的 Objective
     * @param {Object} data - { questId, objective }
     */
    onObjectiveAdded(data) {
        if (!this.quest || this.quest.questId !== data.questId) return;

        console.log('[MissionTracker] 🆕 Dynamic objective added:', data.objective.title);

        // 重新渲染 objectives 列表
        this.renderQuestObjectives();

        // 顯示通知動畫（可選）
        const notification = document.createElement('div');
        notification.className = 'objective-added-notification';
        notification.innerHTML = `
            <span class="notification-icon">✨</span>
            <span class="notification-text">新目標：${data.objective.title}</span>
        `;
        notification.style.cssText = `
            position: absolute;
            top: -40px;
            left: 0;
            right: 0;
            background: rgba(52, 152, 219, 0.95);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            text-align: center;
            animation: slideDown 0.3s ease-out, fadeOut 0.3s ease-out 2.7s;
            z-index: 1000;
        `;

        this.trackerElement.style.position = 'relative';
        this.trackerElement.appendChild(notification);

        // 3 秒後移除通知
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    /**
     * Checkpoint 5: 處理 AI 提供的提示
     * @param {Object} data - { questId, hint, npcId }
     */
    onHintProvided(data) {
        if (!this.quest || this.quest.questId !== data.questId) return;

        console.log('[MissionTracker] 💡 Hint provided:', data.hint);

        // 顯示提示通知
        const notification = document.createElement('div');
        notification.className = 'hint-notification';
        notification.innerHTML = `
            <div class="hint-header">
                <span class="hint-icon">💡</span>
                <span class="hint-title">提示</span>
            </div>
            <p class="hint-text">${data.hint}</p>
        `;
        notification.style.cssText = `
            position: absolute;
            top: -80px;
            left: 0;
            right: 0;
            background: rgba(241, 196, 15, 0.95);
            color: #333;
            padding: 12px;
            border-radius: 4px;
            font-size: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            animation: slideDown 0.3s ease-out, fadeOut 0.3s ease-out 4.7s;
            z-index: 1000;
        `;

        this.trackerElement.style.position = 'relative';
        this.trackerElement.appendChild(notification);

        // 5 秒後移除通知
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    /**
     * 銷毀
     */
    dispose() {
        this.stopTimer();
        this.stopUpdate();

        if (this.trackerElement && this.trackerElement.parentNode) {
            this.trackerElement.parentNode.removeChild(this.trackerElement);
        }

        this.mission = null;
        this.quest = null;
    }
}
