/**
 * Debug Panel - 可伸縮的調試面板，用於快速跳轉到不同遊戲狀態
 */
import { gameState } from '../core/game-state.js';
import { eventBus } from '../core/event-bus.js';

export class DebugPanel {
    constructor() {
        this.isExpanded = false;
        this.isVisible = true;
        this.init();
    }

    init() {
        this.createPanel();
        this.attachEvents();

        // 監聽遊戲狀態變化
        eventBus.on('MISSION_STARTED', () => this.updateStatus());
        eventBus.on('MISSION_COMPLETED', () => this.updateStatus());
    }

    createPanel() {
        // 檢查是否已存在
        if (document.getElementById('debug-panel')) {
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.className = 'debug-panel collapsed';

        panel.innerHTML = `
            <div class="debug-panel-header">
                <button id="debug-toggle" class="debug-toggle-btn" title="展開/收起調試面板">
                    🐛 Debug
                </button>
            </div>
            <div class="debug-panel-content">
                <div class="debug-section">
                    <h4>🎮 Quick Jump</h4>
                    <div class="debug-character-selector">
                        <label style="color: #aaa; font-size: 11px; margin-bottom: 4px; display: block;">
                            Select Character:
                        </label>
                        <select id="debug-char-select" class="debug-select">
                            <option value="jett">Jett</option>
                            <option value="dizzy">Dizzy</option>
                            <option value="jerome">Jerome</option>
                            <option value="donnie">Donnie</option>
                            <option value="chase">Chase</option>
                            <option value="flip">Flip</option>
                            <option value="todd">Todd</option>
                            <option value="paul">Paul</option>
                            <option value="bello">Bello</option>
                        </select>
                    </div>
                    <div class="debug-buttons" style="margin-top: 8px;">
                        <button class="debug-btn" data-action="jump-exploration-quick">
                            🚀 Jump to Exploration
                        </button>
                        <button class="debug-btn" data-action="jump-exploration-with-partners">
                            👥 Jump to Exploration (With Partners)
                        </button>
                        <button class="debug-btn" data-action="jump-hangar">
                            🏠 Hangar
                        </button>
                        <button class="debug-btn" data-action="jump-mission-board">
                            🌍 Mission Board
                        </button>
                        <button class="debug-btn" data-action="jump-flight">
                            ✈️ Flight Mode
                        </button>
                    </div>
                </div>

                <div class="debug-section">
                    <h4>⚙️ Game State</h4>
                    <div id="debug-status" class="debug-status">
                        <div class="status-item">
                            <span class="status-label">Money:</span>
                            <span class="status-value">${gameState.resources.money}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label">Fuel:</span>
                            <span class="status-value">${gameState.resources.fuel}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label">Active Missions:</span>
                            <span class="status-value">${gameState.activeMissions.length}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label">Characters:</span>
                            <span class="status-value">${gameState.getAllCharacters().length}</span>
                        </div>
                    </div>
                </div>

                <div class="debug-section">
                    <h4>🧪 Test Actions</h4>
                    <div class="debug-buttons">
                        <button class="debug-btn" data-action="add-money">
                            💰 +1000 Money
                        </button>
                        <button class="debug-btn" data-action="add-fuel">
                            ⛽ +50 Fuel
                        </button>
                        <button class="debug-btn" data-action="reset-resources">
                            🔄 Reset Resources
                        </button>
                        <button class="debug-btn" data-action="unlock-all-chars">
                            🔓 Unlock All Characters
                        </button>
                    </div>
                </div>

                <div class="debug-section">
                    <h4>📊 Console Log</h4>
                    <div id="debug-log" class="debug-log">
                        <div class="log-entry">Debug panel initialized</div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('debug-panel-styles')) return;

        const style = document.createElement('style');
        style.id = 'debug-panel-styles';
        style.textContent = `
            .debug-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.9);
                border: 2px solid #446DFF;
                border-radius: 8px;
                color: white;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                max-width: 350px;
                transition: all 0.3s ease;
            }

            .debug-panel.collapsed .debug-panel-content {
                display: none;
            }

            .debug-panel.hidden {
                display: none;
            }

            .debug-panel-header {
                padding: 8px;
                background: #446DFF;
                border-radius: 6px 6px 0 0;
                cursor: move;
            }

            .debug-toggle-btn {
                background: transparent;
                border: none;
                color: white;
                font-weight: bold;
                cursor: pointer;
                font-size: 14px;
                width: 100%;
                text-align: left;
                padding: 4px;
            }

