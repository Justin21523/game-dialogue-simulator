# Super Wings 網頁模擬遊戲專案 - 完整實作計畫

## 進度總覽 (更新: 2025-12-17)

| 階段 | 狀態 | 說明 |
|------|------|------|
| **Phase 1** | ✅ 完成 | 角色資訊整理與驗證 |
| **Phase 2** | ✅ 完成 | 圖片生成系統 (1,168張 + 241×8幀動畫) |
| **Phase 3** | ✅ 大部分完成 | Web 遊戲核心架構 |
| **Phase 4** | 🔄 進行中 | 打磨與優化 |
| **Phase 5** | 🔄 進行中 | 視覺優化與遊戲機制 |

### 最新完成項目
- ✅ AI 後端系統 (LLM + RAG + Agents)
- ✅ AI 智慧圖片選擇 API
- ✅ Canvas 速度線背景效果
- ✅ Canvas 發光擴散效果
- ✅ 變身動畫 (241幀 @ 30fps = 8秒)
- ✅ ThemeManager 主題管理器 (深色/淺色切換)
- ✅ 深色主題 CSS 變數
- 🔄 StatisticsTracker 統計追蹤器

### Phase 5 待完成項目
- ⏳ SaveManager 多存檔管理 (3 槽)
- ⏳ AchievementSystem 成就系統 (23 個成就)
- ⏳ 成就解鎖彈窗效果
- ⏳ Achievements 成就畫面
- ⏳ Save/Load 存讀檔畫面
- ⏳ Statistics 統計畫面
- ⏳ PageTransition 頁面轉場
- ⏳ ParticleSystem 粒子系統
- ⏳ AudioManager 合成 BGM

### 其他待完成項目
- ⏳ 內容擴充 (更多任務、地點、事件)
- ⏳ 前端 AI 整合
- ⏳ 效能優化
- ⏳ 部署

---

## 專案概述

**目標**: 建立一個完整的 Super Wings 模擬遊戲，模擬動畫中的任務派遣系統

**遊戲類型**: 完整的模擬遊戲，包含：
- 角色派遣管理系統
- 資源管理（金錢、燃料、修理包等）
- 任務系統（世界各地的小朋友需要幫助）
- 完整的遊戲流程動畫（派遣 → 飛行 → 變身 → 解決問題 → 返回）

**技術棧**: 純 HTML/CSS/JavaScript (2D web 遊戲)

**專案位置**: `~/web-projects/super-wings-simulator/`

**時程**: 8 週完成，優先完成圖片庫準備（1-2週內開始）

---

## 已有資源

### LoRA 模型
- **8 個角色已完成訓練**: Jett, Jerome, Donnie, Chase, Flip, Todd, Paul, Bello
- **Checkpoints**: 每個角色 5 個 (epoch 3, 6, 9, 12, 15)
- **最佳模型**: epoch 15
- **位置**: `/mnt/data/training/lora/super-wings/{character}_identity/`

### 訓練資料
- **每個角色**: 200-241 張高品質分割圖片
- **增強後**: 400 張 augmented 圖片
- **Caption 品質**: 詳細的 3D 動畫風格描述
- **位置**: `/mnt/data/datasets/general/super-wings/lora_data/characters/`

### 文檔資源
- **角色文檔**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/docs/projects/super-wings/character/character_*.md` (8 個角色)
- **系列指南**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/docs/projects/super-wings/super_wings_series.md`
- **Prompt 模板**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/configs/evaluation/super_wings_comprehensive_test.yaml`

---

## 關鍵發現與需要修正的問題

### ✅ 已驗證的角色資訊

從實際 caption 和官方文檔驗證：

| 角色 | 正確顏色 | 關鍵特徵 | 個性 |
|------|---------|---------|------|
| **Jett** | 紅色+白色 | 黃色螺旋槳，4個信號燈 | 熱情、樂於助人 |
| **Flip** | 紅色+白色條紋 | **藍色帽子配黃色邊框** ⭐ | 運動專家、充滿活力 |
| **Jerome** | 藍色 | 戰鬥機造型，黃色閃電裝飾 | 經驗豐富、智慧 |
| **Donnie** | 黃色+藍色 | 工具專家，Canadair 造型 | 機械專家、實用 |
| **Chase** | 深藍色 | 3條紅色閃電條紋 | 間諜、變形能力 |
| **Todd** | 褐色 | 黃色安全帽，鑽頭鼻子 | 挖掘專家 |
| **Paul** | 藍色+白色 | 警察標記，警笛 | 警察、嚴謹 |
| **Bello** | 黑白條紋 | 斑馬/動物條紋 | 動物專家 |

### ⚠️ 需要修正的配置文件

**檔案**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/configs/training/super_wings_caption_config.yaml`

**問題**: Flip 的顏色錯誤
```yaml
# 錯誤 (當前)
flip:
  colors: "bright green body, yellow accents"

# 正確 (應修正為)
flip:
  colors: "red body with white stripes, blue cap with yellow trim"
```

**其他需要檢查的配置文件**:
- 確認所有角色的顏色描述與官方資料一致
- 更新 evaluation config 包含所有 8 個角色（目前只有 3 個）

---

## 實作計畫 - 四大階段

## Phase 1: 角色資訊整理與驗證 (第 1 週)

### 目標
完整審查和組織所有角色資訊，建立統一的資料庫

### 任務清單

#### 1.1 審查現有文檔
- [ ] 閱讀所有 8 個角色的 character_*.md 文檔
- [ ] 驗證每個角色的顏色、特徵、個性描述
- [ ] 特別確認 Flip 的藍色帽子細節
- [ ] 從訓練 captions 中提取額外的視覺細節

