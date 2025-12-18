# Super Wings Simulator - 任務探索系統計畫

## 專案概述

將現有的簡單任務互動系統重構為完整的 **2D 橫向捲軸探索遊戲**，包含：
- 自由探索目的地場景
- 多 NPC 互動與子任務系統
- 物品收集與交付機制
- 夥伴呼叫與即時切換
- 角色超能力系統
- 可進入的建築物場景

---

## 核心設計決策

| 項目 | 決策 |
|------|------|
| 遊戲視角 | 2D 橫向捲軸（類似超級瑪利歐） |
| 夥伴切換 | 即時切換視角，所有角色同時存在場景中 |
| 超能力系統 | 兩者結合：部分區域需特定能力 + 專業角色有加成 |
| 建築內部 | AI 動態生成，根據任務和地點決定 |

---

## 系統架構

### 新增檔案結構

```
js/game/exploration/
├── exploration-engine.js       # 核心 2D 探索引擎
├── exploration-physics.js      # 物理/碰撞系統
├── exploration-renderer.js     # 分層渲染器
├── world.js                    # 世界/場景容器
├── camera.js                   # 攝影機控制
├── scene-stack.js              # 場景堆疊（建築進出）
├── interaction-system.js       # 互動系統
└── input-handler-exploration.js # 探索模式輸入

js/game/entities/
├── base-entity.js              # 基礎實體類別
├── player-character.js         # 可控角色
├── npc.js                      # NPC 實體
├── collectible-item.js         # 可撿取物品
├── building-entrance.js        # 建築入口
├── ability-blocker.js          # 能力障礙物
└── ai-controlled-character.js  # AI 控制邏輯

js/game/abilities/
├── ability-system.js           # 能力系統管理器
├── ability-definitions.js      # 8 角色能力定義
└── ability-effects.js          # 能力視覺效果

js/systems/
├── partner-system.js           # 夥伴呼叫與切換
└── exploration-mission-generator.js # 探索任務生成

js/models/
└── exploration-mission.js      # 探索任務模型

js/ui/screens/
├── exploration.js              # 探索主畫面
├── exploration-dialogue.js     # 對話系統 UI
└── exploration-results.js      # 探索結果畫面

js/ui/components/
├── mission-tracker.js          # 任務追蹤 UI
├── inventory-bar.js            # 物品欄
├── partner-switcher.js         # 角色切換 UI
└── ability-bar.js              # 能力快捷鍵

js/ui/effects/
└── partner-arrival.js          # 夥伴入場動畫
```

---

## 一、核心探索引擎

### 1.1 ExplorationEngine 類別

```javascript
// js/game/exploration/exploration-engine.js
class ExplorationEngine {
    constructor(canvas, mission) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mission = mission;

        // 子系統
        this.world = new ExplorationWorld(mission);
        this.physics = new ExplorationPhysics();
        this.camera = new Camera(canvas.width, canvas.height);
        this.renderer = new ExplorationRenderer(this.ctx);
        this.interaction = new InteractionSystem(this.world);
        this.partnerSystem = new PartnerSystem(this.world);
        this.abilitySystem = new AbilitySystem();

        // 遊戲迴圈
        this.lastTime = 0;
        this.isRunning = false;
    }

    gameLoop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.handleInput();
        this.update(dt);
        this.render();

        if (this.isRunning) {
            requestAnimationFrame(t => this.gameLoop(t));
        }
    }
}
```

### 1.2 世界容器

```javascript
// js/game/exploration/world.js
class ExplorationWorld {
    constructor(mission) {
        this.bounds = { left: 0, right: Infinity };
        this.isInfinite = true;
        this.segmentWidth = 1920;

        // 實體容器
        this.players = new Map();      // 所有角色
        this.npcs = new Map();         // NPC
        this.items = new Map();        // 物品
        this.buildings = new Map();    // 建築物
        this.blockers = new Map();     // 能力障礙物

        // 從任務載入實體
        this.loadFromMission(mission);
    }

    // 無限循環位置包裝
    wrapPosition(x) {
        return ((x % this.segmentWidth) + this.segmentWidth) % this.segmentWidth;
    }
}
```

### 1.3 物理系統

