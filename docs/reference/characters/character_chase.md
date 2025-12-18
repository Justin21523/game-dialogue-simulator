<!-- file: super_wings_chase.md -->
# Chase — Character Reference (Super Wings, LoRA Sheet)

## 0. Global Rendering Notes
- Toy-like CGI hard-surface
- Clean “spy gadget” read without realistic military grime

---

## 1. Identity & Role (canonical)
- **Name:** Chase
- **Role:** Spy / secret agent style helper
- **Core function:** stealth, camouflage, and multi-vehicle disguise

---

## 2. Canon Visual Design Facts (from reference sources)
- **Base color:** dark blue
- **Markings:** three red thunder-shaped stripes
- **Special trait:** extremely versatile transformation; can transform into many different vehicles (not only plane/robot)
- **Skill flavor:** camouflage; can vanish/reappear quickly

---

## 3. Vehicle Mode (geometry + silhouette)
### 3.1 Shape language
- Sleeker, more “stealth” vibe than the standard delivery planes
- Thunder stripes are critical: bold, red, and unmistakable
- Keep the read: “spy aircraft,” not “real-world stealth bomber”

### 3.2 Approx color palette (dataset-friendly, not official)
- Dark navy: ~#0D2A5A
- Red stripes: ~#D11F2A
- Trim gray (if visible): ~#6B7280

---

## 4. Robot Mode (mechanical read — inferred)
- Angular panels read better than rounded “civilian” planes
- Arms/legs deploy as usual, but overall silhouette should stay sleek
- Optional spy gadget silhouettes (only if visible in reference frames): small deployable panels, sensor-like shapes

---

## 5. Multi-Disguise / Camouflage (canonical)
Chase can transform into other vehicles (examples explicitly referenced include: boat, tow truck, spy car, jet ski).
**LoRA warning:** This can confuse identity learning.
- If you include disguise forms in training, tag them clearly:
  - `chase_disguise_mode`, plus the vehicle type (e.g., `boat`, `car`, `jet_ski`)
- If your goal is “standard Chase,” consider excluding disguise frames.

---

## 6. Materials & Shading (LoRA targets)
- Dark blue glossy paint (high specular, darker base)
- Red stripes should read as painted decals (crisp edges)
- Keep surfaces clean and reflective like a toy

---

## 7. Expression & Pose Language
- “Cool agent” vibe; confident and composed
- Great training poses:
  - half-turned “ready” stance
  - stealthy posture
  - sudden appearance/disappearance framing (motion blur if used, tag it)

---

## 8. LoRA Tag Pack
### 8.1 Identity tags
`super_wings_chase`, `chase`

### 8.2 Visual tags
`dark_blue_plane`, `red_thunder_stripes`, `spy_plane`, `camouflage`, `toy_like_cgi`, `glossy_paint`

### 8.3 Mode tags
`vehicle_mode` OR `robot_mode`
(optional) `disguise_mode`

### 8.4 Action tags
`stealth`, `undercover`, `investigation`, `vanish_effect`

### 8.5 Negative / avoid-confusion tags
- Avoid drifting into real military detail: `no_realistic_military_detail`, `no_weaponry`
- Avoid mixing with police siren identity: `not_paul`

---

## 9. Caption templates
**Vehicle Mode**
super_wings_chase, vehicle_mode, dark_blue_plane, red_thunder_stripes, spy_plane, glossy_paint, bright_daylight

**Robot Mode**
super_wings_chase, robot_mode, spy_plane, red_thunder_stripes, sleek_silhouette, glossy_paint, cool_pose