#### 1.2 建立統一角色資料庫
**檔案**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/configs/characters/super_wings_characters.json`

**結構**:
```json
{
  "characters": {
    "jett": {
      "name": "Jett",
      "role": "主角、送貨專家",
      "colors": {
        "primary": "red",
        "secondary": "white",
        "accent": "yellow propeller",
        "hex": {
          "red": "#E53935",
          "white": "#F5F5F5",
          "yellow": "#FFD600"
        }
      },
      "features": {
        "vehicle": "small jet plane, 4 signal lights on cheeks and wings",
        "robot": "compact proportions, friendly expression",
        "unique": "yellow propeller, two blue eyes"
      },
      "personality": "enthusiastic, helpful, optimistic, energetic",
      "abilities": "fast delivery, problem-solving",
      "stats": {
        "speed": 9,
        "reliability": 95,
        "specialization": "delivery"
      },
      "lora": {
        "path": "/mnt/data/training/lora/super-wings/jett_identity/jett_epoch15.safetensors",
        "weight": 0.9
      }
    },
    "flip": {
      "name": "Flip",
      "role": "運動專家",
      "colors": {
        "primary": "red",
        "secondary": "white stripes",
        "accent": "blue cap with yellow trim",
        "hex": {
          "red": "#E53935",
          "white": "#F5F5F5",
          "cap_blue": "#1E5AA8",
          "cap_yellow": "#F2C300"
        }
      },
      "features": {
        "vehicle": "sporty red plane with white stripes",
        "robot": "athletic proportions, wearing blue and yellow cap",
        "unique": "blue cap with symbol similar to Jett's, sports theme"
      },
      "personality": "energetic, competitive, sports-loving, admires Jett",
      "abilities": "sports challenges, athletic moves",
      "stats": {
        "speed": 8,
        "reliability": 90,
        "specialization": "sports"
      },
      "lora": {
        "path": "/mnt/data/training/lora/super-wings/flip_identity/flip_epoch15.safetensors",
        "weight": 0.9
      }
    }
    // ... 其餘 6 個角色
  },
  "world_info": {
    "hub": "World Airport",
    "mission_types": ["delivery", "rescue", "sports", "construction", "police", "animal_care"],
    "style": "toy-like CGI, glossy paint, 3D animation"
  }
}
```

#### 1.3 更新配置文件
- [ ] 修正 `super_wings_caption_config.yaml` 中 Flip 的顏色
- [ ] 擴展 `super_wings_comprehensive_test.yaml` 包含所有 8 個角色
- [ ] 驗證所有 LoRA 配置文件的角色描述一致性

#### 1.4 建立人類可讀的指南
**檔案**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/docs/super_wings/character_database.md`

包含：
- 所有角色的完整描述
- 角色關係圖
- 能力對照表
- 官方資料來源引用

### 交付物
- ✅ `super_wings_characters.json` - 完整的角色資料庫
- ✅ 更新的配置文件（所有顏色正確）
- ✅ `character_database.md` - 人類可讀指南
- ✅ 驗證報告（列出所有檢查過的資料來源）

---

## Phase 2: 圖片生成系統 (第 1-3 週)

### 目標
建立完整的圖片生成系統，生成約 200-300 張核心遊戲素材

### 2.1 圖片需求規劃

#### 核心圖片類型

**A. 角色肖像** (8角色 × 8變化 = 64張)
- 正面視角 (front view)
- 四分之三視角 (three-quarter view)
- 側面視角 (side profile)
- 特寫肖像 (portrait closeup)
- 飛行姿勢 (flying pose)
- 站立姿勢 (standing pose)
- 變身狀態 (transformation)
- UI 圖示 (icon, 512×512)

**B. 角色狀態** (8角色 × 6狀態 = 48張)
- 待命 (idle/standby)
- 飛行中 (in-flight)
- 降落 (landing)
- 慶祝成功 (celebrating)
- 解決問題 (working/helping)
- 疲憊/休息 (tired/resting)

**C. 角色表情特寫** (8角色 × 6表情 = 48張)
- 開心微笑 (happy smile)
- 興奮 (excited)
- 驚訝 (surprised)
- 自信 (confident)
- 專注 (focused)
- 友好 (friendly)

**D. 場景背景** (15個世界地點)
- 世界機場基地 (World Airport hub)
- 亞洲城市 (Asian city)
- 歐洲小鎮 (European town)
- 非洲草原 (African savanna)
- 北極 (Arctic)
- 熱帶島嶼 (Tropical island)
- 沙漠綠洲 (Desert oasis)
- 美國大城市 (American metropolis)
- 南美雨林 (South American rainforest)
- 澳洲內陸 (Australian outback)
- 藍天白雲 (Blue sky with clouds)
- 日落天空 (Sunset sky)
- 夜空星星 (Night sky with stars)
- 跑道 (Runway)
- 機庫內部 (Hangar interior)

**E. UI 元素** (約30張)
- 任務類型圖示 (6種)
- 資源圖示 (燃料、金錢、修理包、加速包)
- 按鈕與介面元素
- 獎盃/成就圖示
- 進度條元素

**總計**: ~205 張核心圖片

### 2.2 Prompt 模板系統

**位置**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/prompts/super_wings_game/`

**結構**:
```
prompts/super_wings_game/
├── character_portraits.json      # 角色肖像模板
├── character_states.json         # 角色狀態模板
├── character_expressions.json    # 表情模板
├── backgrounds.json              # 背景模板
├── ui_elements.json              # UI 元素模板
└── shared_settings.json          # 共用設定 (negative prompts, 參數)
```

**模板範例** (`character_portraits.json`):
```json
{
  "templates": {
    "front_view": {
      "prompt": "{character}, solo Super Wings character, {colors}, front view facing camera, symmetrical composition, standing upright, neutral pleasant expression, clean studio background, even lighting, 3d animated robot aircraft, exactly two blue eyes, {personality}, {features}, professional character model sheet quality, perfect symmetry, high quality 3d render",
      "negative_prompt": "{shared_negative}",
      "width": 1024,
      "height": 1024,
      "steps": 40,
      "cfg_scale": 8.0,
      "lora_weight": 0.9
    },
    "three_quarter_view": {
      "prompt": "{character}, three-quarter angle view, {colors} Super Wings character, 45-degree angle showing front and side, friendly expression, dynamic yet stable pose, studio background, three-point lighting, 3d mechanical aircraft, exactly two blue eyes, {personality}, {features}, classic portrait angle, professional composition, Pixar quality render",
      "negative_prompt": "{shared_negative}",
      "width": 1024,
      "height": 1024,
      "steps": 40,
      "cfg_scale": 8.0,
      "lora_weight": 0.9
    }
    // ... 其他視角
  },
  "shared_settings": {
    "sampler": "DPM++ 2M Karras",
    "base_model": "sd_xl_base_1.0.safetensors"
  }
}
```

**共用 Negative Prompt** (`shared_settings.json`):
```json
{
  "negative_prompt_base": "human, person, people, boy, girl, man, woman, child, humanoid, human face, human body, realistic human, multiple characters, two characters, group, crowd, duo, extra eyes, three eyes, four eyes, multiple eyes, extra limbs, wrong colors, incorrect colors, color swap, mismatched colors, blurry, low quality, worst quality, bad quality, lowres, distorted, deformed, disfigured, mutated, malformed, ugly, amateur, draft, unfinished, bad anatomy, bad proportions, jpeg artifacts, watermark, text, signature, 2d, anime style, cartoon illustration, painting, drawing, photographic, photo, photograph, real life, cropped, cut off, frame, border, noise, grainy, chromatic aberration, multiple views, character sheet, reference sheet"
}
```

### 2.3 批次生成腳本

**檔案**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/scripts/batch/generate_super_wings_game_assets.py`

