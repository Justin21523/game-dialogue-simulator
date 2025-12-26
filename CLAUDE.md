# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language
You may communicate with the user in Chinese, but keep all code, comments, and documentation in English unless explicitly requested otherwise.

## Project Overview
Super Wings Simulator is a hybrid web game combining management/dispatch gameplay with an action flight mini-game.
The frontend uses Vite + React + TypeScript + Phaser 3, and the backend uses FastAPI to provide AI content/asset APIs.

## Dev Server
```bash
npm run dev
# Open the Vite URL shown in the terminal (default http://localhost:5173)
```

## Project Status
- **Phase 1–2**: ✅ Database + AI image generation system
- **Phase 3**: ✅ Core management gameplay (Hangar, Mission Board)
- **Phase 4**: ✅ Action gameplay (Launch sequence, flight loop, audio)
- **Phase 5**: ⏳ Visual polish + content expansion

## Architecture

### Frontend Entry
- `index.html` → `src/main.tsx`

### React (UI/state only)
- `src/ui/GameRoot.tsx`: useReducer + localStorage (resources/characters/missions/achievements/statistics)
- `src/ui/screens/*`: screens (Hangar, Mission Board, Results, etc.)

### Phaser (game loop)
- `src/game/phaser/scenes/*`: Launch/Flight/Arrival/Transformation/Landing/Exploration
- `src/game/phaser/systems/*`: Input/Background/Partner, etc.

## Key Mechanics
- **Launch**: hold Space to build RPM and launch.
- **Flight**: move with WASD and boost with Space; clouds slow you down; coins increase score.
- **Audio**: engine pitch changes with speed (pitch shift).

## Common Commands
- Generate assets: `python scripts/generate_assets.py --all`
- Count images: `find assets/images -name "*.png" | wc -l`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
