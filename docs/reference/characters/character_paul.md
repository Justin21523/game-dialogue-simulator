<!-- file: super_wings_paul.md -->
# Paul — Character Reference (Super Wings, LoRA Sheet)

## 0. Global Rendering Notes
- Toy-like CGI hard-surface
- Bright readable police-style colors; clean shiny panels

---

## 1. Identity & Role (canonical)
- **Name:** Paul
- **Role:** Police airplane officer; airport guard; traffic direction/support

---

## 2. Canon Visual Design Facts (from reference sources)
- **Color scheme:** blue + white (typical police vehicle colors)
- **Eyes:** blue, but often not very visible due to very large black iris
- **Eyebrows:** light blue-like eyebrows above eyes
- **Police hardware:** two lights on the body and a siren on the head
- **Symbol:** yellow sheriff star on each forearm

---

## 3. Vehicle Mode (geometry + silhouette)
### 3.1 Shape language
- “Police patrol aircraft” read: clean body, authoritative posture
- Siren on head is the strongest silhouette marker
- Sheriff star badges must be clear and symmetrical

### 3.2 Approx color palette (dataset-friendly, not official)
- Police blue: ~#1F4FA3
- White: ~#F5F5F5
- Siren lights: red/blue translucent look
- Sheriff star: ~#F4C300

---

## 4. Robot Mode (mechanical read — inferred)
- Torso becomes “uniform-like” chest read (police vibe)
- Arms deploy so forearm sheriff stars remain visible
- Head siren should remain visible in robot_mode as a key ID hook

---

## 5. Materials & Shading (LoRA targets)
- Blue/white glossy paint with strong highlights
- Siren: translucent plastic with internal glow possibility
- Badge stars: slightly more metallic specular than body paint (but still toy-clean)

---

## 6. Duties / Behavior (canonical flavor cues)
- Often vigilant / on guard
- Directs traffic and enforces rules (strict, protective vibe)

---

## 7. Expression & Pose Language
- “Officer” expressions: serious, focused, mildly stern
- Classic poses:
  - directing traffic (arm out)
  - standing guard
  - confident “authority stance” in robot_mode

---

## 8. LoRA Tag Pack
### 8.1 Identity tags
`super_wings_paul`, `paul`

### 8.2 Visual tags
`police_plane`, `blue_white_color_scheme`, `head_siren`, `sheriff_star_badge`, `large_black_iris`, `glossy_paint`, `toy_like_cgi`

### 8.3 Mode tags
`vehicle_mode` OR `robot_mode`

### 8.4 Action tags
`guarding_airport`, `directing_traffic`, `patrol`

### 8.5 Negative / avoid-confusion tags
- Avoid mixing with spy tech aesthetics: `not_chase`
- Avoid realistic police vehicle decals from real countries: `no_real_world_police_markings`

---

## 9. Caption templates
**Vehicle Mode**
super_wings_paul, vehicle_mode, police_plane, blue_white_color_scheme, head_siren, sheriff_star_badge, glossy_paint, bright_daylight

**Robot Mode**
super_wings_paul, robot_mode, police_plane, head_siren, sheriff_star_badge, directing_traffic, stern_expression, glossy_paint