**功能**:
1. 載入角色資料庫 (`super_wings_characters.json`)
2. 載入 prompt 模板
3. 為每個角色 × 每個模板生成 prompt
4. 批次調用 SDXL 生成圖片
5. 自動組織輸出到正確目錄
6. 生成 metadata 記錄每張圖片的參數

**核心邏輯**:
```python
def generate_character_portraits(character_data, templates, output_dir):
    """
    為單一角色生成所有肖像變化
    """
    character_name = character_data['name']
    colors = character_data['colors']
    personality = character_data['personality']
    features = character_data['features']
    lora_path = character_data['lora']['path']
    lora_weight = character_data['lora']['weight']

    for template_name, template in templates.items():
        # 填充模板變數
        prompt = template['prompt'].format(
            character=character_name.lower(),
            colors=colors['primary'] + " and " + colors['secondary'],
            personality=personality,
            features=features['unique']
        )

        # 生成圖片
        image = generate_sdxl_image(
            prompt=prompt,
            negative_prompt=template['negative_prompt'],
            lora_path=lora_path,
            lora_weight=lora_weight,
            width=template['width'],
            height=template['height'],
            steps=template['steps'],
            cfg_scale=template['cfg_scale'],
            seed=42  # 固定 seed 確保可重現性
        )

        # 儲存
        output_path = output_dir / character_name.lower() / f"{template_name}.png"
        save_image(image, output_path)

        # 記錄 metadata
        save_metadata(output_path, {
            'character': character_name,
            'template': template_name,
            'prompt': prompt,
            'lora': lora_path,
            'generated_at': datetime.now().isoformat()
        })
```

**使用方式**:
```bash
conda run -n ai_env python scripts/batch/generate_super_wings_game_assets.py \
  --character-db configs/characters/super_wings_characters.json \
  --templates prompts/super_wings_game/ \
  --output-dir ~/web-projects/super-wings-simulator/assets/images/ \
  --category portraits \
  --characters jett,flip,jerome  # 或 "all"
```

### 2.4 圖片輸出組織

**位置**: `~/web-projects/super-wings-simulator/assets/images/`

**結構**:
```
~/web-projects/super-wings-simulator/assets/images/
├── characters/
│   ├── jett/
│   │   ├── portraits/
│   │   │   ├── front_view.png
│   │   │   ├── three_quarter_view.png
│   │   │   ├── side_profile.png
│   │   │   ├── portrait_closeup.png
│   │   │   ├── flying_pose.png
│   │   │   ├── standing_pose.png
│   │   │   ├── transformation.png
│   │   │   └── icon.png (512x512)
│   │   ├── states/
│   │   │   ├── idle.png
│   │   │   ├── in_flight.png
│   │   │   ├── landing.png
│   │   │   ├── celebrating.png
│   │   │   ├── working.png
│   │   │   └── tired.png
│   │   ├── expressions/
│   │   │   ├── happy.png
│   │   │   ├── excited.png
│   │   │   ├── surprised.png
│   │   │   ├── confident.png
│   │   │   ├── focused.png
│   │   │   └── friendly.png
│   │   └── metadata.json
│   ├── flip/
│   ├── jerome/
│   ├── donnie/
│   ├── chase/
│   ├── todd/
│   ├── paul/
│   └── bello/
├── backgrounds/
│   ├── world_airport.png
│   ├── asian_city.png
│   ├── european_town.png
│   ├── african_savanna.png
│   ├── arctic.png
│   ├── tropical_island.png
│   ├── desert_oasis.png
│   ├── american_city.png
│   ├── rainforest.png
│   ├── australian_outback.png
│   ├── blue_sky.png
│   ├── sunset_sky.png
│   ├── night_sky.png
│   ├── runway.png
│   └── hangar_interior.png
└── ui/
    ├── icons/
    │   ├── mission_delivery.png
    │   ├── mission_rescue.png
    │   ├── mission_sports.png
    │   ├── mission_construction.png
    │   ├── mission_police.png
    │   ├── mission_animal.png
    │   ├── resource_money.png
    │   ├── resource_fuel.png
    │   ├── resource_repair.png
    │   └── resource_boost.png
    └── buttons/
        ├── primary_button.png
        ├── secondary_button.png
        └── icon_button.png
```

### 2.5 品質控制

**檢查清單**:
- [ ] 所有角色顏色正確（特別是 Flip 的藍色帽子）
- [ ] 沒有人類角色混入
- [ ] 沒有多角色問題
- [ ] 沒有多餘眼睛或異常特徵
- [ ] 圖片解析度符合需求（1024×1024 或指定尺寸）
- [ ] WebP 格式優化（減少檔案大小）

**品質檢查腳本**:
```bash
python scripts/batch/validate_game_assets.py \
  --assets-dir ~/web-projects/super-wings-simulator/assets/images/ \
  --report-output validation_report.json
```

### 交付物
- ✅ ~205 張高品質遊戲素材
- ✅ 完整的 metadata 記錄
- ✅ 組織良好的目錄結構
- ✅ 品質驗證報告

---

## Phase 3: Web 遊戲架構與開發 (第 3-6 週)

### 目標
建立完整的 web 遊戲，實現核心遊戲機制

### 3.1 專案結構

**位置**: `~/web-projects/super-wings-simulator/`

**完整目錄樹**:
```
~/web-projects/super-wings-simulator/
├── index.html                    # 遊戲入口
├── css/
│   ├── main.css                  # 全域樣式、CSS 變數
│   ├── components.css            # 可重用元件（按鈕、卡片等）
│   ├── screens/
│   │   ├── main-menu.css
│   │   ├── hangar.css
│   │   ├── mission-board.css
│   │   ├── in-flight.css
│   │   └── results.css
│   └── animations.css            # 動畫效果
├── js/
│   ├── main.js                   # 應用入口點
│   ├── config.js                 # 遊戲配置常數
│   ├── core/
│   │   ├── game-state.js         # 中央狀態管理
│   │   ├── event-bus.js          # 事件系統
│   │   └── save-load.js          # LocalStorage 儲存
│   ├── models/
│   │   ├── character.js          # 角色類別
│   │   ├── mission.js            # 任務類別
│   │   └── resource.js           # 資源管理
│   ├── systems/
│   │   ├── dispatch.js           # 派遣邏輯
│   │   ├── travel.js             # 飛行模擬
│   │   ├── rewards.js            # 獎勵計算
│   │   └── unlock.js             # 解鎖系統
│   ├── ui/
│   │   ├── screen-manager.js     # 畫面切換
│   │   └── screens/
│   │       ├── main-menu.js
│   │       ├── hangar.js
│   │       ├── mission-board.js
│   │       ├── in-flight.js
│   │       └── results.js
│   └── utils/
│       ├── image-loader.js       # 圖片預載
│       └── animations.js         # 動畫工具
├── assets/
│   ├── images/                   # Phase 2 生成的圖片
│   └── audio/                    # 音效（選配）
└── data/
    ├── characters.json           # 從 Phase 1 複製
    ├── missions.json             # 任務定義
    └── balancing.json            # 遊戲平衡參數
```

