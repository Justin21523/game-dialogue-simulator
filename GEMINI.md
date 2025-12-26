# Super Wings Simulator

## Project Overview

Super Wings Simulator is a hybrid web-based simulation game that combines a traditional resource management game with advanced AI-driven content generation. The project allows players to manage and dispatch Super Wings characters on global missions, featuring an interactive flight simulation mini-game.

### Key Features
*   **Simulation Gameplay:** Character dispatch, resource management (Fuel, Money), and global mission map.
*   **Action Gameplay:** 
    *   **Launch Sequence:** Interactive mini-game to rev up engines and launch.
    *   **Flight Simulation:** Canvas-based side-scrolling flight game with obstacles and collectibles.
*   **AI-Driven Content:** Dynamic generation of character portraits and backgrounds using SDXL LoRA via ComfyUI.
*   **Audio System:** Real-time synthesized sound effects using Web Audio API (Engine hum, coins, impacts).

## Architecture

### Frontend (Game Client)
*   **Tech:** Vite + React + TypeScript + Phaser 3.
*   **Runtime split:**
    *   React owns screens/overlays + persistence (`src/ui/`).
    *   Phaser owns the game loop/rendering/physics (`src/game/phaser/`).
    *   Shared logic/types/API clients live in `src/shared/`.
*   **Entry:** `index.html` → `src/main.tsx`.

### Backend (AI Pipeline)
*   **Tech:** Python 3.10+, FastAPI, ComfyUI.
*   **Role:** Offline asset generation (Images) and future dynamic narrative/voice.

## Key Files & Directories

*   `src/ui/GameRoot.tsx`: React root state + routing.
*   `src/game/phaser/scenes/*`: Launch/Flight/Arrival/Transformation/Landing/Exploration.
*   `src/shared/api/*`: Backend API wrappers.
*   `assets/images/`: Stores generated character and background assets.
*   `scripts/generate_assets.py`: Python script for batch generating AI assets.

## Gameplay Loop

1.  **Main Menu**: Start game.
2.  **Hangar**: View characters and fuel status.
3.  **Mission Board**: Select a mission and dispatch a character.
4.  **Launch Sequence**: Hold SPACE to rev engine and take off.
5.  **In-Flight**:
    *   Use **WASD** to move.
    *   Use **SPACE** to boost.
    *   Avoid **Storm Clouds** (Damage/Slow).
    *   Collect **Coins** (Bonus Score).
6.  **Results**: Receive Money and EXP rewards based on performance.

## Development Status
*   **Current Phase:** Phase 4 (Gameplay Depth) Complete.
*   **Next Steps:** Visual polish, integrating generated backgrounds, and character special abilities.
