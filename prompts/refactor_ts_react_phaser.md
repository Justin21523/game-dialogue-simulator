# Vanilla JS → TypeScript + React + Phaser 3 Refactor Prompt

## Conversion Strategy (Non-Negotiable)

- Game logic ≠ React
- React only handles UI / state / Phaser lifecycle (mount/unmount)
- Phaser owns the game loop and lives entirely in the canvas

## Target Frontend Structure (Backend Unchanged)

```txt
src/
├─ game/
│  ├─ phaser/
│  │  ├─ scenes/
│  │  │  ├─ BootScene.ts
│  │  │  ├─ BattleScene.ts
│  │  │  └─ UIScene.ts
│  │  ├─ entities/
│  │  │  ├─ Player.ts
│  │  │  ├─ AIEnemy.ts
│  │  └─ systems/
│  │     ├─ AISystem.ts
│  │     ├─ PhysicsSystem.ts
│  │     └─ InputSystem.ts
│  │
│  └─ config/
│     └─ phaserConfig.ts
│
├─ ui/
│  ├─ GameRoot.tsx
│  ├─ GameHUD.tsx
│  └─ DebugPanel.tsx
│
├─ shared/
│  ├─ types/
│  │  ├─ AI.ts
│  │  ├─ Entity.ts
│  │  └─ Scene.ts
│  └─ constants.ts
│
├─ main.tsx
└─ vite-env.d.ts
```

## Master Prompt (Paste Into Codex)

```md
### Code Refactor Master Prompt (Vanilla JS → TypeScript + React + Phaser 3)

You are acting as a **senior game engineer and refactoring specialist**.

I have an existing **Vanilla JavaScript game project** (browser-based) with working gameplay logic.
Your task is to **refactor the entire codebase** under the following strict rules.

---

## 🎯 Core Goals

1. **Preserve 100% of existing behavior**

   * No gameplay logic may be removed
   * No AI behavior may be simplified
   * No timing, physics, or decision logic may be altered unless explicitly required by Phaser

2. **Refactor to modern stack**

   * TypeScript (strict typing preferred)
   * React + TSX for UI and lifecycle control
   * Phaser 3 for all game rendering and game loop

3. **No feature regression**

   * If behavior changes are unavoidable, explain WHY and propose an equivalent solution

---

## 🧱 Architecture Rules (Mandatory)

### React

* React is ONLY responsible for:

  * Mounting / unmounting Phaser
  * UI overlays (HUD, debug panels, menus)
  * High-level game state (not per-frame logic)

* React MUST NOT:

  * Control player movement
  * Run game loops
  * Update Phaser objects every frame

### Phaser 3

* Phaser controls:

  * Game loop
  * Physics
  * AI updates
  * Entity lifecycle

* Game logic must live inside:

  * Scenes
  * Entity classes
  * Dedicated systems (AI, physics, input)

---

## 🧠 Refactor Strategy (Do Not Skip)

For each original JavaScript file:

1. **Explain what the file does**
2. **Identify pure logic vs side-effects**
3. **Map it to one of the following**

   * Phaser Scene
   * Phaser Entity class
   * Game System (AI / Physics / Input)
   * React UI component
4. Convert to TypeScript with:

   * Explicit interfaces
   * No `any` unless unavoidable (must justify)
5. Preserve method names and logic flow whenever possible

---

## 🧪 Debug & Stability Requirements

* Ensure:

  * No repeated Scene initialization
  * No duplicate event listeners
  * No entity recreation inside update loops
  * AI logic runs exactly once per frame

* Add lightweight debug logs ONLY where necessary to verify stability

---

## 📦 Output Requirements

* Provide:

  * Refactored file structure
  * Key TypeScript interfaces
  * Scene bootstrapping code
  * React mounting entry (`main.tsx`)
* Code must be production-safe and deterministic

---

## 🚨 Absolute Constraints

* DO NOT rewrite logic just to "look cleaner"
* DO NOT invent new game rules
* DO NOT collapse multiple systems into one
* DO NOT use external state managers unless required

If you are unsure about a decision:
→ Pause and explain trade-offs before coding.
```