### 3.2 核心系統設計

#### A. 角色系統 (`js/models/character.js`)

```javascript
class Character {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.role = data.role;
    this.colors = data.colors;

    // 數值屬性
    this.level = 1;
    this.experience = 0;
    this.stats = {
      speed: data.stats.speed,              // 1-10，影響任務時長
      reliability: data.stats.reliability,  // 70-100%，任務成功率
      specialization: data.stats.specialization // "delivery", "sports", etc.
    };

    // 狀態
    this.state = 'available';  // available, on_mission, resting
    this.energy = 100;
    this.maxEnergy = 100;

    // 資源
    this.imagePaths = {
      icon: `assets/images/characters/${this.id}/portraits/icon.png`,
      portrait: `assets/images/characters/${this.id}/portraits/front_view.png`,
      states: {
        idle: `assets/images/characters/${this.id}/states/idle.png`,
        flying: `assets/images/characters/${this.id}/states/in_flight.png`,
        // ...
      },
      expressions: { /* ... */ }
    };

    // LoRA 資訊（用於即時生成）
    this.lora = data.lora;
  }

  // 計算任務時長（分鐘）
  calculateMissionDuration(mission) {
    const baseDuration = mission.duration;
    const speedBonus = (this.stats.speed / 10) * 0.2; // 最多減少 20%
    const specializationBonus = (this.stats.specialization === mission.type) ? 0.15 : 0;
    return Math.floor(baseDuration * (1 - speedBonus - specializationBonus));
  }

  // 計算成功率
  calculateSuccessRate(mission) {
    let rate = this.stats.reliability;
    if (this.stats.specialization === mission.type) rate += 10;
    if (this.energy < 30) rate -= 20;  // 疲勞懲罰
    return Math.max(20, Math.min(100, rate));
  }

  // 消耗能量
  consumeEnergy(amount) {
    this.energy = Math.max(0, this.energy - amount);
  }

  // 恢復能量
  restoreEnergy(amount) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }

  // 獲得經驗
  gainExperience(amount) {
    this.experience += amount;
    while (this.experience >= this.getRequiredExperience()) {
      this.levelUp();
    }
  }

  levelUp() {
    this.level++;
    this.experience = 0;
    // 提升屬性
    this.stats.speed = Math.min(10, this.stats.speed + 0.5);
    this.stats.reliability = Math.min(100, this.stats.reliability + 2);
    this.maxEnergy += 10;
    this.energy = this.maxEnergy;
  }

  getRequiredExperience() {
    return this.level * 100;
  }
}
```

#### B. 任務系統 (`js/models/mission.js`)

```javascript
class Mission {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.type = data.type;  // delivery, rescue, sports, construction, police, animal
    this.difficulty = data.difficulty;  // 1-5
    this.location = data.location;

    // 需求
    this.requirements = {
      minLevel: data.requirements?.minLevel || 1,
      recommendedSpecialization: data.type,
      energyCost: 20 + (data.difficulty * 10)
    };

    // 時間
    this.duration = data.duration;  // 基礎時長（分鐘）
    this.timeLimit = data.timeLimit || null;  // 時間限制（選配）

    // 獎勵
    this.rewards = {
      experience: 50 * data.difficulty,
      money: 100 * data.difficulty,
      special: data.rewards?.special || null  // 特殊獎勵（解鎖等）
    };

    // 故事
    this.story = {
      intro: data.story.intro,      // 任務簡介
      problem: data.story.problem,  // 遇到的問題
      solution: data.story.solution // 解決方案
    };

    // 視覺資源
    this.images = {
      background: `assets/images/backgrounds/${data.location}.png`,
      icon: `assets/images/ui/icons/mission_${data.type}.png`
    };
  }

  // 檢查角色是否符合需求
  isEligible(character) {
    if (character.level < this.requirements.minLevel) return false;
    if (character.energy < this.requirements.energyCost) return false;
    if (character.state !== 'available') return false;
    return true;
  }

  // 計算獎勵倍率（基於角色表現）
  calculateRewardMultiplier(character, success, bonuses) {
    let multiplier = success ? 1.0 : 0.3;
    if (character.stats.specialization === this.type) multiplier += 0.2;
    if (bonuses.perfectCompletion) multiplier += 0.3;
    if (bonuses.fastCompletion) multiplier += 0.2;
    return multiplier;
  }
}
```

#### C. 資源管理 (`js/models/resource.js`)

```javascript
class ResourceManager {
  constructor() {
    this.resources = {
      money: 1000,           // 起始金錢
      fuel: 100,             // 燃料（自動補充）
      repairKits: 5,         // 修理包
      boostPacks: 0          // 加速包
    };

    this.maxValues = {
      fuel: 100,
      repairKits: 20,
      boostPacks: 10
    };

    // 自動補充燃料
    this.startAutoRefuel();
  }

  // 消耗資源
  consume(resource, amount) {
    if (this.resources[resource] >= amount) {
      this.resources[resource] -= amount;
      return true;
    }
    return false;
  }

  // 增加資源
  add(resource, amount) {
    this.resources[resource] = Math.min(
      this.maxValues[resource] || Infinity,
      this.resources[resource] + amount
    );
  }

  // 購買物品
  purchase(item, cost) {
    if (this.resources.money >= cost) {
      this.resources.money -= cost;
      this.add(item, 1);
      return true;
    }
    return false;
  }

  // 自動補充燃料（每分鐘 +1）
  startAutoRefuel() {
    setInterval(() => {
      if (this.resources.fuel < this.maxValues.fuel) {
        this.resources.fuel++;
      }
    }, 60000); // 每分鐘
  }

  // 獲取當前資源狀態
  getStatus() {
    return { ...this.resources };
  }
}
```

#### D. 派遣系統 (`js/systems/dispatch.js`)

