# Super Wings 2.5D 橫向捲軸背景系統計畫

> Note (2025-12): 舊版 `js/` 前端已移除。本文件的設計可直接對應到 Phaser 的 parallax layers（新版主要在 `src/game/phaser/*`）。

## 目標概述
建立一個完整的 2.5D 橫向捲軸背景系統，讓 3D 角色在 2D 平面上左右移動，支援無限延伸的視差背景。

---

## 一、系統架構

### 1.1 多層視差系統 (Parallax Layers)

| 層級 | 名稱 | 用途 | 滾動速度 | 尺寸 |
|------|------|------|----------|------|
| L0 | Sky | 天空漸層 | 0.1x | 2560x720 |
| L1 | Far BG | 遠景地標/山脈 | 0.3x | 2560x720 |
| L2 | Mid BG | 中景建築/樹木 | 0.5x | 2560x720 |
| L3 | Near BG | 近景裝飾 | 0.8x | 2560x720 |
| L4 | Objects | 前景互動物件 | 1.0x | 個別尺寸 |

### 1.2 場景類型

```
┌─────────────────────────────────────────────────────────┐
│                    場景類型分類                          │
├─────────────────────────────────────────────────────────┤
│ 1. 飛行場景 (Flight)                                     │
│    - 天空 + 雲層 (8種天氣變化)                           │
│    - 無限水平滾動                                        │
│                                                         │
│ 2. 基地場景 (Base)                                       │
│    - World Airport 機場                                  │
│    - Hangar 機庫                                         │
│    - Runway 跑道                                         │
│                                                         │
│ 3. 目的地場景 (Destination)                              │
│    - 全球 30+ 地點                                       │
│    - 地標 + 城市街景                                     │
│    - 支援橫向移動探索                                    │
│                                                         │
│ 4. 過渡場景 (Transition)                                 │
│    - 起飛過渡                                            │
│    - 降落過渡                                            │
└─────────────────────────────────────────────────────────┘
```

---

## 二、資源生成清單

### 2.1 天空分層背景 (24張)
- 8種天氣 × 3層 (sky_gradient, clouds_far, clouds_near)
- 天氣：晴天、日落、日出、夜晚、暴風雨、多雲、下雨、彩虹

### 2.2 基地場景分層 (9張)
- 3場景 × 3層
- 場景：world_airport, hangar_interior, runway

### 2.3 目的地分層背景 (120張)
- 30地點 × 4層 (sky, landmark, buildings, ground)
- 優先地點：Paris, Tokyo, New York, London, Sydney, Cairo, Rio, Beijing, Mumbai, Rome

### 2.4 背景物件 (50+張)
- 雲朵變體 (10+)
- 鳥類/氣球 (10+)
- 地標物件 (30+)

### 2.5 總計：約 200+ 張圖片

---

## 三、Tileable 背景生成 Prompt 模板

### 3.1 通用 Tileable 修飾詞
```
seamless tileable horizontal panorama, continuous pattern,
edges designed to loop perfectly, even distribution of elements,
no distinct central focal point, consistent lighting across entire width
```

### 3.2 天空層 Prompt
```
seamless tileable sky gradient, [天氣描述],
no ground visible, no buildings, pure sky only,
Super Wings animated style, 3d CGI render, high quality
```

### 3.3 雲層 Prompt
```
seamless tileable cloud layer on transparent background,
fluffy white clouds scattered evenly, [遠/中/近] perspective,
Super Wings animated style, 3d CGI render
```

### 3.4 目的地背景 Prompt
```
seamless tileable [城市名] cityscape, [地標描述],
horizontal panorama street level view,
Super Wings animated style, 3d CGI render, vibrant colors
```

### 3.5 分層物件 Prompt
```
[物件描述] on transparent background,
isolated object, clean edges, no shadow on ground,
Super Wings animated style, 3d CGI render
```

---

## 四、程式碼修改

### 4.1 新增檔案

| 檔案路徑 | 用途 |
|----------|------|
| `js/game/parallax-background.js` | 多層視差背景類 |
| `js/game/scene-manager.js` | 場景管理器 |
| `js/game/scene-transition.js` | 場景切換動畫 |
| `js/game/background-objects.js` | 背景物件生成器 |

