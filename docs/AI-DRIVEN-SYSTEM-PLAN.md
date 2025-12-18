# Super Wings Simulator - API 修復與 AI 驅動系統計劃

## ⚠️ **用戶優先級**: 先修復所有 API 錯誤，再做新功能

---

## 🔥 **階段 0A: 立即 API 修復（最高優先級）**

**目標**: 修復所有 422 和 500 API 錯誤，確保遊戲可正常運作
**預計時間**: 1-2 小時

### 問題 1: 422 錯誤 - `/api/v1/dialogue/generate`

**根本原因**: 前端參數與後端 Pydantic schema 完全不匹配

**後端期望** (`backend/api/routers/dialogue.py` line 27-37):
```python
class DialogueRequestBody(BaseModel):
    character_id: str              # ← 必填
    dialogue_type: str = "conversation"
    situation: str                 # ← 必填
    mission_phase: Optional[str] = None
    emotion: str = "happy"
    speaking_to: str = "child"
    dialogue_history: Optional[List[str]] = None
    location: Optional[str] = None
    problem: Optional[str] = None
```

**前端實際發送** (`js/core/ai-service.js` line 334-342):
```javascript
{
    npc_name: options.npcName,           // ❌ 後端不接受
    player_name: options.playerName,     // ❌ 後端不接受
    location: options.location,          // ✅ OK
    mission_type: options.missionType,   // ❌ 後端不接受
    emotion: options.emotion,            // ✅ OK
    tone: options.tone,                  // ❌ 後端不接受
    context: options.context,            // ❌ 後端不接受
    previous_dialogue: options.previous, // ❌ 應為 dialogue_history
}
```

**修復方案**: 修改 `js/core/ai-service.js` line 333-357

```javascript
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
```

---

### 問題 2: 422 錯誤 - `/api/v1/animation/plan`

**根本原因**: 前端缺少必填的 `character_id` 參數

**後端期望** (`backend/api/routers/animation.py` line 24-32):
```python
class PlanAnimationRequest(BaseModel):
    animation_type: AnimationType
    character_id: str              # ← 必填！
    duration_ms: int = Field(2000, ge=500, le=10000)
    frame_rate: int = Field(24, ge=12, le=60)
    easing: EasingFunction = EasingFunction.EASE_IN_OUT
    loop: bool = False
    export_format: ExportFormat = ExportFormat.GIF
```

**前端實際發送** (`js/core/ai-service.js` line 396-401):
```javascript
{
    animation_type: animationType,
    context: options.context || {},        // ❌ 後端不接受
    duration_ms: options.durationMs || 4000,
    easing: options.easing || "ease_in_out"
    // ❌ 缺少 character_id！
}
```

**修復方案**: 修改 `js/core/ai-service.js` line 393-413

```javascript
async planAnimation(animationType, options = {}) {
    // 從 options 提取角色 ID，或使用預設值
    const characterId = options.characterId ||
                        options.character_id ||
                        gameState?.currentMission?.assignedCharId ||
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
```

**同時需要修復調用端**: 檢查所有調用 `planAnimation` 的地方，確保傳入 `characterId`:

```bash
# 搜尋所有調用
grep -r "planAnimation" js/ --include="*.js"
```

預期會在以下檔案找到調用：
- `js/ui/screens/transformation.js`
- `js/ui/screens/launch.js`
- 其他動畫相關螢幕

確保每個調用都傳入角色 ID：
```javascript
await aiService.planAnimation('takeoff', {
    characterId: mission.assignedCharId,  // ← 添加這行
    durationMs: 3000
});
```

---

### 問題 3: JavaScript 錯誤 - `Cannot read properties of undefined (reading 'rewardMoney')`

**根本原因**: `results.js` 未檢查 `mission` 是否存在

**錯誤位置** (`js/ui/screens/results.js` line 12-17):
```javascript
const mission = this.data.mission;  // 可能是 undefined
const char = this.data.char;
const rewards = this.data.rewards || {
    money: mission.rewardMoney,     // ❌ mission 可能不存在！
    exp: mission.rewardExp,
    bonus: 0
};
```

**修復方案**: 修改 `js/ui/screens/results.js` line 10-18

```javascript
render() {
    // 防禦性檢查
    const mission = this.data?.mission;
    const char = this.data?.char;

    // 如果沒有 mission 資料，使用預設值
    const rewards = this.data?.rewards || {
        money: mission?.rewardMoney || 0,
        exp: mission?.rewardExp || 0,
        bonus: 0
    };

    // 如果缺少關鍵資料，顯示錯誤訊息
    if (!mission) {
        console.error('[ResultsScreen] Missing mission data:', this.data);
        this.container.innerHTML = `
            <div class="screen results-screen anim-fade-in">
                <div class="result-card anim-slide-up">
                    <h2 class="result-title">⚠️ 資料錯誤</h2>
                    <p>無法載入任務結果資料</p>
                    <button id="btn-back-hangar" class="btn btn-primary">返回機庫</button>
                </div>
            </div>
        `;
        document.getElementById('btn-back-hangar')?.addEventListener('click', () => {
            window.game.renderHangar();
        });
        return;
    }

    // 原有的渲染邏輯...
    this.container.innerHTML = `
        <div class="screen results-screen anim-fade-in">
            <div class="result-card anim-slide-up">
                <h2 class="result-title">MISSION COMPLETE!</h2>

                <div class="mission-summary">
                    <h3>${mission.title || 'Unknown Mission'}</h3>
                    <p>${mission.location || 'Unknown Location'}</p>
                </div>
    `;
    // ... 繼續原有程式碼
}
```

