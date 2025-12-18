/**
 * 探索系統功能測試 - 實例化與互動測試
 */

// 模擬瀏覽器環境
global.window = global;
global.document = {
    createElement: (tag) => ({
        className: '',
        innerHTML: '',
        style: {},
        tagName: tag.toUpperCase(),
        classList: {
            add: function() {},
            remove: function() {},
            contains: () => false,
            toggle: function() {}
        },
        appendChild: function(child) { this.children = this.children || []; this.children.push(child); return child; },
        removeChild: function() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: function() {},
        removeEventListener: function() {},
        setAttribute: function() {},
        getAttribute: () => null,
        children: [],
        parentNode: null,
        remove: function() {}
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = { now: () => Date.now() };
global.Image = class {
    constructor() { this.onload = null; }
    set src(v) { setTimeout(() => this.onload && this.onload(), 10); }
};
global.Audio = class { play() { return Promise.resolve(); } pause() {} };
global.AudioContext = class {
    createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { setValueAtTime: () => {}, value: 0 } }; }
    createGain() { return { connect: () => {}, gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, value: 0 } }; }
    get destination() { return {}; }
    get currentTime() { return 0; }
};
global.fetch = async () => ({ ok: true, json: async () => ({}) });

console.log('\\n🧪 探索系統功能測試\\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

async function runTests() {
    // 載入模組
    const { eventBus } = await import('./js/core/event-bus.js');
    const { CONFIG } = await import('./js/config.js');
    const { ExplorationPhysics } = await import('./js/game/exploration/exploration-physics.js');
    const { Camera } = await import('./js/game/exploration/camera.js');
    const { ExplorationWorld } = await import('./js/game/exploration/world.js');
    const { InputHandlerExploration } = await import('./js/game/exploration/input-handler-exploration.js');
    const { InteractionSystem } = await import('./js/game/exploration/interaction-system.js');
    const { BaseEntity } = await import('./js/game/entities/base-entity.js');
    const { PlayerCharacter } = await import('./js/game/entities/player-character.js');
    const { NPC } = await import('./js/game/entities/npc.js');
    const { CollectibleItem, ItemFactory } = await import('./js/game/entities/collectible-item.js');
    const { AbilityBlocker, BlockerFactory } = await import('./js/game/entities/ability-blocker.js');
    const { ABILITY_DEFINITIONS, getCharacterForBlocker } = await import('./js/game/abilities/ability-definitions.js');
    const { AbilitySystem } = await import('./js/game/abilities/ability-system.js');
    const { AbilityEffects } = await import('./js/game/abilities/ability-effects.js');
    const { PartnerSystem } = await import('./js/systems/partner-system.js');
    const { ExplorationMission, SubTask } = await import('./js/models/exploration-mission.js');
    const { ExplorationMissionGenerator } = await import('./js/systems/exploration-mission-generator.js');

    console.log('\\n📦 核心系統測試\\n');

    // EventBus 測試
    test('EventBus: 訂閱與發送', () => {
        let received = null;
        eventBus.on('TEST', (data) => { received = data; });
        eventBus.emit('TEST', { value: 42 });
        if (received?.value !== 42) throw new Error('Event not received');
    });

    test('EventBus: 取消訂閱', () => {
        let count = 0;
        const handler = () => { count++; };
        eventBus.on('TEST2', handler);
        eventBus.emit('TEST2');
        eventBus.off('TEST2', handler);
        eventBus.emit('TEST2');
        if (count !== 1) throw new Error('Handler should only fire once');
    });

    console.log('\\n🎮 探索引擎測試\\n');

    // Physics 測試
    test('Physics: 重力應用', () => {
        const physics = new ExplorationPhysics();
        // 使用小 dt 避免穿過地面被重置，y=-200 確保不會碰到地面 (groundY=500)
        const entity = { x: 0, y: -200, vx: 0, vy: 0, isFlying: false, isActive: true, height: 100 };
        physics.update(entity, 0.016);  // 約 60fps 的一幀
        if (entity.vy <= 0) throw new Error('Gravity not applied');
    });

    test('Physics: 飛行模式無重力', () => {
        const physics = new ExplorationPhysics();
        const entity = { x: 0, y: 0, vx: 0, vy: 0, isFlying: true, isActive: true, height: 100 };
        physics.update(entity, 1);
        if (entity.vy !== 0) throw new Error('Flying should have no gravity');
    });

    // Camera 測試
    test('Camera: 建立與跟隨', () => {
        const camera = new Camera(1280, 720);
        const target = { x: 500, y: 300 };
        camera.follow(target);
        camera.update(0.1);
        if (camera.followTarget !== target) throw new Error('Camera not following');
    });

    test('Camera: 世界座標轉換', () => {
        const camera = new Camera(1280, 720);
        camera.x = 100;
        camera.y = 50;
        const screen = camera.worldToScreen(200, 100);
        if (screen.x !== 100 || screen.y !== 50) throw new Error('Coordinate conversion failed');
    });

    // World 測試
    test('World: 建立世界', () => {
        const world = new ExplorationWorld({ width: 1920, height: 1080 });
        if (!world) throw new Error('World creation failed');
    });

    console.log('\\n👤 實體測試\\n');

    // PlayerCharacter 測試
    test('PlayerCharacter: 建立 Jett', () => {
        const player = new PlayerCharacter('jett', { name: 'Jett', level: 5 });
        if (player.characterId !== 'jett') throw new Error('Wrong character ID');
        if (!Array.isArray(player.abilities)) throw new Error('No abilities array');
    });

    test('PlayerCharacter: 能力載入', () => {
        const player = new PlayerCharacter('donnie', { name: 'Donnie' });
        if (player.abilities.length === 0) throw new Error('Donnie should have abilities');
        const hasBuildBridge = player.abilities.some(a => a.id === 'build_bridge');
        if (!hasBuildBridge) throw new Error('Donnie should have build_bridge ability');
    });

    test('PlayerCharacter: 移動控制', () => {
        const player = new PlayerCharacter('jett', { name: 'Jett' });
        player.handleInput({ right: true, left: false, up: false, down: false });
        if (player.vx <= 0) throw new Error('Player should move right');
        if (!player.facingRight) throw new Error('Player should face right');
    });

    // NPC 測試
    test('NPC: 建立與對話', () => {
        const npc = new NPC('baker', {
            name: 'Pierre',
            x: 100, y: 200,
            dialogues: [{ id: 'start', text: 'Hello!', emotion: 'happy' }],
            quests: ['find_bread']
        });
        if (npc.name !== 'Pierre') throw new Error('Wrong NPC name');
        if (!npc.hasQuest('find_bread')) throw new Error('Quest not registered');
    });

    test('NPC: 互動狀態', () => {
        const npc = new NPC('test', { name: 'Test', x: 0, y: 0 });
        npc.startInteraction();
        if (!npc.isInteracting) throw new Error('Should be interacting');
        npc.endInteraction();
        if (npc.isInteracting) throw new Error('Should not be interacting');
    });

    // Item 測試
    test('ItemFactory: 建立金幣', () => {
        const coin = ItemFactory.create('coin', { x: 100, y: 100 });
        if (!coin) throw new Error('Coin creation failed');
        if (coin.itemId !== 'coin') throw new Error('Wrong item id');
        if (coin.category !== 'collectible') throw new Error('Wrong category');
    });

    test('ItemFactory: 建立包裹', () => {
        const pkg = ItemFactory.create('package', { x: 100, y: 100, name: 'Test Package' });
        if (!pkg) throw new Error('Package creation failed');
    });

    test('Item: 撿取轉換為物品欄格式', () => {
        const item = ItemFactory.create('gem', { x: 0, y: 0 });
        const invItem = item.toInventoryItem();
        if (!invItem.id || !invItem.name) throw new Error('Invalid inventory item');
    });

    // Blocker 測試
    test('BlockerFactory: 建立間隙障礙', () => {
        const blocker = BlockerFactory.create('gap_small', { x: 500, y: 400 });
        if (!blocker) throw new Error('Blocker creation failed');
        if (blocker.blockerType !== 'gap') throw new Error('Wrong blocker type');
    });

    test('Blocker: 需要正確角色', () => {
        const blocker = BlockerFactory.create('gap_small', { x: 0, y: 0 });
        const donnie = new PlayerCharacter('donnie', { name: 'Donnie' });
        const jett = new PlayerCharacter('jett', { name: 'Jett' });

        // Donnie 應該可以互動（有 build_bridge 能力）
        if (!blocker.canInteract(donnie)) throw new Error('Donnie should be able to interact');
        // Jett 不應該可以互動（沒有 build_bridge 能力）
        if (blocker.canInteract(jett)) throw new Error('Jett should NOT be able to interact');
    });

    console.log('\\n⚡ 能力系統測試\\n');

    // Ability Definitions 測試
    test('ABILITY_DEFINITIONS: 8 個角色都有定義', () => {
        const chars = ['jett', 'donnie', 'todd', 'chase', 'bello', 'paul', 'flip', 'jerome'];
        for (const char of chars) {
            if (!ABILITY_DEFINITIONS[char]) throw new Error(`Missing ${char}`);
            if (ABILITY_DEFINITIONS[char].length === 0) throw new Error(`${char} has no abilities`);
        }
    });

    test('getCharacterForBlocker: 間隙需要 Donnie', () => {
        const info = getCharacterForBlocker('gap');
        if (info?.requiredCharacter !== 'donnie') throw new Error('Gap should need Donnie');
    });

    test('getCharacterForBlocker: 軟地需要 Todd', () => {
        const info = getCharacterForBlocker('soft_ground');
        if (info?.requiredCharacter !== 'todd') throw new Error('Soft ground should need Todd');
    });

    // AbilitySystem 測試
    test('AbilitySystem: 建立系統', () => {
        const system = new AbilitySystem();
        if (!system) throw new Error('AbilitySystem creation failed');
    });

    test('AbilityEffects: 建立效果', () => {
        const effects = new AbilityEffects();
        if (!effects) throw new Error('AbilityEffects creation failed');
    });

    console.log('\\n📋 任務系統測試\\n');

    // Mission 測試
    test('ExplorationMission: 建立任務', () => {
        const mission = new ExplorationMission({
            id: 'test_mission',
            title: '測試任務',
            description: '這是測試',
            destination: 'paris',
            subTasks: [
                { id: 'task1', type: 'talk', title: '與 NPC 對話', targetId: 'npc1' },
                { id: 'task2', type: 'fetch', title: '取得物品', targetId: 'item1' }
            ]
        });
        if (mission.subTasks.length !== 2) throw new Error('Wrong subtask count');
    });

    test('ExplorationMission: 子任務完成追蹤', () => {
        const mission = new ExplorationMission({
            id: 'test',
            title: 'Test',
            subTasks: [
                { id: 'task1', type: 'talk', title: 'Talk' }
            ]
        });
        mission.recordNPCTalked('npc1');
        // 檢查記錄是否正確 (stats 物件內的 npcsInteracted)
        if (mission.stats.npcsInteracted !== 1) throw new Error('NPC interaction not recorded');
    });

    test('SubTask: 進度計算', () => {
        const task = new SubTask({
            id: 'collect',
            type: 'fetch',
            title: 'Collect 5 items',
            requiredCount: 5
        });
        task.currentCount = 3;
        const progress = task.getProgress();
        if (progress !== 0.6) throw new Error(`Wrong progress: ${progress}`);
    });

    // MissionGenerator 測試
    test('ExplorationMissionGenerator: 建立生成器', () => {
        const generator = new ExplorationMissionGenerator();
        if (!generator) throw new Error('Generator creation failed');
    });

    console.log('\\n🤝 夥伴系統測試\\n');

    // PartnerSystem 測試
    test('PartnerSystem: 建立系統', () => {
        const world = new ExplorationWorld({ width: 1920, height: 1080 });
        const system = new PartnerSystem(world);
        if (!system) throw new Error('PartnerSystem creation failed');
    });

    test('PartnerSystem: 設定當前玩家', () => {
        const world = new ExplorationWorld({ width: 1920, height: 1080 });
        const system = new PartnerSystem(world);
        const player = new PlayerCharacter('jett', { name: 'Jett' });
        system.setCurrentPlayer(player);
        if (system.currentPlayer !== player) throw new Error('Current player not set');
    });

    console.log('\\n🔄 互動系統測試\\n');

    // InteractionSystem 測試
    test('InteractionSystem: 建立系統', () => {
        const world = new ExplorationWorld({ width: 1920, height: 1080 });
        const system = new InteractionSystem(world);
        if (!system) throw new Error('InteractionSystem creation failed');
    });

    // 輸出結果
    console.log('\\n' + '='.repeat(60));
    console.log(`\\n📊 測試結果: ${passed} 通過, ${failed} 失敗`);
    console.log(`通過率: ${((passed / (passed + failed)) * 100).toFixed(1)}%\\n`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('\\n❌ 測試執行錯誤:', err);
    process.exit(1);
});
