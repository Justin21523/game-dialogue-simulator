/**
 * ExplorationDialogue - 探索對話系統 UI
 * 處理 NPC 對話顯示、選項選擇、物品交付
 */

import { eventBus } from '../../core/event-bus.js';
import { aiService } from '../../core/ai-service.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';
import { missionManager } from '../../managers/mission-manager.js';

export class ExplorationDialogue {
    constructor(container) {
        this.container = container;

        // 對話狀態
        this.isOpen = false;
        this.currentNPC = null;
        this.currentDialogue = null;
        this.currentNode = null;
        this.dialogueHistory = [];
        this.portraitCache = new Map();
        this.audioCache = new Map();
        this.currentAudio = null;
        this.portraitCache = new Map();

        // 任務上下文 (Checkpoint 2)
        this.questContext = null;
        this.currentOfferedQuest = null;
        this.currentDialogueTrace = null;
        this.cachedPlan = null;

        // 打字機效果
        this.typewriterSpeed = 30;  // 毫秒/字
        this.typewriterIndex = 0;
        this.typewriterTimer = null;
        this.isTyping = false;
        this.fullText = '';

        // 物品選擇模式
        this.itemSelectionMode = false;
        this.availableItems = [];

        // DOM 元素
        this.dialogueBox = null;
        this.portraitContainer = null;
        this.nameTag = null;
        this.textContainer = null;
        this.optionsContainer = null;
        this.itemSelector = null;

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        // 對話框容器
        this.dialogueBox = document.createElement('div');
        this.dialogueBox.className = 'exploration-dialogue hidden';
        this.dialogueBox.innerHTML = `
            <div class="dialogue-overlay"></div>
            <div class="dialogue-container">
                <div class="dialogue-portrait-area">
                    <div class="portrait-container">
                        <img class="npc-portrait" src="" alt="">
                        <div class="portrait-fallback"></div>
                    </div>
                    <div class="emotion-indicator"></div>
                </div>
                <div class="dialogue-content">
                    <div class="dialogue-header">
                        <span class="npc-name"></span>
                        <span class="quest-badge hidden"></span>
                    </div>
                    <div class="dialogue-text">
                        <p class="text-content"></p>
                        <span class="typing-indicator">...</span>
                    </div>
                    <div class="dialogue-options"></div>
                    <div class="dialogue-actions">
                        <button class="action-button continue-button hidden">
                            <span>繼續</span>
                            <kbd>Space</kbd>
                        </button>
                        <button class="action-button skip-button hidden">
                            <span>跳過</span>
                            <kbd>Enter</kbd>
                        </button>
                    </div>
                </div>
                <button class="dialogue-close" title="關閉 (Esc)">✕</button>
            </div>
            <div class="item-selector hidden">
                <div class="item-selector-header">
                    <span>選擇要交付的物品</span>
                    <button class="item-selector-close">✕</button>
                </div>
                <div class="item-selector-grid"></div>
                <div class="item-selector-info"></div>
            </div>
        `;

        this.container.appendChild(this.dialogueBox);

        // 取得參考
        this.portraitContainer = this.dialogueBox.querySelector('.portrait-container');
        this.portrait = this.dialogueBox.querySelector('.npc-portrait');
        this.portraitFallback = this.dialogueBox.querySelector('.portrait-fallback');
        this.emotionIndicator = this.dialogueBox.querySelector('.emotion-indicator');
        this.nameTag = this.dialogueBox.querySelector('.npc-name');
        this.questBadge = this.dialogueBox.querySelector('.quest-badge');
        this.textContainer = this.dialogueBox.querySelector('.text-content');
        this.typingIndicator = this.dialogueBox.querySelector('.typing-indicator');
        this.optionsContainer = this.dialogueBox.querySelector('.dialogue-options');
        this.continueButton = this.dialogueBox.querySelector('.continue-button');
        this.skipButton = this.dialogueBox.querySelector('.skip-button');
        this.closeButton = this.dialogueBox.querySelector('.dialogue-close');
        this.itemSelector = this.dialogueBox.querySelector('.item-selector');
        this.itemSelectorGrid = this.dialogueBox.querySelector('.item-selector-grid');
        this.itemSelectorInfo = this.dialogueBox.querySelector('.item-selector-info');
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        // 事件總線
        eventBus.on('START_DIALOGUE', (data) => this.startDialogue(data));
        eventBus.on('END_DIALOGUE', () => this.close());

        // 按鈕點擊
        this.continueButton.addEventListener('click', () => this.advance());
        this.skipButton.addEventListener('click', () => this.skipTypewriter());
        this.closeButton.addEventListener('click', () => this.close());

        // 物品選擇器關閉
        const itemSelectorClose = this.dialogueBox.querySelector('.item-selector-close');
        itemSelectorClose.addEventListener('click', () => this.closeItemSelector());

        // 鍵盤輸入
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // 點擊對話框外部關閉
        this.dialogueBox.querySelector('.dialogue-overlay').addEventListener('click', () => {
            if (!this.itemSelectionMode) {
                this.close();
            }
        });
    }

