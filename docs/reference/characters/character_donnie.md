<!-- file: super_wings_donnie.md -->
# Donnie — Character Reference (Super Wings, LoRA Sheet)

## 0. Global Rendering Notes (apply to this character)
- Glossy toy-like CGI hard-surface
- Clean paint, readable decals, bright lighting

---

## 1. Identity & Role (canonical)
- **Name:** Donnie
- **Role:** Engineer / inventor / builder on the team
- **Core function:** solves problems by building and repairing with tools

---

## 2. Canon Visual Design Facts (from reference sources)
- **Aircraft type:** Canadair-style airplane with a “big hull,” small wings, and propellers
- **Primary color:** mainly yellow
- **Eye color:** amber
- **Secondary color areas:** wing edges, motors/engine areas, parts of fore/legs, and “screen” are blue
- **Character behavior note:** skilled at inventing/repairing; also known for clumsiness (frequent stumbling/awkward landings)

---

## 3. Vehicle Mode (geometry + silhouette)
### 3.1 Shape language
- Bulky rounded body with a “work plane” vibe
- Propellers read as strong circular/rotor shapes at engine points
- The hull is the main mass; wings are relatively small

### 3.2 Approx color palette (dataset-friendly, not official)
- Yellow: ~#F2C300
- Blue accents: ~#1E5AA8
- White trim (if visible): ~#F5F5F5
- Eyes amber: warm orange-brown

---

## 4. Robot Mode (mechanical read — inferred but consistent)
- Torso: hull becomes chest/torso (stockier build than Jett)
- Arms: deploy from side panels near mid-body
- Legs: deploy from underside; feet read like transformed landing gear
- Propellers: may remain visible as silhouette features (back/shoulders/chest depending on rig)

**Robot silhouette goal:** sturdy “mechanic” proportions; slightly wider shoulders/torso.

---

## 5. Materials & Shading (LoRA targets)
- Yellow body paint: glossy clearcoat, strong highlight streaks
- Blue parts: semi-gloss plastic/painted trim
- Tool surfaces (if shown): slightly more metallic specular than body paint

---

## 6. Signature Gear / Abilities (canonical)
- Uses a tool kit described as a “Kit of Extra Cool Tools”
- Builds or repairs complex machines quickly during missions

---

## 7. Expression & Pose Language
- Friendly, focused “problem-solver” vibe
- Poses that read well for training:
  - holding a tool
  - leaning toward a broken object
  - “oops” clumsy stumble pose (distinctive personality cue)

---

## 8. LoRA Tag Pack (recommended)
### 8.1 Identity tags
`super_wings_donnie`, `donnie`

### 8.2 Visual tags
`yellow_canadair_plane`, `propeller_plane`, `amber_eyes`, `blue_accents`, `glossy_paint`, `toy_like_cgi`

### 8.3 Mode tags (mandatory)
`vehicle_mode` OR `robot_mode`

### 8.4 Action tags
`building`, `repairing`, `engineering`, `holding_tool`, `inventing`

### 8.5 Negative / avoid-confusion tags
- Avoid confusing with construction characters: `not_todd`
- Avoid over-realistic mechanical grime: `no_realistic_weathering`

---

## 9. Caption templates
**Vehicle Mode**
super_wings_donnie, vehicle_mode, yellow_canadair_plane, propeller_plane, amber_eyes, blue_accents, glossy_paint, bright_daylight

**Robot Mode**
super_wings_donnie, robot_mode, yellow_armor_panels, blue_trim, holding_tool, glossy_paint, mechanic_pose
