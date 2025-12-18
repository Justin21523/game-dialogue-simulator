<!-- file: super_wings_jerome.md -->
# Jerome — Character Reference (Super Wings, LoRA Sheet)

## 0. Global Rendering Notes
- Toy-like CGI hard-surface
- Sleek “stunt/show” vibe: clean sharp decals, confident posing

---

## 1. Identity & Role (canonical)
- **Name:** Jerome
- **Role:** Stunt flyer / performer; known for dancing and showing off style
- **Core function:** stunt flying + performance energy in helper missions

---

## 2. Canon Visual Design Facts (from reference sources)
- **Aircraft type vibe:** blue war jet plane
- **Eye color:** green
- **Decorations:** yellow decorations with stylized lightning bolts on ailerons
- **Face cue:** smiles often
- **Nose:** pointed fore (jet-like)
- **Season variant note:** in Season 7 “Super Charge,” gains new features and a new lightning antenna on his head
- **Personality note:** good at dancing (mentions liking “robot dance”); claims he has style/talent/timing/a great smile

---

## 3. Vehicle Mode (geometry + silhouette)
### 3.1 Shape language
- Sleek delta/war-jet read
- Lightning bolt decals are the main recognition marker
- Confident “show plane” posture (even in neutral pose)

### 3.2 Approx color palette (dataset-friendly, not official)
- Blue: ~#1F4FA3 (or deeper depending on season)
- Yellow decals: ~#F2C300
- Eyes green: ~#2FBF6B

---

## 4. Robot Mode (mechanical read — inferred)
- Slimmer, more agile silhouette than Donnie/Todd
- Wings fold into a clean “back fin” look
- Poses should emphasize performance:
  - dance pose
  - thumbs-up / showman stance
  - mid-stunt framing if you include action shots

---

## 5. Materials & Shading (LoRA targets)
- Blue glossy paint with bright specular highlights
- Yellow lightning decals: crisp, painted-on, sharp edges
- Super Charge variant (if included): ensure you tag it consistently (e.g., `super_charge_mode`)

---

## 6. Signature Abilities / Behavior (canonical flavor)
- Stunt flying
- Dancing / show-off performer energy
- Confident self-description (style, timing, smile)

---

## 7. LoRA Tag Pack
### 7.1 Identity tags
`super_wings_jerome`, `jerome`

### 7.2 Visual tags
`blue_jet_plane`, `green_eyes`, `yellow_lightning_decals`, `pointed_nose`, `toy_like_cgi`, `glossy_paint`

### 7.3 Mode tags
`vehicle_mode` OR `robot_mode`
(optional) `super_charge_mode` (Season 7 variant)

### 7.4 Action tags
`stunt_flying`, `dancing_pose`, `show_off`, `thumbs_up`

### 7.5 Negative / avoid-confusion tags
- Avoid mixing with Chase dark-spy vibe: `not_chase`
- Avoid adding police siren/badges: `not_paul`

---

## 8. Caption templates
**Vehicle Mode**
super_wings_jerome, vehicle_mode, blue_jet_plane, green_eyes, yellow_lightning_decals, glossy_paint, bright_daylight

**Robot Mode**
super_wings_jerome, robot_mode, dancing_pose, blue_armor_panels, yellow_lightning_decals, glossy_paint, confident_smile
