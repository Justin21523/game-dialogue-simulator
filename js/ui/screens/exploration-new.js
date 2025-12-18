/**
 * ExplorationScreen - 全新探索模式（从零重建）
 * Phase 1 MVP: 基础渲染 + 玩家移动 + ESC退出
 */

import { CONFIG } from '../../config.js';
import { gameState } from '../../core/game-state.js';
import { eventBus } from '../../core/event-bus.js';
import { audioManager } from '../../core/audio-manager.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';
import { getNPCService } from '../../services/npc-service.js';
import { ThreeRenderer } from '../../game/exploration/three-renderer.js';
import { assetRegistry } from '../../core/asset-registry.js';

export class ExplorationScreen {
    constructor(containerId, missionData) {
        console.log('[ExplorationScreen] ===== CONSTRUCTOR START =====');
        console.log('[ExplorationScreen] containerId:', containerId);
        console.log('[ExplorationScreen] missionData:', missionData);

        this.container = document.getElementById(containerId);
        console.log('[ExplorationScreen] Container element:', this.container);

        this.missionData = missionData;

        // Canvas
        this.canvas = null;
        this.ctx = null;

        // ===== Phase 1: 3D 渲染層 =====
        this.threeRenderer = null;  // THREE.js 渲染器
        console.log('[ExplorationScreen] ===== CONSTRUCTOR END =====');

        // 玩家
        this.player = {
            x: 400,
            y: 0,
            width: 100,
            height: 150,
            vx: 0,
            vy: 0,
            speed: 350,        // 水平移动速度
            jumpPower: -600,   // 跳跃力度
            image: null,
            characterId: null,
            onGround: false,
            canDoubleJump: true
        };

        // 物理
        this.gravity = 1800;      // 重力加速度
        this.groundY = 0;         // 地面 Y 坐标（会在 render 中设置）

        // 飞行模式
        this.isFlightMode = false;  // false = 正常跳跃模式, true = 飞行模式
        this.flySpeed = 400;        // 飞行时的上下速度

        // 相机
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            smoothFactor: 0.1
        };

        // 背景滚动
        this.backgroundOffset = 0;
        this.cloudOffset = 0;

        // 输入
        this.keys = {};

        // 状态
        this.isRunning = false;
        this.lastTime = 0;
        this.startTime = 0;

        // ===== Phase 2: NPC 系統 =====
        this.npcs = [];
        this.nearbyNPC = null;  // 附近可互動的 NPC
        this.currentDialogue = null;  // 當前對話
        this.isInDialogue = false;  // 是否在對話中
        this.interactRange = 120;  // 互動距離

        // ===== Phase 6 (階段 3): AI 對話系統 =====
        this.npcInteractionHistory = new Map();  // NPC 互動歷史: npcId -> { count, lastDialogue, timestamp }
        this.currentAIDialogue = null;  // 當前 AI 生成的對話數據
        this.isLoadingDialogue = false;  // 是否正在加載對話

        // ===== Phase 3: 任務系統 =====
        this.activeQuest = null;  // 當前進行中的任務
        this.completedQuests = [];  // 已完成的任務
        this.questRewards = {  // 累計獲得的獎勵
            money: 0,
            exp: 0
        };

        // ===== Phase 4: 物品系統 =====
        this.items = [];  // 場景中的物品
        this.nearbyItem = null;  // 附近可拾取的物品
        this.collectedItems = {};  // 已收集的物品 { itemType: count }

        // ===== Phase 5: 夥伴系統 =====
        this.partners = [];  // 場景中的夥伴角色
        this.availablePartners = [];  // 可召喚的夥伴列表
        this.isPartnerMenuOpen = false;  // 夥伴選單是否打開
        this.savedSceneState = null;  // 保存的場景狀態（用於召喚流程）
        this.isSummonFlow = false;  // 是否在召喚流程中

        // ===== Phase 5.5: 角色切換系統 =====
        this.currentControlledIndex = 0;  // 0 = player, 1+ = partners[index-1]

