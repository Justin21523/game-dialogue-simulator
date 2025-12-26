# NPC AI 生成整合指南

## 概述

本指南說明如何在探索模式中使用 AI 生成的 NPCs。

## 後端 API

### 端點

1. **GET `/api/v1/npc/roles`** - 獲取可用的角色、性格、對話風格
2. **POST `/api/v1/npc/generate`** - 生成 NPCs
3. **POST `/api/v1/npc/batch`** - 批量生成 NPCs
4. **GET `/api/v1/npc/test`** - 測試端點

### API 範例

```javascript
// 1. 獲取可用選項
const response = await fetch('http://localhost:8001/api/v1/npc/roles');
const data = await response.json();
// {
//   "roles": ["shopkeeper", "citizen", "child", ...],
//   "personalities": ["friendly", "grumpy", "shy", ...],
//   "dialogue_styles": ["casual", "formal", ...]
// }

// 2. 生成 NPCs
const response = await fetch('http://localhost:8001/api/v1/npc/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        location: 'paris',
        location_type: 'outdoor',
        count: 3
    })
});
const data = await response.json();
// {
//   "success": true,
//   "npcs": [
//     {
//       "npc_id": "npc_paris_child_7771",
//       "name": "Pierre",
//       "role": "child",
//       "personality": "mysterious",
//       "appearance": {...},
//       "dialogue_style": "humorous",
//       "location_type": "outdoor",
//       "has_quest": false,
//       "quest_hint": null
//     },
//     ...
//   ],
//   "count": 3
// }
```

## 前端整合

### 1. 導入 NPC Service

```javascript
import { getNPCService } from '../services/npc-service.js';
```

### 2. 在探索模式初始化時生成 NPCs

```javascript
// 在 ExplorationScreen 的 render() 方法中
async loadAINPCs() {
    const npcService = getNPCService();

    // 生成戶外 NPCs
    const outdoorNPCs = await npcService.generateNPCs({
        location: this.params.destination || 'paris',
        locationType: 'outdoor',
        count: 3
    });

    // 轉換為遊戲物件並添加到場景
    outdoorNPCs.forEach((apiNPC, index) => {
        const gameNPC = npcService.convertToGameNPC(apiNPC, {
            x: 300 + index * 200,
            y: this.groundY - 80
        });

        this.npcs.push(gameNPC);
    });

    console.log(`[ExplorationScreen] Loaded ${this.npcs.length} AI NPCs`);
}

// 在 render() 中調用
async render() {
    // ... 現有初始化代碼 ...

    // 載入 AI 生成的 NPCs
    await this.loadAINPCs();

    // ... 啟動遊戲循環 ...
}
```

### 3. 批量生成不同類型的 NPCs

```javascript
async loadMixedNPCs() {
    const npcService = getNPCService();

    // 批量生成不同類型的 NPCs
    const allNPCs = await npcService.batchGenerateNPCs('paris', {
        'outdoor': 3,
        'shop': 2,
        'cafe': 1
    });

    // 將不同類型的 NPCs 放置在不同位置
    const outdoorNPCs = allNPCs.filter(npc => npc.location_type === 'outdoor');
    const shopNPCs = allNPCs.filter(npc => npc.location_type === 'shop');
    const cafeNPCs = allNPCs.filter(npc => npc.location_type === 'cafe');

    // 戶外 NPCs
    outdoorNPCs.forEach((apiNPC, index) => {
        const gameNPC = npcService.convertToGameNPC(apiNPC, {
            x: 300 + index * 200,
            y: this.groundY - 80
        });
        this.npcs.push(gameNPC);
    });

    // 商店 NPCs（放在建築物附近）
    shopNPCs.forEach((apiNPC, index) => {
        const building = this.buildings.find(b => b.type === 'shop');
        if (building) {
            const gameNPC = npcService.convertToGameNPC(apiNPC, {
                x: building.x - 100,
                y: this.groundY - 80
            });
            this.npcs.push(gameNPC);
        }
    });

    console.log(`[ExplorationScreen] Loaded ${this.npcs.length} mixed AI NPCs`);
}
```

### 4. 動態生成建築物內部的 NPCs

```javascript
async enterBuilding(building) {
    console.log(`[ExplorationScreen] Entering building: ${building.name}`);

    // ... 現有進入建築邏輯 ...

    // 動態生成建築物內部的 NPCs
    const npcService = getNPCService();
    const interiorNPCs = await npcService.generateNPCs({
        location: this.params.destination || 'paris',
        locationType: building.type, // 'shop', 'cafe', 'library', etc.
        count: 2
    });

    // 將 NPCs 添加到室內場景
    interiorNPCs.forEach((apiNPC, index) => {
        const gameNPC = npcService.convertToGameNPC(apiNPC, {
            x: 400 + index * 200,
            y: 450
        });

        // 添加到室內 NPCs 列表（如果有的話）
        if (this.currentInterior && this.currentInterior.npcs) {
            this.currentInterior.npcs.push(gameNPC);
        }
    });
}
```

