# Legacy JS → `src/` Migration Map

This repo is transitioning from the legacy Vanilla JS app under `js/` to the new stack:

- React (UI only)
- Phaser 3 (game loop/rendering)
- TypeScript (strict typing preferred)

React must not own per-frame entity state; Phaser scenes/systems do.

## Current Playable Loop (Migrated)

**Flow**

`MainMenu` → `Hangar` → `MissionBoard` → `LaunchScene` → `FlightScene` → `ArrivalScene` → `TransformationScene` → `LandingScene` → `Results` → back

**New entry**

- `index.html` → `src/main.tsx`

### UI Screens

- `js/ui/screens/main-menu.js` → `src/ui/screens/MainMenuScreen.tsx` ✅
- `js/ui/screens/hangar.js` → `src/ui/screens/HangarScreen.tsx` ✅
- `js/ui/screens/mission-board.js` → `src/ui/screens/MissionBoardScreen.tsx` ✅
- (New) Mission briefing (dialogue/narration/event) → `src/ui/screens/MissionBriefingScreen.tsx` ✅
- `js/ui/screens/results.js` → `src/ui/screens/ResultsScreen.tsx` ✅

### Game / Loop (Phaser)

- `js/game/flight-engine.js` → `src/game/phaser/scenes/FlightScene.ts` ✅ (core equivalents: spawn/collisions/score/parallax)
- `js/ui/screens/launch.js` → `src/game/phaser/scenes/LaunchScene.ts` ✅ (charge → liftoff → transition)
- `js/ui/screens/arrival.js` → `src/game/phaser/scenes/ArrivalScene.ts` ✅
- `js/ui/screens/transformation.js` → `src/game/phaser/scenes/TransformationScene.ts` ✅ (CanvasTexture port of legacy background/glow)
- `js/ui/screens/landing.js` → `src/game/phaser/scenes/LandingScene.ts` ✅ (manual landing + background lines; emits flight complete)

### State & Persistence

- `js/core/game-state.js` (resources/characters/missions) → `src/ui/GameRoot.tsx` (useReducer + localStorage) ✅
- `js/systems/statistics-tracker.js` → `src/shared/progress/statistics.ts` ✅
- `js/systems/achievement-system.js` → `src/shared/progress/achievements.ts` ✅
- `js/systems/save-manager.js` + `js/ui/screens/save-load.js` → `src/ui/screens/SaveLoadScreen.tsx` ✅
- `js/ui/screens/statistics.js` → `src/ui/screens/StatisticsScreen.tsx` ✅
- `js/ui/screens/achievements.js` → `src/ui/screens/AchievementsScreen.tsx` ✅

### Backend API Wiring (Key Parts)

- Mission board AI hint/recommend/event/export assets → `src/shared/api/missionBoardApi.ts` ✅
- AI generate missions → `src/shared/api/missionsApi.ts` ✅

## Next Targets (Planned / In Progress)

### Mission Sessions (Backend)

Legacy:
- `js/core/game-state.js` uses `/missions/start`, `/missions/advance`, `/missions/progress`, `/missions/{id}`

New (planned):
- `src/shared/api/missionSessionsApi.ts` (wrapper)
- `src/ui/GameRoot.tsx` ✅ (start session on dispatch; clean up on finish/abort)

### Audio

Legacy:
- `js/core/audio-manager.js` (WebAudio synth SFX/BGM)

New (planned):
- `src/shared/audio/audioManager.ts` ✅ (TS port)
- Phaser scenes call SFX hooks where appropriate ✅

### Additional Screens / Systems (Later)

These exist in legacy `js/` and are now available in `src/`:

- Quest / MissionManager → `src/shared/quests/*` ✅
- Partner system scaffold → `src/game/phaser/systems/PartnerSystem.ts` ✅
- Exploration (Phaser 2D/2.5D scaffold) → `src/game/phaser/scenes/ExplorationScene.ts` + `src/ui/screens/ExplorationScreen.tsx` ✅

Still evolving:

- Dialogues / narration (backend-generated) → `src/ui/screens/MissionStoryScreen.tsx` ✅ (extend as needed)