            .debug-toggle-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
            }

            .debug-panel-content {
                padding: 12px;
                max-height: 70vh;
                overflow-y: auto;
            }

            .debug-section {
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
            }

            .debug-section:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }

            .debug-section h4 {
                margin: 0 0 8px 0;
                color: #446DFF;
                font-size: 13px;
            }

            .debug-buttons {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .debug-btn {
                padding: 8px 12px;
                background: #2a2a2a;
                border: 1px solid #555;
                border-radius: 4px;
                color: white;
                cursor: pointer;
                font-size: 12px;
                text-align: left;
                transition: all 0.2s ease;
            }

            .debug-btn:hover {
                background: #446DFF;
                border-color: #446DFF;
                transform: translateX(4px);
            }

            .debug-btn:active {
                transform: translateX(2px);
            }

            .debug-select {
                width: 100%;
                padding: 8px 12px;
                background: #2a2a2a;
                border: 1px solid #555;
                border-radius: 4px;
                color: white;
                cursor: pointer;
                font-size: 12px;
                font-family: 'Courier New', monospace;
                transition: all 0.2s ease;
            }

            .debug-select:hover {
                border-color: #446DFF;
                background: #333;
            }

            .debug-select:focus {
                outline: none;
                border-color: #446DFF;
                box-shadow: 0 0 0 2px rgba(68, 109, 255, 0.2);
            }

            .debug-character-selector {
                margin-bottom: 8px;
            }

            .debug-status {
                background: #1a1a1a;
                padding: 8px;
                border-radius: 4px;
            }

            .status-item {
                display: flex;
                justify-content: space-between;
                padding: 4px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .status-item:last-child {
                border-bottom: none;
            }

            .status-label {
                color: #aaa;
            }

            .status-value {
                color: #4af;
                font-weight: bold;
            }

            .debug-log {
                background: #1a1a1a;
                padding: 8px;
                border-radius: 4px;
                max-height: 150px;
                overflow-y: auto;
                font-size: 11px;
            }

            .log-entry {
                padding: 2px 0;
                color: #aaa;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            .log-entry:last-child {
                border-bottom: none;
            }

            .log-entry.error {
                color: #ff4444;
            }

            .log-entry.success {
                color: #44ff44;
            }

            .log-entry.warning {
                color: #ffaa44;
            }

            /* Scrollbar styles */
            .debug-panel-content::-webkit-scrollbar,
            .debug-log::-webkit-scrollbar {
                width: 6px;
            }

            .debug-panel-content::-webkit-scrollbar-track,
            .debug-log::-webkit-scrollbar-track {
                background: #1a1a1a;
            }

            .debug-panel-content::-webkit-scrollbar-thumb,
            .debug-log::-webkit-scrollbar-thumb {
                background: #446DFF;
                border-radius: 3px;
            }
        `;
        document.head.appendChild(style);
    }

    attachEvents() {
        const panel = document.getElementById('debug-panel');
        if (!panel) return;

        // Toggle collapse/expand
        const toggleBtn = document.getElementById('debug-toggle');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Action buttons
        panel.querySelectorAll('.debug-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                this.handleAction(action);
            });
        });

        // Make draggable
        this.makeDraggable(panel);

        // Keyboard shortcut: Ctrl+Shift+D to toggle visibility
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.toggleVisibility();
            }
        });
    }

    toggle() {
        const panel = document.getElementById('debug-panel');
        if (!panel) return;

        this.isExpanded = !this.isExpanded;
        panel.classList.toggle('collapsed', !this.isExpanded);

        this.log(this.isExpanded ? 'Panel expanded' : 'Panel collapsed');
    }

    toggleVisibility() {
        const panel = document.getElementById('debug-panel');
        if (!panel) return;

        this.isVisible = !this.isVisible;
        panel.classList.toggle('hidden', !this.isVisible);

        console.log(`[DebugPanel] Visibility: ${this.isVisible}`);
    }

    async handleAction(action) {
        this.log(`Executing: ${action}`, 'info');

        try {
            switch (action) {
                case 'jump-exploration-quick':
                    await this.jumpToExplorationQuick();
                    break;

                case 'jump-exploration-with-partners':
                    await this.jumpToExplorationWithPartners();
                    break;

                case 'jump-hangar':
                    window.game?.renderHangar();
                    this.log('Jumped to Hangar', 'success');
                    break;

                case 'jump-mission-board':
                    window.game?.renderMissionBoard();
                    this.log('Jumped to Mission Board', 'success');
                    break;

                case 'jump-flight':
                    await this.jumpToFlight();
                    break;

                case 'add-money':
                    gameState.addMoney(1000);
                    this.updateStatus();
                    this.log('Added 1000 money', 'success');
                    break;

                case 'add-fuel':
                    gameState.addFuel(50);
                    this.updateStatus();
                    this.log('Added 50 fuel', 'success');
                    break;

                case 'reset-resources':
                    gameState.resources.money = 1000;
                    gameState.resources.fuel = 100;
                    this.updateStatus();
                    this.log('Resources reset', 'success');
                    break;

                case 'unlock-all-chars':
                    this.unlockAllCharacters();
                    this.log('All characters unlocked', 'success');
                    break;

                default:
                    this.log(`Unknown action: ${action}`, 'error');
            }
        } catch (error) {
            console.error('[DebugPanel] Action error:', error);
            this.log(`Error: ${error.message}`, 'error');
        }
    }

    async jumpToExplorationQuick() {
        // Get selected character from dropdown
        const charSelect = document.getElementById('debug-char-select');
        const characterId = charSelect ? charSelect.value : 'jett';

        console.log('[DebugPanel] ===== Quick Jump to Exploration =====');
        console.log('[DebugPanel] Selected character dropdown value:', charSelect?.value);
        console.log('[DebugPanel] Character ID to use:', characterId);

        this.log(`Jumping to exploration with: ${characterId}`, 'info');

        // Create a test mission data directly
        const testMissionData = {
            id: `test_mission_${characterId}_${Date.now()}`,
            type: 'Delivery',
            title: `Test Mission - ${characterId}`,
            description: `Debug test mission for ${characterId}`,
            destination: 'Paris',
            location: 'Paris',
            difficulty: 'normal',
            characterId: characterId,
            assignedCharId: characterId,
            reward: { money: 100, exp: 50 },
            isDebugMission: true,
            useNewArrivalSystem: true
        };

        console.log('[DebugPanel] Test mission data created:', testMissionData);
        console.log('[DebugPanel] testMissionData.characterId:', testMissionData.characterId);
        console.log('[DebugPanel] testMissionData.assignedCharId:', testMissionData.assignedCharId);

        // Ensure character is unlocked
        const character = gameState.getCharacter(characterId);
        if (character) {
            // Only set properties that are writable
            character.isUnlocked = true;
            // isAvailable is a getter, so we don't set it directly
            console.log('[DebugPanel] Character data:', character);
            console.log('[DebugPanel] Character isAvailable:', character.isAvailable);
            this.log(`✓ Character found: ${character.name || characterId}`, 'success');
        } else {
            console.error('[DebugPanel] Character not found in gameState:', characterId);
            this.log(`✗ Character not found: ${characterId}`, 'error');
        }

        // Add fuel if needed
        if (gameState.resources.fuel < 20) {
            gameState.addFuel(50);
            this.log('Added fuel for testing', 'warning');
        }

        // Jump directly to exploration mode (skip Launch/Flight/Transform/Landing)
        if (window.game && typeof window.game.renderExplorationMode === 'function') {
            console.log('[DebugPanel] Calling window.game.renderExplorationMode()...');
            this.log(`Starting exploration with ${characterId}...`, 'info');

            await window.game.renderExplorationMode(testMissionData);

            console.log('[DebugPanel] renderExplorationMode completed');
            this.log('✅ Exploration mode loaded!', 'success');

            // 驗證當前探索畫面的角色
            setTimeout(() => {
                if (window.game.currentExplorationScreen) {
                    const screen = window.game.currentExplorationScreen;
                    console.log('[DebugPanel] Verification - Player characterId:', screen.player?.characterId);
                    console.log('[DebugPanel] Verification - Player image:', screen.player?.image?.src);
                    this.log(`Verification: Player is ${screen.player?.characterId}`, screen.player?.characterId === characterId ? 'success' : 'error');
                }
            }, 500);
        } else {
            console.error('[DebugPanel] game.renderExplorationMode not available');
            this.log('❌ game.renderExplorationMode not available', 'error');
        }
    }

    async jumpToExplorationWithPartners() {
        // Get selected character from dropdown
        const charSelect = document.getElementById('debug-char-select');
        const characterId = charSelect ? charSelect.value : 'jett';

        console.log('[DebugPanel] ===== Jump to Exploration With Partners =====');
        console.log('[DebugPanel] Main character:', characterId);

        this.log(`Starting exploration with ${characterId} + partners...`, 'info');

        // Create test mission data
        const testMissionData = {
            id: `test_mission_partners_${characterId}_${Date.now()}`,
            type: 'Delivery',
            title: `Test Mission - ${characterId} with Partners`,
            description: `Debug test mission with partners`,
            destination: 'Paris',
            location: 'Paris',
            difficulty: 'normal',
            characterId: characterId,
            assignedCharId: characterId,
            reward: { money: 100, exp: 50 },
            isDebugMission: true,
            useNewArrivalSystem: true
        };

        // Ensure character is unlocked
        const character = gameState.getCharacter(characterId);
        if (character) {
            character.isUnlocked = true;
            this.log(`✓ Main character: ${character.name || characterId}`, 'success');
        }

        // Add fuel if needed
        if (gameState.resources.fuel < 20) {
            gameState.addFuel(50);
        }

        // Jump to exploration mode
        if (window.game && typeof window.game.renderExplorationMode === 'function') {
            console.log('[DebugPanel] Calling renderExplorationMode()...');
            await window.game.renderExplorationMode(testMissionData);

            // Wait for exploration screen to be ready
            await new Promise(resolve => setTimeout(resolve, 500));

            // Get all available partner characters (exclude main character)
            const allCharacters = ['jett', 'dizzy', 'jerome', 'donnie', 'chase', 'flip', 'todd', 'paul', 'bello'];
            const availablePartners = allCharacters.filter(id => id !== characterId);

            // Select 2 random partners
            const partner1Id = availablePartners[Math.floor(Math.random() * availablePartners.length)];
            const remainingPartners = availablePartners.filter(id => id !== partner1Id);
            const partner2Id = remainingPartners[Math.floor(Math.random() * remainingPartners.length)];

            console.log('[DebugPanel] Selected partners:', partner1Id, partner2Id);
            this.log(`Adding partners: ${partner1Id}, ${partner2Id}`, 'info');

            // Add partners directly to exploration screen
            if (window.game.currentExplorationScreen) {
                const screen = window.game.currentExplorationScreen;

                // Add partner 1
                screen.addPartnerToScene(partner1Id);
                this.log(`✓ Added partner: ${partner1Id}`, 'success');

                // Wait a bit before adding partner 2
                await new Promise(resolve => setTimeout(resolve, 300));

                // Add partner 2
                screen.addPartnerToScene(partner2Id);
                this.log(`✓ Added partner: ${partner2Id}`, 'success');

                // Update partner list UI
                screen.updatePartnerListUI();

                this.log('✅ Exploration mode loaded with partners!', 'success');
            } else {
                console.error('[DebugPanel] currentExplorationScreen not available');
                this.log('❌ Could not access exploration screen', 'error');
            }
        } else {
            console.error('[DebugPanel] game.renderExplorationMode not available');
            this.log('❌ game.renderExplorationMode not available', 'error');
        }
    }

    async jumpToFlight() {
        // 確保有任務
        let mission = gameState.activeMissions[0];

        if (!mission) {
            await gameState.refreshMissions();
            mission = gameState.availableMissions[0];
            const character = gameState.getAllCharacters()[0];
            await gameState.startMission(mission.id, character.id);
            mission = gameState.activeMissions[0];
        }

        if (mission && window.game) {
            window.game.renderInFlight(mission.id);
            this.log('Flight mode loaded', 'success');
        } else {
            this.log('Cannot jump to flight', 'error');
        }
    }

    unlockAllCharacters() {
        const characters = gameState.getAllCharacters();
        characters.forEach(char => {
            char.isUnlocked = true;
            char.isAvailable = true;
        });
        this.updateStatus();
    }

    updateStatus() {
        const statusEl = document.getElementById('debug-status');
        if (!statusEl) return;

        statusEl.innerHTML = `
            <div class="status-item">
                <span class="status-label">Money:</span>
                <span class="status-value">${gameState.resources.money}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Fuel:</span>
                <span class="status-value">${gameState.resources.fuel}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Active Missions:</span>
                <span class="status-value">${gameState.activeMissions.length}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Characters:</span>
                <span class="status-value">${gameState.getAllCharacters().length}</span>
            </div>
        `;
    }

    log(message, type = 'info') {
        const logEl = document.getElementById('debug-log');
        if (!logEl) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

        logEl.appendChild(entry);
        logEl.scrollTop = logEl.scrollHeight;

        // Keep only last 50 entries
        while (logEl.children.length > 50) {
            logEl.removeChild(logEl.firstChild);
        }

        console.log(`[DebugPanel] ${message}`);
    }

    makeDraggable(element) {
        const header = element.querySelector('.debug-panel-header');
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target.closest('.debug-toggle-btn')) return;

            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            if (e.target === header || e.target.closest('.debug-panel-header')) {
                isDragging = true;
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                xOffset = currentX;
                yOffset = currentY;

                setTranslate(currentX, currentY, element);
            }
        }

        function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        }

        function setTranslate(xPos, yPos, el) {
            el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
        }
    }
}

// Auto-initialize when loaded
let debugPanel = null;

export function initDebugPanel() {
    if (!debugPanel) {
        debugPanel = new DebugPanel();
        console.log('[DebugPanel] Initialized (Ctrl+Shift+D to toggle visibility)');
    }
    return debugPanel;
}

// Auto-init if in development mode
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.addEventListener('DOMContentLoaded', () => {
        initDebugPanel();
    });
}
