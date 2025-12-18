import { CONFIG } from './config.js';
import { gameState } from './core/game-state.js';
import { audioManager } from './core/audio-manager.js';
import { HangarScreen } from './ui/screens/hangar.js';
import { MissionBoardScreen } from './ui/screens/mission-board.js';
import { LaunchScreen } from './ui/screens/launch.js';
import { InFlightScreen } from './ui/screens/in-flight.js';
import { TransformationScreen } from './ui/screens/transformation.js';
import { ArrivalScreen } from './ui/screens/arrival.js';
// ===== 🆕 使用全新的探索模式（从零重建）=====
import { ExplorationScreen } from './ui/screens/exploration-new.js';
import { ResultsScreen } from './ui/screens/results.js';
import { ReturnScreen } from './ui/screens/return-base.js';
import { LandingScreen } from './ui/screens/landing.js';
import { AchievementsScreen } from './ui/screens/achievements.js';
import { SaveLoadScreen } from './ui/screens/save-load.js';
import { StatisticsScreen } from './ui/screens/statistics.js';
import { DebugOverlay } from './ui/debug-overlay.js';
import { initDebugPanel } from './ui/debug-panel.js';

// Load effect systems (self-initializing singletons)
import './ui/effects/page-transition.js';
import './ui/effects/particle-system.js';
import './ui/effects/achievement-popup.js';

// Load manager systems (self-initializing singletons)
import './core/theme-manager.js';
import './systems/statistics-tracker.js';
import './systems/save-manager.js';
import './systems/achievement-system.js';

// Load AI image selector service
import './core/image-selector-service.js';

class GameApp {
    constructor() {
        console.log(`Initializing ${CONFIG.GAME_TITLE} v${CONFIG.VERSION}`);
        this.flightScore = 0;
        this.currentExplorationScreen = null; // ===== 🆕 保存探索模式實例 =====
        this.init();
    }

    async init() {
        // Initialize core systems
        gameState.init();

        // Initialize new systems
        window.themeManager?.init();
        window.statisticsTracker?.init();
        window.saveManager?.init();
        window.achievementSystem?.init();

        new DebugOverlay();
        initDebugPanel(); // 初始化調試面板
        await this.loadResources();
        this.renderMainMenu();
    }

    async loadResources() {
        return new Promise(resolve => setTimeout(resolve, 500));
    }

    renderMainMenu() {
        const container = document.getElementById('ui-layer');
        const hasSaves = window.saveManager?.hasSaves();

        container.innerHTML = `
            <div class="main-menu full-screen anim-fade-in">
                <div class="menu-bg"></div>
                <div class="menu-content">
                    <h1 class="menu-title">
                        SUPER WINGS<br>SIMULATOR
                    </h1>
                    <div class="menu-buttons">
                        ${hasSaves ? `
                            <button id="btn-continue" class="menu-btn primary">
                                ▶ Continue
                            </button>
                        ` : ''}
                        <button id="btn-start" class="menu-btn ${hasSaves ? '' : 'primary'}">
                            🎮 ${hasSaves ? 'New Game' : 'Start Game'}
                        </button>
                        <button id="btn-load" class="menu-btn">
                            💾 Save/Load
                        </button>
                        <button id="btn-achievements" class="menu-btn">
                            🏆 Achievements
                        </button>
                        <button id="btn-statistics" class="menu-btn">
                            📊 Statistics
                        </button>
                    </div>
                    <div class="menu-footer">
                        <button id="btn-theme" class="menu-icon-btn" title="Toggle Theme">
                            ${window.themeManager?.isDark() ? '☀️' : '🌙'}
                        </button>
                        <button id="btn-sound" class="menu-icon-btn" title="Toggle Sound">
                            🔊
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.addMainMenuStyles();
        this.attachMainMenuEvents(hasSaves);

        // Start menu BGM
        audioManager.resume().then(() => {
            audioManager.startBGM('menu');
        });
    }

    addMainMenuStyles() {
        if (document.getElementById('main-menu-styles')) return;

        const style = document.createElement('style');
        style.id = 'main-menu-styles';
        style.textContent = `
            .main-menu {
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, var(--bg-main) 0%, var(--bg-secondary) 100%);
            }

            .menu-bg {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(145deg, rgba(68,109,255,0.35), rgba(255,255,255,0.05));
                opacity: 0.4;
            }

            .menu-content {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 2rem;
            }

