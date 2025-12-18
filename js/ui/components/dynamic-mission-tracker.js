/**
 * DynamicMissionTracker - AI 驅動的動態任務追蹤器
 *
 * 功能：
 * - 顯示當前任務目標和替代路徑
 * - 標記 AI 生成的動態任務
 * - 顯示 AI 提供的實時提示
 * - 支援替代完成方式
 */

import { eventBus } from '../../core/event-bus.js';

export class DynamicMissionTracker {
    constructor(container, options = {}) {
        this.container = container;

        // 配置
        this.showAlternatives = options.showAlternatives ?? true;
        this.showAIHints = options.showAIHints ?? true;
        this.highlightDynamic = options.highlightDynamic ?? true;

        // 當前任務
        this.mission = null;

        // AI 狀態
        this.aiHints = [];
        this.aiGeneratedTasks = new Set();
        this.alternativePaths = [];

        // DOM 參考
        this.trackerElement = null;
        this.mainTasksList = null;
        this.alternativesList = null;
        this.hintsContainer = null;

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        this.trackerElement = document.createElement('div');
        this.trackerElement.className = 'dynamic-mission-tracker';

        this.trackerElement.innerHTML = `
            <div class="tracker-header">
                <div class="header-left">
                    <span class="tracker-icon">🎯</span>
                    <span class="tracker-title">Mission Objectives</span>
                </div>
                <div class="header-right">
                    <span class="ai-badge">🤖 AI-Powered</span>
                    <button class="tracker-minimize" title="Minimize">−</button>
                </div>
            </div>

            <div class="tracker-body">
                <!-- Mission Info -->
                <div class="mission-info">
                    <h3 class="mission-title">No active mission</h3>
                    <div class="mission-progress">
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill"></div>
                        </div>
                        <span class="progress-text">0%</span>
                    </div>
                </div>

                <!-- Main Tasks -->
                <div class="main-tasks-section">
                    <h4 class="section-title">Primary Objectives</h4>
                    <ul class="main-tasks-list"></ul>
                </div>

                <!-- Alternative Paths -->
                <div class="alternatives-section hidden">
                    <h4 class="section-title">
                        <span>Alternative Approaches</span>
                        <span class="alternatives-badge">💡 Optional</span>
                    </h4>
                    <ul class="alternatives-list"></ul>
                </div>

                <!-- AI Hints -->
                <div class="hints-section hidden">
                    <h4 class="section-title">
                        <span>AI Hints</span>
                        <span class="hint-urgency">ℹ️</span>
                    </h4>
                    <div class="hints-container"></div>
                </div>
            </div>
        `;

        this.container.appendChild(this.trackerElement);

        // 獲取 DOM 元素參考
        this.titleElement = this.trackerElement.querySelector('.mission-title');
        this.progressBar = this.trackerElement.querySelector('.progress-bar-fill');
        this.progressText = this.trackerElement.querySelector('.progress-text');
        this.mainTasksList = this.trackerElement.querySelector('.main-tasks-list');
        this.alternativesSection = this.trackerElement.querySelector('.alternatives-section');
        this.alternativesList = this.trackerElement.querySelector('.alternatives-list');
        this.hintsSection = this.trackerElement.querySelector('.hints-section');
        this.hintsContainer = this.trackerElement.querySelector('.hints-container');
        this.hintUrgency = this.trackerElement.querySelector('.hint-urgency');
        this.minimizeButton = this.trackerElement.querySelector('.tracker-minimize');

        // 按鈕事件
        this.minimizeButton.addEventListener('click', () => this.toggleMinimize());
    }

    /**
     * 設定事件監聽器
     */
    setupEventListeners() {
        // 任務啟動
        eventBus.on('MISSION_STARTED', (data) => {
            this.setMission(data.mission);
        });

        // 任務更新
        eventBus.on('MISSION_UPDATED', (data) => {
            this.updateMission(data.mission);
        });

        // 動態任務添加（AI 生成）
        eventBus.on('DYNAMIC_TASKS_ADDED', (data) => {
            this.addDynamicTasks(data.tasks);
        });

        // 替代路徑解鎖
        eventBus.on('ALTERNATIVE_PATH_UNLOCKED', (data) => {
            this.addAlternativePath(data.alternative);
        });

        // AI 提示
        eventBus.on('MISSION_HINT', (data) => {
            this.addHint(data.hint, data.urgency || 'low');
        });

        // 任務完成/失敗
        eventBus.on('MISSION_COMPLETED', () => this.clearMission());
        eventBus.on('MISSION_FAILED', () => this.clearMission());
    }

    /**
     * 設定當前任務
     */
    setMission(mission) {
        this.mission = mission;
        this.aiGeneratedTasks.clear();
        this.alternativePaths = [];
        this.aiHints = [];

        this.titleElement.textContent = mission.title || 'Mission';
        this.updateTasks();
        this.updateProgress();

        this.trackerElement.classList.remove('hidden');
    }

    /**
     * 更新任務
     */
    updateMission(mission) {
        this.mission = mission;
        this.updateTasks();
        this.updateProgress();
    }

    /**
     * 更新任務列表
     */
    updateTasks() {
        if (!this.mission) return;

        this.mainTasksList.innerHTML = '';

        const tasks = this.mission.subTasks || [];

        tasks.forEach(task => {
            const taskElement = this.createTaskElement(task);
            this.mainTasksList.appendChild(taskElement);
        });
    }

