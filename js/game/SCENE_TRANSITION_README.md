# Scene Transition System (場景轉場系統)

Super Wings 遊戲的視覺轉場系統，提供流暢的場景切換效果。

## 功能特色

- **淡入/淡出** - 經典的漸變過渡
- **交叉淡化** - 兩個場景平滑過渡
- **起飛轉場** - 動態加速效果，配合速度線與光暈
- **降落轉場** - 雲層飄動的降落動畫
- **擦除轉場** - 水平/垂直/圓形擦除效果
- **組合序列** - 串聯多個轉場效果

## 快速開始

### 1. 基本使用

```javascript
import { SceneTransition } from './js/game/scene-transition.js';

// 初始化
const canvas = document.getElementById('myCanvas');
const transition = new SceneTransition(canvas);

// 執行淡出/淡入
await transition.fadeOut(500);
// ... 更新場景內容
await transition.fadeIn(500);
```

### 2. 起飛轉場

```javascript
import { CONFIG } from './js/config.js';

const characterId = 'jett';
const colors = CONFIG.TRANSFORMATION_COLORS[characterId];

await transition.takeoff({
    duration: 1500,
    color: colors.background,        // 深藍背景
    accentColor: colors.lines,       // 金色速度線
    glowColor: colors.glow,          // 紅色光暈
    onHalfway: () => {
        // 在轉場中點切換場景
        window.game.renderInFlight(missionId);
    }
});
```

### 3. 降落轉場

```javascript
await transition.landing({
    duration: 1500,
    skyColor: '#87CEEB',      // 天空藍
    groundColor: '#228B22',   // 草地綠
    onComplete: () => {
        // 顯示結算畫面
        window.game.renderResults(missionId);
    }
});
```

### 4. 擦除轉場

```javascript
// 水平擦除 (從左到右)
await transition.wipeHorizontal('right', 800, {
    color: '#000000'
});

// 垂直擦除 (從上到下)
await transition.wipeVertical('down', 800, {
    color: '#1A1A2E'
});

// 圓形擴散 (從中心向外)
await transition.circleWipe('out', 1000, {
    color: '#000000',
    centerX: canvas.width / 2,
    centerY: canvas.height / 2
});
```

### 5. 組合序列

```javascript
await transition.sequence([
    () => transition.fadeOut(300),
    () => new Promise(resolve => setTimeout(resolve, 200)),
    () => transition.wipeHorizontal('right', 500),
    () => transition.fadeIn(300)
]);
```

## API 文檔

### Constructor

```javascript
new SceneTransition(canvas)
```

**參數:**
- `canvas` (HTMLCanvasElement) - Canvas 元素

---

### fadeOut(duration, options)

淡出效果，畫面漸黑/漸白。

**參數:**
- `duration` (number) - 持續時間(毫秒)，預設 500
- `options` (Object)
  - `color` (string) - 顏色，預設 '#000000'
  - `easing` (string) - 緩動類型，預設 'easeInOut'
  - `onComplete` (Function) - 完成回呼

**返回:** Promise

---

### fadeIn(duration, options)

淡入效果，畫面從黑/白漸現。

**參數:** 同 fadeOut

**返回:** Promise

---

### crossFade(fromCanvas, toCanvas, duration, options)

兩個場景的交叉淡化。

**參數:**
- `fromCanvas` (HTMLCanvasElement) - 來源場景
- `toCanvas` (HTMLCanvasElement) - 目標場景
- `duration` (number) - 持續時間
- `options` (Object)
  - `easing` (string) - 緩動類型
  - `onComplete` (Function) - 完成回呼

**返回:** Promise

---

### takeoff(options)

起飛轉場，配合角色顏色的動態特效。

**參數:**
- `options` (Object)
  - `duration` (number) - 持續時間，預設 1500
  - `color` (string) - 背景色，預設 '#1A237E'
  - `accentColor` (string) - 速度線顏色，預設 '#FFD700'
  - `glowColor` (string) - 光暈顏色，預設 '#E31D2B'
  - `onHalfway` (Function) - 中點回呼 (50% 時觸發)
  - `onComplete` (Function) - 完成回呼

**返回:** Promise

**特效說明:**
- 放射狀速度線 (從中心向外擴散)
- 中心光暈效果
- 背景漸變 (深色 → 白光)
- 最終白光閃爍

---

### landing(options)

降落轉場，雲層飄動的降落動畫。

**參數:**
- `options` (Object)
  - `duration` (number) - 持續時間，預設 1500
  - `skyColor` (string) - 天空色，預設 '#87CEEB'
  - `groundColor` (string) - 地面色，預設 '#228B22'
  - `cloudColor` (string) - 雲朵色，預設 '#FFFFFF'
  - `onHalfway` (Function) - 中點回呼
  - `onComplete` (Function) - 完成回呼

**返回:** Promise

**特效說明:**
- 天空到地面的漸層背景
- 雲朵由快到慢飄動
- 地面接近時底部暗化
- 降落瞬間白光閃爍

---

