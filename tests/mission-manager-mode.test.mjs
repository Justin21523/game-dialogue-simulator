import assert from 'assert';

// Shared in-memory localStorage stub
function createLocalStorageStub(store = new Map()) {
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    _store: store,
  };
}

// axios stub
function createAxiosStub() {
  const instance = {
    defaults: { baseURL: '', headers: { common: {} } },
    interceptors: { response: { use: () => {} } },
    get: async () => ({ status: 200, data: {} }),
    post: async () => ({ status: 200, data: {} }),
    delete: async () => ({ status: 200, data: {} }),
  };
  return {
    create: () => instance,
  };
}

// shared store to simulate persistence across mode switches
const sharedStore = new Map();
global.localStorage = createLocalStorageStub(sharedStore);
global.axios = createAxiosStub();

const { missionManager } = await import('../js/managers/mission-manager.js');
const { Quest, QuestStatus, ObjectiveType } = await import('../js/models/quest.js');

function resetManager() {
  missionManager.initialized = false;
  missionManager.quests.clear();
  missionManager.records.clear();
  missionManager.offered = new Set();
  missionManager.activeMain = null;
  missionManager.activeSubs = new Set();
  missionManager.completed = new Set();
  missionManager.abandoned = new Set();
  missionManager.stateLog = [];
}

async function simulateModeSwitch() {
  resetManager();
  await missionManager.initialize({ mainCharacter: 'jett' });
}

async function run() {
  await simulateModeSwitch();

  // 建立主線 + 支線
  const mainQuest = new Quest({
    questId: 'main_branch',
    title: 'Multi-mode Mainline',
    description: 'Pick any branch to finish',
    type: 'main',
    relatedNPCs: ['npc_main'],
    objectives: [
      { id: 'talk_npc', type: ObjectiveType.TALK, title: 'Talk to main NPC', requiredCount: 1, conditions: [{ npc_id: 'npc_main' }] },
      { id: 'explore_a', type: ObjectiveType.EXPLORE, title: 'Explore zone A', requiredCount: 1, optional: false, conditions: [{ area: 'zone_a' }] },
      { id: 'explore_b', type: ObjectiveType.EXPLORE, title: 'Explore zone B', requiredCount: 1, optional: true, conditions: [{ area: 'zone_b' }] },
    ],
  });
  missionManager.offerQuest(mainQuest, { type: 'main' });
  await missionManager.acceptQuest(mainQuest.questId, { type: 'main', actorId: 'jett' });

  const subQuest = new Quest({
    questId: 'sub_partner',
    title: 'Partner Assist',
    description: 'Done by partner',
    type: 'sub',
    relatedNPCs: ['npc_side'],
    objectives: [
      { id: 'assist_call', type: ObjectiveType.ASSIST, title: 'Summon partner', requiredCount: 1, assignedCharacter: 'dizzy', conditions: [{ partner_id: 'dizzy' }] },
    ],
  });
  missionManager.offerQuest(subQuest, { type: 'sub' });
  await missionManager.acceptQuest(subQuest.questId, { type: 'sub', actorId: 'jett' });

  // 夥伴完成 assigned objective
  missionManager.routeProgressEvent('PARTNER_SUMMONED', { partnerId: 'dizzy', actorId: 'dizzy' });
  assert.strictEqual(subQuest.objectives[0].status, 'completed', '夥伴應能完成指派目標');

  // 主線分支：只完成 explore_a，explore_b 為可選
  missionManager.routeProgressEvent('NPC_INTERACTION', { npc: { npcId: 'npc_main' }, actorId: 'jett' });
  missionManager.routeProgressEvent('AREA_EXPLORED', { area: 'zone_a', actorId: 'jett' });
  assert.strictEqual(mainQuest.objectives.find(o => o.id === 'explore_a').status, 'completed', '主線 A 應完成');
  assert.strictEqual(mainQuest.status, QuestStatus.COMPLETED, '主線應完成（B 是 optional）');

  // 模擬模式切換：重新初始化並從 shared localStorage 載入
  await simulateModeSwitch();
  const loadedMain = missionManager.getQuest('main_branch');
  const loadedSub = missionManager.getQuest('sub_partner');
  assert.strictEqual(loadedMain?.status, QuestStatus.COMPLETED, '模式切換後主線狀態應保留完成');
  assert.strictEqual(loadedSub?.objectives[0].status, 'completed', '模式切換後支線進度應保留');

  // 確認 stateLog 中有 objective_update 記錄
  const hasLog = (missionManager.stateLog || []).some((l) => l.type === 'objective_update');
  assert.ok(hasLog, '狀態流應包含 objective_update');

  console.log('✅ mission-manager-mode.test.mjs 通過');
}

run().catch((err) => {
  console.error('❌ mission-manager-mode.test.mjs 失敗', err);
  process.exit(1);
});
