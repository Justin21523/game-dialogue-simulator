import { gameState } from '../../core/game-state.js';
import { Toast } from '../toast.js';
import { Modal } from '../components/modal.js';
import { aiService } from '../../core/ai-service.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';
import contentGenerator from '../../systems/content-generator.js';
import tutorialManager from '../../systems/tutorial-manager.js';

export class MissionBoardScreen {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.modal = new Modal('char-select-modal'); // Initialize reusable modal
        this.recommendations = new Map();
    }

    render() {
        const missions = gameState.availableMissions;

        this.container.innerHTML = `
            <div class="screen mission-board-screen anim-slide-up">
                <header class="screen-header">
                    <h2><span class="icon">🌍</span> GLOBAL MISSIONS</h2>
                    <div class="resources-display">
                        <span class="res-item">💰 ${gameState.resources.money}</span>
                        <span class="res-item">⛽ ${gameState.resources.fuel}</span>
                        <button id="btn-ai-tip" class="btn btn-outline btn-sm">💡 AI Hint</button>
                    </div>
                </header>

                <div class="mission-list-container">
                    ${missions.length > 0 ? 
                        missions.map(m => this.renderMissionCard(m)).join('') : 
                        '<div class="empty-state">No missions available. Refresh to find new jobs!</div>'
                    }
                </div>

                <div class="action-bar">
                    <button id="btn-back-hangar" class="btn btn-secondary">◀ Back to Hangar</button>
                    <button id="btn-refresh" class="btn btn-warning">🔄 Refresh Board (-50💰)</button>
                    <button id="btn-ai-refresh" class="btn btn-primary">🤖 AI Generate Missions</button>
                    <button id="btn-package" class="btn btn-outline">📦 Export Assets</button>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    renderMissionCard(mission) {
        const primaryObj = mission.getPrimaryObjective ? mission.getPrimaryObjective() : (mission.objectives && mission.objectives[0]);
        return `
            <div class="mission-card panel" data-id="${mission.id}">
                <div class="mission-left">
                    <div class="mission-icon icon-${mission.type.toLowerCase()}">${mission.type[0]}</div>
                </div>
                
                <div class="mission-center">
                    <div class="mission-header-text">
                        <h3>${mission.title}</h3>
                        <span class="mission-location">📍 ${mission.location}${mission.campaignTheme ? ' · ' + mission.campaignTheme : ''}</span>
                    </div>
                    <p class="mission-desc-short">${primaryObj ? primaryObj.description : mission.description}</p>
                    ${mission.campaignId ? `<span class="tag badge">Campaign</span>` : ''}
                </div>

                <div class="mission-right">
                    <div class="rewards">
                        <span class="tag reward">💰 ${mission.rewardMoney}</span>
                        <span class="tag cost">⛽ ${mission.fuelCost}</span>
                    </div>
                    <button class="btn btn-outline btn-sm btn-mission-tutorial" data-type="${mission.type}">📚 Guide</button>
                    <button class="btn btn-outline btn-sm btn-ai" data-id="${mission.id}">🤖 AI Recommend</button>
                    <button class="btn btn-outline btn-sm btn-event" data-id="${mission.id}">🎲 AI Event</button>
                    <button class="btn btn-primary btn-sm btn-accept" data-id="${mission.id}">SELECT</button>
                </div>
            </div>
        `;
    }

    attachEvents() {
        // Back Button
        document.getElementById('btn-back-hangar').addEventListener('click', () => {
            window.game.renderHangar();
        });

        // AI hint button
        const btnHint = document.getElementById('btn-ai-tip');
        if (btnHint) {
            btnHint.addEventListener('click', async () => {
                btnHint.disabled = true;
                btnHint.innerText = "💡 Generating...";
                try {
                    const firstMission = gameState.availableMissions[0];
                    const hint = await tutorialManager.getHint({
                        topic: "mission_board",
                        character_id: firstMission?.assignedCharId,
                        mission_type: firstMission?.type,
                    });
                    Toast.show(hint.tutorial || hint.content || "Here's a tip for you!", "info", 8000);
                } catch (e) {
                    console.error('[MissionBoard] Hint failed:', e);
                    Toast.show("Failed to fetch hint.", "error");
                } finally {
                    btnHint.disabled = false;
                    btnHint.innerText = "💡 AI Hint";
                }
            });
        }

        // Refresh Button
        document.getElementById('btn-refresh').addEventListener('click', async () => {
            const btn = document.getElementById('btn-refresh');
            if (gameState.resources.money >= 50) {
                btn.disabled = true;
                btn.innerText = "🔄 Loading...";
                try {
                    gameState.addMoney(-50);
                    await gameState.refreshMissions();
                    this.render();
                    Toast.show("Missions Refreshed!", "success");
                } catch (e) {
                    Toast.show("Refresh failed.", "error");
                } finally {
                    if(document.getElementById('btn-refresh')) {
                        document.getElementById('btn-refresh').disabled = false;
                        document.getElementById('btn-refresh').innerText = "🔄 Refresh Board (-50💰)";
                    }
                }
            } else {
                Toast.show("Not enough money!", "error");
            }
        });

        // AI Refresh Button
        const btnAiRefresh = document.getElementById('btn-ai-refresh');
        if (btnAiRefresh) {
            btnAiRefresh.addEventListener('click', async () => {
                btnAiRefresh.disabled = true;
                btnAiRefresh.textContent = '🤖 Generating...';
                try {
                    const missions = await contentGenerator.refreshDailyMissions(5);
                    this.render();
                    Toast.show(`Generated ${missions.length} new missions!`, 'success');
                } catch (e) {
                    console.error('[MissionBoard] AI refresh failed:', e);
                    Toast.show('AI generation failed. Try again.', 'error');
                } finally {
                    if (document.getElementById('btn-ai-refresh')) {
                        document.getElementById('btn-ai-refresh').disabled = false;
                        document.getElementById('btn-ai-refresh').textContent = '🤖 AI Generate Missions';
                    }
                }
            });
        }

        // Export assets
        const btnPackage = document.getElementById('btn-package');
        if (btnPackage) {
            btnPackage.addEventListener('click', async () => {
                btnPackage.disabled = true;
                btnPackage.textContent = '📦 Packaging...';
                try {
                    const mission = gameState.availableMissions[0];
                    const payload = {
                        mission_id: mission?.id || 'bundle_all',
                        quality: 'standard',
                        include_images: true,
                        include_audio: true
                    };
                    const res = await aiService.packageAssets(payload);
                    Toast.show(`Package queued: ${res.package_id || 'queued'}`, 'success');
                    if (res.offline) aiService.notifyOffline('Asset Packager');
                } catch (e) {
                    Toast.show('Asset packaging failed.', 'error');
                } finally {
                    btnPackage.disabled = false;
                    btnPackage.textContent = '📦 Export Assets';
                }
            });
        }

        // Mission tutorial button
        this.container.querySelectorAll('.btn-mission-tutorial').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const missionType = btn.dataset.type;
                await tutorialManager.showMissionTypeTutorial(missionType, true);
            });
        });

        // Open Modal on "Select"
        this.container.querySelectorAll('.btn-accept').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const missionId = btn.dataset.id;
                this.openCharacterSelection(missionId);
            });
        });

        // AI recommend button
        this.container.querySelectorAll('.btn-ai').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const missionId = btn.dataset.id;
                await this.fetchDispatchRecommendation(missionId);
            });
        });

        // AI event button
        this.container.querySelectorAll('.btn-event').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const missionId = btn.dataset.id;
                await this.fetchEventPreview(missionId);
            });
        });
    }

    openCharacterSelection(missionId) {
        const mission = gameState.availableMissions.find(m => m.id === missionId);
        if (!mission) return;

        // 顯示所有角色（不再限制 isAvailable）
        const availableChars = gameState.getAllCharacters();

        // Content for Modal
        const content = `
            <div class="modal-mission-summary">
                <h4>Mission: ${mission.title}</h4>
                <div class="reqs">
                    <span>⛽ Fuel Cost: ${mission.fuelCost}</span>
                    <span>⭐ Type: ${mission.type}</span>
                </div>
            </div>
            <div class="char-grid-selector">
                ${availableChars.map(char => {
                            const isBonus = char.type === mission.type;
                            const rec = this.recommendations.get(mission.id);
                            const isRecommended = rec && rec.recommended_character === char.id;

                            // Get character score from ranking
                            let score = null;
                            if (rec && rec.ranking) {
                                const rankEntry = rec.ranking.find(r => r.character_id === char.id);
                                if (rankEntry) {
                                    score = rankEntry.score;
                                }
                            }

                            return `
                                <div class="char-choice-card ${isBonus ? 'bonus' : ''} ${isRecommended ? 'ai-recommended' : ''}" data-char-id="${char.id}">
                    <div class="char-choice-img">
                                        <img src="${aiAssetManager.getCharacterPlaceholder(char.id)}" data-char-id="${char.id}" class="char-choice-img-src" loading="lazy">
                                    </div>
                                    <div class="char-choice-name">${char.name}</div>
                                    ${score !== null ? `<div class="char-score">⭐ ${score}</div>` : ''}
                                    ${isBonus ? '<div class="match-badge">Type Match</div>' : ''}
                                    ${isRecommended ? '<div class="match-badge ai">AI Pick</div>' : ''}
                                </div>
                    `;
                }).join('')}
            </div>
            ${this.recommendations.has(mission.id) ? `
                <div class="ai-reasoning">
                    <strong>AI Recommendation:</strong> ${this.recommendations.get(mission.id).recommended_character} (confidence ${Math.round(this.recommendations.get(mission.id).confidence * 100)}%)<br>
                    <em>${this.recommendations.get(mission.id).reasoning || ''}</em>
                </div>
            ` : `
                <div class="ai-reasoning muted">No AI recommendation yet. Click “🤖 AI Recommend”.</div>
            `}
        `;

        this.modal.show({
            title: "Select Super Wing",
            content: content,
            footer: `<button class="btn btn-secondary modal-cancel">Cancel</button>`
        });

        // Bind Modal Events
        this.modal.querySelector('.modal-cancel').addEventListener('click', () => {
            this.modal.hide();
        });

        this.modal.querySelectorAll('.char-choice-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const charId = card.dataset.charId;
                console.log('[MissionBoard] Character selected:', charId);

                // Hide modal first
                this.modal.hide();

                // Small delay to ensure modal is closed before navigation
                setTimeout(() => {
                    this.handleDispatch(mission, charId);
                }, 100);
            });
        });

        // 補載 AI 角色肖像
        this.loadModalPortraits(availableChars, mission);
    }

    async handleDispatch(mission, charId) {
        console.log('[MissionBoard] handleDispatch called with:', {
            missionId: mission.id,
            charId: charId,
            fuelCost: mission.fuelCost,
            currentFuel: gameState.resources.fuel
        });

        if (gameState.consumeFuel(mission.fuelCost)) {
            console.log('[MissionBoard] Fuel consumed, starting mission...');
            const started = await gameState.startMission(mission.id, charId);
            console.log('[MissionBoard] startMission returned:', started);

            if (started) {
                console.log('[MissionBoard] Mission started successfully, calling renderLaunch...');
                try {
                    // ===== 保留出發序列,但最終進入探索模式 =====
                    window.game.renderLaunch(mission.id);
                    console.log('[MissionBoard] renderLaunch completed');
                } catch (error) {
                    console.error('[MissionBoard] renderLaunch error:', error);
                }
            } else {
                console.error('[MissionBoard] startMission failed!');
                Toast.show("Failed to start mission. Check console.", "error");
            }
        } else {
            console.warn('[MissionBoard] Not enough fuel');
            Toast.show("Not enough fuel! Refuel at Hangar.", "warning");
        }
    }

    async fetchDispatchRecommendation(missionId) {
        const mission = gameState.availableMissions.find(m => m.id === missionId);
        if (!mission) return;

        const btn = this.container.querySelector(`.btn-ai[data-id="${missionId}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerText = "🤖 Loading...";
        }
        try {
            const chars = gameState.getAllCharacters();

            // Call both endpoints for comprehensive recommendation
            const [detailedRec, bestForRec] = await Promise.all([
                aiService.recommendDispatch(mission, chars),
                aiService.getBestForMissionType(mission.type, chars)
            ]);

            // Merge recommendations
            const rec = {
                ...detailedRec,
                ranking: bestForRec.ranking || [],
                best_character: bestForRec.best_character,
            };

            this.recommendations.set(missionId, rec);
            Toast.show(`AI Pick: ${rec.recommended_character} (confidence ${Math.round(rec.confidence * 100)}%)`, "success");
            this.render(); // 重繪以顯示標記
        } catch (e) {
            console.error(e);
            Toast.show("AI recommendation failed. Try again.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "🤖 AI Recommend";
            }
        }
    }

    async fetchEventPreview(missionId) {
        const mission = gameState.availableMissions.find(m => m.id === missionId);
        if (!mission) return;

        const btn = this.container.querySelector(`.btn-event[data-id="${missionId}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerText = "🎲 Loading...";
        }
        try {
            const rec = await aiService.generateEvent({
                mission_type: mission.type,
                location: mission.location,
                mission_phase: "active",
                problem: mission.description,
            });
            const title = rec.event_name || "AI Event";
            const desc = rec.description || "No description";
            Toast.show(`${title}: ${desc}`, "info");
            if (rec.offline) aiService.notifyOffline("Event");
        } catch (e) {
            console.error(e);
            Toast.show("AI event failed. Try again.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "🎲 AI Event";
            }
        }
    }

    async loadModalPortraits(characters, mission) {
        for (const char of characters) {
            try {
                const { selection } = await aiAssetManager.preloadMissionImage(char.id, mission.type, 'planning');
                const img = this.modal.querySelector(`img.char-choice-img-src[data-char-id="${char.id}"]`);
                if (img) {
                    img.src = selection?.primary || aiAssetManager.getCharacterPlaceholder(char.id);
                }
            } catch (e) {
                // 使用預設佔位
            }
        }
    }
}