```javascript
class DispatchSystem {
  constructor(gameState) {
    this.gameState = gameState;
    this.activeMissions = new Map();  // missionId -> { character, startTime, endTime }
  }

  // 派遣角色執行任務
  dispatchCharacter(character, mission) {
    // 驗證
    if (!mission.isEligible(character)) {
      throw new Error('角色不符合任務需求');
    }

    // 消耗能量和燃料
    character.consumeEnergy(mission.requirements.energyCost);
    this.gameState.resources.consume('fuel', 10);

    // 計算任務時長
    const duration = character.calculateMissionDuration(mission);
    const startTime = Date.now();
    const endTime = startTime + (duration * 60 * 1000);

    // 更新角色狀態
    character.state = 'on_mission';

    // 記錄派遣
    this.activeMissions.set(mission.id, {
      character: character,
      mission: mission,
      startTime: startTime,
      endTime: endTime,
      duration: duration
    });

    // 觸發事件
    this.gameState.eventBus.emit('mission:started', {
      character: character,
      mission: mission,
      duration: duration
    });

    // 設定完成計時器
    setTimeout(() => {
      this.completeMission(mission.id);
    }, duration * 60 * 1000);

    return {
      success: true,
      estimatedCompletion: new Date(endTime)
    };
  }

  // 完成任務
  completeMission(missionId) {
    const missionData = this.activeMissions.get(missionId);
    if (!missionData) return;

    const { character, mission } = missionData;

    // 計算成功率
    const successRate = character.calculateSuccessRate(mission);
    const success = Math.random() * 100 < successRate;

    // 計算獎勵
    const multiplier = mission.calculateRewardMultiplier(character, success, {
      perfectCompletion: success && Math.random() > 0.7,
      fastCompletion: false  // TODO: 實作時間比較
    });

    const rewards = {
      experience: Math.floor(mission.rewards.experience * multiplier),
      money: Math.floor(mission.rewards.money * multiplier),
      special: success ? mission.rewards.special : null
    };

    // 發放獎勵
    character.gainExperience(rewards.experience);
    this.gameState.resources.add('money', rewards.money);

    // 恢復角色狀態
    character.state = 'available';
    character.restoreEnergy(30);  // 部分恢復

    // 移除派遣記錄
    this.activeMissions.delete(missionId);

    // 觸發事件
    this.gameState.eventBus.emit('mission:completed', {
      character: character,
      mission: mission,
      success: success,
      rewards: rewards
    });

    return { success, rewards };
  }

  // 使用加速包
  useBoostPack(missionId) {
    const missionData = this.activeMissions.get(missionId);
    if (!missionData) return false;

    if (this.gameState.resources.consume('boostPacks', 1)) {
      // 立即完成任務
      clearTimeout(missionData.timer);
      this.completeMission(missionId);
      return true;
    }
    return false;
  }

  // 獲取所有進行中的任務
  getActiveMissions() {
    const now = Date.now();
    return Array.from(this.activeMissions.values()).map(data => ({
      character: data.character.name,
      mission: data.mission.title,
      progress: (now - data.startTime) / (data.endTime - data.startTime),
      remainingTime: Math.max(0, data.endTime - now)
    }));
  }
}
```

### 3.3 遊戲流程

#### 主選單 → 機庫 → 任務板 → 飛行動畫 → 結果畫面

**A. 主選單** (`js/ui/screens/main-menu.js`)
- 新遊戲
- 繼續遊戲
- 設定
- 關於

**B. 機庫** (`js/ui/screens/hangar.js`)
- 顯示所有角色卡片
- 顯示角色狀態（可用、任務中、休息中）
- 點擊查看角色詳情
- 角色升級介面

**C. 任務板** (`js/ui/screens/mission-board.js`)
- 顯示可用任務列表
- 篩選（類型、難度、地點）
- 選擇任務 → 選擇角色 → 確認派遣
- 顯示進行中的任務

**D. 飛行動畫** (`js/ui/screens/in-flight.js`)
- 播放角色飛行動畫序列
  1. 起飛（takeoff）
  2. 飛行途中（mid-flight）
  3. 到達目的地（arrival）
  4. 變身（transformation）
  5. 解決問題（working）
  6. 完成（success/return）
- 背景切換（機場 → 天空 → 目的地）
- 進度條顯示

**E. 結果畫面** (`js/ui/screens/results.js`)
- 顯示任務結果（成功/失敗）
- 獲得的獎勵
- 角色升級通知
- 解鎖新內容
- 返回機庫/任務板

### 3.4 數據檔案

#### 任務定義 (`data/missions.json`)

```json
{
  "missions": [
    {
      "id": "delivery_asia_01",
      "title": "送玩具到東京",
      "description": "小明在東京等待他的生日禮物！",
      "type": "delivery",
      "difficulty": 1,
      "location": "asian_city",
      "duration": 5,
      "requirements": {
        "minLevel": 1
      },
      "rewards": {
        "experience": 50,
        "money": 100
      },
      "story": {
        "intro": "小明即將過生日，他的爺爺從美國寄來了特別的禮物。",
        "problem": "包裹需要快速送達，因為生日派對即將開始！",
        "solution": "成功準時送達，小明非常開心！"
      }
    },
    {
      "id": "rescue_arctic_01",
      "title": "北極救援",
      "description": "科學家在北極遇到暴風雪，需要緊急物資！",
      "type": "rescue",
      "difficulty": 3,
      "location": "arctic",
      "duration": 15,
      "timeLimit": 20,
      "requirements": {
        "minLevel": 3
      },
      "rewards": {
        "experience": 150,
        "money": 300,
        "special": "unlock_character_todd"
      },
      "story": {
        "intro": "北極研究站遭遇暴風雪，科學家們需要緊急物資。",
        "problem": "暴風雪很強，能見度極低，導航困難！",
        "solution": "憑藉勇氣和技術，成功送達物資，拯救了科學家們！"
      }
    },
    {
      "id": "sports_europe_01",
      "title": "足球賽協助",
      "description": "幫助孩子們準備足球比賽！",
      "type": "sports",
      "difficulty": 2,
      "location": "european_town",
      "duration": 8,
      "requirements": {
        "minLevel": 2,
        "recommendedCharacter": "flip"
      },
      "rewards": {
        "experience": 100,
        "money": 200
      },
      "story": {
        "intro": "法國小鎮的孩子們要參加重要的足球比賽。",
        "problem": "他們的足球裝備還沒送到！",
        "solution": "Flip 用運動專業知識幫助他們熱身，孩子們贏得了比賽！"
      }
    }
    // ... 更多任務 (建議至少 30 個)
  ]
}
```

### 交付物
- ✅ 完整的 web 遊戲程式碼
- ✅ 所有核心系統實作完成
- ✅ 5 個主要畫面全部實作
- ✅ 至少 30 個任務
- ✅ 完整的遊戲流程可玩

---

## Phase 4: 打磨、測試與部署 (第 7-8 週)

### 目標
優化效能、修復 bug、提升使用者體驗

### 4.1 動畫與過場效果

**A. CSS 動畫** (`css/animations.css`)
- 角色卡片翻轉效果
- 任務完成煙火效果
- 資源獲得動畫
- 畫面切換過場

**B. 飛行動畫序列**
使用 CSS animation + JavaScript 控制時序：
```javascript
async function playFlightAnimation(character, mission) {
  // 1. 起飛 (2秒)
  await animateCharacter('takeoff', 2000);
  await changeBackground('runway', 'sky', 1000);

  // 2. 飛行 (3秒)
  await animateCharacter('flying', 3000);
  await showClouds();

  // 3. 到達 (2秒)
  await changeBackground('sky', mission.location, 1000);
  await animateCharacter('landing', 2000);

  // 4. 變身 (1.5秒)
  await animateTransformation(character, 1500);

  // 5. 工作 (2秒)
  await animateCharacter('working', 2000);

  // 6. 完成 (1秒)
  await animateCharacter('celebrating', 1000);

  return 'complete';
}
```