    /**
     * 開始對話
     * @param {Object} data - 對話資料
     */
    startDialogue(data) {
        this.currentNPC = data.npc;
        this.currentDialogue = data.dialogue;
        this.dialogueHistory = [];

        // ===== Stage 3: Store mission context =====
        this.missionContext = data.missionContext || null;
        this.canRegisterMission = data.canRegisterMission || false;

        // ===== Checkpoint 2: Store quest context =====
        this.questContext = data.questContext || null;
        this.canOfferQuest = data.canOfferQuest || false;

        // 設定 NPC 資訊
        this.updateNPCDisplay();

        // 顯示對話框
        this.dialogueBox.classList.remove('hidden');
        this.isOpen = true;

        // 開始第一段對話
        this.showNode(this.currentDialogue);

        // 通知遊戲暫停
        eventBus.emit('DIALOGUE_STARTED');

        // 非阻塞：用 AI 生成對話覆蓋
        this.loadAIDialogue(data).catch(() => {});
    }

    /**
     * 更新 NPC 顯示
     */
    updateNPCDisplay() {
        const npc = this.currentNPC;

        // 名稱
        this.nameTag.textContent = npc.name;

        // 肖像使用 AI 選圖
        this.setPortrait(npc.characterId || npc.npcId || 'npc_generic', npc.emotion || 'neutral');

        // 任務標記
        if (npc.hasCompletableQuest) {
            this.questBadge.textContent = '❓ 可完成任務';
            this.questBadge.className = 'quest-badge completable';
        } else if (npc.hasAvailableQuest) {
            this.questBadge.textContent = '❗ 新任務';
            this.questBadge.className = 'quest-badge available';
        } else {
            this.questBadge.classList.add('hidden');
        }

        // 情緒
        this.updateEmotion(npc.currentEmotion || 'neutral');
    }

    /**
     * 更新情緒顯示
     */
    updateEmotion(emotion) {
        const emotionIcons = {
            neutral: '',
            happy: '😊',
            sad: '😢',
            angry: '😠',
            surprised: '😮',
            worried: '😟',
            excited: '🤩'
        };

        this.emotionIndicator.textContent = emotionIcons[emotion] || '';
        this.emotionIndicator.className = `emotion-indicator ${emotion}`;
    }

