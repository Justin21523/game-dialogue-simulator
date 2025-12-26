# Repo Analysis (Current Architecture)

## Entry Points

- `index.html` boots the React app.
- `src/main.tsx` mounts React and loads global CSS.
- `src/ui/GameRoot.tsx` is the main UI router/state container (screens + persistence).

## Phaser Mounting

- React mounts Phaser into `#phaser-container`.
- `src/ui/usePhaserGame.ts` manages a single Phaser instance and restarts scenes when switching modes:
  - `mode: "flight"` (mission flight pipeline)
  - `mode: "exploration"` (world exploration pipeline)
- Phaser config lives in `src/game/phaser/config/phaserConfig.ts`.

## Phaser Scene Structure

### Flight / Landing Pipeline (must remain functional)

Scenes are registered in `src/game/phaser/config/phaserConfig.ts`:

- `BootScene` → starts either flight or exploration based on `game.registry`
- Flight path:
  - `LaunchScene` → `FlightScene` → `ArrivalScene` → `TransformationScene` → `LandingScene`
- `LandingScene` emits `flight:complete` via `src/shared/flightEvents.ts` to notify React.

### Exploration (current)

- React overlay screen: `src/ui/screens/ExplorationScreen.tsx`
- Data-driven locations exist in `src/data/locations.json`
- The existing exploration implementation uses:
  - `BaseLocationScene` + `WarehouseLocationScene` (wrappers over a shared scene base)
  - `src/game/phaser/scenes/LocationScene.ts` (movement + NPCs + interactables + exits)

## Player Controller (Exploration)

- Implemented inside `src/game/phaser/scenes/LocationScene.ts`
  - Horizontal movement (A/D or ←/→)
  - `E` to interact (NPCs / objects / exits)
  - `C` toggles the companion panel (React overlay)

## UI Overlays (React)

- Mission Board / Hangar / Screens: `src/ui/screens/*`
- Exploration overlays:
  - `src/ui/DialogueBox.tsx` (dialogue UI)
  - `src/ui/QuestTracker.tsx` (active quest HUD)
  - `src/ui/CompanionPanel.tsx` (call companion UI)

## Quest + Persistence Systems

- Quest engine: `src/shared/quests/*`
  - `missionManager` persists to `missionManagerState`
- World flags + unlocked locations:
  - `src/shared/systems/worldStateManager.ts` persists to `sws:world:v1`
- Companions:
  - `src/shared/systems/companionManager.ts` persists to `sws:companions:v1`

