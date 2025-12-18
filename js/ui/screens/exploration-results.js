/**
 * ExplorationResults - 探索結果畫面
 * 顯示任務完成/失敗的結果、獎勵、統計
 */

import { eventBus } from '../../core/event-bus.js';
import { aiService } from '../../core/ai-service.js';

export class ExplorationResults {
    constructor(container, options = {}) {
        this.container = container;

        // 配置
        this.autoClose = options.autoClose ?? false;
        this.autoCloseDelay = options.autoCloseDelay ?? 5000;

        // 狀態
        this.isOpen = false;
        this.missionData = null;
        this.animationComplete = false;

        // DOM 參考
        this.resultsScreen = null;

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        this.resultsScreen = document.createElement('div');
        this.resultsScreen.className = 'exploration-results hidden';

        this.resultsScreen.innerHTML = `
            <div class="results-overlay"></div>
            <div class="results-container">
                <div class="results-header">
                    <div class="result-status">
                        <span class="status-icon"></span>
                        <h2 class="status-text"></h2>
                    </div>
                    <h3 class="mission-title"></h3>
                </div>

                <div class="results-body">
                    <!-- 統計區 -->
                    <div class="stats-section">
                        <h4>任務統計</h4>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-icon">⏱️</span>
                                <span class="stat-label">完成時間</span>
                                <span class="stat-value" id="stat-time">--:--</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-icon">📦</span>
                                <span class="stat-label">收集物品</span>
                                <span class="stat-value" id="stat-items">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-icon">💬</span>
                                <span class="stat-label">NPC 互動</span>
                                <span class="stat-value" id="stat-npcs">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-icon">⚡</span>
                                <span class="stat-label">能力使用</span>
                                <span class="stat-value" id="stat-abilities">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-icon">✈️</span>
                                <span class="stat-label">使用夥伴</span>
                                <span class="stat-value" id="stat-partners">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-icon">🏆</span>
                                <span class="stat-label">障礙解決</span>
                                <span class="stat-value" id="stat-blockers">0</span>
                            </div>
                        </div>
                    </div>

                    <!-- 獎勵區 -->
                    <div class="rewards-section">
                        <h4>獲得獎勵</h4>
                        <div class="rewards-list">
                            <div class="reward-item money">
                                <span class="reward-icon">💰</span>
                                <span class="reward-label">金幣</span>
                                <span class="reward-value" id="reward-money">+0</span>
                            </div>
                            <div class="reward-item exp">
                                <span class="reward-icon">⭐</span>
                                <span class="reward-label">經驗值</span>
                                <span class="reward-value" id="reward-exp">+0</span>
                            </div>
                            <div class="reward-items-list" id="reward-items"></div>
                        </div>
                    </div>

                    <!-- 評價區 -->
                    <div class="rating-section">
                        <h4>任務評價</h4>
                        <div class="rating-stars">
                            <span class="star" data-index="0">☆</span>
                            <span class="star" data-index="1">☆</span>
                            <span class="star" data-index="2">☆</span>
                        </div>
                        <p class="rating-comment"></p>
                    </div>

                    <div class="ai-analysis panel muted">
                        <div class="analysis-title">AI Debrief</div>
                        <div class="analysis-body" id="ai-analysis-body">Analyzing...</div>
                    </div>
                </div>

                <div class="results-footer">
                    <button class="btn-secondary" id="btn-replay">
                        <span>🔄</span>
                        <span>重新挑戰</span>
                    </button>
                    <button class="btn-primary" id="btn-continue">
                        <span>✓</span>
                        <span>繼續</span>
                    </button>
                </div>
            </div>

            <!-- 紙片效果容器 -->
            <div class="confetti-container"></div>
        `;

        this.container.appendChild(this.resultsScreen);

        // 取得參考
        this.statusIcon = this.resultsScreen.querySelector('.status-icon');
        this.statusText = this.resultsScreen.querySelector('.status-text');
        this.missionTitle = this.resultsScreen.querySelector('.mission-title');
        this.statsGrid = this.resultsScreen.querySelector('.stats-grid');
        this.rewardsList = this.resultsScreen.querySelector('.rewards-list');
        this.ratingStars = this.resultsScreen.querySelector('.rating-stars');
        this.ratingComment = this.resultsScreen.querySelector('.rating-comment');
        this.confettiContainer = this.resultsScreen.querySelector('.confetti-container');

        // 按鈕事件
        this.resultsScreen.querySelector('#btn-replay').addEventListener('click', () => this.onReplay());
        this.resultsScreen.querySelector('#btn-continue').addEventListener('click', () => this.onContinue());
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        eventBus.on('MISSION_COMPLETED', (data) => this.showResults(data, true));
        eventBus.on('MISSION_FAILED', (data) => this.showResults(data, false));
    }

