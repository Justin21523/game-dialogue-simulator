/**
 * PartnerSwitcher - 夥伴切換 UI 元件
 * 顯示在場夥伴、快速切換、呼叫新夥伴
 */

import { eventBus } from '../../core/event-bus.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';

export class PartnerSwitcher {
    constructor(container, partnerSystem, options = {}) {
        this.container = container;
        this.partnerSystem = partnerSystem;

        // 配置
        this.showCallMenu = options.showCallMenu ?? true;
        this.hotkeysEnabled = options.hotkeysEnabled ?? true;

        // 狀態
        this.isCallMenuOpen = false;
        this.selectedPartnerIndex = 0;

        // DOM 參考
        this.switcherElement = null;
        this.partnerSlots = [];
        this.callMenuElement = null;

        // AI 肖像快取
        this.portraitCache = new Map();

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        // 主容器
        this.switcherElement = document.createElement('div');
        this.switcherElement.className = 'partner-switcher';

        // 在場夥伴區
        const activeArea = document.createElement('div');
        activeArea.className = 'partner-active-area';
        activeArea.innerHTML = `
            <div class="partner-active-label">在場夥伴</div>
            <div class="partner-slots"></div>
        `;
        this.switcherElement.appendChild(activeArea);
        this.slotsContainer = activeArea.querySelector('.partner-slots');

        // 呼叫按鈕
        if (this.showCallMenu) {
            const callButton = document.createElement('button');
            callButton.className = 'partner-call-button';
            callButton.innerHTML = `
                <span class="call-icon">📞</span>
                <span class="call-text">呼叫夥伴</span>
                <kbd>Tab</kbd>
            `;
            callButton.addEventListener('click', () => this.toggleCallMenu());
            this.switcherElement.appendChild(callButton);
            this.callButton = callButton;
        }

        // 呼叫選單
        this.callMenuElement = document.createElement('div');
        this.callMenuElement.className = 'partner-call-menu hidden';
        this.callMenuElement.innerHTML = `
            <div class="call-menu-header">
                <span>呼叫夥伴</span>
                <button class="call-menu-close">✕</button>
            </div>
            <div class="call-menu-cooldown hidden">
                <div class="cooldown-bar"></div>
                <span class="cooldown-text"></span>
            </div>
            <div class="call-menu-grid"></div>
            <div class="call-menu-info">
                <p>選擇夥伴後將播放入場動畫</p>
            </div>
        `;
        this.switcherElement.appendChild(this.callMenuElement);

        this.container.appendChild(this.switcherElement);

        // 取得子元素參考
        this.callMenuGrid = this.callMenuElement.querySelector('.call-menu-grid');
        this.cooldownContainer = this.callMenuElement.querySelector('.call-menu-cooldown');
        this.cooldownBar = this.callMenuElement.querySelector('.cooldown-bar');
        this.cooldownText = this.callMenuElement.querySelector('.cooldown-text');

        // 關閉按鈕
        this.callMenuElement.querySelector('.call-menu-close').addEventListener('click', () => {
            this.closeCallMenu();
        });
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        // 夥伴事件
        eventBus.on('PARTNER_ARRIVED', () => this.refresh());
        eventBus.on('PARTNER_DISMISSED', () => this.refresh());
        eventBus.on('PLAYER_SWITCHED', (data) => this.onPlayerSwitched(data));
        eventBus.on('PARTNER_ARRIVAL_START', () => this.onArrivalStart());
        eventBus.on('PARTNER_ARRIVAL_END', () => this.onArrivalEnd());

        // 鍵盤快捷鍵
        if (this.hotkeysEnabled) {
            document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        }

        // 點擊外部關閉選單
        document.addEventListener('click', (e) => {
            if (this.isCallMenuOpen && !this.callMenuElement.contains(e.target) &&
                !this.callButton?.contains(e.target)) {
                this.closeCallMenu();
            }
        });
    }

    /**
     * 刷新顯示
     */
    refresh() {
        this.renderActivePartners();
        this.renderCallMenu();
        this.updateCallButton();
    }