---

### 問題 4: 404 錯誤調查

**檔案不存在錯誤**:
1. `action_pose_v1.png` - 圖片路徑解析問題
2. Voice `.wav` 檔案 - 語音生成失敗

**調查步驟**:

1. **檢查圖片路徑**:
```bash
# 搜尋 action_pose_v1.png 的所有引用
grep -r "action_pose_v1" js/ assets/ --include="*.js" --include="*.json"

# 檢查實際檔案是否存在
find assets/ -name "*action_pose*" -type f
```

2. **檢查語音生成**:
```bash
# 檢查語音 API 是否正常運作
curl -X POST http://localhost:8001/api/v1/voice/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "character_id": "jett",
    "emotion": "happy"
  }'
```

3. **暫時方案**: 在 `image-selector-service.js` 和語音生成處添加錯誤處理：

```javascript
// js/core/image-selector-service.js
async getCharacterImage(characterId, state) {
    try {
        // 原有邏輯
        const path = this.buildImagePath(characterId, state);

        // 檢查路徑是否有效
        if (!path || path.includes('undefined')) {
            console.warn(`[ImageSelector] Invalid path for ${characterId}:${state}, using fallback`);
            return this.getFallbackImage(characterId);
        }

        return path;
    } catch (error) {
        console.error(`[ImageSelector] Error getting image:`, error);
        return this.getFallbackImage(characterId);
    }
}

getFallbackImage(characterId) {
    return `assets/images/characters/${characterId}/neutral.png`;
}
```

---

### 階段 0A 完成檢查清單

- [ ] 修復 `ai-service.js` 的 `generateDialogue()` 參數
- [ ] 修復 `ai-service.js` 的 `planAnimation()` 參數
- [ ] 檢查所有 `planAnimation()` 調用端，添加 `characterId`
- [ ] 修復 `results.js` 的 undefined 檢查
- [ ] 調查 404 圖片錯誤並添加 fallback
- [ ] 調查 404 語音錯誤
- [ ] 測試所有修復的 API 端點

---

## 📋 執行摘要

本計劃將遊戲從「固定模板 + AI 裝飾」轉變為「AI 全程主導、動態生成、自由探索」的真正 AI 驅動遊戲。

### 核心目標
1. ✅ **API 錯誤修復** - 立即修復所有 422/404/500 錯誤（階段 0A）
2. ✅ **AI 主導任務** - 從生成到完成全程 AI 介入，支援動態分支
3. ✅ **自由探索** - 移除行動限制，任務記錄延遲開啟
4. ✅ **NPC 互動革新** - 所有對話 AI 生成，可影響任務
5. ✅ **角色系統平權** - 無限夥伴，所有角色都能完整互動
6. ✅ **後端 API 完整化** - 註冊所有未使用端點，修復 404 錯誤

---

## 🚀 階段 0B: 前置準備（在 0A 之後執行）

### 清理環境
```bash
# 1. 殺死所有佔用的後端 port
pkill -f "uvicorn" || pkill -f "python.*backend"
pkill -f "http.server"

# 2. 清理瀏覽器快取（手動）
# Chrome: Ctrl+Shift+Delete → 勾選「快取的圖片和檔案」
# Firefox: Ctrl+Shift+Delete → 勾選「快取」

# 3. 重啟後端（如果需要）
cd /home/justin/web-projects/super-wings-simulator/backend
python -m uvicorn api.main:app --reload --port 8001
```

---

## 📦 階段 1: 後端 API 修復與註冊（優先度: 最高）

**時間估計**: 1-2 天
**目標**: 修復 404 錯誤，啟用所有已實作功能

### 1.1 註冊所有未註冊的 Router

**檔案**: `/home/justin/web-projects/super-wings-simulator/backend/api/main.py` (153 行)

**修改步驟**:

1. **添加 import** (在 line 14-26 之後):
```python
from .routers import (
    health,
    characters,
    dialogue,
    dispatch,
    narration,
    events,
    tutorial,
    progress,
    missions,
    images,
    content,
    # ===== 新增以下 8 個 =====
    assets,
    campaign,
    comfyui,
    prompt,
    image_generation,
    animation,
    sound,
    voice,
)
```

