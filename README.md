# Game Dialogue Simulator (Web Game)

A browser-based simulation game inspired by the Super Wings animated series, using high-quality character art generated from SDXL LoRA models.

## Overview

- **Genre**: simulation + dispatch/management
- **Frontend**: Vite + React + TypeScript + Phaser 3
- **Backend**: FastAPI
- **Characters available**: 8 (Jett, Jerome, Donnie, Chase, Flip, Todd, Paul, Bello)

## Highlights

- **Dispatch system**: pick a character and send them on missions worldwide
- **Mission variety**: multiple mission types and locations
- **Resource management**: money, fuel, and items
- **Animation pipeline**: launch → flight → arrival → transformation → landing
- **Persistence**: LocalStorage save snapshot for quick resume

## Quick Start

### Frontend (Vite + React + TS + Phaser 3)

```bash
npm install
npm run dev
```

Open the Vite URL (default `http://localhost:5173`).

### Frontend build preview (static hosting)

```bash
npm run build
python3 -m http.server 8000 --directory dist
```

## Project Structure

```txt
super-wings-simulator/
├── index.html                  # App entry (boots React)
├── src/                        # Frontend (React + TS + Phaser 3)
│   ├── main.tsx                # React entry point
│   ├── ui/                     # React screens/overlays (no per-frame logic)
│   ├── game/phaser/            # Phaser scenes/systems (game loop)
│   └── shared/                 # Shared logic (API, save, progression, quests)
├── css/                        # Styles
│   ├── main.css                # Global styles / theme variables
│   ├── components.css          # Reusable UI components
│   ├── animations.css          # Shared animations
│   └── screens/                # Per-screen styles
├── backend/                    # FastAPI backend (`/api/v1`)
├── assets/images/              # Art assets
│   ├── characters/             # Character images and sequences
│   ├── backgrounds/            # Background art
│   └── ui/                     # UI art
├── data/                       # Game data (legacy + generators)
├── docs/                       # Project docs
├── scripts/                    # Helper scripts
└── prompts/                    # Prompt templates
```

## Gameplay Notes

### Character stats (concept)
- **Speed**: affects travel time
- **Reliability**: affects success rate
- **Specialization**: mission matching bonuses

### Mission types (examples)
- **Delivery**
- **Rescue**
- **Sports**
- **Construction**
- **Police**
- **Animal Care**

## License

This project is for learning and demonstration purposes. Super Wings-related character/IP rights belong to their respective owners.

## Status

In active development. Last updated: 2025-12-16
