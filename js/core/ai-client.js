/**
 * AI Client - 前端與 AI 後端的整合介面
 * 提供對話生成、任務分配、旁白等 AI 功能
 */

const API_BASE = 'http://localhost:8000/api/v1';

/**
 * AI 客戶端類
 */
export class AIClient {
    constructor(baseUrl = API_BASE) {
        this.baseUrl = baseUrl;
        this.wsConnection = null;
    }

    /**
     * 健康檢查
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            return response.ok;
        } catch {
            return false;
        }
    }

    // =========================================================================
    // 對話生成 API
    // =========================================================================

    /**
     * 生成角色對話
     * @param {Object} params - 對話參數
     * @param {string} params.characterId - 角色 ID (jett, donnie, bello, etc.)
     * @param {string} params.dialogueType - 對話類型 (greeting, conversation, transformation)
     * @param {string} params.situation - 當前情境
     * @param {string} params.location - 地點
     * @param {string} params.problem - 問題描述
     * @returns {Promise<string>} 生成的對話
     */
    async generateDialogue({
        characterId,
        dialogueType = 'conversation',
        situation,
        location = null,
        problem = null,
        emotion = 'happy',
        speakingTo = 'child'
    }) {
        const response = await fetch(`${this.baseUrl}/dialogue/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                character_id: characterId,
                dialogue_type: dialogueType,
                situation: situation,
                location: location,
                problem: problem,
                emotion: emotion,
                speaking_to: speakingTo
            })
        });

        if (!response.ok) {
            throw new Error(`Dialogue generation failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.dialogue;
    }

    /**
     * 生成角色問候語
     * @param {string} characterId - 角色 ID
     * @param {string} location - 目的地
     * @param {string} problem - 問題描述
     * @returns {Promise<string>} 問候語
     */
    async generateGreeting(characterId, location, problem = null) {
        const response = await fetch(
            `${this.baseUrl}/dialogue/greeting/${characterId}?location=${encodeURIComponent(location)}` +
            (problem ? `&problem=${encodeURIComponent(problem)}` : ''),
            { method: 'POST' }
        );

        if (!response.ok) {
            throw new Error(`Greeting generation failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.greeting;
    }

    /**
     * 生成變身台詞
     * @param {string} characterId - 角色 ID
     * @param {string} situation - 情境
     * @returns {Promise<string>} 變身台詞
     */
    async generateTransformationCall(characterId, situation) {
        const response = await fetch(
            `${this.baseUrl}/dialogue/transformation/${characterId}?situation=${encodeURIComponent(situation)}`,
            { method: 'POST' }
        );

        if (!response.ok) {
            throw new Error(`Transformation call generation failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.transformation_call;
    }

    /**
     * 生成 NPC 對話
     * @param {Object} params - NPC 對話參數
     * @returns {Promise<string>} NPC 對話
     */
    async generateNPCDialogue({
        npcName,
        location,
        dialogueType,
        problem,
        culturalNotes = null,
        characterName = null,
        solutionSummary = null
    }) {
        const response = await fetch(`${this.baseUrl}/dialogue/npc/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                npc_name: npcName,
                location: location,
                dialogue_type: dialogueType,
                problem: problem,
                cultural_notes: culturalNotes,
                character_name: characterName,
                solution_summary: solutionSummary
            })
        });

        if (!response.ok) {
            throw new Error(`NPC dialogue generation failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.dialogue;
    }

    // =========================================================================
    // 任務分配 API
    // =========================================================================

    /**
     * 獲取任務分配建議
     * @param {Object} params - 任務參數
     * @returns {Promise<Object>} 分配建議
     */
    async getDispatchRecommendation({
        missionType,
        location,
        problemDescription,
        urgency = 'normal',
        availableCharacters = null
    }) {
        const response = await fetch(`${this.baseUrl}/dispatch/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mission_type: missionType,
                location: location,
                problem_description: problemDescription,
                urgency: urgency,
                available_characters: availableCharacters
            })
        });

        if (!response.ok) {
            throw new Error(`Dispatch recommendation failed: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * 獲取特定任務類型的最佳角色
     * @param {string} missionType - 任務類型
     * @returns {Promise<Object>} 角色排名
     */
    async getBestCharacterForMission(missionType) {
        const response = await fetch(`${this.baseUrl}/dispatch/best-for/${missionType}`);

        if (!response.ok) {
            throw new Error(`Best character query failed: ${response.statusText}`);
        }

        return await response.json();
    }

    // =========================================================================
    // WebSocket 串流對話
    // =========================================================================

    /**
     * 連接對話 WebSocket
     * @param {string} sessionId - 會話 ID
     * @param {Function} onToken - 收到 token 時的回調
     * @param {Function} onComplete - 完成時的回調
     * @param {Function} onError - 錯誤時的回調
     */
    connectDialogueStream(sessionId, onToken, onComplete, onError) {
        const wsUrl = this.baseUrl.replace('http', 'ws') + `/dialogue/ws/${sessionId}`;
        this.wsConnection = new WebSocket(wsUrl);

        this.wsConnection.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'dialogue_token':
                    if (onToken) onToken(data.token);
                    break;
                case 'dialogue_complete':
                    if (onComplete) onComplete(data.full_dialogue);
                    break;
                case 'error':
                    if (onError) onError(data.error);
                    break;
            }
        };

        this.wsConnection.onerror = (error) => {
            if (onError) onError(error.message || 'WebSocket error');
        };

        return this.wsConnection;
    }

    /**
     * 通過 WebSocket 請求對話
     * @param {Object} params - 對話參數
     */
    requestStreamingDialogue(params) {
        if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }

        this.wsConnection.send(JSON.stringify({
            type: 'character_dialogue',
            character_id: params.characterId,
            dialogue_type: params.dialogueType || 'conversation',
            situation: params.situation,
            location: params.location,
            problem: params.problem,
            emotion: params.emotion || 'happy',
            speaking_to: params.speakingTo || 'child'
        }));
    }

    /**
     * 關閉 WebSocket 連接
     */
    disconnectDialogueStream() {
        if (this.wsConnection) {
            this.wsConnection.close();
            this.wsConnection = null;
        }
    }
}

/**
 * 預設 AI 客戶端實例
 */
export const aiClient = new AIClient();

/**
 * 使用範例
 */
export const AIClientExamples = {
    /**
     * 範例：任務開始時的對話流程
     */
    async missionStartFlow(characterId, location, problem) {
        // 1. 生成出發問候語
        const greeting = await aiClient.generateGreeting(characterId, location, problem);
        console.log(`${characterId} 說: "${greeting}"`);

        // 2. 生成變身台詞
        const transformation = await aiClient.generateTransformationCall(
            characterId,
            `Preparing to help with ${problem} in ${location}`
        );
        console.log(`${characterId} 變身: "${transformation}"`);

        return { greeting, transformation };
    },

    /**
     * 範例：智慧任務分配
     */
    async smartDispatch(missionType, location, problem) {
        // 獲取 AI 推薦
        const recommendation = await aiClient.getDispatchRecommendation({
            missionType,
            location,
            problemDescription: problem,
            urgency: 'normal'
        });

        console.log(`推薦角色: ${recommendation.recommended_character}`);
        console.log(`信心度: ${recommendation.confidence}`);
        console.log(`原因: ${recommendation.reasoning}`);
        console.log(`解釋: ${recommendation.explanation}`);

        return recommendation;
    },

    /**
     * 範例：串流對話（打字機效果）
     */
    streamingDialogueDemo(characterId, situation, displayElement) {
        const sessionId = `demo_${Date.now()}`;
        let fullText = '';

        aiClient.connectDialogueStream(
            sessionId,
            // onToken - 每收到一個 token 就更新顯示
            (token) => {
                fullText += token;
                if (displayElement) {
                    displayElement.textContent = fullText;
                }
            },
            // onComplete
            (dialogue) => {
                console.log('對話完成:', dialogue);
                aiClient.disconnectDialogueStream();
            },
            // onError
            (error) => {
                console.error('對話錯誤:', error);
                aiClient.disconnectDialogueStream();
            }
        );

        // 等待連接後發送請求
        setTimeout(() => {
            aiClient.requestStreamingDialogue({
                characterId,
                dialogueType: 'conversation',
                situation
            });
        }, 500);
    }
};

export default aiClient;
