<!-- file: super_wings_flip.md -->
# Flip — Character Reference (Super Wings, LoRA Sheet)

## 0. Global Rendering Notes
- Toy-like CGI hard-surface
- Sporty styling: clean bright colors, energetic poses

---

## 1. Identity & Role (canonical)
- **Name:** Flip
- **Role:** Sports specialist; enthusiastic fan of Jett/Super Wings
- **Core function:** sports-themed help + motivation/advice during missions

---

## 2. Canon Visual Design Facts (from reference sources)
- **Base color:** red
- **Specialty:** sports
- **Accessory:** blue and yellow cap with a symbol shaped similar to Jett’s symbol
- **Story note:** first appearance in “The Bermuda Blunder” (two-part)
- **Behavior cues:** competitive/sportive attitude; gives sports advice

---

## 3. Vehicle Mode (geometry + silhouette)
### 3.1 Shape language
- Red sporty plane read (lighter “athlete” vibe)
- Cap is the critical ID hook — must remain readable in both modes if visible

### 3.2 Approx color palette (dataset-friendly, not official)
- Red: ~#E53935
- Cap blue: ~#1E5AA8
- Cap yellow: ~#F2C300
- White trim: ~#F5F5F5

---

## 4. Robot Mode (mechanical read — inferred)
- Cap should remain visible as a “hat/visor” silhouette element
- Athletic proportions: slightly leaner than Donnie/Todd
- Poses should read energetic: running, jumping, challenge stance

---

## 5. Materials & Shading (LoRA targets)
- Red glossy paint (clean, high specular)
- Cap: semi-gloss plastic with crisp color blocking
- Avoid gritty sweat/dirt realism unless intentionally training that style

---

## 6. Personality / Pose Language (canonical)
- Energetic, challenge-oriented, admires Jett
- Often tries to turn situations into “sports challenges”

---

## 7. LoRA Tag Pack
### 7.1 Identity tags
`super_wings_flip`, `flip`

### 7.2 Visual tags
`red_plane`, `sports_theme`, `blue_yellow_cap`, `cap_symbol`, `toy_like_cgi`, `glossy_paint`

### 7.3 Mode tags
`vehicle_mode` OR `robot_mode`

### 7.4 Action tags
`sports_pose`, `running`, `jumping`, `competitive`, `cheering`

### 7.5 Negative / avoid-confusion tags
- Critical: separate from Jett even though both are red: `not_jett`
- Avoid adding Jett’s cheek lights onto Flip: `no_jett_signal_lights`

---

## 8. Caption templates
**Vehicle Mode**
super_wings_flip, vehicle_mode, red_plane, sports_theme, blue_yellow_cap, glossy_paint, bright_daylight

**Robot Mode**
super_wings_flip, robot_mode, athletic_pose, blue_yellow_cap, sports_theme, glossy_paint, energetic_expression
