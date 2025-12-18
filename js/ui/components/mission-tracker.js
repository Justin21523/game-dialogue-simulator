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
        this.progressBar = this.trackerElement.querySelector('.progress-bar-fill');
        this.progressText = this.trackerElement.querySelector('.progress-text');
        this.taskList = this.trackerElement.querySelector('.task-list');
        this.timerDisplay = this.trackerElement.querySelector('.timer-display');
        this.timerValue = this.trackerElement.querySelector('.timer-value');
        this.tasksCompletedText = this.trackerElement.querySelector('.tasks-completed');
        this.toggleButton = this.trackerElement.querySelector('.tracker-toggle');
        this.showAllButton = this.trackerElement.querySelector('.show-all-btn');

        // 設定按鈕事件
        this.toggleButton.addEventListener('click', () => this.toggle());
        this.showAllButton.addEventListener('click', () => this.showAllTasks());
    }

    /**
     * 設定事件監聯
     */
    setupEventListeners() {
        eventBus.on('MISSION_STARTED', (data) => this.setMission(data.mission));
        eventBus.on('MISSION_PROGRESS', () => this.refresh());
        eventBus.on('SUBTASK_COMPLETED', (data) => this.onSubTaskCompleted(data));
        eventBus.on('MISSION_COMPLETED', () => this.onMissionCompleted());
        eventBus.on('MISSION_FAILED', (data) => this.onMissionFailed(data));
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
    }
}
