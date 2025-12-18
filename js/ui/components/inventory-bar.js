/**
 * InventoryBar - 物品欄 UI 元件
 * 顯示和管理玩家收集的物品
 */

import { eventBus } from '../../core/event-bus.js';

export class InventoryBar {
    constructor(container, options = {}) {
        this.container = container;

        // 配置
        this.slotCount = options.slotCount ?? 10;
        this.slotSize = options.slotSize ?? 48;
        this.showHotkeys = options.showHotkeys ?? true;

        // 物品欄資料
        this.items = [];
        this.maxItems = options.maxItems ?? 50;

        // 選中狀態
        this.selectedIndex = -1;

        // DOM 參考
        this.barElement = null;
        this.slots = [];
        this.tooltipElement = null;

        // 拖放狀態
        this.isDragging = false;
        this.dragItem = null;
        this.dragStartIndex = -1;

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        // 主容器
        this.barElement = document.createElement('div');
        this.barElement.className = 'inventory-bar';

        // 物品欄標題
        const header = document.createElement('div');
        header.className = 'inventory-header';
        header.innerHTML = `
            <span class="inventory-title">物品欄</span>
            <span class="inventory-count">0/${this.maxItems}</span>
        `;
        this.barElement.appendChild(header);

        // 快捷欄
        const quickBar = document.createElement('div');
        quickBar.className = 'inventory-quick-bar';

        for (let i = 0; i < this.slotCount; i++) {
            const slot = this.createSlot(i);
            quickBar.appendChild(slot);
            this.slots.push(slot);
        }

        this.barElement.appendChild(quickBar);

        // 工具提示
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.className = 'inventory-tooltip hidden';
        this.barElement.appendChild(this.tooltipElement);

        // 展開按鈕
        const expandButton = document.createElement('button');
        expandButton.className = 'inventory-expand';
        expandButton.innerHTML = '▼';
        expandButton.title = '展開物品欄';
        expandButton.addEventListener('click', () => this.toggleExpanded());
        this.barElement.appendChild(expandButton);

        // 完整物品欄（隱藏）
        this.fullInventory = document.createElement('div');
        this.fullInventory.className = 'inventory-full hidden';
        this.barElement.appendChild(this.fullInventory);

        this.container.appendChild(this.barElement);
        this.countElement = header.querySelector('.inventory-count');
    }

    /**
     * 建立單一欄位
     */
    createSlot(index) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot empty';
        slot.dataset.index = index;

        // 快捷鍵標籤
        if (this.showHotkeys) {
            const hotkey = document.createElement('span');
            hotkey.className = 'slot-hotkey';
            hotkey.textContent = index === 9 ? '0' : (index + 1).toString();
            slot.appendChild(hotkey);
        }

        // 物品圖示容器
        const iconContainer = document.createElement('div');
        iconContainer.className = 'slot-icon';
        slot.appendChild(iconContainer);

        // 數量標籤
        const quantity = document.createElement('span');
        quantity.className = 'slot-quantity hidden';
        slot.appendChild(quantity);

        // 任務標記
        const questMark = document.createElement('span');
        questMark.className = 'slot-quest-mark hidden';
        questMark.textContent = '!';
        slot.appendChild(questMark);

        // 事件
        slot.addEventListener('click', (e) => this.onSlotClick(index, e));
        slot.addEventListener('mouseenter', (e) => this.onSlotHover(index, e));
        slot.addEventListener('mouseleave', () => this.hideTooltip());
        slot.addEventListener('contextmenu', (e) => this.onSlotRightClick(index, e));

        // 拖放
        slot.draggable = true;
        slot.addEventListener('dragstart', (e) => this.onDragStart(index, e));
        slot.addEventListener('dragover', (e) => this.onDragOver(index, e));
        slot.addEventListener('drop', (e) => this.onDrop(index, e));
        slot.addEventListener('dragend', () => this.onDragEnd());

        return slot;
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        // 物品事件
        eventBus.on('ITEM_COLLECTED', (data) => this.addItem(data.item));
        eventBus.on('ITEM_USED', (data) => this.removeItem(data.itemId, data.quantity || 1));
        eventBus.on('ITEM_DELIVERED', (data) => this.removeItem(data.itemId, 1));
        eventBus.on('CLEAR_INVENTORY', () => this.clear());

