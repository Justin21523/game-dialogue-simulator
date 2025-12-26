# QA Checklist (Exploration Vertical Slice)

## Run Commands

### Frontend

```bash
npm install
npm run dev
```

### Backend (optional)

```bash
uvicorn backend.main:app --reload --app-dir . --port 8001
```

## Acceptance Checklist

- Landing flow remains functional:
  - Launch → Flight → Arrival → Transformation → Landing → Exploration transition.
- Outdoor district feels alive:
  - 4-layer parallax visibly moves at different speeds.
  - At least 6 NPCs patrol/idle.
  - Props/signs/doors are present.
- Buildings:
  - At least 3 enterable buildings from the town outdoor scene.
  - Interiors have collisions, props, 2+ NPCs, and interactables.
- Quests:
  - 1 main quest chain + multiple side quests exist.
  - At least one step requires selecting a companion ability.
  - Quest journal shows active and completed quests.
- Secrets:
  - At least one hidden trigger is discoverable and grants a reward.
  - Secret state persists after reload.
- Save/load:
  - Reload restores last location, quest progress, unlocked secrets, unlocked companions.

