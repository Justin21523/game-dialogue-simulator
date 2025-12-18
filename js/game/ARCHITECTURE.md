# SceneTransition 系統架構

## 類別結構圖

```
SceneTransition
│
├── 核心屬性
│   ├── canvas (HTMLCanvasElement)
│   ├── ctx (CanvasRenderingContext2D)
│   ├── isTransitioning (boolean)
│   ├── currentAnimation (number|null)
│   └── defaults (Object)
│
├── 私有方法
│   ├── _getEasingFunction(type)    → Function
│   └── _animate(drawFrame, duration, easing) → Promise
│
├── 基礎轉場
│   ├── fadeOut(duration, options)  → Promise
│   ├── fadeIn(duration, options)   → Promise
│   └── crossFade(from, to, duration) → Promise
│
├── 特效轉場
│   ├── takeoff(options)            → Promise
│   │   ├── 放射狀速度線
│   │   ├── 中心光暈
│   │   └── 白光閃爍
│   │
│   └── landing(options)            → Promise
│       ├── 天空漸層
│       ├── 雲朵飄動
│       └── 降落閃光
│
├── 幾何轉場
│   ├── wipeHorizontal(dir, duration) → Promise
│   ├── wipeVertical(dir, duration)   → Promise
│   └── circleWipe(dir, duration)     → Promise
│
└── 工具方法
    ├── stop()                      → void
    ├── clear()                     → void
    └── sequence(transitions)       → Promise
```

## 資料流程圖

```
使用者呼叫
    ↓
await transition.takeoff()
    ↓
_animate() 開始迴圈
    ↓
┌─────────────────────────┐
│  requestAnimationFrame  │
└────────┬────────────────┘
         ↓
    計算進度 (0~1)
         ↓
    應用緩動函數
         ↓
    執行 drawFrame 回呼
         ↓
    繪製當前幀
         ↓
    ┌──────────┐
    │ 進度<1?  │
    └─┬────┬───┘
  是 │    │ 否
     ↓    ↓
  繼續  resolve Promise
         ↓
    回傳給使用者
```

## 緩動函數視覺化

```
linear:        ─────────────
               /
              /

easeIn:        ────────────
               /
              /
             /
            /

easeOut:       ────
              /
             /
            /
           /

easeInOut:     ───────
              /       \
             /         \
            /           \
```

## 整合流程圖

```
遊戲場景切換流程

LaunchScreen (出發畫面)
    ↓
按住 Space 加速
    ↓
RPM 滿 → triggerTakeoff()
    ↓
transition.takeoff({
    onHalfway: () => renderInFlight()
})
    ↓
FlightEngine (飛行場景)
    ↓
完成任務 → finishGame()
    ↓
transition.landing({
    onComplete: () => renderResults()
})
    ↓
ResultsScreen (結算畫面)
```

## 使用時序圖

```
User          SceneTransition    Canvas         Game
 |                  |              |              |
 |---fadeOut()----->|              |              |
 |                  |--clearRect-->|              |
 |                  |--fillRect--->|              |
 |                  |   (alpha++)  |              |
 |                  |              |              |
 |<--Promise--------|              |              |
 |                  |              |              |
 |---切換場景內容------------------>|              |
 |                  |              |              |
 |---fadeIn()------>|              |              |
 |                  |--fillRect--->|              |
 |                  |   (alpha--)  |              |
 |<--Promise--------|              |              |
 |                  |              |              |
```

## 轉場效果矩陣

| 轉場類型 | 使用場景 | 持續時間 | 視覺效果 | 適用角色 |
|---------|---------|---------|---------|---------|
| fadeOut/In | 通用切換 | 500ms | 漸變 | 全部 |
| takeoff | 起飛 | 1500ms | 速度線+光暈 | 全部 |
| landing | 降落 | 1500ms | 雲層+閃光 | 全部 |
| wipeHorizontal | 選單切換 | 800ms | 橫向擦除 | N/A |
| wipeVertical | 對話框 | 800ms | 縱向擦除 | N/A |
| circleWipe | 特殊事件 | 1000ms | 圓形擴散 | N/A |

## 效能特性

```
記憶體使用:
├── Canvas Context: ~8MB (1920x1080)
├── Animation Frame: ~1KB
└── 總計: ~10MB

渲染效能:
├── FPS Target: 60fps
├── Frame Time: ~16.67ms
└── 轉場開銷: <5ms/frame

並發控制:
├── 同時轉場數: 1
├── 佇列機制: sequence()
└── 中斷機制: stop()
```

## 錯誤處理

```javascript
try {
    await transition.takeoff();
} catch (error) {
    console.error('轉場失敗:', error);
    // 降級方案: 直接切換場景
    window.game.renderInFlight(missionId);
}
```

## 擴展點

未來可新增的轉場效果:

1. **分裂轉場** (Split)
   - 從中間向兩側展開
   - 適用於對稱場景

2. **馬賽克轉場** (Pixelate)
   - 像素化溶解效果
   - 適用於故障/錯誤場景

3. **旋轉轉場** (Rotate)
   - 3D 旋轉效果
   - 適用於視角切換

4. **波紋轉場** (Ripple)
   - 水波紋擴散
   - 適用於水下場景

5. **粒子轉場** (Particle)
   - 粒子飛散/聚合
   - 適用於變身/傳送

## 相依性

```
scene-transition.js
    ↓
無外部相依 (Pure Vanilla JS)

整合時相依:
    ↓
├── game-state.js (取得角色資料)
├── config.js (顏色配置)
└── audio-manager.js (音效同步)
```

## 測試覆蓋

```
單元測試:
├── ✓ 緩動函數正確性
├── ✓ 進度計算準確性
├── ✓ Promise 正確 resolve
└── ✓ 記憶體無洩漏

整合測試:
├── ✓ Launch → Flight 流暢切換
├── ✓ Flight → Results 正確顯示
├── ✓ 多個轉場串聯
└── ✓ 瀏覽器相容性

視覺測試:
└── test-transitions.html (手動測試)
```

## 最佳實踐

1. **總是使用 await** - 確保轉場完成再切換場景
2. **回收資源** - 場景銷毀時呼叫 `stop()`
3. **配合音效** - 在 onHalfway 切換音軌
4. **考慮降級** - 低效能設備可縮短 duration
5. **保持流暢** - 單次轉場時間不超過 2 秒

## 除錯技巧

```javascript
// 啟用除錯模式
const DEBUG = true;

if (DEBUG) {
    console.log('開始轉場:', performance.now());
}

await transition.takeoff({
    onHalfway: () => {
        if (DEBUG) console.log('轉場中點:', performance.now());
    }
});

if (DEBUG) {
    console.log('轉場完成:', performance.now());
}
```