        // 請求物品欄
        eventBus.on('GET_PLAYER_INVENTORY', (data) => {
            if (data.callback) {
                data.callback(this.items);
            }
        });

        // 鍵盤快捷鍵
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    /**
     * 添加物品
     * @param {Object} item - 物品資料
     * @returns {boolean} 是否成功添加
     */
    addItem(item) {
        // 檢查是否已滿
        if (this.getTotalItemCount() >= this.maxItems) {
            eventBus.emit('SHOW_TOAST', {
                message: '物品欄已滿',
                type: 'warning'
            });
            return false;
        }

        // 嘗試堆疊
        if (item.stackable) {
            const existingIndex = this.items.findIndex(i =>
                i && i.id === item.id && i.quantity < i.maxStack
            );

            if (existingIndex !== -1) {
                const existing = this.items[existingIndex];
                const addAmount = Math.min(item.quantity, existing.maxStack - existing.quantity);
                existing.quantity += addAmount;

                if (addAmount < item.quantity) {
                    // 剩餘的放到新欄位
                    const remaining = { ...item, quantity: item.quantity - addAmount };
                    this.addToEmptySlot(remaining);
                }

                this.updateSlot(existingIndex);
                this.updateCount();
                return true;
            }
        }

        // 放到新欄位
        return this.addToEmptySlot(item);
    }

    /**
     * 添加到空欄位
     */
    addToEmptySlot(item) {
        const emptyIndex = this.items.findIndex(i => !i);
        const targetIndex = emptyIndex !== -1 ? emptyIndex : this.items.length;

        if (targetIndex >= this.maxItems) {
            return false;
        }

        this.items[targetIndex] = { ...item };
        this.updateSlot(targetIndex);
        this.updateCount();

        // 動畫效果
        if (targetIndex < this.slotCount) {
            this.slots[targetIndex].classList.add('item-added');
            setTimeout(() => {
                this.slots[targetIndex].classList.remove('item-added');
            }, 300);
        }

        return true;
    }

    /**
     * 移除物品
     * @param {string} itemId - 物品 ID
     * @param {number} quantity - 移除數量
     * @returns {boolean}
     */
    removeItem(itemId, quantity = 1) {
        const index = this.items.findIndex(i => i && i.id === itemId);
        if (index === -1) return false;

        const item = this.items[index];
        item.quantity -= quantity;

        if (item.quantity <= 0) {
            this.items[index] = null;
        }

        this.updateSlot(index);
        this.updateCount();
        return true;
    }

    /**
     * 取得物品
     * @param {string} itemId - 物品 ID
     * @returns {Object|null}
     */
    getItem(itemId) {
        return this.items.find(i => i && i.id === itemId) || null;
    }

    /**
     * 檢查是否有物品
     * @param {string} itemId - 物品 ID
     * @param {number} quantity - 需求數量
     * @returns {boolean}
     */
    hasItem(itemId, quantity = 1) {
        const item = this.getItem(itemId);
        return item && item.quantity >= quantity;
    }

    /**
     * 更新欄位顯示
     */
    updateSlot(index) {
        if (index >= this.slotCount) {
            this.updateFullInventory();
            return;
        }

        const slot = this.slots[index];
        const item = this.items[index];
        const iconContainer = slot.querySelector('.slot-icon');
        const quantityLabel = slot.querySelector('.slot-quantity');
        const questMark = slot.querySelector('.slot-quest-mark');

        if (!item) {
            slot.className = 'inventory-slot empty';
            iconContainer.innerHTML = '';
            quantityLabel.classList.add('hidden');
            questMark.classList.add('hidden');
            return;
        }

        slot.className = `inventory-slot filled ${item.category || ''}`;

        // 圖示
        if (item.imageSrc) {
            iconContainer.innerHTML = `<img src="${item.imageSrc}" alt="${item.name}">`;
        } else {
            iconContainer.innerHTML = `<span class="item-emoji">${item.icon || '📦'}</span>`;
        }

        // 數量
        if (item.quantity > 1) {
            quantityLabel.textContent = item.quantity;
            quantityLabel.classList.remove('hidden');
        } else {
            quantityLabel.classList.add('hidden');
        }

        // 任務物品標記
        if (item.isQuestItem) {
            questMark.classList.remove('hidden');
        } else {
            questMark.classList.add('hidden');
        }

        // 選中狀態
        if (index === this.selectedIndex) {
            slot.classList.add('selected');
        }
    }

