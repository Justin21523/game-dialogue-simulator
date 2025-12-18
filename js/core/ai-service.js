import { apiClient } from './api-client.js';
import { Toast } from '../ui/toast.js';
import { getAIRequestQueue } from './ai-request-queue.js';  // Stage 7
import { eventBus } from './event-bus.js';  // Stage 7

/**
 * Unified AI service wrapper with offline fallbacks.
 */
class AIService {
    constructor() {
        this.healthChecked = false;
        this.offlineNotified = false;
        this.forcedOffline = false;

        // ===== Stage 7: AI Request Queue =====
        this.requestQueue = getAIRequestQueue();

        // 設定 fetcher 函數
        this.requestQueue.setFetcher(async (endpoint, params) => {
            const res = await apiClient.axiosInstance.post(endpoint, params);
            return res.data;
        });
    }

    async ensureBackend() {
        if (this.forcedOffline) return false;
        if (!this.healthChecked) {
            await apiClient.checkHealth();
            this.healthChecked = true;
        }
        return apiClient.isBackendAvailable;
    }

    /**
     * Force backend on/off (for testing fallback/degrade)
     * @param {boolean} offline
     */
    setForcedOffline(offline) {
        this.forcedOffline = !!offline;
        if (offline) {
            this._notifyOfflineOnce();
        } else {
            this.offlineNotified = false;
        }
        return this.forcedOffline;
    }

    async _withBackend(fn, fallback, options = {}) {
        const backend = await this.ensureBackend();
        if (!backend) {
            this._notifyOfflineOnce();
            eventBus.emit('AI_OFFLINE_MODE', { reason: 'backend_unavailable' });
            return typeof fallback === 'function' ? fallback() : fallback;
        }

        // ===== Stage 7: Use request queue for AI requests =====
        // 如果提供了 endpoint 和 params，使用隊列
        if (options.useQueue && options.endpoint && options.params) {
            return this._withQueue(options.endpoint, options.params, options.queueOptions, fallback);
        }

        // 否則使用原有的直接調用
        try {
            return await fn();
        } catch (e) {
            console.warn('[AIService] request failed, using fallback', e);
            this._notifyOfflineOnce();
            eventBus.emit('AI_REQUEST_ERROR', {
                error: e.message,
                requestId: options.requestId
            });
            return typeof fallback === 'function' ? fallback(e) : fallback;
        }
    }

    /**
     * 使用請求隊列執行 AI 請求 (Stage 7)
     * @param {string} endpoint - API 端點
     * @param {Object} params - 請求參數
     * @param {Object} queueOptions - 隊列選項
     * @param {Function|any} fallback - 降級方案
     * @returns {Promise<any>}
     */
    async _withQueue(endpoint, params, queueOptions = {}, fallback) {
        const requestId = queueOptions.requestId || `req_${Date.now()}`;
        const requestType = queueOptions.type || 'unknown';

        try {
            // 發送請求開始事件
            eventBus.emit('AI_REQUEST_START', {
                requestId: requestId,
                type: requestType,
                endpoint: endpoint
            });

            // 使用隊列執行請求
            const result = await this.requestQueue.request(endpoint, params, {
                priority: queueOptions.priority || 'normal',
                bypassCache: queueOptions.bypassCache || false,
                ttl: queueOptions.cacheTTL
            });

            // 發送請求成功事件
            eventBus.emit('AI_REQUEST_SUCCESS', {
                requestId: requestId,
                type: requestType
            });

            return result;
        } catch (error) {
            console.error('[AIService] Queue request failed', error);

            // 發送請求錯誤事件
            eventBus.emit('AI_REQUEST_ERROR', {
                requestId: requestId,
                type: requestType,
                error: error.message
            });

            // 使用降級方案
            return typeof fallback === 'function' ? fallback(error) : fallback;
        }
    }

    _notifyOfflineOnce() {
        if (this.offlineNotified) return;
        this.offlineNotified = true;
        this.notifyOffline('AI backend');
    }

