"""
Sound effect API endpoints.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.core.agents import (
    SoundRequest,
    SoundResult,
    BatchSoundResult,
    get_sound_effect_agent,
    SoundCategory,
    UISoundType,
    FlightSoundType,
    TransformationSoundType,
    EnvironmentSoundType,
    ActionSoundType,
    CelebrationSoundType,
)

router = APIRouter()


# Request models
class GenerateSoundRequest(BaseModel):
    """Request to generate a sound effect."""
    category: SoundCategory
    sound_type: str
    duration_seconds: float = Field(2.0, ge=0.5, le=10.0)
    additional_description: Optional[str] = None
    save_to_disk: bool = True


class GenerateUISoundRequest(BaseModel):
    """Request to generate UI sound."""
    sound_type: UISoundType
    save_to_disk: bool = True


class GenerateFlightSoundRequest(BaseModel):
    """Request to generate flight sound."""
    sound_type: FlightSoundType
    duration_seconds: float = Field(3.0, ge=1.0, le=10.0)
    save_to_disk: bool = True


class GenerateTransformationSoundRequest(BaseModel):
    """Request to generate transformation sound."""
    sound_type: TransformationSoundType
    duration_seconds: float = Field(3.0, ge=1.0, le=5.0)
    save_to_disk: bool = True


class GenerateEnvironmentSoundRequest(BaseModel):
    """Request to generate environment sound."""
    sound_type: EnvironmentSoundType
    duration_seconds: float = Field(5.0, ge=2.0, le=10.0)
    save_to_disk: bool = True


# Endpoints
@router.get("/status")
async def sound_status():
    """Get sound generation service status."""
    agent = get_sound_effect_agent()
    return {
        "available": agent.is_available(),
        "model_name": agent.model_name,
        "output_dir": str(agent.output_dir),
    }


@router.get("/categories")
async def list_categories():
    """Get list of sound categories."""
    return {
        "categories": [c.value for c in SoundCategory],
    }


@router.get("/types/ui")
async def list_ui_sound_types():
    """Get list of UI sound types."""
    agent = get_sound_effect_agent()
    descriptions = {}
    for sound_type in UISoundType:
        descriptions[sound_type.value] = agent.get_sound_description(
            SoundCategory.UI, sound_type.value
        )
    return {
        "sound_types": [s.value for s in UISoundType],
        "descriptions": descriptions,
    }


@router.get("/types/flight")
async def list_flight_sound_types():
    """Get list of flight sound types."""
    agent = get_sound_effect_agent()
    descriptions = {}
    for sound_type in FlightSoundType:
        descriptions[sound_type.value] = agent.get_sound_description(
            SoundCategory.FLIGHT, sound_type.value
        )
    return {
        "sound_types": [s.value for s in FlightSoundType],
        "descriptions": descriptions,
    }


@router.get("/types/transformation")
async def list_transformation_sound_types():
    """Get list of transformation sound types."""
    agent = get_sound_effect_agent()
    descriptions = {}
    for sound_type in TransformationSoundType:
        descriptions[sound_type.value] = agent.get_sound_description(
            SoundCategory.TRANSFORMATION, sound_type.value
        )
    return {
        "sound_types": [s.value for s in TransformationSoundType],
        "descriptions": descriptions,
    }


@router.get("/types/environment")
async def list_environment_sound_types():
    """Get list of environment sound types."""
    agent = get_sound_effect_agent()
    descriptions = {}
    for sound_type in EnvironmentSoundType:
        descriptions[sound_type.value] = agent.get_sound_description(
            SoundCategory.ENVIRONMENT, sound_type.value
        )
    return {
        "sound_types": [s.value for s in EnvironmentSoundType],
        "descriptions": descriptions,
    }


@router.get("/types/action")
async def list_action_sound_types():
    """Get list of action sound types."""
    agent = get_sound_effect_agent()
    descriptions = {}
    for sound_type in ActionSoundType:
        descriptions[sound_type.value] = agent.get_sound_description(
            SoundCategory.ACTION, sound_type.value
        )
    return {
        "sound_types": [s.value for s in ActionSoundType],
        "descriptions": descriptions,
    }


@router.get("/types/celebration")
async def list_celebration_sound_types():
    """Get list of celebration sound types."""
    agent = get_sound_effect_agent()
    descriptions = {}
    for sound_type in CelebrationSoundType:
        descriptions[sound_type.value] = agent.get_sound_description(
            SoundCategory.CELEBRATION, sound_type.value
        )
    return {
        "sound_types": [s.value for s in CelebrationSoundType],
        "descriptions": descriptions,
    }


@router.post("/generate", response_model=SoundResult)
async def generate_sound(request: SoundRequest) -> SoundResult:
    """
    Generate a sound effect using AudioGen.
    """
    try:
        agent = get_sound_effect_agent()
        result = await agent.generate_sound(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ui", response_model=SoundResult)
async def generate_ui_sound(request: GenerateUISoundRequest):
    """Generate a UI sound effect."""
    agent = get_sound_effect_agent()

    result = await agent.generate_ui_sound(
        sound_type=request.sound_type,
        save_to_disk=request.save_to_disk,
    )

    return result


@router.post("/flight", response_model=SoundResult)
async def generate_flight_sound(request: GenerateFlightSoundRequest):
    """Generate a flight sound effect."""
    agent = get_sound_effect_agent()

    result = await agent.generate_flight_sound(
        sound_type=request.sound_type,
        duration_seconds=request.duration_seconds,
        save_to_disk=request.save_to_disk,
    )

    return result


@router.post("/transformation", response_model=SoundResult)
async def generate_transformation_sound(request: GenerateTransformationSoundRequest):
    """Generate a transformation sound effect."""
    agent = get_sound_effect_agent()

    result = await agent.generate_transformation_sound(
        sound_type=request.sound_type,
        duration_seconds=request.duration_seconds,
        save_to_disk=request.save_to_disk,
    )

    return result


@router.post("/environment", response_model=SoundResult)
async def generate_environment_sound(request: GenerateEnvironmentSoundRequest):
    """Generate an environment sound effect."""
    agent = get_sound_effect_agent()

    result = await agent.generate_environment_sound(
        sound_type=request.sound_type,
        duration_seconds=request.duration_seconds,
        save_to_disk=request.save_to_disk,
    )

    return result


@router.post("/pack/complete", response_model=BatchSoundResult)
async def generate_complete_sound_pack(
    save_to_disk: bool = Query(True),
):
    """Generate a complete sound pack with all essential sounds."""
    agent = get_sound_effect_agent()

    result = await agent.generate_complete_sound_pack(
        save_to_disk=save_to_disk,
    )

    return result