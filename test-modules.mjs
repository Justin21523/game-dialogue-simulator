/**
 * 探索系統模組載入測試 (Node.js ESM)
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 模擬瀏覽器環境
global.window = global;
global.document = {
    createElement: () => ({
        className: '',
        innerHTML: '',
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        appendChild: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
};
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = { now: () => Date.now() };
global.Image = class { set src(v) {} };
global.Audio = class { play() {} pause() {} };
global.AudioContext = class {
    createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0 } }; }
    createGain() { return { connect: () => {}, gain: { value: 0 } }; }
    get destination() { return {}; }
};
global.WebSocket = class {};

// 模擬 axios
const axiosInstance = {
    get: async () => ({ data: {} }),
    post: async () => ({ data: {} }),
    put: async () => ({ data: {} }),
    delete: async () => ({ data: {} }),
    interceptors: {
        request: { use: () => {}, eject: () => {} },
        response: { use: () => {}, eject: () => {} }
    },
    defaults: { baseURL: '', headers: { common: {} } }
};
global.axios = {
    ...axiosInstance,
    create: () => ({ ...axiosInstance })
};

const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
};

async function testModule(name, path) {
    results.total++;
    try {
        const module = await import(path);
        results.passed++;
        results.details.push({ name, status: 'PASS', exports: Object.keys(module) });
        return module;
    } catch (error) {
        results.failed++;
        results.details.push({ name, status: 'FAIL', error: error.message });
        return null;
    }
}

async function runTests() {
    console.log('\\n🧪 探索系統模組測試\\n');
    console.log('='.repeat(60));

    // 核心依賴
    console.log('\\n📦 核心依賴');
    await testModule('event-bus', './js/core/event-bus.js');
    await testModule('config', './js/config.js');

    // 探索引擎
    console.log('\\n🎮 探索引擎');
    await testModule('exploration-physics', './js/game/exploration/exploration-physics.js');
    await testModule('camera', './js/game/exploration/camera.js');
    await testModule('input-handler', './js/game/exploration/input-handler-exploration.js');
    await testModule('world', './js/game/exploration/world.js');
    await testModule('renderer', './js/game/exploration/exploration-renderer.js');
    await testModule('scene-stack', './js/game/exploration/scene-stack.js');
    await testModule('interaction-system', './js/game/exploration/interaction-system.js');

    // 實體
    console.log('\\n👤 實體系統');
    await testModule('base-entity', './js/game/entities/base-entity.js');
    await testModule('player-character', './js/game/entities/player-character.js');
    await testModule('npc', './js/game/entities/npc.js');
    await testModule('collectible-item', './js/game/entities/collectible-item.js');
    await testModule('ability-blocker', './js/game/entities/ability-blocker.js');

    // 能力系統
    console.log('\\n⚡ 能力系統');
    await testModule('ability-definitions', './js/game/abilities/ability-definitions.js');
    await testModule('ability-effects', './js/game/abilities/ability-effects.js');
    await testModule('ability-system', './js/game/abilities/ability-system.js');

    // 系統
    console.log('\\n🔧 系統');
    await testModule('partner-system', './js/systems/partner-system.js');
    await testModule('mission-generator', './js/systems/exploration-mission-generator.js');

    // 模型
    console.log('\\n📋 模型');
    await testModule('exploration-mission', './js/models/exploration-mission.js');

    // UI 元件
    console.log('\\n🖼️ UI 元件');
    await testModule('mission-tracker', './js/ui/components/mission-tracker.js');
    await testModule('inventory-bar', './js/ui/components/inventory-bar.js');
    await testModule('partner-switcher', './js/ui/components/partner-switcher.js');
    await testModule('ability-bar', './js/ui/components/ability-bar.js');

    // UI 畫面
    console.log('\\n📺 UI 畫面');
    await testModule('exploration-dialogue', './js/ui/screens/exploration-dialogue.js');
    await testModule('exploration-results', './js/ui/screens/exploration-results.js');

    // UI 效果
    console.log('\\n✨ UI 效果');
    await testModule('partner-arrival', './js/ui/effects/partner-arrival.js');

    // 輸出結果
    console.log('\\n' + '='.repeat(60));
    console.log('\\n📊 測試結果\\n');

    for (const detail of results.details) {
        const icon = detail.status === 'PASS' ? '✅' : '❌';
        console.log(`${icon} ${detail.name}`);
        if (detail.status === 'PASS') {
            console.log(`   exports: ${detail.exports.join(', ')}`);
        } else {
            console.log(`   error: ${detail.error}`);
        }
    }

    console.log('\\n' + '='.repeat(60));
    console.log(`\\n總計: ${results.total} | 通過: ${results.passed} | 失敗: ${results.failed}`);
    console.log(`通過率: ${((results.passed / results.total) * 100).toFixed(1)}%\\n`);

    process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('測試執行錯誤:', err);
    process.exit(1);
});
