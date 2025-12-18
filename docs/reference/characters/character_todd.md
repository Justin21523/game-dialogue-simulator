<!-- file: super_wings_todd.md -->
# Todd — Character Reference (Super Wings, LoRA Sheet)

## 0. Global Rendering Notes
- Toy-like CGI hard-surface
- Construction theme: bold shapes, clean “work vehicle” identity

---

## 1. Identity & Role (canonical)
- **Name:** Todd
- **Role:** Construction / digging specialist
- **Core function:** underground digging, drilling, pulling objects up

---

## 2. Canon Visual Design Facts (from reference sources)
- **Base color:** brown
- **Signature feature:** drill on the nose
- **Accessory:** yellow hard hat
- **Eye color:** green (noted as smaller than other Super Wings)
- **Personality cue:** loves digging (ground, dirt, mud)
- **Ability note:** nose can transform into different tools (drill, screwdriver, etc.)

---

## 3. Vehicle Mode (geometry + silhouette)
### 3.1 Shape language
- Front drill = absolute primary ID anchor
- Hard hat shape should read clearly (a helmet/hat silhouette on top)
- Stocky construction vibe (even in vehicle_mode)

### 3.2 Approx color palette (dataset-friendly, not official)
- Brown: ~#7A4A2A
- Yellow hard hat + drill accents: ~#F2C300
- Tool metal (if rendered metallic): ~#9CA3AF
- Eyes green: ~#2FBF6B (approx)

---

## 4. Robot Mode (mechanical read — inferred)
- Drill may remain as a chest/front tool feature or stay at the “nose” area depending on rig
- Arms/legs deploy from side/underside as standard
- Silhouette goal: “construction worker robot” (sturdy, grounded)

---

## 5. Materials & Shading (LoRA targets)
- Brown paint: glossy clearcoat but slightly more muted than hero-red
- Drill/tool surfaces:
  - can be painted metal or glossy plastic
  - avoid gritty scratches unless you want a “used tool” variant
- Hard hat: semi-gloss plastic (distinct from body paint)

---

## 6. Abilities & Props (canonical)
- Transforming-tool nose (drill/screwdriver/etc.)
- Digging-focused missions (underground emergence shots are very “Todd”)

---

## 7. Expression & Pose Language
- Enthusiastic “let’s dig!” vibe
- Great training poses:
  - emerging from ground
  - drilling forward
  - covered-in-mud scenario (ONLY include if you want that texture variant)

---

## 8. LoRA Tag Pack
### 8.1 Identity tags
`super_wings_todd`, `todd`

### 8.2 Visual tags
`brown_construction_plane`, `nose_drill`, `yellow_hard_hat`, `green_eyes`, `toy_like_cgi`, `glossy_paint`

### 8.3 Mode tags
`vehicle_mode` OR `robot_mode`

### 8.4 Action tags
`digging`, `drilling`, `underground`, `construction_helper`

### 8.5 Negative / avoid-confusion tags
- Don’t let drills appear on other characters: `drill_only_on_todd`
- Avoid confusing with Donnie builder vibe: `not_donnie`

---

## 9. Caption templates
**Vehicle Mode**
super_wings_todd, vehicle_mode, brown_construction_plane, nose_drill, yellow_hard_hat, green_eyes, glossy_paint

**Robot Mode**
super_wings_todd, robot_mode, construction_theme, nose_drill, yellow_hard_hat, digging_pose, glossy_paint
