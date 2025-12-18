/**
 * Statistics Screen for Super Wings Simulator
 * Displays comprehensive gameplay statistics
 */
import { aiService } from '../../core/ai-service.js';
import { Toast } from '../toast.js';

export class StatisticsScreen {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    render() {
        const summary = window.statisticsTracker?.getSummary() || this.getDefaultSummary();
        const stats = window.statisticsTracker?.getAllStats() || {};

        this.container.innerHTML = `
            <div class="screen statistics-screen anim-fade-in">
                <header class="screen-header">
                    <button id="btn-back" class="btn btn-icon" title="Back">◀</button>
                    <h2>Game Stats</h2>
                    <div class="action-row">
                        <button id="btn-ai-progress" class="btn btn-outline btn-sm">🤖 AI Progress Analysis</button>
                    </div>
                </header>

                <div class="statistics-content">
                    ${this.renderOverviewSection(summary)}
                    ${this.renderMissionSection(summary, stats)}
                    ${this.renderExplorationSection(summary, stats)}
                    ${this.renderEconomySection(summary)}
                    ${this.renderFlightSection(summary, stats)}
                    ${this.renderPerformanceSection(summary)}
                    ${this.renderCharacterSection(summary, stats)}
                    ${this.renderTimeSection(summary, stats)}
                </div>
            </div>
        `;

        this.attachEvents();
        this.addStyles();
    }

    getDefaultSummary() {
        return {
            missions: { completed: 0, failed: 0, successRate: 0 },
            exploration: { locations: 0, npcsHelped: 0 },
            economy: { earned: 0, spent: 0, peak: 0 },
            flight: { totalTime: '0m', coins: 0, obstacles: 0 },
            performance: { currentStreak: 0, bestStreak: 0, perfectMissions: 0 },
            characters: { used: 0, levelUps: 0, highestLevel: 1 },
            time: { totalPlayTime: '0m', sessions: 0, firstPlay: null, lastPlay: null }
        };
    }

    renderOverviewSection(summary) {
        return `
            <section class="stats-section overview">
                <h3>Overview</h3>
                <div class="overview-cards">
                    <div class="overview-card">
                        <span class="card-icon">✈</span>
                        <span class="card-value">${summary.missions.completed}</span>
                        <span class="card-label">Missions Completed</span>
                    </div>
                    <div class="overview-card">
                        <span class="card-icon">⏱</span>
                        <span class="card-value">${summary.time.totalPlayTime}</span>
                        <span class="card-label">Play Time</span>
                    </div>
                    <div class="overview-card">
                        <span class="card-icon">💰</span>
                        <span class="card-value">${summary.economy.earned.toLocaleString()}</span>
                        <span class="card-label">Total Earnings</span>
                    </div>
                    <div class="overview-card">
                        <span class="card-icon">🏆</span>
                        <span class="card-value">${summary.performance.bestStreak}</span>
                        <span class="card-label">Best Streak</span>
                    </div>
                </div>
            </section>
        `;
    }