### 4.2 效能優化

**A. 圖片優化**
- [ ] 轉換所有 PNG 為 WebP 格式（減少 50-70% 檔案大小）
- [ ] 實作 lazy loading
- [ ] 預載關鍵圖片
- [ ] 使用 sprite sheets 整合小圖示

**B. 程式碼優化**
- [ ] Minify JavaScript 和 CSS
- [ ] 啟用 gzip 壓縮
- [ ] 實作 service worker (離線支援)

**C. 效能目標**
- 首次載入 < 3 秒
- 畫面切換 < 300ms
- 動畫 60 FPS

### 4.3 響應式設計

**支援裝置**:
- 桌面瀏覽器 (1920×1080, 1366×768)
- 平板 (iPad: 1024×768)
- 手機 (iPhone: 390×844, Android: 360×800)

**CSS 斷點**:
```css
/* 手機 */
@media (max-width: 768px) {
  /* 單欄布局，較大的觸控按鈕 */
}

/* 平板 */
@media (min-width: 769px) and (max-width: 1024px) {
  /* 兩欄布局 */
}

/* 桌面 */
@media (min-width: 1025px) {
  /* 完整布局 */
}
```

### 4.4 測試

**A. 功能測試**
- [ ] 所有畫面可正常切換
- [ ] 派遣系統運作正常
- [ ] 資源計算正確
- [ ] 儲存/讀取功能
- [ ] 角色升級系統

**B. 相容性測試**
- [ ] Chrome 100+
- [ ] Firefox 100+
- [ ] Safari 15+
- [ ] Edge 100+
- [ ] iOS Safari
- [ ] Android Chrome

**C. 使用者測試**
- 找 3-5 位測試者試玩
- 收集回饋並改進

### 4.5 部署

**A. GitHub Pages 部署**
```bash
cd ~/web-projects/super-wings-simulator/
git init
git add .
git commit -m "Initial commit: Super Wings Simulator"
git branch -M main
git remote add origin https://github.com/username/super-wings-simulator.git
git push -u origin main

# 啟用 GitHub Pages (Settings → Pages → Source: main branch)
```

**B. 自訂網域（選配）**
- 設定 CNAME
- 設定 DNS

### 交付物
- ✅ 完全優化的遊戲
- ✅ 響應式設計支援所有裝置
- ✅ 部署到 GitHub Pages
- ✅ 完整的使用者文檔

---

## 完整時程表

| 週次 | 階段 | 主要任務 | 交付物 |
|------|------|---------|--------|
| **W1** | Phase 1 | 角色資訊整理與驗證 | 角色資料庫 JSON、更新配置文件、文檔 |
| **W2** | Phase 2.1 | Prompt 模板設計、生成腳本開發 | Prompt 模板庫、批次生成腳本 |
| **W3** | Phase 2.2 | 批次生成圖片 | ~200 張遊戲素材 |
| **W4** | Phase 3.1 | 核心系統開發（角色、任務、資源） | 核心類別與系統 |
| **W5** | Phase 3.2 | UI 畫面開發（主選單、機庫、任務板） | 3 個主要畫面 |
| **W6** | Phase 3.3 | 飛行動畫與結果畫面、遊戲流程整合 | 完整可玩遊戲 |
| **W7** | Phase 4.1 | 動畫打磨、效能優化 | 優化後遊戲 |
| **W8** | Phase 4.2 | 測試、修復 bug、部署 | 上線版本 |

---

## 技術規格摘要

### 圖片生成參數
- **Base Model**: SDXL 1.0 (`sd_xl_base_1.0.safetensors`)
- **LoRA Weight**: 0.8-1.0
- **Resolution**: 1024×1024 (肖像)、1280×720 (背景)
- **Sampler**: DPM++ 2M Karras 或 Euler A
- **Steps**: 30-40
- **CFG Scale**: 7.5-9.0
- **格式**: PNG → 轉換為 WebP

### Web 技術
- **前端**: 純 HTML5/CSS3/JavaScript (ES6+)
- **儲存**: LocalStorage
- **部署**: GitHub Pages
- **瀏覽器支援**: Chrome/Firefox/Safari/Edge 100+

### 遊戲平衡
- **起始資源**: 1000 金錢、100 燃料、5 修理包
- **角色數值**: Speed 1-10、Reliability 70-100%
- **任務獎勵**: 50-500 金錢（依難度）
- **角色解鎖成本**: 500-2000 金錢
- **升級成本**: 200-1000 金錢

---

## 關鍵檔案路徑

### Phase 1 - 角色文檔
- `/mnt/c/ai_projects/3d-animation-lora-pipeline/configs/characters/super_wings_characters.json`
- `/mnt/c/ai_projects/3d-animation-lora-pipeline/docs/super_wings/character_database.md`
- `/mnt/c/ai_projects/3d-animation-lora-pipeline/configs/training/super_wings_caption_config.yaml` (需修正)

### Phase 2 - 圖片生成
- `/mnt/c/ai_projects/3d-animation-lora-pipeline/prompts/super_wings_game/*.json`
- `/mnt/c/ai_projects/3d-animation-lora-pipeline/scripts/batch/generate_super_wings_game_assets.py`
- `~/web-projects/super-wings-simulator/assets/images/`

### Phase 3 - Web 遊戲
- `~/web-projects/super-wings-simulator/index.html`
- `~/web-projects/super-wings-simulator/js/core/game-state.js`
- `~/web-projects/super-wings-simulator/js/models/character.js`
- `~/web-projects/super-wings-simulator/data/missions.json`

---

## 風險與緩解措施

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| 圖片生成品質不一致 | 高 | 嚴格的品質檢查流程、重新生成不合格圖片 |
| 遊戲平衡問題 | 中 | 充分測試、可調整的配置文件 |
| 效能問題 | 中 | 圖片優化（WebP）、lazy loading、程式碼優化 |
| 瀏覽器相容性 | 低 | 使用成熟的 Web 標準、充分測試 |
| 時程延誤 | 中 | 採用漸進式開發、MVP 優先 |

---

## 參考資料來源