    /**
     * 嘗試以 AI 產生對話並覆蓋當前節點
     */
    async loadAIDialogue(data) {
        if (!this.currentNPC) return;
        const mission = data.mission || data.npc?.missionContext || null;
        const playerName = data.player?.name || 'Pilot';
        const npcName = this.currentNPC.name || 'NPC';

        const aiDialogue = await aiService.generateDialogue({
            npcName,
            playerName,
            location: mission?.location || 'Exploration',
            missionType: mission?.type || 'exploration',
            context: mission?.description || this.currentNPC.description || '',
            previous: this.dialogueHistory.map(n => n.text)
        });

        if (!aiDialogue?.lines?.length) return;

        // 轉為節點鏈
        const nodes = aiDialogue.lines.map((line, idx) => {
            const parts = line.split(':');
            const speakerName = parts.length > 1 ? parts[0].trim() : 'NPC';
            const text = parts.length > 1 ? parts.slice(1).join(':').trim() : line;
            const isPlayer = speakerName.toLowerCase().includes(playerName.toLowerCase());
            return {
                id: `ai_line_${idx}`,
                text,
                emotion: 'neutral',
                next: null,
                speaker: isPlayer ? 'player' : 'npc'
            };
        });

        for (let i = 0; i < nodes.length - 1; i++) {
            nodes[i].next = nodes[i + 1];
        }

        this.currentDialogue = nodes[0];
        if (this.isOpen) {
            this.showNode(this.currentDialogue);
        }
    }

    /**
     * 播放 AI 語音
     */
    async playVoice(line) {
        if (!line) return;

        // 停止上一段
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        const speakerId = line.speaker === 'player'
            ? (line.playerId || 'player')
            : (this.currentNPC?.npcId || this.currentNPC?.characterId || 'npc_generic');

        const cacheKey = `${speakerId}:${line.text}`;
        if (this.audioCache.has(cacheKey)) {
            const cachedUrl = this.audioCache.get(cacheKey);
            this._playAudioUrl(cachedUrl);
            return;
        }

        try {
            const resp = await aiService.generateVoice(line.text, speakerId, line.emotion || 'neutral');
            const url = resp?.audio_url;
            if (!url) return;
            this.audioCache.set(cacheKey, url);
            this._playAudioUrl(url);
        } catch (e) {
            // Ignore playback errors
        }
    }

    _playAudioUrl(url) {
        try {
            const audio = new Audio(url);
            this.currentAudio = audio;
            audio.play();
        } catch (e) {
            // ignore
        }
    }

    /**
     * 設定肖像，優先使用 AI 選圖
     */
    async setPortrait(characterId, emotion = 'neutral') {
        const cacheKey = `${characterId}:${emotion}`;
        if (this.portraitCache.has(cacheKey)) {
            this.portrait.src = this.portraitCache.get(cacheKey);
            this.portrait.classList.remove('hidden');
            this.portraitFallback.classList.add('hidden');
            return;
        }

        try {
            const { selection } = await aiAssetManager.preloadDialogueImage(characterId, emotion, 'conversation');
            const src = selection?.primary || aiAssetManager.getCharacterPlaceholder(characterId);
            this.portraitCache.set(cacheKey, src);
            this.portrait.src = src;
            this.portrait.classList.remove('hidden');
            this.portraitFallback.classList.add('hidden');
        } catch (e) {
            this.portrait.classList.add('hidden');
            this.portraitFallback.classList.remove('hidden');
            this.portraitFallback.textContent = '👤';
        }
    }

    /**
     * 顯示對話節點
     * @param {Object} node - 對話節點
     */
    showNode(node) {
        if (!node) {
            this.close();
            return;
        }

        this.currentNode = node;
        this.dialogueHistory.push(node);

        // 更新情緒
        if (node.emotion) {
            this.updateEmotion(node.emotion);
            if (this.currentNPC) {
                this.currentNPC.setEmotion(node.emotion);
            }
        }

        // 開始打字機效果
        this.startTypewriter(node.text);

        // 準備選項
        this.prepareOptions(node);

        // 觸發事件
        if (node.onShow) {
            this.executeAction(node.onShow);
        }
    }