### 4.2 修改檔案

| 檔案路徑 | 修改內容 |
|----------|----------|
| `js/game/background.js` | 重構為使用 ParallaxBackground |
| `js/game/flight-engine.js` | 整合新背景系統 |
| `prompts/game_assets/backgrounds.json` | 擴充為分層結構 |
| `scripts/generate_assets_native.py` | 支援分層背景生成 |

---

## 五、實作階段

### Phase 1: 核心系統
1. 實作 `ParallaxBackground` 類
2. 實作基本的分層渲染
3. 修改 `FlightEngine` 使用新背景系統

### Phase 2: 飛行場景資源
4. 生成 8 種天氣的分層天空 (24張)
5. 生成雲層變體
6. 整合到飛行遊戲中

### Phase 3: 場景切換
7. 實作 `SceneTransition` 類
8. 實作起飛/降落過渡動畫
9. 連接遊戲流程

### Phase 4: 目的地場景
10. 生成主要目的地分層背景 (先做 10 個)
11. 實作目的地場景載入
12. 整合到 Dialogue/Task 畫面

### Phase 5: 擴充與優化
13. 物件池系統
14. 動態物件生成
15. 完成所有目的地場景

---

## 六、關鍵技術決策

### 6.1 圖片尺寸
- 背景層：2560×720 (雙倍螢幕寬度，確保無縫)
- 地面層：3840×720 (超寬場景)
- 物件：依需求，透明背景 PNG

### 6.2 無縫拼接策略
- 使用兩張圖片交替顯示
- 當第一張移出畫面時，重置到右側

### 6.3 效能優化
- 圖片預載入 (場景切換前載入下一場景)
- 物件池重複使用
- 只繪製可見範圍

---

## 七、已確認決策

1. **橫向移動範圍**：✅ 完全無限延伸，背景無限循環
2. **地標互動**：✅ 需要互動點，走到地標位置可觸發對話/任務/事件
3. **優先地點**：✅ 主要城市 10 個
   - Paris, Tokyo, New York, London, Sydney
   - Cairo, Rio de Janeiro, Beijing, Rome, Dubai

---

## 八、地標互動系統設計

### 8.1 互動點結構
```javascript
{
  id: "eiffel_tower",
  location: "paris",
  xPosition: 0.5,  // 在場景中的相對位置 (0-1)
  triggerRadius: 100,  // 觸發範圍（像素）
  type: "landmark",  // landmark / npc / quest
  dialogue: [...],
  quest: null
}
```

### 8.2 互動點類型
- **landmark**: 地標介紹對話
- **npc**: NPC 對話/任務發放
- **quest**: 任務執行點
- **collectible**: 收集物品

### 8.3 互動點視覺提示
- 地標上方顯示「！」或「？」圖示
- 靠近時圖示放大/發光
- 按鍵提示「Press E to interact」

---

## 九、AI 驅動場景合成系統

### 9.1 系統架構

