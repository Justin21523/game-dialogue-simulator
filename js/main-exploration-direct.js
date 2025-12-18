/**
 * 直接進入探索模式的入口
 * 用於測試和開發，繞過主選單
 */

import { CONFIG } from './config.js';
import { gameState } from './core/game-state.js';
import { audioManager } from './core/audio-manager.js';
import { ExplorationScreen } from './ui/screens/exploration-new.js';
import { DebugOverlay } from './ui/debug-overlay.js';
import { initDebugPanel } from './ui/debug-panel.js';

// Load manager systems
import './core/theme-manager.js';
import './systems/statistics-tracker.js';
import './systems/save-manager.js';
import './systems/achievement-system.js';
import './core/image-selector-service.js';

console.log('========================================');
console.log('🚀 直接探索模式啟動器');
console.log('========================================');

class ExplorationDirectApp {
    constructor() {
        this.currentExplorationScreen = null;
        this.init();
    }

    async init() {
        console.log('[ExplorationDirect] 初始化核心系統...');

        // Initialize core systems
        gameState.init();

        // Initialize new systems
        window.themeManager?.init();
        window.statisticsTracker?.init();
        window.saveManager?.init();
        window.achievementSystem?.init();

        new DebugOverlay();
        initDebugPanel();

        console.log('[ExplorationDirect] ✅ 核心系統初始化完成');

        await this.loadResources();

        // 從 URL 讀取目的地參數
        const urlParams = new URLSearchParams(window.location.search);
        const destination = urlParams.get('destination') || 'paris';

        console.log(`[ExplorationDirect] 🌍 目的地: ${destination}`);
        console.log('[ExplorationDirect] 準備啟動探索模式...');

        // 直接啟動探索模式
        this.startExploration(destination);
    }

    async loadResources() {
        return new Promise(resolve => setTimeout(resolve, 500));
    }

    async startExploration(destination) {
        console.log(`[ExplorationDirect] 🚀 啟動探索模式: ${destination}`);

        // 清理 UI
        const container = document.getElementById('ui-layer');
        if (container) {
            container.innerHTML = '';
        }

        // 切換背景音樂
        try {
            audioManager.crossfadeBGM('exploration');
        } catch (e) {
            console.warn('[ExplorationDirect] 音樂切換失敗（可能需要用戶互動）:', e);
        }

        // 構造 missionData
        const missionData = {
            destination: destination,
            difficulty: 'normal',
            characterId: 'jett',
            missionType: 'delivery',
            generated: false
        };

        console.log('[ExplorationDirect] 📦 Mission Data:', missionData);

        // 創建探索畫面
        try {
            this.currentExplorationScreen = new ExplorationScreen('ui-layer', missionData);
            await this.currentExplorationScreen.render();
            console.log('[ExplorationDirect] ✅ 探索模式已啟動');

            // 保存到全域變數供除錯使用
            window.currentScreen = this.currentExplorationScreen;
            console.log('[ExplorationDirect] window.currentScreen 已設置');

        } catch (error) {
            console.error('[ExplorationDirect] ❌ 探索模式啟動失敗:', error);
            console.error('[ExplorationDirect] 錯誤堆疊:', error.stack);

            // 顯示錯誤訊息
            if (container) {
                container.innerHTML = `
                    <div style="
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: rgba(255, 0, 0, 0.9);
                        color: white;
                        padding: 30px;
                        border-radius: 10px;
                        font-family: monospace;
                        max-width: 600px;
                        z-index: 10000;
                    ">
                        <h2>❌ 探索模式啟動失敗</h2>
                        <pre>${error.message}</pre>
                        <p>請查看 Console (F12) 獲取詳細錯誤訊息</p>
                    </div>
                `;
            }
        }
    }
}

// 啟動應用
console.log('[ExplorationDirect] 創建應用實例...');
window.explorationApp = new ExplorationDirectApp();
console.log('[ExplorationDirect] ✅ 應用已創建');