    /**
     * 開始打字機效果
     * @param {string} text - 要顯示的文字
     */
    startTypewriter(text) {
        this.fullText = text;
        this.typewriterIndex = 0;
        this.isTyping = true;
        this.textContainer.textContent = '';
        this.typingIndicator.classList.remove('hidden');

        this.skipButton.classList.remove('hidden');
        this.continueButton.classList.add('hidden');
        this.optionsContainer.innerHTML = '';

        this.typewriterTimer = setInterval(() => {
            if (this.typewriterIndex < this.fullText.length) {
                this.textContainer.textContent += this.fullText[this.typewriterIndex];
                this.typewriterIndex++;
            } else {
                this.finishTypewriter();
            }
        }, this.typewriterSpeed);
    }

    /**
     * 跳過打字機效果
     */
    skipTypewriter() {
        if (!this.isTyping) return;

        clearInterval(this.typewriterTimer);
        this.textContainer.textContent = this.fullText;
        this.finishTypewriter();
    }

    /**
     * 完成打字機效果
     */
    finishTypewriter() {
        clearInterval(this.typewriterTimer);
        this.isTyping = false;
        this.typingIndicator.classList.add('hidden');
        this.skipButton.classList.add('hidden');

        // 顯示選項或繼續按鈕
        this.showOptions();

        // 播放語音
        this.playVoice(this.currentNode);
    }

    /**
     * 準備選項
     */
    prepareOptions(node) {
        this.pendingOptions = [];

        if (node.options && node.options.length > 0) {
            this.pendingOptions = node.options;
        } else if (node.next) {
            // 有下一段對話，顯示繼續按鈕
            this.pendingOptions = [{ text: '繼續', next: node.next }];
        } else if (node.requireItem) {
            // 需要交付物品
            this.pendingOptions = [
                { text: '交付物品', action: 'OPEN_ITEM_SELECTOR', requireItem: node.requireItem },
                { text: '稍後再來', action: 'CLOSE' }
            ];
        } else if (node.giveQuest) {
            // 給予任務
            this.pendingOptions = [
                { text: '接受任務', action: 'ACCEPT_QUEST', questId: node.giveQuest },
                { text: '拒絕', action: 'DECLINE_QUEST' }
            ];
        }
    }

    /**
     * 顯示選項 (Stage 3: Add mission registration option)
     */
    showOptions() {
        this.optionsContainer.innerHTML = '';

        // ===== Stage 3: Add "Register Mission" option if applicable =====
        if (this.canRegisterMission && !this.currentNPC.missionRegistered) {
            const registerOption = {
                text: '🎯 Register this mission',
                action: 'REGISTER_MISSION',
                style: 'highlight'
            };
            // Add at the beginning
            this.pendingOptions.unshift(registerOption);
        }

        // ===== Checkpoint 2: Add "Offer Quest" option if applicable =====
        if (this.canOfferQuest && this.questContext) {
            const questOption = {
                text: '❓ 詢問他們的困難',
                action: 'OFFER_QUEST',
                style: 'highlight'
            };
            // Add at the beginning
            this.pendingOptions.unshift(questOption);
        }

        if (this.pendingOptions.length === 0) {
            // 對話結束
            this.continueButton.textContent = '結束對話';
            this.continueButton.querySelector('span').textContent = 'End';
            this.continueButton.classList.remove('hidden');
            return;
        }

        if (this.pendingOptions.length === 1 && this.pendingOptions[0].text === '繼續') {
            // 單純繼續
            this.continueButton.querySelector('span').textContent = 'Continue';
            this.continueButton.classList.remove('hidden');
            return;
        }

        // 多選項
        this.pendingOptions.forEach((option, index) => {
            const button = document.createElement('button');
            button.className = 'dialogue-option';

            // Apply highlight style if needed
            if (option.style === 'highlight') {
                button.classList.add('highlight');
            }

            button.innerHTML = `
                <kbd>${index + 1}</kbd>
                <span>${option.text}</span>
            `;

            if (option.disabled) {
                button.classList.add('disabled');
                button.disabled = true;
            }

            button.addEventListener('click', () => this.selectOption(index));
            this.optionsContainer.appendChild(button);
        });
    }