```javascript
// js/game/exploration/exploration-physics.js
class ExplorationPhysics {
    gravity = 800;
    groundY = 500;

    update(entity, dt) {
        // 速度更新
        entity.vx += entity.ax * dt;
        entity.vy += (entity.isFlying ? 0 : this.gravity) * dt;

        // 位置更新
        entity.x += entity.vx * dt;
        entity.y += entity.vy * dt;

        // 地面碰撞
        if (!entity.isFlying && entity.y > this.groundY) {
            entity.y = this.groundY;
            entity.vy = 0;
            entity.isGrounded = true;
        }
    }

    // AABB 碰撞檢測
    checkCollision(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }
}
```

---

## 二、角色控制系統

### 2.1 玩家角色

```javascript
// js/game/entities/player-character.js
class PlayerCharacter extends BaseEntity {
    constructor(characterId, data) {
        super();
        this.characterId = characterId;
        this.characterData = data;

        // 狀態
        this.mode = 'walking';     // walking, flying, interacting
        this.isGrounded = true;
        this.facingRight = true;
        this.isAIControlled = false;

        // 移動參數
        this.walkSpeed = 300;
        this.flySpeed = 500;
        this.jumpForce = 400;

        // 能力和物品
        this.abilities = ABILITY_DEFINITIONS[characterId] || [];
        this.inventory = [];
        this.maxInventorySize = 10;
    }

    handleInput(input) {
        if (this.isAIControlled) return;

        // 水平移動 (A/D 或 ←/→)
        const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        this.vx = moveX * (this.mode === 'flying' ? this.flySpeed : this.walkSpeed);
        if (moveX !== 0) this.facingRight = moveX > 0;

        // 垂直移動（飛行模式）
        if (this.mode === 'flying') {
            const moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
            this.vy = moveY * this.flySpeed;
        }

        // 跳躍/起飛 (Space)
        if (input.jump && this.isGrounded) {
            if (input.holdJump) {
                this.mode = 'flying';
                this.isFlying = true;
            } else {
                this.vy = -this.jumpForce;
            }
        }

        // 降落
        if (input.down && this.mode === 'flying' && this.y >= this.groundY - 10) {
            this.mode = 'walking';
            this.isFlying = false;
        }
    }
}
```

### 2.2 控制鍵配置

| 按鍵 | 功能 |
|------|------|
| A/D 或 ←/→ | 左右移動 |
| W/↑ | 飛行模式向上 |
| S/↓ | 飛行模式向下 / 降落 |
| Space | 跳躍 / 長按起飛 |
| E | 互動（對話、撿取、進入建築） |
| Q | 使用主要能力 |
| 1-8 | 切換控制角色 |
| Tab | 開啟夥伴呼叫選單 |

---

## 三、互動系統

### 3.1 互動管理器

```javascript
// js/game/exploration/interaction-system.js
class InteractionSystem {
    interactRange = 80;
    currentTarget = null;

    update(player) {
        let nearest = null;
        let nearestDist = this.interactRange;

        // 檢查 NPC
        for (const npc of this.world.npcs.values()) {
            const dist = this.distance(player, npc);
            if (dist < nearestDist && npc.canInteract()) {
                nearest = npc;
                nearestDist = dist;
            }
        }

        // 檢查物品（考慮能力需求）
        for (const item of this.world.items.values()) {
            const dist = this.distance(player, item);
            if (dist < nearestDist && this.canPickup(player, item)) {
                nearest = item;
                nearestDist = dist;
            }
        }

        // 檢查建築入口
        for (const building of this.world.buildings.values()) {
            const dist = this.distance(player, building.entrance);
            if (dist < nearestDist) {
                nearest = building;
                nearestDist = dist;
            }
        }

        this.currentTarget = nearest;
    }

    interact(player) {
        if (!this.currentTarget) return;

        if (this.currentTarget instanceof NPC) {
            eventBus.emit('START_DIALOGUE', { npc: this.currentTarget, player });
        } else if (this.currentTarget instanceof CollectibleItem) {
            this.pickupItem(player, this.currentTarget);
        } else if (this.currentTarget instanceof Building) {
            eventBus.emit('ENTER_BUILDING', { building: this.currentTarget });
        }
    }
}
```

### 3.2 建築場景切換