    renderMissionSection(summary, stats) {
        const missionTypes = stats.missionsByType || {};
        const typeItems = Object.entries(missionTypes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return `
            <section class="stats-section">
                <h3>Mission Stats</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Completed</span>
                        <span class="stat-value">${summary.missions.completed}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Failed</span>
                        <span class="stat-value">${summary.missions.failed}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Success Rate</span>
                        <span class="stat-value">${summary.missions.successRate}%</span>
                    </div>
                </div>
                ${typeItems.length > 0 ? `
                    <div class="stat-breakdown">
                        <h4>Mission Type Breakdown</h4>
                        ${typeItems.map(([type, count]) => `
                            <div class="breakdown-item">
                                <span class="breakdown-label">${this.formatMissionType(type)}</span>
                                <div class="breakdown-bar">
                                    <div class="bar-fill" style="width: ${(count / summary.missions.completed * 100) || 0}%"></div>
                                </div>
                                <span class="breakdown-value">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </section>
        `;
    }

    renderExplorationSection(summary, stats) {
        const locations = stats.locationsVisited || [];
        const npcs = stats.uniqueNPCsHelped || [];

        return `
            <section class="stats-section">
                <h3>Exploration Stats</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Locations Visited</span>
                        <span class="stat-value">${summary.exploration.locations}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">NPCs Helped</span>
                        <span class="stat-value">${summary.exploration.npcsHelped}</span>
                    </div>
                </div>
                ${locations.length > 0 ? `
                    <div class="stat-list">
                        <h4>Visited Locations</h4>
                        <div class="tag-list">
                            ${locations.map(loc => `<span class="tag">${loc}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </section>
        `;
    }

    renderEconomySection(summary) {
        return `
            <section class="stats-section">
                <h3>Economy</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Total Earnings</span>
                        <span class="stat-value highlight-gold">💰 ${summary.economy.earned.toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Spent</span>
                        <span class="stat-value">${summary.economy.spent.toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Peak Holdings</span>
                        <span class="stat-value">${summary.economy.peak.toLocaleString()}</span>
                    </div>
                </div>
            </section>
        `;
    }

    renderFlightSection(summary, stats) {
        return `
            <section class="stats-section">
                <h3>Flight</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Flight Time</span>
                        <span class="stat-value">${summary.flight.totalTime}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Coins Collected</span>
                        <span class="stat-value">${summary.flight.coins}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Obstacles Hit</span>
                        <span class="stat-value">${summary.flight.obstacles}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Boosts Used</span>
                        <span class="stat-value">${stats.boostsUsed || 0}</span>
                    </div>
                </div>
            </section>
        `;
    }

    renderPerformanceSection(summary) {
        return `
            <section class="stats-section">
                <h3>Performance</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Current Streak</span>
                        <span class="stat-value ${summary.performance.currentStreak > 0 ? 'highlight-green' : ''}">${summary.performance.currentStreak}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Best Streak</span>
                        <span class="stat-value highlight-gold">🔥 ${summary.performance.bestStreak}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Perfect Missions</span>
                        <span class="stat-value">⭐ ${summary.performance.perfectMissions}</span>
                    </div>
                </div>
            </section>
        `;
    }

    renderCharacterSection(summary, stats) {
        const characterMissions = stats.missionsByCharacter || {};
        const characterItems = Object.entries(characterMissions)
            .sort((a, b) => b[1] - a[1]);

        return `
            <section class="stats-section">
                <h3>Characters</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Characters Used</span>
                        <span class="stat-value">${summary.characters.used}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Level Ups</span>
                        <span class="stat-value">${summary.characters.levelUps}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Highest Level</span>
                        <span class="stat-value">Lv.${summary.characters.highestLevel}</span>
                    </div>
                </div>
                ${characterItems.length > 0 ? `
                    <div class="stat-breakdown">
                        <h4>Missions per Character</h4>
                        ${characterItems.map(([char, count]) => `
                            <div class="breakdown-item">
                                <span class="breakdown-label">${this.formatCharacterName(char)}</span>
                                <div class="breakdown-bar">
                                    <div class="bar-fill character-bar" style="width: ${(count / summary.missions.completed * 100) || 0}%"></div>
                                </div>
                                <span class="breakdown-value">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </section>
        `;
    }

    renderTimeSection(summary, stats) {
        const firstPlay = stats.firstPlayDate
            ? new Date(stats.firstPlayDate).toLocaleDateString()
            : '---';
        const lastPlay = stats.lastPlayDate
            ? new Date(stats.lastPlayDate).toLocaleDateString()
            : '---';

        return `
            <section class="stats-section">
                <h3>Time</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Total Playtime</span>
                        <span class="stat-value">${summary.time.totalPlayTime}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Sessions</span>
                        <span class="stat-value">${summary.time.sessions}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">First Play</span>
                        <span class="stat-value small">${firstPlay}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Last Play</span>
                        <span class="stat-value small">${lastPlay}</span>
                    </div>
                </div>
            </section>
        `;
    }

    formatMissionType(type) {
        const types = {
            delivery: 'Delivery',
            sports: 'Sports',
            construction: 'Construction',
            animal_care: 'Animal Care',
            medical: 'Medical',
            rescue: 'Rescue',
            festival: 'Festival',
            adventure: 'Adventure'
        };
        return types[type] || type;
    }

    formatCharacterName(id) {
        const names = {
            jett: 'Jett',
            jerome: 'Jerome',
            donnie: 'Donnie',
            chase: 'Chase',
            flip: 'Flip',
            todd: 'Todd',
            paul: 'Paul',
            bello: 'Bello'
        };
        return names[id] || id;
    }

    attachEvents() {
        document.getElementById('btn-back')?.addEventListener('click', () => {
            window.game?.renderMainMenu();
        });

        const btnAI = document.getElementById('btn-ai-progress');
        if (btnAI) {
            btnAI.addEventListener('click', async () => {
                btnAI.disabled = true;
                btnAI.innerText = "Analyzing...";
                try {
                    const summary = window.statisticsTracker?.getSummary() || this.getDefaultSummary();
                    const stats = window.statisticsTracker?.getAllStats() || {};
                    const payload = {
                        player_id: "local_player",
                        missions_completed: summary.missions.completed,
                        missions_failed: summary.missions.failed,
                        characters_used: stats.charactersUsed || {},
                        characters_unlocked: Object.keys(stats.charactersUsed || {}),
                        character_levels: stats.characterLevels || {},
                        locations_visited: stats.locationsVisited || [],
                        achievements_earned: stats.achievements || [],
                        mission_types_completed: stats.missionsByType || {},
                        total_money_earned: summary.economy.earned || 0,
                        total_playtime_minutes: summary.time.totalMinutes || 0,
                        player_level: summary.characters.highestLevel || 1,
                    };
                    const res = await aiService.analyzeProgress(payload);
                    const recs = await aiService.getProgressRecommendations(payload);
                    res.recommendations = recs.recommendations;
                    this.showAIAnalysis(res);
                    if (res.offline || recs.offline) aiService.notifyOffline("Progress analysis");
                } catch (e) {
                    console.error(e);
                    Toast.show("AI analysis failed", "error");
                } finally {
                    btnAI.disabled = false;
                    btnAI.innerText = "🤖 AI Progress Analysis";
                }
            });
        }
    }

    showAIAnalysis(result) {
        const panel = document.createElement('div');
        panel.className = 'ai-progress-panel';
        panel.innerHTML = `
            <h4>AI Progress Analysis</h4>
            <p class="ai-progress-summary">${result.overall_progress || ''}</p>
            ${result.strengths?.length ? `<div><strong>Strengths:</strong> ${result.strengths.join(', ')}</div>` : ''}
            ${result.improvements?.length ? `<div><strong>Improvements:</strong> ${result.improvements.join(', ')}</div>` : ''}
            ${result.playstyle ? `<div><strong>Playstyle:</strong> ${result.playstyle}</div>` : ''}
        `;
        const container = this.container.querySelector('.statistics-content');
        if (container) {
            container.prepend(panel);
        } else {
            this.container.appendChild(panel);
        }
    }

    addStyles() {
        if (document.getElementById('statistics-screen-styles')) return;

        const style = document.createElement('style');
        style.id = 'statistics-screen-styles';
        style.textContent = `
            .statistics-screen {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: var(--bg-main);
            }

            .statistics-screen .screen-header {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px 24px;
                background: var(--bg-panel);
                border-bottom: 1px solid var(--border-color);
            }

            .statistics-screen .screen-header h2 {
                margin: 0;
                font-size: 24px;
            }

            .statistics-screen .action-row {
                margin-left: auto;
                display: flex;
                gap: 8px;
            }

            .statistics-content {
                flex: 1;
                overflow-y: auto;
                padding: 24px;
            }

            .stats-section {
                background: var(--bg-card);
                border-radius: var(--radius-lg);
                padding: 20px;
                margin-bottom: 16px;
            }

            .stats-section h3 {
                margin: 0 0 16px 0;
                font-size: 18px;
                color: var(--text-main);
                border-bottom: 2px solid var(--color-primary);
                padding-bottom: 8px;
            }

            .stats-section h4 {
                margin: 16px 0 12px 0;
                font-size: 14px;
                color: var(--text-secondary);
            }

            /* Overview cards */
            .overview-cards {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                gap: 16px;
            }

            .overview-card {
                background: var(--bg-secondary);
                border-radius: var(--radius-md);
                padding: 16px;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
            }

            .overview-card .card-icon {
                font-size: 32px;
                margin-bottom: 8px;
            }

            .overview-card .card-value {
                font-size: 24px;
                font-weight: 700;
                color: var(--text-main);
            }

            .overview-card .card-label {
                font-size: 12px;
                color: var(--text-secondary);
                margin-top: 4px;
            }

            /* Stats grid */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 12px;
            }

            .stat-item {
                display: flex;
                flex-direction: column;
                padding: 12px;
                background: var(--bg-secondary);
                border-radius: var(--radius-sm);
            }

            .stat-label {
                font-size: 12px;
                color: var(--text-secondary);
                margin-bottom: 4px;
            }

            .stat-value {
                font-size: 18px;
                font-weight: 600;
                color: var(--text-main);
            }

            .stat-value.small {
                font-size: 14px;
            }

            .stat-value.highlight-gold {
                color: var(--color-accent);
            }

            .stat-value.highlight-green {
                color: var(--color-success);
            }

            /* Breakdown bars */
            .stat-breakdown {
                margin-top: 12px;
            }

            .breakdown-item {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 8px;
            }

            .breakdown-label {
                width: 80px;
                font-size: 13px;
                color: var(--text-secondary);
            }

            .breakdown-bar {
                flex: 1;
                height: 8px;
                background: var(--bg-secondary);
                border-radius: 4px;
                overflow: hidden;
            }

            .bar-fill {
                height: 100%;
                background: var(--color-primary);
                border-radius: 4px;
                transition: width 0.5s ease;
            }

            .bar-fill.character-bar {
                background: var(--color-secondary);
            }

            .breakdown-value {
                width: 40px;
                text-align: right;
                font-size: 13px;
                color: var(--text-main);
            }

            /* Tag list */
            .stat-list {
                margin-top: 12px;
            }

            .tag-list {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .tag {
                padding: 4px 12px;
                background: var(--bg-secondary);
                border-radius: var(--radius-full);
                font-size: 12px;
                color: var(--text-secondary);
            }

            .ai-progress-panel {
                background: var(--bg-panel);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-lg);
                padding: 16px;
                margin-bottom: 16px;
                box-shadow: var(--shadow-sm);
            }

            .ai-progress-summary {
                margin: 6px 0 8px;
                color: var(--text-secondary);
            }

            @media (max-width: 480px) {
                .statistics-content {
                    padding: 16px;
                }

                .stats-section {
                    padding: 16px;
                }

                .overview-cards {
                    grid-template-columns: repeat(2, 1fr);
                }

                .breakdown-label {
                    width: 60px;
                    font-size: 11px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