```
┌─────────────────────────────────────────────────────────────┐
│                   Scene Composer Agent                       │
│  (LLM/VLM 規劃場景佈局、物件位置、NPC 配置)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Background   │ │ Object       │ │ NPC/Character│
│ Generator    │ │ Generator    │ │ Generator    │
└──────────────┘ └──────────────┘ └──────────────┘
        │              │              │
        ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Scene Renderer                              │
│  (合成背景 + 物件 + NPC 到最終場景)                          │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Scene Composer Agent (LLM)

**職責**：
- 根據場景描述生成佈局規劃
- 決定需要哪些物件及其位置
- 規劃 NPC 類型和行為
- 產生一致性的場景敘事

**輸入**：
```json
{
  "scene_type": "paris_street",
  "mood": "sunny_afternoon",
  "required_elements": ["cafe", "landmark"],
  "story_context": "玩家正在尋找失蹤的包裹"
}
```

**輸出**：
```json
{
  "background": "paris_street_sunny",
  "layers": [
    { "type": "sky", "asset": "blue_sky_clouds" },
    { "type": "far", "asset": "eiffel_tower_distant" },
    { "type": "mid", "asset": "paris_buildings" }
  ],
  "objects": [
    { "type": "cafe_table", "x": 0.2, "y": 0.7, "scale": 1.0 },
    { "type": "car_red", "x": 0.6, "y": 0.8, "scale": 0.8 },
    { "type": "tree", "x": 0.4, "y": 0.65, "scale": 1.2 }
  ],
  "npcs": [
    { "type": "cafe_owner", "x": 0.25, "role": "quest_giver" },
    { "type": "pedestrian", "x": 0.5, "role": "ambient" }
  ],
  "interaction_points": [
    { "x": 0.3, "trigger": "talk_to_cafe_owner" }
  ]
}
```

### 9.3 物件分類系統

| 類別 | 範例 | 生成策略 |
|------|------|----------|
| **建築** | 房屋、商店、地標 | 分層物件，可重複使用 |
| **交通工具** | 汽車、公車、腳踏車 | 獨立物件，多樣變體 |
| **自然** | 樹木、花叢、雲朵 | 可變大小，隨機排列 |
| **街道設施** | 路燈、長椅、垃圾桶 | 固定位置裝飾 |
| **互動物件** | 箱子、門、開關 | 有狀態變化 |

### 9.4 NPC 系統

#### NPC 類型
| 類型 | 用途 | 行為 |
|------|------|------|
| **Quest NPC** | 任務發放/對話 | 固定位置，有對話樹 |
| **Shop NPC** | 商店/補給 | 固定位置，交易介面 |
| **Guide NPC** | 教學/提示 | 跟隨或固定 |
| **Ambient NPC** | 路人/氛圍 | 左右巡邏，無互動 |
| **Enemy NPC** | 障礙/挑戰 | 追擊或巡邏 |

#### NPC 生成 Prompt 模板
```
[NPC類型] character for Super Wings game,
[外觀描述], [服裝], [表情],
standing pose, facing camera,
on transparent background,
Super Wings animated style, 3d CGI render
```

### 9.5 VLM 視覺驗證

使用 Vision Language Model 驗證生成結果：

**功能**：
1. 檢查物件位置是否合理
2. 驗證場景風格一致性
3. 檢測重疊/遮擋問題
4. 評估整體美觀度

**流程**：
```
生成場景 → VLM 分析 → 修正建議 → 重新排列 → 最終輸出
```

---

## 十、物件生成清單

### 10.1 通用物件 (所有場景可用)

| 類別 | 物件 | 變體數 |
|------|------|--------|
| 樹木 | 常青樹、櫻花樹、棕櫚樹 | 各 3 |
| 雲朵 | 積雲、卷雲、烏雲 | 各 5 |
| 交通 | 汽車、公車、計程車 | 各 5 |
| 動物 | 鳥、狗、貓 | 各 3 |

### 10.2 地點專屬物件

| 地點 | 專屬物件 |
|------|----------|
| Paris | 咖啡桌、路燈、麵包店 |
| Tokyo | 自販機、招牌、電車 |
| New York | 黃色計程車、消防栓、熱狗攤 |
| London | 紅色電話亭、雙層巴士、郵筒 |
| Cairo | 駱駝、市集攤位、陶罐 |

### 10.3 NPC 角色

| 類型 | 數量 | 變體 |
|------|------|------|
| 小孩 (求助者) | 20+ | 不同國家/服裝 |
| 成人 (NPC) | 20+ | 職業/文化變體 |
| 路人 | 30+ | 多樣化外觀 |
| 特殊角色 | 10+ | 警察、消防員等 |

---

## 十一、擴展後的實作階段

### Phase 1: 核心系統 (原計畫)
- Parallax 背景系統
- 基本場景渲染

### Phase 2: 物件系統
- 物件生成 Pipeline
- 物件管理器
- 分層渲染整合

### Phase 3: AI Scene Composer
- LLM Agent 架構
- 場景規劃邏輯
- 佈局生成 API

### Phase 4: NPC 系統
- NPC 基類
- 行為狀態機
- 對話系統整合

### Phase 5: VLM 驗證
- 視覺分析整合
- 自動修正流程
- 品質評估

### Phase 6: 內容生成
- 批量生成物件
- 批量生成 NPC
- 場景組合測試
