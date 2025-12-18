/**
 * ExplorationMissionGenerator - 探索任務生成器
 * 根據目的地和難度生成動態任務內容
 */

import { ExplorationMission, SubTask } from '../models/exploration-mission.js';
import { BLOCKER_ABILITY_MAP } from '../game/abilities/ability-definitions.js';

export class ExplorationMissionGenerator {
    constructor(options = {}) {
        // 配置
        this.apiEndpoint = options.apiEndpoint || '/api/v1/missions/generate';
        this.useAI = options.useAI ?? false;

        // 模板資料
        this.npcTemplates = new Map();
        this.itemTemplates = new Map();
        this.buildingTemplates = new Map();
        this.subTaskTemplates = new Map();

        // 目的地資料
        this.destinations = new Map();

        // 載入預設模板
        this.loadDefaultTemplates();
    }

    /**
     * 載入預設模板
     */
    loadDefaultTemplates() {
        // NPC 模板
        this.registerNPCTemplates();

        // 物品模板
        this.registerItemTemplates();

        // 建築模板
        this.registerBuildingTemplates();

        // 子任務模板
        this.registerSubTaskTemplates();
    }

    /**
     * 註冊 NPC 模板
     */
    registerNPCTemplates() {
        const npcs = [
            // 商店類
            { id: 'shopkeeper', name: '店主', icon: '🧑‍💼', type: 'merchant', dialogueType: 'shop' },
            { id: 'baker', name: '麵包師', icon: '👨‍🍳', type: 'merchant', dialogueType: 'baker' },
            { id: 'florist', name: '花店老闆', icon: '💐', type: 'merchant', dialogueType: 'florist' },

            // 居民類
            { id: 'elder', name: '老人', icon: '👴', type: 'resident', dialogueType: 'elder' },
            { id: 'child', name: '小朋友', icon: '👧', type: 'resident', dialogueType: 'child' },
            { id: 'parent', name: '家長', icon: '👨‍👩‍👧', type: 'resident', dialogueType: 'parent' },

            // 職業類
            { id: 'firefighter', name: '消防員', icon: '👨‍🚒', type: 'professional', dialogueType: 'rescue' },
            { id: 'doctor', name: '醫生', icon: '👨‍⚕️', type: 'professional', dialogueType: 'medical' },
            { id: 'teacher', name: '老師', icon: '👨‍🏫', type: 'professional', dialogueType: 'education' },

            // 特殊類
            { id: 'tourist', name: '遊客', icon: '🧳', type: 'visitor', dialogueType: 'tourist' },
            { id: 'artist', name: '藝術家', icon: '🎨', type: 'creative', dialogueType: 'art' }
        ];

        npcs.forEach(npc => this.npcTemplates.set(npc.id, npc));
    }

    /**
     * 註冊物品模板
     */
    registerItemTemplates() {
        const items = [
            // 食物類
            { id: 'bread', name: '麵包', icon: '🍞', category: 'food' },
            { id: 'cake', name: '蛋糕', icon: '🎂', category: 'food' },
            { id: 'fruit', name: '水果', icon: '🍎', category: 'food' },

            // 工具類
            { id: 'hammer', name: '錘子', icon: '🔨', category: 'tool' },
            { id: 'wrench', name: '扳手', icon: '🔧', category: 'tool' },

            // 配送類
            { id: 'package', name: '包裹', icon: '📦', category: 'delivery', isQuestItem: true },
            { id: 'letter', name: '信件', icon: '✉️', category: 'delivery', isQuestItem: true },

            // 特殊類
            { id: 'flower', name: '花朵', icon: '🌸', category: 'gift' },
            { id: 'balloon', name: '氣球', icon: '🎈', category: 'gift' },
            { id: 'toy', name: '玩具', icon: '🧸', category: 'toy' },

            // 收集類
            { id: 'gem', name: '寶石', icon: '💎', category: 'collectible', value: 50 },
            { id: 'coin', name: '金幣', icon: '🪙', category: 'collectible', value: 10 },
            { id: 'star', name: '星星', icon: '⭐', category: 'collectible', value: 25 }
        ];

        items.forEach(item => this.itemTemplates.set(item.id, item));
    }

