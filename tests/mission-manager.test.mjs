import assert from 'assert';

// Minimal in-memory localStorage stub for Node
function createLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

// Minimal axios stub to satisfy api-client imports
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

global.localStorage = createLocalStorageStub();
global.axios = createAxiosStub();

const { missionManager } = await import('../js/managers/mission-manager.js');
const { Quest, QuestStatus, ObjectiveType } = await import('../js/models/quest.js');

// Reset MissionManager internal state between runs (singleton)
function resetMissionManager() {
  missionManager.initialized = false;
  missionManager.quests.clear();
  missionManager.records.clear();
  missionManager.offered = new Set();
  missionManager.activeMain = null;
  missionManager.activeSubs = new Set();
  missionManager.completed = new Set();
  missionManager.abandoned = new Set();
}

async function run() {
  resetMissionManager();
  await missionManager.initialize({ mainCharacter: 'jett' });

  const quest = new Quest({
    questId: 'q_test',
    title: 'Test Quest',
    description: 'Talk to NPC to complete',
    type: 'main',
    relatedNPCs: ['npc1'],
    objectives: [
      {
        id: 'o_talk',
        type: ObjectiveType.TALK,
        title: '與 npc1 對話',
        requiredCount: 1,
        conditions: [{ npc_id: 'npc1' }],
      },
    ],
  });

  missionManager.offerQuest(quest, { type: 'main' });
  assert.strictEqual(quest.status, QuestStatus.OFFERED, '任務應為提供狀態');

  await missionManager.acceptQuest(quest.questId, { type: 'main', actorId: 'jett' });
  assert.strictEqual(quest.status, QuestStatus.ACTIVE, '接受後應為進行中');
  assert.strictEqual(missionManager.activeMain, quest.questId, '主線應設為此任務');

  // 模擬 NPC 對話完成目標
  missionManager.routeProgressEvent('NPC_INTERACTION', {
    npc: { npcId: 'npc1' },
    character: 'jett',
  });

  assert.strictEqual(quest.objectives[0].status, 'completed', '目標應標記完成');
  assert.strictEqual(quest.status, QuestStatus.COMPLETED, '任務應完成');
  assert.ok(missionManager.completed.has(quest.questId), '管理器應記錄完成');
  assert.strictEqual(missionManager.activeMain, null, '完成後主線應清空');

  // 驗證持久化
  const saved = JSON.parse(global.localStorage.getItem(missionManager.storageKey));
  assert.ok(saved.completed.includes(quest.questId), '完成任務應寫入存檔');

  console.log('✅ mission-manager.test.mjs 通過');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ mission-manager.test.mjs 失敗', err);
  process.exit(1);
});
