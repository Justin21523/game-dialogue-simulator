# 多樣化角色圖片生成系統

為每個 Super Wings 角色生成 20 個不同 prompt 的多樣化圖片。

## 功能特點

- ✅ **20 個多樣化 prompt 模板**:涵蓋不同角度、動作、表情和姿勢
- ✅ **每個 prompt 生成 3 個變體**: 每個角色共 60 張圖片 (20 × 3)
- ✅ **使用角色專屬 LoRA 模型**: 確保角色準確性
- ✅ **完整的 negative prompt**: 避免生成奇怪的結果
- ✅ **自動去背功能**: 生成透明 PNG (可選)
- ✅ **支援跳過已存在檔案**: 可以中斷後繼續

## 20 個 Prompt 類型

### 視角類 (Views)
1. **front_view_neutral** - 正面中性視角
2. **side_profile_flying** - 側面飛行姿態
3. **three_quarter_action** - 3/4視角動作姿勢
4. **top_down_view** - 俯視視角

### 動作類 (Actions)
5. **dynamic_ascending** - 動態向上飛行
6. **dynamic_diving** - 動態俯衝
7. **landing_approach** - 降落姿勢
8. **takeoff_launch** - 起飛姿勢
9. **hovering_midair** - 空中懸停
10. **speed_motion** - 速度動感
11. **banking_left** - 左轉動作
12. **banking_right** - 右轉動作

### 姿勢類 (Poses)
13. **heroic_stance** - 英雄姿勢
14. **ready_action** - 準備行動姿勢
15. **confident_proud** - 自信姿勢
16. **celebration_victory** - 慶祝姿勢
17. **ready_to_help** - 準備幫助姿勢

### 表情類 (Expressions)
18. **happy_cheerful** - 開心表情
19. **determined_focused** - 堅定表情
20. **excited_enthusiastic** - 興奮表情

## 使用方法

### 1. 激活 conda 環境
```bash
source ~/miniconda3/etc/profile.d/conda.sh
conda activate super_wings
```

### 2. 生成圖片

#### 測試單個角色 (推薦先測試)
```bash
python scripts/generate_diverse_shots.py --test jett
```

#### 生成特定角色
```bash
# 單個角色
python scripts/generate_diverse_shots.py --characters jett

# 多個角色
python scripts/generate_diverse_shots.py --characters jett,flip,jerome
```

#### 生成所有角色 (8個角色 × 60張 = 480張圖片)
```bash
python scripts/generate_diverse_shots.py --all
```

#### 跳過已存在的圖片 (推薦用於中斷後繼續)
```bash
python scripts/generate_diverse_shots.py --all --skip-existing
```

#### 不執行去背 (更快,稍後再批次去背)
```bash
python scripts/generate_diverse_shots.py --all --no-rembg
```

### 3. 稍後批次去背 (如果使用了 --no-rembg)
```bash
python scripts/batch_rembg.py assets/images/characters/*/diverse_shots/*.png
```

## 輸出結構

```
assets/images/characters/
├── jett/
│   └── diverse_shots/
│       ├── front_view_neutral_v1.png
│       ├── front_view_neutral_v2.png
│       ├── front_view_neutral_v3.png
│       ├── side_profile_flying_v1.png
│       ├── side_profile_flying_v2.png
│       ├── side_profile_flying_v3.png
│       └── ... (共 60 張)
├── jerome/
│   └── diverse_shots/
│       └── ... (共 60 張)
└── ... (其他角色)
```

## 生成參數

- **解析度**: 1024×1024 (portrait)
- **採樣器**: DPM++ 2M Karras
- **步數**: 35 steps
- **CFG Scale**: 7.8
- **LoRA 權重**: 0.9
- **變體數量**: 每個 prompt 3 個變體 (不同 seed)

## Negative Prompt 涵蓋範圍

為了避免生成奇怪的結果,negative prompt 包含:
- ✅ 低品質和扭曲排除
- ✅ 多角色排除 (確保單一角色)
- ✅ 人類和動物排除
- ✅ 其他 Super Wings 角色排除
- ✅ 結構錯誤排除 (錯誤顏色、額外物件等)
- ✅ 背景排除 (確保純白背景)
- ✅ 風格排除 (避免2D、照片等)

## 預估時間

### 使用 GPU (NVIDIA RTX 系列)
- 單個角色 (60張): 約 30-45 分鐘
- 所有角色 (480張): 約 4-6 小時

### 使用 --no-rembg 選項
可以節省約 30-40% 的時間,稍後再批次去背。

## 常見問題

### Q: 生成過程中斷了怎麼辦?
使用 `--skip-existing` 選項繼續:
```bash
python scripts/generate_diverse_shots.py --all --skip-existing
```

### Q: 如何只重新生成某幾個角色?
指定角色 ID:
```bash
python scripts/generate_diverse_shots.py --characters jett,flip
```

### Q: 生成的圖片顏色不對怎麼辦?
檢查 LoRA 模型路徑是否正確:
- 路徑配置在: `prompts/game_assets/shared_settings.json`
- LoRA 文件位置: `/mnt/data/training/lora/super-wings/`

### Q: 想要修改某個 prompt 怎麼做?
編輯配置文件:
```bash
nano prompts/game_assets/character_diverse_shots.json
```
找到對應的 prompt template 進行修改。

### Q: 如何查看生成進度?
腳本會顯示:
- 當前角色
- 當前 prompt (X/20)
- 當前變體生成狀態
- 成功/失敗統計

## 進階使用

### 修改生成參數
編輯 `character_diverse_shots.json`:
```json
{
  "front_view_neutral": {
    "steps": 40,          // 修改步數
    "cfg_scale": 8.0,     // 修改 CFG
    "resolution": "icon"  // 修改解析度
  }
}
```

### 添加新的 Prompt
在 `character_diverse_shots.json` 的 `templates` 中添加:
```json
{
  "my_custom_pose": {
    "prompt_template": "{trigger}, {colors}, your custom prompt here, {base_style}, {quality}",
    "description": "我的自訂姿勢",
    "resolution": "portrait",
    "steps": 35,
    "cfg_scale": 7.8
  }
}
```

## 技術細節

### Prompt 變數替換
腳本會自動替換以下變數 (來自 `shared_settings.json`):
- `{trigger}` - 角色觸發詞 (如 "jett")
- `{colors}` - 角色顏色 (如 "red and white")
- `{color_detail}` - 顏色細節描述
- `{features}` - 角色特徵描述
- `{unique}` - 獨特識別特徵
- `{style}` - 角色個性風格
- `{eye_color}` - 眼睛顏色
- `{base_style}` - 基礎 3D 渲染風格
- `{lighting}` - 光照描述
- `{quality}` - 品質關鍵詞

### 自動強制純白背景
所有 prompt 會自動添加:
```
(solid white background:1.4), (plain white backdrop:1.3),
(no background elements:1.2), SOLO character, isolated on white
```

## 相關文件

- **配置文件**: `prompts/game_assets/character_diverse_shots.json`
- **腳本**: `scripts/generate_diverse_shots.py`
- **角色設定**: `prompts/game_assets/shared_settings.json`
- **角色資料**: `data/characters.json`

## 授權

本專案為 Super Wings 模擬遊戲的一部分。
