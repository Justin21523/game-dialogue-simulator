/**
 * SceneTransition 使用範例
 *
 * 展示如何在 Super Wings 遊戲中使用場景轉場系統
 */

import { SceneTransition } from './scene-transition.js';
import { CONFIG } from '../config.js';

/**
 * 範例 1: 基本淡入淡出
 */
export async function exampleBasicFade(canvas) {
    const transition = new SceneTransition(canvas);

    // 淡出到黑色
    await transition.fadeOut(500);
    console.log('畫面已淡出');

    // 這裡可以切換場景內容
    // ... 更新 DOM 或 Canvas 內容

    // 從黑色淡入
    await transition.fadeIn(500);
    console.log('畫面已淡入');
}

/**
 * 範例 2: 起飛轉場 (Launch → Flight)
 * 整合到 LaunchScreen.triggerTakeoff()
 */
export async function exampleTakeoffTransition(canvas, characterId) {
    const transition = new SceneTransition(canvas);
    const colors = CONFIG.TRANSFORMATION_COLORS[characterId] || CONFIG.TRANSFORMATION_COLORS.jett;

    await transition.takeoff({
        duration: 1500,
        color: colors.background,
        accentColor: colors.lines,
        glowColor: colors.glow,
        onHalfway: () => {
            console.log('轉場中點 - 可在此切換場景');
            // 實際使用時在這裡呼叫:
            // window.game.renderInFlight(missionId);
        },
        onComplete: () => {
            console.log('起飛轉場完成');
        }
    });
}

/**
 * 範例 3: 降落轉場 (Flight → Destination)
 * 整合到 FlightEngine.finishGame()
 */
export async function exampleLandingTransition(canvas, success) {
    const transition = new SceneTransition(canvas);

    // 根據成功/失敗使用不同顏色
    const skyColor = success ? '#87CEEB' : '#696969';
    const groundColor = success ? '#228B22' : '#8B4513';

    await transition.landing({
        duration: 1500,
        skyColor,
        groundColor,
        onHalfway: () => {
            console.log('降落中點');
        },
        onComplete: () => {
            console.log('降落轉場完成');
            // 顯示結算畫面
            // window.game.renderResults(missionId);
        }
    });
}

/**
 * 範例 4: 擦除轉場 (任務板 → 機庫)
 */
export async function exampleWipeTransition(canvas) {
    const transition = new SceneTransition(canvas);

    // 從左到右的擦除效果
    await transition.wipeHorizontal('right', 800, {
        color: '#1A1A2E',
        onComplete: () => {
            console.log('擦除轉場完成');
        }
    });
}

/**
 * 範例 5: 圓形擴散 (對話框進入/退出)
 */
export async function exampleCircleWipe(canvas, entering = true) {
    const transition = new SceneTransition(canvas);

    await transition.circleWipe(entering ? 'in' : 'out', 600, {
        color: '#000000',
        centerX: canvas.width / 2,
        centerY: canvas.height / 2,
        onComplete: () => {
            console.log(`圓形${entering ? '收縮' : '擴散'}轉場完成`);
        }
    });
}

/**
 * 範例 6: 轉場序列組合
 */
export async function exampleSequence(canvas) {
    const transition = new SceneTransition(canvas);

    // 連續執行多個轉場
    await transition.sequence([
        () => transition.fadeOut(300, { color: '#FFFFFF' }),
        () => new Promise(resolve => setTimeout(resolve, 200)), // 暫停 200ms
        () => transition.wipeHorizontal('right', 500),
        () => transition.fadeIn(300)
    ]);

    console.log('轉場序列完成');
}

/**
 * 範例 7: 整合到現有 LaunchScreen
 * 在 launch.js 中的 triggerTakeoff() 方法修改如下:
 */