    /**
     * 選擇選項
     * @param {number} index - 選項索引
     */
    selectOption(index) {
        const option = this.pendingOptions[index];
        if (!option || option.disabled) return;

        // 執行動作
        if (option.action) {
            this.executeAction(option.action, option);
        } else if (option.next) {
            // 前往下一個節點
            const nextNode = this.findNode(option.next);
            this.showNode(nextNode);
        } else {
            this.close();
        }
    }

    /**
     * 執行動作 (Stage 3: Add mission registration)
     */
    executeAction(action, data = {}) {
        switch (action) {
            case 'CLOSE':
                this.close();
                break;

            // ===== Stage 3: Register mission action =====
            case 'REGISTER_MISSION':
                this.registerMission();
                break;

            // ===== Checkpoint 2: Quest offer/accept/decline =====
            case 'OFFER_QUEST':
                this.offerQuest();
                break;

            case 'ACCEPT_QUEST':
                this.acceptQuest(data.questId);
                break;

            case 'DECLINE_QUEST':
                this.declineQuest(data.questId);
                break;

            case 'VIEW_QUEST_DETAILS':
                this.viewQuestDetails(data.questId);
                break;

            case 'OPEN_ITEM_SELECTOR':
                this.openItemSelector(data.requireItem);
                break;

            case 'GIVE_ITEM':
                eventBus.emit('RECEIVE_ITEM', { itemId: data.itemId });
                break;

            case 'GIVE_REWARD':
                eventBus.emit('RECEIVE_REWARD', data.reward);
                break;

            default:
                eventBus.emit(action, { npc: this.currentNPC, ...data });
        }
    }

    /**
     * Register mission (Stage 3)
     * Records the mission to the mission log
     */
    async registerMission() {
        if (!this.currentNPC) return;

        eventBus.emit('MISSION_REGISTERED', {
            npc: this.currentNPC,
            player: this.player,
            missionContext: this.missionContext
        });

        // Mark NPC as having registered mission
        this.currentNPC.missionRegistered = true;
        this.canRegisterMission = false;

        // Generate AI confirmation dialogue
        let confirmText = 'Mission registered! Looking forward to hearing from you!';
        try {
            const { aiService } = await import('../../core/ai-service.js');
            const response = await aiService.generateNPCDialogue({
                npc_id: this.currentNPC.npcId,
                npc_type: this.currentNPC.type || 'resident',
                player_id: this.player?.characterId || 'jett',
                mission_context: { ...this.missionContext, just_registered: true },
                is_mission_npc: true,
                mission_registered: true
            });
            if (response.lines && response.lines.length > 0) {
                confirmText = response.lines[0];
            }
        } catch (e) {
            console.warn('[ExplorationDialogue] AI confirmation failed, using fallback', e);
        }

        // Show confirmation
        this.showNode({
            text: confirmText,
            emotion: 'happy',
            options: [{ text: 'Continue', action: 'CLOSE' }]
        });

        // Show toast
        eventBus.emit('SHOW_TOAST', {
            message: '✅ Mission registered to mission log',
            type: 'success',
            duration: 3000
        });
    }

