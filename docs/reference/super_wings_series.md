<!-- file: super_wings_series.md -->
# Super Wings — Series & Visual Reference (LoRA-Oriented)

## 1. Series Overview

### 1.1 Core metadata (canonical)
- **Title:** Super Wings
- **Format:** 3D animated preschool TV series (episodes ~12 minutes)
- **Creator:** Gil Hoon Jung
- **Production / Co-production:** FunnyFlux Entertainment (South Korea) with Alpha Group (China) and others depending on season/region
- **Original release:** September 1, 2014 – present

### 1.2 High-level premise (logline)
A jet plane named **Jett** delivers packages to kids around the world. When problems happen, he calls other Super Wings who **transform into robot heroes** to help solve the situation using specialized skills (e.g., lifting, digging, etc.).

---

## 2. World & Visual Style (practical LoRA notes)

### 2.1 Setting conventions
- **Hub location concept:** The “World Airport” / “World Aircraft” / “World Spaceport” hub changes across seasons, but the core idea remains a high-tech staging base where missions are assigned.
- **Global travel:** Episodes are frequently set in recognizable real-world places; backgrounds are simplified, bright, and kid-friendly.

### 2.2 Art direction: “toy-like” hard-surface CGI (LoRA critical)
This is the look your LoRA should lock in:
- **Silhouette language:** Rounded, safe, friendly proportions. Even “sharp” jet noses tend to be softened.
- **Face style:** Large expressive eyes integrated into the windshield/front face area.
- **Surface vibe:** “Premium toy” finish — clean paint, minimal grime, strong specular highlights, soft shadows.

### 2.3 Material stack (recommended annotation mindset)
Use consistent material thinking across the whole dataset:
- **Painted body panels:** glossy enamel / clearcoat feel (high specular, low roughness)
- **Trim plastics:** semi-gloss or satin (medium roughness)
- **Joints / hinges:** matte plastic (higher roughness, less reflective)
- **Windshield / eye cover:** tinted glass/plastic (smooth reflections)
- **Lights / sirens:** translucent plastic (emissive cues if present)
- **Tires / small bumpers (if visible):** rubbery matte

### 2.4 Lighting + color
- **Lighting:** high-key daylight most of the time; soft contact shadows
- **Palette:** highly saturated primary colors; strong contrast between characters for fast readability

---

## 3. Transformation & “Mode” Labeling (caption safety)

### 3.1 Two main modes you MUST separate in tags
- `vehicle_mode`: aircraft shape, no arms/legs visible (or fully stowed)
- `robot_mode`: biped stance, arms/legs deployed, wings become backpack/shoulder shapes

### 3.2 Typical transformation logic (series-consistent, LoRA-friendly)
Not every season animates the exact same mechanical steps, but the common pattern is:
- fuselage becomes torso
- landing gear / underside expands into legs + feet
- side panels open to deploy arms
- wings fold back into a backpack silhouette

---

## 4. Character Design Rules (dataset consistency checks)

### 4.1 Non-negotiable “Super Wings” traits
- Anthropomorphic aircraft with expressive face
- Clean toy-like finish (avoid realistic weathering unless you are intentionally training that variant)
- Rounded bevels and safe geometry
- Bold decals/symbols that function like “character logos”

### 4.2 Tagging strategy (recommended)
Core tags:
- `super_wings`, `anthropomorphic_plane`, `3d_animation`, `toy_like_cgi`, `glossy_paint`
Mode tags:
- `vehicle_mode` OR `robot_mode`
Action tags:
- `flying`, `landing`, `delivery`, `transforming`, `helping_kids`
Environment tags:
- `blue_sky`, `runway`, `world_airport`, `city_background`, `bright_daylight`

---

## 5. Quality Control Tips (so the LoRA doesn’t melt)

### 5.1 Prevent “hybrid mode” artifacts
Always label mode. If you mix untagged vehicle + robot images, your LoRA will happily invent:
- planes with arms while still in full flight mode
- robot legs sticking out midair with no landing gear logic

### 5.2 Keep reflections consistent
If you include extreme studio lighting, also include enough daylight frames so the model learns the “default show lighting.”

### 5.3 Don’t over-invent materials per character
The franchise style is unified. Characters differ mainly by:
- base color + decals
- silhouette (jet vs prop plane vs construction drill nose)
- signature accessories (cap, siren, hat, etc.)
