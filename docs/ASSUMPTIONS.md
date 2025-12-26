# Assumptions (Town World Upgrade)

This document records deterministic choices made when the requirements were ambiguous.

## Rendering / Art

- The repo contains many high-quality character renders, but not a complete tile set for a town.
  - For the MVP town, the world uses **procedurally generated textures** (Phaser `Graphics.generateTexture`) for tiles, props, doors, highlights, and simple VFX.
  - This keeps the upgrade playable without introducing new binary assets.

## Exploration Camera + Movement

- Exploration remains a **2D side-scrolling, mostly-horizontal** experience (not a platformer).
- The player can move left/right while walking.
- "Flight Mode" in exploration is a later-unlocked ability that enables vertical movement and hovering within the same side-scrolling view.

## Data-Driven World

- Locations, NPCs, dialogues, quests, interactables, and companions are described in `src/data/*.json`.
- Scenes do not contain quest-specific logic; they only:
  - Spawn entities from data
  - Emit interaction events
  - Apply generic transitions (doors/exits)

## Save / Persistence

- Progress persistence is LocalStorage-first:
  - Quest progress: `missionManagerState`
  - World state (flags, unlocked, last location): `sws:world:v2`
  - Companions (unlocked/selected): `sws:companions:v2`
- The in-game Save/Load screen exports/imports a single JSON that includes the above subsystems.

## Back-End APIs

- The backend is optional for the exploration vertical slice.
- When the backend is unavailable, the game must remain playable.