    /**
     * Offer quest (Checkpoint 2 + 3)
     * Show quest introduction and ask if player wants to accept
     */
    async offerQuest() {
        if (!this.currentNPC || !this.questContext) return;

        console.log('[ExplorationDialogue] 🎯 Offering quest from NPC:', this.currentNPC.npcId);

        // Dialogue agent to produce intro + options
        this.showNode({
            text: `讓我想想我該怎麼說...`,
            emotion: 'thinking',
            options: []
        });

        try {
            const dlg = await missionManager.generateQuestDialogue(this.currentNPC, this.questContext);
            this.currentDialogueTrace = dlg.trace_id;

            const mappedOptions = (dlg.options || []).map(opt => {
                if (opt.id === 'accept') return { text: opt.text, action: 'ACCEPT_QUEST' };
                if (opt.id === 'decline') return { text: opt.text, action: 'DECLINE_QUEST' };
                return { text: opt.text || '繼續', action: 'CONTINUE' };
            });

            const nodePayload = {
                text: dlg.intro || `我遇到了一些困難，你能幫我嗎？`,
                emotion: 'worried',
                options: mappedOptions.length > 0
                    ? mappedOptions
                    : [
                        { text: '✅ 接受任務', action: 'ACCEPT_QUEST' },
                        { text: '❌ 拒絕', action: 'DECLINE_QUEST' }
                    ]
            };

            // 若有提示，透過 toast 呈現
            if (dlg.hint) {
                eventBus.emit('SHOW_TOAST', {
                    message: `💡 ${dlg.hint}`,
                    type: 'info',
                    duration: 4000
                });
            }

            this.showNode(nodePayload);
        } catch (err) {
            console.error('[ExplorationDialogue] Dialogue agent failed, using fallback', err);
            this.showNode({
                text: `我需要幫助，願意接下任務嗎？`,
                emotion: 'worried',
                options: [
                    { text: '✅ 接受任務', action: 'ACCEPT_QUEST' },
                    { text: '❌ 拒絕', action: 'DECLINE_QUEST' }
                ]
            });
        }
    }

    /**
     * Accept quest (Checkpoint 2)
     */
    async acceptQuest(questId) {
        console.log('[ExplorationDialogue] ✅ Accepting quest:', questId || '(agent-plan)');

        try {
            // If we don't have a prepared quest, generate plan now (main + sub)
            if (!this.currentOfferedQuest) {
                const plan = await missionManager.generateQuestPlan(this.currentNPC, {
                    ...this.questContext,
                    traceId: this.currentDialogueTrace,
                });
                this.cachedPlan = plan;

                // Offer and accept main quest
                missionManager.offerQuest(plan.mainQuest, { type: 'main' });
                await missionManager.acceptQuest(plan.mainQuest.questId, {
                    type: 'main',
                    actorId: this.questContext?.currentPlayer || this.questContext?.playerId
                });

                // Offer + accept a sub quest if present
                if (plan.subQuests && plan.subQuests.length > 0) {
                    plan.subQuests.forEach((sub) => missionManager.offerQuest(sub, { type: 'sub' }));
                    for (const sub of plan.subQuests) {
                        await missionManager.acceptQuest(sub.questId, {
                            type: 'sub',
                            actorId: this.questContext?.currentPlayer || this.questContext?.playerId
                        });
                    }
                }

                this.currentOfferedQuest = plan.mainQuest;
            } else {
                const quest = missionManager.getQuest(questId);
                if (!quest) {
                    console.error('[ExplorationDialogue] Quest not found:', questId);
                    return;
                }
                await missionManager.acceptQuest(questId, {
                    type: quest?.type || 'sub',
                    actorId: this.questContext?.currentPlayer || this.questContext?.playerId
                });
            }

            // Show acceptance confirmation
            this.showNode({
                text: `太好了！我相信你一定能完成這個任務。`,
                emotion: 'happy',
                options: [{ text: '繼續', action: 'CLOSE' }]
            });

            const quest = this.currentOfferedQuest || missionManager.getQuest(questId);
            if (quest) {
                // Emit event
                eventBus.emit('QUEST_ACCEPTED', {
                    questId: quest.questId,
                    npc: this.currentNPC,
                    quest: quest
                });
            }

            // Show toast notification
            eventBus.emit('SHOW_TOAST', {
                message: `✅ 已接受任務：${(this.currentOfferedQuest || {}).title || '任務'}`,
                type: 'success',
                duration: 3000
            });

        } catch (error) {
            console.error('[ExplorationDialogue] Failed to accept quest:', error);
            this.showNode({
                text: '抱歉，出了點問題...',
                emotion: 'sad',
                options: [{ text: '關閉', action: 'CLOSE' }]
            });
        }
    }