    /**
     * 渲染在場夥伴
     */
    renderActivePartners() {
        this.slotsContainer.innerHTML = '';
        this.partnerSlots = [];

        const activePartners = this.partnerSystem.getActivePartners();
        const currentPlayer = this.partnerSystem.getCurrentPlayer();
        let index = 0;

        for (const [id, partner] of activePartners) {
            const charData = this.partnerSystem.getAvailableCharacters().get(id);
            const slot = this.createPartnerSlot(id, partner, charData, index);

            if (partner === currentPlayer) {
                slot.classList.add('active');
            }

            this.slotsContainer.appendChild(slot);
            this.partnerSlots.push(slot);
            index++;
        }
    }

    /**
     * 建立夥伴欄位
     */
    createPartnerSlot(characterId, partner, charData, index) {
        const slot = document.createElement('div');
        slot.className = 'partner-slot';
        slot.dataset.characterId = characterId;

        // 肖像
        const portrait = document.createElement('div');
        portrait.className = 'partner-portrait';
        portrait.style.backgroundColor = charData?.color || '#666';

        portrait.innerHTML = `<img src="${aiAssetManager.getCharacterPlaceholder(characterId)}" data-char-id="${characterId}" data-role="active-portrait" alt="${charData?.name || characterId}">`;
        this.loadPortrait(characterId, 'heroic', portrait.querySelector('img'));

        slot.appendChild(portrait);

        // 名稱
        const name = document.createElement('span');
        name.className = 'partner-name';
        name.textContent = charData?.name || characterId;
        slot.appendChild(name);

        // 快捷鍵
        const hotkey = document.createElement('kbd');
        hotkey.className = 'partner-hotkey';
        hotkey.textContent = (index + 1).toString();
        slot.appendChild(hotkey);

        // 狀態指示器
        const status = document.createElement('div');
        status.className = 'partner-status';
        if (partner.mode === 'flying') {
            status.innerHTML = '🛫';
            status.title = '飛行中';
        }
        slot.appendChild(status);

        // 點擊切換
        slot.addEventListener('click', () => {
            this.switchToPartner(characterId);
        });

        // 右鍵選單
        slot.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showPartnerContextMenu(characterId, e.clientX, e.clientY);
        });

        return slot;
    }

    /**
     * 渲染呼叫選單
     */
    renderCallMenu() {
        this.callMenuGrid.innerHTML = '';

        const callableCharacters = this.partnerSystem.getCallableCharacters();

        if (callableCharacters.length === 0) {
            this.callMenuGrid.innerHTML = `
                <p class="no-characters">沒有可呼叫的夥伴</p>
            `;
            return;
        }

        callableCharacters.forEach((char, index) => {
            const card = document.createElement('div');
            card.className = 'call-menu-card';
            card.dataset.characterId = char.id;

            card.innerHTML = `
                <div class="card-portrait" style="background-color: ${char.color || '#666'}">
                    <img src="${aiAssetManager.getCharacterPlaceholder(char.id)}" data-char-id="${char.id}" data-role="call-portrait" alt="${char.name}">
                </div>
                <div class="card-info">
                    <span class="card-name">${char.name}</span>
                    <span class="card-abilities">${this.formatAbilities(char.abilities)}</span>
                </div>
                <kbd class="card-hotkey">${index + 1}</kbd>
            `;

            card.addEventListener('click', () => {
                this.callPartner(char.id);
            });

            this.callMenuGrid.appendChild(card);

            const img = card.querySelector('img[data-role="call-portrait"]');
            this.loadPortrait(char.id, 'smile', img);
        });
    }

    /**
     * 格式化能力顯示
     */
    formatAbilities(abilities) {
        if (!abilities || abilities.length === 0) return '';
        return abilities.slice(0, 2).map(a => a.icon || '⚡').join(' ');
    }

    getPortraitKey(charId, variant) {
        return `${charId}:${variant}`;
    }

    getVariantContext(variant) {
        switch (variant) {
            case 'flying':
                return { action: 'flying', game_state: 'in_flight', context: 'partner switcher' };
            case 'smile':
                return { action: 'idle', emotion: 'happy', context: 'partner call menu' };
            case 'heroic':
            default:
                return { action: 'heroic_pose', emotion: 'confident', context: 'partner active slot' };
        }
    }

    async loadPortrait(charId, variant = 'heroic', targetImg = null) {
        if (!charId || !targetImg) return;
        const key = this.getPortraitKey(charId, variant);
        if (this.portraitCache.has(key)) {
            targetImg.src = this.portraitCache.get(key);
            return;
        }
        try {
            const { selection } = await aiAssetManager.preloadProfileImage(charId, this.getVariantContext(variant));
            const src = selection?.primary || aiAssetManager.getCharacterPlaceholder(charId);
            this.portraitCache.set(key, src);
            targetImg.src = src;
        } catch (e) {
            targetImg.src = aiAssetManager.getCharacterPlaceholder(charId);
        }
    }

    /**
     * 更新呼叫按鈕狀態
     */
    updateCallButton() {
        if (!this.callButton) return;

        const canCall = this.partnerSystem.canCallPartner();
        const cooldownRemaining = this.partnerSystem.getCallCooldownRemaining();

        if (cooldownRemaining > 0) {
            this.callButton.classList.add('on-cooldown');
            this.callButton.disabled = true;

            // 更新冷卻顯示
            this.cooldownContainer.classList.remove('hidden');
            const progress = 1 - (cooldownRemaining / this.partnerSystem.callCooldown);
            this.cooldownBar.style.width = `${progress * 100}%`;
            this.cooldownText.textContent = `${Math.ceil(cooldownRemaining / 1000)}秒`;
        } else {
            this.callButton.classList.remove('on-cooldown');
            this.callButton.disabled = !canCall;
            this.cooldownContainer.classList.add('hidden');
        }

        // 入場中
        if (this.partnerSystem.isArrivalInProgress()) {
            this.callButton.classList.add('arriving');
            this.callButton.disabled = true;
        } else {
            this.callButton.classList.remove('arriving');
        }
    }

    /**
     * 切換呼叫選單
     */
    toggleCallMenu() {
        if (this.isCallMenuOpen) {
            this.closeCallMenu();
        } else {
            this.openCallMenu();
        }
    }

    /**
     * 開啟呼叫選單
     */
    openCallMenu() {
        if (!this.partnerSystem.canCallPartner()) {
            eventBus.emit('SHOW_TOAST', {
                message: '目前無法呼叫夥伴',
                type: 'warning'
            });
            return;
        }

        this.renderCallMenu();
        this.callMenuElement.classList.remove('hidden');
        this.isCallMenuOpen = true;

        eventBus.emit('PARTNER_MENU_OPENED');
    }

    /**
     * 關閉呼叫選單
     */
    closeCallMenu() {
        this.callMenuElement.classList.add('hidden');
        this.isCallMenuOpen = false;

        eventBus.emit('PARTNER_MENU_CLOSED');
    }

    /**
     * 呼叫夥伴
     */
    async callPartner(characterId) {
        this.closeCallMenu();

        const success = await this.partnerSystem.callPartner(characterId);
        if (success) {
            this.refresh();
        }
    }

    /**
     * 切換到夥伴
     */
    switchToPartner(characterId) {
        const success = this.partnerSystem.switchTo(characterId);
        if (success) {
            this.updateActiveState(characterId);
        }
    }

    /**
     * 更新選中狀態
     */
    updateActiveState(activeId) {
        this.partnerSlots.forEach(slot => {
            if (slot.dataset.characterId === activeId) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        });
    }

    /**
     * 顯示夥伴右鍵選單
     */
    showPartnerContextMenu(characterId, x, y) {
        // 移除現有選單
        const existingMenu = document.querySelector('.partner-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'partner-context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const charData = this.partnerSystem.getAvailableCharacters().get(characterId);
        const isCurrentPlayer = this.partnerSystem.getCurrentPlayer()?.characterId === characterId;

        menu.innerHTML = `
            <div class="context-header">${charData?.name || characterId}</div>
            <button class="context-option" data-action="switch" ${isCurrentPlayer ? 'disabled' : ''}>
                切換控制
            </button>
            <button class="context-option" data-action="abilities">
                查看能力
            </button>
            <button class="context-option danger" data-action="dismiss" ${isCurrentPlayer ? 'disabled' : ''}>
                解散
            </button>
        `;

        // 事件處理
        menu.querySelectorAll('.context-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                switch (action) {
                    case 'switch':
                        this.switchToPartner(characterId);
                        break;
                    case 'abilities':
                        this.showAbilitiesPopup(characterId);
                        break;
                    case 'dismiss':
                        this.partnerSystem.dismissPartner(characterId);
                        break;
                }
                menu.remove();
            });
        });

        document.body.appendChild(menu);

        // 點擊外部關閉
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    /**
     * 顯示能力彈窗
     */
    showAbilitiesPopup(characterId) {
        const charData = this.partnerSystem.getAvailableCharacters().get(characterId);
        if (!charData) return;

        eventBus.emit('SHOW_ABILITIES_POPUP', {
            characterId: characterId,
            charData: charData
        });
    }

    /**
     * 入場開始回調
     */
    onArrivalStart() {
        this.updateCallButton();

        // 顯示入場中狀態
        const arrivingId = this.partnerSystem.getArrivingCharacter();
        if (arrivingId && this.callButton) {
            const charData = this.partnerSystem.getAvailableCharacters().get(arrivingId);
            this.callButton.querySelector('.call-text').textContent = `${charData?.name || '夥伴'} 正在入場...`;
        }
    }

    /**
     * 入場結束回調
     */
    onArrivalEnd() {
        this.refresh();
        if (this.callButton) {
            this.callButton.querySelector('.call-text').textContent = '呼叫夥伴';
        }
    }

    /**
     * 玩家切換回調
     */
    onPlayerSwitched(data) {
        this.updateActiveState(data.characterId);
    }

    /**
     * 處理鍵盤輸入
     */
    handleKeyDown(e) {
        // Tab 開啟呼叫選單
        if (e.key === 'Tab') {
            e.preventDefault();
            this.toggleCallMenu();
            return;
        }

        // 數字鍵切換夥伴
        if (e.key >= '1' && e.key <= '8') {
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            const index = parseInt(e.key) - 1;

            if (this.isCallMenuOpen) {
                // 選單開啟時，選擇呼叫角色
                const callableCharacters = this.partnerSystem.getCallableCharacters();
                if (index < callableCharacters.length) {
                    this.callPartner(callableCharacters[index].id);
                }
            } else {
                // 選單關閉時，切換在場夥伴
                const activePartners = Array.from(this.partnerSystem.getActivePartners().keys());
                if (index < activePartners.length) {
                    this.switchToPartner(activePartners[index]);
                }
            }
        }

        // Escape 關閉選單
        if (e.key === 'Escape' && this.isCallMenuOpen) {
            this.closeCallMenu();
        }
    }

    /**
     * 開始冷卻更新
     */
    startCooldownUpdate() {
        this.cooldownInterval = setInterval(() => {
            this.updateCallButton();
        }, 100);
    }

    /**
     * 停止冷卻更新
     */
    stopCooldownUpdate() {
        if (this.cooldownInterval) {
            clearInterval(this.cooldownInterval);
            this.cooldownInterval = null;
        }
    }

    /**
     * 顯示/隱藏元件
     */
    setVisible(visible) {
        if (visible) {
            this.switcherElement.classList.remove('hidden');
            this.startCooldownUpdate();
        } else {
            this.switcherElement.classList.add('hidden');
            this.stopCooldownUpdate();
        }
    }

    /**
     * 銷毀
     */
    dispose() {
        this.stopCooldownUpdate();

        if (this.switcherElement && this.switcherElement.parentNode) {
            this.switcherElement.parentNode.removeChild(this.switcherElement);
        }

        this.partnerSlots = [];
        this.partnerSystem = null;
    }
}
