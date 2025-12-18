"""
Content Generation API router for Super Wings Simulator.
Uses AI to generate new missions, locations, and events.
"""

import logging
from typing import Any, Dict, List, Optional
from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ...core.agents import (
    get_content_generator,
    GeneratedMission,
    GeneratedLocation,
    GeneratedEvent,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class MissionGenerationRequest(BaseModel):
    """Request to generate a new mission."""
    mission_type: Optional[str] = None
    location: Optional[str] = None
    difficulty: str = "medium"
    character_id: Optional[str] = None


class LocationGenerationRequest(BaseModel):
    """Request to generate a new location."""
    region: Optional[str] = None
    theme: Optional[str] = None


class EventGenerationRequest(BaseModel):
    """Request to generate a new event."""
    event_type: str = "random"
    season: Optional[str] = None


class BatchMissionRequest(BaseModel):
    """Request to generate multiple missions."""
    count: int = 5
    variety: bool = True


@router.post("/mission")
async def generate_mission(request: MissionGenerationRequest) -> Dict[str, Any]:
    """
    Generate a new mission using AI.

    Args:
        request: Mission generation parameters

    Returns:
        Generated mission data
    """
    try:
        generator = get_content_generator()
        mission = await generator.generate_mission(
            mission_type=request.mission_type,
            location=request.location,
            difficulty=request.difficulty,
            character_id=request.character_id,
        )

        return {
            "success": True,
            "mission": asdict(mission),
        }

    except Exception as e:
        logger.error(f"Mission generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate mission: {str(e)}",
        )


@router.post("/missions/batch")
async def generate_batch_missions(request: BatchMissionRequest) -> Dict[str, Any]:
    """
    Generate multiple missions using AI.

    Args:
        request: Batch generation parameters

    Returns:
        List of generated missions
    """
    try:
        generator = get_content_generator()
        missions = await generator.generate_batch_missions(
            count=request.count,
            variety=request.variety,
        )

        return {
            "success": True,
            "count": len(missions),
            "missions": [asdict(m) for m in missions],
        }

    except Exception as e:
        logger.error(f"Batch mission generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate missions: {str(e)}",
        )


@router.post("/location")
async def generate_location(request: LocationGenerationRequest) -> Dict[str, Any]:
    """
    Generate a new location using AI.

    Args:
        request: Location generation parameters

    Returns:
        Generated location data
    """
    try:
        generator = get_content_generator()
        location = await generator.generate_location(
            region=request.region,
            theme=request.theme,
        )

        return {
            "success": True,
            "location": asdict(location),
        }

    except Exception as e:
        logger.error(f"Location generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate location: {str(e)}",
        )


@router.post("/event")
async def generate_event(request: EventGenerationRequest) -> Dict[str, Any]:
    """
    Generate a new game event using AI.

    Args:
        request: Event generation parameters

    Returns:
        Generated event data
    """
    try:
        generator = get_content_generator()
        event = await generator.generate_event(
            event_type=request.event_type,
            season=request.season,
        )

        return {
            "success": True,
            "event": asdict(event),
        }

    except Exception as e:
        logger.error(f"Event generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate event: {str(e)}",
        )


@router.get("/mission-types")
async def get_mission_types() -> Dict[str, Any]:
    """Get available mission types."""
    generator = get_content_generator()
    return {
        "mission_types": generator.MISSION_TYPES,
        "regions": generator.REGIONS,
        "character_specialists": generator.CHARACTER_SPECIALISTS,
    }


@router.post("/expand-content")
async def expand_content(
    missions: int = Query(default=5, ge=1, le=20),
    locations: int = Query(default=2, ge=0, le=10),
    events: int = Query(default=1, ge=0, le=5),
) -> Dict[str, Any]:
    """
    Expand game content by generating new missions, locations, and events.

    This is a comprehensive endpoint for bulk content generation.

    Args:
        missions: Number of missions to generate
        locations: Number of locations to generate
        events: Number of events to generate

    Returns:
        All generated content
    """
    try:
        generator = get_content_generator()
        results = {
            "missions": [],
            "locations": [],
            "events": [],
        }

        # Generate missions
        if missions > 0:
            logger.info(f"Generating {missions} missions...")
            generated_missions = await generator.generate_batch_missions(
                count=missions,
                variety=True,
            )
            results["missions"] = [asdict(m) for m in generated_missions]

        # Generate locations
        if locations > 0:
            logger.info(f"Generating {locations} locations...")
            for _ in range(locations):
                try:
                    loc = await generator.generate_location()
                    results["locations"].append(asdict(loc))
                except Exception as e:
                    logger.warning(f"Location generation failed: {e}")

        # Generate events
        if events > 0:
            logger.info(f"Generating {events} events...")
            event_types = ["seasonal", "random", "story"]
            for i in range(events):
                try:
                    event = await generator.generate_event(
                        event_type=event_types[i % len(event_types)]
                    )
                    results["events"].append(asdict(event))
                except Exception as e:
                    logger.warning(f"Event generation failed: {e}")

        return {
            "success": True,
            "summary": {
                "missions_generated": len(results["missions"]),
                "locations_generated": len(results["locations"]),
                "events_generated": len(results["events"]),
            },
            "content": results,
        }

    except Exception as e:
        logger.error(f"Content expansion failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to expand content: {str(e)}",
        )