    /**
     * Decline quest (Checkpoint 2)
     */
    declineQuest(questId) {
        console.log('[ExplorationDialogue] ❌ Declining quest:', questId);

        // Use MissionManager to decline the quest
        missionManager.declineQuest(questId);

        // Show decline message
        this.showNode({
            text: '好吧...如果你改變主意，隨時來找我。',
            emotion: 'sad',
            options: [{ text: '關閉', action: 'CLOSE' }]
        });

        // Emit event
        eventBus.emit('QUEST_DECLINED', {
            questId: questId,
            npc: this.currentNPC
        });
    }

    /**
     * View quest details (Checkpoint 2)
     */
    viewQuestDetails(questId) {
        console.log('[ExplorationDialogue] 📋 Viewing quest details:', questId);

        const quest = missionManager.getQuest(questId);
        if (!quest) {
            console.error('[ExplorationDialogue] Quest not found:', questId);
            return;
        }

        // Build detailed description
        let detailsText = `**${quest.title}**\n\n${quest.description}\n\n`;

        if (quest.objectives && quest.objectives.length > 0) {
            detailsText += '**目標：**\n';
            quest.objectives.forEach((obj, i) => {
                detailsText += `${i + 1}. ${obj.description}\n`;
            });
            detailsText += '\n';
        }

        if (quest.rewards) {
            detailsText += '**獎勵：**\n';
            if (quest.rewards.exp) detailsText += `- 經驗值：${quest.rewards.exp}\n`;
            if (quest.rewards.money) detailsText += `- 金幣：${quest.rewards.money}\n`;
        }

        this.showNode({
            text: detailsText,
            emotion: 'neutral',
            options: [
                { text: '✅ 接受任務', action: 'ACCEPT_QUEST', questId: quest.questId },
                { text: '❌ 拒絕', action: 'DECLINE_QUEST', questId: quest.questId }
            ]
        });
    }

    /**
     * 尋找對話節點
     */
    findNode(nodeId) {
        // 搜尋當前 NPC 的對話
        if (this.currentNPC && this.currentNPC.dialogues) {
            for (const dialogue of this.currentNPC.dialogues) {
                if (dialogue.id === nodeId) return dialogue;
                if (dialogue.nodes) {
                    const found = dialogue.nodes.find(n => n.id === nodeId);
                    if (found) return found;
                }
            }
        }
        return null;
    }

    /**
     * 前進到下一段對話
     */
    advance() {
        if (this.isTyping) {
            this.skipTypewriter();
            return;
        }

        if (this.pendingOptions.length === 1) {
            this.selectOption(0);
        } else if (this.pendingOptions.length === 0) {
            this.close();
        }
    }

    /**
     * 開啟物品選擇器
     */
    openItemSelector(requiredItems) {
        this.itemSelectionMode = true;
        this.itemSelector.classList.remove('hidden');
        this.itemSelectorGrid.innerHTML = '';

        // 取得玩家物品
        eventBus.emit('GET_PLAYER_INVENTORY', {
            callback: (inventory) => {
                this.availableItems = inventory.filter(item =>
                    requiredItems.includes(item.id)
                );
                this.renderItemSelector();
            }
        });
    }

    /**
     * 渲染物品選擇器
     */
    renderItemSelector() {
        this.itemSelectorGrid.innerHTML = '';

        if (this.availableItems.length === 0) {
            this.itemSelectorInfo.innerHTML = `
                <p class="no-items">你沒有所需的物品</p>
            `;
            return;
        }

        this.availableItems.forEach(item => {
            const slot = document.createElement('div');
            slot.className = 'item-selector-slot';
            slot.innerHTML = `
                <div class="item-icon">${item.icon || '📦'}</div>
                <span class="item-name">${item.name}</span>
                ${item.quantity > 1 ? `<span class="item-quantity">x${item.quantity}</span>` : ''}
            `;

            slot.addEventListener('click', () => this.deliverItem(item));
            this.itemSelectorGrid.appendChild(slot);
        });

        this.itemSelectorInfo.innerHTML = '<p>點擊物品進行交付</p>';
    }

