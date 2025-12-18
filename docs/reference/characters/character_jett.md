<!-- file: super_wings_jett.md -->
# Jett — Character Reference (Super Wings, LoRA Sheet)

## 0. Global Rendering Notes (apply to this character)
- **Overall look:** glossy toy-like CGI hard-surface
- **Face:** large expressive eyes integrated into the windshield/front face area
- **Default lighting:** bright daylight, clean reflections

---

## 1. Identity & Role (canonical)
- **Name:** Jett
- **Role:** Main delivery plane / main protagonist
- **Core job:** deliveries to children worldwide; calls other Super Wings when problems occur

---

## 2. Canon Visual Design Facts (from reference sources)
- **Aircraft type vibe:** small jet plane
- **Primary colors:** red + white
- **Eye color:** blue
- **Distinct detail:** four signaling lights (two on “cheeks,” two at wing edges)
- **Side marking:** stylized wing symbol on each side
- **Season variant notes:**
  - Season 3: adds a passenger seat for one person
  - Season 8 redesign: yellow lights replaced by blue; head-top detail changes (symbol present), plus blue energy lines

---

## 3. Vehicle Mode (geometry + silhouette)
### 3.1 Shape language
- Compact sporty jet proportions
- Friendly rounded nose; wings read as clean planar shapes
- “Cheek” light areas read as small rounded lamps on the front sides

### 3.2 Key recognition checklist (caption anchors)
- `small_red_white_jet`
- `blue_eyes`
- `four_signal_lights`
- `side_wing_symbol`

### 3.3 Approx color palette (dataset-friendly, not official)
- Red: ~#E31B23
- White: ~#F5F5F5
- Accent lights (S1–S7): yellow-ish glow
- Accent lights (S8 redesign): blue-ish glow

---

## 4. Robot Mode (mechanical read — inferred but consistent with the franchise)
> Use this as a consistent captioning “logic,” even if the exact rig differs per season.
- Torso: fuselage becomes chest
- Arms: deploy from side panels / mid-body seams
- Legs: deploy from underside; feet read like landing gear transformed into boots
- Wings: fold back as a backpack silhouette (or shoulder/back fins)

**Robot silhouette goal:** athletic, hero-proportioned, minimal bulky add-ons.

---

## 5. Materials & Shading (very explicit LoRA targets)
### 5.1 Body paint (red + white panels)
- Glossy clearcoat look
- Strong specular highlight streaks along curved panels
- Low micro-surface noise (keep it “toy clean”)

### 5.2 Trim + joints
- Trim plastics: semi-gloss
- Joint areas (hinges, seams): more matte than body panels

### 5.3 Windshield/eyes
- Smooth reflective surface
- Eyes are saturated, readable, and high-contrast against the face area

---

## 6. Expression & Pose Language
- Default emotion: confident, friendly, “can-do”
- Frequent poses:
  - forward-leaning “speed” posture
  - proud hero stance in robot_mode
  - open/cheerful facial expression

---

## 7. LoRA Tag Pack (recommended)
### 7.1 Identity tags
`super_wings_jett`, `jett`

### 7.2 Visual tags
`red_white_jet_plane`, `blue_eyes`, `signal_lights`, `wing_symbol`, `toy_like_cgi`, `glossy_paint`

### 7.3 Mode tags (mandatory)
`vehicle_mode` OR `robot_mode`

### 7.4 Action tags
`delivery`, `flying_fast`, `takeoff`, `landing`, `transforming`

### 7.5 Negative / avoid-confusion tags
- Avoid blending with other red characters: `not_flip`
- Avoid random real-world fighter jet detail creep: `no_realistic_weathering`, `no_military_markings`

---

## 8. Caption templates (copy/paste)
**Vehicle Mode**
super_wings_jett, vehicle_mode, red_white_jet_plane, blue_eyes, glossy_paint, flying_fast, bright_daylight, blue_sky

**Robot Mode**
super_wings_jett, robot_mode, red_white_armor_panels, wing_backpack, glossy_paint, hero_pose, smiling, bright_daylight