```javascript
// js/game/exploration/scene-stack.js
class SceneStack {
    stack = [];
    currentScene = null;

    async enterBuilding(buildingId) {
        // 生成建築內部場景
        const interior = await this.generateInterior(buildingId);

        // Push 當前場景
        this.stack.push(this.currentScene);

        // 轉場動畫
        await this.transitionTo(interior, 'door_open');
    }

    async exitBuilding() {
        const previous = this.stack.pop();
        await this.transitionTo(previous, 'door_close');
    }

    async generateInterior(buildingId) {
        // 呼叫 AI 生成建築內部
        const response = await fetch(`/api/v1/scenes/interior/${buildingId}`);
        return response.json();
    }
}
```

---

## 四、夥伴系統

### 4.1 夥伴呼叫

```javascript
// js/systems/partner-system.js
class PartnerSystem {
    activePartners = new Map();
    currentPlayer = null;

    async callPartner(characterId) {
        const char = gameState.getCharacter(characterId);
        if (!char.isAvailable) {
            eventBus.emit('SHOW_TOAST', { message: `${char.name} 目前無法出動` });
            return false;
        }

        // 播放入場序列
        await this.playArrivalSequence(characterId);

        // 加入場景
        const partner = new PlayerCharacter(characterId, char);
        partner.x = this.currentPlayer.x + 200;
        partner.y = 0;  // 從天空降落
        partner.isAIControlled = true;

        this.world.addPlayer(partner);
        this.activePartners.set(characterId, partner);

        return true;
    }

    async playArrivalSequence(characterId) {
        // 小視窗顯示完整流程
        await this.showMiniSequence(characterId, 'takeoff', 1500);
        await this.showMiniSequence(characterId, 'flying', 1000);
        await this.showMiniSequence(characterId, 'transform', 2000);

        // 場景中降落
        eventBus.emit('PARTNER_LANDING', { characterId });
    }

    switchTo(characterId) {
        const partner = this.activePartners.get(characterId);
        if (!partner) return false;

        // 舊角色變 AI 控制
        if (this.currentPlayer) {
            this.currentPlayer.isAIControlled = true;
        }

        // 新角色變玩家控制
        partner.isAIControlled = false;
        this.currentPlayer = partner;

        // 攝影機跟隨
        eventBus.emit('CAMERA_FOLLOW', { target: partner });

        return true;
    }
}
```

### 4.2 入場動畫視窗

小視窗在畫面右上角顯示夥伴的入場動畫：
1. **起飛** (1.5秒) - 顯示起飛動畫圖片
2. **飛行** (1秒) - 顯示飛行中圖片
3. **變身** (2秒) - 播放變身幀動畫
4. **降落** - 角色從畫面上方進入場景

---

## 五、超能力系統

### 5.1 能力定義

```javascript
// js/game/abilities/ability-definitions.js
export const ABILITY_DEFINITIONS = {
    jett: [
        { id: 'super_speed', name: '超速配送', icon: '⚡', type: 'passive', effect: { speedMultiplier: 1.5 } },
        { id: 'call_partner', name: '召喚夥伴', icon: '📞', type: 'active', cooldown: 30000 }
    ],
    donnie: [
        { id: 'build_bridge', name: '建造橋樑', icon: '🌉', type: 'world_interact', targetType: 'gap' },
        { id: 'deploy_tool', name: '工具部署', icon: '🔧', type: 'active' }
    ],
    todd: [
        { id: 'drill', name: '地面鑽探', icon: '⛏️', type: 'world_interact', targetType: 'soft_ground' },
        { id: 'tunnel', name: '隧道開挖', icon: '🕳️', type: 'world_interact', targetType: 'blocked_path' }
    ],
    chase: [
        { id: 'transform_vehicle', name: '多重變形', icon: '🚗', type: 'active' },
        { id: 'stealth', name: '隱身', icon: '👻', type: 'toggle', duration: 10000 }
    ],
    bello: [
        { id: 'animal_talk', name: '動物溝通', icon: '🦜', type: 'world_interact', targetType: 'animal' },
        { id: 'animal_help', name: '動物協助', icon: '🐾', type: 'active' }
    ],
    paul: [
        { id: 'traffic_control', name: '交通控制', icon: '🚦', type: 'world_interact', targetType: 'traffic' },
        { id: 'siren', name: '警笛', icon: '🚨', type: 'active', effect: { clearPath: true } }
    ],
    flip: [
        { id: 'athletic_jump', name: '運動跳躍', icon: '🏃', type: 'passive', effect: { jumpMultiplier: 1.5 } },
        { id: 'sports_challenge', name: '運動挑戰', icon: '🏆', type: 'active' }
    ],
    jerome: [
        { id: 'stunt_fly', name: '特技飛行', icon: '🌀', type: 'active' },
        { id: 'dance', name: '舞蹈表演', icon: '💃', type: 'active' }
    ]
};
```

