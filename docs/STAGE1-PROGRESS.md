# 階段 1: AI 驅動圖片選擇系統 - 進度報告

**日期**: 2025-12-17
**狀態**: 🚧 進行中

---

## ✅ 已完成功能

### 1. 探索場景動態背景選擇

**功能說明**: 每次進入探索場景時，AI 會根據地點、時段、天氣、季節動態選擇不同的背景圖片。

**修改的檔案**:
1. **`js/core/ai-asset-manager.js`** (line 177-225)
   - 新增 `preloadSceneBackground(location, options)` 方法
   - 支援時段、天氣、季節參數
   - 如果 AI 選擇失敗，自動使用漸層 fallback

2. **`js/core/ai-service.js`** (line 849-870)
   - 新增 `selectSceneBackground(sceneContext)` 方法
   - 調用後端 `/images/select-scene-background` API
   - 支援 offline fallback

3. **`js/game/exploration/exploration-renderer.js`** (line 19-21, 88-132)
   - 添加 `backgroundImage` 和 `backgroundLoaded` 屬性
   - 新增 `setBackgroundImage(imagePath)` 方法
   - 修改 `drawFallbackBackground()` 優先使用 AI 圖片

4. **`js/ui/screens/exploration.js`** (line 357-387, 402)
   - 新增 `loadAISceneBackground(location)` 方法
   - 隨機選擇時段、天氣、季節（讓每次都不同）
   - 在 `loadMission()` 中調用背景載入

**工作原理**:
```javascript
// 每次進入探索場景時：
1. 隨機選擇時段 (morning/afternoon/evening/night)
2. 隨機選擇天氣 (clear/cloudy/rainy/snowy)
3. 隨機選擇季節 (spring/summer/autumn/winter)
4. 調用 AI 服務選擇背景圖片
5. 如果有圖片，載入並渲染；否則使用漸層 fallback
```

**測試方法**:
1. 進入探索模式
2. 查看 Console 日誌：
   ```
   [ExplorationScreen] Loading AI background for paris (evening, rainy, autumn)
   [ExplorationRenderer] Background image loaded: assets/images/...
   ```
3. 如果看到背景圖片，表示 AI 選擇成功
4. 如果看到漸層背景，表示使用 fallback（AI 離線或沒有圖片）
5. 退出並重新進入，應該看到不同的背景（不同時段/天氣）

---

## ⏳ 待完成功能

### 2. 飛行場景背景動態選擇

**計劃**:
- 修改 `flight-engine.js` 或 `parallax-background.js`
- 使用 `aiService.selectFlightBackground()`
- 支援多層背景（parallax 效果）

**預計修改檔案**:
- `js/game/flight-engine.js`
- `js/game/parallax-background.js`
- 已有 `aiService.selectFlightBackground()` 方法

### 3. NPC 外觀動態生成

**計劃**:
- 修改 NPC 渲染邏輯
- 使用 `aiAssetManager.preloadNPCPortrait()`
- 根據 NPC 原型（shopkeeper, child, elder）生成肖像

**預計修改檔案**:
- `js/game/entities/npc.js`
- `js/game/exploration/exploration-renderer.js` (drawNPC 方法)
- 已有 `aiAssetManager.preloadNPCPortrait()` 方法

### 4. 角色肖像動態選擇

**計劃**:
- 在對話、任務選擇等場景，每次都由 AI 選擇不同肖像
- 已有基礎設施，只需在更多地方調用

---

## 🔗 API 端點需求

以下後端 API 端點需要實作（目前會使用 fallback）：

1. **`POST /api/v1/images/select-scene-background`**
   - 請求: `{ location, time_of_day, weather, season, style }`
   - 回應: `{ primary, filename, category, confidence, alternatives }`

2. **`POST /api/v1/images/generate-npc-portrait`**
   - 請求: `{ archetype, emotion, age, style }`
   - 回應: `{ primary, filename, category, confidence, alternatives }`

3. **`POST /api/v1/images/select-flight-background`**
   - 請求: `{ location, altitude, time_of_day, weather }`
   - 回應: `{ primary, filename, category, confidence, alternatives, layers }`

**備註**: 目前這些端點不存在，前端會使用 fallback（漸層背景或預設圖片）。當後端實作這些端點後，AI 選擇功能會自動啟用。

---

## 📊 進度統計

| 功能 | 狀態 | 完成度 |
|------|------|--------|
| 探索場景動態背景 | ✅ 完成 | 100% |
| 飛行場景動態背景 | ⏳ 待實施 | 0% |
| NPC 外觀動態生成 | ⏳ 待實施 | 0% |
| 角色肖像動態選擇 | ⏳ 待實施 | 0% |
| **總體進度** | 🚧 進行中 | **25%** |

---

## 🎯 下一步

1. **立即**: 測試探索場景動態背景功能
2. **接下來**: 實施飛行場景背景動態選擇
3. **然後**: 實施 NPC 外觀動態生成

---

**修改檔案總數**: 4 個
**新增代碼行數**: ~150 行
**狀態**: ✅ 第一部分完成，可以測試