2. **註冊 router** (在 line 141 之後):
```python
# 修復 404 錯誤
app.include_router(
    assets.router,
    prefix=f"{settings.api.api_prefix}/assets",
    tags=["Assets"]
)

app.include_router(
    campaign.router,
    prefix=f"{settings.api.api_prefix}/campaign",
    tags=["Campaign"]
)

# 圖片生成基礎設施
app.include_router(
    comfyui.router,
    prefix=f"{settings.api.api_prefix}/comfyui",
    tags=["ComfyUI"]
)

app.include_router(
    prompt.router,
    prefix=f"{settings.api.api_prefix}/prompt",
    tags=["Prompt Engineering"]
)

app.include_router(
    image_generation.router,
    prefix=f"{settings.api.api_prefix}/image-generation",
    tags=["Image Generation"]
)

# 動畫與多媒體
app.include_router(
    animation.router,
    prefix=f"{settings.api.api_prefix}/animation",
    tags=["Animation"]
)

app.include_router(
    sound.router,
    prefix=f"{settings.api.api_prefix}/sound",
    tags=["Sound Effects"]
)

app.include_router(
    voice.router,
    prefix=f"{settings.api.api_prefix}/voice",
    tags=["Voice Generation"]
)
```

### 1.2 新增 RAG API 端點

**新檔案**: `/home/justin/web-projects/super-wings-simulator/backend/api/routers/rag.py`

**實作內容**:
```python
"""
RAG (Retrieval-Augmented Generation) API endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

router = APIRouter()

class RAGSessionRequest(BaseModel):
    type: str  # 'global' or 'mission'
    mission_id: Optional[str] = None
    parent_session: Optional[str] = None
    knowledge_domains: List[str] = []

@router.post("/create-session")
async def create_rag_session(request: RAGSessionRequest):
    """Create a new RAG session with knowledge base."""
    from ...core.rag import get_knowledge_base

    kb = get_knowledge_base()
    session_id = f"session_{request.type}_{id(request)}"

    return {"session_id": session_id}

@router.post("/update-context")
async def update_rag_context(request: dict):
    """Update RAG context with current game state."""
    return {"success": True}

@router.post("/query")
async def query_rag(request: dict):
    """Query RAG system for information."""
    from ...core.rag import get_knowledge_base

    kb = get_knowledge_base()
    results = await kb.search_similar(
        request.get("question", ""),
        collection_name="super_wings_missions",
        n_results=request.get("max_results", 5)
    )

    return {"results": results}
```

**同時在 main.py 註冊**:
```python
from .routers import (
    # ... existing
    rag,  # 添加這行
)

app.include_router(
    rag.router,
    prefix=f"{settings.api.api_prefix}/rag",
    tags=["RAG"]
)
```

### 1.3 擴展任務 API 端點

**檔案**: `/home/justin/web-projects/super-wings-simulator/backend/api/routers/missions.py`

**添加新端點** (在檔案末尾):
```python
@router.post("/generate-graph")
async def generate_mission_graph(request: dict):
    """Generate dynamic mission graph with branches."""
    # 返回任務節點網絡結構
    return {
        "nodes": [
            {"id": "start", "type": "talk", "alternatives": ["explore_first"]},
            {"id": "collect", "type": "fetch", "prerequisites": ["start"]},
            {"id": "deliver", "type": "fetch", "prerequisites": ["collect"]}
        ],
        "entry_points": ["start"]
    }

@router.post("/evaluate-progress")
async def evaluate_mission_progress(request: dict):
    """Evaluate mission progress and suggest next steps."""
    return {
        "next_options": ["continue_main", "side_quest"],
        "hints": ["尋找任務 NPC 附近的線索"],
        "dynamic_branches": []
    }

@router.post("/evaluate-completion")
async def evaluate_mission_completion(request: dict):
    """Evaluate if mission is complete (supports alternatives)."""
    completed_tasks = request.get("completed_tasks", [])
    return {
        "is_complete": len(completed_tasks) >= 2,
        "type": "full",
        "reward_modifier": 1.0,
        "summary": "任務完成！"
    }

@router.post("/evaluate-state")
async def evaluate_mission_state(request: dict):
    """Continuously evaluate mission state for AI orchestration."""
    return {
        "suggested_events": [],
        "new_opportunities": [],
        "hints": [],
        "hint_urgency": "low"
    }
```

### 1.4 擴展對話 API 端點

**檔案**: `/home/justin/web-projects/super-wings-simulator/backend/api/routers/dialogue.py`

**添加新端點**:
```python
@router.post("/npc/generate")
async def generate_npc_dialogue(request: dict):
    """Generate NPC dialogue with full AI context."""
    from ...core.agents import get_dialogue_agent

    agent = get_dialogue_agent()
    # 簡化實作，實際應該調用 AI 生成
    return {
        "lines": [f"{request.get('npc_id', 'NPC')}: 你好！需要幫忙嗎？"],
        "emotion": "neutral",
        "can_register_mission": request.get("is_mission_npc", False)
    }

@router.post("/evaluate-interaction")
async def evaluate_npc_interaction(request: dict):
    """Evaluate impact of NPC interaction on mission."""
    return {
        "creates_subtask": False,
        "provides_hint": False,
        "unlocks_alternative": False,
        "triggers_event": False
    }
```

---

## 🧠 階段 2: AI 主導任務系統重構（核心改造）

**時間估計**: 3-5 天
**目標**: 讓 AI 持續參與任務，支援動態分支

### 2.1 新增 AI 任務協調器

**新檔案**: `/home/justin/web-projects/super-wings-simulator/js/systems/ai-mission-orchestrator.js`

