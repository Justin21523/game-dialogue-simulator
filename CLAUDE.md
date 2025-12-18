# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 語言設定
請使用**中文**與用戶溝通。

## 專案概述
Super Wings 網頁模擬遊戲 - 結合經營管理與動作飛行的 Hybrid Game。
前端使用 HTML5 Canvas + Vanilla JS，後端使用 Python 處理 AI 資產生成。

## 開發伺服器
```bash
python3 -m http.server 8000
# 瀏覽器開啟 http://localhost:8000
```

## 專案狀態
- **Phase 1-2**: ✅ 資料庫與 AI 圖片生成系統 (進行中)
- **Phase 3**: ✅ 核心管理玩法 (機庫、任務板)
- **Phase 4**: ✅ 動作玩法 (出發序列、飛行引擎、音效系統)
- **Phase 5**: ⏳ 視覺優化與內容擴充

## 架構概覽

### 遊戲核心 (`js/core/`)
- `game-state.js`: 狀態管理 (Money, Fuel, Characters)
- `audio-manager.js`: Web Audio API 音效合成器

### 動作引擎 (`js/game/`)
- `flight-engine.js`: Canvas 飛行射擊邏輯
- `entities.js`: 雲、障礙物(雷雲)、寶物(金幣)
- `input.js`: 鍵盤輸入處理

### UI 畫面 (`js/ui/screens/`)
- `launch.js`: 出發加速小遊戲
- `in-flight.js`: 飛行 HUD 與遊戲容器
- `mission-board.js`: 任務選擇

## 關鍵機制
- **Launch**: 按住 Space 加速，RPM 滿後發射。
- **Flight**: WASD 移動，Space 衝刺。撞擊雷雲扣分減速，吃金幣加分。
- **Audio**: 引擎聲頻率隨速度改變 (Pitch Shift)。

## 常用指令
- 生成圖片: `python scripts/generate_assets.py --all`
- 檢查圖片數量: `find assets/images -name "*.png" | wc -l`