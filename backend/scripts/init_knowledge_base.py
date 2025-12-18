#!/usr/bin/env python3
"""
Initialize the RAG knowledge base with existing game data.
This script loads all JSON knowledge files and populates ChromaDB.
"""

import json
import logging
from pathlib import Path
import sys

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.core.rag import (
    get_character_store,
    get_location_store,
    get_mission_store,
    get_npc_store,
    get_event_store,
    Document,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = PROJECT_ROOT / "backend" / "data" / "knowledge"


def load_json(filename: str) -> dict:
    """Load a JSON file from the knowledge directory."""
    filepath = DATA_DIR / filename
    if not filepath.exists():
        logger.warning(f"File not found: {filepath}")
        return {}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def init_locations():
    """Initialize location knowledge."""
    store = get_location_store()
    data = load_json("locations.json")
    locations = data.get("locations", {})

    documents = []
    for loc_id, loc in locations.items():
        content = f"""
Location: {loc['name']} ({loc.get('name_zh', '')})
Region: {loc.get('region', 'Unknown')}
Description: {loc.get('description', '')}
Cultural Notes: {loc.get('cultural_notes', '')}
Landmarks: {', '.join(loc.get('landmarks', []))}
Common Problems: {', '.join(loc.get('common_problems', []))}
"""
        documents.append(Document(
            id=loc_id,
            content=content.strip(),
            metadata={
                "type": "location",
                "name": loc['name'],
                "name_zh": loc.get('name_zh', ''),
                "region": loc.get('region', 'Unknown'),
            }
        ))

    if documents:
        store.add_documents(documents)
        logger.info(f"Added {len(documents)} locations to knowledge base")
    return len(documents)


def init_npcs():
    """Initialize NPC knowledge."""
    store = get_npc_store()
    data = load_json("npcs.json")
    npcs = data.get("npcs", {})

    documents = []
    for npc_id, npc in npcs.items():
        content = f"""
NPC: {npc['name']} ({npc.get('name_zh', '')})
Location: {npc.get('location', 'Unknown')}
Role: {npc.get('role', 'Unknown')}
Age Group: {npc.get('age_group', 'Unknown')}
Personality: {npc.get('personality', '')}
Speaking Style: {npc.get('speaking_style', '')}
Greeting: {npc.get('greeting_style', '')}
Typical Problems: {', '.join(npc.get('typical_problems', []))}
Cultural Background: {npc.get('cultural_background', '')}
"""
        documents.append(Document(
            id=npc_id,
            content=content.strip(),
            metadata={
                "type": "npc",
                "name": npc['name'],
                "name_zh": npc.get('name_zh', ''),
                "location": npc.get('location', ''),
                "role": npc.get('role', ''),
            }
        ))

    if documents:
        store.add_documents(documents)
        logger.info(f"Added {len(documents)} NPCs to knowledge base")
    return len(documents)


def init_mission_types():
    """Initialize mission type knowledge."""
    store = get_mission_store()
    data = load_json("mission_types.json")
    mission_types = data.get("mission_types", {})

    documents = []
    for type_id, mt in mission_types.items():
        content = f"""
Mission Type: {mt['name']} ({mt.get('name_zh', '')})
Description: {mt.get('description', '')}
Specialist: {mt.get('specialist', 'Any')}
Required Abilities: {', '.join(mt.get('required_abilities', []))}
Success Factors: {', '.join(mt.get('success_factors', []))}
Difficulty: {mt.get('difficulty', 'Medium')}
Typical Phases: {' -> '.join(mt.get('typical_phases', []))}
"""
        documents.append(Document(
            id=f"mission_type_{type_id}",
            content=content.strip(),
            metadata={
                "type": "mission_type",
                "name": mt['name'],
                "name_zh": mt.get('name_zh', ''),
                "specialist": mt.get('specialist', ''),
                "difficulty": mt.get('difficulty', 'medium'),
            }
        ))

    if documents:
        store.add_documents(documents)
        logger.info(f"Added {len(documents)} mission types to knowledge base")
    return len(documents)


def init_characters():
    """Initialize character knowledge from characters.json."""
    store = get_character_store()

    # Load from project root data folder
    char_file = PROJECT_ROOT / "data" / "characters.json"
    if not char_file.exists():
        logger.warning(f"Characters file not found: {char_file}")
        return 0

    with open(char_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Characters is a dict, not a list
    characters = data.get("characters", {})
    documents = []

    for char_id, char in characters.items():
        # Handle abilities - could be string or list
        abilities = char.get('abilities', '')
        if isinstance(abilities, list):
            abilities = ', '.join(abilities)

        content = f"""
Character: {char.get('name', char_id)} ({char.get('name_zh', '')})
ID: {char.get('id', char_id)}
Role: {char.get('role', 'Unknown')}
Personality: {char.get('personality', '')}
Abilities: {abilities}
Primary Color: {char.get('colors', {}).get('primary', '')}
"""
        documents.append(Document(
            id=char.get('id', char_id),
            content=content.strip(),
            metadata={
                "type": "character",
                "name": char.get('name', char_id),
                "name_zh": char.get('name_zh', ''),
                "role": char.get('role', ''),
                "primary_color": char.get('colors', {}).get('primary', ''),
            }
        ))

    if documents:
        store.add_documents(documents)
        logger.info(f"Added {len(documents)} characters to knowledge base")
    return len(documents)


def init_all():
    """Initialize all knowledge bases."""
    logger.info("=" * 50)
    logger.info("Initializing Super Wings Knowledge Base")
    logger.info("=" * 50)

    results = {
        "locations": init_locations(),
        "npcs": init_npcs(),
        "mission_types": init_mission_types(),
        "characters": init_characters(),
    }

    logger.info("=" * 50)
    logger.info("Knowledge Base Initialization Complete!")
    logger.info(f"Results: {results}")
    logger.info("=" * 50)

    return results


if __name__ == "__main__":
    init_all()
