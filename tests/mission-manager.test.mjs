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

global.localStorage = createLocalStorageStub();

const { missionManager } = await import('../dist-node/shared/quests/missionManager.js');
const { Quest, QuestStatus } = await import('../dist-node/shared/quests/quest.js');
const { ObjectiveType } = await import('../dist-node/shared/quests/objective.js');

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
        title: 'Talk to npc1',
        requiredCount: 1,
        conditions: [{ npc_id: 'npc1' }],
      },
    ],
  });

  missionManager.offerQuest(quest, { type: 'main' });
  assert.strictEqual(quest.status, QuestStatus.OFFERED, 'Quest should be offered');

  await missionManager.acceptQuest(quest.questId, { type: 'main', actorId: 'jett' });
  assert.strictEqual(quest.status, QuestStatus.ACTIVE, 'Quest should be active after accept');
  assert.strictEqual(missionManager.activeMain, quest.questId, 'Active main quest should be set');

  // Simulate a dialogue completion event
  missionManager.routeProgressEvent('NPC_INTERACTION', {
    npc: { npcId: 'npc1' },
    character: 'jett',
  });

  assert.strictEqual(quest.objectives[0].status, 'completed', 'Objective should be completed');
  assert.strictEqual(quest.status, QuestStatus.COMPLETED, 'Quest should be completed');
  assert.ok(missionManager.completed.has(quest.questId), 'Manager should record quest completion');
  assert.strictEqual(missionManager.activeMain, null, 'Active main quest should be cleared after completion');

  // Verify persistence
  const saved = JSON.parse(global.localStorage.getItem(missionManager.storageKey));
  assert.ok(saved.completed.includes(quest.questId), 'Completed quest should be persisted');

  console.log('✅ mission-manager.test.mjs passed');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ mission-manager.test.mjs failed', err);
  process.exit(1);
});
