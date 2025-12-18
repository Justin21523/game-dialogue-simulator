<!-- file: super_wings_bello.md -->
# Bello — Character Reference (Super Wings, LoRA Sheet)

## 0. Global Rendering Notes
- Toy-like CGI hard-surface
- Clean bold patterns, glossy paint, bright lighting

---

## 1. Identity & Role (canonical)
- **Name:** Bello
- **Role:** Nature / animal expert helper
- **Core function:** supports missions where animals and wildlife knowledge matter

---

## 2. Canon Visual Design Facts (from reference sources)
- **Overall size vibe:** large airplane
- **Base color:** brown
- **Pattern:** zebra patterns painted over the body
- **Inspiration note:** styled after a 1930s–1940s safari-type airplane
- **Eye color:** emerald green
- **Front detail:** large old-fashioned frontal propeller

---

## 3. Vehicle Mode (geometry + silhouette)
### 3.1 Shape language
- Classic “safari prop plane” proportions: rounded body, visible prop, sturdy wings
- Zebra pattern is the primary ID signature (big, readable stripes)

### 3.2 Approx color palette (dataset-friendly, not official)
- Brown base: ~#8A5A2B
- Zebra stripes: near-black + off-white
- Eyes emerald green: saturated green highlight

---

## 4. Robot Mode (mechanical read — inferred)
- Torso: fuselage becomes chest
- Arms/legs: deploy from side/underside panels
- Propeller: can remain visible as a front/chest/back feature depending on transformation rig
- Zebra striping should remain continuous across major panels (important for consistency)

---

## 5. Materials & Shading (LoRA targets)
- Brown paint: glossy but slightly warmer/softer highlights than pure primary colors
- Zebra stripes: painted-on pattern (not fur). Keep it hard-surface, not organic hair.
- Propeller: can read as painted metal or glossy plastic; keep it clean.

---

## 6. Signature Abilities (canonical)
- Strong knowledge of animals
- Can speak to animals (explicitly mentioned in reference source)

---

## 7. Expression & Pose Language
- Calm, confident “outdoors guide” energy
- Great training poses:
  - standing near animals (friendly posture)
  - pointing/guiding
  - protective stance in robot_mode

---

## 8. LoRA Tag Pack
### 8.1 Identity tags
`super_wings_bello`, `bello`

### 8.2 Visual tags
`brown_safari_plane`, `zebra_stripes`, `frontal_propeller`, `emerald_green_eyes`, `glossy_paint`, `toy_like_cgi`

### 8.3 Mode tags (mandatory)
`vehicle_mode` OR `robot_mode`

### 8.4 Action tags
`wildlife_helper`, `talking_to_animals`, `nature_mission`, `safari_theme`

### 8.5 Negative / avoid-confusion tags
- Do NOT let the model interpret stripes as fur: `no_fur_texture`
- Avoid generic “tiger stripes” drift: `zebra_stripes_only`

---

## 9. Caption templates
**Vehicle Mode**
super_wings_bello, vehicle_mode, brown_safari_plane, zebra_stripes, frontal_propeller, emerald_green_eyes, glossy_paint, bright_daylight

**Robot Mode**
super_wings_bello, robot_mode, zebra_stripes, glossy_paint, wildlife_helper, friendly_pose