### 5.2 能力障礙物

```javascript
// js/game/entities/ability-blocker.js
class AbilityBlocker extends BaseEntity {
    constructor(data) {
        super(data.x, data.y, data.width, data.height);
        this.blockerType = data.blockerType;  // gap, soft_ground, blocked_path, animal, traffic
        this.requiredAbility = data.requiredAbility;
        this.isResolved = false;
        this.hintText = data.hintText;
    }

    // 發光顏色對應角色主色
    getGlowColor() {
        const colors = {
            gap: '#FFD700',           // Donnie 黃色
            soft_ground: '#8B4513',   // Todd 棕色
            blocked_path: '#8B4513',
            animal: '#FFFFFF',         // Bello 白色
            traffic: '#1E90FF'         // Paul 藍色
        };
        return colors[this.blockerType];
    }

    canInteract(player) {
        return player.abilities.some(a => a.id === this.requiredAbility);
    }
}
```

---

## 六、任務系統

### 6.1 探索任務模型

```javascript
// js/models/exploration-mission.js
class ExplorationMission extends Mission {
    constructor(data) {
        super(data);

        this.subTasks = data.subTasks || [];        // 子任務
        this.npcs = data.npcs || [];                 // 場景 NPC
        this.items = data.items || [];               // 場景物品
        this.buildings = data.buildings || [];       // 可進入建築

        // 進度追蹤
        this.collectedItems = [];
        this.completedSubTasks = [];
    }

    checkCompletion() {
        return this.subTasks.every(t => t.isCompleted);
    }
}
```

### 6.2 子任務類型

| 類型 | 說明 | 範例 |
|------|------|------|
| `fetch` | 找物品交給 NPC | 找到烘焙材料交給 Maria |
| `talk` | 與指定 NPC 對話 | 詢問 Pierre 關於食譜的事 |
| `ability` | 使用能力解決問題 | 用 Todd 的鑽探能力挖開地面 |
| `escort` | 護送 NPC 到目的地 | 帶迷路的小孩回家 |

---

## 七、UI/UX 設計

### 7.1 HUD 佈局

```
+------------------------------------------------------------------+
|  [任務追蹤]                                    [小地圖] [設定]    |
|  ├─ 幫助 Maria 找到烘焙材料 ✓                                    |
|  ├─ 與 Pierre 對話                                               |
|  └─ 取得隱藏的食譜 (需要 Todd)                                   |
|                                                                   |
|                     [遊戲畫面區域]                                |
|                                                                   |
|------------------------------------------------------------------+
|  [物品欄: 1 2 3 4 5 6 7 8 9 0]     [角色切換: J D T ...]         |
|  [互動提示: 按 E 與 Maria 對話]     [能力: Q W]                   |
+------------------------------------------------------------------+
```

### 7.2 字體與清晰度

- **任務追蹤**: 16px, 半透明背景, 高對比度
- **互動提示**: 18px, 黃色邊框, 置中顯示
- **物品欄**: 圖示 48x48, 數字標籤 14px
- **對話框**: 20px, 白色文字, 深色背景

---

## 八、資產需求

### 8.1 需要 AI 生成的新資產

| 類別 | 數量 | 說明 |
|------|------|------|
| NPC 肖像 | ~40 | 每個目的地 2-3 個 NPC |
| NPC 全身 | ~40 | 場景中的 NPC 圖片 |
| 物品圖示 | ~50 | 各類可收集物品 |
| 建築內部 | 動態 | AI 根據類型生成 |
| 能力效果 | 8 | 每個角色的能力動畫 |

### 8.2 生成配置檔

```
prompts/game_assets/
├── npcs.json              # NPC 生成提示詞
├── items.json             # 物品生成提示詞
└── building_interiors.json # 建築內部生成提示詞
```