    /**
     * 更新物品計數
     */
    updateCount() {
        const count = this.getTotalItemCount();
        this.countElement.textContent = `${count}/${this.maxItems}`;

        if (count >= this.maxItems) {
            this.countElement.classList.add('full');
        } else {
            this.countElement.classList.remove('full');
        }
    }

    /**
     * 取得總物品數
     */
    getTotalItemCount() {
        return this.items.filter(i => i).length;
    }

    /**
     * 欄位點擊
     */
    onSlotClick(index, e) {
        const item = this.items[index];
        if (!item) return;

        // 選中
        this.selectSlot(index);

        // 使用物品
        if (item.category === 'consumable') {
            this.useItem(index);
        }
    }

    /**
     * 欄位右鍵
     */
    onSlotRightClick(index, e) {
        e.preventDefault();
        const item = this.items[index];
        if (!item) return;

        // 顯示物品選單
        this.showItemMenu(index, e.clientX, e.clientY);
    }

    /**
     * 欄位懸停
     */
    onSlotHover(index, e) {
        const item = this.items[index];
        if (!item) {
            this.hideTooltip();
            return;
        }

        this.showTooltip(item, e.target);
    }

    /**
     * 顯示工具提示
     */
    showTooltip(item, slotElement) {
        this.tooltipElement.innerHTML = `
            <div class="tooltip-header">
                <span class="tooltip-icon">${item.icon || '📦'}</span>
                <span class="tooltip-name">${item.name}</span>
            </div>
            <p class="tooltip-description">${item.description || ''}</p>
            ${item.isQuestItem ? '<p class="tooltip-quest">任務物品</p>' : ''}
            ${item.effects && item.effects.length > 0 ? `
                <div class="tooltip-effects">
                    ${item.effects.map(e => `<span>+${e.amount} ${this.getEffectName(e.type)}</span>`).join('')}
                </div>
            ` : ''}
            ${item.value > 0 ? `<p class="tooltip-value">價值: ${item.value} 金幣</p>` : ''}
        `;

        // 定位
        const rect = slotElement.getBoundingClientRect();
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
     * 取得效果名稱
     */
    getEffectName(type) {
        const names = {
            heal: '生命',
            speed: '速度',
            attack: '攻擊',
            defense: '防禦'
        };
        return names[type] || type;
    }

    /**
     * 選中欄位
     */
    selectSlot(index) {
        // 取消之前選中
        if (this.selectedIndex >= 0 && this.selectedIndex < this.slotCount) {
            this.slots[this.selectedIndex].classList.remove('selected');
        }

        this.selectedIndex = index;

        if (index >= 0 && index < this.slotCount) {
            this.slots[index].classList.add('selected');
        }

        eventBus.emit('INVENTORY_SLOT_SELECTED', {
            index: index,
            item: this.items[index]
        });
    }

    /**
     * 使用物品
     */
    useItem(index) {
        const item = this.items[index];
        if (!item) return;

        if (item.category !== 'consumable') {
            eventBus.emit('SHOW_TOAST', {
                message: '此物品無法使用',
                type: 'warning'
            });
            return;
        }

        eventBus.emit('USE_ITEM', {
            item: item,
            index: index
        });

        // 移除已使用物品
        this.removeItem(item.id, 1);
    }

    /**
     * 顯示物品選單
     */
    showItemMenu(index, x, y) {
        const item = this.items[index];
        if (!item) return;

        // 移除現有選單
        const existingMenu = document.querySelector('.item-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'item-context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const options = [];

        if (item.category === 'consumable') {
            options.push({ text: '使用', action: () => this.useItem(index) });
        }

        if (item.deliverTo) {
            options.push({ text: '交付', action: () => {
                eventBus.emit('HIGHLIGHT_NPC', { npcId: item.deliverTo });
            }});
        }

        if (!item.isQuestItem) {
            options.push({ text: '丟棄', action: () => this.dropItem(index) });
        }

        options.push({ text: '取消', action: () => menu.remove() });

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt.text;
            btn.addEventListener('click', () => {
                opt.action();
                menu.remove();
            });
            menu.appendChild(btn);
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
     * 丟棄物品
     */
    dropItem(index) {
        const item = this.items[index];
        if (!item || item.isQuestItem) return;

        this.items[index] = null;
        this.updateSlot(index);
        this.updateCount();

        eventBus.emit('ITEM_DROPPED', { item: item });
        eventBus.emit('SHOW_TOAST', {
            message: `丟棄了 ${item.name}`,
            type: 'info'
        });
    }

    /**
     * 拖放事件
     */
    onDragStart(index, e) {
        const item = this.items[index];
        if (!item) {
            e.preventDefault();
            return;
        }

        this.isDragging = true;
        this.dragItem = item;
        this.dragStartIndex = index;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());

        this.slots[index].classList.add('dragging');
    }

    onDragOver(index, e) {
        if (!this.isDragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        this.slots[index].classList.add('drag-over');
    }

    onDrop(index, e) {
        e.preventDefault();
        if (!this.isDragging) return;

        this.slots[index].classList.remove('drag-over');

        // 交換物品
        const temp = this.items[index];
        this.items[index] = this.items[this.dragStartIndex];
        this.items[this.dragStartIndex] = temp;

        this.updateSlot(index);
        this.updateSlot(this.dragStartIndex);
    }

    onDragEnd() {
        this.isDragging = false;
        this.dragItem = null;

        this.slots.forEach(slot => {
            slot.classList.remove('dragging', 'drag-over');
        });
    }

    /**
     * 展開/收起完整物品欄
     */
    toggleExpanded() {
        const isExpanded = !this.fullInventory.classList.contains('hidden');

        if (isExpanded) {
            this.fullInventory.classList.add('hidden');
        } else {
            this.updateFullInventory();
            this.fullInventory.classList.remove('hidden');
        }
    }

    /**
     * 更新完整物品欄
     */
    updateFullInventory() {
        this.fullInventory.innerHTML = '';

        for (let i = this.slotCount; i < this.items.length; i++) {
            const item = this.items[i];
            if (!item) continue;

            const slot = document.createElement('div');
            slot.className = `inventory-slot filled ${item.category || ''}`;
            slot.innerHTML = `
                <div class="slot-icon">
                    ${item.imageSrc
                        ? `<img src="${item.imageSrc}" alt="${item.name}">`
                        : `<span class="item-emoji">${item.icon || '📦'}</span>`
                    }
                </div>
                ${item.quantity > 1 ? `<span class="slot-quantity">${item.quantity}</span>` : ''}
            `;

            slot.addEventListener('click', () => this.onSlotClick(i));
            this.fullInventory.appendChild(slot);
        }
    }

    /**
     * 處理鍵盤輸入
     */
    handleKeyDown(e) {
        // 數字鍵選擇快捷欄
        if (e.key >= '1' && e.key <= '9') {
            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                const index = parseInt(e.key) - 1;
                if (this.items[index]) {
                    this.selectSlot(index);
                }
            }
        } else if (e.key === '0') {
            if (this.items[9]) {
                this.selectSlot(9);
            }
        }

        // I 鍵開啟/關閉物品欄
        if (e.key === 'i' || e.key === 'I') {
            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                this.toggleExpanded();
            }
        }
    }

    /**
     * 清空物品欄
     */
    clear() {
        this.items = [];
        this.selectedIndex = -1;

        for (let i = 0; i < this.slotCount; i++) {
            this.updateSlot(i);
        }

        this.updateFullInventory();
        this.updateCount();
    }

    /**
     * 取得所有物品
     * @returns {Array}
     */
    getAllItems() {
        return this.items.filter(i => i);
    }

    /**
     * 序列化
     * @returns {Array}
     */
    serialize() {
        return this.items.map(item => item ? { ...item } : null);
    }

    /**
     * 反序列化
     * @param {Array} data - 序列化資料
     */
    deserialize(data) {
        this.items = data || [];

        for (let i = 0; i < this.slotCount; i++) {
            this.updateSlot(i);
        }

        this.updateFullInventory();
        this.updateCount();
    }

    /**
     * 銷毀
     */
    dispose() {
        if (this.barElement && this.barElement.parentNode) {
            this.barElement.parentNode.removeChild(this.barElement);
        }

        this.items = [];
        this.slots = [];
    }
}
