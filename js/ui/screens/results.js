import { gameState } from '../../core/game-state.js';
import { aiService } from '../../core/ai-service.js';

export class ResultsScreen {
    constructor(containerId, resultData) {
        this.container = document.getElementById(containerId);
        this.data = resultData; // { mission, char }
    }

    render() {
        // 防禦性檢查
        const mission = this.data?.mission;
        const char = this.data?.char;

        // 如果沒有 mission 資料，使用預設值
        const rewards = this.data?.rewards || {
            money: mission?.rewardMoney || 0,
            exp: mission?.rewardExp || 0,
            bonus: 0
        };

        // 如果缺少關鍵資料，顯示錯誤訊息
        if (!mission) {
            console.error('[ResultsScreen] Missing mission data:', this.data);
            this.container.innerHTML = `
                <div class="screen results-screen anim-fade-in">
                    <div class="result-card anim-slide-up">
                        <h2 class="result-title">⚠️ 資料錯誤</h2>
                        <p>無法載入任務結果資料</p>
                        <button id="btn-back-hangar" class="btn btn-primary">返回機庫</button>
                    </div>
                </div>
            `;
            document.getElementById('btn-back-hangar')?.addEventListener('click', () => {
                window.game.renderHangar();
            });
            return;
        }

        this.container.innerHTML = `
            <div class="screen results-screen anim-fade-in">
                <div class="result-card anim-slide-up">
                    <h2 class="result-title">MISSION COMPLETE!</h2>
                    
                    <div class="mission-summary">
                        <h3>${mission.title || 'Unknown Mission'}</h3>
                        <p>${mission.location || 'Unknown Location'}</p>
                    </div>

                    <div class="rewards-container">
                        <div class="reward-item anim-pulse">
                            <span class="icon">💰</span>
                            <span class="value">+${rewards.money}</span>
                            <span class="label">Money</span>
                            ${rewards.bonus > 0 ? `<span class="bonus-text">(+${rewards.bonus} Bonus)</span>` : ''}
                        </div>
                        <div class="reward-item anim-pulse" style="animation-delay: 0.2s">
                            <span class="icon">⭐</span>
                            <span class="value">+${rewards.exp}</span>
                            <span class="label">Exp</span>
                        </div>
                    </div>

                    <div class="char-progress">
                        <div class="char-name">${char.name}</div>
                        <div class="level-info">Level ${char.level}</div>
                        <div class="exp-bar">
                            <div class="exp-fill" style="width: ${(char.exp / (char.level * 100)) * 100}%"></div>
                        </div>
                    </div>

                    <div class="ai-analysis panel muted" id="ai-analysis">
                        <div class="analysis-title">AI Debrief</div>
                        <div class="analysis-body">Analyzing mission performance...</div>
                    </div>

                    <button id="btn-continue" class="btn btn-primary btn-lg">Continue</button>
                </div>
            </div>
        `;

        document.getElementById('btn-continue').addEventListener('click', () => {
            // 改用手動降落控制系統，取代自動返回動畫
            window.game.renderLanding(this.data);
        });

        this.loadAnalysis(mission, char);
    }

    async loadAnalysis(mission, char) {
        const panel = document.getElementById('ai-analysis');
        if (!panel) return;

        const body = panel.querySelector('.analysis-body');
        try {
            const stats = {
                player_id: gameState.playerId || "local_player",
                missions_completed: gameState.stats?.missionsCompleted || 0,
                missions_failed: gameState.stats?.missionsFailed || 0,
                characters_used: gameState.stats?.charactersUsed || {},
                mission_types_completed: gameState.stats?.missionTypesCompleted || {},
                total_money_earned: gameState.resources?.money || 0,
                total_playtime_minutes: Math.round((gameState.stats?.playTime || 0) / 60),
                achievements_earned: gameState.stats?.achievements || []
            };
            const analysis = await aiService.analyzeProgress(stats);
            const narration = await aiService.generateNarration({
                characterId: char.id,
                phase: 'mission_complete',
                location: mission.location,
                problem: mission.description,
                result: 'success'
            });

            const recs = (analysis.recommendations || []).slice(0, 3);
            const strengths = (analysis.strengths || []).slice(0, 2);
            const improvements = (analysis.improvements || []).slice(0, 2);

            body.innerHTML = `
                <div class="analysis-section">
                    <strong>Summary:</strong> ${analysis.overall_progress || 'Mission complete!'}
                </div>
                ${narration?.narration ? `<div class="analysis-section"><strong>Narration:</strong> ${narration.narration}</div>` : ''}
                <div class="analysis-grid">
                    <div>
                        <div class="pill">Strengths</div>
                        <ul>${strengths.map(s => `<li>${s}</li>`).join('') || '<li>No data</li>'}</ul>
                    </div>
                    <div>
                        <div class="pill">Improvements</div>
                        <ul>${improvements.map(s => `<li>${s}</li>`).join('') || '<li>Keep it up!</li>'}</ul>
                    </div>
                </div>
                ${recs.length ? `
                    <div class="analysis-section">
                        <div class="pill">Recommendations</div>
                        <ul>${recs.map(r => `<li>${r.title || r}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            `;

            if (analysis.offline || narration?.offline) {
                aiService.notifyOffline("Results");
            }
        } catch (e) {
            console.warn("AI analysis failed", e);
            body.innerHTML = `<div class="muted">AI analysis unavailable right now.</div>`;
        }
    }
}