    /**
     * 創建任務元素
     */
    createTaskElement(task) {
        const li = document.createElement('li');
        li.className = 'task-item';

        if (task.completed) {
            li.classList.add('completed');
        }

        // AI 生成的任務特殊標記
        const isAIGenerated = task.isDynamic || task.aiGenerated || this.aiGeneratedTasks.has(task.id);
        if (isAIGenerated && this.highlightDynamic) {
            li.classList.add('ai-generated');
        }

        li.innerHTML = `
            <span class="task-checkbox">${task.completed ? '✅' : '⬜'}</span>
            <span class="task-text">${task.title || task.description}</span>
            ${isAIGenerated ? '<span class="ai-tag">🤖 AI</span>' : ''}
            ${task.optional ? '<span class="optional-tag">Optional</span>' : ''}
        `;

        return li;
    }

    /**
     * 添加 AI 動態生成的任務
     */
    addDynamicTasks(tasks) {
        if (!tasks || tasks.length === 0) return;

        tasks.forEach(task => {
            if (task.id) {
                this.aiGeneratedTasks.add(task.id);
            }
        });

        this.updateTasks();

        // 顯示動畫效果
        this.flashNewTasks();
    }

    /**
     * 添加替代路徑
     */
    addAlternativePath(alternative) {
        this.alternativePaths.push(alternative);

        this.alternativesSection.classList.remove('hidden');

        const altElement = document.createElement('li');
        altElement.className = 'alternative-item';
        altElement.innerHTML = `
            <span class="alt-icon">🌟</span>
            <div class="alt-content">
                <strong>${alternative.title || 'Alternative method'}</strong>
                <p>${alternative.description || ''}</p>
            </div>
        `;

        this.alternativesList.appendChild(altElement);

        // 閃爍效果
        altElement.classList.add('highlight-new');
        setTimeout(() => altElement.classList.remove('highlight-new'), 2000);
    }

    /**
     * 添加 AI 提示
     */
    addHint(hint, urgency = 'low') {
        if (!hint) return;

        this.aiHints.push({ text: hint, urgency, timestamp: Date.now() });

        // 只保留最新 3 條提示
        if (this.aiHints.length > 3) {
            this.aiHints.shift();
        }

        this.hintsSection.classList.remove('hidden');
        this.updateHints();
    }

    /**
     * 更新提示顯示
     */
    updateHints() {
        this.hintsContainer.innerHTML = '';

        // 獲取最高優先級
        const maxUrgency = this.aiHints.reduce((max, h) => {
            const urgencies = { low: 1, medium: 2, high: 3 };
            return Math.max(max, urgencies[h.urgency] || 1);
        }, 1);

        // 更新緊急度圖標
        const urgencyIcons = { 1: 'ℹ️', 2: '⚠️', 3: '🚨' };
        this.hintUrgency.textContent = urgencyIcons[maxUrgency];

        // 顯示提示
        this.aiHints.forEach(hintData => {
            const hintElement = document.createElement('div');
            hintElement.className = `hint-item hint-${hintData.urgency}`;
            hintElement.innerHTML = `
                <span class="hint-icon">💡</span>
                <span class="hint-text">${hintData.text}</span>
            `;
            this.hintsContainer.appendChild(hintElement);
        });
    }

    /**
     * 更新進度
     */
    updateProgress() {
        if (!this.mission) return;

        const progress = this.mission.completionRate || 0;
        this.progressBar.style.width = `${progress}%`;
        this.progressText.textContent = `${Math.round(progress)}%`;

        // 根據進度改變顏色
        if (progress >= 75) {
            this.progressBar.style.backgroundColor = '#4caf50';
        } else if (progress >= 50) {
            this.progressBar.style.backgroundColor = '#ff9800';
        } else {
            this.progressBar.style.backgroundColor = '#2196f3';
        }
    }

    /**
     * 閃爍新任務
     */
    flashNewTasks() {
        const tasks = this.mainTasksList.querySelectorAll('.task-item.ai-generated');
        tasks.forEach(task => {
            task.classList.add('highlight-new');
            setTimeout(() => task.classList.remove('highlight-new'), 2000);
        });
    }

    /**
     * 切換最小化
     */
    toggleMinimize() {
        const body = this.trackerElement.querySelector('.tracker-body');
        body.classList.toggle('hidden');
        this.minimizeButton.textContent = body.classList.contains('hidden') ? '+' : '−';
    }

    /**
     * 清除任務
     */
    clearMission() {
        this.mission = null;
        this.aiGeneratedTasks.clear();
        this.alternativePaths = [];
        this.aiHints = [];

        this.mainTasksList.innerHTML = '';
        this.alternativesList.innerHTML = '';
        this.hintsContainer.innerHTML = '';

        this.alternativesSection.classList.add('hidden');
        this.hintsSection.classList.add('hidden');

        this.titleElement.textContent = 'No active mission';
        this.progressBar.style.width = '0%';
        this.progressText.textContent = '0%';
    }

    /**
     * 銷毀
     */
    destroy() {
        eventBus.off('MISSION_STARTED');
        eventBus.off('MISSION_UPDATED');
        eventBus.off('DYNAMIC_TASKS_ADDED');
        eventBus.off('ALTERNATIVE_PATH_UNLOCKED');
        eventBus.off('MISSION_HINT');
        eventBus.off('MISSION_COMPLETED');
        eventBus.off('MISSION_FAILED');

        if (this.trackerElement) {
            this.trackerElement.remove();
        }
    }
}
