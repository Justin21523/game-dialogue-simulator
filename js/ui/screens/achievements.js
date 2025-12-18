/**
 * Achievements Screen for Super Wings Simulator
 * Displays all achievements with progress and unlock status
 */
import { aiService } from '../../core/ai-service.js';
import { Toast } from '../toast.js';

export class AchievementsScreen {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentFilter = 'all';
        this.aiInsight = null;
    }

    render() {
        const summary = window.achievementSystem?.getSummary() || {
            unlocked: 0,
            total: 0,
            percentage: 0,
            points: 0
        };

        this.container.innerHTML = `
            <div class="screen achievements-screen anim-fade-in">
                <header class="screen-header">
                    <button id="btn-back" class="btn btn-icon" title="Back">◀</button>
                    <h2>Achievements</h2>
                    <div class="achievements-summary">
                        <span class="summary-points">🏆 ${summary.points} pts</span>
                        <span class="summary-progress">${summary.unlocked}/${summary.total} (${summary.percentage}%)</span>
                        <button id="btn-ai-achievement" class="btn btn-outline btn-sm">🤖 AI 成就解析</button>
                    </div>
                </header>

                <div class="achievements-content">
                    <div class="achievements-ai-panel" id="achievements-ai-panel">
                        ${this.renderAISummary()}
                    </div>
                    ${this.renderCategoryTabs()}

                    <div class="achievements-grid" id="achievements-grid">
                        ${this.renderAchievements()}
                    </div>
                </div>
            </div>
        `;

        this.attachEvents();
        this.addStyles();
    }

    renderCategoryTabs() {
        const categories = window.achievementSystem?.categories || {};

        return `
            <div class="category-tabs">
                <button class="category-tab active" data-category="all">All</button>
                ${Object.entries(categories).map(([key, cat]) => `
                    <button class="category-tab" data-category="${key}">${cat.name || key}</button>
                `).join('')}
            </div>
        `;
    }

    renderAchievements() {
        let achievements = window.achievementSystem?.getAllAchievements() || [];

        // Filter by category
        if (this.currentFilter !== 'all') {
            achievements = achievements.filter(a => a.category === this.currentFilter);
        }

        // Sort: unlocked first, then by rarity
        const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
        achievements.sort((a, b) => {
            if (a.unlocked !== b.unlocked) {
                return a.unlocked ? -1 : 1;
            }
            return rarityOrder[a.rarity] - rarityOrder[b.rarity];
        });

        if (achievements.length === 0) {
            return '<div class="no-achievements">No achievements yet</div>';
        }

        return achievements.map(achievement => this.renderAchievementCard(achievement)).join('');
    }

    renderAchievementCard(achievement) {
        const isUnlocked = achievement.unlocked;
        const rarityColor = achievement.rarityInfo?.color || '#9e9e9e';
        const categoryIcon = this.getCategoryIcon(achievement.category);
        const progressPercent = achievement.progressPercent || 0;

        return `
            <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}"
                 data-id="${achievement.id}"
                 style="--rarity-color: ${rarityColor};">
                <div class="achievement-icon">
                    <span class="icon-symbol">${categoryIcon}</span>
                    ${isUnlocked ? '<span class="unlock-check">✓</span>' : ''}
                </div>
                <div class="achievement-info">
                    <h3 class="achievement-name">${achievement.name || achievement.name_zh}</h3>
                    <p class="achievement-desc">${achievement.description || achievement.description_zh}</p>
                    <div class="achievement-meta">
                        <span class="achievement-rarity" style="color: ${rarityColor};">
                            ${achievement.rarityInfo?.name || achievement.rarity}
                        </span>
                        <span class="achievement-points">+${achievement.rarityInfo?.points || 0} pts</span>
                    </div>
                    ${!isUnlocked ? `
                        <div class="achievement-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progressPercent}%; background: ${rarityColor};"></div>
                            </div>
                            <span class="progress-text">${achievement.progress}/${achievement.target}</span>
                        </div>
                    ` : ''}
                </div>
                ${isUnlocked && achievement.reward ? `
                    <div class="achievement-reward">
                        ${achievement.reward.money ? `<span>💰 +${achievement.reward.money}</span>` : ''}
                        ${achievement.reward.experience ? `<span>⭐ +${achievement.reward.experience}</span>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    getCategoryIcon(category) {
        const icons = {
            milestone: '★',
            mission_type: '✈',
            exploration: '🌍',
            character: '👤',
            performance: '🏆',
            progression: '⬆',
            economy: '💰',
            special: '✨',
            ai_generated: '🤖',
            seasonal: '📅',
            secret: '❓'
        };
        return icons[category] || '★';
    }

    attachEvents() {
        // Back button
        document.getElementById('btn-back')?.addEventListener('click', () => {
            window.game?.renderMainMenu();
        });

        const btnAI = document.getElementById('btn-ai-achievement');
        if (btnAI) {
            btnAI.addEventListener('click', () => this.fetchAIInsights(btnAI));
        }

        // Category tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Update active state
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                // Filter achievements
                this.currentFilter = e.target.dataset.category;
                const grid = document.getElementById('achievements-grid');
                if (grid) {
                    grid.innerHTML = this.renderAchievements();
                }

                // Play sound
                if (window.audioManager) {
                    window.audioManager.playSound('button');
                }
            });
        });

        // Achievement card click (show details)
        document.querySelectorAll('.achievement-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                this.showAchievementDetail(id);
            });
        });
    }

    showAchievementDetail(achievementId) {
        const achievements = window.achievementSystem?.getAllAchievements() || [];
        const achievement = achievements.find(a => a.id === achievementId);

        if (!achievement) return;

        // Could implement a modal here for detailed view
        console.log('[AchievementsScreen] Detail:', achievement);
    }

    async fetchAIInsights(btn) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '解析中...';
        }
        try {
            const achievements = window.achievementSystem?.getAllAchievements() || [];
            const unlocked = achievements.filter(a => a.unlocked).map(a => a.id);
            const stats = window.statisticsTracker?.getAllStats() || {};
            const summary = window.statisticsTracker?.getSummary() || {};
            const payload = {
                player_id: 'local_player',
                missions_completed: summary.missions?.completed || 0,
                missions_failed: summary.missions?.failed || 0,
                characters_used: stats.charactersUsed || {},
                characters_unlocked: Object.keys(stats.charactersUsed || {}),
                character_levels: stats.characterLevels || {},
                locations_visited: stats.locationsVisited || [],
                achievements_earned: unlocked,
                mission_types_completed: stats.missionsByType || {},
                total_money_earned: summary.economy?.earned || 0,
                total_playtime_minutes: summary.time?.totalMinutes || 0,
                player_level: summary.characters?.highestLevel || 1,
            };
            const analysis = await aiService.analyzeProgress(payload);
            const recs = await aiService.getProgressRecommendations(payload);
            this.aiInsight = {
                ...analysis,
                recommendations: recs.recommendations || []
            };
            if (analysis.offline || recs.offline) aiService.notifyOffline('成就分析');
            this.updateAISummary();
        } catch (e) {
            console.error(e);
            Toast.show('AI 成就解析失敗', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🤖 AI 成就解析';
            }
        }
    }

    renderAISummary() {
        if (!this.aiInsight) {
            return `<div class="ai-summary muted">點擊「AI 成就解析」取得建議。</div>`;
        }
        const recs = (this.aiInsight.recommendations || []).slice(0, 3);
        return `
            <div class="ai-summary">
                ${this.aiInsight.overall_progress ? `<p class="ai-summary-text">${this.aiInsight.overall_progress}</p>` : ''}
                ${this.aiInsight.strengths?.length ? `<div class="ai-summary-row"><strong>優勢：</strong> ${this.aiInsight.strengths.join('、 ')}</div>` : ''}
                ${this.aiInsight.improvements?.length ? `<div class="ai-summary-row"><strong>建議：</strong> ${this.aiInsight.improvements.join('、 ')}</div>` : ''}
                ${recs.length ? `
                    <div class="ai-summary-recs">
                        ${recs.map(r => `<div class="ai-rec-item">• ${r.title || r.description || ''}</div>`).join('')}
                    </div>` : ''}
            </div>
        `;
    }

    updateAISummary() {
        const panel = document.getElementById('achievements-ai-panel');
        if (panel) {
            panel.innerHTML = this.renderAISummary();
        }
    }

    addStyles() {
        if (document.getElementById('achievements-screen-styles')) return;

        const style = document.createElement('style');
        style.id = 'achievements-screen-styles';
        style.textContent = `
            .achievements-screen {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: var(--bg-main);
            }

            .achievements-screen .screen-header {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px 24px;
                background: var(--bg-panel);
                border-bottom: 1px solid var(--border-color);
            }

            .achievements-screen .screen-header h2 {
                flex: 1;
                margin: 0;
                font-size: 24px;
            }

            .achievements-summary {
                display: flex;
                gap: 16px;
                align-items: center;
            }

            .achievements-ai-panel {
                margin-bottom: 12px;
            }

            .ai-summary {
                background: var(--bg-panel);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-md);
                padding: 12px;
                box-shadow: var(--shadow-sm);
                font-size: 14px;
                color: var(--text-secondary);
            }

            .ai-summary-text {
                margin: 4px 0 6px;
                color: var(--text-main);
            }

            .ai-summary-row {
                margin: 4px 0;
            }

            .ai-summary-recs .ai-rec-item {
                margin-left: 8px;
                line-height: 1.4;
            }

            .ai-summary.muted {
                color: var(--text-muted);
            }

            .summary-points {
                font-size: 18px;
                font-weight: 700;
                color: var(--color-accent);
            }

            .summary-progress {
                font-size: 14px;
                color: var(--text-secondary);
            }

            .achievements-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px 24px;
            }

            .category-tabs {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--border-color);
            }

            .category-tab {
                padding: 8px 16px;
                background: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-full);
                color: var(--text-secondary);
                cursor: pointer;
                font-size: 14px;
                transition: all var(--transition-fast);
            }

            .category-tab:hover {
                background: var(--bg-secondary);
                color: var(--text-main);
            }

            .category-tab.active {
                background: var(--color-primary);
                border-color: var(--color-primary);
                color: white;
            }

            .achievements-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                gap: 16px;
            }

            .achievement-card {
                background: var(--bg-card);
                border: 2px solid var(--border-color);
                border-radius: var(--radius-md);
                padding: 16px;
                display: flex;
                gap: 16px;
                cursor: pointer;
                transition: all var(--transition-fast);
                position: relative;
                overflow: hidden;
            }

            .achievement-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 4px;
                height: 100%;
                background: var(--rarity-color);
            }

            .achievement-card:hover {
                transform: translateY(-4px);
                box-shadow: var(--shadow-md);
            }

            .achievement-card.unlocked {
                border-color: var(--rarity-color);
                background: linear-gradient(135deg, var(--bg-card) 0%, color-mix(in srgb, var(--rarity-color) 10%, var(--bg-card)) 100%);
            }

            .achievement-card.locked {
                opacity: 0.7;
            }

            .achievement-card.locked .achievement-icon {
                filter: grayscale(80%);
            }

            .achievement-icon {
                width: 64px;
                height: 64px;
                border-radius: var(--radius-md);
                background: var(--bg-secondary);
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                flex-shrink: 0;
            }

            .icon-symbol {
                font-size: 32px;
            }

            .unlock-check {
                position: absolute;
                bottom: -4px;
                right: -4px;
                width: 24px;
                height: 24px;
                background: var(--color-success);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: bold;
            }

            .achievement-info {
                flex: 1;
                min-width: 0;
            }

            .achievement-name {
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 4px 0;
                color: var(--text-main);
            }

            .achievement-desc {
                font-size: 13px;
                color: var(--text-secondary);
                margin: 0 0 8px 0;
                line-height: 1.4;
            }

            .achievement-meta {
                display: flex;
                gap: 12px;
                font-size: 12px;
            }

            .achievement-rarity {
                font-weight: 600;
                text-transform: uppercase;
            }

            .achievement-points {
                color: var(--color-accent);
            }

            .achievement-progress {
                margin-top: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .achievement-progress .progress-bar {
                flex: 1;
                height: 6px;
                background: var(--bg-secondary);
                border-radius: 3px;
                overflow: hidden;
            }

            .achievement-progress .progress-fill {
                height: 100%;
                transition: width 0.3s ease;
            }

            .achievement-progress .progress-text {
                font-size: 11px;
                color: var(--text-muted);
                min-width: 50px;
                text-align: right;
            }

            .achievement-reward {
                position: absolute;
                top: 8px;
                right: 8px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                font-size: 11px;
                color: var(--text-secondary);
            }

            .no-achievements {
                text-align: center;
                padding: 48px;
                color: var(--text-muted);
                font-size: 16px;
            }

            @media (max-width: 480px) {
                .achievements-grid {
                    grid-template-columns: 1fr;
                }

                .achievement-card {
                    padding: 12px;
                }

                .achievement-icon {
                    width: 48px;
                    height: 48px;
                }

                .icon-symbol {
                    font-size: 24px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
