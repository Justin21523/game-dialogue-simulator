# Super Wings Simulator - 實現指南

## 📋 目錄

1. [專案概述](#專案概述)
2. [已實現功能](#已實現功能)
3. [API 整合清單](#api-整合清單)
4. [測試指南](#測試指南)
5. [性能優化](#性能優化)
6. [錯誤追蹤](#錯誤追蹤)
7. [架構說明](#架構說明)
8. [開發工作流程](#開發工作流程)

---

## 專案概述

Super Wings 網頁模擬遊戲 - 結合經營管理與動作飛行的 Hybrid Game。
前端使用 HTML5 Canvas + Vanilla JS，後端使用 Python FastAPI 處理 AI 資產生成。

### 技術棧

**Frontend:**
- Vanilla JavaScript (ES6 Modules)
- HTML5 Canvas
- IndexedDB + localStorage
- WebSocket
- Fetch API

**Backend:**
- Python 3.10+
- FastAPI
- Transformers (AI/ML)
- ComfyUI (圖像生成)
- AudioGen (音效生成)

---

## 已實現功能

### ✅ Phase 1-2: Backend Core 修復
- Enum 引用修復
- f-string 方法調用修復
- RAG Context 整合
- JSON 解析擴展
- 安全漏洞修復 (路徑遍歷、數據信任)

### ✅ Phase 3: Frontend 核心功能
- 成就系統後端同步
- IndexedDB 持久化系統
- WebSocket 流式對話
- 統計追蹤增強

### ✅ Phase 4: 大規模 API 整合 (62個端點)

#### 4.1 Characters API (8端點)
- 角色圖鑑系統
- 語義搜尋
- 技能篩選
- 角色詳情、技能、視覺配置
- AI 角色推薦與排名

#### 4.2 Missions API (6端點)
- AI 任務生成器
- Mission session 管理 (start/advance/progress/delete)
- 活動任務追蹤面板

#### 4.3 Content API (6端點)
- 單個/批量任務生成
- 地點描述生成
- 動態事件生成
- 任務類型查詢
- 內容擴展

#### 4.4 Tutorial API (5端點)
- 角色使用指南
- 任務類型攻略
- 概念解釋
- 上下文提示
- 自動困難偵測

#### 4.5 Assets API (11端點)
- 服務狀態監控
- 元數據獲取 (characters/locations/quality/icons/sky)
- 快速/完整/自訂生成
- 進度追蹤
- 資產驗證

#### 4.6 其他 API (26端點)
- Voice API: 語音生成
- Sound API: 音效生成 (14端點)
- Animation API: 動畫規劃 (9端點)
- Campaign API: 戰役生成

---

## API 整合清單

### 已整合端點總覽

| 類別 | 端點數 | 實現檔案 |
|------|--------|----------|
| Characters | 8 | `character-encyclopedia.js` |
| Missions | 6 | `game-state.js`, `mission-generator.js`, `active-missions-panel.js` |
| Content | 6 | `content-generator.js` |
| Tutorial | 5 | `tutorial-manager.js` |
| Assets | 11 | `asset-manager.js` |
| Voice/Sound | 16 | `ai-service.js` |
| Animation | 9 | `ai-service.js` |
| Campaign | 1 | 待整合 UI |
| **總計** | **62** | |

### API 使用範例

#### Characters API

```javascript
import CharacterEncyclopedia from './js/ui/screens/character-encyclopedia.js';

// 初始化角色圖鑑
const encyclopedia = new CharacterEncyclopedia();
await encyclopedia.init('encyclopedia-container');

// 語義搜尋角色
await encyclopedia.searchSemantic('飛行專家');

// 按技能篩選
await encyclopedia.filterByAbility('Speed Delivery');

// 查看角色詳情
await encyclopedia.showCharacterModal('jett');
```

#### Missions API

```javascript
import { gameState } from './js/core/game-state.js';

// 開始任務 (創建 backend session)
await gameState.startMission(missionId, characterId);

// 推進任務階段
await gameState.advanceMissionPhase(missionId, 'completed_objective_1');

// 查詢任務進度
const progress = await gameState.getMissionProgress(missionId);

// 完成任務 (刪除 session)
await gameState.completeMission(missionId, bonusScore);
```

#### Content API

```javascript
import contentGenerator from './js/systems/content-generator.js';

// 生成單個任務
const mission = await contentGenerator.generateMissionContent({
    mission_type: 'delivery',
    location: 'Paris',
    difficulty: 2
});

// 批量生成任務
const missions = await contentGenerator.generateMissionBatch(5, {
    min_difficulty: 1,
    max_difficulty: 3
});

// 生成地點描述
const location = await contentGenerator.generateLocation({
    location_name: 'Eiffel Tower',
    country: 'France'
});

// 生成動態事件
const event = await contentGenerator.generateEvent({
    context: 'in_flight',
    mission_type: 'rescue'
});
```

#### Tutorial API

```javascript
import tutorialManager from './js/systems/tutorial-manager.js';

// 顯示角色教學
await tutorialManager.showCharacterTutorial('jett');

// 顯示任務類型教學
await tutorialManager.showMissionTypeTutorial('delivery');

// 解釋遊戲概念
await tutorialManager.explainConcept('fuel_management');

// 獲取上下文提示
const hint = await tutorialManager.getHint({
    topic: 'mission_board',
    mission_type: 'delivery'
});

// 自動困難偵測
await tutorialManager.checkForHints({
    current_screen: 'mission_board',
    time_on_screen: 360000, // 6 minutes
    consecutive_failures: 2
});
```

#### Assets API

```javascript
import AssetManagerScreen from './js/ui/screens/asset-manager.js';

// 初始化資產管理器
const assetManager = new AssetManagerScreen('asset-container');
await assetManager.init();

// 快速生成
await assetManager.handleQuickGenerate();

// 完整生成
await assetManager.handleFullGenerate();

// 驗證資產包
await assetManager.handleValidate();
```

---

## 測試指南

### 運行自動化測試

1. **啟動開發伺服器**
   ```bash
   python3 -m http.server 8000
   ```

2. **打開測試運行器**
   ```
   http://localhost:8000/test-runner.html
   ```

3. **執行測試**
   - 點擊「▶️ Run All Tests」按鈕
   - 查看測試結果和統計
   - 導出結果為 JSON

### 測試覆蓋範圍

- ✅ Characters API (5 tests)
- ✅ Missions API (3 tests)
- ✅ Content API (4 tests)
- ✅ Tutorial API (4 tests)
- ✅ Assets API (4 tests)
- ✅ Voice & Sound API (2 tests)
- ✅ Data Persistence (3 tests)
- ✅ WebSocket Connection (2 tests)

**總計: 27個自動化測試**

### 手動測試清單

- [ ] 角色圖鑑瀏覽與搜尋
- [ ] 任務生成器創建任務
- [ ] 任務 session 完整生命週期
- [ ] 教學系統顯示正確
- [ ] 資產管理器生成功能
- [ ] 錯誤處理與 fallback
- [ ] 離線模式運作
- [ ] 數據持久化與恢復
- [ ] WebSocket 連接與重連

---

## 性能優化

### Batch Requester

批量處理 API 請求，減少網絡開銷。

```javascript
import batchRequester from './js/core/batch-requester.js';

// 添加請求到批次隊列
const response1 = await batchRequester.request('/api/v1/characters/jett');
const response2 = await batchRequester.request('/api/v1/characters/jerome');
const response3 = await batchRequester.request('/api/v1/characters/donnie');

// 請求會被自動批量處理
```

### IndexedDB 優化

使用索引和游標提升查詢性能。

```javascript
import indexedDBManager from './js/core/indexed-db.js';

// 使用索引查詢
const recentSaves = await indexedDBManager.query(
    'gameState',
    'timestamp',
    IDBKeyRange.lowerBound(Date.now() - 86400000) // Last 24 hours
);
```

### 圖片懶載入

```javascript
// 在角色圖鑑中使用
<img src="placeholder.png" data-char-id="${char.id}" loading="lazy">

// 動態載入
const img = document.querySelector(`img[data-char-id="${charId}"]`);
const actualSrc = await aiAssetManager.getCharacterImage(charId);
img.src = actualSrc;
```

---

## 錯誤追蹤

### Error Tracker

自動追蹤所有前端錯誤。

```javascript
import errorTracker from './js/core/error-tracker.js';

// 查看錯誤統計
errorTracker.printSummary();

// 獲取最近錯誤
const recentErrors = errorTracker.getRecentErrors(60); // Last 60 minutes

// 手動追蹤錯誤
errorTracker.track('Custom error message', {
    context: 'mission_board',
    action: 'accept_mission'
});

// 導出錯誤日誌
const jsonLog = errorTracker.exportErrors();

// 啟用後端報告
errorTracker.enableReporting();
```

### 錯誤類型

- `runtime_error`: 運行時錯誤
- `promise_rejection`: 未處理的 Promise rejection
- `resource_error`: 資源載入失敗
- `manual`: 手動追蹤的錯誤

---

## 架構說明

### 目錄結構

```
super-wings-simulator/
├── backend/
│   ├── api/
│   │   └── routers/          # API 路由
│   └── core/
│       └── agents/           # AI agents
├── js/
│   ├── core/                 # 核心系統
│   │   ├── game-state.js
│   │   ├── indexed-db.js
│   │   ├── websocket-client.js
│   │   ├── ai-service.js
│   │   ├── batch-requester.js
│   │   └── error-tracker.js
│   ├── systems/              # 遊戲系統
│   │   ├── achievement-system.js
│   │   ├── milestone-tracker.js
│   │   ├── statistics-tracker.js
│   │   ├── content-generator.js
│   │   └── tutorial-manager.js
│   ├── ui/
│   │   ├── screens/          # UI 畫面
│   │   │   ├── character-encyclopedia.js
│   │   │   ├── mission-board.js
│   │   │   ├── mission-generator.js
│   │   │   └── asset-manager.js
│   │   └── components/       # UI 組件
│   │       ├── streaming-analysis.js
│   │       └── active-missions-panel.js
│   ├── game/                 # 遊戲引擎
│   └── models/               # 數據模型
├── tests/
│   └── integration/
│       └── test-api-integration.js
├── test-runner.html          # 測試運行器
└── IMPLEMENTATION_GUIDE.md   # 本文件
```

### 數據流

```
Frontend UI
    ↓
Game State / Systems
    ↓
AI Service / API Clients
    ↓
Batch Requester (optional)
    ↓
Backend API
    ↓
AI Agents
    ↓
External Services (ComfyUI, etc.)
```

### 狀態管理

- **Game State**: 全域遊戲狀態 (resources, characters, missions)
- **IndexedDB**: 持久化儲存
- **Event Bus**: 事件驅動通訊
- **WebSocket**: 即時數據流

---

## 開發工作流程

### 1. 啟動開發環境

```bash
# 啟動 Backend
cd backend
python -m uvicorn main:app --reload --port 8000

# 啟動 Frontend (另一個終端)
python3 -m http.server 8001
```

### 2. 開發新功能

1. 在 `backend/api/routers/` 中創建 API 端點
2. 在 `js/systems/` 或 `js/ui/screens/` 中創建前端模組
3. 在 `ai-service.js` 中添加 API 調用方法
4. 整合到現有 UI 或創建新畫面
5. 添加測試到 `test-api-integration.js`

### 3. 測試流程

1. 運行自動化測試 (test-runner.html)
2. 手動測試功能
3. 檢查錯誤追蹤器
4. 驗證性能優化
5. 測試離線 fallback

### 4. 部署前檢查

- [ ] 所有測試通過
- [ ] 無控制台錯誤
- [ ] API 回應時間 < 2s
- [ ] 數據正確持久化
- [ ] WebSocket 正常連接
- [ ] 離線模式運作

---

## 常見問題

### Q: API 請求失敗怎麼辦？

A: 系統會自動使用 fallback 機制：
- API Service 有離線模式
- Content Generator 有本地生成
- Tutorial Manager 有預設提示

### Q: 如何調試 WebSocket 連接？

A:
```javascript
// 檢查連接狀態
console.log(websocketClient.getState());

// 監聽事件
websocketClient.on('connected', () => console.log('Connected!'));
websocketClient.on('error', (e) => console.error('Error:', e));
```

### Q: IndexedDB 與 localStorage 何時使用？

A:
- IndexedDB: 大量數據、複雜查詢、非同步操作
- localStorage: 備份、簡單鍵值對、同步讀取

### Q: 如何擴展新的 API？

A:
1. 在 `ai-service.js` 添加方法
2. 創建對應的 UI 組件或整合到現有畫面
3. 添加測試用例
4. 更新本文件

---

## 貢獻指南

1. Fork 專案
2. 創建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

---

## 授權

本專案為教育用途開發。

---

## 聯絡方式

如有問題或建議，請開啟 Issue 或 Pull Request。

---

**最後更新**: 2025-12-17
**版本**: 1.0.0
**狀態**: ✅ Phase 1-4 完成，Phase 5 進行中