    /**
     * 顯示結果
     * @param {Object} data - 任務資料
     * @param {boolean} isSuccess - 是否成功
     */
    showResults(data, isSuccess) {
        this.missionData = data;
        this.isOpen = true;
        this.animationComplete = false;

        // 設定狀態
        this.setStatus(isSuccess);

        // 設定任務標題
        this.missionTitle.textContent = data.mission.title;

        // 設定統計
        this.setStats(data.stats, data.mission);

        // 設定獎勵
        if (isSuccess && data.rewards) {
            this.setRewards(data.rewards);
        } else {
            this.resultsScreen.querySelector('.rewards-section').classList.add('hidden');
        }

        // 設定評價
        this.setRating(data);

        // 顯示畫面
        this.resultsScreen.classList.remove('hidden');

        // 播放動畫
        this.playEntranceAnimation();

        // 成功時播放紙片效果
        if (isSuccess) {
            this.playConfetti();
        }

        // AI 分析
        this.loadAnalysis(data);

        // 自動關閉
        if (this.autoClose) {
            setTimeout(() => {
                this.close();
            }, this.autoCloseDelay);
        }
    }

    /**
     * 設定狀態
     */
    setStatus(isSuccess) {
        if (isSuccess) {
            this.statusIcon.textContent = '🎉';
            this.statusText.textContent = '任務完成！';
            this.resultsScreen.classList.add('success');
            this.resultsScreen.classList.remove('failed');
        } else {
            this.statusIcon.textContent = '😢';
            this.statusText.textContent = '任務失敗';
            this.resultsScreen.classList.add('failed');
            this.resultsScreen.classList.remove('success');
        }
    }

    /**
     * 設定統計
     */
    setStats(stats, mission) {
        // 完成時間
        const timeElement = this.resultsScreen.querySelector('#stat-time');
        timeElement.textContent = this.formatTime(mission.elapsedTime);

        // 收集物品
        const itemsElement = this.resultsScreen.querySelector('#stat-items');
        itemsElement.textContent = stats.itemsCollected || 0;

        // NPC 互動
        const npcsElement = this.resultsScreen.querySelector('#stat-npcs');
        npcsElement.textContent = stats.npcsInteracted || 0;

        // 能力使用
        const abilitiesElement = this.resultsScreen.querySelector('#stat-abilities');
        abilitiesElement.textContent = stats.abilitiesUsed || 0;

        // 使用夥伴
        const partnersElement = this.resultsScreen.querySelector('#stat-partners');
        partnersElement.textContent = stats.partnersUsed?.length || 0;

        // 障礙解決
        const blockersElement = this.resultsScreen.querySelector('#stat-blockers');
        blockersElement.textContent = stats.blockersResolved || 0;
    }

