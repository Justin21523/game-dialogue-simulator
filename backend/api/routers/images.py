"""
Image Selection API router for Super Wings Simulator.
Provides AI-powered image selection based on context.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ...core.agents.image_selector import (
    get_image_selector,
    ImageMatch,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class ImageSelectionRequest(BaseModel):
    """Request body for image selection."""
    character_id: str
    context: Optional[str] = None
    emotion: Optional[str] = None
    action: Optional[str] = None
    mission_type: Optional[str] = None
    game_state: Optional[str] = None
    prefer_variant: Optional[int] = None


class ImageSelectionResponse(BaseModel):
    """Response for image selection."""
    character_id: str
    image_path: str
    filename: str
    category: str
    confidence: float
    alternatives: List[str]


class TransformSequenceResponse(BaseModel):
    """Response for transformation sequence."""
    character_id: str
    frames: List[str]
    frame_count: int


@router.post("/select", response_model=ImageSelectionResponse)
async def select_image(request: ImageSelectionRequest) -> ImageSelectionResponse:
    """
    Select the best image for a character based on context.

    Uses AI-powered matching to find the most appropriate image
    from the character's image library.
    """
    try:
        selector = get_image_selector()

        result = selector.select_image(
            character_id=request.character_id,
            context=request.context,
            emotion=request.emotion,
            action=request.action,
            mission_type=request.mission_type,
            game_state=request.game_state,
            prefer_variant=request.prefer_variant,
        )

        return ImageSelectionResponse(
            character_id=result.character_id,
            image_path=result.image_path,
            filename=result.filename,
            category=result.category,
            confidence=result.confidence,
            alternatives=result.alternatives,
        )

    except Exception as e:
        logger.error(f"Image selection failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to select image: {str(e)}",
        )


@router.get("/select/{character_id}")
async def select_image_get(
    character_id: str,
    emotion: Optional[str] = Query(None, description="Character emotion"),
    action: Optional[str] = Query(None, description="Character action"),
    mission_type: Optional[str] = Query(None, description="Mission type"),
    game_state: Optional[str] = Query(None, description="Game state"),
    context: Optional[str] = Query(None, description="Free-text context"),
) -> ImageSelectionResponse:
    """
    Select the best image using GET request (for simpler integrations).
    """
    try:
        selector = get_image_selector()

        result = selector.select_image(
            character_id=character_id,
            context=context,
            emotion=emotion,
            action=action,
            mission_type=mission_type,
            game_state=game_state,
        )

        return ImageSelectionResponse(
            character_id=result.character_id,
            image_path=result.image_path,
            filename=result.filename,
            category=result.category,
            confidence=result.confidence,
            alternatives=result.alternatives,
        )

    except Exception as e:
        logger.error(f"Image selection failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to select image: {str(e)}",
        )


@router.get("/dialogue/{character_id}")
async def select_for_dialogue(
    character_id: str,
    dialogue_type: str = Query("conversation", description="Type of dialogue"),
    emotion: str = Query("neutral", description="Character emotion"),
) -> ImageSelectionResponse:
    """
    Select image appropriate for dialogue display.
    """
    try:
        selector = get_image_selector()

        result = selector.select_for_dialogue(
            character_id=character_id,
            dialogue_type=dialogue_type,
            emotion=emotion,
        )

        return ImageSelectionResponse(
            character_id=result.character_id,
            image_path=result.image_path,
            filename=result.filename,
            category=result.category,
            confidence=result.confidence,
            alternatives=result.alternatives,
        )

    except Exception as e:
        logger.error(f"Dialogue image selection failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to select image: {str(e)}",
        )


@router.get("/mission/{character_id}")
async def select_for_mission(
    character_id: str,
    mission_type: str = Query(..., description="Type of mission"),
    phase: str = Query("active", description="Mission phase (start, active, end)"),
) -> ImageSelectionResponse:
    """
    Select image appropriate for mission display.
    """
    try:
        selector = get_image_selector()

        result = selector.select_for_mission(
            character_id=character_id,
            mission_type=mission_type,
            phase=phase,
        )

        return ImageSelectionResponse(
            character_id=result.character_id,
            image_path=result.image_path,
            filename=result.filename,
            category=result.category,
            confidence=result.confidence,
            alternatives=result.alternatives,
        )

    except Exception as e:
        logger.error(f"Mission image selection failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to select image: {str(e)}",
        )


@router.get("/transform/{character_id}")
async def get_transformation_sequence(
    character_id: str,
    frame_count: Optional[int] = Query(None, description="Number of frames to return"),
    use_interpolated: bool = Query(True, description="Use interpolated frames"),
) -> TransformSequenceResponse:
    """
    Get transformation sequence frames for a character.
    """
    try:
        selector = get_image_selector()

        if use_interpolated:
            # Get all interpolated frames
            frames_folder = f"assets/images/characters/{character_id}/animations/transform_animation"
            catalog = selector._image_catalog.get(character_id, {})
            frames = catalog.get("transform_animation", [])

            if frames:
                frames = sorted(frames)
                if frame_count:
                    # Select evenly distributed frames
                    step = max(1, len(frames) // frame_count)
                    frames = frames[::step][:frame_count]

                return TransformSequenceResponse(
                    character_id=character_id,
                    frames=[f"{frames_folder}/{f}" for f in frames],
                    frame_count=len(frames),
                )

        # Fallback to stage images
        frames = selector.select_transformation_sequence(
            character_id=character_id,
            stage_count=frame_count or 5
        )

        return TransformSequenceResponse(
            character_id=character_id,
            frames=frames,
            frame_count=len(frames),
        )

    except Exception as e:
        logger.error(f"Transformation sequence retrieval failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get transformation sequence: {str(e)}",
        )


@router.get("/catalog")
async def get_image_catalog() -> Dict[str, Any]:
    """
    Get the full image catalog statistics.
    """
    try:
        selector = get_image_selector()
        return {
            "characters": selector.get_catalog_stats(),
            "total_characters": len(selector._image_catalog),
        }

    except Exception as e:
        logger.error(f"Catalog retrieval failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get catalog: {str(e)}",
        )


@router.get("/categories")
async def list_categories() -> Dict[str, Any]:
    """
    List available image categories and mappings.
    """
    from ...core.agents.image_selector import (
        ImageCategory,
        EmotionType,
        ActionType,
        IMAGE_MAPPINGS,
    )

    return {
        "categories": [c.value for c in ImageCategory],
        "emotions": [e.value for e in EmotionType],
        "actions": [a.value for a in ActionType],
        "keywords": list(IMAGE_MAPPINGS.keys()),
    }


# ===== 新增：場景背景與飛行背景選擇端點 =====


class SceneBackgroundRequest(BaseModel):
    """Request for scene background selection."""
    location: str
    time_of_day: str = "afternoon"
    weather: str = "clear"
    season: str = "summer"
    style: str = "cartoon"


class FlightBackgroundRequest(BaseModel):
    """Request for flight background selection."""
    time_of_day: str = "afternoon"
    weather: str = "clear"
    altitude: str = "high"
    mission_type: str = "delivery"
    destination: str = "unknown"
    style: str = "cartoon"


@router.post("/select-scene-background")
async def select_scene_background(request: SceneBackgroundRequest) -> Dict[str, Any]:
    """
    Select background image for exploration scenes.

    Returns a scene background based on location, time, weather, and season.
    """
    try:
        import random

        logger.info(f"Scene background requested: {request.location}, {request.time_of_day}, {request.weather}")

        # 根據天氣和時間選擇天空背景
        weather_map = {
            "clear": "blue_sky",
            "cloudy": "cloudy_overcast",
            "rainy": "rainy_sky",
            "stormy": "stormy_sky",
            "snowy": "rainy_sky"  # 使用 rainy 作為 snowy 的替代
        }

        time_map = {
            "morning": "sunrise_sky",
            "afternoon": "blue_sky",
            "evening": "sunset_sky",
            "night": "night_sky"
        }

        # 優先使用天氣，其次使用時間
        if request.weather in weather_map:
            base_name = weather_map[request.weather]
        elif request.time_of_day in time_map:
            base_name = time_map[request.time_of_day]
        else:
            base_name = "blue_sky"

        # 隨機選擇變體 v1, v2, 或 v3
        variant = random.choice(["v1", "v2", "v3"])
        image_path = f"assets/images/backgrounds/sky/{base_name}_{variant}.png"

        logger.info(f"Selected background: {image_path}")

        return {
            "primary": image_path,
            "filename": f"{base_name}_{variant}.png",
            "category": "scene_background",
            "confidence": 0.9,
            "alternatives": [],
            "offline": False
        }
    except Exception as e:
        logger.error(f"Scene background selection failed: {e}")
        # Fallback 到預設圖片
        return {
            "primary": "assets/images/backgrounds/sky/blue_sky_v1.png",
            "filename": "blue_sky_v1.png",
            "category": "scene_background",
            "confidence": 0.5,
            "alternatives": [],
            "offline": True
        }


@router.post("/select-flight-background")
async def select_flight_background(request: FlightBackgroundRequest) -> Dict[str, Any]:
    """
    Select background image for flight scenes.

    Returns a flight background based on time, weather, altitude, etc.
    """
    try:
        import random

        logger.info(f"Flight background requested: {request.time_of_day}, {request.weather}, {request.altitude}")

        # 飛行場景主要使用天空背景（sky gradient 系列）
        weather_sky_map = {
            "clear": "sky_blue_gradient",
            "cloudy": "sky_cloudy_gradient",
            "rainy": "sky_rainy_gradient",
            "stormy": "sky_stormy_gradient",
            "sunset": "sky_sunset_gradient",
            "sunrise": "sky_sunrise_gradient"
        }

        time_sky_map = {
            "morning": "sky_sunrise_gradient",
            "afternoon": "sky_blue_gradient",
            "evening": "sky_sunset_gradient",
            "night": "sky_night_gradient"
        }

        # 優先使用天氣，其次使用時間
        if request.weather in weather_sky_map:
            base_name = weather_sky_map[request.weather]
        elif request.time_of_day in time_sky_map:
            base_name = time_sky_map[request.time_of_day]
        else:
            base_name = "sky_blue_gradient"

        # 隨機選擇變體 v1, v2, 或 v3
        variant = random.choice(["v1", "v2", "v3"])
        image_path = f"assets/images/backgrounds/sky/{base_name}_{variant}.png"

        logger.info(f"Selected flight background: {image_path}")

        return {
            "primary": image_path,
            "filename": f"{base_name}_{variant}.png",
            "category": "flight_background",
            "confidence": 0.9,
            "alternatives": [],
            "offline": False
        }
    except Exception as e:
        logger.error(f"Flight background selection failed: {e}")
        # Fallback 到預設圖片
        return {
            "primary": "assets/images/backgrounds/sky/sky_blue_gradient_v1.png",
            "filename": "sky_blue_gradient_v1.png",
            "category": "flight_background",
            "confidence": 0.5,
            "alternatives": [],
            "offline": True
        }
