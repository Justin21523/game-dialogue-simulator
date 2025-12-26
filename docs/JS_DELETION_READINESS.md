# JS Deletion Readiness (Legacy `js/` folder)

This project now boots from `index.html` → `src/main.tsx` and the playable loop lives under `src/` (React UI + Phaser scenes).

## ✅ Safe for the new runtime

- The `src/` app does **not** import anything from `js/`.
- `npm run build` succeeds even when the `js/` folder is temporarily removed.

This means you can delete `js/` **without breaking the current Vite/React/Phaser build**.

## ⚠️ What still depends on `js/`

If you delete `js/`, these will break unless migrated/removed:

- Tests under `tests/` currently import `js/managers/mission-manager.js` and `js/models/quest.js`.
- Several docs still reference legacy file paths (docs-only, not runtime).

## Not yet migrated (feature gap)

The following systems have now been migrated into `src/` (TypeScript):

- Quest / mission manager stack → `src/shared/quests/*`
- Partner system scaffold → `src/game/phaser/systems/PartnerSystem.ts`
- Exploration (Phaser 2D/2.5D scaffold) → `src/game/phaser/scenes/ExplorationScene.ts` + `src/ui/screens/ExplorationScreen.tsx`

## Tests

- Legacy mission-manager tests now target the TS port via `dist-node/` (build with `npm run build:node`).

## Still optional / later

- Tutorial/theme/websocket/RAG helpers (migrate only if used by the new runtime)
