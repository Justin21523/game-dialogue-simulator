# Data Schemas (JSON)

This project uses JSON as the source of truth for world content.

## Locations (`src/data/locations.json`)

```jsonc
{
  "locations": [
    {
      "location_id": "town_district",
      "display_name": "Town District",
      "world_width": 3600,
      "world_height": 1080,
      "theme": "town_outdoor",
      "spawn_points": { "default": { "x": 320, "y": 760 } },
      "parallax": {
        "layers": [
          { "id": "sky", "kind": "solid", "color": "#0b1c2c", "speed": 0.0 },
          { "id": "clouds", "kind": "noise", "color": "#ffffff", "alpha": 0.08, "speed": 0.05 },
          { "id": "far_city", "kind": "stripes", "color": "#ffffff", "alpha": 0.06, "speed": 0.12 },
          { "id": "near_props", "kind": "stripes", "color": "#ffffff", "alpha": 0.08, "speed": 0.22 }
        ]
      },
      "props": [
        { "prop_id": "sign_welcome", "type": "sign", "x": 520, "y": 760, "label": "Welcome to Town!" }
      ],
      "doors": [
        {
          "door_id": "door_shop",
          "label": "Town Shop",
          "x": 1420,
          "y": 760,
          "width": 120,
          "height": 220,
          "target_location_id": "town_shop_interior",
          "target_spawn_point": "entry"
        }
      ],
      "npc_spawns": [
        { "npc_id": "npc_dispatcher", "x": 980, "y": 760 }
      ],
      "interactables": [
        { "interactable_id": "relay_rooftop", "type": "quest_target", "x": 2680, "y": 760, "label": "Rooftop Relay", "required_ability": "ENGINEERING" }
      ],
      "secrets": [
        { "secret_id": "secret_alley", "x": 3320, "y": 740, "width": 200, "height": 320, "world_flag": "secret_alley_found", "reward_currency": 150 }
      ],
      "exits": [
        { "exit_id": "to_base", "x": 160, "y": 740, "width": 180, "height": 320, "target_location_id": "base_airport", "target_spawn_point": "default" }
      ]
    }
  ]
}
```

## NPCs (`src/data/npcs.json`)

```jsonc
{
  "npcs": [
    {
      "npc_id": "npc_shopkeeper",
      "display_name": "Shopkeeper",
      "character_id": "bello",
      "portrait": "grid",
      "dialogue_id": "dlg_shopkeeper_root",
      "patrol_path": { "speed": 18, "points": [ { "x": 520, "wait_ms": 800 }, { "x": 760, "wait_ms": 600 } ] }
    }
  ]
}
```

## Dialogues (`src/data/dialogues.json`)

```jsonc
{
  "dialogues": [
    {
      "dialogue_id": "dlg_shopkeeper_root",
      "npc_id": "npc_shopkeeper",
      "start_node_id": "n1",
      "nodes": [
        {
          "node_id": "n1",
          "speaker_name": "Shopkeeper",
          "lines": [
            { "text": "Welcome!", "if": { "flags_none": ["town_shop_robbed"] } },
            { "text": "Stay alert... things changed.", "if": { "flags_all": ["town_shop_robbed"] } }
          ],
          "choices": [
            { "choice_id": "c1", "text": "Any work?", "actions": [ { "type": "quest_start", "quest_template_id": "qt_side_lost_poster" } ] }
          ]
        }
      ]
    }
  ]
}
```

## Quests (`src/data/quests.json`)

```jsonc
{
  "quest_templates": [
    {
      "template_id": "qt_main_town_arrival",
      "title": "Town Startup",
      "description": "Help restore services in the town district.",
      "type": "main",
      "destination_location_id": "town_district",
      "repeatable": false,
      "steps": [
        { "id": "talk_dispatcher", "type": "talk", "title": "Talk to the Dispatcher", "required_count": 1, "conditions": [ { "npc_id": "npc_dispatcher" } ] }
      ],
      "rewards": { "currency": 200, "exp": 80, "unlock_locations": ["town_shop_interior"] },
      "prerequisites": { "required_world_flags": [], "completed_quest_templates": [] }
    }
  ]
}
```

## Companions (`src/data/companions.json`)

```jsonc
{
  "companions": [
    {
      "companion_id": "comp_donnie",
      "display_name": "Donnie",
      "character_id": "donnie",
      "category": "ENGINEERING",
      "abilities": ["ENGINEERING"],
      "unlock": { "type": "default" }
    }
  ]
}
```