**核心功能**:
- 持續運行的 AI 評估引擎（每 10 秒評估一次）
- 收集遊戲狀態並傳送給後端 AI
- 處理 AI 建議的動態事件、新分支、提示

**實作要點**:
```javascript
export class AIMissionOrchestrator {
    constructor() {
        this.activeMission = null;
        this.evaluationInterval = 10000; // 每10秒評估一次
        this.ragSession = null;
    }

    async startMission(mission) {
        this.activeMission = mission;

        // 初始化 RAG 會話
        this.ragSession = await aiService.createRAGSession({
            type: 'mission',
            mission_id: mission.id,
            context: mission.serialize()
        });

        // 啟動評估循環
        this.evaluationLoop = setInterval(() => {
            this.performAIEvaluation();
        }, this.evaluationInterval);
    }

    async performAIEvaluation() {
        const gameState = this.captureGameState();

        const evaluation = await aiService.evaluateMissionState({
            rag_session_id: this.ragSession,
            mission: this.activeMission.serialize(),
            game_state: gameState
        });

        // 處理 AI 建議
        if (evaluation.suggested_events) {
            this.triggerDynamicEvents(evaluation.suggested_events);
        }

        if (evaluation.new_opportunities) {
            this.addAlternativePaths(evaluation.new_opportunities);
        }
    }
}
```

### 2.2 改造任務模型

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/models/exploration-mission.js` (626 行)

**修改重點**:

1. **添加 AI 上下文追蹤** (在 constructor 中):
```javascript
// 新增: AI 持續追蹤
this.aiContext = {
    conversationHistory: [],    // 所有 NPC 對話
    playerChoices: [],          // 玩家選擇記錄
    worldEvents: [],            // 世界事件
    lastAIEvaluation: null,     // 上次 AI 評估
    dynamicBranches: []         // AI 動態添加的分支
};

// 新增: 替代完成追蹤
this.alternativeCompletions = new Map();

// 新增: RAG 會話 ID
this.ragSessionId = null;
```

2. **改造完成檢查** (找到 `checkCompletion()` 方法):
```javascript
async checkCompletion() {
    // AI 評估任務完成度，支援部分完成、替代完成
    const evaluation = await aiService.evaluateMissionCompletion({
        mission_id: this.id,
        completed_tasks: this.completedSubTasks,
        alternative_completions: Array.from(this.alternativeCompletions.entries()),
        player_progress: this.stats
    });

    if (evaluation.is_complete) {
        this.complete({
            completion_type: evaluation.type,
            reward_modifier: evaluation.reward_modifier,
            ai_summary: evaluation.summary
        });
    } else if (evaluation.can_continue) {
        // AI 建議新的任務節點
        await this.addDynamicTasks(evaluation.suggested_tasks || []);
    }
}
```

3. **新增動態任務添加方法**:
```javascript
async addDynamicTasks(aiTasks) {
    for (const taskData of aiTasks) {
        const task = new SubTask({
            ...taskData,
            isDynamic: true,
            aiGenerated: true,
            optional: true  // 動態任務通常是選擇性的
        });
        this.subTasks.push(task);
        this.aiContext.dynamicBranches.push(task.id);
    }

    eventBus.emit('DYNAMIC_TASKS_ADDED', {
        mission: this,
        newTasks: aiTasks
    });
}
```

### 2.3 改造任務生成器

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/systems/exploration-mission-generator.js` (616 行)

**修改重點**:

找到 `generateSubTasks()` 方法，改為支援動態分支：

```javascript
async generateDynamicMissionGraph(missionData, difficulty) {
    // 1. 嘗試調用 AI 生成任務圖
    let aiGraph = null;
    try {
        aiGraph = await aiService.generateMissionGraph({
            destination: missionData.destination,
            difficulty: difficulty,
            availableCharacters: this.getAvailableCharacters(),
            worldContext: missionData.worldConfig
        });
    } catch (e) {
        console.warn('[MissionGenerator] AI graph generation failed, using template', e);
    }

    // 2. 如果 AI 失敗，使用原有邏輯
    if (!aiGraph || !aiGraph.nodes) {
        return this.generateSubTasks(missionData, difficulty); // 保留原方法作為備案
    }

    // 3. 建立任務節點網絡
    const tasks = [];
    for (const node of aiGraph.nodes) {
        tasks.push(new SubTask({
            ...node,
            alternatives: node.alternatives || [],
            prerequisites: node.prerequisites || []
        }));
    }

    return tasks;
}
```

### 2.4 新增 RAG 會話管理器

**新檔案**: `/home/justin/web-projects/super-wings-simulator/js/core/rag-session-manager.js`

**核心功能**:
- 維持全局 RAG 會話
- 為每個任務創建專屬會話
- 定期更新 RAG 上下文（每 5 秒）

---

## 💬 階段 3: NPC 對話系統革新（對話 AI 化）

**時間估計**: 2-3 天
**目標**: 任務記錄延遲開啟，所有對話 AI 生成

