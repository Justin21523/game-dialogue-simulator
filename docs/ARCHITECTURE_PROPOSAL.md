# Architecture Proposal (Town World Upgrade)

This proposal extends the existing exploration MVP into a scalable, content-rich adventure without breaking the flight/landing pipeline.

## High-Level Rules

- React owns UI overlays + lifecycle only.
- Phaser owns simulation (movement, NPC updates, collisions, VFX).
- Quests and dialogues are data-driven; scenes do not hardcode quest steps.

## Proposed Directory Layout (Incremental)

```txt
src/
├─ game/phaser/
│  ├─ scenes/
│  │  ├─ BootScene.ts
│  │  ├─ ...flight scenes...
│  │  ├─ WorldScene.ts              # NEW: single data-driven location scene
│  │  └─ UIScene.ts
│  ├─ systems/
│  │  ├─ ParallaxSystem.ts          # NEW
│  │  ├─ NpcBehaviorSystem.ts       # NEW
│  │  ├─ InteractionHighlight.ts    # NEW
│  │  └─ SpeedLinesEffect.ts        # NEW
│  └─ config/phaserConfig.ts
├─ shared/
│  ├─ data/gameData.ts              # Loads `src/data/*.json`
│  ├─ systems/
│  │  ├─ worldStateManager.ts       # extended to v2
│  │  ├─ companionManager.ts        # extended to v2
│  │  └─ skillManager.ts            # NEW
│  ├─ quests/
│  │  ├─ missionManager.ts
│  │  ├─ questTemplateFactory.ts    # extended step types
│  │  └─ questRuntime.ts            # prerequisites + safe start
│  └─ types/
│     ├─ World.ts                   # extended schemas
│     ├─ Dialogue.ts                # conditional lines/choices
│     ├─ QuestTemplate.ts           # new step types
│     └─ Companion.ts               # categories/unlocks
└─ ui/
   ├─ DialogueBox.tsx               # conditional rendering
   ├─ QuestJournal.tsx              # NEW
   ├─ CompanionPanel.tsx            # tabs + search + unlocks
   └─ screens/ExplorationScreen.tsx # adds journal + skills button
```

## Scene / Location Model

- `WorldScene` renders any location by `locationId` from JSON.
- Locations define:
  - Parallax layers
  - Tiles (visual layer) and colliders (physics rectangles)
  - Props, doors, exits, secrets
  - NPC spawns and patrol routes

## State Flow (No Flicker)

- React switches between `flight` and `exploration`.
- Phaser restarts from `BootScene` when mode changes (no duplicate scene loops).
- `WorldScene` emits `EVENTS.LOCATION_CHANGED` + `EVENTS.LOCATION_ENTERED` to update overlays.

