/**
 * AI Asset Manager
 * Centralized helper to fetch AI-selected media (images/frames) with preload and safe fallbacks.
 */
import { imageSelector } from './image-selector-service.js';
import { aiService } from './ai-service.js';

const DEFAULT_PLACEHOLDER = 'assets/images/characters/jett/all/action_pose_v1.png';
const VALID_CHARACTERS = ['jett', 'jerome', 'donnie', 'chase', 'flip', 'todd', 'paul', 'bello'];

function characterFallback(characterId) {
    // 驗證 characterId 是否有效
    if (!characterId) {
        return DEFAULT_PLACEHOLDER;
    }

    const normalizedId = characterId.toLowerCase();

    // NPC 使用特殊 ID，映射到 jett
    if (normalizedId.startsWith('npc_')) {
        console.log(`[AIAssetManager] NPC character "${characterId}", using jett fallback`);
        return DEFAULT_PLACEHOLDER;
    }

    if (!VALID_CHARACTERS.includes(normalizedId)) {
        console.warn(`[AIAssetManager] Invalid characterId: "${characterId}", using fallback: jett`);
        return DEFAULT_PLACEHOLDER;
    }

    return `assets/images/characters/${normalizedId}/all/action_pose_v1.png`;
}

async function safeSelect(fn, fallbackResult = {}, characterId = null, context = {}) {
    try {
        const res = await fn();
        if (!res || (Array.isArray(res) && res.length === 0)) {
            await maybeQueueComfy(characterId, context);
            return fallbackResult;
        }
        return res;
    } catch (e) {
        console.warn('[AIAssetManager] selection failed, using fallback', e);
        await maybeQueueComfy(characterId, context);
        return fallbackResult;
    }
}

function ensureSelection(selection, characterId = null, context = {}) {
    if (selection && selection.primary) return selection;
    // 嘗試觸發 ComfyUI 生成（非阻塞）
    maybeQueueComfy(characterId, context).catch(() => {});
    return { primary: characterFallback(characterId), filename: 'fallback.png', category: 'fallback' };
}

function normalizeProfileContext(context = {}) {
    return {
        action: context.action || 'heroic_pose',
        emotion: context.emotion || 'determined',
        game_state: context.game_state || 'hangar_showcase',
        context: context.context || 'character_profile'
    };
}

async function preloadPaths(paths) {
    const cache = {};
    const unique = Array.from(new Set(paths.filter(Boolean)));

    await Promise.all(unique.map(path => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            cache[path] = img;
            resolve(img);
        };
        img.onerror = () => {
            cache[path] = null;
            resolve(null);
        };
        img.src = path;
    })));

    return cache;
}

function normalizeSelections(selections = {}) {
    const normalized = {};
    for (const [key, sel] of Object.entries(selections)) {
        normalized[key] = ensureSelection(sel);
    }
    return normalized;
}

async function maybeQueueComfy(characterId, context = {}) {
    if (!characterId) return;
    try {
        await aiService.comfyQueue({
            workflow: 'auto_generate_image',
            character_id: characterId,
            context
        });
    } catch (e) {
        // 靜默失敗，保持佔位圖
    }
}

