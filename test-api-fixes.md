# API 修復測試清單

## 修復摘要

### ✅ 已完成的修復

1. **修復 422 錯誤 - `/api/v1/dialogue/generate`**
   - **檔案**: `js/core/ai-service.js` (line 333-369)
   - **修復內容**: 更新參數以匹配後端 Pydantic schema
     - 添加 `character_id` (必填)
     - 添加 `situation` (必填)
     - 移除不支援的參數 (`npc_name`, `player_name`, `tone`, `context`)
     - 將 `previous_dialogue` 改為 `dialogue_history`
   - **測試方法**: 在遊戲中觸發 NPC 對話，檢查 console 是否有 422 錯誤

2. **修復 422 錯誤 - `/api/v1/animation/plan`**
   - **檔案**: `js/core/ai-service.js` (line 404-434)
   - **修復內容**: 添加必填的 `character_id` 參數
   - **同時修復的檔案**:
     - `js/ui/screens/launch.js` (line 350-354)
     - `js/ui/screens/transformation.js` (line 257-261)
     - `js/ui/screens/arrival.js` (line 150-154)
     - `js/ui/screens/return-base.js` (line 175-179)
   - **測試方法**: 觸發出發序列、變身、抵達、返回序列，檢查 console 是否有 422 錯誤

3. **修復 JavaScript 錯誤 - `Cannot read properties of undefined (reading 'rewardMoney')`**
   - **檔案**: `js/ui/screens/results.js` (line 10-48)
   - **修復內容**:
     - 添加 optional chaining (`?.`)
     - 添加 fallback 值 (`|| 0`, `|| 'Unknown Mission'`)
     - 添加 early return 處理缺少資料的情況
   - **測試方法**: 完成任務後查看結果畫面，確保不會崩潰

4. **修復 404 圖片錯誤**
   - **檔案**:
     - `js/core/image-selector-service.js` (line 301-322)
     - `js/core/ai-asset-manager.js` (line 8-24)
   - **修復內容**:
     - 驗證 `characterId` 是否在有效角色列表中
     - 無效 ID 自動 fallback 到 'jett'
     - 添加警告日誌
   - **測試方法**: 檢查 console 是否有 404 圖片錯誤

---

## 測試步驟

### 1. 啟動前後端服務器

```bash
# 後端
cd /home/justin/web-projects/super-wings-simulator/backend
conda activate super_wings
python -m uvicorn api.main:app --reload --port 8001

# 前端（另一個終端）
cd /home/justin/web-projects/super-wings-simulator
python3 -m http.server 8000
```

### 2. 打開瀏覽器開發工具

- Chrome/Firefox: F12 → Console 和 Network 標籤
- 清空 console 和網路記錄

### 3. 測試對話生成 (dialogue/generate)

1. 進入遊戲，選擇一個任務
2. 選擇角色並開始任務
3. 觸發 NPC 對話
4. **檢查點**:
   - ✅ Network 標籤中 `/api/v1/dialogue/generate` 返回 200 OK
   - ❌ 不應該出現 422 錯誤
   - ✅ Console 沒有參數錯誤

### 4. 測試動畫規劃 (animation/plan)

1. 選擇任務並分配角色
2. 進入出發序列 (Launch Screen)
3. **檢查點**:
   - ✅ Network 標籤中 `/api/v1/animation/plan` 返回 200 OK
   - ❌ 不應該出現 422 錯誤 (missing character_id)
   - ✅ Console 沒有參數錯誤

4. 完成任務後查看變身序列、抵達序列、返回序列
5. **檢查點**: 所有序列的 animation/plan 都成功

### 5. 測試結果畫面 (results.js)

1. 完成任務
2. 查看結果畫面
3. **檢查點**:
   - ✅ 結果畫面正常顯示
   - ❌ Console 沒有 `Cannot read properties of undefined` 錯誤
   - ✅ 顯示正確的任務名稱、地點、獎勵

### 6. 測試圖片 fallback

1. 檢查 Console 警告日誌
2. **檢查點**:
   - ✅ 沒有 404 圖片錯誤 (action_pose_v1.png)
   - ✅ 如果有無效 characterId，會看到警告但不會 404
   - ✅ 所有角色圖片正常載入

---

## 預期結果

### ✅ 成功指標

- 所有 API 端點返回 200 OK
- Console 沒有 422 錯誤
- Console 沒有 JavaScript 錯誤 (undefined)
- 所有圖片正常載入或使用 fallback
- 遊戲流程正常運作

### ❌ 失敗指標

- 仍有 422 錯誤
- Console 有 `Cannot read properties of undefined` 錯誤
- 圖片 404 錯誤仍然出現
- 遊戲崩潰或無法進行

---

## 後續待辦事項

如果所有測試通過，接下來可以進行：

1. **階段 0A 剩餘任務**:
   - [ ] 調查 Voice .wav 404 錯誤（如果仍存在）

2. **階段 1: AI 驅動功能**:
   - [ ] AI 選擇所有角色圖片
   - [ ] AI 選擇場景背景
   - [ ] 豐富探索場景 (10-20 NPCs, 20-40 objects)
   - [ ] 自由對話系統

---

## 修復檔案列表

修改過的檔案：

1. `js/core/ai-service.js` - 修復 API 參數
2. `js/ui/screens/launch.js` - 添加 characterId
3. `js/ui/screens/transformation.js` - 添加 characterId
4. `js/ui/screens/arrival.js` - 添加 characterId
5. `js/ui/screens/return-base.js` - 添加 characterId
6. `js/ui/screens/results.js` - 防禦性檢查
7. `js/core/image-selector-service.js` - 驗證 characterId
8. `js/core/ai-asset-manager.js` - 驗證 characterId

---

## 常見問題

### Q: 如果仍看到 422 錯誤怎麼辦？

A: 檢查：
1. 瀏覽器快取是否清除（Ctrl+Shift+Delete）
2. 前端服務器是否重啟
3. Network 標籤中請求 payload 是否包含正確參數

### Q: 如果仍看到 404 圖片錯誤怎麼辦？

A: 檢查：
1. Console 警告日誌中的 characterId 是什麼
2. 該角色的圖片是否存在於 `assets/images/characters/{characterId}/all/`
3. 是否有拼字錯誤

### Q: 語音 .wav 404 錯誤怎麼辦？

A: 這是已知問題，語音生成 API 可能未啟用。可以暫時忽略，不影響遊戲主要功能。

---

**測試日期**: 2025-12-17
**測試者**: ___________
**結果**: [ ] ✅ 通過 / [ ] ❌ 失敗
**備註**: ___________
