/**
 * AbilityBar - 能力快捷欄 UI 元件
 * 顯示當前角色的能力和冷卻狀態
 */

import { eventBus } from '../../core/event-bus.js';
import { ABILITY_DEFINITIONS } from '../../game/abilities/ability-definitions.js';

export class AbilityBar {
    constructor(container, abilitySystem, options = {}) {
        this.container = container;
        this.abilitySystem = abilitySystem;

        // 配置
        this.showPassives = options.showPassives ?? true;
        this.showHotkeys = options.showHotkeys ?? true;
        this.maxSlots = options.maxSlots ?? 4;

        // 當前角色
        this.currentCharacterId = null;
        this.abilities = [];

        // DOM 參考
        this.barElement = null;
        this.slots = [];
        this.tooltipElement = null;

        // 更新間隔
        this.updateInterval = null;

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        this.barElement = document.createElement('div');
        this.barElement.className = 'ability-bar';

        // 標題
        const header = document.createElement('div');
        header.className = 'ability-bar-header';
        header.innerHTML = `
            <span class="ability-bar-title">能力</span>
            <span class="character-indicator"></span>
        `;
        this.barElement.appendChild(header);
        this.characterIndicator = header.querySelector('.character-indicator');

        // 能力欄位容器
        const slotsContainer = document.createElement('div');
        slotsContainer.className = 'ability-slots';
        this.barElement.appendChild(slotsContainer);
        this.slotsContainer = slotsContainer;

        // 被動能力區
        if (this.showPassives) {
            const passivesContainer = document.createElement('div');
            passivesContainer.className = 'ability-passives';
            passivesContainer.innerHTML = `
                <span class="passives-label">被動</span>
                <div class="passives-list"></div>
            `;
            this.barElement.appendChild(passivesContainer);
            this.passivesList = passivesContainer.querySelector('.passives-list');
        }

        // 工具提示
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.className = 'ability-tooltip hidden';
        this.barElement.appendChild(this.tooltipElement);

        this.container.appendChild(this.barElement);
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        eventBus.on('PLAYER_SWITCHED', (data) => this.setCharacter(data.characterId));
        eventBus.on('ABILITY_USED', () => this.refresh());
        eventBus.on('ABILITY_COOLDOWN_START', () => this.refresh());
        eventBus.on('ABILITY_COOLDOWN_END', () => this.refresh());
        eventBus.on('ABILITY_ACTIVATED', () => this.refresh());
        eventBus.on('ABILITY_DEACTIVATED', () => this.refresh());

        // 鍵盤快捷鍵
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    /**
     * 設定當前角色
     * @param {string} characterId - 角色 ID
     */
    setCharacter(characterId) {
        this.currentCharacterId = characterId;
        this.abilities = ABILITY_DEFINITIONS[characterId] || [];

        // 更新指示器
        this.updateCharacterIndicator();

        // 渲染能力
        this.renderAbilities();

        // 開始更新冷卻
        this.startCooldownUpdate();
    }

    /**
     * 更新角色指示器
     */
    updateCharacterIndicator() {
        const characterColors = {
            jett: '#FF6B6B',
            donnie: '#FFD700',
            todd: '#8B4513',
            chase: '#4169E1',
            bello: '#FFFFFF',
            paul: '#1E90FF',
            flip: '#9B59B6',
            jerome: '#2ECC71'
        };

        const color = characterColors[this.currentCharacterId] || '#666';
        this.characterIndicator.style.backgroundColor = color;
        this.characterIndicator.title = this.currentCharacterId?.toUpperCase() || '';
    }

    /**
     * 渲染能力
     */
    renderAbilities() {
        this.slotsContainer.innerHTML = '';
        this.slots = [];

        // 分離主動和被動能力
        const activeAbilities = this.abilities.filter(a => a.type !== 'passive');
        const passiveAbilities = this.abilities.filter(a => a.type === 'passive');

        // 渲染主動能力
        activeAbilities.slice(0, this.maxSlots).forEach((ability, index) => {
            const slot = this.createAbilitySlot(ability, index);
            this.slotsContainer.appendChild(slot);
            this.slots.push(slot);
        });

        // 渲染被動能力
        if (this.showPassives && this.passivesList) {
            this.passivesList.innerHTML = '';
            passiveAbilities.forEach(ability => {
                const passive = this.createPassiveIndicator(ability);
                this.passivesList.appendChild(passive);
            });
        }
    }

    /**
     * 建立能力欄位
     */
    createAbilitySlot(ability, index) {
        const slot = document.createElement('div');
        slot.className = 'ability-slot';
        slot.dataset.abilityId = ability.id;

        // 圖示
        const icon = document.createElement('div');
        icon.className = 'ability-icon';
        icon.innerHTML = ability.icon || '⚡';
        slot.appendChild(icon);

        // 冷卻遮罩
        const cooldownMask = document.createElement('div');
        cooldownMask.className = 'cooldown-mask';
        slot.appendChild(cooldownMask);

        // 冷卻時間文字
        const cooldownText = document.createElement('span');
        cooldownText.className = 'cooldown-text hidden';
        slot.appendChild(cooldownText);

        // 啟用指示器 (toggle 能力)
        if (ability.type === 'toggle') {
            const activeIndicator = document.createElement('div');
            activeIndicator.className = 'active-indicator hidden';
            slot.appendChild(activeIndicator);
        }

        // 快捷鍵
        if (this.showHotkeys) {
            const hotkey = document.createElement('kbd');
            hotkey.className = 'ability-hotkey';
            hotkey.textContent = index === 0 ? 'Q' : (index === 1 ? 'W' : (index + 1).toString());
            slot.appendChild(hotkey);
        }

        // 事件
        slot.addEventListener('click', () => this.useAbility(ability.id));
        slot.addEventListener('mouseenter', (e) => this.showTooltip(ability, e.target));
        slot.addEventListener('mouseleave', () => this.hideTooltip());

        return slot;
    }

    /**
     * 建立被動指示器
     */
    createPassiveIndicator(ability) {
        const passive = document.createElement('div');
        passive.className = 'passive-indicator';
        passive.innerHTML = ability.icon || '✨';
        passive.title = `${ability.name}: ${ability.description}`;

        passive.addEventListener('mouseenter', (e) => this.showTooltip(ability, e.target));
        passive.addEventListener('mouseleave', () => this.hideTooltip());

        return passive;
    }

    /**
     * 使用能力
     */
    useAbility(abilityId) {
        if (!this.currentCharacterId) return;

        const state = this.abilitySystem.getAbilityState(this.currentCharacterId, abilityId);
        if (!state) return;

        if (state.isOnCooldown) {
            eventBus.emit('SHOW_TOAST', {
                message: `冷卻中 (${Math.ceil(state.cooldownRemaining / 1000)}秒)`,
                type: 'warning'
            });
            return;
        }

        eventBus.emit('USE_ABILITY', {
            characterId: this.currentCharacterId,
            abilityId: abilityId,
            context: {}
        });
    }

    /**
     * 刷新顯示
     */
    refresh() {
        this.updateCooldowns();
        this.updateActiveStates();
    }

    /**
     * 更新冷卻顯示
     */
    updateCooldowns() {
        const activeAbilities = this.abilities.filter(a => a.type !== 'passive');

        activeAbilities.slice(0, this.maxSlots).forEach((ability, index) => {
            const slot = this.slots[index];
            if (!slot) return;

            const state = this.abilitySystem.getAbilityState(this.currentCharacterId, ability.id);
            if (!state) return;

            const cooldownMask = slot.querySelector('.cooldown-mask');
            const cooldownText = slot.querySelector('.cooldown-text');

            if (state.isOnCooldown) {
                slot.classList.add('on-cooldown');

                // 更新遮罩
                const progress = 1 - state.cooldownProgress;
                cooldownMask.style.height = `${progress * 100}%`;

                // 更新文字
                const remaining = Math.ceil(state.cooldownRemaining / 1000);
                cooldownText.textContent = remaining;
                cooldownText.classList.remove('hidden');
            } else {
                slot.classList.remove('on-cooldown');
                cooldownMask.style.height = '0%';
                cooldownText.classList.add('hidden');
            }
        });
    }

    /**
     * 更新啟用狀態
     */
    updateActiveStates() {
        const activeAbilities = this.abilities.filter(a => a.type !== 'passive');

        activeAbilities.slice(0, this.maxSlots).forEach((ability, index) => {
            if (ability.type !== 'toggle') return;

            const slot = this.slots[index];
            if (!slot) return;

            const state = this.abilitySystem.getAbilityState(this.currentCharacterId, ability.id);
            const activeIndicator = slot.querySelector('.active-indicator');

            if (state?.isActive) {
                slot.classList.add('active');
                activeIndicator?.classList.remove('hidden');
            } else {
                slot.classList.remove('active');
                activeIndicator?.classList.add('hidden');
            }
        });
    }

    /**
     * 顯示工具提示
     */
    showTooltip(ability, element) {
        const state = this.abilitySystem?.getAbilityState(this.currentCharacterId, ability.id);

        let statusText = '';
        if (state?.isOnCooldown) {
            statusText = `<span class="tooltip-cooldown">冷卻中: ${Math.ceil(state.cooldownRemaining / 1000)}秒</span>`;
        } else if (state?.isActive) {
            statusText = `<span class="tooltip-active">啟用中</span>`;
        }

        this.tooltipElement.innerHTML = `
            <div class="tooltip-header">
                <span class="tooltip-icon">${ability.icon || '⚡'}</span>
                <span class="tooltip-name">${ability.name}</span>
                <span class="tooltip-type">${this.getTypeLabel(ability.type)}</span>
            </div>
            <p class="tooltip-description">${ability.description}</p>
            ${ability.cooldown ? `<p class="tooltip-cooldown-info">冷卻: ${ability.cooldown / 1000}秒</p>` : ''}
            ${ability.duration ? `<p class="tooltip-duration">持續: ${ability.duration / 1000}秒</p>` : ''}
            ${statusText}
        `;

        // 定位
        const rect = element.getBoundingClientRect();
        const barRect = this.barElement.getBoundingClientRect();

        this.tooltipElement.style.left = `${rect.left - barRect.left}px`;
        this.tooltipElement.style.bottom = `${barRect.bottom - rect.top + 10}px`;
        this.tooltipElement.classList.remove('hidden');
    }

    /**
     * 隱藏工具提示
     */
    hideTooltip() {
        this.tooltipElement.classList.add('hidden');
    }

    /**
     * 取得類型標籤
     */
    getTypeLabel(type) {
        const labels = {
            active: '主動',
            toggle: '切換',
            passive: '被動',
            world_interact: '互動'
        };
        return labels[type] || type;
    }

    /**
     * 處理鍵盤輸入
     */
    handleKeyDown(e) {
        if (!this.currentCharacterId) return;

        const activeAbilities = this.abilities.filter(a => a.type !== 'passive');

        // Q 鍵 - 第一個能力
        if (e.key === 'q' || e.key === 'Q') {
            if (activeAbilities[0]) {
                this.useAbility(activeAbilities[0].id);
            }
        }

        // W 鍵 - 第二個能力
        if (e.key === 'w' || e.key === 'W') {
            // 如果不是在輸入框中
            if (document.activeElement?.tagName !== 'INPUT' &&
                document.activeElement?.tagName !== 'TEXTAREA') {
                if (activeAbilities[1]) {
                    e.preventDefault();
                    this.useAbility(activeAbilities[1].id);
                }
            }
        }
    }

    /**
     * 開始冷卻更新
     */
    startCooldownUpdate() {
        this.stopCooldownUpdate();

        this.updateInterval = setInterval(() => {
            this.updateCooldowns();
        }, 100);
    }

    /**
     * 停止冷卻更新
     */
    stopCooldownUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * 顯示/隱藏
     */
    setVisible(visible) {
        if (visible) {
            this.barElement.classList.remove('hidden');
            this.startCooldownUpdate();
        } else {
            this.barElement.classList.add('hidden');
            this.stopCooldownUpdate();
        }
    }

    /**
     * 銷毀
     */
    dispose() {
        this.stopCooldownUpdate();

        if (this.barElement && this.barElement.parentNode) {
            this.barElement.parentNode.removeChild(this.barElement);
        }

        this.slots = [];
        this.abilitySystem = null;
    }
}