    /**
     * 交付物品
     */
    deliverItem(item) {
        this.closeItemSelector();

        eventBus.emit('DELIVER_ITEM', {
            npc: this.currentNPC,
            item: item
        });

        // 顯示感謝訊息
        const thankYouNode = {
            text: `太好了！謝謝你帶來 ${item.name}！`,
            emotion: 'happy'
        };

        // 檢查是否完成任務
        const result = this.currentNPC.receiveItem(item.id);
        if (result.success && result.questComplete) {
            thankYouNode.text += ' 任務完成！';
            thankYouNode.next = 'quest_complete';

            eventBus.emit('QUEST_COMPLETE', {
                questId: result.questId,
                npc: this.currentNPC
            });
        }

        this.showNode(thankYouNode);
    }

    /**
     * 關閉物品選擇器
     */
    closeItemSelector() {
        this.itemSelectionMode = false;
        this.itemSelector.classList.add('hidden');
    }

    /**
     * 顯示任務接受訊息
     */
    showQuestAcceptedMessage(questId) {
        const quest = this.currentNPC.getQuest(questId);
        const message = quest ? `任務「${quest.name}」已接受！` : '任務已接受！';

        this.showNode({
            text: message,
            emotion: 'happy'
        });
    }

    /**
     * 處理鍵盤輸入
     */
    handleKeyDown(e) {
        if (!this.isOpen) return;

        // 物品選擇模式下只處理 Escape
        if (this.itemSelectionMode) {
            if (e.key === 'Escape') {
                this.closeItemSelector();
            }
            return;
        }

        switch (e.key) {
            case ' ':
            case 'Space':
            case 'Enter':
                e.preventDefault();
                this.advance();
                break;

            case 'Escape':
                e.preventDefault();
                this.close();
                break;

            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                const index = parseInt(e.key) - 1;
                if (index < this.pendingOptions.length) {
                    e.preventDefault();
                    this.selectOption(index);
                }
                break;
        }
    }

    /**
     * 關閉對話
     */
    close() {
        if (!this.isOpen) return;

        // 清理打字機
        clearInterval(this.typewriterTimer);

        // 結束 NPC 互動
        if (this.currentNPC) {
            this.currentNPC.endInteraction();
        }

        // 隱藏對話框
        this.dialogueBox.classList.add('hidden');
        this.closeItemSelector();

        // 重置狀態
        this.isOpen = false;
        this.currentNPC = null;
        this.currentDialogue = null;
        this.currentNode = null;
        this.pendingOptions = [];

        // Checkpoint 2: Reset quest state
        this.questContext = null;
        this.currentOfferedQuest = null;
        this.canOfferQuest = false;

        // 通知遊戲恢復
        eventBus.emit('DIALOGUE_END');
    }

    /**
     * 設定打字速度
     * @param {number} speed - 毫秒/字
     */
    setTypewriterSpeed(speed) {
        this.typewriterSpeed = Math.max(10, Math.min(100, speed));
    }

    /**
     * 是否正在開啟中
     * @returns {boolean}
     */
    isDialogueOpen() {
        return this.isOpen;
    }

    /**
     * 取得對話歷史
     * @returns {Array}
     */
    getHistory() {
        return this.dialogueHistory;
    }

    /**
     * 銷毀
     */
    dispose() {
        clearInterval(this.typewriterTimer);

        if (this.dialogueBox && this.dialogueBox.parentNode) {
            this.dialogueBox.parentNode.removeChild(this.dialogueBox);
        }

        this.currentNPC = null;
        this.currentDialogue = null;
    }
}