            .menu-title {
                font-size: 3.5rem;
                color: var(--text-main);
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                text-align: center;
                margin-bottom: 2rem;
                line-height: 1.2;
            }

            .menu-buttons {
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 280px;
            }

            .menu-btn {
                padding: 14px 24px;
                font-size: 16px;
                font-weight: 600;
                border: 2px solid var(--border-color);
                border-radius: var(--radius-lg);
                background: var(--bg-card);
                color: var(--text-main);
                cursor: pointer;
                transition: all var(--transition-fast);
            }

            .menu-btn:hover {
                transform: translateY(-2px);
                box-shadow: var(--shadow-md);
                border-color: var(--color-primary);
            }

            .menu-btn.primary {
                background: var(--color-primary);
                border-color: var(--color-primary);
                color: white;
            }

            .menu-btn.primary:hover {
                filter: brightness(1.1);
            }

            .menu-footer {
                display: flex;
                gap: 16px;
                margin-top: 24px;
            }

            .menu-icon-btn {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                border: 2px solid var(--border-color);
                background: var(--bg-card);
                font-size: 20px;
                cursor: pointer;
                transition: all var(--transition-fast);
            }

            .menu-icon-btn:hover {
                transform: scale(1.1);
                box-shadow: var(--shadow-md);
            }