## NPC 資料結構

### API 返回的 NPC 格式

```javascript
{
    "npc_id": "npc_paris_child_7771",
    "name": "Pierre",
    "role": "child",  // 12 種角色
    "personality": "mysterious",  // 12 種性格
    "appearance": {
        "hair_color": "blonde",
        "clothing_style": "playful and colorful",
        "distinctive_feature": "big eyes",
        "color_scheme": "bright colors"
    },
    "dialogue_style": "humorous",  // 8 種對話風格
    "location_type": "outdoor",
    "has_quest": false,
    "quest_hint": null  // 如果 has_quest=true，會有提示
}
```

### 遊戲中的 NPC 格式（經過 convertToGameNPC 轉換）

```javascript
{
    npcId: "npc_paris_child_7771",
    name: "Pierre",
    role: "child",
    personality: "mysterious",
    appearance: {...},
    dialogueStyle: "humorous",
    locationType: "outdoor",
    hasQuest: false,
    questHint: null,

    // 遊戲屬性
    x: 500,
    y: 500,
    width: 60,
    height: 80,
    dialogue: "Hello! I'm Pierre.",
    canInteract: true,
    color: "#FFD700",
    sprite: null
}
```

## 可用選項

### 角色 (Roles)
- shopkeeper, citizen, child, elder, official, merchant
- artist, teacher, doctor, librarian, chef, musician

### 性格 (Personalities)
- friendly, grumpy, shy, energetic, wise, mysterious
- cheerful, serious, playful, calm, nervous, confident

### 對話風格 (Dialogue Styles)
- casual, formal, enthusiastic, reserved
- poetic, direct, humorous, philosophical

### 地點類型 (Location Types)
- outdoor, shop, cafe, library
- hospital, school, town_hall, warehouse

## 效能優化

### 1. 使用緩存

NPCService 自動緩存已生成的 NPCs：

```javascript
const npcService = getNPCService();

// 第一次調用：從 API 獲取
const npcs1 = await npcService.generateNPCs({
    location: 'paris',
    locationType: 'outdoor',
    count: 3
});

// 第二次調用：從緩存獲取（相同參數）
const npcs2 = await npcService.generateNPCs({
    location: 'paris',
    locationType: 'outdoor',
    count: 3
});
```

### 2. 清除緩存

```javascript
const npcService = getNPCService();
npcService.clearCache();
```

### 3. 預載入

在場景加載時預先生成 NPCs：

```javascript
async preloadNPCs() {
    const npcService = getNPCService();

    // 預先生成常用類型的 NPCs
    await Promise.all([
        npcService.generateNPCs({ location: 'paris', locationType: 'outdoor', count: 5 }),
        npcService.generateNPCs({ location: 'paris', locationType: 'shop', count: 2 }),
        npcService.generateNPCs({ location: 'paris', locationType: 'cafe', count: 2 })
    ]);

    console.log('[ExplorationScreen] NPCs preloaded');
}
```

## Fallback 機制

如果 API 調用失敗，NPCService 會自動使用預設 NPCs：

```javascript
// 即使後端服務離線，也會返回預設 NPCs
const npcs = await npcService.generateNPCs({
    location: 'paris',
    count: 3
});
// 永遠會返回有效的 NPCs 陣列
```

## 測試

### 1. 測試 API 連接

```javascript
const npcService = getNPCService();

// 測試 /roles 端點
const roles = await npcService.getRoles();
console.log('Available roles:', roles);

// 測試 /generate 端點
const npcs = await npcService.generateNPCs({
    location: 'paris',
    locationType: 'outdoor',
    count: 1
});
console.log('Generated NPCs:', npcs);
```

### 2. 使用瀏覽器控制台測試

```javascript
// 開啟前端（例如：npm run dev 後的 http://localhost:5173）
// 按 F12 打開開發者工具 Console

// 直接呼叫後端 API（預設後端 base: http://localhost:8001/api/v1）
const API_BASE = 'http://localhost:8001/api/v1';
const res = await fetch(`${API_BASE}/npc/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'tokyo', location_type: 'outdoor', count: 3 })
});
const data = await res.json();
console.log(data);
```

## 下一步

1. ✅ 後端 NPC Generator Agent 已完成
2. ✅ 後端 NPC API 路由已完成
3. ⏳ 前端（`src/`）補齊 NPC service wrapper
4. ⏳ 整合到 `src/game/phaser/scenes/ExplorationScene.ts`
5. ⏳ 實現 AI 對話系統
6. ⏳ 實現 AI 背景生成
7. ⏳ 實現 AI 室內場景生成