### wipeHorizontal(direction, duration, options)

水平擦除轉場。

**參數:**
- `direction` (string) - 方向 'left' 或 'right'
- `duration` (number) - 持續時間，預設 800
- `options` (Object)
  - `color` (string) - 顏色
  - `easing` (string) - 緩動類型
  - `onComplete` (Function) - 完成回呼

**返回:** Promise

---

### wipeVertical(direction, duration, options)

垂直擦除轉場。

**參數:**
- `direction` (string) - 方向 'down' 或 'up'
- `duration` (number) - 持續時間，預設 800
- `options` (Object) - 同 wipeHorizontal

**返回:** Promise

---

### circleWipe(direction, duration, options)

圓形擴散轉場。

**參數:**
- `direction` (string) - 方向 'out' (向外) 或 'in' (向內)
- `duration` (number) - 持續時間，預設 1000
- `options` (Object)
  - `color` (string) - 顏色
  - `centerX` (number) - 中心 X 座標
  - `centerY` (number) - 中心 Y 座標
  - `easing` (string) - 緩動類型
  - `onComplete` (Function) - 完成回呼

**返回:** Promise

---

### sequence(transitions)

按順序執行多個轉場。

**參數:**
- `transitions` (Array<Function>) - 轉場函數陣列

**返回:** Promise

**範例:**
```javascript
await transition.sequence([
    () => transition.fadeOut(300),
    () => transition.wipeHorizontal('right', 500),
    () => transition.fadeIn(300)
]);
```

---

### stop()

停止當前轉場動畫。

---

### clear()

清空 Canvas。

---

## 緩動函數 (Easing)

可用的緩動類型:

- `'linear'` - 線性
- `'easeIn'` - 緩入 (二次方)
- `'easeOut'` - 緩出 (二次方)
- `'easeInOut'` - 緩入緩出 (二次方) [預設]
- `'easeInCubic'` - 緩入 (三次方)
- `'easeOutCubic'` - 緩出 (三次方)
- `'easeInOutCubic'` - 緩入緩出 (三次方)

## 整合到現有遊戲

### 整合到 LaunchScreen (出發畫面)

```javascript
// 在 js/ui/screens/launch.js

import { SceneTransition } from '../../game/scene-transition.js';
import { CONFIG } from '../../config.js';

export class LaunchScreen {
    constructor(containerId, missionId) {
        // ... 現有代碼
        this.transition = null;
    }

    async triggerTakeoff() {
        this.isLaunching = true;
        audioManager.stopEngine();

        // 初始化轉場
        const canvas = document.getElementById('launch-canvas');
        this.transition = new SceneTransition(canvas);

        // 取得角色顏色
        const mission = gameState.activeMissions.find(m => m.id === this.missionId);
        const char = gameState.getCharacter(mission.assignedCharId);
        const colors = CONFIG.TRANSFORMATION_COLORS[char.id];

        // 執行起飛轉場
        await this.transition.takeoff({
            duration: 1500,
            color: colors.background,
            accentColor: colors.lines,
            glowColor: colors.glow,
            onHalfway: () => {
                window.game.renderInFlight(this.missionId);
            }
        });
    }
}
```

### 整合到 FlightEngine (飛行引擎)

```javascript
// 在 js/game/flight-engine.js

import { SceneTransition } from './scene-transition.js';

export class FlightEngine {
    constructor(canvas, charId, imgPath, onComplete, missionType) {
        // ... 現有代碼
        this.transition = new SceneTransition(this.canvas);
    }

    async finishGame(success) {
        if (!this.isRunning) return;
        this.isRunning = false;
        audioManager.stopEngine();

        // 計算分數
        // ...

        // 執行降落轉場
        await this.transition.landing({
            duration: 1500,
            skyColor: success ? '#87CEEB' : '#696969',
            groundColor: success ? '#228B22' : '#8B4513',
            onComplete: () => {
                if (this.onComplete) {
                    this.onComplete({ score: this.score, success });
                }
            }
        });
    }
}
```

## 測試頁面

開啟 `test-transitions.html` 來測試所有轉場效果:

```bash
python3 -m http.server 8000
# 瀏覽器開啟 http://localhost:8000/test-transitions.html
```

## 使用範例

完整的使用範例請參考 `scene-transition-example.js`。

## 效能注意事項

1. **避免重疊轉場** - 確保一次只執行一個轉場
2. **使用 stop() 清理** - 切換場景前停止當前動畫
3. **Canvas 大小** - 轉場效果會覆蓋整個 Canvas
4. **記憶體管理** - 長時間運行時定期呼叫 `clear()`

## 除錯

啟用 DEBUG_MODE 來查看轉場狀態:

```javascript
console.log('Is Transitioning:', transition.isTransitioning);
```

## 版本紀錄

- **v1.0.0** (2025-12-17)
  - 初始版本
  - 支援淡入淡出、起飛降落、擦除轉場
  - Promise-based API
  - 多種緩動函數

## 授權

此系統屬於 Super Wings Simulator 專案的一部分。
