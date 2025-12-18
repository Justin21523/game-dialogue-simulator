# 測試指南 - Testing Guide

## 🔄 如何重新載入修復後的代碼

由於瀏覽器會快取 JavaScript 和 CSS 檔案，修改代碼後必須正確清除快取才能看到變更。

### 方法 1: 硬重新整理（推薦）

**Chrome / Edge:**
- Windows: `Ctrl + Shift + R` 或 `Ctrl + F5`
- Mac: `Cmd + Shift + R`

**Firefox:**
- Windows: `Ctrl + Shift + R` 或 `Ctrl + F5`
- Mac: `Cmd + Shift + R`

### 方法 2: 開啟開發者工具並停用快取

1. 按 `F12` 開啟開發者工具
2. 在 Network 分頁，勾選 **"Disable cache"**
3. 保持開發者工具開啟，重新整理頁面

### 方法 3: 清除全部快取（最徹底）

**Chrome / Edge:**
1. `Ctrl + Shift + Delete`
2. 選擇「快取的圖片和檔案」
3. 時間範圍選「所有時間」
4. 按下「清除資料」

**Firefox:**
1. `Ctrl + Shift + Delete`
2. 勾選「快取」
3. 按下「立即清除」

---

## 🐛 使用調試面板

### 啟動方式
遊戲載入後，右上角會自動出現調試面板（黑色背景，藍色邊框）

### 快捷鍵
- `Ctrl + Shift + D` - 顯示/隱藏調試面板

### 功能

#### 🎮 Quick Jump
- **📍 跳轉到探索模式** - 直接進入探索畫面，跳過所有前置步驟
- **🏠 返回機庫** - 回到機庫畫面
- **🌍 任務板** - 開啟任務選擇畫面
- **✈️ 飛行模式** - 進入飛行小遊戲

#### ⚙️ Game State
顯示當前遊戲狀態：
- Money (金錢)
- Fuel (燃料)
- Active Missions (進行中任務)
- Characters (已解鎖角色數)

#### 🧪 Test Actions
- **💰 +1000 Money** - 增加 1000 金錢
- **⛽ +50 Fuel** - 增加 50 燃料
- **🔄 Reset Resources** - 重置資源為初始值
- **🔓 Unlock All Characters** - 解鎖所有角色

#### 📊 Console Log
顯示調試面板的操作記錄

---

## ✅ 驗證修復效果

### 檢查清單

#### 1. 角色顯示修復
- [ ] 進入探索模式
- [ ] 應該看到**藍色圓形**和 "Loading..." 文字（如果圖片還沒載入）
- [ ] **不應該**看到紅色磚頭
- [ ] 圖片載入後應該顯示角色圖片

#### 2. NPCs 出現修復
- [ ] 進入探索模式
- [ ] 打開瀏覽器 Console（F12）
- [ ] 查看是否有 `[ExplorationScreen] Mission loaded with X NPCs` 訊息
- [ ] 應該至少看到 3-5 個 NPC 在場景中
- [ ] NPCs 應該有不同顏色/樣式

#### 3. 背景捲動修復
- [ ] 進入探索模式
- [ ] 使用 WASD 移動角色
- [ ] 背景的雲層應該慢速移動（視差效果）
- [ ] 地面應該跟著捲動

#### 4. 夥伴呼叫修復
- [ ] 進入探索模式
- [ ] 按 `F` 鍵嘗試呼叫夥伴
- [ ] 應該能成功呼叫夥伴
- [ ] 按 `Q`/`E` 可以切換控制的角色

#### 5. 相機跟隨修復
- [ ] 進入探索模式
- [ ] 移動角色，相機應該流暢跟隨
- [ ] 切換角色時，相機應該立即跟隨新角色
- [ ] 不應該有延遲或跳動

---

## 🔍 查看 Console 日誌

### 重要的日誌訊息

開啟 Console（F12 → Console 分頁），查找以下訊息：

#### 成功的日誌：
```
[PlayerCharacter] Loading images for jett...
[PlayerCharacter] Image selector returned: {primary: "...", ...}
[PlayerCharacter] Loading image from: assets/images/...
[PlayerCharacter] ✅ Image loaded successfully for jett
[ExplorationScreen] Mission loaded with 5 NPCs
[DebugPanel] Initialized (Ctrl+Shift+D to toggle visibility)
```

#### 錯誤的日誌：
```
[PlayerCharacter] ❌ No primary image found for jett
[PlayerCharacter] ❌ Failed to load character image for jett
GET http://localhost:8000/assets/images/... 404 (Not Found)
```

如果看到 404 錯誤，表示圖片路徑不正確，需要檢查圖片檔案是否存在。

---

## 🚨 常見問題排解

### 問題 1: 仍然看到紅色磚頭
**原因**: 瀏覽器快取未清除
**解決方案**:
1. 完全關閉瀏覽器
2. 重新開啟瀏覽器
3. 使用 `Ctrl + Shift + R` 硬重新整理
4. 檢查 Console 是否有新的日誌訊息

### 問題 2: NPCs 不出現
**原因**: 任務生成失敗或載入未完成
**解決方案**:
1. 查看 Console 是否有錯誤訊息
2. 使用調試面板的「跳轉到探索模式」重試
3. 檢查 `[ExplorationScreen] Mission loaded with X NPCs` 訊息

### 問題 3: 背景不移動
**原因**: 相機未正確更新
**解決方案**:
1. 查看 Console 是否有相機相關錯誤
2. 重新載入頁面
3. 使用調試面板重新跳轉

### 問題 4: 無法呼叫夥伴
**原因**: partnerSystem 引用未正確連接
**解決方案**:
1. 查看 Console 是否有 `InteractionSystem` 錯誤
2. 確認已重新載入最新代碼
3. 嘗試使用調試面板解鎖所有角色

---

## 📝 回報 Bug

如果修復仍然無效，請提供以下資訊：

1. **瀏覽器版本**: Chrome 120? Firefox 121?
2. **Console 日誌**: 複製所有紅色錯誤訊息
3. **截圖**: 顯示當前看到的問題
4. **步驟**: 如何重現問題？
   - 從主選單開始
   - 選擇什麼任務？
   - 選擇什麼角色？
   - 何時出現問題？

---

## 🎯 快速測試流程

使用調試面板進行快速測試：

1. 開啟遊戲 → http://localhost:8000
2. 等待主選單載入
3. 按 `Ctrl + Shift + R` 硬重新整理
4. 按 `F12` 開啟 Console
5. 點擊調試面板的「📍 跳轉到探索模式」
6. 觀察 Console 日誌
7. 檢查是否有藍色圓形（而非紅色磚頭）
8. 檢查是否有 NPCs
9. 按 WASD 測試背景捲動
10. 按 F 測試夥伴呼叫

全部通過 = 修復成功！ 🎉
