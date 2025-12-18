"""
Dispatch API router for Super Wings Simulator.
Provides mission dispatch recommendations and character-mission matching.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...core.agents import (
    get_dispatcher_agent,
    MissionRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class DispatchRequestBody(BaseModel):
    """Request body for dispatch recommendation."""
    mission_type: str
    location: str
    problem_description: str
    urgency: str = "normal"
    available_characters: Optional[List[str]] = None


class DispatchRecommendationResponse(BaseModel):
    """Response for dispatch recommendation."""
    recommended_character: str
    confidence: float
    reasoning: str
    alternative: Optional[str] = None
    mission_tips: List[str] = []
    explanation: str = ""


class ExplainMatchRequest(BaseModel):
    """Request body for explaining character-mission match."""
    character_id: str
    mission_type: str
    location: str


class BestCharacterResponse(BaseModel):
    """Response for best character query."""
    mission_type: str
    best_character: str
    ranking: List[Dict[str, Any]]
    reasoning: str


@router.post("/recommend", response_model=DispatchRecommendationResponse)
async def recommend_dispatch(request: DispatchRequestBody) -> DispatchRecommendationResponse:
    """
    Get a dispatch recommendation for a mission.
    """
    try:
        agent = get_dispatcher_agent()

        mission_request = MissionRequest(
            mission_type=request.mission_type,
            location=request.location,
            problem_description=request.problem_description,
            urgency=request.urgency,
            available_characters=request.available_characters,
        )

        recommendation = await agent.recommend_dispatch(mission_request)

        return DispatchRecommendationResponse(
            recommended_character=recommendation.recommended_character,
            confidence=recommendation.confidence,
            reasoning=recommendation.reasoning,
            alternative=recommendation.alternative,
            mission_tips=recommendation.mission_tips or [],
            explanation=recommendation.explanation or "",
        )

    except Exception as e:
        logger.error(f"Dispatch recommendation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate dispatch recommendation: {str(e)}",
        )


@router.post("/explain", response_model=Dict[str, Any])
async def explain_dispatch(request: ExplainMatchRequest) -> Dict[str, Any]:
    """
    Explain why a character is suitable for a mission type.
    """
    try:
        agent = get_dispatcher_agent()

        explanation = await agent.explain_character_match(
            character_id=request.character_id,
            mission_type=request.mission_type,
            location=request.location,
        )

        return {
            "character_id": request.character_id,
            "mission_type": request.mission_type,
            "location": request.location,
            "explanation": explanation,
        }

    except Exception as e:
        logger.error(f"Dispatch explanation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate explanation: {str(e)}",
        )


@router.get("/best-for/{mission_type}", response_model=BestCharacterResponse)
async def get_best_for_mission(
    mission_type: str,
    available_characters: Optional[str] = None,
) -> BestCharacterResponse:
    """
    Get the best character ranking for a mission type.

    Args:
        mission_type: Type of mission (delivery, sports, construction, etc.)
        available_characters: Comma-separated list of available character IDs
    """
    try:
        agent = get_dispatcher_agent()

        # Parse available characters if provided
        char_list = None
        if available_characters:
            char_list = [c.strip() for c in available_characters.split(",")]

        result = await agent.get_best_for_mission_type(
            mission_type=mission_type,
            available_characters=char_list,
        )

        # result is a list of {"character_id": "id", "score": 0.0-1.0, "reason": "brief reason"}
        best_character = result[0]["character_id"] if result else "jett"
        ranking = result
        reasoning = result[0]["reason"] if result else "No ranking available"

        return BestCharacterResponse(
            mission_type=mission_type,
            best_character=best_character,
            ranking=ranking,
            reasoning=reasoning,
        )

    except Exception as e:
        logger.error(f"Best character query failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get best character: {str(e)}",
        )


@router.get("/mission-types")
async def list_mission_types() -> Dict[str, Any]:
    """
    List available mission types with their best characters.
    """
    # Mission type to best character mapping
    mission_matching = {
        "delivery": {"primary": "jett", "secondary": ["jerome", "chase"]},
        "sports": {"primary": "flip", "secondary": ["jett"]},
        "construction": {"primary": "donnie", "secondary": ["todd"]},
        "digging": {"primary": "todd", "secondary": ["donnie"]},
        "police": {"primary": "paul", "secondary": ["jerome"]},
        "animal_care": {"primary": "bello", "secondary": []},
    }

    return {
        "mission_types": list(mission_matching.keys()),
        "matching": mission_matching,
    }


@router.get("/characters")
async def list_available_characters() -> Dict[str, Any]:
    """
    List all characters available for dispatch.
    """
    characters = {
        "jett": {
            "name": "Jett",
            "specialty": "delivery",
            "description": "Fast delivery specialist, the main protagonist",
        },
        "flip": {
            "name": "Flip",
            "specialty": "sports",
            "description": "Stunt plane with athletic abilities",
        },
        "donnie": {
            "name": "Donnie",
            "specialty": "construction",
            "description": "Engineering and construction expert",
        },
        "todd": {
            "name": "Todd",
            "specialty": "digging",
            "description": "Drill vehicle for excavation missions",
        },
        "paul": {
            "name": "Paul",
            "specialty": "police",
            "description": "Police vehicle for security and order",
        },
        "bello": {
            "name": "Bello",
            "specialty": "animal_care",
            "description": "Animal communication and care specialist",
        },
        "chase": {
            "name": "Chase",
            "specialty": "rescue",
            "description": "Helicopter for rescue operations",
        },
        "jerome": {
            "name": "Jerome",
            "specialty": "performance",
            "description": "Aerial tricks and entertainment",
        },
    }

    return {
        "characters": characters,
        "total": len(characters),
    }