### 3.1 改造互動系統

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/game/exploration/interaction-system.js` (611 行)

**修改 `interactWithNPC` 方法** (約在 line 193-208):

```javascript
async interactWithNPC(npc) {
    this.isInteracting = true;

    // 1. 檢查是否為任務 NPC
    const missionContext = this.getMissionContextForNPC(npc);

    // 2. AI 生成對話（考慮任務狀態）
    const dialogue = await aiService.generateNPCDialogue({
        npc_id: npc.npcId,
        npc_type: npc.type,
        player_id: this.player.characterId,
        mission_context: missionContext,
        previous_interactions: npc.interactionHistory || [],
        world_state: this.world.getState(),
        is_mission_npc: npc.isMissionNPC,
        mission_registered: npc.missionRegistered || false
    });

    // 3. 開啟對話，傳遞任務上下文
    eventBus.emit('START_DIALOGUE', {
        npc: npc,
        player: this.player,
        dialogue: dialogue,
        missionContext: missionContext,
        canRegisterMission: npc.isMissionNPC && !npc.missionRegistered
    });

    return true;
}
```

**新增輔助方法**:
```javascript
getMissionContextForNPC(npc) {
    const activeMission = this.world.activeMission;
    if (!activeMission) return null;

    const isMissionNPC = activeMission.npcs.some(n => n.id === npc.npcId);
    const isTargetNPC = activeMission.getCurrentTask()?.targetNPC === npc.npcId;

    return {
        has_mission: !!activeMission,
        is_mission_npc: isMissionNPC,
        is_target: isTargetNPC,
        mission_progress: activeMission.completionRate,
        can_register: isMissionNPC && !npc.missionRegistered
    };
}
```

### 3.2 改造對話介面

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/ui/screens/exploration-dialogue.js` (790 行)

**在 `showOptions()` 方法中添加**:

```javascript
showOptions() {
    this.optionsContainer.innerHTML = '';

    // 檢查是否可以註冊任務
    if (this.canRegisterMission && !this.currentNPC.missionRegistered) {
        const registerOption = {
            text: '🎯 記錄此任務',
            action: 'REGISTER_MISSION',
            style: 'highlight'
        };
        this.pendingOptions.unshift(registerOption);
    }

    // ... 原有的 option 渲染邏輯
}
```

**添加新的 action 處理**:
```javascript
executeAction(action, data = {}) {
    switch (action) {
        case 'REGISTER_MISSION':
            this.registerMission();
            break;
        // ... 原有的 cases
    }
}

async registerMission() {
    eventBus.emit('MISSION_REGISTERED', {
        npc: this.currentNPC,
        player: this.player
    });

    this.currentNPC.missionRegistered = true;

    // AI 生成任務確認對話
    const confirmDialogue = await aiService.generateDialogue({
        npcName: this.currentNPC.name,
        playerName: this.player.name,
        context: 'mission_registration',
        tone: 'encouraging'
    });

    this.showNode({
        text: confirmDialogue.lines?.[0] || '任務已記錄！我等你好消息！',
        emotion: 'happy'
    });
}
```

### 3.3 新增 NPC 互動處理器

**新檔案**: `/home/justin/web-projects/super-wings-simulator/js/systems/npc-interaction-handler.js`

**核心功能**:
- 評估 NPC 互動對任務的影響
- 創建動態子任務
- 解鎖替代路徑
- 觸發動態事件

---

## 👥 階段 4: 角色系統平權改造（無限夥伴）

**時間估計**: 2-3 天
**目標**: 移除夥伴上限，所有角色都能互動

### 4.1 移除夥伴數量上限

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/systems/partner-system.js` (564 行)

**修改 line 25**:
```javascript
// 移除固定上限
// this.maxActivePartners = options.maxActivePartners ?? 4;

// 改為無上限 + 效能警告閾值
this.maxActivePartners = Infinity;
this.performanceThreshold = options.performanceThreshold ?? 8;
```

**修改 `callPartner` 方法** (約在 line 141-147):
```javascript
async callPartner(characterId) {
    // ... 原有的冷卻檢查

    // 移除人數限制檢查，改為效能警告
    if (this.activePartners.size >= this.performanceThreshold) {
        const proceed = await this.showPerformanceWarning(this.activePartners.size);
        if (!proceed) return false;
    }

    // ... 繼續原有的召喚邏輯
}
```

**新增效能警告方法**:
```javascript
async showPerformanceWarning(currentCount) {
    return new Promise((resolve) => {
        eventBus.emit('SHOW_CONFIRM_DIALOG', {
            title: '⚠️ 效能提示',
            message: `目前有 ${currentCount} 位夥伴在場，可能影響效能。確定繼續呼叫？`,
            confirmText: '繼續呼叫',
            cancelText: '取消',
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
        });
    });
}
```

### 4.2 實現 Q/E 循環切換

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/game/input/input-handler-exploration.js`

**添加按鍵處理**:
```javascript
handleKeyDown(e) {
    // ... 原有的按鍵處理

    // 角色切換
    if (e.key.toUpperCase() === 'Q') {
        e.preventDefault();
        eventBus.emit('SWITCH_CHARACTER_PREV');
    } else if (e.key.toUpperCase() === 'E') {
        e.preventDefault();
        eventBus.emit('SWITCH_CHARACTER_NEXT');
    }
}
```