    /**
     * 註冊建築模板
     */
    registerBuildingTemplates() {
        const buildings = [
            { id: 'shop', name: '商店', icon: '🏪', type: 'shop', hasNPC: true },
            { id: 'house', name: '住家', icon: '🏠', type: 'house', hasNPC: true },
            { id: 'restaurant', name: '餐廳', icon: '🍽️', type: 'restaurant', hasNPC: true },
            { id: 'school', name: '學校', icon: '🏫', type: 'school', hasNPC: true },
            { id: 'hospital', name: '醫院', icon: '🏥', type: 'hospital', hasNPC: true },
            { id: 'fire_station', name: '消防局', icon: '🚒', type: 'station', hasNPC: true },
            { id: 'museum', name: '博物館', icon: '🏛️', type: 'museum', hasNPC: true },
            { id: 'park', name: '公園', icon: '🌳', type: 'park', hasNPC: false }
        ];

        buildings.forEach(b => this.buildingTemplates.set(b.id, b));
    }

    /**
     * 註冊子任務模板
     */
    registerSubTaskTemplates() {
        const templates = [
            // 對話任務
            {
                id: 'greet_local',
                type: 'talk',
                titleTemplate: '與 {npcName} 打招呼',
                descTemplate: '去找 {npcName} 聊聊天'
            },
            {
                id: 'ask_directions',
                type: 'talk',
                titleTemplate: '向 {npcName} 問路',
                descTemplate: '詢問 {npcName} 關於 {target} 的位置'
            },

            // 收集任務
            {
                id: 'collect_items',
                type: 'fetch',
                titleTemplate: '收集 {count} 個 {itemName}',
                descTemplate: '在這個區域找到 {count} 個 {itemName}'
            },
            {
                id: 'deliver_package',
                type: 'fetch',
                titleTemplate: '將 {itemName} 送給 {npcName}',
                descTemplate: '把 {itemName} 交給 {npcName}'
            },

            // 能力任務
            {
                id: 'build_bridge',
                type: 'ability',
                titleTemplate: '建造橋樑',
                descTemplate: '使用 Donnie 的能力建造橋樑通過缺口',
                requiredCharacter: 'donnie'
            },
            {
                id: 'dig_tunnel',
                type: 'ability',
                titleTemplate: '挖掘通道',
                descTemplate: '使用 Todd 的能力挖掘通道',
                requiredCharacter: 'todd'
            },
            {
                id: 'talk_animal',
                type: 'ability',
                titleTemplate: '與動物溝通',
                descTemplate: '使用 Bello 的能力與動物對話',
                requiredCharacter: 'bello'
            },
            {
                id: 'control_traffic',
                type: 'ability',
                titleTemplate: '控制交通',
                descTemplate: '使用 Paul 的能力控制交通號誌',
                requiredCharacter: 'paul'
            },

            // 探索任務
            {
                id: 'explore_area',
                type: 'explore',
                titleTemplate: '探索 {areaName}',
                descTemplate: '前往 {areaName} 區域'
            }
        ];

        templates.forEach(t => this.subTaskTemplates.set(t.id, t));
    }

    /**
     * 生成探索任務
     * @param {Object} params - 生成參數
     * @returns {Promise<ExplorationMission>}
     */
    async generateMission(params) {
        const {
            destination,
            difficulty = 1,
            type = 'exploration',
            requiredCharacter = null
        } = params;

        // 確保目的地為物件格式
        const resolvedDestination = this.resolveDestination(destination);

        // 嘗試 AI 生成
        if (this.useAI) {
            try {
                const aiMission = await this.generateWithAI({ ...params, destination: resolvedDestination });
                if (aiMission) return aiMission;
            } catch (error) {
                console.warn('AI 生成失敗，使用降級方案', error);
            }
        }

        // 降級：程序生成
        return this.generateProcedurally({ ...params, destination: resolvedDestination });
    }

    /**
     * AI 生成任務
     */
    async generateWithAI(params) {
        const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            throw new Error(`API responded with ${response.status}`);
        }

