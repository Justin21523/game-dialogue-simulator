/**
 * CharacterSwitcherUI - 角色切換視覺指示器
 *
 * 功能：
 * - 顯示所有在場夥伴的縮圖
 * - 高亮當前控制的角色
 * - 顯示 Q/E 快捷鍵提示
 * - 支援點擊切換角色
 */

import { eventBus } from '../../core/event-bus.js';

export class CharacterSwitcherUI {
    constructor(container, options = {}) {
        this.container = container;

        // 配置
        this.showKeyHints = options.showKeyHints ?? true;
        this.allowClickSwitch = options.allowClickSwitch ?? true;
        this.maxVisible = options.maxVisible ?? 8;

        // 狀態
        this.activePartners = new Map();
        this.currentCharacterId = null;

        // DOM 參考
        this.switcherElement = null;
        this.partnersList = null;
        this.keyHintsElement = null;

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        this.switcherElement = document.createElement('div');
        this.switcherElement.className = 'character-switcher-ui';

        this.switcherElement.innerHTML = `
            <div class="switcher-header">
                <span class="switcher-title">Active Team</span>
                <span class="partner-count">0/∞</span>
            </div>

            <div class="partners-list"></div>

            <div class="key-hints ${this.showKeyHints ? '' : 'hidden'}">
                <div class="hint-item">
                    <kbd>Q</kbd>
                    <span>Previous</span>
                </div>
                <div class="hint-item">
                    <kbd>E</kbd>
                    <span>Next</span>
                </div>
                <div class="hint-item">
                    <kbd>1-8</kbd>
                    <span>Direct</span>
                </div>
            </div>
        `;

        this.container.appendChild(this.switcherElement);

        // 獲取 DOM 元素參考
        this.partnersList = this.switcherElement.querySelector('.partners-list');
        this.partnerCount = this.switcherElement.querySelector('.partner-count');
        this.keyHintsElement = this.switcherElement.querySelector('.key-hints');
    }

    /**
     * 設定事件監聽器
     */
    setupEventListeners() {
        // 夥伴召喚
        eventBus.on('PARTNER_CALLED', (data) => {
            this.addPartner(data.characterId, data.partner);
        });

        // 夥伴解散
        eventBus.on('PARTNER_DISMISSED', (data) => {
            this.removePartner(data.characterId);
        });

        // 角色切換
        eventBus.on('PARTNER_SWITCHED', (data) => {
            this.setCurrentCharacter(data.characterId);
        });

        // 初始玩家
        eventBus.on('EXPLORATION_STARTED', (data) => {
            if (data.player) {
                this.addPartner(data.player.characterId, data.player);
                this.setCurrentCharacter(data.player.characterId);
            }
        });
    }

    /**
     * 添加夥伴
     */
    addPartner(characterId, partner) {
        if (this.activePartners.has(characterId)) {
            return; // Already exists
        }

        this.activePartners.set(characterId, partner);
        this.updatePartnersList();
    }

    /**
     * 移除夥伴
     */
    removePartner(characterId) {
        if (!this.activePartners.has(characterId)) {
            return;
        }

        this.activePartners.delete(characterId);
        this.updatePartnersList();
    }

    /**
     * 設定當前控制角色
     */
    setCurrentCharacter(characterId) {
        this.currentCharacterId = characterId;
        this.updatePartnersList();
    }

    /**
     * 更新夥伴列表顯示
     */
    updatePartnersList() {
        this.partnersList.innerHTML = '';

        const partners = Array.from(this.activePartners.entries());

        // 更新數量顯示
        this.partnerCount.textContent = `${partners.length}/∞`;

        // 顯示夥伴圖標
        partners.forEach(([characterId, partner], index) => {
            const partnerElement = this.createPartnerElement(characterId, partner, index + 1);
            this.partnersList.appendChild(partnerElement);
        });

        // 滾動到當前角色
        this.scrollToCurrentCharacter();
    }

    /**
     * 創建夥伴元素
     */
    createPartnerElement(characterId, partner, position) {
        const div = document.createElement('div');
        div.className = 'partner-item';
        div.dataset.characterId = characterId;

        // 當前控制角色高亮
        const isCurrent = characterId === this.currentCharacterId;
        if (isCurrent) {
            div.classList.add('current');
        }

        // 獲取角色顏色（如果有）
        const color = this.getCharacterColor(characterId);

        // 數字快捷鍵（只顯示前 8 個）
        const numberHint = position <= 8 ? `<span class="number-hint">${position}</span>` : '';

        div.innerHTML = `
            <div class="partner-portrait" style="border-color: ${color}">
                <img src="assets/images/characters/${characterId}/portrait.png"
                     alt="${characterId}"
                     onerror="this.src='assets/images/characters/default-portrait.png'">
                ${numberHint}
            </div>
            <div class="partner-info">
                <span class="partner-name">${this.getCharacterName(characterId)}</span>
                ${isCurrent ? '<span class="current-indicator">●</span>' : ''}
            </div>
        `;

        // 點擊切換（如果啟用）
        if (this.allowClickSwitch) {
            div.addEventListener('click', () => {
                this.requestSwitch(characterId);
            });
            div.classList.add('clickable');
        }

        return div;
    }

    /**
     * 獲取角色顏色
     */
    getCharacterColor(characterId) {
        const colors = {
            'jett': '#ff0000',
            'jerome': '#ffcc00',
            'donnie': '#ff6600',
            'chase': '#0066ff',
            'paul': '#000000',
            'bello': '#ffc0cb',
            'flip': '#00ccff',
            'todd': '#996633'
        };
        return colors[characterId] || '#888888';
    }

    /**
     * 獲取角色名稱
     */
    getCharacterName(characterId) {
        const names = {
            'jett': 'Jett',
            'jerome': 'Jerome',
            'donnie': 'Donnie',
            'chase': 'Chase',
            'paul': 'Paul',
            'bello': 'Bello',
            'flip': 'Flip',
            'todd': 'Todd'
        };
        return names[characterId] || characterId;
    }

    /**
     * 請求切換角色
     */
    requestSwitch(characterId) {
        if (characterId === this.currentCharacterId) {
            return; // Already current
        }

        // 發送切換事件
        eventBus.emit('REQUEST_SWITCH_CHARACTER', { characterId });
    }

    /**
     * 滾動到當前角色
     */
    scrollToCurrentCharacter() {
        const currentElement = this.partnersList.querySelector('.partner-item.current');
        if (currentElement) {
            currentElement.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }

    /**
     * 顯示/隱藏快捷鍵提示
     */
    toggleKeyHints(show) {
        if (show === undefined) {
            this.keyHintsElement.classList.toggle('hidden');
        } else {
            this.keyHintsElement.classList.toggle('hidden', !show);
        }
    }

    /**
     * 顯示切換動畫
     */
    showSwitchAnimation() {
        const currentElement = this.partnersList.querySelector('.partner-item.current');
        if (currentElement) {
            currentElement.classList.add('switch-animation');
            setTimeout(() => {
                currentElement.classList.remove('switch-animation');
            }, 500);
        }
    }

    /**
     * 清除所有夥伴
     */
    clear() {
        this.activePartners.clear();
        this.currentCharacterId = null;
        this.updatePartnersList();
    }

    /**
     * 銷毀
     */
    destroy() {
        eventBus.off('PARTNER_CALLED');
        eventBus.off('PARTNER_DISMISSED');
        eventBus.off('PARTNER_SWITCHED');
        eventBus.off('EXPLORATION_STARTED');

        if (this.switcherElement) {
            this.switcherElement.remove();
        }
    }
}
