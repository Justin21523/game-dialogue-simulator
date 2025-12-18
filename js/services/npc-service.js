/**
 * NPC Service
 * 用於調用後端 NPC 生成 API
 */

const API_BASE_URL = 'http://localhost:8001/api/v1';

export class NPCService {
    constructor() {
        this.cache = new Map(); // 緩存已生成的 NPCs
        this.availableRoles = null;
        this.availablePersonalities = null;
        this.availableDialogueStyles = null;
    }

    /**
     * 獲取可用的 NPC 角色、性格、對話風格
     */
    async getRoles() {
        if (this.availableRoles) {
            return {
                roles: this.availableRoles,
                personalities: this.availablePersonalities,
                dialogueStyles: this.availableDialogueStyles
            };
        }

        try {
            const response = await fetch(`${API_BASE_URL}/npc/roles`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.availableRoles = data.roles;
            this.availablePersonalities = data.personalities;
            this.availableDialogueStyles = data.dialogue_styles;

            return {
                roles: this.availableRoles,
                personalities: this.availablePersonalities,
                dialogueStyles: this.availableDialogueStyles
            };
        } catch (error) {
            console.error('[NPCService] Failed to get roles:', error);
            // 返回預設值
            return {
                roles: ['citizen', 'shopkeeper', 'child'],
                personalities: ['friendly', 'grumpy', 'shy'],
                dialogueStyles: ['casual', 'formal']
            };
        }
    }

    /**
     * 生成 NPC
     * @param {Object} params - 生成參數
     * @param {string} params.location - 地點名稱 (例如：paris, tokyo, london)
     * @param {string} params.locationType - 地點類型 (outdoor, shop, cafe, etc.)
     * @param {string} [params.role] - 指定角色 (可選)
     * @param {number} [params.count] - 生成數量 (1-10)
     * @returns {Promise<Array>} 生成的 NPCs 陣列
     */
    async generateNPCs(params = {}) {
        const {
            location = 'paris',
            locationType = 'outdoor',
            role = null,
            count = 1
        } = params;

        // 檢查緩存
        const cacheKey = `${location}_${locationType}_${role}_${count}`;
        if (this.cache.has(cacheKey)) {
            console.log('[NPCService] Using cached NPCs:', cacheKey);
            return this.cache.get(cacheKey);
        }

        try {
            const response = await fetch(`${API_BASE_URL}/npc/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    location: location,
                    location_type: locationType,
                    role: role,
                    count: count
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.npcs) {
                // 緩存結果
                this.cache.set(cacheKey, data.npcs);
                console.log(`[NPCService] Generated ${data.count} NPCs for ${location}/${locationType}`);
                return data.npcs;
            } else {
                console.warn('[NPCService] API returned unsuccessful response:', data);
                return this.generateFallbackNPCs(params);
            }
        } catch (error) {
            console.error('[NPCService] Failed to generate NPCs:', error);
            return this.generateFallbackNPCs(params);
        }
    }

    /**
     * 批量生成不同類型的 NPC
     * @param {string} location - 地點名稱
     * @param {Object} npcsPerType - 每種地點類型要生成的數量
     * @example
     * batchGenerateNPCs('paris', {
     *   'outdoor': 3,
     *   'shop': 2,
     *   'cafe': 2
     * })
     */
    async batchGenerateNPCs(location, npcsPerType) {
        try {
            const response = await fetch(`${API_BASE_URL}/npc/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    location: location,
                    npcs_per_type: npcsPerType
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.npcs) {
                console.log(`[NPCService] Batch generated ${data.count} NPCs for ${location}`);
                return data.npcs;
            } else {
                console.warn('[NPCService] Batch generation returned unsuccessful response:', data);
                return [];
            }
        } catch (error) {
            console.error('[NPCService] Failed to batch generate NPCs:', error);
            return [];
        }
    }

    /**
     * 生成預設 NPC（當 API 失敗時）
     */
    generateFallbackNPCs(params = {}) {
        const {
            location = 'paris',
            locationType = 'outdoor',
            count = 1
        } = params;

        console.log('[NPCService] Using fallback NPC generation');

        const fallbackNames = {
            'paris': ['Jean', 'Marie', 'Pierre', 'Sophie'],
            'tokyo': ['Yuki', 'Sakura', 'Hiroshi', 'Hana'],
            'london': ['Oliver', 'Emily', 'Harry', 'Lucy'],
            'default': ['Alex', 'Sam', 'Chris', 'Jordan']
        };

        const names = fallbackNames[location] || fallbackNames.default;
        const roles = ['citizen', 'shopkeeper', 'child'];
        const personalities = ['friendly', 'grumpy', 'shy', 'cheerful'];

        const npcs = [];
        for (let i = 0; i < count; i++) {
            const npc = {
                npc_id: `fallback_npc_${Date.now()}_${i}`,
                name: names[i % names.length],
                role: roles[i % roles.length],
                personality: personalities[Math.floor(Math.random() * personalities.length)],
                appearance: {
                    hair_color: 'brown',
                    clothing_style: 'casual',
                    distinctive_feature: 'friendly smile',
                    color_scheme: 'varied colors'
                },
                dialogue_style: 'casual',
                location_type: locationType,
                has_quest: false,
                quest_hint: null
            };
            npcs.push(npc);
        }

        return npcs;
    }

    /**
     * 清除緩存
     */
    clearCache() {
        this.cache.clear();
        console.log('[NPCService] Cache cleared');
    }

    /**
     * 將 API 生成的 NPC 轉換為遊戲可用的 NPC 物件
     */
    convertToGameNPC(apiNPC, position = null) {
        return {
            npcId: apiNPC.npc_id,
            name: apiNPC.name,
            role: apiNPC.role,
            personality: apiNPC.personality,
            appearance: apiNPC.appearance,
            dialogueStyle: apiNPC.dialogue_style,
            locationType: apiNPC.location_type,
            hasQuest: apiNPC.has_quest,
            questHint: apiNPC.quest_hint,

            // 遊戲相關屬性
            x: position ? position.x : Math.random() * 1500 + 200,
            y: position ? position.y : 500,
            width: 60,
            height: 80,

            // 對話相關
            dialogue: this.generateDefaultDialogue(apiNPC),
            canInteract: true,

            // 視覺相關
            color: this.getRoleColor(apiNPC.role),
            sprite: null // 可以之後載入真實圖片
        };
    }

    /**
     * 根據 NPC 資訊生成預設對話
     */
    generateDefaultDialogue(apiNPC) {
        const greetings = {
            'friendly': `Hello! I'm ${apiNPC.name}.`,
            'grumpy': `What do you want?`,
            'shy': `Oh... um... hello...`,
            'cheerful': `Hi there! I'm ${apiNPC.name}!`,
            'wise': `Greetings, young one.`,
            'mysterious': `...`,
            'energetic': `Hey! I'm ${apiNPC.name}!`,
            'serious': `Hello.`
        };

        return greetings[apiNPC.personality] || `Hello! I'm ${apiNPC.name}.`;
    }

    /**
     * 根據角色獲取顏色
     */
    getRoleColor(role) {
        const colors = {
            'shopkeeper': '#8B4513',
            'citizen': '#4682B4',
            'child': '#FFD700',
            'elder': '#808080',
            'official': '#8B0000',
            'merchant': '#228B22',
            'artist': '#9370DB',
            'teacher': '#FF6347',
            'doctor': '#FFFFFF',
            'librarian': '#D2691E',
            'chef': '#FF69B4',
            'musician': '#00CED1'
        };

        return colors[role] || '#4682B4';
    }
}

// 單例模式
let npcServiceInstance = null;

export function getNPCService() {
    if (!npcServiceInstance) {
        npcServiceInstance = new NPCService();
    }
    return npcServiceInstance;
}