**在 PartnerSystem 中實現循環切換** (partner-system.js):
```javascript
// 添加事件監聽 (在 setupEventListeners 中)
setupEventListeners() {
    // ... 原有的監聽
    eventBus.on('SWITCH_CHARACTER_PREV', () => this.switchToPrevious());
    eventBus.on('SWITCH_CHARACTER_NEXT', () => this.switchToNext());
}

/**
 * 切換到上一個角色（循環）
 */
switchToPrevious() {
    const partners = Array.from(this.activePartners.values());
    if (partners.length <= 1) return false;

    const currentIndex = partners.findIndex(p => p === this.currentPlayer);
    const prevIndex = (currentIndex - 1 + partners.length) % partners.length;

    return this.switchTo(partners[prevIndex].characterId);
}

/**
 * 切換到下一個角色（循環）
 */
switchToNext() {
    const partners = Array.from(this.activePartners.values());
    if (partners.length <= 1) return false;

    const currentIndex = partners.findIndex(p => p === this.currentPlayer);
    const nextIndex = (currentIndex + 1) % partners.length;

    return this.switchTo(partners[nextIndex].characterId);
}
```

### 4.3 所有角色都能互動

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/game/exploration/interaction-system.js`

**改造 `findInteractableTargets` 方法** (約在 line 86-149):

```javascript
findInteractableTargets() {
    this.highlightedTargets = [];
    let nearest = null;
    let nearestDist = this.interactRange;
    let nearestPlayer = null;

    // 遍歷所有在場角色，而非只有主控角色
    const allPartners = this.partnerSystem?.getActivePartners() || new Map([[this.player.characterId, this.player]]);

    for (const [id, player] of allPartners) {
        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;

        // 檢查 NPC
        for (const npc of this.world.npcs.values()) {
            const dist = this.getDistance(playerCenterX, playerCenterY, npc);
            if (dist < this.interactRange && dist < nearestDist) {
                nearest = npc;
                nearestDist = dist;
                nearestPlayer = player;
            }
        }

        // 檢查物品
        for (const item of this.world.items.values()) {
            if (item.isCollected) continue;
            const dist = this.getDistance(playerCenterX, playerCenterY, item);
            if (dist < this.interactRange && dist < nearestDist) {
                nearest = item;
                nearestDist = dist;
                nearestPlayer = player;
            }
        }

        // 檢查障礙物
        for (const blocker of this.world.blockers.values()) {
            if (blocker.isResolved) continue;
            const dist = this.getDistance(playerCenterX, playerCenterY, blocker);
            if (dist < this.interactRange && blocker.canInteract(player) && dist < nearestDist) {
                nearest = blocker;
                nearestDist = dist;
                nearestPlayer = player;
            }
        }
    }

    this.currentTarget = nearest;
    this.interactingPlayer = nearestPlayer;  // 記錄哪個角色可以互動
}
```

**改造 `tryInteract` 方法**:
```javascript
tryInteract() {
    if (!this.currentTarget || !this.interactingPlayer) return false;

    // 使用 interactingPlayer 而非 this.player
    const player = this.interactingPlayer;

    // ... 原有的互動邏輯，將所有 this.player 改為 player
}
```

### 4.4 所有角色都能使用能力

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/game/abilities/ability-system.js` (599 行)

**改造 `useAbilityOnBlocker` 方法** (約在 line 261-283):

```javascript
useAbilityOnBlocker(player, blocker) {
    // 檢查所有在場角色是否有可用能力
    const allPartners = this.partnerSystem?.getActivePartners();
    if (!allPartners) {
        return this._useAbilityForSinglePlayer(player, blocker);
    }

    // 尋找擁有匹配能力的角色
    for (const [id, partner] of allPartners) {
        const characterId = partner.characterId;
        const characterAbilities = ABILITY_DEFINITIONS[characterId] || [];

        const matchingAbility = characterAbilities.find(ability =>
            ability.type === 'world_interact' &&
            ability.targetType === blocker.blockerType
        );

        if (matchingAbility) {
            // 找到了！使用此角色的能力
            console.log(`[AbilitySystem] ${characterId} can resolve ${blocker.blockerType}`);
            return this.useAbility(characterId, matchingAbility.id, {
                player: partner,
                target: blocker
            });
        }
    }

    // 沒有任何角色有匹配能力
    eventBus.emit('SHOW_TOAST', {
        message: blocker.hintText || '需要特定角色的能力來解決此障礙',
        type: 'info'
    });
    return { success: false };
}
```

---

## ⚡ 階段 5: 前端 API 整合（連接後端）

**時間估計**: 2-3 天
**目標**: 前端調用所有新增的後端 API

### 5.1 擴展 ai-service.js

**檔案**: `/home/justin/web-projects/super-wings-simulator/js/core/ai-service.js` (361 行)

**在檔案末尾添加新方法**:

```javascript
// ============ 新增: 任務評估與動態生成 ============

async generateMissionGraph(params) {
    return this._withBackend(
        async () => {
            const res = await apiClient.axiosInstance.post('/missions/generate-graph', params);
            return res.data;
        },
        () => ({ nodes: [], entry_points: [], offline: true })
    );
}

async evaluateMissionProgress(params) {
    return this._withBackend(
        async () => {
            const res = await apiClient.axiosInstance.post('/missions/evaluate-progress', params);
            return res.data;
        },
        () => ({ next_options: [], hints: [], dynamic_branches: [], offline: true })
    );
}

async evaluateMissionCompletion(params) {
    return this._withBackend(
        async () => {
            const res = await apiClient.axiosInstance.post('/missions/evaluate-completion', params);
            return res.data;
        },
        () => ({ is_complete: false, offline: true })
    );
}

async evaluateMissionState(params) {
    return this._withBackend(
        async () => {
            const res = await apiClient.axiosInstance.post('/missions/evaluate-state', params);
            return res.data;
        },
        () => ({ suggested_events: [], new_opportunities: [], hints: [], offline: true })
    );
}

// ============ 新增: RAG 會話管理 ============

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

// ============ 新增: NPC 互動影響評估 ============

async generateNPCDialogue(params) {
    return this._withBackend(
        async () => {
            const res = await apiClient.axiosInstance.post('/dialogue/npc/generate', params);
            return res.data;
        },
        () => ({
            lines: [`${params.npc_id}: 你好！（離線模式）`],
            emotion: 'neutral',
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
        () => ({ creates_subtask: false, offline: true })
    );
}
```

---

## 🎨 階段 6: UI/UX 改善（視覺優化）

**時間估計**: 1-2 天
**目標**: 顯示動態任務、角色切換、AI 狀態

### 6.1 動態任務追蹤器

**新檔案**: `/home/justin/web-projects/super-wings-simulator/js/ui/components/dynamic-mission-tracker.js`

**核心功能**:
- 顯示當前目標和替代路徑
- AI 生成的動態任務標記為「AI生成」
- 顯示 AI 提示

### 6.2 角色切換 UI 指示器

**新檔案**: `/home/justin/web-projects/super-wings-simulator/js/ui/components/character-switcher-ui.js`

**核心功能**:
- 顯示所有在場角色的縮圖
- 高亮當前控制角色
- 顯示 Q/E 快捷鍵提示

### 6.3 AI 狀態指示器

**新檔案**: `/home/justin/web-projects/super-wings-simulator/js/ui/components/ai-status-indicator.js`

**核心功能**:
- 顯示「🤖 AI 思考中...」狀態
- 顯示「✅ AI 完成」狀態
- 顯示「❌ AI 錯誤」狀態

---

## 🔧 階段 7: 效能優化（無限夥伴支援）

**時間估計**: 1-2 天
**目標**: 確保 10+ 夥伴時仍流暢

### 7.1 距離分級更新系統

**在 PartnerSystem 中添加**:

```javascript
class PerformanceManager {
    optimizePartnerUpdates() {
        const player = this.partnerSystem.currentPlayer;

        for (const [id, partner] of this.partnerSystem.activePartners) {
            if (partner === player) continue;

            const distance = Math.abs(partner.x - player.x);

            if (distance > 1500) {
                // 遠距離: 1秒更新一次
                partner.updateInterval = 1000;
            } else if (distance > 750) {
                // 中距離: 500ms更新一次
                partner.updateInterval = 500;
            } else {
                // 近距離: 正常頻率
                partner.updateInterval = 100;
            }
        }
    }
}
```

### 7.2 AI 請求隊列

**新檔案**: `/home/justin/web-projects/super-wings-simulator/js/core/ai-request-queue.js`

**核心功能**:
- 限制最多 3 個並發 AI 請求
- 快取 AI 回應（30 秒有效期）
- 避免重複請求

---

## ✅ 階段 8: 測試與驗證

**時間估計**: 2-3 天
**目標**: 確保所有功能正常運作

### 測試檢查清單

#### 後端 API 測試
- [ ] `/api/v1/assets/*` 端點正常回應（修復 404）
- [ ] `/api/v1/campaign/*` 端點正常回應
- [ ] `/api/v1/rag/*` 端點正常回應
- [ ] `/api/v1/missions/generate-graph` 返回分支結構
- [ ] `/api/v1/missions/evaluate-progress` 正確評估進度
- [ ] `/api/v1/dialogue/npc/generate` 生成 AI 對話

#### 任務系統測試
- [ ] 任務可以不按順序完成
- [ ] 可以跳過某些子任務仍完成任務
- [ ] AI 評估器每 10 秒正確運作
- [ ] 動態添加的任務正確顯示
- [ ] RAG 會話持續保持

#### NPC 互動測試
- [ ] 與非任務 NPC 對話時 AI 生成對話
- [ ] 與任務 NPC 對話時顯示「記錄任務」選項
- [ ] 點擊「記錄任務」後任務正確註冊
- [ ] 與非任務 NPC 互動可能觸發新任務

