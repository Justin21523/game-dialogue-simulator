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
// shared store to simulate persistence across mode switches
const sharedStore = new Map();
global.localStorage = createLocalStorageStub(sharedStore);

const { missionManager } = await import('../dist-node/shared/quests/missionManager.js');
const { Quest, QuestStatus } = await import('../dist-node/shared/quests/quest.js');
const { ObjectiveType } = await import('../dist-node/shared/quests/objective.js');

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

  // Create a main quest + a sub quest
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

  // Partner completes an assigned objective
  missionManager.routeProgressEvent('PARTNER_SUMMONED', { partnerId: 'dizzy', actorId: 'dizzy' });
  assert.strictEqual(subQuest.objectives[0].status, 'completed', 'Partner should be able to complete assigned objectives');

  // Main branch: only explore_a is required; explore_b is optional
  missionManager.routeProgressEvent('NPC_INTERACTION', { npc: { npcId: 'npc_main' }, actorId: 'jett' });
  missionManager.routeProgressEvent('AREA_EXPLORED', { area: 'zone_a', actorId: 'jett' });
  assert.strictEqual(mainQuest.objectives.find(o => o.id === 'explore_a').status, 'completed', 'Main objective A should complete');
  assert.strictEqual(mainQuest.status, QuestStatus.COMPLETED, 'Main quest should complete (B is optional)');

  // Simulate a mode switch: re-initialize and load from shared localStorage
  await simulateModeSwitch();
  const loadedMain = missionManager.getQuest('main_branch');
  const loadedSub = missionManager.getQuest('sub_partner');
  assert.strictEqual(loadedMain?.status, QuestStatus.COMPLETED, 'Main quest status should persist across mode switch');
  assert.strictEqual(loadedSub?.objectives[0].status, 'completed', 'Sub quest progress should persist across mode switch');

  // Ensure stateLog includes objective_update entries
  const hasLog = (missionManager.stateLog || []).some((l) => l.type === 'objective_update');
  assert.ok(hasLog, 'State log should include objective_update entries');

  console.log('✅ mission-manager-mode.test.mjs passed');
}

run().catch((err) => {
  console.error('❌ mission-manager-mode.test.mjs failed', err);
  process.exit(1);
});
