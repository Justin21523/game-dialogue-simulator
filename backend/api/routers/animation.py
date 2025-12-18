"""
Animation sequence API endpoints.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.core.agents import (
    get_animation_agent,
    AnimationType,
    EasingFunction,
    ExportFormat,
    AnimationRequest,
    AnimationResult,
    AnimationPlan,
)

router = APIRouter()


# Request models
class PlanAnimationRequest(BaseModel):
    """Request to plan an animation."""
    animation_type: AnimationType
    character_id: str
    duration_ms: int = Field(2000, ge=500, le=10000)
    frame_rate: int = Field(24, ge=12, le=60)
    easing: EasingFunction = EasingFunction.EASE_IN_OUT
    loop: bool = False
    export_format: ExportFormat = ExportFormat.GIF


class PlanTransformationRequest(BaseModel):
    """Request to plan transformation animation."""
    character_id: str
    duration_ms: int = Field(3000, ge=1000, le=5000)
    frame_rate: int = Field(24, ge=12, le=60)


class PlanFlightRequest(BaseModel):
    """Request to plan flight animation."""
    character_id: str
    duration_ms: int = Field(2000, ge=1000, le=5000)
    frame_rate: int = Field(24, ge=12, le=60)


class SpriteSheetLayoutRequest(BaseModel):
    """Request for sprite sheet layout calculation."""
    frame_count: int = Field(..., ge=1, le=100)
    frame_width: int = Field(256, ge=32, le=1024)
    frame_height: int = Field(256, ge=32, le=1024)
    max_columns: int = Field(8, ge=1, le=16)


# Endpoints
@router.get("/types")
async def list_animation_types():
    """Get list of available animation types."""
    return {
        "animation_types": [t.value for t in AnimationType],
    }


@router.get("/easings")
async def list_easing_functions():
    """Get list of available easing functions."""
    return {
        "easing_functions": [e.value for e in EasingFunction],
        "descriptions": {
            "linear": "Constant speed throughout",
            "ease_in": "Starts slow, accelerates",
            "ease_out": "Starts fast, decelerates",
            "ease_in_out": "Slow start and end, fast middle",
            "bounce": "Bouncing effect at the end",
            "elastic": "Elastic overshoot effect",
        }
    }


@router.get("/export-formats")
async def list_export_formats():
    """Get list of available export formats."""
    return {
        "export_formats": [f.value for f in ExportFormat],
        "descriptions": {
            "gif": "Animated GIF",
            "sprite_sheet": "Single image with all frames",
            "mp4": "MP4 video",
            "webm": "WebM video",
            "frames": "Individual frame images",
        }
    }


@router.get("/recommendations/{animation_type}")
async def get_animation_recommendations(animation_type: AnimationType):
    """Get recommended settings for an animation type."""
    agent = get_animation_agent()
    recommendations = await agent.get_animation_recommendations(animation_type)
    return recommendations


@router.post("/plan", response_model=AnimationResult)
async def plan_animation(request: PlanAnimationRequest):
    """Plan an animation sequence."""
    agent = get_animation_agent()

    anim_request = AnimationRequest(
        animation_type=request.animation_type,
        character_id=request.character_id,
        duration_ms=request.duration_ms,
        frame_rate=request.frame_rate,
        easing=request.easing,
        loop=request.loop,
        export_format=request.export_format,
    )

    result = await agent.create_animation(anim_request)
    return result


@router.post("/plan/transformation", response_model=AnimationResult)
async def plan_transformation_animation(request: PlanTransformationRequest):
    """Plan a transformation animation for a character."""
    agent = get_animation_agent()

    result = await agent.plan_transformation_animation(
        character_id=request.character_id,
        duration_ms=request.duration_ms,
        frame_rate=request.frame_rate,
    )

    return result


@router.post("/plan/flight", response_model=AnimationResult)
async def plan_flight_animation(request: PlanFlightRequest):
    """Plan a flight animation for a character."""
    agent = get_animation_agent()

    result = await agent.plan_flight_animation(
        character_id=request.character_id,
        duration_ms=request.duration_ms,
        frame_rate=request.frame_rate,
    )

    return result


@router.post("/sprite-sheet/layout")
async def calculate_sprite_sheet_layout(request: SpriteSheetLayoutRequest):
    """Calculate sprite sheet dimensions for an animation."""
    agent = get_animation_agent()

    layout = agent.calculate_sprite_sheet_layout(
        frame_count=request.frame_count,
        frame_width=request.frame_width,
        frame_height=request.frame_height,
        max_columns=request.max_columns,
    )

    return layout


@router.get("/plan/{character_id}/frames")
async def get_animation_frames(
    character_id: str,
    animation_type: AnimationType = Query(AnimationType.TRANSFORMATION),
    start_progress: float = Query(0.0, ge=0.0, le=1.0),
    end_progress: float = Query(1.0, ge=0.0, le=1.0),
    duration_ms: int = Query(3000, ge=500, le=10000),
):
    """Get frames for a specific progress range of an animation."""
    agent = get_animation_agent()

    # Create animation plan
    if animation_type == AnimationType.TRANSFORMATION:
        result = await agent.plan_transformation_animation(
            character_id=character_id,
            duration_ms=duration_ms,
        )
    elif animation_type == AnimationType.FLIGHT:
        result = await agent.plan_flight_animation(
            character_id=character_id,
            duration_ms=duration_ms,
        )
    else:
        anim_request = AnimationRequest(
            animation_type=animation_type,
            character_id=character_id,
            duration_ms=duration_ms,
        )
        result = await agent.create_animation(anim_request)

    if not result.success or not result.plan:
        raise HTTPException(status_code=500, detail=result.error_message or "Failed to plan animation")

    # Get frames in progress range
    frames = agent.get_frames_for_progress_range(
        plan=result.plan,
        start_progress=start_progress,
        end_progress=end_progress,
    )

    return {
        "character_id": character_id,
        "animation_type": animation_type.value,
        "start_progress": start_progress,
        "end_progress": end_progress,
        "total_frames_in_range": len(frames),
        "frames": frames,
    }