        const data = await response.json();
        return new ExplorationMission(data);
    }

    /**
     * 程序生成任務 (with AI-driven task graph)
     */
    async generateProcedurally(params) {
        const {
            destination,
            difficulty = 1,
            type = 'exploration'
        } = params;

        const resolvedDestination = this.resolveDestination(destination);

        // 基本任務資料
        const missionData = {
            id: `mission_${resolvedDestination.id}_${Date.now()}`,
            title: this.generateTitle(resolvedDestination, type),
            description: this.generateDescription(resolvedDestination, type),
            destination: resolvedDestination,
            type: type,
            difficulty: difficulty,
            rewards: this.calculateRewards(difficulty),
            timeLimit: difficulty >= 3 ? 300000 : null,  // 困難任務有時間限制
            worldConfig: this.generateWorldConfig(resolvedDestination),
            npcs: [],
            items: [],
            buildings: [],
            blockers: [],
            subTasks: []
        };

        // 生成場景元素
        this.populateScene(missionData, difficulty);

        // 生成子任務 (AI-driven with template fallback)
        missionData.subTasks = await this.generateDynamicMissionGraph(missionData, difficulty);

        console.log(`[MissionGenerator] generateProcedurally - Final missionData has ${missionData.npcs.length} NPCs, ${missionData.items.length} items`);

        const mission = new ExplorationMission(missionData);

        // ✅ 驗證 title 是否包含 undefined
        console.log('[MissionGenerator] Generated mission:', {
            id: mission.id,
            title: mission.title,
            destination: resolvedDestination,
            destinationName: resolvedDestination?.name
        });

        if (!mission.title || mission.title.includes('undefined')) {
            console.error('[MissionGenerator] ❌ Mission title contains undefined!', {
                title: mission.title,
                destination: resolvedDestination,
                type: type
            });
            // Fallback title
            mission.title = `探索任務 #${mission.id}`;
        }

        return mission;
    }

    /**
     * 生成任務標題
     */
    generateTitle(destination, type) {
        const titles = {
            exploration: [
                `探索 ${destination.name}`,
                `${destination.name} 之旅`,
                `認識 ${destination.name}`
            ],
            delivery: [
                `配送到 ${destination.name}`,
                `${destination.name} 的包裹`,
                `緊急配送：${destination.name}`
            ],
            rescue: [
                `${destination.name} 救援行動`,
                `幫助 ${destination.name} 的居民`,
                `${destination.name} 求助！`
            ],
            collection: [
                `${destination.name} 的寶藏`,
                `收集 ${destination.name} 的特產`,
                `${destination.name} 尋寶記`
            ]
        };

        const typesTitles = titles[type] || titles.exploration;
        return typesTitles[Math.floor(Math.random() * typesTitles.length)];
    }

    /**
     * 生成任務描述
     */
    generateDescription(destination, type) {
        const descriptions = {
            exploration: `前往 ${destination.name}，與當地居民互動，了解這個地方的文化。`,
            delivery: `將重要的包裹安全送達 ${destination.name}，時間緊迫！`,
            rescue: `${destination.name} 的居民遇到了困難，快去幫助他們吧！`,
            collection: `在 ${destination.name} 尋找散落的物品並收集起來。`
        };

        return descriptions[type] || descriptions.exploration;
    }

    /**
     * 計算獎勵
     */
    calculateRewards(difficulty) {
        const baseReward = 100;
        return {
            money: baseReward * difficulty * (1 + Math.random() * 0.3),
            exp: Math.floor(baseReward * 0.5 * difficulty),
            items: difficulty >= 2 ? [{ id: 'gem', quantity: Math.ceil(difficulty / 2) }] : []
        };
    }

    /**
     * 生成世界配置
     */
    generateWorldConfig(destination) {
        const themes = {
            city: { groundColor: '#808080', skyColor: '#87CEEB' },
            village: { groundColor: '#228B22', skyColor: '#87CEEB' },
            desert: { groundColor: '#EDC9AF', skyColor: '#F4A460' },
            snow: { groundColor: '#FFFAFA', skyColor: '#B0C4DE' },
            tropical: { groundColor: '#32CD32', skyColor: '#00CED1' }
        };

        const theme = destination?.theme || 'city';

        return {
            width: 3000 + Math.random() * 2000,
            isInfinite: true,
            backgroundTheme: theme,
            groundY: 500,
            ...themes[theme]
        };
    }

    /**
     * 解析目的地，允許傳入字串時也能取得名稱
     */
    resolveDestination(destination) {
        if (destination && typeof destination === 'object') return destination;

        const id = typeof destination === 'string' ? destination : 'unknown';
        const fromRegistry = this.getDestination(id);
        if (fromRegistry) return fromRegistry;

        const name = id.charAt(0).toUpperCase() + id.slice(1);
        return { id, name, theme: 'city' };
    }

    /**
     * 填充場景元素
     */
    populateScene(missionData, difficulty) {
        const npcCount = 2 + difficulty;
        const itemCount = 3 + difficulty * 2;
        const buildingCount = 2 + Math.floor(difficulty / 2);
        const blockerCount = Math.floor(difficulty / 2);

        // 生成 NPC
        missionData.npcs = this.generateNPCs(npcCount, missionData.destination);
        console.log(`[MissionGenerator] populateScene - Generated ${missionData.npcs.length} NPCs for difficulty ${difficulty}`);

        // 生成物品
        missionData.items = this.generateItems(itemCount, missionData);

        // 生成建築
        missionData.buildings = this.generateBuildings(buildingCount, missionData.destination);

        // 生成障礙物
        missionData.blockers = this.generateBlockers(blockerCount);
    }

    /**
     * 生成 NPC
     */
    generateNPCs(count, destination) {
        const npcs = [];
        const usedTemplates = new Set();
        const templates = Array.from(this.npcTemplates.values());

        console.log(`[MissionGenerator] generateNPCs - Generating ${count} NPCs from ${templates.length} templates for destination:`, destination);

        for (let i = 0; i < count && templates.length > 0; i++) {
            // 選擇未使用的模板
            let template;
            do {
                template = templates[Math.floor(Math.random() * templates.length)];
            } while (usedTemplates.has(template.id) && usedTemplates.size < templates.length);

            usedTemplates.add(template.id);

            const npc = {
                id: `npc_${template.id}_${i}`,
                ...template,
                name: this.generateNPCName(template, destination),
                x: 200 + i * 400 + Math.random() * 100,
                y: 450,
                dialogues: this.generateDialogues(template)
            };

            npcs.push(npc);
            console.log(`[MissionGenerator] Created NPC ${i+1}/${count}:`, npc.id, npc.name);
        }

        console.log(`[MissionGenerator] generateNPCs - Returning ${npcs.length} NPCs`);
        return npcs;
    }

    /**
     * 生成 NPC 名字
     */
    generateNPCName(template, destination) {
        const names = {
            shopkeeper: ['王老闆', '李店長', '張老闆娘'],
            baker: ['陳師傅', '林師傅', '黃阿姨'],
            elder: ['王爺爺', '李奶奶', '老張'],
            child: ['小明', '小花', '阿寶'],
            firefighter: ['消防員小李', '隊長阿明'],
            doctor: ['王醫生', '陳護士']
        };

        const typeNames = names[template.id] || ['路人甲', '路人乙', '居民'];
        return typeNames[Math.floor(Math.random() * typeNames.length)];
    }

    /**
     * 生成對話
     */
    generateDialogues(npcTemplate) {
        const greetings = {
            merchant: ['歡迎光臨！', '需要什麼嗎？', '請慢慢看！'],
            resident: ['你好啊！', '今天天氣真好！', '很高興見到你！'],
            professional: ['有什麼我能幫忙的嗎？', '你好，請問有什麼事？'],
            default: ['你好！', '嗨！']
        };

        const type = npcTemplate.type || 'default';
        const greetingList = greetings[type] || greetings.default;

        return [{
            id: 'greeting',
            text: greetingList[Math.floor(Math.random() * greetingList.length)],
            emotion: 'happy'
        }];
    }

    /**
     * 生成物品
     */
    generateItems(count, missionData) {
        const items = [];
        const templates = Array.from(this.itemTemplates.values());

        // 確保有任務物品
        const questItem = templates.find(t => t.category === 'delivery');
        if (questItem) {
            items.push({
                id: `item_quest_0`,
                ...questItem,
                x: 300 + Math.random() * 500,
                y: 470,
                isQuestItem: true
            });
        }

        // 生成其他物品
        for (let i = items.length; i < count; i++) {
            const template = templates[Math.floor(Math.random() * templates.length)];
            items.push({
                id: `item_${template.id}_${i}`,
                ...template,
                x: 200 + i * 300 + Math.random() * 200,
                y: 470
            });
        }

        return items;
    }

    /**
     * 生成建築
     */
    generateBuildings(count, destination) {
        const buildings = [];
        const templates = Array.from(this.buildingTemplates.values());

        for (let i = 0; i < count; i++) {
            const template = templates[Math.floor(Math.random() * templates.length)];
            buildings.push({
                id: `building_${template.id}_${i}`,
                ...template,
                x: 400 + i * 600,
                y: 350,
                width: 150,
                height: 200
            });
        }

        return buildings;
    }

    /**
     * 生成障礙物
     */
    generateBlockers(count) {
        const blockers = [];
        const types = Object.keys(BLOCKER_ABILITY_MAP);

        for (let i = 0; i < count; i++) {
            const blockerType = types[Math.floor(Math.random() * types.length)];
            const abilityInfo = BLOCKER_ABILITY_MAP[blockerType];

            blockers.push({
                id: `blocker_${blockerType}_${i}`,
                blockerType: blockerType,
                requiredAbility: abilityInfo.requiredAbility,
                requiredCharacter: abilityInfo.requiredCharacter,
                hintText: abilityInfo.hint,
                x: 800 + i * 500,
                y: 450,
                width: 100,
                height: 100
            });
        }

        return blockers;
    }

    /**
     * Generate dynamic mission graph using AI (Stage 2)
     * @param {Object} missionData - Mission data
     * @param {number} difficulty - Difficulty level
     * @returns {Promise<Array>} Array of SubTask instances
     */
    async generateDynamicMissionGraph(missionData, difficulty) {
        // Try AI generation first
        try {
            const { aiService } = await import('../core/ai-service.js');

            const aiGraph = await aiService.generateMissionGraph({
                destination: missionData.destination,
                difficulty: difficulty,
                availableCharacters: this.getAvailableCharacters(),
                worldContext: missionData.worldConfig
            });

            if (aiGraph && aiGraph.nodes && aiGraph.nodes.length > 0) {
                console.log('[MissionGenerator] Using AI-generated mission graph', aiGraph);

                // Convert AI nodes to SubTask instances
                const tasks = aiGraph.nodes.map((node, index) => new SubTask({
                    id: node.id,
                    type: node.type,
                    title: node.title,
                    description: node.description || node.title,
                    alternatives: node.alternatives || [],
                    prerequisites: node.prerequisites || [],
                    targetNPC: node.targetNPC || null,
                    targetItems: node.targetItems || [],
                    targetBlocker: node.targetBlocker || null,
                    order: index,
                    isAIGenerated: true
                }));

                return tasks;
            }
        } catch (e) {
            console.warn('[MissionGenerator] AI graph generation failed, using template', e);
        }

        // Fallback to template-based generation
        return this.generateSubTasks(missionData, difficulty);
    }

    /**
     * Get available characters (helper for AI)
     * @returns {Array}
     */
    getAvailableCharacters() {
        // This would be injected from game state in real implementation
        return ['jett', 'flip', 'donnie', 'todd', 'paul', 'bello', 'chase', 'jerome'];
    }

    /**
     * 生成子任務 (Template-based fallback)
     */
    generateSubTasks(missionData, difficulty) {
        const tasks = [];
        let order = 0;

        // 必定有的對話任務
        if (missionData.npcs.length > 0) {
            const npc = missionData.npcs[0];
            tasks.push(new SubTask({
                id: `task_talk_${order}`,
                type: 'talk',
                title: `Talk to ${npc.name}`,
                description: `Go talk to ${npc.name}`,
                targetNPC: npc.id,
                order: order++
            }));
        }

        // 收集任務
        const questItems = missionData.items.filter(i => i.isQuestItem);
        if (questItems.length > 0) {
            const item = questItems[0];
            const deliverNPC = missionData.npcs[1] || missionData.npcs[0];

            tasks.push(new SubTask({
                id: `task_fetch_${order}`,
                type: 'fetch',
                title: `Collect ${item.name}`,
                description: `Find ${item.name} and give to ${deliverNPC.name}`,
                targetItems: [item.id],
                deliverTo: deliverNPC.id,
                requiredCount: 1,
                order: order++
            }));
        }

        // 能力任務（根據難度）
        if (difficulty >= 2 && missionData.blockers.length > 0) {
            const blocker = missionData.blockers[0];
            tasks.push(new SubTask({
                id: `task_ability_${order}`,
                type: 'ability',
                title: `Solve obstacle`,
                description: blocker.hintText,
                targetBlocker: blocker.id,
                order: order++,
                hint: `Need ${blocker.requiredCharacter.toUpperCase()}'s help`
            }));
        }

        // 探索任務（高難度）
        if (difficulty >= 3) {
            tasks.push(new SubTask({
                id: `task_explore_${order}`,
                type: 'explore',
                title: 'Explore hidden area',
                description: 'Find the hidden area marked on map',
                targetLocation: { x: 2000, y: 450 },
                order: order++
            }));
        }

        return tasks;
    }

    /**
     * 註冊目的地
     * @param {string} id - 目的地 ID
     * @param {Object} data - 目的地資料
     */
    registerDestination(id, data) {
        this.destinations.set(id, data);
    }

    /**
     * 取得目的地
     * @param {string} id - 目的地 ID
     * @returns {Object|null}
     */
    getDestination(id) {
        return this.destinations.get(id) || null;
    }
}
