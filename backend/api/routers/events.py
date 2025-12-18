"""
Events API router for Super Wings Simulator.
Provides dynamic event generation for missions.
"""

import logging
import secrets
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...core.agents import (
    get_event_generator,
    EventRequest,
    EventType,
    EventDifficulty,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# Server-side event storage to prevent client-side cheating
# In production, this should use Redis or a database
_event_store: Dict[str, Dict[str, Any]] = {}
_EVENT_EXPIRY_MINUTES = 30


def store_event(event_id: str, event_data: Dict[str, Any]) -> None:
    """Store event data on server side with expiry timestamp."""
    _event_store[event_id] = {
        "data": event_data,
        "expires_at": datetime.now() + timedelta(minutes=_EVENT_EXPIRY_MINUTES),
        "used": False,
    }


def get_event(event_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve event data from server-side storage."""
    if event_id not in _event_store:
        return None

    stored = _event_store[event_id]

    # Check expiry
    if datetime.now() > stored["expires_at"]:
        del _event_store[event_id]
        return None

    # Prevent event replay attacks
    if stored["used"]:
        return None

    return stored["data"]


def mark_event_used(event_id: str) -> None:
    """Mark event as used to prevent replay."""
    if event_id in _event_store:
        _event_store[event_id]["used"] = True


def cleanup_expired_events() -> None:
    """Remove expired events from storage."""
    now = datetime.now()
    expired = [
        event_id
        for event_id, stored in _event_store.items()
        if now > stored["expires_at"]
    ]
    for event_id in expired:
        del _event_store[event_id]


class EventGenerateRequest(BaseModel):
    """Request body for event generation."""
    character_id: str
    location: str
    mission_phase: str
    original_problem: str
    event_type: Optional[str] = None
    difficulty: Optional[str] = None


class WeatherEventRequest(BaseModel):
    """Request body for weather event generation."""
    character_id: str
    location: str
    season: str = "summer"
    current_weather: str = "clear"


class EncounterEventRequest(BaseModel):
    """Request body for encounter event generation."""
    character_id: str
    location: str
    location_description: str
    mission_context: str


class EventChoiceData(BaseModel):
    """Choice data structure."""
    option: str
    outcome: str


class GameEventResponse(BaseModel):
    """Response for generated event."""
    event_id: str
    event_type: str
    name: str
    description: str
    challenge: str
    choices: List[EventChoiceData]
    difficulty: str
    related_ability: str
    reward_potential: Optional[str] = None


class EventResolveRequest(BaseModel):
    """Request body for resolving an event choice."""
    event_id: str
    choice_index: int
    # Removed event_data, event_type, character_id to prevent client-side cheating
    # Server will retrieve event data from secure storage


class EventResolveResponse(BaseModel):
    """Response for event resolution."""
    event_id: str
    success: bool
    outcome: str
    rewards: Optional[Dict[str, Any]] = None
    penalties: Optional[Dict[str, Any]] = None


@router.post("/generate", response_model=GameEventResponse)
async def generate_event(request: EventGenerateRequest) -> GameEventResponse:
    """
    Generate a random event for the current mission.
    """
    try:
        agent = get_event_generator()

        # Parse event type
        event_type = None
        if request.event_type:
            try:
                event_type = EventType(request.event_type)
            except ValueError:
                pass

        # Parse difficulty
        difficulty = EventDifficulty.MEDIUM
        if request.difficulty:
            try:
                difficulty = EventDifficulty(request.difficulty)
            except ValueError:
                pass

        event_request = EventRequest(
            character_id=request.character_id,
            location=request.location,
            mission_phase=request.mission_phase,
            original_problem=request.original_problem,
            event_type=event_type,
            difficulty=difficulty,
        )

        event = await agent.generate_event(event_request)

        # Store event data on server-side to prevent client cheating
        store_event(
            event.event_id,
            {
                "event_type": event.event_type.value,
                "difficulty": event.difficulty.value,
                "choices": [
                    {"option": c.option, "outcome": c.outcome}
                    for c in event.choices
                ],
                "character_id": request.character_id,
            }
        )

        return GameEventResponse(
            event_id=event.event_id,
            event_type=event.event_type.value,
            name=event.name,
            description=event.description,
            challenge=event.challenge,
            choices=[
                EventChoiceData(option=c.option, outcome=c.outcome)
                for c in event.choices
            ],
            difficulty=event.difficulty.value,
            related_ability=event.related_ability,
            reward_potential=event.reward_potential,
        )

    except Exception as e:
        logger.error(f"Event generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate event: {str(e)}",
        )


@router.post("/weather", response_model=Dict[str, Any])
async def generate_weather_event(request: WeatherEventRequest) -> Dict[str, Any]:
    """
    Generate a weather-related event.
    """
    try:
        agent = get_event_generator()

        result = await agent.generate_weather_event(
            character_id=request.character_id,
            location=request.location,
            season=request.season,
            current_weather=request.current_weather,
        )

        return {
            "character_id": request.character_id,
            "location": request.location,
            "event_type": "weather",
            "description": result,
            "season": request.season,
        }

    except Exception as e:
        logger.error(f"Weather event generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate weather event: {str(e)}",
        )


@router.post("/encounter", response_model=Dict[str, Any])
async def generate_encounter_event(request: EncounterEventRequest) -> Dict[str, Any]:
    """
    Generate a friendly encounter event.
    """
    try:
        agent = get_event_generator()

        result = await agent.generate_encounter_event(
            character_id=request.character_id,
            location=request.location,
            location_description=request.location_description,
            mission_context=request.mission_context,
        )

        return {
            "character_id": request.character_id,
            "location": request.location,
            "event_type": "encounter",
            "description": result,
        }

    except Exception as e:
        logger.error(f"Encounter event generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate encounter event: {str(e)}",
        )


@router.post("/resolve", response_model=EventResolveResponse)
async def resolve_event(request: EventResolveRequest) -> EventResolveResponse:
    """
    Resolve an event based on player's choice.
    Uses server-side stored event data to prevent cheating.
    """
    try:
        # Cleanup expired events periodically
        cleanup_expired_events()

        # Retrieve event data from server-side storage
        event_data = get_event(request.event_id)
        if event_data is None:
            raise HTTPException(
                status_code=404,
                detail="Event not found, expired, or already used",
            )

        # Mark event as used to prevent replay attacks
        mark_event_used(request.event_id)

        choices = event_data.get("choices", [])

        if 0 <= request.choice_index < len(choices):
            chosen = choices[request.choice_index]
            outcome = chosen.get("outcome", "The situation was handled.")

            # Determine success based on event difficulty (from server-side data)
            difficulty = event_data.get("difficulty", "medium")
            base_success_rates = {
                "easy": 0.95,
                "medium": 0.75,
                "hard": 0.55,
            }
            # Use secrets module for cryptographically secure randomness
            rng = secrets.SystemRandom()
            success_rate = base_success_rates.get(difficulty, 0.75)
            success = rng.random() < success_rate

            rewards = None
            penalties = None

            if success:
                rewards = {
                    "experience": 50 if difficulty == "easy" else (100 if difficulty == "medium" else 200),
                    "money": 25 if difficulty == "easy" else (50 if difficulty == "medium" else 100),
                }
            else:
                penalties = {
                    "time_delay": 30,  # seconds
                    "energy_cost": 5,
                }

            return EventResolveResponse(
                event_id=request.event_id,
                success=success,
                outcome=outcome if success else f"Unfortunately, {outcome.lower()} didn't work out as planned.",
                rewards=rewards,
                penalties=penalties,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Invalid choice index",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Event resolution failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to resolve event: {str(e)}",
        )


@router.get("/types")
async def list_event_types() -> Dict[str, Any]:
    """
    List available event types and difficulties.
    """
    return {
        "event_types": [t.value for t in EventType],
        "difficulties": [d.value for d in EventDifficulty],
        "descriptions": {
            "weather": "Weather-related challenges during flight",
            "encounter": "Friendly encounters with local people or animals",
            "obstacle": "Obstacles that need to be overcome",
            "bonus": "Lucky events that provide bonuses",
            "help_request": "Side quests to help others along the way",
        },
    }


@router.get("/templates")
async def get_event_templates() -> Dict[str, Any]:
    """
    Get event templates for different types.
    """
    templates = {
        "weather": [
            {"name": "Sudden Storm", "difficulty": "medium"},
            {"name": "Thick Fog", "difficulty": "hard"},
            {"name": "Strong Winds", "difficulty": "easy"},
            {"name": "Rainbow", "difficulty": "easy", "type": "bonus"},
        ],
        "encounter": [
            {"name": "Friendly Bird", "difficulty": "easy"},
            {"name": "Lost Balloon", "difficulty": "easy"},
            {"name": "Fellow Traveler", "difficulty": "easy"},
        ],
        "obstacle": [
            {"name": "Bird Flock", "difficulty": "medium"},
            {"name": "Construction Zone", "difficulty": "medium"},
            {"name": "Detour Required", "difficulty": "hard"},
        ],
        "help_request": [
            {"name": "Stranded Hiker", "difficulty": "medium"},
            {"name": "Broken Vehicle", "difficulty": "hard"},
            {"name": "Lost Child", "difficulty": "easy"},
        ],
    }

    return {
        "templates": templates,
        "total": sum(len(v) for v in templates.values()),
    }