export const aiAssetManager = {
    placeholder: DEFAULT_PLACEHOLDER,
    getCharacterPlaceholder: (characterId) => characterFallback(characterId),

    async getLaunchImages(characterId) {
        const selections = normalizeSelections(
            await safeSelect(() => imageSelector.preloadForLaunch(characterId), {}, characterId, { phase: 'launch' })
        );
        const paths = Object.values(selections).map(s => s.primary);
        const cache = await preloadPaths(paths);
        return { selections, cache };
    },

    async getArrivalImages(characterId, location = '') {
        const selections = normalizeSelections(
            await safeSelect(() => imageSelector.preloadForArrival(characterId, location), {}, characterId, { phase: 'arrival', location })
        );
        const paths = Object.values(selections).map(s => s.primary);
        const cache = await preloadPaths(paths);
        return { selections, cache };
    },

    async getReturnImages(characterId) {
        const selections = normalizeSelections(
            await safeSelect(() => imageSelector.preloadForReturn(characterId), {}, characterId, { phase: 'return' })
        );
        const paths = Object.values(selections).map(s => s.primary);
        const cache = await preloadPaths(paths);
        return { selections, cache };
    },

    async getTransformFrames(characterId, options = {}) {
        const frames = await safeSelect(
            () => imageSelector.getTransformSequence(characterId, options),
            [],
            characterId,
            { phase: 'transform', options }
        );
        const resolvedFrames = (frames && frames.length ? frames : [characterFallback(characterId)]);
        const cache = await preloadPaths(resolvedFrames);
        return { frames: resolvedFrames, cache };
    },

    async preloadMissionImage(characterId, missionType, phase = 'active') {
        const selection = ensureSelection(
            await safeSelect(() => imageSelector.selectForMission(characterId, missionType, phase), null, characterId, { missionType, phase })
        );
        const cache = await preloadPaths([selection.primary]);
        return { selection, cache };
    },

    async preloadDialogueImage(characterId, emotion = 'neutral', dialogueType = 'conversation') {
        const selection = ensureSelection(
            await safeSelect(() => imageSelector.selectForDialogue(characterId, emotion, dialogueType), null, characterId, { dialogueType, emotion })
        );
        const cache = await preloadPaths([selection.primary]);
        return { selection, cache };
    },

    async preloadProfileImage(characterId, context = {}) {
        const selection = ensureSelection(
            await safeSelect(
                () => imageSelector.select(characterId, normalizeProfileContext(context)),
                null,
                characterId,
                { profile: true, context }
            )
        );
        const cache = await preloadPaths([selection.primary]);
        return { selection, cache };
    },

    /**
     * 預載場景背景（探索模式）
     * @param {string} location - 地點名稱 (e.g., "Paris", "Tokyo", "New York")
     * @param {Object} options - 場景選項
     * @param {string} options.timeOfDay - 時段 (morning, afternoon, evening, night)
     * @param {string} options.weather - 天氣 (clear, cloudy, rainy, snowy)
     * @param {string} options.season - 季節 (spring, summer, autumn, winter)
     * @returns {Promise<{selection: Object, cache: Object}>}
     */
    async preloadSceneBackground(location, options = {}) {
        // 構建場景上下文
        const sceneContext = {
            location: location || 'generic_city',
            time_of_day: options.timeOfDay || 'afternoon',
            weather: options.weather || 'clear',
            season: options.season || 'summer',
            style: options.style || 'cartoon'
        };

        // 調用 AI 服務選擇場景背景 - 不使用 ensureSelection，直接使用 safeSelect
        const selection = await safeSelect(
            async () => {
                // 調用後端 AI 服務選擇場景背景
                const result = await aiService.selectSceneBackground(sceneContext);
                return result;
            },
            // Fallback: 使用預設的漸層背景
            {
                primary: null,  // null 表示使用 fallback 漸層
                filename: 'gradient_fallback',
                category: 'scene_background',
                confidence: 0.3,
                alternatives: [],
                offline: true
            },
            null,  // 不需要 characterId
            sceneContext
        );

        // 確保返回的是完整的 selection 對象
        const finalSelection = selection || {
            primary: null,
            filename: 'gradient_fallback',
            category: 'scene_background',
            confidence: 0.3,
            alternatives: [],
            offline: true
        };

        // 如果有實際圖片路徑且不是角色圖片，預載入
        if (finalSelection.primary && !finalSelection.primary.includes('/characters/')) {
            const cache = await preloadPaths([finalSelection.primary]);
            return { selection: finalSelection, cache };
        }

        // 沒有有效圖片，返回 null（使用漸層）
        console.log('[AIAssetManager] Using gradient fallback for scene background');
        return { selection: { ...finalSelection, primary: null }, cache: {} };
    },

    /**
     * 預載飛行場景背景
     * @param {Object} flightContext - 飛行上下文（時間、天氣、高度等）
     * @returns {Promise<{selection: Object, cache: Object}>}
     */
    async preloadFlightBackground(flightContext = {}) {
        const context = {
            time_of_day: flightContext.time_of_day || 'afternoon',
            weather: flightContext.weather || 'clear',
            altitude: flightContext.altitude || 'high',
            mission_type: flightContext.mission_type || 'delivery',
            destination: flightContext.destination || 'unknown',
            style: flightContext.style || 'cartoon'
        };

        // 不使用 ensureSelection，直接使用 safeSelect
        const selection = await safeSelect(
            async () => await aiService.selectFlightBackground(context),
            {
                primary: null,  // null = fallback to gradient/parallax default
                filename: 'parallax_fallback',
                category: 'flight_background',
                confidence: 0.3,
                alternatives: [],
                offline: true
            },
            null,  // 不需要 characterId
            context
        );

        // 確保返回的是完整的 selection 對象
        const finalSelection = selection || {
            primary: null,
            filename: 'parallax_fallback',
            category: 'flight_background',
            confidence: 0.3,
            alternatives: [],
            offline: true
        };

        // 如果有實際圖片路徑且不是角色圖片，預載入
        if (finalSelection.primary && !finalSelection.primary.includes('/characters/')) {
            const cache = await preloadPaths([finalSelection.primary]);
            return { selection: finalSelection, cache };
        }

        // 沒有有效圖片，返回 null（使用預設視差背景）
        console.log('[AIAssetManager] Using parallax fallback for flight background');
        return { selection: { ...finalSelection, primary: null }, cache: {} };
    },

    /**
     * 預載 NPC 肖像
     * @param {string} npcArchetype - NPC 原型 (e.g., "shopkeeper", "child", "elder")
     * @param {Object} options - NPC 選項
     * @returns {Promise<{selection: Object, cache: Object}>}
     */
    async preloadNPCPortrait(npcArchetype, options = {}) {
        const npcContext = {
            archetype: npcArchetype || 'generic',
            emotion: options.emotion || 'neutral',
            age: options.age || 'adult',
            style: options.style || 'cartoon'
        };

        const selection = ensureSelection(
            await safeSelect(
                async () => {
                    // 調用後端 AI 服務生成 NPC 肖像
                    const result = await aiService.generateNPCPortrait(npcContext);
                    return result;
                },
                // Fallback: 使用 jett 的預設圖片
                {
                    primary: characterFallback('jett'),
                    filename: 'npc_fallback',
                    category: 'npc_portrait',
                    confidence: 0.3,
                    alternatives: []
                },
                null,
                npcContext
            )
        );

        const cache = await preloadPaths([selection.primary]);
        return { selection, cache };
    }
};

// Make globally reachable for quick testing
window.aiAssetManager = aiAssetManager;