    /**
     * Quest Planner: generate mission graph (main + sub) with trace fields.
     */
    async generateMissionGraph(payload, opts = {}) {
        const requestId = opts.requestId || `quest-plan-${Date.now()}`;
        const body = {
            ...payload,
            trace_id: payload.trace_id || requestId,
            quest_id: payload.quest_id,
            objective_id: payload.objective_id,
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/missions/generate-graph', body);
                return res.data;
            },
            () => this._mockMissionGraph(body),
            { requestId }
        );
    }

    _mockMissionGraph(payload) {
        return {
            title: `Help ${payload.npc_name || 'NPC'}`,
            description: `${payload.npc_name || 'NPC'} in ${payload.destination || 'Unknown'} needs assistance`,
            nodes: [
                { id: 'talk_npc', type: 'talk', target: 'npc_quest', title: 'Talk to the quest giver', description: 'Get the details' },
                { id: 'collect_item', type: 'fetch', target: 'mission_item', title: 'Pick up the parcel', description: 'Find and collect the parcel', prerequisites: ['talk_npc'], alternatives: ['ask_side_npc'] },
                { id: 'deliver', type: 'deliver', target: 'npc_quest', title: 'Return the parcel', description: 'Bring the parcel back to the quest giver or hub', prerequisites: ['collect_item'], alternatives: ['deliver_hub'] },
                { id: 'ask_side_npc', type: 'talk', target: 'npc_side', title: 'Ask the helper NPC', description: 'Optional hint or side path', prerequisites: ['talk_npc'], optional: true },
                { id: 'deliver_hub', type: 'deliver', target: 'delivery_hub', title: 'Drop at delivery hub', description: 'Alternative delivery point', optional: true }
            ],
            entry_points: ['talk_npc'],
            rewards: { money: 150, exp: 80 },
        };
    }

    /**
     * Dialogue agent: generate choices/intros for NPC interaction.
     */
    async generateDialogueOptions(payload, opts = {}) {
        const requestId = opts.requestId || `dialogue-${Date.now()}`;
        const body = {
            ...payload,
            trace_id: payload.trace_id || requestId,
            quest_id: payload.quest_id,
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/dialogue/generate', {
                    character_id: body.player_id || body.character_id || 'jett',
                    dialogue_type: body.dialogue_type || 'conversation',
                    situation: body.situation || `與 ${body.npc_name || 'NPC'} 交談`,
                    mission_phase: body.mission_phase || null,
                    emotion: body.emotion || 'neutral',
                    speaking_to: 'player',
                    dialogue_history: body.dialogue_history || [],
                    location: body.location,
                    problem: body.problem || body.mission_brief,
                });
                const text = res.data?.dialogue || res.data?.greeting || '你好，需要幫忙嗎？';
                return {
                    trace_id: body.trace_id,
                    intro: text,
                    hint: res.data?.hint || res.data?.tip,
                    options: [
                        { id: 'accept', text: '✅ 接受任務' },
                        { id: 'ask_more', text: '❓ 再多說一些' },
                        { id: 'decline', text: '❌ 下次吧' },
                    ],
                };
            },
            () => ({
                trace_id: body.trace_id,
                intro: `嗨，我是 ${body.npc_name || '朋友'}，可以幫個忙嗎？`,
                hint: null,
                options: [
                    { id: 'accept', text: '✅ 接受任務' },
                    { id: 'decline', text: '❌ 下次吧' },
                ],
            }),
            { requestId }
        );
    }

    /**
     * Task Evaluator: 判斷任務/目標進度，可能返回完成/更新/提示。
     */
    async evaluateMissionProgress(payload, opts = {}) {
        const requestId = opts.requestId || `eval-${Date.now()}`;
        const body = {
            ...payload,
            trace_id: payload.trace_id || requestId,
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/missions/evaluate-progress', body);
                return res.data;
            },
            () => ({
                trace_id: body.trace_id,
                hint: null,
                completed_objectives: [],
                updated_objectives: [],
                degraded: true,
            }),
            { requestId }
        );
    }

    /**
     * Context Agent: 存取玩家/任務記憶（簡化，後端可選）。
     */
    async updateQuestContext(payload, opts = {}) {
        const requestId = opts.requestId || `ctx-${Date.now()}`;
        const body = {
            ...payload,
            trace_id: payload.trace_id || requestId,
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/progress/context', body);
                return res.data;
            },
            () => ({ saved: false, offline: true }),
            { requestId }
        );
    }

    /**
     * 獲取請求隊列統計資訊 (Stage 7)
     * @returns {Object}
     */
    getQueueStats() {
        return this.requestQueue.getStats();
    }

    /**
     * 清空請求隊列快取 (Stage 7)
     */
    clearQueueCache() {
        this.requestQueue.clear();
    }

    // Mission dispatch recommendation
    async recommendDispatch(mission, availableCharacters = []) {
        const payload = {
            mission_type: mission.type || mission.category || "delivery",
            location: mission.location || "World Airport",
            problem_description: mission.description || (mission.objectives && mission.objectives[0]?.description) || "Help needed",
            urgency: mission.urgency || "normal",
            available_characters: availableCharacters.map(c => c.id),
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/dispatch/recommend', payload);
                return res.data;
            },
            () => this._mockDispatch(payload)
        );
    }

    _mockDispatch(payload) {
        const mapping = {
            delivery: "jett",
            construction: "donnie",
            police: "paul",
            sports: "flip",
            animal_care: "bello",
        };
        const pick = mapping[payload.mission_type?.toLowerCase()] || "jett";
        return {
            recommended_character: pick,
            confidence: 0.5,
            reasoning: "Offline mode: default recommendation by mission type.",
            mission_tips: ["Check fuel and items", "Keep character energy high"],
            explanation: "Offline mode: pick the best default character for this mission type.",
        };
    }

    // Get best character for mission type (simpler, faster endpoint)
    async getBestForMissionType(missionType, availableCharacters = []) {
        const charList = availableCharacters.length > 0
            ? availableCharacters.map(c => c.id || c).join(',')
            : null;

        const url = charList
            ? `/dispatch/best-for/${encodeURIComponent(missionType)}?available_characters=${encodeURIComponent(charList)}`
            : `/dispatch/best-for/${encodeURIComponent(missionType)}`;

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.get(url);
                return res.data;
            },
            () => this._mockBestFor(missionType)
        );
    }

    _mockBestFor(missionType) {
        const mapping = {
            delivery: "jett",
            construction: "donnie",
            police: "paul",
            sports: "flip",
            animal_care: "bello",
        };
        const pick = mapping[missionType?.toLowerCase()] || "jett";
        return {
            mission_type: missionType,
            best_character: pick,
            ranking: [
                { character_id: pick, score: 95 },
                { character_id: "jett", score: 70 },
                { character_id: "jerome", score: 65 }
            ],
            reasoning: "Offline mode: default best character by mission type.",
        };
    }

    // Narration
    async generateNarration(options) {
        const payload = {
            character_id: options.characterId,
            phase: options.phase || "departure",
            location: options.location || "World Airport",
            problem: options.problem,
            solution: options.solution,
            npc_name: options.npcName,
            conditions: options.conditions,
            current_area: options.currentArea,
            result: options.result,
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/narration/generate', payload);
                return { narration: res.data.narration, offline: false };
            },
            () => ({ narration: this._mockNarration(payload), offline: true })
        );
    }

    _mockNarration(payload) {
        return `${payload.character_id || "Jett"} is flying to ${payload.location || "the destination"} to solve the mission!`;
    }

    // Tutorial hint
    async getTutorialHint(topic, characterId = null, missionType = null) {
        const payload = {
            current_situation: topic || "mission_help",  // 修復：後端期望 current_situation 而非 topic
            character_id: characterId,
            mission_type: missionType,
            player_progress: null  // 可選參數
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/tutorial/hint', payload);
                return { hint: res.data.content || res.data.hint || res.data, offline: false };
            },
            () => ({ hint: "Offline: focus on the mission goal and pick a matching specialist.", offline: true })
        );
    }

    // Progress analysis
    async analyzeProgress(progressPayload) {
        const payload = {
            player_id: progressPayload.player_id || "local_player",
            missions_completed: progressPayload.missions_completed || 0,
            missions_failed: progressPayload.missions_failed || 0,
            characters_used: progressPayload.characters_used || {},
            characters_unlocked: progressPayload.characters_unlocked || [],
            character_levels: progressPayload.character_levels || {},
            locations_visited: progressPayload.locations_visited || [],
            achievements_earned: progressPayload.achievements_earned || [],
            mission_types_completed: progressPayload.mission_types_completed || {},
            total_money_earned: progressPayload.total_money_earned || 0,
            total_playtime_minutes: progressPayload.total_playtime_minutes || 0,
            player_level: progressPayload.player_level || 1,
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/progress/analyze', payload);
                return { ...res.data, offline: false };
            },
            () => ({
                overall_progress: "Offline: complete more missions to level up.",
                strengths: ["Consistently finishing missions"],
                improvements: ["Try more mission types to raise success rate"],
                playstyle: "Balanced",
                key_stats: payload,
                offline: true,
            })
        );
    }

    notifyOffline(label = "AI") {
        Toast.show(`${label} is using offline mode`, "warning");
    }

    // Random event generation
    async generateEvent(context) {
        const payload = {
            character_id: context.character_id || "jett",
            location: context.location || "World Airport",
            mission_type: context.mission_type || "delivery",
            mission_phase: context.mission_phase || "active",
            problem: context.problem || "Help needed",
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/events/generate', payload);
                return { ...res.data, offline: false };
            },
            () => ({
                event_name: "Surprise Helper",
                description: "A local friend offers a shortcut to finish faster.",
                choices: [
                    { option: "Accept help", outcome: "Speed up mission" },
                    { option: "Decline", outcome: "No change" }
                ],
                offline: true,
            })
        );
    }

    // Progress recommendations (list form)
    async getProgressRecommendations(progressPayload) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/progress/recommend', progressPayload);
                return { recommendations: res.data.recommendations || [], offline: false };
            },
            () => ({
                recommendations: [
                    { title: "Finish 3 missions", priority: "high", description: "Boost rewards and unlock achievements." },
                    { title: "Use specialist", priority: "medium", description: "Match mission type to raise success rate." },
                ],
                offline: true,
            })
        );
    }

    // Dialogue generation (NPC/player interactions)
    async generateDialogue(options = {}) {
        // 使用 NPC ID 或預設角色 ID
        const characterId = options.characterId || options.npcName || 'jett';

        // 構建 situation 描述
        const situation = options.situation ||
            `${options.context || ''} at ${options.location || 'World Airport'}`.trim();

        const payload = {
            character_id: characterId,
            dialogue_type: options.dialogueType || "conversation",
            situation: situation,
            mission_phase: options.missionPhase || null,
            emotion: options.emotion || "neutral",
            speaking_to: options.speakingTo || "child",
            dialogue_history: options.previous || options.dialogueHistory || [],
            location: options.location || "World Airport",
            problem: options.problem || options.context || null
        };

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/dialogue/generate', payload);
                return {
                    lines: [res.data.dialogue],  // 後端返回單一 dialogue 字串
                    offline: false
                };
            },
            () => ({
                lines: [
                    `${options.npcName || "Friend"}: We need help in ${options.location || 'here'}.`,
                    `${options.playerName || "Pilot"}: I'm on it!`
                ],
                offline: true
            })
        );
    }

    // Voice generation
    async generateVoice(text, characterId, emotion = "neutral") {
        if (!text) return null;
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/voice/generate', {
                    text,
                    character_id: characterId,
                    emotion,
                });
                return res.data;
            },
            () => null
        );
    }

    // Sound effect generation
    async generateSound(category, soundType, options = {}) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/sound/generate', {
                    category,
                    sound_type: soundType,
                    intensity: options.intensity || "medium",
                    duration_ms: options.durationMs || 2000
                });
                return res.data;
            },
            () => null
        );
    }

    // Animation planning
    async planAnimation(animationType, options = {}) {
        // 從 options 提取角色 ID，或使用預設值
        // 需要先 import gameState 或通過 options 傳入
        const characterId = options.characterId ||
                            options.character_id ||
                            (typeof gameState !== 'undefined' && gameState?.currentMission?.assignedCharId) ||
                            'jett';

        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/animation/plan', {
                    animation_type: animationType,
                    character_id: characterId,        // ← 添加必填參數
                    duration_ms: options.durationMs || 2000,
                    frame_rate: options.frameRate || 24,
                    easing: options.easing || "ease_in_out",
                    loop: options.loop || false,
                    export_format: options.exportFormat || "gif"
                });
                return res.data;
            },
            () => ({
                keyframes: [
                    { t: 0, state: "start" },
                    { t: 0.5, state: "mid" },
                    { t: 1, state: "end" }
                ],
                offline: true
            })
        );
    }

    // Package assets
    async packageAssets(config) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/assets/package', config);
                return res.data;
            },
            () => ({ package_id: "offline_package", status: "queued_offline", offline: true })
        );
    }

    // ComfyUI workflow helpers
    async comfyStatus() {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.get('/comfyui/status');
                return res.data;
            },
            () => ({ status: "offline" })
        );
    }

    async comfyQueue(workflow) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/comfyui/generate', workflow);
                return res.data;
            },
            () => ({ session_id: "offline", status: "queued_offline" })
        );
    }

    // ============ Mission Graph & Evaluation (Stage 2) ============

    async generateMissionGraph(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/missions/generate-graph', params);
                return res.data;
            },
            () => ({
                nodes: [
                    { id: "start", type: "talk", title: "Start mission", alternatives: [] }
                ],
                entry_points: ["start"],
                offline: true
            })
        );
    }

    async evaluateMissionProgress(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/missions/evaluate-progress', params);
                return res.data;
            },
            () => ({
                next_options: [],
                hints: [],
                dynamic_branches: [],
                offline: true
            })
        );
    }

    async evaluateMissionCompletion(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/missions/evaluate-completion', params);
                return res.data;
            },
            () => ({
                is_complete: false,
                type: "partial",
                reward_modifier: 1.0,
                offline: true
            })
        );
    }

    async evaluateMissionState(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/missions/evaluate-state', params);
                return res.data;
            },
            () => ({
                suggested_events: [],
                new_opportunities: [],
                hints: [],
                hint_urgency: "low",
                offline: true
            })
        );
    }

    // ============ RAG Session Management ============

    async createRAGSession(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/rag/create-session', params);
                return res.data.session_id;
            },
            () => `offline_session_${Date.now()}`
        );
    }

    async updateRAGContext(params) {
        return this._withBackend(
            async () => {
                await apiClient.axiosInstance.post('/rag/update-context', params);
                return { success: true };
            },
            () => ({ success: true, offline: true })
        );
    }

    async queryRAG(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/rag/query', params);
                return res.data;
            },
            () => ({ results: [], offline: true })
        );
    }

    async deleteRAGSession(sessionId) {
        return this._withBackend(
            async () => {
                await apiClient.axiosInstance.delete(`/rag/session/${sessionId}`);
                return { success: true };
            },
            () => ({ success: true, offline: true })
        );
    }

    async getRAGSessionStatus(sessionId) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.get(`/rag/status/${sessionId}`);
                return res.data;
            },
            () => ({
                session_id: sessionId,
                status: "offline",
                created_at: new Date().toISOString(),
                offline: true
            })
        );
    }

    // ============ NPC Dialogue & Interaction (Stage 3) ============

    async generateNPCDialogue(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/dialogue/npc/generate', params);
                return res.data;
            },
            () => ({
                lines: [`${params.npc_id || 'NPC'}: Hello! (Offline mode)`],
                emotion: 'neutral',
                can_register_mission: false,
                offline: true
            })
        );
    }

    async evaluateNPCInteraction(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/dialogue/evaluate-interaction', params);
                return res.data;
            },
            () => ({
                creates_subtask: false,
                provides_hint: false,
                unlocks_alternative: false,
                triggers_event: false,
                offline: true
            })
        );
    }

    async generateGreeting(characterId, params = {}) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post(`/dialogue/greeting/${characterId}`, params);
                return res.data;
            },
            () => ({
                greeting: `${characterId}: Hello there! Ready for an adventure?`,
                emotion: 'happy',
                offline: true
            })
        );
    }

    async generateTransformation(characterId, params = {}) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post(`/dialogue/transformation/${characterId}`, params);
                return res.data;
            },
            () => ({
                transformation_line: `${characterId}: Time to transform!`,
                emotion: 'excited',
                offline: true
            })
        );
    }

    async getDialogueTypes() {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.get('/dialogue/types');
                return res.data;
            },
            () => ({
                types: ['greeting', 'mission', 'transformation', 'celebration'],
                offline: true
            })
        );
    }

    // ============ Mission Session Management ============

    async startMissionSession(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/missions/start', params);
                return res.data;
            },
            () => ({
                session_id: `offline_mission_${Date.now()}`,
                mission: params.mission,
                status: 'active',
                offline: true
            })
        );
    }

    async getMissionProgress(sessionId) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.get(`/missions/progress/${sessionId}`);
                return res.data;
            },
            () => ({
                session_id: sessionId,
                progress: 0,
                completed_tasks: [],
                offline: true
            })
        );
    }

    async advanceMissionSession(sessionId, params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post(`/missions/advance/${sessionId}`, params);
                return res.data;
            },
            () => ({
                session_id: sessionId,
                status: 'advanced',
                offline: true
            })
        );
    }

    async deleteMissionSession(sessionId) {
        return this._withBackend(
            async () => {
                await apiClient.axiosInstance.delete(`/missions/${sessionId}`);
                return { success: true };
            },
            () => ({ success: true, offline: true })
        );
    }

    async getActiveMissions() {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.get('/missions/active');
                return res.data;
            },
            () => ({
                active_missions: [],
                offline: true
            })
        );
    }

    // ============ Campaign Generation ============

    async generateCampaign(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/campaign/generate', params);
                return res.data;
            },
            () => ({
                campaign_id: `offline_campaign_${Date.now()}`,
                title: params.theme || 'Adventure Campaign',
                missions: [],
                description: 'Offline campaign placeholder',
                offline: true
            })
        );
    }

    // ============ Content Generation ============

    async generateMissionContent(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/content/mission', params);
                return res.data;
            },
            () => ({
                mission_id: `offline_${Date.now()}`,
                title: params.mission_type || 'Delivery Mission',
                description: 'Help needed at destination',
                objectives: ['Complete the task'],
                offline: true
            })
        );
    }

    async generateMissionsBatch(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/content/missions/batch', params);
                return res.data;
            },
            () => ({
                missions: [],
                count: 0,
                offline: true
            })
        );
    }

    async generateLocationContent(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/content/location', params);
                return res.data;
            },
            () => ({
                location_id: `offline_location_${Date.now()}`,
                name: params.name || 'Unknown Location',
                description: 'A mysterious place',
                npcs: [],
                items: [],
                offline: true
            })
        );
    }

    async generateEventContent(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/content/event', params);
                return res.data;
            },
            () => ({
                event_id: `offline_event_${Date.now()}`,
                title: 'Random Event',
                description: 'Something unexpected happens',
                choices: [],
                offline: true
            })
        );
    }

    async getMissionTypes() {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.get('/content/mission-types');
                return res.data;
            },
            () => ({
                mission_types: ['delivery', 'construction', 'police', 'sports', 'animal_care'],
                offline: true
            })
        );
    }

    async expandContent(params) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/content/expand-content', params);
                return res.data;
            },
            () => ({
                expanded: false,
                message: 'Content expansion not available offline',
                offline: true
            })
        );
    }

    // ============ Scene & Asset Selection (Stage 1) ============

    /**
     * 選擇場景背景圖片
     * @param {Object} sceneContext - 場景上下文
     * @returns {Promise<Object>} 背景圖片選擇結果
     */
    async selectSceneBackground(sceneContext) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/images/select-scene-background', sceneContext);
                return {
                    primary: res.data.primary || res.data.image_path,
                    filename: res.data.filename,
                    category: res.data.category || 'scene_background',
                    confidence: res.data.confidence || 0.8,
                    alternatives: res.data.alternatives || [],
                    offline: false
                };
            },
            () => ({
                primary: null,  // null 表示使用 fallback 漸層
                filename: 'gradient_fallback',
                category: 'scene_background',
                confidence: 0.3,
                alternatives: [],
                offline: true
            })
        );
    }

    /**
     * 生成 NPC 肖像
     * @param {Object} npcContext - NPC 上下文
     * @returns {Promise<Object>} NPC 肖像選擇結果
     */
    async generateNPCPortrait(npcContext) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/images/generate-npc-portrait', npcContext);
                return {
                    primary: res.data.primary || res.data.image_path,
                    filename: res.data.filename,
                    category: res.data.category || 'npc_portrait',
                    confidence: res.data.confidence || 0.8,
                    alternatives: res.data.alternatives || [],
                    offline: false
                };
            },
            () => {
                // Fallback: 使用 jett 的預設圖片
                const fallbackPath = 'assets/images/characters/jett/all/action_pose_v1.png';
                return {
                    primary: fallbackPath,
                    filename: 'npc_fallback',
                    category: 'npc_portrait',
                    confidence: 0.3,
                    alternatives: [],
                    offline: true
                };
            }
        );
    }

    /**
     * 選擇飛行場景背景
     * @param {Object} flightContext - 飛行上下文
     * @returns {Promise<Object>} 飛行背景選擇結果
     */
    async selectFlightBackground(flightContext) {
        return this._withBackend(
            async () => {
                const res = await apiClient.axiosInstance.post('/images/select-flight-background', flightContext);
                return {
                    primary: res.data.primary || res.data.image_path,
                    filename: res.data.filename,
                    category: res.data.category || 'flight_background',
                    confidence: res.data.confidence || 0.8,
                    alternatives: res.data.alternatives || [],
                    layers: res.data.layers || [],  // 支援多層背景
                    offline: false
                };
            },
            () => ({
                primary: null,  // null 表示使用預設背景
                filename: 'default_sky',
                category: 'flight_background',
                confidence: 0.3,
                alternatives: [],
                layers: [],
                offline: true
            })
        );
    }
}

export const aiService = new AIService();
