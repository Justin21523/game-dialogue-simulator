# AI Development Guide - Super Wings Simulator

**For AI Assistants: Claude Code & Gemini CLI**

This document provides comprehensive context and guidelines for AI assistants to contribute to the Super Wings Simulator project.

---

## ⚠️ Note (2025-12)

The legacy `js/` frontend has been removed. The playable frontend now lives under:

- `src/` (React + TypeScript + Phaser 3)
- `index.html` boots `src/main.tsx`

Some older sections in this guide may still reference legacy file paths; treat them as historical and prefer `docs/LEGACY_TO_SRC_MIGRATION.md` as the source of truth for current mappings.

## 🎯 Project Context

### What is This Project?
A web-based simulation game based on the Super Wings animated series, where players:
- Manage and dispatch characters to complete missions worldwide
- Experience flight animations, transformations, and problem-solving sequences
- Manage resources (money, fuel, repair kits, boost packs)
- Unlock and upgrade characters

### Technology Stack
- **Frontend**: Vite + React + TypeScript + Phaser 3
- **Storage**: LocalStorage for save snapshots (React reducer)
- **Graphics**: Pre-generated images using SDXL LoRA models
- **Backend**: FastAPI (`backend/`) for AI content and mission APIs
- **Deployment**: Static hosting for `dist/` + optional backend service

### Project Status
- **Current Phase**: Playable React + Phaser loop in `src/`
- **Next**: Expand exploration/quest/partner systems and content depth

---

## 📁 Project Structure

```
~/web-projects/super-wings-simulator/
├── index.html                 # Game entry point
├── README.md                  # Project overview
├── docs/
│   ├── IMPLEMENTATION_PLAN.md # Complete 8-week implementation plan
│   └── AI_DEVELOPMENT_GUIDE.md # This file
├── css/
│   ├── main.css              # Global styles (to be created)
│   ├── components.css        # Reusable components (to be created)
│   ├── animations.css        # Animation effects (to be created)
│   └── screens/              # Screen-specific styles
├── src/                       # Frontend app (React + TS + Phaser)
│   ├── main.tsx              # React entry
│   ├── ui/                   # React screens/overlays
│   ├── game/phaser/          # Phaser scenes/entities/systems
│   └── shared/               # Shared logic (API, types, progress, quests)
├── backend/                   # FastAPI backend (/api/v1)
├── assets/images/             # Generated assets (Phase 2)
│   ├── characters/           # Character portraits/states/expressions
│   ├── backgrounds/          # World locations
│   └── ui/                   # UI icons and elements
├── data/                      # Game data files
│   ├── characters.json       # Character database (to be created)
│   ├── missions.json         # Mission definitions (to be created)
│   └── balancing.json        # Game balance parameters (to be created)
├── scripts/                   # Build/utility scripts
│   └── generate_assets.py   # Image generation script (to be created)
└── prompts/                   # Prompt templates for image generation
    └── game_assets/          # Asset-specific prompts (to be created)
```

---

## 🔑 Key Technical Details

### 1. Character System

**8 Trained Characters** (LoRA models available):
| ID | Name | Colors | Key Feature | Specialization |
|----|------|--------|-------------|----------------|
| jett | Jett | Red + White | Yellow propeller, 4 signal lights | Delivery |
| jerome | Jerome | Blue | Fighter jet style, yellow lightning | General |
| donnie | Donnie | Yellow + Blue | Tool expert, Canadair style | Construction |
| chase | Chase | Dark Blue | 3 red lightning stripes | Spy/Transform |
| flip | Flip | Red + White stripes | **Blue cap with yellow trim** ⭐ | Sports |
| todd | Todd | Brown | Yellow hard hat, drill nose | Digging |
| paul | Paul | Blue + White | Police markings, siren | Police |
| bello | Bello | Black + White stripes | Zebra/animal stripes | Animals |

**IMPORTANT**: Flip's blue cap is THE distinguishing feature from Jett (both are red).

**Character Attributes**:
- `level`: Character level (starts at 1)
- `experience`: XP gained from missions
- `stats.speed`: 1-10, affects mission duration
- `stats.reliability`: 70-100%, affects success rate
- `stats.specialization`: Mission type matching provides bonus

**Character States**:
- `available`: Ready for dispatch
- `on_mission`: Currently deployed
- `resting`: Recovering energy

### 2. Mission System

