"""
Characters API router for Super Wings Simulator.
Provides character information and search.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from ...config import get_settings
from ...core.rag import get_knowledge_base

logger = logging.getLogger(__name__)
router = APIRouter()

# Cache for character data
_characters_cache: Optional[Dict[str, Any]] = None


def _load_characters() -> Dict[str, Any]:
    """Load and cache character data."""
    global _characters_cache

    if _characters_cache is None:
        settings = get_settings()
        path = Path(settings.game.characters_file)

        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                _characters_cache = data.get("characters", {})
        else:
            logger.warning(f"Characters file not found: {path}")
            _characters_cache = {}

    return _characters_cache


@router.get("")
async def list_characters(
    role: Optional[str] = Query(None, description="Filter by role"),
    specialization: Optional[str] = Query(None, description="Filter by specialization"),
) -> Dict[str, Any]:
    """
    List all available characters.
    """
    characters = _load_characters()

    result = []
    for char_id, char_data in characters.items():
        # Apply filters
        if role and char_data.get("role", "").lower() != role.lower():
            continue
        if specialization:
            char_spec = char_data.get("stats", {}).get("specialization", "")
            if specialization.lower() not in char_spec.lower():
                continue

        result.append({
            "id": char_id,
            "name": char_data.get("name", char_id),
            "name_zh": char_data.get("name_zh", ""),
            "role": char_data.get("role", ""),
            "type": char_data.get("type", ""),
            "specialization": char_data.get("stats", {}).get("specialization", ""),
        })

    return {
        "count": len(result),
        "characters": result,
    }


@router.get("/{character_id}")
async def get_character(character_id: str) -> Dict[str, Any]:
    """
    Get detailed information about a specific character.
    """
    characters = _load_characters()

    if character_id not in characters:
        raise HTTPException(status_code=404, detail=f"Character '{character_id}' not found")

    char = characters[character_id]

    return {
        "id": character_id,
        "name": char.get("name", character_id),
        "name_zh": char.get("name_zh", ""),
        "role": char.get("role", ""),
        "type": char.get("type", ""),
        "personality": char.get("personality", ""),
        "catchphrase": char.get("catchphrase"),
        "abilities": char.get("abilities", []),
        "visual_description": char.get("visual_description", {}),
        "stats": char.get("stats", {}),
        "prompt_hints": char.get("prompt_hints", {}),
    }


@router.get("/{character_id}/abilities")
async def get_character_abilities(character_id: str) -> Dict[str, Any]:
    """
    Get a character's abilities and specialization.
    """
    characters = _load_characters()

    if character_id not in characters:
        raise HTTPException(status_code=404, detail=f"Character '{character_id}' not found")

    char = characters[character_id]

    return {
        "id": character_id,
        "name": char.get("name", character_id),
        "abilities": char.get("abilities", []),
        "specialization": char.get("stats", {}).get("specialization", ""),
        "stats": char.get("stats", {}),
    }


@router.get("/{character_id}/visual")
async def get_character_visual(character_id: str) -> Dict[str, Any]:
    """
    Get a character's visual description for image generation.
    """
    characters = _load_characters()

    if character_id not in characters:
        raise HTTPException(status_code=404, detail=f"Character '{character_id}' not found")

    char = characters[character_id]

    return {
        "id": character_id,
        "name": char.get("name", character_id),
        "visual_description": char.get("visual_description", {}),
        "prompt_hints": char.get("prompt_hints", {}),
    }


@router.get("/search/semantic")
async def semantic_search_characters(
    query: str = Query(..., description="Search query"),
    top_k: int = Query(default=5, ge=1, le=20),
    min_score: float = Query(default=0.3, ge=0.0, le=1.0),
) -> Dict[str, Any]:
    """
    Semantic search for characters using RAG.
    """
    try:
        kb = get_knowledge_base()
        results = kb.search_characters(
            query=query,
            top_k=top_k,
            min_score=min_score,
        )

        return {
            "query": query,
            "count": len(results),
            "results": [
                {
                    "character_id": r.document.metadata.get("character_id"),
                    "name": r.document.metadata.get("name"),
                    "score": round(r.score, 3),
                    "content": r.document.content[:200] + "..." if len(r.document.content) > 200 else r.document.content,
                }
                for r in results
            ],
        }

    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}",
        )


@router.get("/by-ability/{ability}")
async def find_characters_by_ability(ability: str) -> Dict[str, Any]:
    """
    Find characters that have a specific ability.
    """
    characters = _load_characters()

    result = []
    ability_lower = ability.lower()

    for char_id, char_data in characters.items():
        char_abilities = [a.lower() for a in char_data.get("abilities", [])]
        if any(ability_lower in a for a in char_abilities):
            result.append({
                "id": char_id,
                "name": char_data.get("name", char_id),
                "abilities": char_data.get("abilities", []),
                "specialization": char_data.get("stats", {}).get("specialization", ""),
            })

    return {
        "ability": ability,
        "count": len(result),
        "characters": result,
    }


@router.get("/roles/list")
async def list_character_roles() -> Dict[str, Any]:
    """
    List all unique character roles.
    """
    characters = _load_characters()

    roles = {}
    for char_id, char_data in characters.items():
        role = char_data.get("role", "unknown")
        if role not in roles:
            roles[role] = []
        roles[role].append(char_id)

    return {
        "roles": [
            {"role": role, "count": len(chars), "characters": chars}
            for role, chars in roles.items()
        ],
    }


@router.post("/reload")
async def reload_characters() -> Dict[str, str]:
    """
    Reload character data from file.
    """
    global _characters_cache
    _characters_cache = None

    characters = _load_characters()

    return {
        "status": "reloaded",
        "count": str(len(characters)),
    }