    /**
     * 設定獎勵
     */
    setRewards(rewards) {
        this.resultsScreen.querySelector('.rewards-section').classList.remove('hidden');

        // 金幣
        const moneyElement = this.resultsScreen.querySelector('#reward-money');
        moneyElement.textContent = `+${Math.floor(rewards.money || 0)}`;

        // 經驗值
        const expElement = this.resultsScreen.querySelector('#reward-exp');
        expElement.textContent = `+${rewards.exp || 0}`;

        // 物品獎勵
        const itemsList = this.resultsScreen.querySelector('#reward-items');
        itemsList.innerHTML = '';

        if (rewards.items && rewards.items.length > 0) {
            rewards.items.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'reward-item-card';
                itemElement.innerHTML = `
                    <span class="item-icon">${item.icon || '📦'}</span>
                    <span class="item-name">${item.name || item.id}</span>
                    ${item.quantity > 1 ? `<span class="item-quantity">x${item.quantity}</span>` : ''}
                `;
                itemsList.appendChild(itemElement);
            });
        }
    }

    /**
     * 設定評價
     */
    setRating(data) {
        const stars = this.calculateStars(data);
        const starElements = this.ratingStars.querySelectorAll('.star');

        starElements.forEach((star, index) => {
            if (index < stars) {
                star.textContent = '★';
                star.classList.add('filled');
            } else {
                star.textContent = '☆';
                star.classList.remove('filled');
            }
        });

        // 評語
        const comments = {
            0: '再接再厲！',
            1: '還不錯！',
            2: '做得很好！',
            3: '完美！太棒了！'
        };

        this.ratingComment.textContent = comments[stars];
    }

    /**
     * 計算星星數
     */
    calculateStars(data) {
        if (!data.mission || data.mission.status === 'failed') return 0;

        let stars = 1;  // 基本完成

        // 時間加成
        if (data.mission.timeLimit) {
            const timeRatio = data.mission.elapsedTime / data.mission.timeLimit;
            if (timeRatio < 0.5) stars++;
        } else {
            stars++;  // 無時間限制自動加一星
        }

        // 完成度加成
        if (data.mission.completionRate >= 1) {
            stars++;
        }

        return Math.min(3, stars);
    }

    /**
     * 格式化時間
     */
    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * 播放進場動畫
     */
    playEntranceAnimation() {
        const container = this.resultsScreen.querySelector('.results-container');
        container.classList.add('entering');

        setTimeout(() => {
            container.classList.remove('entering');
            this.animationComplete = true;

            // 數字動畫
            this.animateNumbers();
        }, 500);
    }

    /**
     * 數字遞增動畫
     */
    animateNumbers() {
        const elements = [
            { el: this.resultsScreen.querySelector('#reward-money'), prefix: '+' },
            { el: this.resultsScreen.querySelector('#reward-exp'), prefix: '+' }
        ];

        elements.forEach(({ el, prefix }) => {
            const targetValue = parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0;
            if (targetValue === 0) return;

            let currentValue = 0;
            const duration = 1000;
            const startTime = performance.now();

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease out
                const easeProgress = 1 - Math.pow(1 - progress, 3);
                currentValue = Math.floor(targetValue * easeProgress);

                el.textContent = `${prefix}${currentValue}`;

                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };

            requestAnimationFrame(animate);
        });
    }

    /**
     * 播放紙片效果
     */
    playConfetti() {
        this.confettiContainer.innerHTML = '';

        const colors = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#9B59B6'];
        const confettiCount = 50;

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = `${Math.random() * 100}%`;
            confetti.style.animationDelay = `${Math.random() * 2}s`;
            confetti.style.animationDuration = `${2 + Math.random() * 2}s`;

            this.confettiContainer.appendChild(confetti);
        }

        // 清理
        setTimeout(() => {
            this.confettiContainer.innerHTML = '';
        }, 4000);
    }

    /**
     * 重新挑戰
     */
    onReplay() {
        this.close();

        eventBus.emit('REPLAY_MISSION', {
            mission: this.missionData?.mission
        });
    }

    /**
     * 繼續
     */
    onContinue() {
        this.close();

        eventBus.emit('EXPLORATION_COMPLETE', {
            mission: this.missionData?.mission,
            rewards: this.missionData?.rewards
        });
    }

    /**
     * 關閉結果畫面
     */
    close() {
        if (!this.isOpen) return;

        const container = this.resultsScreen.querySelector('.results-container');
        container.classList.add('leaving');

        setTimeout(() => {
            this.resultsScreen.classList.add('hidden');
            container.classList.remove('leaving');
            this.isOpen = false;
            this.missionData = null;
        }, 300);
    }

    /**
     * AI 分析摘要
     */
    async loadAnalysis(data) {
        const body = this.resultsScreen.querySelector('#ai-analysis-body');
        if (!body) return;

        try {
            const stats = {
                player_id: data.playerId || 'explorer',
                missions_completed: data.stats?.missionsCompleted || 0,
                missions_failed: data.stats?.missionsFailed || 0,
                characters_used: data.stats?.charactersUsed || {},
                mission_types_completed: data.stats?.missionTypesCompleted || {},
                total_money_earned: data.rewards?.money || 0,
                total_playtime_minutes: Math.round((data.stats?.playTime || 0) / 60)
            };
            const analysis = await aiService.analyzeProgress(stats);
            const recs = (analysis.recommendations || []).slice(0, 3);
            const strengths = (analysis.strengths || []).slice(0, 2);
            const improvements = (analysis.improvements || []).slice(0, 2);

            body.innerHTML = `
                <div class="analysis-section">
                    <strong>Summary:</strong> ${analysis.overall_progress || 'Great exploration!'}
                </div>
                <div class="analysis-grid">
                    <div>
                        <div class="pill">Strengths</div>
                        <ul>${strengths.map(s => `<li>${s}</li>`).join('') || '<li>Keep it up</li>'}</ul>
                    </div>
                    <div>
                        <div class="pill">Improvements</div>
                        <ul>${improvements.map(s => `<li>${s}</li>`).join('') || '<li>Try more quests</li>'}</ul>
                    </div>
                </div>
                ${recs.length ? `
                    <div class="analysis-section">
                        <div class="pill">Recommendations</div>
                        <ul>${recs.map(r => `<li>${r.title || r}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            `;

            if (analysis.offline) {
                aiService.notifyOffline('Exploration Debrief');
            }
        } catch (e) {
            body.innerHTML = `<div class="muted">AI analysis unavailable.</div>`;
        }
    }

    /**
     * AI 分析摘要
     */
    async loadAnalysis(data) {
        const body = this.resultsScreen.querySelector('#ai-analysis-body');
        if (!body) return;

        try {
            const stats = {
                player_id: data.playerId || 'explorer',
                missions_completed: data.stats?.missionsCompleted || 0,
                missions_failed: data.stats?.missionsFailed || 0,
                characters_used: data.stats?.charactersUsed || {},
                mission_types_completed: data.stats?.missionTypesCompleted || {},
                total_money_earned: data.rewards?.money || 0,
                total_playtime_minutes: Math.round((data.stats?.playTime || 0) / 60)
            };
            const analysis = await aiService.analyzeProgress(stats);
            const recs = (analysis.recommendations || []).slice(0, 3);
            const strengths = (analysis.strengths || []).slice(0, 2);
            const improvements = (analysis.improvements || []).slice(0, 2);

            body.innerHTML = `
                <div class="analysis-section">
                    <strong>Summary:</strong> ${analysis.overall_progress || 'Great exploration!'}
                </div>
                <div class="analysis-grid">
                    <div>
                        <div class="pill">Strengths</div>
                        <ul>${strengths.map(s => `<li>${s}</li>`).join('') || '<li>Keep it up</li>'}</ul>
                    </div>
                    <div>
                        <div class="pill">Improvements</div>
                        <ul>${improvements.map(s => `<li>${s}</li>`).join('') || '<li>Try more quests</li>'}</ul>
                    </div>
                </div>
                ${recs.length ? `
                    <div class="analysis-section">
                        <div class="pill">Recommendations</div>
                        <ul>${recs.map(r => `<li>${r.title || r}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            `;

            if (analysis.offline) {
                aiService.notifyOffline('Exploration Debrief');
            }
        } catch (e) {
            body.innerHTML = `<div class="muted">AI analysis unavailable.</div>`;
        }
    }

    /**
     * 是否開啟中
     * @returns {boolean}
     */
    isResultsOpen() {
        return this.isOpen;
    }

    /**
     * 銷毀
     */
    dispose() {
        if (this.resultsScreen && this.resultsScreen.parentNode) {
            this.resultsScreen.parentNode.removeChild(this.resultsScreen);
        }

        this.missionData = null;
    }
}