**Mission Types** (6 types):
1. `delivery` - Package delivery (Jett's specialty)
2. `rescue` - Emergency rescue
3. `sports` - Sports-related help (Flip's specialty)
4. `construction` - Building/repair (Donnie/Todd's specialty)
5. `police` - Law enforcement (Paul's specialty)
6. `animal_care` - Animal assistance (Bello's specialty)

**Mission Properties**:
- `difficulty`: 1-5 (affects rewards and requirements)
- `location`: World location (15+ locations planned)
- `duration`: Base mission time in minutes
- `requirements.minLevel`: Minimum character level
- `requirements.energyCost`: Energy consumed
- `rewards`: Experience, money, special unlocks

### 3. Resource System

**Resources** (managed globally):
- `money`: Currency for purchases (starts at 1000)
- `fuel`: Required for dispatch (starts at 100, auto-refills +1/min)
- `repairKits`: Restore character energy (starts at 5)
- `boostPacks`: Instantly complete mission (starts at 0)

**Max Values**:
- `fuel`: 100
- `repairKits`: 20
- `boostPacks`: 10

### 4. Game Flow

**Main Loop**:
```
Main Menu → Hangar (character selection)
         → Mission Board (choose mission)
         → Dispatch (assign character)
         → In-Flight Animation (flight sequence)
         → Results (rewards & XP)
         → Back to Hangar
```

**Flight Animation Sequence**:
1. Takeoff (2s) - Character leaves runway
2. Mid-flight (3s) - Flying through clouds
3. Arrival (2s) - Landing at destination
4. Transformation (1.5s) - Robot mode transformation
5. Working (2s) - Solving the problem
6. Celebration (1s) - Success animation

---

## 📋 Phase 1 Completed ✅

### All Tasks Done:
- [x] Flip color configuration fixed (red + white stripes, blue cap with yellow trim)
- [x] All 8 character_*.md files reviewed and copied to `docs/reference/characters/`
- [x] Unified character database created: `data/characters.json`
- [x] Human-readable guide created: `docs/CHARACTER_DATABASE.md`
- [x] Visual details extracted and verified for all 8 characters

## 📋 Current Phase 2 Tasks

### Pending ⏳
- [ ] Create prompt templates in `prompts/game_assets/`
- [ ] Create image generation script `scripts/generate_assets.py`
- [ ] Generate ~205 game asset images

---

## 🎨 Image Asset Generation (Phase 2)

### Assets Needed (~205 images total)

**A. Character Portraits** (8 characters × 8 variations = 64 images)
- front_view.png
- three_quarter_view.png
- side_profile.png
- portrait_closeup.png
- flying_pose.png
- standing_pose.png
- transformation.png
- icon.png (512×512)

**B. Character States** (8 × 6 = 48 images)
- idle.png
- in_flight.png
- landing.png
- celebrating.png
- working.png
- tired.png

**C. Character Expressions** (8 × 6 = 48 images)
- happy.png
- excited.png
- surprised.png
- confident.png
- focused.png
- friendly.png

**D. Backgrounds** (15 images)
- world_airport.png
- asian_city.png
- european_town.png
- african_savanna.png
- arctic.png
- tropical_island.png
- desert_oasis.png
- american_city.png
- rainforest.png
- australian_outback.png
- blue_sky.png
- sunset_sky.png
- night_sky.png
- runway.png
- hangar_interior.png

**E. UI Elements** (30+ images)
- Mission type icons (6)
- Resource icons (4)
- Buttons and interface elements
- Achievement icons
- Progress bar elements

### Generation Parameters
- **Base Model**: SDXL 1.0 (`sd_xl_base_1.0.safetensors`)
- **LoRA Path**: `/mnt/data/training/lora/super-wings/{character}_identity/{character}_epoch15.safetensors`
- **LoRA Weight**: 0.8-1.0
- **Resolution**: 1024×1024 (portraits), 1280×720 (backgrounds)
- **Sampler**: DPM++ 2M Karras or Euler A
- **Steps**: 30-40
- **CFG Scale**: 7.5-9.0
- **Format**: PNG → convert to WebP for optimization

### Negative Prompt (shared)
```
human, person, people, boy, girl, man, woman, child, humanoid,
human face, human body, realistic human,
multiple characters, two characters, group, crowd, duo,
extra eyes, three eyes, four eyes, multiple eyes, extra limbs,
wrong colors, incorrect colors, color swap, mismatched colors,
blurry, low quality, worst quality, bad quality, lowres,
distorted, deformed, disfigured, mutated, malformed,
ugly, amateur, draft, unfinished, bad anatomy, bad proportions,
jpeg artifacts, watermark, text, signature,
2d, anime style, cartoon illustration, painting, drawing,
photographic, photo, photograph, real life,
cropped, cut off, frame, border,
noise, grainy, chromatic aberration,
multiple views, character sheet, reference sheet
```

---

## 🧩 Code Architecture

### State Management Pattern
```javascript
// Centralized state in core/game-state.js
const GameState = {
  characters: Map<string, Character>,
  missions: Map<string, Mission>,
  resources: ResourceManager,
  activeMissions: Map<string, ActiveMissionData>,

  // Methods
  saveGame(): void,
  loadGame(): void,
  reset(): void
};
```

### Event System Pattern
```javascript
// Event bus for decoupled communication
EventBus.on('mission:started', (data) => { /* update UI */ });
EventBus.on('mission:completed', (data) => { /* show results */ });
EventBus.on('character:levelup', (data) => { /* celebration */ });
EventBus.emit('resource:changed', { resource: 'money', amount: 1500 });
```

### Screen Management Pattern
```javascript
// Each screen is a module with show/hide/update methods
const HangarScreen = {
  async show() {
    // Build UI, attach event listeners
  },
  hide() {
    // Clean up, remove listeners
  },
  update(state) {
    // Refresh display with new state
  }
};
```

---

## 🛠️ Development Workflow

### For Claude Code:
1. **Read Context First**: Always read relevant files before editing
2. **Use Type Safety**: Add JSDoc comments for type hints
3. **Test Incrementally**: Build features in small, testable chunks
4. **Follow Conventions**: Match existing code style
5. **Update Docs**: Keep this guide and IMPLEMENTATION_PLAN.md updated

### For Gemini CLI:
1. **Understand Project Structure**: Refer to this guide for file locations
2. **Check Existing Code**: Don't recreate what exists
3. **Validate Data**: Ensure JSON files have correct structure
4. **Report Issues**: If you find discrepancies, document them
5. **Ask Questions**: When unsure, clarify requirements

---

## 📚 Reference Resources

### Character Data Sources
- **Primary**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/docs/projects/super-wings/character/character_*.md`
- **Training Data**: `/mnt/data/datasets/general/super-wings/lora_data/characters/{character}/`
- **LoRA Models**: `/mnt/data/training/lora/super-wings/{character}_identity/`
- **Captions**: Check augmented/*.txt files for visual details

### Official References
- [Super Wings - Wikipedia](https://en.wikipedia.org/wiki/Super_Wings)
- [Super Wings Wiki - Characters](https://super-wings.fandom.com/wiki/Category:Characters)
- [Super Wings Wiki - Flip](https://super-wings.fandom.com/wiki/Flip)

### Project Documentation
- **Implementation Plan**: `~/web-projects/super-wings-simulator/docs/IMPLEMENTATION_PLAN.md`
- **Series Guide**: `/mnt/c/ai_projects/3d-animation-lora-pipeline/docs/projects/super-wings/super_wings_series.md`

---

## 🚨 Common Pitfalls to Avoid

### ❌ DO NOT:
1. **Mix character colors** - Flip is RED with blue cap, NOT green
2. **Include human characters** - This is about transforming robot planes
3. **Generate multiple characters** - One character per image
4. **Add extra eyes** - Characters have EXACTLY two blue eyes
5. **Use outdated configs** - Always verify character data is current
6. **Create duplicate files** - Edit existing files, don't create new versions
7. **Skip Phase 1** - Character data MUST be correct before generating images

### ✅ DO:
1. **Verify character colors** from official docs before generating
2. **Use EXACT LoRA paths** - `/mnt/data/training/lora/super-wings/{character}_identity/{character}_epoch15.safetensors`
3. **Include negative prompts** - Prevent common SDXL issues
4. **Test with single character** first before batch generation
5. **Organize outputs** properly in assets/images/ structure
6. **Document all changes** - Update relevant docs
7. **Follow the 8-week plan** - Don't skip phases

---

## 🎯 Current Priorities (Phase 2)

### Immediate Tasks
1. **Create Prompt Templates** (`prompts/game_assets/`)
   - `character_portraits.json` - 8 pose variations
   - `character_states.json` - 6 state variations
   - `character_expressions.json` - 6 expression variations
   - `backgrounds.json` - 15 world locations
   - `shared_settings.json` - negative prompts, parameters

2. **Create Generation Script** (`scripts/generate_assets.py`)
   - Load character data from `data/characters.json`
   - Load prompt templates
   - Generate images using SDXL + LoRA
   - Organize outputs to `assets/images/`

3. **Test Generation**
   - Start with 1-2 characters (Jett, Flip)
   - Verify colors are correct
   - Adjust LoRA weights if needed

### Phase 2 Deliverables
- ~205 high-quality game asset images
- Organized in `assets/images/characters/`, `assets/images/backgrounds/`, `assets/images/ui/`
- Metadata JSON for each character

---

## 🔄 Update Protocol

When you make significant changes:

1. **Update this guide** if you add new systems or change architecture
2. **Update IMPLEMENTATION_PLAN.md** if you deviate from the plan or complete phases
3. **Update README.md** to reflect current project status
4. **Document in comments** - Add clear JSDoc comments to all functions

---

## 💬 Communication Guidelines

### When Reporting Status:
```markdown
## Phase 1 Progress Update

**Completed**:
- [x] Task 1 description
- [x] Task 2 description

**In Progress**:
- [ ] Task 3 description (50% complete)

**Blocked**:
- [ ] Task 4 description (waiting for X)

**Next Steps**:
1. Action 1
2. Action 2
```

### When Asking for Clarification:
- Specify which file/section you're working on
- Quote relevant code or docs
- Propose options and ask for preference
- Include line numbers for code references

---

## 🎓 Learning Resources

### JavaScript ES6+ Features Used:
- Classes (for Character, Mission, ResourceManager)
- Arrow functions
- Template literals
- Destructuring
- Async/await (for animations)
- Modules (import/export)
- Map/Set collections

### CSS Features:
- CSS Grid (for layouts)
- Flexbox (for components)
- CSS Variables (for theming)
- CSS Animations (@keyframes)
- Media Queries (responsive design)

---

## 📝 Example: Creating a New Feature

```javascript
// 1. Define in data/ first
// data/missions.json
{
  "missions": [
    {
      "id": "delivery_asia_01",
      "title": "送玩具到東京",
      "type": "delivery",
      // ... rest of properties
    }
  ]
}

// 2. Create model if needed
// js/models/mission.js
class Mission {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    // ... initialize properties
  }

  isEligible(character) {
    // Logic to check if character can take mission
  }
}

// 3. Add to game state
// js/core/game-state.js
loadMissions() {
  fetch('./data/missions.json')
    .then(r => r.json())
    .then(data => {
      data.missions.forEach(m => {
        this.missions.set(m.id, new Mission(m));
      });
    });
}

// 4. Create UI component
// js/ui/screens/mission-board.js
function renderMissionCard(mission) {
  const card = document.createElement('div');
  card.className = 'mission-card';
  card.innerHTML = `
    <h3>${mission.title}</h3>
    <p>${mission.description}</p>
    <button onclick="selectMission('${mission.id}')">選擇</button>
  `;
  return card;
}

// 5. Add styles
// css/components.css
.mission-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
```

---

## ✨ Success Criteria

### Phase 1 ✅ COMPLETED (2025-12-16):
- ✅ All 8 characters have correct, verified data in `data/characters.json`
- ✅ Character database doc exists: `docs/CHARACTER_DATABASE.md`
- ✅ All color configurations fixed (especially Flip's blue cap)
- ✅ No discrepancies between character docs and configs

### Phase 2 Complete When:
- ✅ At least 200 high-quality images generated
- ✅ All character colors correct in images
- ✅ Images organized in proper directory structure
- ✅ Validation report shows 0 critical issues

### Final Project Complete When:
- ✅ Game playable from start to finish
- ✅ All 8 characters functional
- ✅ At least 30 missions available
- ✅ Saves/loads work correctly
- ✅ Responsive on desktop/tablet/mobile
- ✅ Deployed to GitHub Pages

---

## 🆘 Need Help?

### Debug Checklist:
1. Check browser console for errors
2. Verify file paths are correct
3. Ensure JSON is valid (use JSONLint)
4. Check network tab for failed requests
5. Validate data types match expectations

### Common Issues:
- **Images not loading**: Check path in assets/images/
- **JSON parse error**: Validate JSON syntax
- **State not updating**: Check if EventBus is emitting
- **Animation not working**: Verify CSS class names match
- **LocalStorage full**: Clear browser storage

---

**This guide will be updated as the project evolves. Last updated: 2025-12-16 (Phase 1 completed)**