### 官方資料
- [Super Wings - Wikipedia](https://en.wikipedia.org/wiki/Super_Wings)
- [Super Wings Wiki - Characters](https://super-wings.fandom.com/wiki/Category:Characters)
- [Super Wings Wiki - Flip](https://super-wings.fandom.com/wiki/Flip)

### 內部文檔
- `/mnt/c/ai_projects/3d-animation-lora-pipeline/docs/projects/super-wings/super_wings_series.md`
- `/mnt/c/ai_projects/3d-animation-lora-pipeline/docs/projects/super-wings/character/character_*.md`

### 訓練資料
- `/mnt/data/datasets/general/super-wings/lora_data/characters/`
- `/mnt/data/training/lora/super-wings/`

---

## 下一步行動

### 立即可開始的任務（Phase 1）

1. **審查現有角色文檔**
   ```bash
   cd /mnt/c/ai_projects/3d-animation-lora-pipeline/docs/projects/super-wings/character/
   # 閱讀所有 character_*.md 文件
   ```

2. **修正配置文件中的 Flip 顏色**
   ```yaml
   # 編輯 configs/training/super_wings_caption_config.yaml
   flip:
     name: "Flip"
     description: "Red stunt plane with sports theme, acrobatic expert"
     colors: "red body with white stripes, blue cap with yellow trim"
     style: "compact stunt plane, energetic, sporty"
   ```

3. **建立統一角色資料庫**
   ```bash
   # 新增檔案
   /mnt/c/ai_projects/3d-animation-lora-pipeline/configs/characters/super_wings_characters.json
   ```

4. **提取 caption 資訊**
   ```bash
   # 從訓練 captions 中提取顏色和特徵資訊
   grep -h "distinctive\|color\|feature" /mnt/data/datasets/general/super-wings/lora_data/characters/*/augmented/*.txt | sort | uniq
   ```

---

## 成功標準

### Phase 1 完成標準
- ✅ 所有 8 個角色的資訊完整且正確
- ✅ 配置文件中的顏色錯誤已修正
- ✅ 角色資料庫 JSON 格式規範、易於程式讀取

### Phase 2 完成標準
- ✅ 生成至少 200 張高品質遊戲素材
- ✅ 所有角色顏色正確（特別是 Flip 的藍色帽子）
- ✅ 圖片組織良好、命名規範

### Phase 3 完成標準
- ✅ 遊戲可完整遊玩（派遣 → 飛行 → 完成 → 獎勵）
- ✅ 至少 30 個任務
- ✅ 儲存/讀取功能正常

### Phase 4 完成標準
- ✅ 在所有主流瀏覽器上運行流暢
- ✅ 響應式設計支援手機/平板/桌面
- ✅ 成功部署到 GitHub Pages

---

**專案完成後的願景**: 一個完整、有趣、視覺精美的 Super Wings 模擬遊戲，讓玩家體驗成為世界機場調度員的樂趣，派遣各個 Super Wings 角色去幫助世界各地的小朋友！

---

## Phase 5: 視覺優化與遊戲機制 (新增)

### 目標
增強遊戲的視覺體驗和核心遊戲機制

### 5.1 視覺優化系統

#### A. 主題切換 (ThemeManager)
**檔案**: `js/core/theme-manager.js`
- 深色/淺色主題切換
- 自動偵測系統偏好 (prefers-color-scheme)
- localStorage 持久化
- CSS 變數覆寫機制

**CSS 變數**:
```css
:root {
    --bg-main: #E0F7FA;
    --bg-panel: #FFFFFF;
    --text-main: #333333;
}
[data-theme="dark"] {
    --bg-main: #121212;
    --bg-panel: #1E1E1E;
    --text-main: #E0E0E0;
}
```

#### B. 頁面轉場 (PageTransition)
**檔案**: `js/ui/effects/page-transition.js`
- fade - 淡入淡出
- slide-left/right - 滑動
- zoom - 縮放
- iris - 圓形展開/收縮

#### C. 粒子系統 (ParticleSystem)
**檔案**: `js/ui/effects/particle-system.js`
- confetti - 慶祝彩帶
- sparkle - 閃光效果
- coinBurst - 金幣爆發
- levelUp - 升級光環

### 5.2 遊戲機制系統

#### A. 統計追蹤 (StatisticsTracker)
**檔案**: `js/systems/statistics-tracker.js`

追蹤數據：
- 任務統計 (完成/失敗/按類型)
- 探索統計 (地點/NPC)
- 經濟統計 (收入/支出/峰值)
- 飛行統計 (時間/金幣/障礙)
- 表現統計 (連勝/完美任務)
- 角色統計 (使用/升級)
- 時間統計 (總遊玩時間/首次/最後)

#### B. 成就系統 (AchievementSystem)
**檔案**: `js/systems/achievement-system.js`

23 個預定義成就：
| 類別 | 數量 | 範例 |
|------|------|------|
| milestone | 5 | 首次飛行、50任務、100任務 |
| mission_type | 4 | 配送新手、運動愛好者 |
| exploration | 2 | 5地點、所有地點 |
| character | 4 | 全員出動、Jett大師 |
| performance | 3 | 完美連勝(5)、勢不可擋(10) |
| progression | 2 | 角色達5級、10級 |
| economy | 1 | 累積10000金幣 |
| special | 2 | 事件處理、幫助NPC |

稀有度與獎勵：
- Common (10pts): 100錢 + 50XP
- Uncommon (25pts): 200錢 + 100XP
- Rare (50pts): 300錢 + 150XP
- Epic (100pts): 500錢 + 250XP
- Legendary (200pts): 1000錢 + 500XP

#### C. 存檔管理 (SaveManager)
**檔案**: `js/systems/save-manager.js`

存檔格式 V2：
```javascript
{
    version: 2,
    slot: 0,           // 0-2 (3個存檔槽)
    timestamp: Date,
    playTime: seconds,
    preview: { money, missionsCompleted, lastLocation },
    gameState: { ... },
    statistics: { ... },
    achievements: { unlocked: [], progress: {} },
    settings: { theme, bgmVolume, sfxVolume }
}
```

### 5.3 音效增強

#### AudioManager 擴充
**檔案**: `js/core/audio-manager.js`

新增功能：
- 合成 BGM (Web Audio API)
- BGM 交叉淡入淡出
- 音效池 (reusable oscillators)
- 分開的 BGM/SFX 音量控制

新增合成音效：
- button - UI按鈕點擊
- hover - 懸停
- success - 成功
- error - 錯誤
- achievement - 成就解鎖
- levelup - 升級

### 5.4 新檔案結構

```
js/
├── core/
│   ├── theme-manager.js       (新增)
│   └── audio-manager.js       (修改)
├── systems/
│   ├── achievement-system.js  (新增)
│   ├── statistics-tracker.js  (新增)
│   └── save-manager.js        (新增)
├── ui/
│   ├── components/
│   │   ├── theme-toggle.js    (新增)
│   │   ├── save-slot-card.js  (新增)
│   │   └── achievement-card.js(新增)
│   ├── screens/
│   │   ├── achievements.js    (新增)
│   │   ├── statistics.js      (新增)
│   │   └── save-load.js       (新增)
│   └── effects/
│       ├── page-transition.js (新增)
│       ├── particle-system.js (新增)
│       └── achievement-popup.js(新增)
```

### 5.5 實作順序

| 階段 | 任務 | 狀態 |
|------|------|------|
| 5.1 | ThemeManager + 深色主題 CSS | ✅ 完成 |
| 5.2 | StatisticsTracker | 🔄 進行中 |
| 5.3 | SaveManager | ⏳ 待開始 |
| 5.4 | AchievementSystem | ⏳ 待開始 |
| 5.5 | 成就彈窗 + 畫面 | ⏳ 待開始 |
| 5.6 | 存讀檔畫面 | ⏳ 待開始 |
| 5.7 | 統計畫面 | ⏳ 待開始 |
| 5.8 | PageTransition | ⏳ 待開始 |
| 5.9 | ParticleSystem | ⏳ 待開始 |
| 5.10 | AudioManager BGM | ⏳ 待開始 |
| 5.11 | 整合測試 | ⏳ 待開始 |

### 交付物
- ✅ 深色/淺色主題切換
- ✅ 統計追蹤系統
- ✅ 成就系統 (23個成就)
- ✅ 多存檔槽 (3槽)
- ✅ 頁面轉場動畫
- ✅ 粒子慶祝效果
- ✅ 合成背景音樂

---

## Phase 5.B: 完整動畫流程增強 (新增 2025-12-17)

### 目標
利用 AI 圖片選擇 API 自動判斷最適合的圖片，增強所有飛行動畫流程

### 遊戲流程圖

```
HANGAR
  ↓ (選擇任務)
LAUNCH (增強版 - AI 圖片選擇)
  ↓ (起飛動畫)
IN-FLIGHT (飛行遊戲)
  ↓ (飛行結束)
ARRIVAL (新畫面 - 降落動畫)
  ↓ (準備變身)
TRANSFORMATION (已完成 - 手動控制)
  ↓ (變身完成)
DIALOGUE - INTRO
  ↓
TASK (任務小遊戲)
  ↓
DIALOGUE - OUTRO
  ↓
RESULTS (獎勵展示)
  ↓
RETURN (增強版 - 完整返回序列)
  ↓ (慶祝→反變身→起飛→飛行→降落)
HANGAR
```

### 5.B.1 AI 圖片選擇服務

**檔案**: `js/core/image-selector-service.js`

前端服務封裝：
```javascript
class ImageSelectorService {
    apiBase = 'http://localhost:8000/api/v1/images';

    // 場景專用選擇器
    async selectForReady(characterId)      // 準備階段
    async selectForTakeoff(characterId)    // 起飛階段
    async selectForFlying(characterId)     // 飛行階段
    async selectForDescending(characterId) // 降落階段
    async selectForHovering(characterId)   // 懸停/準備變身
    async selectForCelebrating(characterId) // 慶祝
    async selectForReturning(characterId)  // 返回飛行

    // 批次預載
    async preloadForLaunch(characterId)
    async preloadForArrival(characterId)
    async preloadForReturn(characterId)

    // 變身序列 (支援反向)
    async getTransformSequence(characterId, { reverse: true })
}
```

### 5.B.2 起飛動畫增強 (launch.js)

**動畫序列** (約 5 秒):
| 階段 | 時間 | 圖片 | 效果 |
|------|------|------|------|
| Ready | 0-1s | AI 選擇 "determined" | 角色準備 |
| Accelerating | 1-3s | AI 選擇 "takeoff" | Canvas 速度線 + 震動 |
| Liftoff | 3-4.5s | AI 選擇 "flying" | 角色上升 + 雲層 |
| Transition | 4.5-5s | - | 閃光 + 切換 |

視覺效果：
- ✅ TransformationBackground (速度線)
- ✅ 雲層 parallax
- ✅ 排氣粒子
- ✅ 螢幕震動
- ✅ 動態 RPM 表

### 5.B.3 降落動畫 (arrival.js) [新建]

**檔案**: `js/ui/screens/arrival.js`

**動畫序列** (約 4 秒):
| 階段 | 時間 | 圖片 | 效果 |
|------|------|------|------|
| Descending | 0-2s | AI 選擇 "landing" | 角色下降 + 雲層上移 |
| Hovering | 2-2.5s | AI 選擇 "hovering" | 懸停浮動 + 目的地名稱 |
| Ready | 2.5-3.5s | AI 選擇 "alert" | 發光脈衝 + "Ready!" |
| Transition | 3.5-4s | - | GlowBurst + 切換 |

視覺效果：
- ✅ TransformationBackground (上移速度線)
- ✅ GlowBurst 發光擴散
- ✅ 雲層從下方飛入
- ✅ 目的地背景

### 5.B.4 返回基地增強 (return-base.js)

**動畫序列** (約 9.5 秒):
| 階段 | 時間 | 圖片 | 效果 |
|------|------|------|------|
| Celebrating | 0-2s | AI 選擇 "celebrating" | 彩帶粒子 + 標題 |
| Reverse Transform | 2-4.5s | transform_frames (反向) | GlowBurst + 旋轉 |
| Takeoff | 4.5-6s | AI 選擇 "takeoff" | 上升 + 地面下移 |
| Flying | 6-8s | AI 選擇 "flying" | 穩定飛行 + 雲層 |
| Landing | 8-9.5s | AI 選擇 "landing" | 下降 + 地面上升 |

視覺效果：
- ✅ Confetti 彩帶粒子
- ✅ TransformationBackground
- ✅ GlowBurst 發光擴散
- ✅ 反向變身幀動畫
- ✅ 雲層 parallax
- ✅ 地面/跑道

### 5.B.5 新增音效

**檔案**: `js/core/audio-manager.js`

| 音效名稱 | 用途 |
|----------|------|
| arrival | 降落進場 |
| transform_ready | 準備變身充能 |
| mission_complete | 任務完成勝利 |

### 5.B.6 實作狀態

| 項目 | 狀態 |
|------|------|
| AI 圖片選擇服務 | ✅ 完成 |
| 起飛動畫增強 | ✅ 完成 |
| 降落動畫畫面 | ✅ 完成 |
| 返回基地增強 | ✅ 完成 |
| main.js 流程整合 | ✅ 完成 |
| 新增音效 | ✅ 完成 |

### 交付物
- ✅ `js/core/image-selector-service.js` - AI 圖片選擇服務
- ✅ `js/ui/screens/arrival.js` - 新的降落動畫畫面
- ✅ 增強版 `js/ui/screens/launch.js`
- ✅ 增強版 `js/ui/screens/return-base.js`
- ✅ 更新 `js/main.js` 流程路由
- ✅ 新增音效 (arrival, transform_ready, mission_complete)