export function integrateToLaunchScreen() {
    /*
    // 在 LaunchScreen class 開頭 import:
    import { SceneTransition } from '../game/scene-transition.js';
    import { CONFIG } from '../config.js';

    // 在 constructor 中初始化:
    this.transition = null;

    // 修改 triggerTakeoff() 方法:
    async triggerTakeoff() {
        this.isLaunching = true;

        // 停止引擎聲音
        audioManager.stopEngine();

        // 初始化轉場系統
        const canvas = document.getElementById('launch-canvas');
        this.transition = new SceneTransition(canvas);

        // 取得角色顏色配置
        const mission = gameState.activeMissions.find(m => m.id === this.missionId);
        const char = gameState.getCharacter(mission.assignedCharId);
        const colors = CONFIG.TRANSFORMATION_COLORS[char.id] || CONFIG.TRANSFORMATION_COLORS.jett;

        // 執行起飛轉場
        await this.transition.takeoff({
            duration: 1500,
            color: colors.background,
            accentColor: colors.lines,
            glowColor: colors.glow,
            onHalfway: () => {
                // 在轉場中點切換到飛行畫面
                window.game.renderInFlight(this.missionId);
            }
        });
    }
    */
}

/**
 * 範例 8: 整合到 FlightEngine
 * 在 flight-engine.js 中的 finishGame() 方法修改如下:
 */
export function integrateToFlightEngine() {
    /*
    // 在 FlightEngine class 開頭 import:
    import { SceneTransition } from './scene-transition.js';

    // 在 constructor 中初始化:
    this.transition = new SceneTransition(this.canvas);

    // 修改 finishGame() 方法:
    async finishGame(success) {
        if (!this.isRunning) return;
        this.isRunning = false;
        audioManager.stopEngine();

        // 計算最終分數
        if (success) {
            if (this.missionType === 'Sports') {
                this.score += Math.floor(this.timeLeft * 10);
            }
        } else {
            this.score = Math.floor(this.score / 2);
        }

        // 執行降落轉場
        await this.transition.landing({
            duration: 1500,
            skyColor: success ? '#87CEEB' : '#696969',
            groundColor: success ? '#228B22' : '#8B4513',
            onComplete: () => {
                // 轉場完成後顯示結算畫面
                if (this.onComplete) {
                    this.onComplete({ score: this.score, success });
                }
            }
        });
    }
    */
}

/**
 * 範例 9: 主選單進場動畫
 */
export async function exampleMenuEntrance(canvas) {
    const transition = new SceneTransition(canvas);

    // 先淡出 Loading 畫面
    await transition.fadeOut(500, { color: '#1A1A2E' });

    // 圓形擴散顯示主選單
    await transition.circleWipe('out', 800, {
        color: '#1A1A2E',
        centerX: canvas.width / 2,
        centerY: canvas.height / 2
    });
}

/**
 * 範例 10: 緊急事件閃爍警告
 */
export async function exampleEmergencyFlash(canvas) {
    const transition = new SceneTransition(canvas);

    // 快速紅色閃爍 3 次
    for (let i = 0; i < 3; i++) {
        await transition.fadeOut(150, { color: '#FF0000' });
        await transition.fadeIn(150, { color: '#FF0000' });
    }
}

/**
 * 測試所有轉場效果
 */
export async function testAllTransitions(canvas) {
    const transition = new SceneTransition(canvas);

    console.log('開始測試所有轉場效果...');

    // 1. 淡出/淡入
    console.log('1. 測試淡出/淡入');
    await transition.fadeOut(500);
    await new Promise(resolve => setTimeout(resolve, 300));
    await transition.fadeIn(500);
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. 起飛轉場
    console.log('2. 測試起飛轉場');
    await transition.takeoff({
        duration: 1500,
        color: '#1A237E',
        accentColor: '#FFD700',
        glowColor: '#E31D2B'
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. 降落轉場
    console.log('3. 測試降落轉場');
    await transition.landing({
        duration: 1500
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. 水平擦除
    console.log('4. 測試水平擦除');
    await transition.wipeHorizontal('right', 800);
    transition.clear();
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. 垂直擦除
    console.log('5. 測試垂直擦除');
    await transition.wipeVertical('down', 800);
    transition.clear();
    await new Promise(resolve => setTimeout(resolve, 500));

    // 6. 圓形擴散
    console.log('6. 測試圓形擴散');
    await transition.circleWipe('out', 1000);
    transition.clear();

    console.log('所有轉場測試完成！');
}