---

## 九、實作階段

### Phase 1: 核心引擎

**目標**: 建立可玩的 2D 橫向探索原型

**檔案清單**:
1. `js/game/exploration/exploration-engine.js`
2. `js/game/exploration/exploration-physics.js`
3. `js/game/exploration/camera.js`
4. `js/game/entities/base-entity.js`
5. `js/game/entities/player-character.js`
6. `js/game/exploration/input-handler-exploration.js`

**驗收標準**:
- [ ] 角色可在無限循環場景中行走和飛行
- [ ] 攝影機正確跟隨角色
- [ ] 基本物理運作

---

### Phase 2: 場景與背景

**目標**: 完善場景系統

**檔案清單**:
1. `js/game/exploration/world.js`
2. `js/game/exploration/exploration-renderer.js`
3. `js/game/exploration/scene-stack.js`
4. `css/screens/exploration.css`

**驗收標準**:
- [ ] 多層視差背景正確滾動
- [ ] 可進入/離開建築物

---

### Phase 3: 互動系統

**目標**: NPC、物品、對話

**檔案清單**:
1. `js/game/entities/npc.js`
2. `js/game/entities/collectible-item.js`
3. `js/game/exploration/interaction-system.js`
4. `js/ui/screens/exploration-dialogue.js`
5. `js/ui/components/inventory-bar.js`
6. `js/models/exploration-mission.js`

**驗收標準**:
- [ ] 可與 NPC 對話並接收任務
- [ ] 可撿取物品並交還 NPC

---

### Phase 4: 夥伴系統

**目標**: 呼叫和切換

**檔案清單**:
1. `js/systems/partner-system.js`
2. `js/ui/components/partner-switcher.js`
3. `js/ui/effects/partner-arrival.js`
4. `js/game/entities/ai-controlled-character.js`

**驗收標準**:
- [ ] 可呼叫其他角色加入
- [ ] 入場動畫完整
- [ ] 可即時切換控制

---

### Phase 5: 能力系統

**目標**: 角色特殊能力

**檔案清單**:
1. `js/game/abilities/ability-system.js`
2. `js/game/abilities/ability-definitions.js`
3. `js/game/abilities/ability-effects.js`
4. `js/game/entities/ability-blocker.js`
5. `js/ui/components/ability-bar.js`

**驗收標準**:
- [ ] 每個角色有獨特能力
- [ ] 障礙物需對應能力
- [ ] 能力有冷卻和視覺效果

---

### Phase 6: 任務整合

**目標**: 完整任務流程

**檔案清單**:
1. `js/systems/exploration-mission-generator.js`
2. `js/ui/components/mission-tracker.js`
3. `js/ui/screens/exploration-results.js`

**驗收標準**:
- [ ] 自動生成多 NPC 任務
- [ ] 任務進度正確追蹤
- [ ] 完成獲得獎勵

---

### Phase 7: UI 與資產

**目標**: 視覺完善

**檔案清單**:
1. `prompts/game_assets/npcs.json`
2. `prompts/game_assets/items.json`
3. `prompts/game_assets/building_interiors.json`
4. `scripts/generate_exploration_assets.py`
5. `css/screens/exploration-hud.css`

**驗收標準**:
- [ ] UI 清晰可讀
- [ ] NPC 和物品有正確圖片
- [ ] 建築內部可動態生成

---

## 十、關鍵參考檔案

| 現有檔案 | 用途 |
|---------|------|
| `js/game/flight-engine.js` | Canvas 遊戲迴圈模式參考 |
| `js/game/parallax-background.js` | 視差背景系統，需擴充 |
| `js/models/mission.js` | 任務模型基礎類別 |
| `backend/data/knowledge/game_mechanics.json` | 角色能力定義權威來源 |
| `js/core/game-state.js` | 遊戲狀態，需擴充支援多角色 |

---

## 十一、注意事項

1. **效能優化**: 使用空間雜湊網格優化碰撞檢測
2. **離線支援**: 所有 AI 生成都需要 fallback
3. **響應式設計**: 支援不同螢幕尺寸
4. **可重用性**: 探索引擎可用於不同目的地
5. **擴展性**: 新角色能力只需添加定義檔