            @media (max-width: 480px) {
                .menu-title {
                    font-size: 2.5rem;
                }

                .menu-buttons {
                    width: 100%;
                    padding: 0 16px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    attachMainMenuEvents(hasSaves) {
        // Continue button
        if (hasSaves) {
            document.getElementById('btn-continue')?.addEventListener('click', () => {
                audioManager.playSound('button');
                const slotIndex = window.saveManager?.getCurrentSlot() || 0;
                const data = window.saveManager?.loadFromSlot(slotIndex);
                if (data?.gameState) {
                    gameState.loadState(data.gameState);
                }
                this.renderHangar();
            });
        }

        // Start button
        document.getElementById('btn-start')?.addEventListener('click', () => {
            audioManager.playSound('button');
            this.renderHangar();
        });

        // Load button
        document.getElementById('btn-load')?.addEventListener('click', () => {
            audioManager.playSound('button');
            this.renderSaveLoad('load');
        });

        // Achievements button
        document.getElementById('btn-achievements')?.addEventListener('click', () => {
            audioManager.playSound('button');
            this.renderAchievements();
        });

        // Statistics button
        document.getElementById('btn-statistics')?.addEventListener('click', () => {
            audioManager.playSound('button');
            this.renderStatistics();
        });

        // Theme toggle
        document.getElementById('btn-theme')?.addEventListener('click', () => {
            audioManager.playSound('button');
            window.themeManager?.toggle();
            const btn = document.getElementById('btn-theme');
            if (btn) {
                btn.textContent = window.themeManager?.isDark() ? '☀️' : '🌙';
            }
        });

        // Sound toggle
        document.getElementById('btn-sound')?.addEventListener('click', () => {
            const muted = audioManager.toggleMute();
            const btn = document.getElementById('btn-sound');
            if (btn) {
                btn.textContent = muted ? '🔇' : '🔊';
            }
        });
    }

    renderHangar() {
        audioManager.crossfadeBGM('hangar');
        const hangar = new HangarScreen('ui-layer');
        hangar.render();
    }

    renderAchievements() {
        const achievements = new AchievementsScreen('ui-layer');
        achievements.render();
    }

    renderSaveLoad(mode = 'save') {
        const saveLoad = new SaveLoadScreen('ui-layer');
        saveLoad.render(mode);
    }

    renderStatistics() {
        const statistics = new StatisticsScreen('ui-layer');
        statistics.render();
    }

    renderMissionBoard() {
        const board = new MissionBoardScreen('ui-layer');
        board.render();
    }

    renderLaunch(missionData) {
        // ===== Sprint 3.3: 支援召喚任務 =====
        const isSummonMission = missionData?.isSummonMission || false;
        if (isSummonMission) {
            console.log('[Game] Starting summon mission launch for', missionData.characterId);
        }

        const launch = new LaunchScreen('ui-layer', missionData);
        launch.render();
    }

    renderInFlight(missionData) {
        audioManager.crossfadeBGM('flight');
        const flight = new InFlightScreen('ui-layer', missionData);
        flight.render();
    }

    renderArrival(missionData, flightScore) {
        console.log('[Game] Showing arrival animation');
        const arrival = new ArrivalScreen('ui-layer', missionData, flightScore);
        arrival.render();
    }

    renderTransformation(missionId, score) {
        this.flightScore = score;
        const tf = new TransformationScreen('ui-layer', missionId, async () => {
            // ===== 所有任務：Transform → Landing =====
            console.log('[Game] Transformation complete, going to Landing...');
            this.renderLanding(missionId);
        });
        tf.render();
    }

    // ❌ 已刪除：renderDialogue() - 對話系統已移除，等待重構
    // ❌ 已刪除：renderTask() - 任務系統已移除，等待重構

    async renderExploration(missionId) {
        console.log(`Rendering Exploration: ${missionId}`);
        const mission = gameState.activeMissions.find(m => m.id === missionId);

        if (!mission) {
            console.error(`[Game] Mission ${missionId} not found in active missions`);
            return;
        }

        // 從任務板來的 Mission 物件,轉換成探索模式需要的參數
        // 讓探索畫面重新生成 ExplorationMission
        const exploration = new ExplorationScreen('ui-layer', {
            destination: mission.location || 'paris',
            difficulty: mission.levelReq === 2 ? 'hard' : mission.levelReq === 1 ? 'normal' : 'easy',
            characterId: mission.assignedCharId || mission.assignedCharacter?.id,
            missionType: mission.type
            // generated: false (預設),讓探索畫面生成新的 ExplorationMission
        });

        await exploration.render();
    }

    /**
     * 從任務板啟動探索模式
     * (所有任務都使用探索模式)
     */
    async renderExplorationFromMissionBoard(missionData) {
        console.log('[Game] Launching exploration from mission board:', missionData);

        const exploration = new ExplorationScreen('ui-layer', {
            destination: missionData.destination,
            difficulty: missionData.difficulty,
            characterId: missionData.characterId,
            missionType: missionData.missionType,
            originalMission: missionData.originalMission
        });

        await exploration.render();
    }

    /**
     * 🆕 渲染探索模式（从零重建 - Phase 1 MVP）
     * 在完成 Launch→Flight→Transform→Landing 後調用
     */
    async renderExplorationMode(missionData) {
        console.log('[Game] Starting NEW exploration mode (Phase 1 MVP):', missionData);

        // 清理之前的 UI
        this.cleanupAllScreens();

        // 切换背景音乐
        audioManager.crossfadeBGM('exploration');

        // ===== 🆕 创建全新的探索画面並保存實例 =====
        this.currentExplorationScreen = new ExplorationScreen('ui-layer', missionData);
        await this.currentExplorationScreen.render();
    }

    /**
     * Clean up all UI panels and elements from previous screens
     */
    cleanupAllScreens() {
        console.log('[Game] Cleaning up all previous screen elements');

        const container = document.getElementById('ui-layer');
        if (!container) return;

        // Clear main container completely
        container.innerHTML = '';

        // Remove any floating panels that might have been added to body
        const selectorsToRemove = [
            '.landing-result',
            '.landing-hud',
            '.mission-overlay',
            '.flight-controls-hint',
            '.transformation-container',
            '.launch-hud',
            '.mission-board-container',
            '.hangar-container'
        ];

        selectorsToRemove.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        });

        // Remove any orphaned canvas elements
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            if (canvas.id !== 'ui-layer' && !canvas.closest('#ui-layer')) {
                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
            }
        });

        console.log('[Game] UI cleanup complete');
    }

    renderResults(resultData) {
        audioManager.crossfadeBGM('results');
        const results = new ResultsScreen('ui-layer', resultData);
        results.render();
    }

    renderLanding(missionData) {
        console.log('[Game] Rendering Landing: Manual Control');
        console.log('[Game] missionData:', missionData);
        console.log('[Game] missionData type:', typeof missionData);
        console.log('[Game] missionData.isSummonMission:', missionData?.isSummonMission);

        audioManager.crossfadeBGM('flight');

        // ===== Sprint 3.3: 支援召喚任務 =====
        const isSummonMission = missionData?.isSummonMission || false;
        console.log('[Game] Detected isSummonMission:', isSummonMission);

        if (isSummonMission) {
            console.log('[Game] Landing for summon mission:', missionData.characterId);
        } else {
            console.log('[Game] Landing for main mission');
        }

        const landing = new LandingScreen('ui-layer', missionData, isSummonMission);
        landing.render();
    }

    renderReturn(resultData) {
        const ret = new ReturnScreen('ui-layer', resultData, () => {
            this.renderHangar();
        });
        ret.render();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new GameApp();
});