        // ===== Phase 7 (階段 4): 建築物系統 =====
        this.buildingManager = null;  // 建築物管理器
        this.nearbyBuilding = null;   // 附近的建築物
        this.currentScene = 'outdoor';  // outdoor / indoor
        this.currentInterior = null;    // 當前室內場景數據
    }

    async render() {
        console.log('[ExplorationScreen] Starting NEW exploration mode');

        // 创建 HTML 结构（极简版）
        this.container.innerHTML = `
            <div class="screen exploration-screen-new">
                <canvas id="exploration-canvas-new"></canvas>

                <!-- 控制提示 -->
                <div class="exploration-hint">
                    <div><span class="key">WASD</span> Move</div>
                    <div><span class="key">SPACE</span> Jump / Fly</div>
                    <div><span class="key">F</span> Toggle Flight Mode: <span id="flight-mode-indicator">OFF</span></div>
                    <div><span class="key">Q / E</span> Select Character</div>
                    <div><span class="key">G</span> Interact</div>
                    <div><span class="key">P</span> Partner Menu</div>
                    <div><span class="key">ESC</span> End Exploration</div>
                </div>

                <!-- ===== Phase 5: Partner Menu Button ===== -->
                <button class="partner-menu-btn" id="partner-menu-btn">
                    👥 Partners
                </button>

                <!-- ===== Phase 5: Partner Selection Panel ===== -->
                <div class="partner-panel" id="partner-panel" style="display: none;">
                    <div class="partner-panel-header">
                        <h3>Call Partner</h3>
                        <button class="partner-close-btn" id="partner-close-btn">✕</button>
                    </div>
                    <div class="partner-list" id="partner-list">
                        <!-- Partners will be added dynamically -->
                    </div>
                </div>

                <!-- 调试信息 -->
                <div class="exploration-debug">
                    <div>Character: <span id="debug-character"></span></div>
                    <div>Position: <span id="debug-position"></span></div>
                    <div>Mode: <span id="debug-mode"></span></div>
                    <div>On Ground: <span id="debug-ground"></span></div>
                    <div>NPCs: <span id="debug-npcs">0</span></div>
                </div>

                <!-- ===== Phase 3: Quest Tracker ===== -->
                <div class="quest-tracker" id="quest-tracker" style="display: none;">
                    <div class="quest-header">
                        <span class="quest-icon">📋</span>
                        <span class="quest-title" id="quest-title">Quest Title</span>
                    </div>
                    <div class="quest-objectives" id="quest-objectives">
                        <!-- Objectives will be added dynamically -->
                    </div>
                </div>

                <!-- ===== Phase 2: Interaction Prompt ===== -->
                <div class="interaction-prompt" id="interaction-prompt" style="display: none;">
                    <div class="prompt-key">G</div>
                    <div class="prompt-text">Talk to <span id="npc-name"></span></div>
                </div>

                <!-- ===== Phase 2: Dialogue UI ===== -->
                <div class="dialogue-container" id="dialogue-container" style="display: none;">
                    <div class="dialogue-box">
                        <div class="dialogue-npc-name" id="dialogue-npc-name"></div>
                        <div class="dialogue-text" id="dialogue-text"></div>
                        <div class="dialogue-continue" id="dialogue-continue">
                            <span class="prompt-key">Space</span> Continue
                        </div>
                        <!-- ===== Phase 3: Quest Options ===== -->
                        <div class="quest-options" id="quest-options" style="display: none;">
                            <button class="quest-btn accept" id="quest-accept">✓ Accept Quest</button>
                            <button class="quest-btn decline" id="quest-decline">✗ Decline</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // ===== 🆕 等待 DOM 渲染完成 =====
        await new Promise(resolve => requestAnimationFrame(resolve));

        // 初始化 Canvas
        this.canvas = document.getElementById('exploration-canvas-new');
        this.ctx = this.canvas.getContext('2d');

        // ===== 🔧 修復：使用容器的實際尺寸，而非視窗尺寸 =====
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;

        // ===== 🆕 驗證 Canvas 初始化成功 =====
        if (!this.canvas || !this.ctx) {
            console.error('[ExplorationScreen] ❌ Canvas 初始化失敗！');
            return;
        }

        if (this.canvas.width === 0 || this.canvas.height === 0) {
            console.error('[ExplorationScreen] ❌ Canvas 尺寸為零！容器可能未渲染');
            console.error('[ExplorationScreen] 容器:', this.container);
            console.error('[ExplorationScreen] 容器尺寸:', this.container.clientWidth, 'x', this.container.clientHeight);
            return;
        }

        console.log('[ExplorationScreen] ✅ Canvas 初始化成功:', this.canvas.width, 'x', this.canvas.height);

        // ===== Phase 1: 初始化 THREE.js 渲染層 =====
        console.log('[ExplorationScreen] 🔧 準備初始化 THREE.js...');
        console.log('[ExplorationScreen] 檢查 THREE 全域變數:', typeof THREE);

        try {
            console.log('[ExplorationScreen] 建立 ThreeRenderer 實例...');
            this.threeRenderer = new ThreeRenderer(this.canvas, {
                enableLighting: true,
                enableShadows: false,
                debug: false
            });
            console.log('[ExplorationScreen] ✅ THREE.js 渲染層初始化成功');
            console.log('[ExplorationScreen] ThreeRenderer 物件:', this.threeRenderer);
        } catch (error) {
            console.error('[ExplorationScreen] ❌ THREE.js 初始化失敗:', error);
            console.error('[ExplorationScreen] Error stack:', error.stack);
            this.threeRenderer = null;
        }

        // ===== 🔍 解析 missionData（與 Landing.js 相同邏輯）=====
        console.log('[ExplorationScreen] ===== MISSION DATA PARSING =====');
        console.log('[ExplorationScreen] Raw missionData:', this.missionData);
        console.log('[ExplorationScreen] missionData type:', typeof this.missionData);

        // Get mission from active missions (same logic as Landing screen)
        let mission;
        if (typeof this.missionData === 'string') {
            mission = gameState.activeMissions.find(m => m.id === this.missionData);
            console.log('[ExplorationScreen] missionData is string, found mission:', mission);
        } else if (this.missionData && typeof this.missionData === 'object') {
            mission = this.missionData;
            console.log('[ExplorationScreen] missionData is object, using directly');
        }

        // Fallback to first active mission
        if (!mission && gameState.activeMissions.length > 0) {
            mission = gameState.activeMissions[0];
            console.log('[ExplorationScreen] No mission found, using first active mission:', mission);
        }

        // If still no mission, create a minimal mission object from missionData
        if (!mission && this.missionData && typeof this.missionData === 'object') {
            mission = this.missionData;
            console.log('[ExplorationScreen] Using missionData directly as mission');
        }

        console.log('[ExplorationScreen] Final mission object:', mission);

        // 设置地面 Y 坐标
        this.groundY = this.canvas.height - 150;

        // Get character ID - Try multiple sources
        this.player.characterId =
            mission?.assignedCharId ||
            mission?.characterId ||
            this.missionData?.assignedCharId ||
            this.missionData?.characterId ||
            'jett';

        console.log('[ExplorationScreen] ===== CHARACTER ID DETECTION =====');
        console.log('[ExplorationScreen] mission?.assignedCharId:', mission?.assignedCharId);
        console.log('[ExplorationScreen] mission?.characterId:', mission?.characterId);
        console.log('[ExplorationScreen] this.missionData?.assignedCharId:', this.missionData?.assignedCharId);
        console.log('[ExplorationScreen] this.missionData?.characterId:', this.missionData?.characterId);
        console.log('[ExplorationScreen] ✅ FINAL characterId:', this.player.characterId);

        // 获取角色数据
        const charData = gameState.getCharacter(this.player.characterId);
        console.log('[ExplorationScreen] Character data from gameState:', charData);

        // 使用 AI 资产管理器获取角色图片
        this.player.image = new Image();
        this.player.image.src = aiAssetManager.getCharacterPlaceholder(this.player.characterId);

        console.log('[ExplorationScreen] Character image source:', this.player.image.src);
        console.log('[ExplorationScreen] ===================================');

        // 设置玩家初始位置（在地面上）
        this.player.x = 200;
        this.player.y = this.groundY - this.player.height;

        console.log('[ExplorationScreen] Player initial position:', this.player.x, this.player.y, 'Ground Y:', this.groundY);

        // 加载场景背景（简单渐变色）
        await this.loadSceneBackground();

        // 设置输入监听
        this.setupInput();

        // ===== 🚀 立即啟動遊戲循環（不等待 NPC 載入）=====
        console.log('[ExplorationScreen] 🚀 立即啟動遊戲循環（背景載入 NPCs）');

        // ===== Phase 4: 生成物品 =====
        this.spawnItems();

        // ===== Phase 5: 初始化夥伴系統 =====
        this.initPartnerSystem();

        // ===== Phase 5.4: 監聽夥伴召喚返回事件 =====
        this.setupSummonFlowListener();

        // 添加样式
        this.addStyles();

        // 启动游戏循环（立即開始）
        this.start();

        console.log('[ExplorationScreen] Exploration mode started');

        // ===== Phase 2: 生成 NPC（背景非阻塞載入）=====
        this.spawnNPCs().catch(err => {
            console.error('[ExplorationScreen] NPC loading error (non-blocking):', err);
        });

        // ===== Phase 7 (階段 4): 初始化建築物系統（背景載入）=====
        this.initBuildingSystem().catch(err => {
            console.error('[ExplorationScreen] Building system error (non-blocking):', err);
        });
    }

    /**
     * ===== Phase 2: Spawn NPCs (AI-Powered) =====
     * 使用 AI 生成 NPCs，如果失敗則使用預設 NPCs
     */
    async spawnNPCs() {
        console.log('[ExplorationScreen] 🤖 Starting AI NPC generation...');

        // 獲取 NPC Service
        const npcService = getNPCService();

        // 獲取目的地（用於生成適合地點的 NPCs）
        const destination = this.missionData?.destination || 'paris';
        const locationMap = {
            'Paris': 'paris',
            'Tokyo': 'tokyo',
            'London': 'london',
            'New York': 'default',
            'Sydney': 'default'
        };
        const location = locationMap[destination] || 'paris';

        try {
            console.log('[ExplorationScreen] 調用 batchGenerateNPCs API...');

            // 批量生成不同類型的 NPCs（加上 5 秒超時）
            const aiNPCsPromise = npcService.batchGenerateNPCs(location, {
                'outdoor': 5,  // 5 個戶外 NPCs
                'shop': 1,     // 1 個商店 NPC
                'cafe': 1      // 1 個咖啡廳 NPC
            });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('NPC generation timeout (3s)')), 3000);
            });

            const aiNPCs = await Promise.race([aiNPCsPromise, timeoutPromise]);

            console.log(`[ExplorationScreen] ✅ Generated ${aiNPCs.length} AI NPCs`);

            // 將 AI NPCs 轉換為遊戲 NPC 物件
            aiNPCs.forEach((apiNPC, index) => {
                // 計算 X 位置（分散放置）
                const baseX = 400;
                const spacing = 250;
                const positionX = baseX + (index * spacing);

                // 使用 NPCService 的轉換方法
                const gameNPC = npcService.convertToGameNPC(apiNPC, {
                    x: positionX,
                    y: this.groundY - 80
                });

                // 添加遊戲特定屬性
                gameNPC.id = gameNPC.npcId;
                gameNPC.y = this.groundY - 130;
                gameNPC.width = 80;
                gameNPC.height = 130;
                gameNPC.currentDialogueIndex = 0;

                // ===== 如果 NPC 有任務，創建 quest 物件 =====
                if (gameNPC.hasQuest && gameNPC.questHint) {
                    gameNPC.quest = this.createQuestFromNPC(gameNPC, index);
                    gameNPC.questGiven = false;
                } else {
                    gameNPC.quest = null;
                    gameNPC.questGiven = false;
                }

                // 將對話轉換為陣列格式（保持與原系統相容）
                gameNPC.dialogue = [
                    gameNPC.dialogue,
                    this.generateFollowUpDialogue(gameNPC),
                    this.generateFarewellDialogue(gameNPC)
                ];

                this.npcs.push(gameNPC);
            });

            console.log(`[ExplorationScreen] ✅ Loaded ${this.npcs.length} AI NPCs into scene`);

        } catch (error) {
            console.warn('[ExplorationScreen] ⚠️ AI NPC generation failed, using fallback NPCs:', error);
            this.spawnFallbackNPCs();
        }

        // Update debug info
        const debugNPCs = document.getElementById('debug-npcs');
        if (debugNPCs) debugNPCs.textContent = this.npcs.length;
    }

    /**
     * 從 AI 生成的 NPC 創建任務
     */
    createQuestFromNPC(npc, index) {
        // 根據 NPC 的 questHint 創建簡單的任務
        const questTypes = ['talk_to_npc', 'collect_items'];
        const questType = npc.role === 'merchant' || npc.role === 'shopkeeper'
            ? 'collect_items'
            : 'talk_to_npc';

        if (questType === 'talk_to_npc') {
            // 找下一個 NPC 作為目標
            const targetIndex = (index + 1) % 3 + 1;
            return {
                id: `quest_ai_${npc.npcId}`,
                title: `Help ${npc.name}`,
                description: npc.questHint || `${npc.name} needs your help.`,
                objectives: [
                    {
                        type: 'talk_to_npc',
                        targetNPC: `npc_${targetIndex}`,
                        description: 'Talk to the next person',
                        completed: false
                    }
                ],
                rewards: {
                    money: 100,
                    exp: 50
                }
            };
        } else {
            // collect_items 任務
            return {
                id: `quest_ai_${npc.npcId}`,
                title: `Collect for ${npc.name}`,
                description: npc.questHint || `${npc.name} needs you to collect some items.`,
                objectives: [
                    {
                        type: 'collect_items',
                        itemType: 'package',
                        amount: 2,
                        description: 'Collect 2 Packages',
                        completed: false
                    }
                ],
                rewards: {
                    money: 150,
                    exp: 75
                }
            };
        }
    }

    /**
     * 生成後續對話（基於 NPC 性格）
     */
    generateFollowUpDialogue(npc) {
        const followUps = {
            'friendly': `It's nice to meet you! I'm ${npc.name}.`,
            'grumpy': `Yeah, what is it?`,
            'shy': `Um... I'm ${npc.name}...`,
            'cheerful': `This is such a lovely day!`,
            'wise': `There is much to learn here, young traveler.`,
            'mysterious': `...interesting...`,
            'energetic': `So much to do, so little time!`,
            'serious': `Let's get to business.`
        };

        return followUps[npc.personality] || `I live around here.`;
    }

    /**
     * 生成告別對話（基於 NPC 性格）
     */
    generateFarewellDialogue(npc) {
        const farewells = {
            'friendly': `Come back anytime!`,
            'grumpy': `Yeah, yeah... see you around.`,
            'shy': `Um... goodbye...`,
            'cheerful': `Have a wonderful day!`,
            'wise': `May wisdom guide your path.`,
            'mysterious': `...farewell...`,
            'energetic': `Catch you later!`,
            'serious': `Until next time.`
        };

        return farewells[npc.personality] || `Goodbye!`;
    }

    /**
     * Fallback NPCs（當 AI 失敗時使用）
     */
    spawnFallbackNPCs() {
        console.log('[ExplorationScreen] Using fallback NPCs');

        const npcData = [
            {
                id: 'npc_1',
                name: 'Villager Alex',
                x: 600,
                dialogue: [
                    'Hello! Welcome here!',
                    'This place is beautiful, isn\'t it?',
                    'I need some help with something...'
                ],
                color: '#4CAF50',
                quest: {
                    id: 'quest_talk_to_bob',
                    title: 'Find the Merchant',
                    description: 'Alex wants you to find Merchant Bob and talk to him.',
                    objectives: [
                        {
                            type: 'talk_to_npc',
                            targetNPC: 'npc_2',
                            description: 'Talk to Merchant Bob',
                            completed: false
                        }
                    ],
                    rewards: {
                        money: 100,
                        exp: 50
                    }
                }
            },
            {
                id: 'npc_2',
                name: 'Merchant Bob',
                x: 1200,
                dialogue: [
                    'Hey! Want to buy something?',
                    'I have lots of great items!',
                    'Come back anytime!'
                ],
                color: '#FF9800',
                quest: null
            },
            {
                id: 'npc_3',
                name: 'Explorer Charlie',
                x: 1800,
                dialogue: [
                    'I just came back from far away!',
                    'The scenery there was spectacular!',
                    'I need help collecting some items...'
                ],
                color: '#2196F3',
                quest: {
                    id: 'quest_collect_packages',
                    title: 'Collect Packages',
                    description: 'Charlie needs you to collect 2 packages scattered around the area.',
                    objectives: [
                        {
                            type: 'collect_items',
                            itemType: 'package',
                            amount: 2,
                            description: 'Collect 2 Packages',
                            completed: false
                        }
                    ],
                    rewards: {
                        money: 200,
                        exp: 100
                    }
                }
            }
        ];

        npcData.forEach(data => {
            this.npcs.push({
                id: data.id,
                name: data.name,
                x: data.x,
                y: this.groundY - 130,
                width: 80,
                height: 130,
                dialogue: data.dialogue,
                currentDialogueIndex: 0,
                color: data.color,
                quest: data.quest,
                questGiven: false
            });
        });

        console.log('[ExplorationScreen] Spawned', this.npcs.length, 'fallback NPCs');
    }

    /**
     * ===== Phase 4: Spawn Items =====
     */
    spawnItems() {
        // Define item types
        const itemTypes = {
            package: {
                name: 'Package',
                color: '#8B4513',
                icon: '📦',
                size: 40
            },
            coin: {
                name: 'Coin',
                color: '#FFD700',
                icon: '🪙',
                size: 30
            },
            fuel: {
                name: 'Fuel Can',
                color: '#FF6B6B',
                icon: '⛽',
                size: 35
            }
        };

        // Spawn items at specific locations
        const itemData = [
            { type: 'package', x: 400 },
            { type: 'package', x: 900 },
            { type: 'coin', x: 700 },
            { type: 'coin', x: 1100 },
            { type: 'coin', x: 1500 },
            { type: 'fuel', x: 1000 },
            { type: 'fuel', x: 1600 }
        ];

        itemData.forEach((data, index) => {
            const itemDef = itemTypes[data.type];
            this.items.push({
                id: `item_${index}`,
                type: data.type,
                name: itemDef.name,
                x: data.x,
                y: this.groundY - itemDef.size,
                width: itemDef.size,
                height: itemDef.size,
                color: itemDef.color,
                icon: itemDef.icon,
                collected: false
            });
        });

        console.log('[ExplorationScreen] Spawned', this.items.length, 'items');
    }

    /**
     * ===== Phase 7 (階段 4): Initialize Building System =====
     */
    async initBuildingSystem() {
        console.log('[ExplorationScreen] Initializing building system...');

        // 動態導入建築物系統
        const { BuildingManager } = await import('../../game/exploration/building-system.js');
        const { InteriorManager } = await import('../../game/exploration/interior-system.js');

        // 創建建築物管理器
        this.buildingManager = new BuildingManager(this);

        // 創建室內場景管理器
        this.interiorManager = new InteriorManager(this);

        // 生成預設建築物
        this.buildingManager.generateDefaultBuildings(this.groundY);

        console.log(`[ExplorationScreen] Building system initialized with ${this.buildingManager.getBuildingCount()} buildings`);
        console.log('[ExplorationScreen] Interior system initialized');
    }

    /**
     * ===== Phase 5: Initialize Partner System =====
     */
    initPartnerSystem() {
        // Get all available characters from CONFIG
        const allCharacters = Object.keys(CONFIG.CHARACTERS);

        // Filter out the current player character
        this.availablePartners = allCharacters.filter(charId =>
            charId !== this.player.characterId
        );

        console.log('[ExplorationScreen] Available partners:', this.availablePartners);

        // Populate partner list UI
        this.updatePartnerListUI();

        // Setup partner menu events
        this.setupPartnerMenuEvents();
    }

    /**
     * ===== Phase 5: Update Partner List UI =====
     */
    updatePartnerListUI() {
        const partnerList = document.getElementById('partner-list');
        if (!partnerList) return;

        partnerList.innerHTML = '';

        this.availablePartners.forEach(charId => {
            const charData = CONFIG.CHARACTERS[charId];
            if (!charData) return;

            // Check if partner is already in scene
            const alreadyInScene = this.partners.some(p => p.characterId === charId);

            const partnerCard = document.createElement('div');
            partnerCard.className = 'partner-card';
            if (alreadyInScene) partnerCard.classList.add('in-scene');

            partnerCard.innerHTML = `
                <div class="partner-avatar" style="background-color: ${charData.color || '#888'}">
                    ${charData.name[0]}
                </div>
                <div class="partner-info">
                    <div class="partner-name">${charData.name}</div>
                    <div class="partner-status">${alreadyInScene ? 'In Scene' : 'Available'}</div>
                </div>
                <button class="partner-summon-btn" data-char-id="${charId}" ${alreadyInScene ? 'disabled' : ''}>
                    ${alreadyInScene ? '✓ Here' : '📞 Call'}
                </button>
            `;

            partnerList.appendChild(partnerCard);
        });

        // Add event listeners to summon buttons
        const summonButtons = partnerList.querySelectorAll('.partner-summon-btn:not([disabled])');
        summonButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const charId = btn.getAttribute('data-char-id');
                this.startPartnerSummon(charId);
            });
        });
    }

    /**
     * ===== Phase 5: Setup Partner Menu Events =====
     */
    setupPartnerMenuEvents() {
        // Partner menu button
        const menuBtn = document.getElementById('partner-menu-btn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => this.togglePartnerMenu());
        }

        // Close button
        const closeBtn = document.getElementById('partner-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePartnerMenu());
        }
    }

    /**
     * ===== Phase 5: Toggle Partner Menu =====
     */
    togglePartnerMenu() {
        this.isPartnerMenuOpen = !this.isPartnerMenuOpen;
        const panel = document.getElementById('partner-panel');
        if (panel) {
            panel.style.display = this.isPartnerMenuOpen ? 'block' : 'none';
        }
        audioManager.playSound('button');
    }

    /**
     * ===== Phase 5: Close Partner Menu =====
     */
    closePartnerMenu() {
        this.isPartnerMenuOpen = false;
        const panel = document.getElementById('partner-panel');
        if (panel) {
            panel.style.display = 'none';
        }
        audioManager.playSound('button');
    }

    /**
     * ===== Phase 5.2: Capture Exploration State =====
     * 保存當前探索場景狀態
     */
    captureExplorationState() {
        console.log('[ExplorationScreen] Capturing exploration state...');

        const state = {
            playerId: this.player.characterId,
            playerPosition: { x: this.player.x, y: this.player.y },
            playerVelocity: { vx: this.player.vx, vy: this.player.vy },
            cameraPosition: { x: this.camera.x, y: this.camera.y },
            activePartners: this.partners.map(p => ({
                characterId: p.characterId,
                x: p.x,
                y: p.y
            })),
            // ===== 🆕 保存 NPCs 和 Items =====
            npcs: JSON.parse(JSON.stringify(this.npcs)),
            items: JSON.parse(JSON.stringify(this.items)),
            nearbyNPC: this.nearbyNPC ? { ...this.nearbyNPC } : null,
            nearbyItem: this.nearbyItem ? { ...this.nearbyItem } : null,
            isInDialogue: this.isInDialogue,
            currentDialogue: this.currentDialogue ? { ...this.currentDialogue } : null,
            // ===== 任務狀態 =====
            activeQuest: this.activeQuest ? JSON.parse(JSON.stringify(this.activeQuest)) : null,
            collectedItems: { ...this.collectedItems },
            completedQuests: [...this.completedQuests],
            questRewards: { ...this.questRewards },
            timestamp: Date.now()
        };

        console.log('[ExplorationScreen] State captured with NPCs and Items:', state);
        console.log('[ExplorationScreen] - NPCs count:', state.npcs.length);
        console.log('[ExplorationScreen] - Items count:', state.items.length);
        return state;
    }

    /**
     * ===== Phase 5.3: Start Partner Summon =====
     * 開始夥伴召喚完整流程（Launch→Flight→Transform→Landing）
     */
    startPartnerSummon(charId) {
        console.log('[ExplorationScreen] Starting partner summon for:', charId);

        // 關閉夥伴選單
        this.closePartnerMenu();

        // 1. 保存當前探索場景狀態
        this.savedSceneState = this.captureExplorationState();
        this.isSummonFlow = true;

        // 2. 暫停探索場景
        this.isRunning = false;
        console.log('[ExplorationScreen] Exploration paused for summon flow');

        // 3. 創建召喚任務數據
        const summonMissionData = {
            id: `summon_${charId}_${Date.now()}`,
            type: 'summon',
            characterId: charId,
            assignedCharId: charId,
            isSummonMission: true,      // 關鍵標記：這是夥伴召喚任務
            simplifiedFlight: true,      // 簡化版飛行（30秒）
            destination: this.missionData?.destination || 'Unknown Location',
            returnToExploration: true    // 標記：完成後返回探索模式
        };

        console.log('[ExplorationScreen] Created summon mission:', summonMissionData);

        // 4. 發送事件通知系統
        eventBus.emit('SUMMON_FLOW_STARTED', {
            characterId: charId,
            summonMissionData: summonMissionData
        });

        // 5. 啟動 Launch 畫面（開始完整流程）
        setTimeout(() => {
            window.game.renderLaunch(summonMissionData);
        }, 100);
    }

    /**
     * ===== Phase 5.4: Setup Summon Flow Listener =====
     * 監聽夥伴召喚返回事件
     */
    setupSummonFlowListener() {
        eventBus.on('SUMMON_FLOW_RETURN', (data) => {
            console.log('[ExplorationScreen] Partner summon flow complete:', data);
            this.resumeFromSummonFlow(data.characterId);
        });
    }

    /**
     * ===== Phase 5.4: Resume From Summon Flow =====
     * 從夥伴召喚流程恢復探索模式
     */
    async resumeFromSummonFlow(characterId) {
        console.log(`[ExplorationScreen] Resuming from summon flow for ${characterId}`);

        if (!this.savedSceneState) {
            console.error('[ExplorationScreen] No saved state to resume!');
            return;
        }

        // 1. 檢查 UI 是否還存在，如果不存在則重新創建
        // ===== 🔧 修復：檢查 DOM 中是否真的存在 Canvas =====
        const canvasInDOM = document.getElementById('exploration-canvas-new');
        const needsRecreate = !canvasInDOM || !this.canvas || !this.canvas.parentNode;

        console.log('[ExplorationScreen] 🔍 UI 檢查:', {
            canvasInDOM: !!canvasInDOM,
            this_canvas: !!this.canvas,
            canvas_parentNode: !!this.canvas?.parentNode,
            needsRecreate: needsRecreate
        });

        if (needsRecreate) {
            console.log('[ExplorationScreen] ⚠️ UI 需要重建！調用 recreateUI()...');
            await this.recreateUI();

            // ===== 等待 DOM 元素完全渲染 =====
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('[ExplorationScreen] ✅ DOM 元素渲染完成');

            // ===== 🔍 驗證 recreateUI() 是否成功 =====
            const canvasAfterRecreate = document.getElementById('exploration-canvas-new');
            if (!canvasAfterRecreate) {
                console.error('[ExplorationScreen] ❌ 錯誤：recreateUI() 後仍然找不到 Canvas！');
                console.error('[ExplorationScreen] Container innerHTML:', this.container?.innerHTML?.substring(0, 200));
                return;
            }

            // 確保 this.canvas 指向正確的元素
            if (this.canvas !== canvasAfterRecreate) {
                console.log('[ExplorationScreen] 🔄 更新 Canvas 引用');
                this.canvas = canvasAfterRecreate;
                this.ctx = this.canvas.getContext('2d');
            }

            console.log('[ExplorationScreen] ✅ Canvas 驗證成功:', this.canvas.width, 'x', this.canvas.height);
        } else {
            console.log('[ExplorationScreen] ✅ UI 仍然存在，無需重建');
        }

        // 2. 恢復探索場景狀態
        this.restoreExplorationState(this.savedSceneState);

        // 3. 將夥伴加入場景
        this.addPartnerToScene(characterId);

        // 4. 清理召喚上下文
        this.savedSceneState = null;
        this.isSummonFlow = false;

        // 5. 重新啟動遊戲循環
        this.isRunning = true;
        if (!this.animationId) {
            this.start();
        }

        // 6. 更新夥伴列表 UI
        this.updatePartnerListUI();

        // 7. 顯示成功通知
        const charData = CONFIG.CHARACTERS[characterId];
        eventBus.emit('SHOW_TOAST', {
            message: `${charData?.name || characterId} has joined the team!`,
            type: 'success',
            duration: 3000
        });

        console.log('[ExplorationScreen] Summon flow complete, exploration resumed');
    }

    /**
     * ===== Phase 5.4: Recreate UI =====
     * 重新創建 UI 元素（在召喚流程後 UI 被清除時使用）
     */
    async recreateUI() {
        console.log('[ExplorationScreen] Recreating UI elements...');

        // ===== 🔍 診斷：檢查現有 Canvas 數量 =====
        const existingCanvases = document.querySelectorAll('#exploration-canvas-new');
        console.log('[ExplorationScreen] 🔍 Existing canvases before recreate:', existingCanvases.length);
        existingCanvases.forEach((canvas, index) => {
            console.log(`  Canvas ${index}:`, canvas.width, 'x', canvas.height, 'Parent:', canvas.parentNode?.className);
        });

        // ===== 🔧 強制清除所有舊的 Canvas（防止重疊）=====
        if (existingCanvases.length > 0) {
            console.log('[ExplorationScreen] 🧹 Removing', existingCanvases.length, 'existing canvases...');
            existingCanvases.forEach((canvas, index) => {
                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                    console.log(`  ✅ Removed canvas ${index}`);
                }
            });
        }

        // ===== 🔧 修復：只重建 UI HTML，不重置遊戲狀態 =====
        // 保存當前遊戲狀態（避免被重置）
        const savedPlayer = { ...this.player };
        const savedNPCs = [...this.npcs];
        const savedItems = [...this.items];
        const savedPartners = [...this.partners];
        const savedCurrentControlledIndex = this.currentControlledIndex;
        const savedBuildingManager = this.buildingManager;  // ✅ 保存建築物管理器

        // 創建 HTML 結構（與 render() 相同）
        this.container.innerHTML = `
            <div class="screen exploration-screen-new">
                <canvas id="exploration-canvas-new"></canvas>

                <!-- 控制提示 -->
                <div class="exploration-hint">
                    <div><span class="key">WASD</span> Move</div>
                    <div><span class="key">SPACE</span> Jump / Fly</div>
                    <div><span class="key">F</span> Toggle Flight Mode: <span id="flight-mode-indicator">OFF</span></div>
                    <div><span class="key">Q / E</span> Select Character</div>
                    <div><span class="key">G</span> Interact</div>
                    <div><span class="key">P</span> Partner Menu</div>
                    <div><span class="key">ESC</span> End Exploration</div>
                </div>

                <!-- ===== Phase 5: Partner Menu Button ===== -->
                <button class="partner-menu-btn" id="partner-menu-btn">
                    👥 Partners
                </button>

                <!-- ===== Phase 5: Partner Selection Panel ===== -->
                <div class="partner-panel" id="partner-panel" style="display: none;">
                    <div class="partner-panel-header">
                        <h3>Call Partner</h3>
                        <button class="partner-close-btn" id="partner-close-btn">✕</button>
                    </div>
                    <div class="partner-list" id="partner-list">
                        <!-- Partners will be added dynamically -->
                    </div>
                </div>

                <!-- 调试信息 -->
                <div class="exploration-debug">
                    <div>Character: <span id="debug-character"></span></div>
                    <div>Position: <span id="debug-position"></span></div>
                    <div>Mode: <span id="debug-mode"></span></div>
                    <div>On Ground: <span id="debug-ground"></span></div>
                    <div>NPCs: <span id="debug-npcs">0</span></div>
                </div>

                <!-- ===== Phase 3: Quest Tracker ===== -->
                <div class="quest-tracker" id="quest-tracker" style="display: none;">
                    <div class="quest-header">
                        <span class="quest-icon">📋</span>
                        <span class="quest-title" id="quest-title">Quest Title</span>
                    </div>
                    <div class="quest-objectives" id="quest-objectives">
                        <!-- Objectives will be added dynamically -->
                    </div>
                </div>

                <!-- ===== Phase 2: Interaction Prompt ===== -->
                <div class="interaction-prompt" id="interaction-prompt" style="display: none;">
                    <div class="prompt-key">G</div>
                    <div class="prompt-text">Talk to <span id="npc-name"></span></div>
                </div>

                <!-- ===== Phase 2: Dialogue UI ===== -->
                <div class="dialogue-container" id="dialogue-container" style="display: none;">
                    <div class="dialogue-box">
                        <div class="dialogue-npc-name" id="dialogue-npc-name"></div>
                        <div class="dialogue-text" id="dialogue-text"></div>
                        <div class="dialogue-continue" id="dialogue-continue">
                            <span class="prompt-key">Space</span> Continue
                        </div>
                        <!-- ===== Phase 3: Quest Options ===== -->
                        <div class="quest-options" id="quest-options" style="display: none;">
                            <button class="quest-btn accept" id="quest-accept">✓ Accept Quest</button>
                            <button class="quest-btn decline" id="quest-decline">✗ Decline</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // ===== 等待 DOM 渲染完成 =====
        await new Promise(resolve => requestAnimationFrame(resolve));

        // 重新獲取 Canvas
        this.canvas = document.getElementById('exploration-canvas-new');
        this.ctx = this.canvas.getContext('2d');

        // ===== 使用容器的實際尺寸 =====
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;

        // ===== 驗證 Canvas 初始化成功 =====
        if (!this.canvas || !this.ctx) {
            console.error('[ExplorationScreen] ❌ Canvas 初始化失敗！');
            return;
        }

        if (this.canvas.width === 0 || this.canvas.height === 0) {
            console.error('[ExplorationScreen] ❌ Canvas 尺寸為零！容器可能未渲染');
            console.error('[ExplorationScreen] 容器:', this.container);
            console.error('[ExplorationScreen] 容器尺寸:', this.container.clientWidth, 'x', this.container.clientHeight);
            return;
        }

        console.log('[ExplorationScreen] ✅ Canvas 重新初始化成功:', this.canvas.width, 'x', this.canvas.height);

        // ===== 🔍 再次檢查 Canvas 數量 =====
        const canvasesAfterRecreate = document.querySelectorAll('#exploration-canvas-new');
        console.log('[ExplorationScreen] 🔍 Canvases after recreate:', canvasesAfterRecreate.length);
        if (canvasesAfterRecreate.length > 1) {
            console.error('[ExplorationScreen] ❌ 警告：檢測到多個 Canvas！這可能導致渲染問題。');
        }

        // ===== 恢復遊戲狀態（避免被重置）=====
        this.player = savedPlayer;
        this.npcs = savedNPCs;
        this.items = savedItems;
        this.partners = savedPartners;
        this.currentControlledIndex = savedCurrentControlledIndex;
        this.buildingManager = savedBuildingManager;  // ✅ 恢復建築物管理器

        console.log('[ExplorationScreen] 🔄 Restored state:', {
            player: this.player ? 'OK' : 'MISSING',
            npcs: this.npcs.length,
            items: this.items.length,
            partners: this.partners.length,
            buildings: this.buildingManager ? this.buildingManager.getBuildingCount() : 0
        });

        // 重新設置 groundY（基於新的 canvas 高度）
        this.groundY = this.canvas.height - 150;

        // 重新設置輸入監聽
        this.setupInput();

        // 重新設置事件監聽
        this.setupSummonFlowListener();

        // 重新添加樣式
        this.addStyles();

        // 更新夥伴列表 UI
        this.updatePartnerListUI();

        console.log('[ExplorationScreen] ✅ UI 重建完成，遊戲狀態已保留');
        console.log('[ExplorationScreen] 🎨 Canvas context:', this.ctx ? 'OK' : 'MISSING');
        console.log('[ExplorationScreen] 🎮 Game running:', this.isRunning);

        return;

        // ===== 下面的簡化版 UI 創建已廢棄 =====
        /*
        // 清空容器
        this.container.innerHTML = '';

        // 重新創建 canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.container.clientWidth;   // ✅ 使用容器尺寸
        this.canvas.height = this.container.clientHeight; // ✅ 使用容器尺寸
        this.canvas.style.display = 'block';
        this.canvas.style.margin = '0 auto';
        this.canvas.style.backgroundColor = '#000';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        */

        // 重新創建 HUD
        const hud = document.createElement('div');
        hud.className = 'exploration-hud';
        hud.innerHTML = `
            <div class="hud-top-left">
                <div class="hud-item">
                    <span class="hud-label">Character:</span>
                    <span id="debug-character">${this.player.characterId}</span>
                </div>
                <div class="hud-item">
                    <span class="hud-label">Position:</span>
                    <span id="debug-position">(0, 0)</span>
                </div>
                <div class="hud-item">
                    <span class="hud-label">Mode:</span>
                    <span id="debug-mode">Ground</span>
                </div>
                <div class="hud-item">
                    <span class="hud-label">Ground:</span>
                    <span id="debug-ground">Yes</span>
                </div>
            </div>

            <div class="hud-top-right">
                <div class="hud-hint">
                    💡 <span id="interaction-hint">Press G to interact</span>
                </div>
                <div class="hud-controls">
                    <div><strong>WASD:</strong> Move</div>
                    <div><strong>Space:</strong> Jump</div>
                    <div><strong>F:</strong> Flight Mode <span id="flight-mode-indicator" style="color: #FF5252;">OFF</span></div>
                    <div><strong>P:</strong> Partners Menu</div>
                    <div><strong>ESC:</strong> Exit</div>
                </div>
            </div>

            <!-- Quest Tracker -->
            <div id="quest-tracker" class="quest-tracker" style="display: none;">
                <div class="quest-header">
                    <span class="quest-icon">📋</span>
                    <span id="quest-title">Quest Title</span>
                </div>
                <div id="quest-objectives" class="quest-objectives">
                    <!-- Objectives added dynamically -->
                </div>
            </div>

            <!-- Partner Menu Button -->
            <button class="partner-menu-btn" id="partner-menu-btn">
                👥 Partners
            </button>

            <!-- Partner Selection Panel -->
            <div class="partner-panel" id="partner-panel" style="display: none;">
                <div class="partner-panel-header">
                    <h3>Call Partner</h3>
                    <button class="partner-close-btn" id="partner-close-btn">✕</button>
                </div>
                <div class="partner-list" id="partner-list">
                    <!-- Partners added dynamically -->
                </div>
            </div>

            <!-- Interaction Prompt -->
            <div class="interaction-prompt" id="interaction-prompt" style="display: none;">
                <div class="prompt-key">G</div>
                <div class="prompt-text">Talk to <span id="npc-name"></span></div>
            </div>

            <!-- Dialogue UI -->
            <div class="dialogue-container" id="dialogue-container" style="display: none;">
                <div class="dialogue-box">
                    <div class="dialogue-npc-name" id="dialogue-npc-name"></div>
                    <div class="dialogue-text" id="dialogue-text"></div>
                    <div class="dialogue-continue" id="dialogue-continue">
                        <span class="prompt-key">Space</span> Continue
                    </div>
                    <div class="quest-options" id="quest-options" style="display: none;">
                        <button class="quest-btn accept" id="quest-accept">✓ Accept Quest</button>
                        <button class="quest-btn decline" id="quest-decline">✗ Decline</button>
                    </div>
                </div>
            </div>

            <!-- Item Prompt -->
            <div class="interaction-prompt" id="item-prompt" style="display: none;">
                <div class="prompt-key">G</div>
                <div class="prompt-text">Pick up <span id="item-name"></span></div>
            </div>

            <!-- Reward Notification -->
            <div class="reward-notification" id="reward-notification" style="display: none;">
                <div class="reward-icon">🎉</div>
                <div class="reward-title" id="reward-title">Quest Complete!</div>
                <div class="reward-details">
                    <div class="reward-item">
                        <span class="reward-label">💰 Money:</span>
                        <span class="reward-value" id="reward-money">+0</span>
                    </div>
                    <div class="reward-item">
                        <span class="reward-label">⭐ EXP:</span>
                        <span class="reward-value" id="reward-exp">+0</span>
                    </div>
                </div>
            </div>
        `;
        this.container.appendChild(hud);

        // 注意：不重新設置輸入監聽（setupInput），因為監聽器還在 window 上
        // 只重新設置夥伴系統的 UI 事件

        // 重新設置夥伴系統事件
        this.setupPartnerMenuEvents();

        // 重新添加樣式（如果需要）
        if (!document.getElementById('exploration-styles')) {
            this.addStyles();
        }

        console.log('[ExplorationScreen] UI recreation complete');
    }

    /**
     * ===== Phase 5.4: Restore Exploration State =====
     * 恢復探索場景狀態
     */
    restoreExplorationState(state) {
        if (!state) return;

        console.log('[ExplorationScreen] Restoring exploration state:', state);

        // 恢復玩家位置
        if (state.playerPosition) {
            this.player.x = state.playerPosition.x;
            this.player.y = state.playerPosition.y;
        }

        // 恢復玩家速度
        if (state.playerVelocity) {
            this.player.vx = state.playerVelocity.vx;
            this.player.vy = state.playerVelocity.vy;
        }

        // 恢復相機位置
        if (state.cameraPosition) {
            this.camera.x = state.cameraPosition.x;
            this.camera.y = state.cameraPosition.y;
        }

        // ===== 🆕 恢復 NPCs 和 Items =====
        if (state.npcs && state.npcs.length > 0) {
            this.npcs = JSON.parse(JSON.stringify(state.npcs));
            console.log('[ExplorationScreen] ✅ Restored', this.npcs.length, 'NPCs');
        }

        if (state.items && state.items.length > 0) {
            this.items = JSON.parse(JSON.stringify(state.items));
            console.log('[ExplorationScreen] ✅ Restored', this.items.length, 'items');
        }

        // 恢復對話狀態
        if (state.isInDialogue !== undefined) {
            this.isInDialogue = state.isInDialogue;
        }

        if (state.currentDialogue) {
            this.currentDialogue = { ...state.currentDialogue };
        }

        if (state.nearbyNPC) {
            // 從恢復的 NPCs 中找到對應的 NPC
            this.nearbyNPC = this.npcs.find(npc => npc.id === state.nearbyNPC.id) || null;
        }

        if (state.nearbyItem) {
            // 從恢復的 Items 中找到對應的 Item
            this.nearbyItem = this.items.find(item => item.id === state.nearbyItem.id) || null;
        }

        // 恢復任務狀態
        if (state.activeQuest) {
            this.activeQuest = state.activeQuest;
            this.updateQuestTracker();
        }

        // 恢復收集物品狀態
        if (state.collectedItems) {
            this.collectedItems = state.collectedItems;
        }

        // 恢復已完成任務
        if (state.completedQuests) {
            this.completedQuests = state.completedQuests;
        }

        // 恢復任務獎勵
        if (state.questRewards) {
            this.questRewards = state.questRewards;
        }

        console.log('[ExplorationScreen] ✅ Exploration state fully restored');
        console.log('[ExplorationScreen] - NPCs:', this.npcs.length);
        console.log('[ExplorationScreen] - Items:', this.items.length);
        console.log('[ExplorationScreen] - Partners:', this.partners.length);
    }

    /**
     * ===== Phase 5.4: Add Partner To Scene =====
     * 將夥伴加入探索場景
     */
    addPartnerToScene(characterId) {
        const charData = CONFIG.CHARACTERS[characterId];
        if (!charData) {
            console.error('[ExplorationScreen] Character not found:', characterId);
            return;
        }

        // ===== 🔧 修復：創建完整的夥伴角色物件（與 player 結構一致）=====
        const partner = {
            characterId: characterId,
            name: charData.name,
            x: this.player.x + 150,  // 出現在玩家右側
            y: -200,                 // 從上方降落
            targetY: this.groundY - 150,  // 目標 Y 位置
            width: 100,
            height: 150,
            vx: 0,
            vy: 0,
            // ===== 🆕 添加所有必要的屬性 =====
            speed: 350,              // 水平移動速度（與 player 一致）
            jumpPower: -600,         // 跳躍力度
            onGround: false,         // 是否在地面上
            canDoubleJump: true,     // 可以二段跳
            isLanding: true,         // 標記：正在降落
            landingSpeed: 500,       // 降落速度
            image: null,
            color: charData.color || '#FF6B6B'
        };

        // ===== 🔧 修復：正確載入夥伴圖片 =====
        partner.image = new Image();
        partner.image.src = aiAssetManager.getCharacterPlaceholder(characterId);
        console.log(`[ExplorationScreen] Loading partner image for ${characterId}:`, partner.image.src);

        // 加入夥伴列表
        this.partners.push(partner);

        console.log(`[ExplorationScreen] Partner ${characterId} added to scene at (${partner.x}, ${partner.y})`);
    }

    async loadSceneBackground() {
        // Phase 1: 使用简单渐变背景
        // Phase 2+: 可以加载 AI 生成的场景图片
        console.log('[ExplorationScreen] Using gradient background for Phase 1');
    }

    // ===== Phase 5.5: 角色切換方法 =====

    /**
     * 獲取當前被控制的角色
     * @returns {Object} 當前控制的角色對象（player 或 partner）
     */
    getCurrentControlledCharacter() {
        if (this.currentControlledIndex === 0) {
            return this.player;
        } else {
            const partnerIndex = this.currentControlledIndex - 1;
            return this.partners[partnerIndex] || this.player;
        }
    }

    /**
     * 切換控制的角色
     * @param {number} direction - 1 = 下一個, -1 = 上一個
     */
    switchCharacter(direction) {
        // 計算總角色數（玩家 + 夥伴）
        const totalCharacters = 1 + this.partners.length;

        if (totalCharacters <= 1) {
            console.log('[ExplorationScreen] No partners to switch to');
            return;
        }

        // 切換索引
        const newIndex = (this.currentControlledIndex + direction + totalCharacters) % totalCharacters;

        if (newIndex === this.currentControlledIndex) {
            return; // 沒有變化
        }

        this.currentControlledIndex = newIndex;

        const controlled = this.getCurrentControlledCharacter();
        const characterName = controlled.characterId || 'Player';

        console.log(`[ExplorationScreen] Switched to: ${characterName} (index ${this.currentControlledIndex})`);

        // 播放音效
        audioManager.playSound('button');

        // 更新視覺提示
        this.updateCharacterControlIndicator();

        // 顯示 toast 通知
        eventBus.emit('SHOW_TOAST', {
            message: `Now controlling: ${characterName}`,
            type: 'info',
            duration: 2000
        });
    }

    /**
     * 更新角色控制指示器（視覺反饋）
     */
    updateCharacterControlIndicator() {
        const controlled = this.getCurrentControlledCharacter();
        const debugChar = document.getElementById('debug-character');

        if (debugChar) {
            const characterName = controlled.characterId || 'Player';
            const indicator = this.currentControlledIndex === 0 ? '👤' : '🤝';
            debugChar.textContent = `${indicator} ${characterName}`;
            debugChar.style.color = this.currentControlledIndex === 0 ? '#4CAF50' : '#FF9800';
            debugChar.style.fontWeight = 'bold';
        }
    }

    setupInput() {
        // 键盘按下
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();

            // 防止重复触发（但對於 G 鍵這類單次動作，允許重複觸發以防卡住）
            // G 鍵是互動鍵，應該每次按下都觸發，不應該被卡住
            if (this.keys[key] && key !== 'g') return;

            this.keys[key] = true;

            // ESC 退出探索
            if (e.key === 'Escape') {
                this.exitExploration();
            }

            // F 切换飞行模式
            if (key === 'f') {
                this.isFlightMode = !this.isFlightMode;
                const indicator = document.getElementById('flight-mode-indicator');
                if (indicator) {
                    indicator.textContent = this.isFlightMode ? 'ON' : 'OFF';
                    indicator.style.color = this.isFlightMode ? '#4CAF50' : '#FF5252';
                }
                audioManager.playSound('button');
                console.log('[ExplorationScreen] Flight mode:', this.isFlightMode ? 'ON' : 'OFF');
            }

            // P 打開夥伴選單
            if (key === 'p') {
                this.togglePartnerMenu();
            }

            // ===== 🔍 D 鍵：Debug 狀態輸出 =====
            if (key === 'd') {
                console.log('=== 🔍 DEBUG STATE ===');
                console.log('isInDialogue:', this.isInDialogue);
                console.log('currentDialogue:', this.currentDialogue);
                console.log('isLoadingDialogue:', this.isLoadingDialogue);
                console.log('nearbyNPC:', this.nearbyNPC);
                console.log('nearbyItem:', this.nearbyItem);
                console.log('nearbyBuilding:', this.nearbyBuilding);
                console.log('keys[g]:', this.keys['g']);
                const dialogueUI = document.getElementById('dialogue-container');
                console.log('dialogue-container display:', dialogueUI?.style.display);
                const interactPrompt = document.getElementById('interaction-prompt');
                console.log('interaction-prompt display:', interactPrompt?.style.display);
                console.log('NPC count:', this.npcs?.length || 0);
                console.log('===================');
            }

            // ===== 🆕 Q 鍵：選擇上一個角色 =====
            if (key === 'q') {
                if (!this.isInDialogue) {
                    this.switchCharacter(-1);  // 切換到上一個
                }
            }

            // ===== 🆕 E 鍵：選擇下一個角色 =====
            if (key === 'e') {
                if (!this.isInDialogue) {
                    this.switchCharacter(1);  // 切換到下一個
                }
            }

            // ===== 🆕 G 鍵：互動鍵（優先順序：拾取物品 > 與 NPC 對話 > 進入/離開建築物）=====
            if (key === 'g') {
                console.log('[ExplorationScreen] G key pressed - isInDialogue:', this.isInDialogue,
                    'nearbyNPC:', this.nearbyNPC?.name, 'nearbyItem:', this.nearbyItem?.name,
                    'nearbyBuilding:', this.nearbyBuilding?.name);

                // 🔧 緊急修復：如果 isInDialogue 卡住（對話 UI 沒有顯示），強制重置
                if (this.isInDialogue) {
                    const dialogueUI = document.getElementById('dialogue-container');
                    const isDialogueUIVisible = dialogueUI && dialogueUI.style.display !== 'none';

                    if (!isDialogueUIVisible) {
                        console.warn('[ExplorationScreen] ⚠️ isInDialogue 卡住！強制重置...');
                        this.isInDialogue = false;
                        this.currentDialogue = null;
                        this.currentAIDialogue = null;
                        this.isLoadingDialogue = false;
                        this.keys['g'] = false;
                        // 重新檢查一次附近的互動對象
                        console.log('[ExplorationScreen] ✅ 對話狀態已重置，繼續處理 G 鍵...');
                    } else {
                        // 對話 UI 正常顯示中，不處理 G 鍵
                        console.log('[ExplorationScreen] G key blocked - already in dialogue (UI visible)');
                        return;
                    }
                } else if (this.currentScene === 'indoor' && this.interiorManager) {
                    // 室內場景 - 處理退出建築物
                    const handled = this.interiorManager.handleInteraction();
                    if (handled) {
                        // 退出建築物成功，更新場景狀態
                        this.currentScene = 'outdoor';
                        console.log('[ExplorationScreen] Exited building, returned to outdoor');
                    }
                } else if (this.nearbyItem) {
                    // 優先拾取物品
                    console.log('[ExplorationScreen] Picking up item:', this.nearbyItem.name);
                    try {
                        this.pickupItem(this.nearbyItem);
                    } catch (error) {
                        console.error('[ExplorationScreen] Error picking up item:', error);
                    }
                } else if (this.nearbyNPC) {
                    // 與 NPC 對話
                    console.log('[ExplorationScreen] Starting dialogue with:', this.nearbyNPC.name);
                    try {
                        this.startDialogue(this.nearbyNPC).catch(err => {
                            console.error('[ExplorationScreen] Dialogue error:', err);
                            // 確保重置對話狀態
                            this.isInDialogue = false;
                            this.currentDialogue = null;
                        });
                    } catch (error) {
                        console.error('[ExplorationScreen] Error starting dialogue:', error);
                        this.isInDialogue = false;
                        this.currentDialogue = null;
                    }
                } else if (this.nearbyBuilding && this.currentScene === 'outdoor') {
                    // 進入建築物
                    console.log('[ExplorationScreen] Entering building:', this.nearbyBuilding.name);
                    this.enterBuilding(this.nearbyBuilding);
                } else {
                    console.log('[ExplorationScreen] G key pressed but no valid interaction target');
                }
            }

            // Space 跳跃/飞行/對話推進
            if (e.code === 'Space') {
                e.preventDefault();

                if (this.isInDialogue) {
                    // 對話模式：推進對話
                    this.advanceDialogue();
                } else if (this.isFlightMode) {
                    // 飞行模式：上升由 update 方法处理
                } else {
                    // ===== Phase 5.5: 跳跃模式 - 使用當前控制的角色 =====
                    const controlled = this.getCurrentControlledCharacter();
                    if (controlled.onGround) {
                        controlled.vy = controlled.jumpPower;
                        controlled.onGround = false;
                        console.log('[ExplorationScreen] Jump!');
                    }
                }
            }
        });

        // 键盘松开
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // 窗口失焦時重置所有按鍵（防止按鍵卡住）
        window.addEventListener('blur', () => {
            console.log('[ExplorationScreen] Window lost focus, resetting all keys');
            Object.keys(this.keys).forEach(key => {
                this.keys[key] = false;
            });
        });

        console.log('[ExplorationScreen] Input handlers attached');
    }

    start() {
        console.log('[ExplorationScreen] 🎮 Starting game loop...');

        // ===== 🔍 啟動前驗證 Canvas 狀態 =====
        this.validateCanvasState();

        console.log('[ExplorationScreen] 🎮 啟動遊戲循環...');
        this.isRunning = true;
        this.startTime = Date.now();
        this.lastTime = performance.now();

        // ===== 🔧 註冊全局調試命令 =====
        window.debugExploration = () => this.debugCanvasState();

        console.log('[ExplorationScreen] 💡 提示：可使用 window.debugExploration() 來檢查 Canvas 狀態');
        console.log('[ExplorationScreen] 🚀 調用 gameLoop() 開始渲染...');

        this.gameLoop(this.lastTime);
        console.log('[ExplorationScreen] ✅ gameLoop() 已調用');
    }

    /**
     * ===== 🔍 驗證 Canvas 狀態 =====
     */
    validateCanvasState() {
        const allCanvases = document.querySelectorAll('canvas');
        const explorationCanvases = document.querySelectorAll('#exploration-canvas-new');

        console.log('[ExplorationScreen] 🔍 Canvas 驗證：');
        console.log('  總 Canvas 數:', allCanvases.length);
        console.log('  Exploration Canvas 數:', explorationCanvases.length);

        if (explorationCanvases.length === 0) {
            console.error('[ExplorationScreen] ❌ 錯誤：找不到 exploration-canvas-new！');
            return false;
        }

        if (explorationCanvases.length > 1) {
            console.error('[ExplorationScreen] ❌ 警告：檢測到', explorationCanvases.length, '個 exploration-canvas-new！');
            console.error('  這可能導致渲染到錯誤的 Canvas 上。');

            explorationCanvases.forEach((canvas, index) => {
                console.log(`  Canvas ${index}:`, {
                    width: canvas.width,
                    height: canvas.height,
                    zIndex: window.getComputedStyle(canvas).zIndex,
                    display: window.getComputedStyle(canvas).display,
                    parent: canvas.parentNode?.className
                });
            });
        }

        console.log('[ExplorationScreen] 當前使用的 Canvas:', {
            width: this.canvas?.width,
            height: this.canvas?.height,
            context: this.ctx ? 'OK' : 'MISSING'
        });

        return explorationCanvases.length === 1;
    }

    /**
     * ===== 🔧 調試命令：檢查 Canvas 狀態 =====
     */
    debugCanvasState() {
        console.log('========================================');
        console.log('🔍 Exploration Canvas Debug Info');
        console.log('========================================');

        this.validateCanvasState();

        console.log('\n📊 Game State:');
        console.log('  isRunning:', this.isRunning);
        console.log('  currentScene:', this.currentScene);
        console.log('  player:', this.player ? 'OK' : 'MISSING');
        console.log('  NPCs:', this.npcs?.length || 0);
        console.log('  Items:', this.items?.length || 0);
        console.log('  Partners:', this.partners?.length || 0);
        console.log('  Buildings:', this.buildingManager?.getBuildingCount() || 0);

        console.log('\n🎨 Rendering:');
        console.log('  Canvas:', this.canvas ? 'OK' : 'MISSING');
        console.log('  Context:', this.ctx ? 'OK' : 'MISSING');
        console.log('  Camera:', this.camera);

        console.log('========================================');

        return {
            canvas: this.canvas,
            ctx: this.ctx,
            isRunning: this.isRunning,
            state: {
                player: !!this.player,
                npcs: this.npcs?.length,
                items: this.items?.length,
                partners: this.partners?.length,
                buildings: this.buildingManager?.getBuildingCount()
            }
        };
    }

    gameLoop(timestamp) {
        if (!this.isRunning) {
            console.log('[ExplorationScreen] ⚠️ gameLoop called but isRunning = false');
            return;
        }

        // 只在第一幀和每 60 幀打印一次，避免刷屏
        if (!this.frameCount) this.frameCount = 0;
        this.frameCount++;
        if (this.frameCount === 1 || this.frameCount % 60 === 0) {
            console.log(`[ExplorationScreen] 🎬 Frame ${this.frameCount} rendering...`);
        }

        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
        this.lastTime = timestamp;

        this.update(dt);
        this.render_frame();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update(dt) {
        // ===== Phase 5.5: 獲取當前控制的角色 =====
        const controlled = this.getCurrentControlledCharacter();

        // 水平移动
        controlled.vx = 0;
        if (this.keys['a']) controlled.vx = -controlled.speed;
        if (this.keys['d']) controlled.vx = controlled.speed;

        // 垂直移动（根据模式）
        if (this.isFlightMode) {
            // ===== 飞行模式 =====
            controlled.vy = 0;
            if (this.keys['w'] || this.keys[' ']) controlled.vy = -this.flySpeed;
            if (this.keys['s']) controlled.vy = this.flySpeed;

            // 飞行模式下没有重力
        } else {
            // ===== 正常跳跃模式 =====
            // 应用重力
            controlled.vy += this.gravity * dt;

            // W/S 键在跳跃模式下不生效，只有 Space 跳跃
        }

        // 更新玩家位置
        controlled.x += controlled.vx * dt;
        controlled.y += controlled.vy * dt;

        // 地面碰撞检测（仅在非飞行模式）
        if (!this.isFlightMode) {
            if (controlled.y + controlled.height >= this.groundY) {
                controlled.y = this.groundY - controlled.height;
                controlled.vy = 0;
                controlled.onGround = true;
            } else {
                controlled.onGround = false;
            }
        }

        // 边界限制（水平方向无限制，垂直方向有限制）
        // 水平：允许无限向左右移动（相机会跟随）
        // 垂直：不能超出天空
        controlled.y = Math.max(0, controlled.y);

        // 飞行模式下也不能低于地面
        if (this.isFlightMode) {
            controlled.y = Math.min(this.groundY - controlled.height, controlled.y);
        }

        // ===== Phase 5.5: 更新相機跟隨當前控制的角色 =====
        this.camera.targetX = controlled.x - this.canvas.width / 2 + controlled.width / 2;
        this.camera.x += (this.camera.targetX - this.camera.x) * this.camera.smoothFactor;

        // 更新背景偏移（视差效果）
        this.backgroundOffset = -this.camera.x * 0.3;
        this.cloudOffset = -this.camera.x * 0.5;

        // ===== Phase 2: 檢查附近的 NPC =====
        if (!this.isInDialogue) {
            this.checkNearbyNPC();
        }

        // ===== Phase 4: 檢查附近的物品 =====
        if (!this.isInDialogue) {
            this.checkNearbyItem();
        }

        // ===== Phase 7 (階段 4): 檢查附近的建築物 =====
        if (!this.isInDialogue && this.buildingManager && this.currentScene === 'outdoor') {
            this.checkNearbyBuilding();
        }

        // ===== Phase 7.2 (階段 4): 更新室內場景系統 =====
        if (this.interiorManager && this.currentScene === 'indoor') {
            this.interiorManager.update(dt);
        }

        // ===== Phase 5.4: 更新夥伴狀態 =====
        this.updatePartners(dt);

        // ===== Phase 1: 同步 3D 渲染器 =====
        if (this.threeRenderer) {
            // 同步相機
            this.threeRenderer.syncCamera(this.camera);

            // 同步玩家與夥伴角色
            const allCharacters = [this.player, ...this.partners];
            allCharacters.forEach((char, index) => {
                const id = char.characterId || `player_${index}`;
                // 添加或更新角色（使用 placeholder，稍後可替換為 3D 模型）
                this.threeRenderer.addOrUpdateCharacter(id, char, null);
            });

            // 同步 NPCs（藍色 3D 膠囊）
            this.npcs.forEach((npc, index) => {
                const npcId = npc.id || `npc_${index}`;
                const npcObject = {
                    x: npc.x,
                    y: npc.y,
                    width: npc.width || 80,
                    height: npc.height || 100,
                    type: 'npc',
                    facingRight: npc.facingRight !== undefined ? npc.facingRight : true
                };
                this.threeRenderer.addOrUpdateCharacter(npcId, npcObject, null);
            });
        }

        // 更新调试信息
        this.updateDebugInfo();
    }

    /**
     * ===== Phase 5.4: Update Partners =====
     * 更新夥伴狀態（降落動畫、跟隨等）
     */
    updatePartners(dt) {
        this.partners.forEach(partner => {
            if (partner.isLanding) {
                // 降落動畫：從上方降落到目標位置
                if (partner.y < partner.targetY) {
                    partner.y += partner.landingSpeed * dt;

                    if (partner.y >= partner.targetY) {
                        partner.y = partner.targetY;
                        partner.isLanding = false;
                        partner.onGround = true;  // ===== 🔧 設置為在地面上 =====
                        partner.vy = 0;           // ===== 🔧 停止垂直移動 =====
                        console.log(`[ExplorationScreen] Partner ${partner.characterId} landing complete`);
                    }
                }
            } else {
                // 降落完成後的行為（暫時靜止）
                // Phase 5.5 會添加跟隨和切換控制邏輯

                // ===== 🔧 非降落狀態下也要檢查地面碰撞（與 update() 一致）=====
                if (!this.isFlightMode) {
                    if (partner.y + partner.height >= this.groundY) {
                        partner.y = this.groundY - partner.height;
                        partner.vy = 0;
                        partner.onGround = true;
                    } else {
                        partner.onGround = false;
                    }
                }
            }
        });
    }

    updateDebugInfo() {
        const charEl = document.getElementById('debug-character');
        const posEl = document.getElementById('debug-position');
        const modeEl = document.getElementById('debug-mode');
        const groundEl = document.getElementById('debug-ground');

        // ===== 🔧 修復：使用當前控制的角色，而不是固定的 player =====
        const controlled = this.getCurrentControlledCharacter();

        if (charEl) charEl.textContent = controlled.characterId || controlled.name || 'Unknown';
        if (posEl) posEl.textContent = `(${Math.round(controlled.x)}, ${Math.round(controlled.y)})`;
        if (modeEl) modeEl.textContent = this.isFlightMode ? 'Flight' : 'Ground';
        if (groundEl) groundEl.textContent = controlled.onGround ? 'Yes' : 'No';
    }

    render_frame() {
        // 只在第一幀打印，避免刷屏
        if (this.frameCount === 1) {
            console.log('[ExplorationScreen] 🎨 render_frame() 開始渲染...');
            console.log('[ExplorationScreen] Canvas:', this.canvas.width, 'x', this.canvas.height);
            console.log('[ExplorationScreen] Context:', this.ctx);
        }

        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 保存当前状态
        this.ctx.save();

        // ===== Phase 7.2: 根據場景類型渲染 =====
        if (this.currentScene === 'indoor' && this.interiorManager) {
            // ===== 室內場景渲染 =====
            this.interiorManager.render(this.ctx, this.camera);

            // 室內不需要相機變換（固定視角）
            // 只繪製玩家和夥伴
            this.drawPlayer();
            this.drawPartners();
        } else {
            // ===== 戶外場景渲染 =====

            // 绘制背景层（跟随相机，视差效果）
            this.drawBackground();

            // 绘制云朵层（视差效果）
            this.drawClouds();

            // 绘制地面层
            this.drawGround();

            // 应用相机变换（世界坐标系）
            this.ctx.translate(-this.camera.x, 0);

            // Phase 7: 繪製建築物
            if (this.buildingManager) {
                this.buildingManager.render(this.ctx, this.camera);
            }

            // Phase 4: 繪製物品
            this.drawItems();

            // Phase 2: 繪製 NPCs
            this.drawNPCs();

            // 绘制玩家
            this.drawPlayer();

            // Phase 5.4: 繪製夥伴
            this.drawPartners();
        }

        // 恢复状态
        this.ctx.restore();

        // ===== Phase 1: 渲染 3D 層 =====
        if (this.threeRenderer) {
            this.threeRenderer.render();
        }
    }

    drawBackground() {
        // 天空渐变
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#87CEEB');
        gradient.addColorStop(0.6, '#B0E0E6');
        gradient.addColorStop(1, '#E0F6FF');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 远景山脉（视差滚动）
        this.ctx.fillStyle = 'rgba(100, 150, 100, 0.3)';
        const mountainOffset = this.backgroundOffset * 0.2;
        for (let i = -2; i < 10; i++) {
            const x = i * 300 + mountainOffset;
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.groundY);
            this.ctx.lineTo(x + 150, this.groundY - 200);
            this.ctx.lineTo(x + 300, this.groundY);
            this.ctx.closePath();
            this.ctx.fill();
        }
    }

    drawClouds() {
        // 绘制云朵（视差滚动）
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 8; i++) {
            const baseX = i * 400 + this.cloudOffset;
            const y = 100 + (i % 3) * 80;

            // 确保云朵在可见范围内
            if (baseX > -200 && baseX < this.canvas.width + 200) {
                this.ctx.beginPath();
                this.ctx.arc(baseX, y, 40, 0, Math.PI * 2);
                this.ctx.arc(baseX + 30, y, 50, 0, Math.PI * 2);
                this.ctx.arc(baseX + 60, y, 40, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }

    drawGround() {
        // 地面（绿色）
        this.ctx.fillStyle = '#90EE90';
        this.ctx.fillRect(0, this.groundY, this.canvas.width, this.canvas.height - this.groundY);

        // 地面线条
        this.ctx.strokeStyle = '#228B22';
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.groundY);
        this.ctx.lineTo(this.canvas.width, this.groundY);
        this.ctx.stroke();

        // 地面装饰（草地纹理）
        this.ctx.fillStyle = '#7CCD7C';
        for (let i = 0; i < this.canvas.width; i += 20) {
            const offsetX = (this.camera.x * 0.5) % 20;
            this.ctx.fillRect(i - offsetX, this.groundY + 10, 2, 10);
        }
    }

    drawPlayer() {
        // 绘制玩家
        if (this.player.image && this.player.image.complete) {
            this.ctx.drawImage(
                this.player.image,
                this.player.x,
                this.player.y,
                this.player.width,
                this.player.height
            );
        } else {
            // 备用：红色矩形
            this.ctx.fillStyle = '#FF6B6B';
            this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);

            // 显示 "Loading..."
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Loading...', this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
            this.ctx.textAlign = 'left';
        }
    }

    /**
     * ===== Phase 5.4: Draw Partners =====
     * 繪製夥伴角色
     */
    drawPartners() {
        this.partners.forEach(partner => {
            // 繪製夥伴圖片或備用矩形
            if (partner.image && partner.image.complete) {
                this.ctx.drawImage(
                    partner.image,
                    partner.x,
                    partner.y,
                    partner.width,
                    partner.height
                );
            } else {
                // 備用：使用角色顏色的矩形
                this.ctx.fillStyle = partner.color;
                this.ctx.fillRect(partner.x, partner.y, partner.width, partner.height);

                // 顯示角色名稱首字母
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.font = 'bold 48px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(
                    partner.name[0] || '?',
                    partner.x + partner.width / 2,
                    partner.y + partner.height / 2 + 15
                );
                this.ctx.textAlign = 'left';
            }

            // 降落中顯示特效（可選）
            if (partner.isLanding) {
                // 繪製降落軌跡
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(partner.x + partner.width / 2, 0);
                this.ctx.lineTo(partner.x + partner.width / 2, partner.y);
                this.ctx.stroke();

                // 繪製「Landing...」文字
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('Landing...', partner.x + partner.width / 2, partner.y - 20);
                this.ctx.textAlign = 'left';
            }
        });
    }

    /**
     * ===== Phase 4: Draw Items =====
     */
    drawItems() {
        this.items.forEach(item => {
            if (item.collected) return; // Skip collected items

            // Draw item shadow
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            this.ctx.ellipse(
                item.x + item.width / 2,
                item.y + item.height + 5,
                item.width * 0.4,
                item.height * 0.15,
                0, 0, Math.PI * 2
            );
            this.ctx.fill();

            // Draw item body
            this.ctx.fillStyle = item.color;
            this.ctx.fillRect(item.x, item.y, item.width, item.height);

            // Draw item border
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(item.x, item.y, item.width, item.height);

            // Draw item icon
            this.ctx.font = `${item.width * 0.7}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(
                item.icon,
                item.x + item.width / 2,
                item.y + item.height / 2
            );

            // Draw sparkle effect if nearby
            if (this.nearbyItem === item) {
                const time = Date.now() / 200;
                const sparkleSize = 5 + Math.sin(time) * 2;
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.beginPath();
                this.ctx.arc(item.x + item.width / 2, item.y - 10, sparkleSize, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
    }

    /**
     * ===== Phase 2: Draw NPCs =====
     */
    drawNPCs() {
        this.npcs.forEach(npc => {
            // Draw NPC body
            this.ctx.fillStyle = npc.color;
            this.ctx.fillRect(npc.x, npc.y, npc.width, npc.height);

            // Draw NPC border
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(npc.x, npc.y, npc.width, npc.height);

            // Draw NPC name above their head
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 3;
            this.ctx.strokeText(npc.name, npc.x + npc.width / 2, npc.y - 10);
            this.ctx.fillText(npc.name, npc.x + npc.width / 2, npc.y - 10);
            this.ctx.textAlign = 'left';

            // Draw interaction indicator if nearby
            if (this.nearbyNPC === npc) {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('!', npc.x + npc.width / 2, npc.y - 30);
                this.ctx.textAlign = 'left';
            }
        });
    }

    /**
     * ===== Phase 2: Check Nearby NPC =====
     * ===== Phase 5.5: 使用當前控制的角色進行檢測 =====
     */
    checkNearbyNPC() {
        const controlled = this.getCurrentControlledCharacter();
        let closestNPC = null;
        let closestDistance = Infinity;

        this.npcs.forEach(npc => {
            const dx = (controlled.x + controlled.width / 2) - (npc.x + npc.width / 2);
            const dy = (controlled.y + controlled.height / 2) - (npc.y + npc.height / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.interactRange && distance < closestDistance) {
                closestDistance = distance;
                closestNPC = npc;
            }
        });

        // Update nearby NPC
        if (closestNPC !== this.nearbyNPC) {
            this.nearbyNPC = closestNPC;
        }

        // Show/hide interaction prompt (only if no nearby item - items have priority)
        const promptElement = document.getElementById('interaction-prompt');
        const npcNameElement = document.getElementById('npc-name');

        // ===== 🆕 安全檢查：如果元素不存在就跳過 =====
        if (!promptElement || !npcNameElement) {
            return;
        }

        if (!this.nearbyItem && this.nearbyNPC) {
            npcNameElement.textContent = this.nearbyNPC.name;
            promptElement.style.display = 'flex';
        } else if (!this.nearbyItem) {
            promptElement.style.display = 'none';
        }
    }

    /**
     * ===== Phase 4: Check Nearby Item =====
     * ===== Phase 5.5: 使用當前控制的角色進行檢測 =====
     */
    checkNearbyItem() {
        const controlled = this.getCurrentControlledCharacter();
        let closestItem = null;
        let closestDistance = Infinity;

        this.items.forEach(item => {
            if (item.collected) return;

            const dx = (controlled.x + controlled.width / 2) - (item.x + item.width / 2);
            const dy = (controlled.y + controlled.height / 2) - (item.y + item.height / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.interactRange && distance < closestDistance) {
                closestDistance = distance;
                closestItem = item;
            }
        });

        this.nearbyItem = closestItem;

        // Show/hide item pickup prompt
        const promptElement = document.getElementById('interaction-prompt');
        const npcNameElement = document.getElementById('npc-name');

        // ===== 🆕 安全檢查：如果元素不存在就跳過 =====
        if (!promptElement || !npcNameElement) {
            return;
        }

        if (this.nearbyItem) {
            npcNameElement.textContent = `Pick up ${this.nearbyItem.name}`;
            promptElement.style.display = 'flex';
        }
    }

    /**
     * ===== Phase 4: Pickup Item =====
     */
    pickupItem(item) {
        console.log('[ExplorationScreen] Picked up:', item.name);

        // Mark item as collected
        item.collected = true;

        // Add to collected items count
        if (!this.collectedItems[item.type]) {
            this.collectedItems[item.type] = 0;
        }
        this.collectedItems[item.type]++;

        // Play sound
        audioManager.playSound('success');

        // Check quest objectives
        this.checkQuestObjectivesForItems();

        // Clear nearby item
        this.nearbyItem = null;

        // 🔧 強制重置 G 鍵狀態（防止卡住）
        this.keys['g'] = false;

        console.log('[ExplorationScreen] Collected items:', this.collectedItems);
    }

    /**
     * ===== Phase 7 (階段 4): Check Nearby Building =====
     */
    checkNearbyBuilding() {
        const controlled = this.getCurrentControlledCharacter();
        const playerCenterX = controlled.x + controlled.width / 2;
        const playerCenterY = controlled.y + controlled.height / 2;

        // 使用 BuildingManager 檢查附近的建築物
        const nearbyBuilding = this.buildingManager.checkNearbyBuilding(playerCenterX, playerCenterY);

        // 更新提示 UI
        if (nearbyBuilding && !this.nearbyNPC && !this.nearbyItem) {
            // 顯示進入建築物的提示
            const promptElement = document.getElementById('interaction-prompt');
            const npcNameElement = document.getElementById('npc-name');

            if (promptElement && npcNameElement) {
                npcNameElement.textContent = `Enter ${nearbyBuilding.name}`;
                promptElement.style.display = 'flex';
            }
        }

        this.nearbyBuilding = nearbyBuilding;
    }

    /**
     * ===== Phase 7 (階段 4): Enter Building =====
     */
    async enterBuilding(building) {
        console.log(`[ExplorationScreen] Entering building: ${building.name}`);

        // 隱藏互動提示
        const promptElement = document.getElementById('interaction-prompt');
        if (promptElement) {
            promptElement.style.display = 'none';
        }

        // 播放音效
        audioManager.playSound('button');

        // ===== Phase 7.2: 切換到室內場景 =====
        if (this.interiorManager) {
            await this.interiorManager.enterBuilding(building);

            // 更新場景狀態
            this.currentScene = 'indoor';

            // 顯示通知
            eventBus.emit('SHOW_TOAST', {
                message: `Entered ${building.name}`,
                type: 'info',
                duration: 2000
            });

            console.log('[ExplorationScreen] Switched to indoor scene');
        } else {
            console.error('[ExplorationScreen] InteriorManager not initialized!');
        }
    }

    /**
     * ===== Phase 2: Start Dialogue =====
     */
    async startDialogue(npc) {
        console.log('[ExplorationScreen] Starting dialogue with', npc.name);

        this.isInDialogue = true;
        this.currentDialogue = npc;
        npc.currentDialogueIndex = 0;

        // 🔧 強制重置 G 鍵狀態（防止卡住）
        this.keys['g'] = false;

        // ===== Phase 3: Check quest objectives when talking to NPC =====
        this.checkQuestObjectives(npc);

        // Hide interaction prompt
        document.getElementById('interaction-prompt').style.display = 'none';

        // Play sound
        audioManager.playSound('button');

        // ===== Phase 6 (階段 3): AI 對話生成 =====
        await this.generateAIDialogue(npc);

        // Show dialogue UI (with AI-generated content or fallback)
        this.showDialogueUI();
    }

    /**
     * ===== Phase 6 (階段 3): Generate AI Dialogue =====
     * 使用後端 AI API 生成 NPC 對話
     */
    async generateAIDialogue(npc) {
        try {
            this.isLoadingDialogue = true;

            // 獲取互動歷史
            const history = this.npcInteractionHistory.get(npc.id) || { count: 0, lastDialogue: null, timestamp: null };
            const previousInteractions = history.count;

            // 準備請求數據
            const requestData = {
                npc_id: npc.id,
                npc_type: npc.type || 'resident',
                player_id: this.player?.characterId || 'jett',
                mission_context: {
                    has_mission: !!this.activeQuest,
                    is_target: this.activeQuest && this.activeQuest.targetNPCs?.includes(npc.id),
                },
                previous_interactions: new Array(previousInteractions).fill({ timestamp: Date.now() }),
                is_mission_npc: !!npc.quest,
                mission_registered: !!npc.questGiven
            };

            console.log('[ExplorationScreen] Requesting AI dialogue for NPC:', npc.id, requestData);

            // 調用 AI API（帶 3 秒 timeout）
            const fetchPromise = fetch('http://localhost:8001/api/v1/dialogue/npc/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('AI dialogue API timeout (3s)')), 3000);
            });

            const response = await Promise.race([fetchPromise, timeoutPromise]);

            if (!response.ok) {
                throw new Error(`AI dialogue API returned ${response.status}`);
            }

            const aiDialogue = await response.json();

            console.log('[ExplorationScreen] AI dialogue generated:', aiDialogue);

            // 保存 AI 生成的對話
            this.currentAIDialogue = {
                lines: aiDialogue.lines || [],
                emotion: aiDialogue.emotion || 'neutral',
                canRegisterMission: aiDialogue.can_register_mission || false
            };

            // 更新互動歷史
            this.npcInteractionHistory.set(npc.id, {
                count: previousInteractions + 1,
                lastDialogue: aiDialogue.lines,
                timestamp: Date.now()
            });

            this.isLoadingDialogue = false;

        } catch (error) {
            console.warn('[ExplorationScreen] AI dialogue generation failed, using fallback:', error);

            // Fallback: 使用 NPC 的原始對話
            this.currentAIDialogue = {
                lines: npc.dialogue || ['Hello! How can I help you?'],
                emotion: 'neutral',
                canRegisterMission: !!npc.quest && !npc.questGiven
            };

            this.isLoadingDialogue = false;
        }
    }

    /**
     * ===== Phase 2: Show Dialogue UI =====
     * ===== Phase 6 (階段 3): 支援 AI 生成的對話 =====
     */
    showDialogueUI() {
        if (!this.currentDialogue) return;

        const npc = this.currentDialogue;

        // ===== Phase 6: 顯示加載狀態 =====
        if (this.isLoadingDialogue) {
            document.getElementById('dialogue-npc-name').textContent = npc.name;
            document.getElementById('dialogue-text').textContent = '💭 Thinking...';
            document.getElementById('dialogue-container').style.display = 'flex';
            document.getElementById('quest-options').style.display = 'none';
            document.getElementById('dialogue-continue').style.display = 'none';
            return;
        }

        // ===== Phase 6: 優先使用 AI 生成的對話 =====
        let dialogueText;
        let dialogueLines;
        let isAIGenerated = false;

        if (this.currentAIDialogue && this.currentAIDialogue.lines.length > 0) {
            // 使用 AI 生成的對話
            dialogueLines = this.currentAIDialogue.lines;
            dialogueText = dialogueLines[npc.currentDialogueIndex] || dialogueLines[0];
            isAIGenerated = true;

            console.log('[ExplorationScreen] Showing AI dialogue:', {
                index: npc.currentDialogueIndex,
                total: dialogueLines.length,
                text: dialogueText,
                emotion: this.currentAIDialogue.emotion
            });
        } else {
            // Fallback: 使用原始對話
            dialogueLines = npc.dialogue || ['Hello!'];
            dialogueText = dialogueLines[npc.currentDialogueIndex] || dialogueLines[0];

            console.log('[ExplorationScreen] Showing fallback dialogue:', dialogueText);
        }

        // 顯示對話
        const npcNameElement = document.getElementById('dialogue-npc-name');
        if (npcNameElement) {
            npcNameElement.textContent = npc.name;
            // ===== Phase 6: 添加 AI 標記 =====
            if (isAIGenerated && npc.currentDialogueIndex === 0) {
                npcNameElement.innerHTML = `${npc.name} <span style="font-size: 0.7em; color: #4CAF50;">✨ AI</span>`;
            }
        }

        document.getElementById('dialogue-text').textContent = dialogueText;
        document.getElementById('dialogue-container').style.display = 'flex';

        // ===== Phase 3: Hide quest options by default =====
        document.getElementById('quest-options').style.display = 'none';
        document.getElementById('dialogue-continue').style.display = 'flex';
    }

    /**
     * ===== Phase 2: Advance Dialogue =====
     * ===== Phase 6 (階段 3): 支援 AI 生成的對話 =====
     */
    advanceDialogue() {
        if (!this.currentDialogue) return;

        const npc = this.currentDialogue;
        npc.currentDialogueIndex++;

        // ===== Phase 6: 根據 AI 對話或原始對話決定長度 =====
        let dialogueLength;
        if (this.currentAIDialogue && this.currentAIDialogue.lines.length > 0) {
            dialogueLength = this.currentAIDialogue.lines.length;
        } else {
            dialogueLength = npc.dialogue?.length || 1;
        }

        // Check if we've reached the end of dialogue
        if (npc.currentDialogueIndex >= dialogueLength) {
            // ===== Phase 3: Check if NPC has a quest to offer =====
            // ===== Phase 6: 同時檢查 AI 對話是否允許註冊任務 =====
            const canOfferQuest = (npc.quest && !npc.questGiven) ||
                                  (this.currentAIDialogue?.canRegisterMission);

            if (canOfferQuest) {
                // Show quest options instead of ending dialogue
                this.showQuestOptions(npc);
            } else {
                // No quest or quest already given, end dialogue
                this.endDialogue();
            }
        } else {
            // Show next dialogue line
            this.showDialogueUI();
            audioManager.playSound('button');
        }
    }

    /**
     * ===== Phase 2: End Dialogue =====
     */
    endDialogue() {
        console.log('[ExplorationScreen] Ending dialogue');

        this.isInDialogue = false;
        this.currentDialogue = null;

        // ===== Phase 6 (階段 3): 清除 AI 對話狀態 =====
        this.currentAIDialogue = null;
        this.isLoadingDialogue = false;

        // 🔧 強制重置 G 鍵狀態（防止卡住）
        this.keys['g'] = false;

        // Hide dialogue UI
        document.getElementById('dialogue-container').style.display = 'none';

        // Play sound
        audioManager.playSound('button');

        // Re-check nearby NPCs
        this.checkNearbyNPC();
    }

    /**
     * ===== Phase 3: Show Quest Options =====
     */
    showQuestOptions(npc) {
        console.log('[ExplorationScreen] Showing quest options for', npc.quest.title);

        // Update dialogue text to show quest description
        document.getElementById('dialogue-text').textContent = npc.quest.description;

        // Hide continue prompt, show quest buttons
        document.getElementById('dialogue-continue').style.display = 'none';
        document.getElementById('quest-options').style.display = 'flex';

        // Set up button listeners
        const acceptBtn = document.getElementById('quest-accept');
        const declineBtn = document.getElementById('quest-decline');

        // Remove old listeners
        const newAcceptBtn = acceptBtn.cloneNode(true);
        const newDeclineBtn = declineBtn.cloneNode(true);
        acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
        declineBtn.parentNode.replaceChild(newDeclineBtn, declineBtn);

        // Add new listeners
        newAcceptBtn.addEventListener('click', () => this.acceptQuest(npc));
        newDeclineBtn.addEventListener('click', () => this.declineQuest(npc));
    }

    /**
     * ===== Phase 3: Accept Quest =====
     */
    acceptQuest(npc) {
        console.log('[ExplorationScreen] Quest accepted:', npc.quest.title);

        // Set active quest (deep copy to avoid reference issues)
        this.activeQuest = JSON.parse(JSON.stringify(npc.quest));
        npc.questGiven = true;

        // Show quest tracker
        this.updateQuestTracker();

        // Play sound
        audioManager.playSound('success');

        // End dialogue
        this.endDialogue();

        // Show notification
        console.log('[ExplorationScreen] Quest started:', this.activeQuest.title);
    }

    /**
     * ===== Phase 3: Decline Quest =====
     */
    declineQuest(npc) {
        console.log('[ExplorationScreen] Quest declined');

        // Play sound
        audioManager.playSound('button');

        // End dialogue
        this.endDialogue();
    }

    /**
     * ===== Phase 3: Update Quest Tracker =====
     */
    updateQuestTracker() {
        if (!this.activeQuest) {
            document.getElementById('quest-tracker').style.display = 'none';
            return;
        }

        // Show tracker
        const tracker = document.getElementById('quest-tracker');
        tracker.style.display = 'block';

        // Update title
        document.getElementById('quest-title').textContent = this.activeQuest.title;

        // Update objectives
        const objectivesContainer = document.getElementById('quest-objectives');
        objectivesContainer.innerHTML = '';

        this.activeQuest.objectives.forEach((objective, index) => {
            const objDiv = document.createElement('div');
            objDiv.className = 'quest-objective';
            if (objective.completed) objDiv.classList.add('completed');

            // Build objective text with progress for collect_items type
            let objectiveText = objective.description;
            if (objective.type === 'collect_items') {
                const collected = this.collectedItems[objective.itemType] || 0;
                objectiveText = `${objective.description} (${collected}/${objective.amount})`;
            }

            objDiv.innerHTML = `
                <span class="objective-checkbox">${objective.completed ? '✓' : '☐'}</span>
                <span class="objective-text">${objectiveText}</span>
            `;

            objectivesContainer.appendChild(objDiv);
        });
    }

    /**
     * ===== Phase 3: Check Quest Objectives =====
     * Call this when player talks to an NPC
     */
    checkQuestObjectives(npc) {
        if (!this.activeQuest) return;

        let questUpdated = false;

        this.activeQuest.objectives.forEach(objective => {
            if (objective.completed) return;

            // Check talk_to_npc objectives
            if (objective.type === 'talk_to_npc' && objective.targetNPC === npc.id) {
                objective.completed = true;
                questUpdated = true;
                console.log('[ExplorationScreen] Objective completed:', objective.description);
            }
        });

        if (questUpdated) {
            this.updateQuestTracker();

            // Check if all objectives are completed
            const allCompleted = this.activeQuest.objectives.every(obj => obj.completed);
            if (allCompleted) {
                this.completeQuest();
            }
        }
    }

    /**
     * ===== Phase 4: Check Quest Objectives for Items =====
     * Call this when player collects an item
     */
    checkQuestObjectivesForItems() {
        if (!this.activeQuest) return;

        let questUpdated = false;

        this.activeQuest.objectives.forEach(objective => {
            if (objective.completed) return;

            // Check collect_items objectives
            if (objective.type === 'collect_items') {
                const collected = this.collectedItems[objective.itemType] || 0;
                if (collected >= objective.amount) {
                    objective.completed = true;
                    questUpdated = true;
                    console.log('[ExplorationScreen] Objective completed:', objective.description);
                }
            }
        });

        if (questUpdated) {
            this.updateQuestTracker();

            // Check if all objectives are completed
            const allCompleted = this.activeQuest.objectives.every(obj => obj.completed);
            if (allCompleted) {
                this.completeQuest();
            }
        }
    }

    /**
     * ===== Phase 3: Complete Quest =====
     */
    completeQuest() {
        console.log('[ExplorationScreen] Quest completed:', this.activeQuest.title);

        // Add rewards
        const rewards = this.activeQuest.rewards;
        this.questRewards.money += rewards.money;
        this.questRewards.exp += rewards.exp;

        // ===== 修復：正確添加獎勵到遊戲狀態 =====
        // 添加金錢
        gameState.addMoney(rewards.money);
        console.log('[ExplorationScreen] Added money:', rewards.money, '| Total:', gameState.resources.money);

        // 添加經驗值給當前角色
        if (this.player && this.player.characterId) {
            const character = gameState.getCharacter(this.player.characterId);
            if (character) {
                character.addExp(rewards.exp);
                console.log('[ExplorationScreen] Added EXP to', this.player.characterId, ':', rewards.exp);
            }
        }

        // 強制保存
        gameState.save();

        // Add to completed quests
        this.completedQuests.push(this.activeQuest.id);

        // Show completion message (keep it brief, don't lock exploration)
        console.log(`[ExplorationScreen] ✅ Quest Completed! +$${rewards.money}, +${rewards.exp} EXP`);

        // Play sound
        audioManager.playSound('success');

        // ===== 顯示大型獎勵通知（中央彈出）=====
        this.showRewardNotification(this.activeQuest.title, rewards);

        // 修復：立即清除任務，允許接受新任務
        // 顯示完成狀態 2 秒後隱藏追蹤器
        const completedQuestTitle = this.activeQuest.title;
        this.activeQuest = null;

        // 更新追蹤器顯示完成狀態
        const tracker = document.getElementById('quest-tracker');
        if (tracker) {
            tracker.style.display = 'block';
            document.getElementById('quest-title').textContent = `✅ ${completedQuestTitle}`;
            document.getElementById('quest-objectives').innerHTML = `
                <div style="color: #4CAF50; text-align: center; padding: 8px;">
                    Completed! +$${rewards.money}, +${rewards.exp} EXP
                </div>
            `;

            // 3 秒後隱藏追蹤器
            setTimeout(() => {
                tracker.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * ===== Phase 4: Show Reward Notification =====
     * 顯示大型中央獎勵通知
     */
    showRewardNotification(questTitle, rewards) {
        // 創建通知元素
        const notification = document.createElement('div');
        notification.className = 'reward-notification';
        notification.innerHTML = `
            <div class="reward-content">
                <div class="reward-icon">🎉</div>
                <div class="reward-title">Quest Completed!</div>
                <div class="reward-quest-name">${questTitle}</div>
                <div class="reward-items">
                    <div class="reward-item">
                        <span class="reward-icon-small">💰</span>
                        <span class="reward-amount">+$${rewards.money}</span>
                    </div>
                    <div class="reward-item">
                        <span class="reward-icon-small">⭐</span>
                        <span class="reward-amount">+${rewards.exp} EXP</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(notification);

        // 動畫：淡入 → 停留 → 淡出
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => notification.classList.remove('show'), 2500);
        setTimeout(() => notification.remove(), 3000);
    }

    exitExploration() {
        console.log('[ExplorationScreen] Exiting exploration mode');

        this.isRunning = false;

        // 显示结果画面
        const results = {
            mission: this.missionData,
            rewards: {
                money: 100,
                exp: 50
            },
            stats: {
                timeSpent: Date.now() - (this.startTime || Date.now()),
                itemsCollected: 0,
                npcsInteracted: 0
            }
        };

        window.game.renderResults(results);
    }

    addStyles() {
        if (document.getElementById('exploration-new-styles')) return;

        const style = document.createElement('style');
        style.id = 'exploration-new-styles';
        style.textContent = `
            .exploration-screen-new {
                position: relative;
                width: 100%;
                height: 100%;
                background: #000;
            }

            #exploration-canvas-new {
                display: block;
                width: 100%;
                height: 100%;
            }

            .exploration-hint {
                position: absolute;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                font-size: 15px;
                z-index: 10;
                border: 2px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }

            .exploration-hint > div {
                margin: 8px 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .exploration-hint .key {
                display: inline-block;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 6px 14px;
                border-radius: 6px;
                font-weight: bold;
                font-size: 14px;
                min-width: 60px;
                text-align: center;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
            }

            #flight-mode-indicator {
                font-weight: bold;
                padding: 2px 8px;
                border-radius: 4px;
                background: rgba(255, 82, 82, 0.2);
                color: #FF5252;
            }

            .exploration-debug {
                position: absolute;
                bottom: 20px;
                left: 20px;
                background: rgba(0, 0, 0, 0.85);
                color: #0f0;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: 'Courier New', monospace;
                font-size: 13px;
                z-index: 10;
                border: 1px solid rgba(0, 255, 0, 0.3);
            }

            .exploration-debug div {
                margin: 4px 0;
            }

            .exploration-debug span {
                color: #ffff00;
                font-weight: bold;
            }

            /* ===== Phase 2: Interaction Prompt Styles ===== */
            .interaction-prompt {
                position: absolute;
                bottom: 150px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                gap: 12px;
                background: rgba(0, 0, 0, 0.9);
                padding: 12px 24px;
                border-radius: 12px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                z-index: 100;
                animation: pulse 1.5s ease-in-out infinite;
            }

            @keyframes pulse {
                0%, 100% { transform: translateX(-50%) scale(1); }
                50% { transform: translateX(-50%) scale(1.05); }
            }

            .interaction-prompt .prompt-key {
                background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                color: white;
                font-weight: bold;
                font-size: 16px;
                padding: 8px 16px;
                border-radius: 8px;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            }

            .interaction-prompt .prompt-text {
                color: white;
                font-size: 16px;
                font-weight: 600;
            }

            /* ===== Phase 2: Dialogue UI Styles ===== */
            .dialogue-container {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                display: flex;
                justify-content: center;
                align-items: flex-end;
                padding: 40px;
                background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
                z-index: 200;
                pointer-events: none;
            }

            .dialogue-box {
                background: rgba(0, 0, 0, 0.95);
                border: 3px solid rgba(255, 255, 255, 0.4);
                border-radius: 16px;
                padding: 24px 32px;
                max-width: 800px;
                width: 90%;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                pointer-events: auto;
            }

            .dialogue-npc-name {
                color: #4CAF50;
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .dialogue-text {
                color: white;
                font-size: 20px;
                line-height: 1.6;
                margin-bottom: 16px;
                min-height: 60px;
            }

            .dialogue-continue {
                display: flex;
                align-items: center;
                gap: 10px;
                justify-content: flex-end;
                opacity: 0.8;
                animation: blink 1.5s ease-in-out infinite;
            }

            @keyframes blink {
                0%, 100% { opacity: 0.8; }
                50% { opacity: 0.4; }
            }

            .dialogue-continue .prompt-key {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                font-weight: bold;
                font-size: 14px;
                padding: 6px 14px;
                border-radius: 6px;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            }

            .dialogue-continue {
                color: rgba(255, 255, 255, 0.8);
                font-size: 14px;
            }

            /* ===== Phase 3: Quest System Styles ===== */
            .quest-tracker {
                position: absolute;
                top: 20px;
                left: 20px;
                background: rgba(0, 0, 0, 0.9);
                border: 2px solid rgba(255, 215, 0, 0.5);
                border-radius: 12px;
                padding: 16px 20px;
                min-width: 300px;
                max-width: 400px;
                z-index: 50;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            }

            .quest-header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 12px;
                border-bottom: 2px solid rgba(255, 215, 0, 0.3);
                padding-bottom: 8px;
            }

            .quest-icon {
                font-size: 20px;
            }

            .quest-title {
                color: #FFD700;
                font-size: 16px;
                font-weight: bold;
                flex: 1;
            }

            .quest-objectives {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .quest-objective {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 6px 0;
                color: white;
                font-size: 14px;
            }

            .quest-objective.completed {
                opacity: 0.6;
                text-decoration: line-through;
            }

            .objective-checkbox {
                font-size: 16px;
                color: #4CAF50;
                font-weight: bold;
            }

            .quest-objective.completed .objective-checkbox {
                color: #81C784;
            }

            .objective-text {
                flex: 1;
            }

            /* Quest Option Buttons */
            .quest-options {
                display: flex;
                gap: 12px;
                justify-content: center;
                margin-top: 16px;
            }

            .quest-btn {
                padding: 12px 24px;
                font-size: 16px;
                font-weight: bold;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            }

            .quest-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }

            .quest-btn.accept {
                background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                color: white;
            }

            .quest-btn.accept:hover {
                background: linear-gradient(135deg, #45a049 0%, #3d8b40 100%);
            }

            .quest-btn.decline {
                background: linear-gradient(135deg, #757575 0%, #616161 100%);
                color: white;
            }

            .quest-btn.decline:hover {
                background: linear-gradient(135deg, #616161 0%, #424242 100%);
            }

            /* ===== Phase 4: Reward Notification Styles ===== */
            .reward-notification {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.8);
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: 4px solid #FFD700;
                border-radius: 20px;
                padding: 32px 48px;
                z-index: 10000;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: none;
            }

            .reward-notification.show {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }

            .reward-content {
                text-align: center;
                color: white;
            }

            .reward-icon {
                font-size: 64px;
                margin-bottom: 16px;
                animation: bounce 0.6s ease;
            }

            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-20px); }
            }

            .reward-title {
                font-size: 32px;
                font-weight: bold;
                margin-bottom: 12px;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
            }

            .reward-quest-name {
                font-size: 20px;
                margin-bottom: 24px;
                opacity: 0.9;
            }

            .reward-items {
                display: flex;
                gap: 32px;
                justify-content: center;
            }

            .reward-item {
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(255, 255, 255, 0.2);
                padding: 12px 24px;
                border-radius: 12px;
                backdrop-filter: blur(10px);
            }

            .reward-icon-small {
                font-size: 28px;
            }

            .reward-amount {
                font-size: 24px;
                font-weight: bold;
            }

            /* ===== Phase 5: Partner System Styles ===== */
            .partner-menu-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 50px;
                padding: 16px 32px;
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                z-index: 100;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                transition: all 0.3s;
            }

            .partner-menu-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
            }

            .partner-panel {
                position: fixed;
                bottom: 90px;
                right: 20px;
                width: 350px;
                max-height: 500px;
                background: rgba(0, 0, 0, 0.95);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                z-index: 99;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                animation: slideUp 0.3s ease;
            }

            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .partner-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 2px solid rgba(255, 255, 255, 0.1);
            }

            .partner-panel-header h3 {
                margin: 0;
                color: white;
                font-size: 20px;
            }

            .partner-close-btn {
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: white;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                font-size: 18px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .partner-close-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .partner-list {
                padding: 12px;
                max-height: 400px;
                overflow-y: auto;
            }

            .partner-card {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                margin-bottom: 8px;
                transition: all 0.2s;
            }

            .partner-card:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .partner-card.in-scene {
                opacity: 0.6;
            }

            .partner-avatar {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                font-weight: bold;
                color: white;
            }

            .partner-info {
                flex: 1;
            }

            .partner-name {
                color: white;
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 4px;
            }

            .partner-status {
                color: rgba(255, 255, 255, 0.6);
                font-size: 12px;
            }

            .partner-summon-btn {
                background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                color: white;
                border: none;
                padding: 8px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
            }

            .partner-summon-btn:hover:not([disabled]) {
                transform: scale(1.05);
                box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
            }

            .partner-summon-btn[disabled] {
                background: rgba(255, 255, 255, 0.2);
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }
}
