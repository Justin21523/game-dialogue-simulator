# SceneTransition 快速參考指南

## 一分鐘上手

```javascript
import { SceneTransition } from './js/game/scene-transition.js';

const canvas = document.getElementById('myCanvas');
const transition = new SceneTransition(canvas);

// 簡單淡出/淡入
await transition.fadeOut(500);
await transition.fadeIn(500);
```

## 常用轉場速查表

### 1. 基礎淡入淡出

```javascript
// 淡出到黑色 (500ms)
await transition.fadeOut(500);

// 淡出到白色
await transition.fadeOut(500, { color: '#FFFFFF' });

// 快速淡入
await transition.fadeIn(300);
```

### 2. 起飛轉場 (Launch → Flight)

```javascript
// 使用角色顏色
import { CONFIG } from '../config.js';

const colors = CONFIG.TRANSFORMATION_COLORS['jett'];

await transition.takeoff({
    duration: 1500,
    color: colors.background,
    accentColor: colors.lines,
    glowColor: colors.glow,
    onHalfway: () => {
        // 在 50% 時切換場景
        switchToFlightScene();
    }
});
```

### 3. 降落轉場 (Flight → Results)

```javascript
// 成功降落 (綠色地面)
await transition.landing({
    duration: 1500,
    skyColor: '#87CEEB',
    groundColor: '#228B22'
});

// 失敗降落 (灰色地面)
await transition.landing({
    duration: 1500,
    skyColor: '#696969',
    groundColor: '#8B4513'
});
```

### 4. 擦除轉場

```javascript
// 水平擦除 (左→右)
await transition.wipeHorizontal('right', 800);

// 垂直擦除 (上→下)
await transition.wipeVertical('down', 800);

// 圓形擴散 (從中心)
await transition.circleWipe('out', 1000, {
    centerX: canvas.width / 2,
    centerY: canvas.height / 2
});
```

### 5. 組合轉場

```javascript
await transition.sequence([
    () => transition.fadeOut(300),
    () => transition.wipeHorizontal('right', 500),
    () => transition.fadeIn(300)
]);
```

## 完整整合範例

### LaunchScreen 整合

```javascript
// js/ui/screens/launch.js

import { SceneTransition } from '../../game/scene-transition.js';
import { CONFIG } from '../../config.js';

export class LaunchScreen {
    constructor(containerId, missionId) {
        this.container = document.getElementById(containerId);
        this.missionId = missionId;
        this.transition = null;
    }

    async triggerTakeoff() {
        this.isLaunching = true;
        audioManager.stopEngine();

        const canvas = document.getElementById('launch-canvas');
        this.transition = new SceneTransition(canvas);

        const mission = gameState.activeMissions.find(m => m.id === this.missionId);
        const char = gameState.getCharacter(mission.assignedCharId);
        const colors = CONFIG.TRANSFORMATION_COLORS[char.id];

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

### FlightEngine 整合

```javascript
// js/game/flight-engine.js

import { SceneTransition } from './scene-transition.js';

export class FlightEngine {
    constructor(canvas, charId, imgPath, onComplete, missionType) {
        this.canvas = canvas;
        this.transition = new SceneTransition(this.canvas);
        // ... 其他初始化
    }

    async finishGame(success) {
        this.isRunning = false;
        audioManager.stopEngine();

        // 計算分數
        if (success) {
            if (this.missionType === 'Sports') {
                this.score += Math.floor(this.timeLeft * 10);
            }
        }

        // 降落轉場
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

## 常見問題

### Q: 如何調整轉場速度?

```javascript
// 快速轉場
await transition.fadeOut(200);

// 慢速轉場
await transition.fadeOut(2000);
```

### Q: 如何在轉場中點執行程式碼?

```javascript
await transition.takeoff({
    onHalfway: () => {
        console.log('轉場進行到 50%');
        // 在此切換場景、載入資源等
    }
});
```

### Q: 如何停止正在進行的轉場?

```javascript
transition.stop();
```

### Q: 如何清空 Canvas?

```javascript
transition.clear();
```

### Q: 如何改變緩動效果?

```javascript
await transition.fadeOut(500, {
    easing: 'easeInCubic'  // 加速
});

await transition.fadeIn(500, {
    easing: 'easeOutCubic'  // 減速
});
```

## 效能優化技巧

```javascript
// 1. 降低解析度 (低效能設備)
canvas.width = window.innerWidth * 0.5;
canvas.height = window.innerHeight * 0.5;

// 2. 縮短轉場時間
await transition.fadeOut(300);  // 原本 500ms

// 3. 使用簡單轉場
await transition.fadeOut(200);
// 而非複雜的 takeoff()

// 4. 避免重疊轉場
if (transition.isTransitioning) {
    transition.stop();
}
await transition.fadeOut(500);
```

## 除錯模式

```javascript
// 顯示轉場狀態
console.log('正在轉場:', transition.isTransitioning);

// 追蹤轉場時間
const start = performance.now();
await transition.takeoff();
console.log('耗時:', performance.now() - start, 'ms');

// 監聽各階段
await transition.takeoff({
    onHalfway: () => console.log('50%'),
    onComplete: () => console.log('100%')
});
```

## 色彩配置速查

所有角色的轉場顏色都在 `CONFIG.TRANSFORMATION_COLORS` 中定義:

```javascript
const jettColors = {
    background: '#1A237E',   // 深藍
    lines: '#FFD700',        // 金色
    glow: '#E31D2B'          // 紅色
};

const jeromeColors = {
    background: '#BF360C',   // 深橙紅
    lines: '#FFFFFF',        // 白色
    glow: '#0077BE'          // 藍色
};

// ... 其他角色
```

## 測試指令

```bash
# 啟動開發伺服器
python3 -m http.server 8000

# 測試轉場效果
# 瀏覽器開啟: http://localhost:8000/test-transitions.html
```

## 相關檔案

- **主程式**: `/js/game/scene-transition.js`
- **使用範例**: `/js/game/scene-transition-example.js`
- **完整文檔**: `/js/game/SCENE_TRANSITION_README.md`
- **系統架構**: `/js/game/ARCHITECTURE.md`
- **測試頁面**: `/test-transitions.html`

## 授權與支援

此系統屬於 Super Wings Simulator 專案。如有問題請參考完整文檔或查看範例程式碼。