#### 角色系統測試
- [ ] 可以呼叫超過 4 個夥伴
- [ ] 8+ 夥伴時顯示效能警告
- [ ] Q 鍵切換到上一個角色
- [ ] E 鍵切換到下一個角色
- [ ] 切換循環回到主角
- [ ] 任何角色都能撿取物品
- [ ] 任何角色都能與 NPC 對話
- [ ] 任何角色都能使用能力解決障礙物

#### 效能測試
- [ ] 8 個夥伴時 FPS ≥ 45
- [ ] 10 個夥伴時 FPS ≥ 30
- [ ] AI 請求隊列正確限制並發
- [ ] 快取系統正確運作

---

## 📁 關鍵檔案清單（按優先順序）

### 優先度 1（必須立即修改）
1. `/home/justin/web-projects/super-wings-simulator/backend/api/main.py`
   - 註冊所有 router，修復 404 錯誤

2. `/home/justin/web-projects/super-wings-simulator/js/systems/partner-system.js`
   - 移除夥伴上限，實現 Q/E 切換

3. `/home/justin/web-projects/super-wings-simulator/js/game/exploration/interaction-system.js`
   - 改造 NPC 互動，支援所有角色

### 優先度 2（核心功能）
4. `/home/justin/web-projects/super-wings-simulator/js/models/exploration-mission.js`
   - 添加 AI 上下文，改造完成檢查

5. `/home/justin/web-projects/super-wings-simulator/js/systems/exploration-mission-generator.js`
   - 改為 AI 動態分支生成

6. `/home/justin/web-projects/super-wings-simulator/js/ui/screens/exploration-dialogue.js`
   - 添加「記錄任務」功能

7. `/home/justin/web-projects/super-wings-simulator/js/core/ai-service.js`
   - 添加所有新的 AI 端點調用

### 優先度 3（新增檔案）
8. **新增**: `/home/justin/web-projects/super-wings-simulator/js/systems/ai-mission-orchestrator.js`
9. **新增**: `/home/justin/web-projects/super-wings-simulator/js/core/rag-session-manager.js`
10. **新增**: `/home/justin/web-projects/super-wings-simulator/js/systems/npc-interaction-handler.js`
11. **新增**: `/home/justin/web-projects/super-wings-simulator/backend/api/routers/rag.py`
12. **新增**: `/home/justin/web-projects/super-wings-simulator/js/core/ai-request-queue.js`

### 優先度 4（UI 改善）
13. **新增**: `/home/justin/web-projects/super-wings-simulator/js/ui/components/dynamic-mission-tracker.js`
14. **新增**: `/home/justin/web-projects/super-wings-simulator/js/ui/components/character-switcher-ui.js`
15. **新增**: `/home/justin/web-projects/super-wings-simulator/js/ui/components/ai-status-indicator.js`

---

## ⚠️ 風險與緩解策略

### 1. 效能風險
- **問題**: 無限夥伴可能導致 FPS 下降
- **緩解**: 距離分級更新、效能警告、LOD 系統

### 2. AI 回應速度
- **問題**: 多個 AI 請求並發可能過載
- **緩解**: 請求隊列（最多 3 個並發）、快取系統、降級方案

### 3. RAG 記憶體佔用
- **問題**: RAG 會話可能佔用大量記憶體
- **緩解**: 會話超時清理（30 分鐘）、上下文大小限制

### 4. 任務一致性
- **問題**: AI 動態生成可能導致邏輯矛盾
- **緩解**: AI 評估器檢查一致性、強制規則系統

---

## 🎯 成功指標

重構完成後，遊戲應達成：

1. **AI 主導** ✓
   - 任務內容 100% 由 AI 動態生成
   - 所有 NPC 對話 AI 生成
   - 任務評估每 10 秒由 AI 執行
   - RAG 系統持續運作

2. **動態分支** ✓
   - 至少 3 種替代完成方式
   - AI 可即時添加新任務
   - 支援非線性任務流程

3. **自由探索** ✓
   - 可自由與任何 NPC 互動
   - 任務記錄延遲開啟
   - 無強制鎖定或強制結束

4. **角色平權** ✓
   - 可呼叫無限夥伴
   - 所有角色都能互動
   - Q/E 循環切換角色
   - 所有角色都能使用能力

5. **效能達標** ✓
   - 8 個夥伴時 FPS ≥ 45
   - 10 個夥伴時 FPS ≥ 30
   - AI 請求延遲 < 2 秒

---

## 📝 總結

本計劃將把 Super Wings Simulator 從「寫死模板+AI 裝飾」轉變為真正由 AI 主導的動態遊戲。預計總開發時間 **15-20 天**，建議按階段依序實施，每階段完成後進行測試再進入下一階段。

核心改變：
1. ✅ 後端完整化 - 修復 404，啟用所有 AI 功能
2. ✅ 任務系統革新 - AI 持續參與，動態分支，替代解法
3. ✅ NPC 系統重構 - 所有對話 AI 生成，任務延遲註冊
4. ✅ 角色系統平權 - 無上限，所有角色平等參與
5. ✅ RAG 持續運作 - 保持 AI 上下文，動態生成事件

執行順序：階段 0 → 階段 1 → 階段 2 → 階段 3 → 階段 4 → 階段 5 → 階段 6 → 階段 7 → 階段 8
