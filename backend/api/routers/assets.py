"""
Mission asset packaging API endpoints.
"""

from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import asyncio

from backend.core.agents import (
    get_packager_agent,
    PackageQuality,
    MissionAssetConfig,
    PackageRequest,
    PackageResult,
    GenerationProgress,
)
from backend.core.agents.background_generator import SkyType, WorldLocation
from backend.core.agents.ui_asset_generator import MissionIcon

router = APIRouter()


# Security utilities
def validate_asset_path(user_path: str, base_dir: Optional[Path] = None) -> Path:
    """
    Validate that a user-provided path is within the allowed directory.

    Args:
        user_path: User-provided path (potentially malicious)
        base_dir: Base directory to restrict access (defaults to ./assets)

    Returns:
        Validated absolute Path object

    Raises:
        HTTPException: If path is outside allowed directory
    """
    if base_dir is None:
        base_dir = Path("./assets").resolve()
    else:
        base_dir = base_dir.resolve()

    try:
        # Resolve the user path and check if it's within base_dir
        requested = Path(user_path).resolve()
        requested.relative_to(base_dir)
        return requested
    except ValueError:
        # Path is outside base_dir
        raise HTTPException(
            status_code=400,
            detail=f"Invalid path: must be within {base_dir}"
        )


# Request models
class QuickPackRequest(BaseModel):
    """Request for quick asset pack."""
    character_id: str
    location: str = "paris"


class FullPackRequest(BaseModel):
    """Request for full asset pack."""
    character_id: str
    location: str = "paris"
    supporting_characters: List[str] = []
    dialogue_lines: List[dict] = []


class MissionPackageRequest(BaseModel):
    """Request for custom mission package."""
    mission_name: str
    main_character_id: str
    supporting_characters: List[str] = []
    location: str = "paris"
    sky_type: str = "blue_sky"
    time_of_day: str = "day"
    mission_type: str = "delivery"

    # Generation options
    include_portraits: bool = True
    include_states: bool = True
    include_expressions: bool = True
    include_transformation: bool = True
    include_scenes: bool = True
    include_voice: bool = False
    include_sounds: bool = True
    include_animations: bool = True

    # Quality
    quality: PackageQuality = PackageQuality.MEDIUM

    # Dialogue
    dialogue_lines: List[dict] = []

    # Output options
    output_dir: Optional[str] = None
    create_zip: bool = False


class ValidatePackageRequest(BaseModel):
    """Request to validate a package."""
    manifest_path: str


# Endpoints
@router.get("/status")
async def packager_status():
    """Get asset packager service status."""
    agent = get_packager_agent()
    return {
        "name": agent.name,
        "output_base_dir": str(agent.output_base_dir),
        "available_characters": agent.get_available_characters(),
        "available_locations": agent.get_available_locations(),
    }


@router.get("/characters")
async def list_available_characters():
    """Get list of available characters for asset generation."""
    agent = get_packager_agent()
    return {
        "characters": agent.get_available_characters(),
    }


@router.get("/locations")
async def list_available_locations():
    """Get list of available world locations."""
    agent = get_packager_agent()
    return {
        "locations": agent.get_available_locations(),
    }


@router.get("/quality-levels")
async def list_quality_levels():
    """Get list of quality levels with descriptions."""
    return {
        "quality_levels": [q.value for q in PackageQuality],
        "descriptions": {
            "low": "Fast generation with minimal assets (2 portraits, 3 keyframes)",
            "medium": "Balanced quality and speed (4 portraits, 5 keyframes)",
            "high": "Full quality with all assets (8 portraits, 8 keyframes)",
        }
    }


@router.get("/mission-icons")
async def list_mission_icons():
    """Get list of available mission icons."""
    return {
        "mission_icons": [m.value for m in MissionIcon],
    }


@router.get("/sky-types")
async def list_sky_types():
    """Get list of available sky types."""
    return {
        "sky_types": [s.value for s in SkyType],
    }


@router.get("/progress")
async def get_generation_progress():
    """Get current generation progress."""
    agent = get_packager_agent()
    progress = agent.get_current_progress()
    if progress:
        return progress.model_dump()
    return {"status": "idle", "message": "No generation in progress"}


@router.post("/generate/quick", response_model=PackageResult)
async def generate_quick_pack(request: QuickPackRequest):
    """Generate a quick asset pack with minimal assets."""
    agent = get_packager_agent()

    # Validate character
    if request.character_id.lower() not in agent.get_available_characters():
        raise HTTPException(status_code=404, detail=f"Character not found: {request.character_id}")

    result = await agent.generate_quick_pack(
        character_id=request.character_id,
        location=request.location,
    )

    return result


@router.post("/generate/full", response_model=PackageResult)
async def generate_full_pack(request: FullPackRequest):
    """Generate a full asset pack with all assets."""
    agent = get_packager_agent()

    # Validate character
    if request.character_id.lower() not in agent.get_available_characters():
        raise HTTPException(status_code=404, detail=f"Character not found: {request.character_id}")

    result = await agent.generate_full_pack(
        character_id=request.character_id,
        location=request.location,
        supporting_characters=request.supporting_characters,
        dialogue_lines=request.dialogue_lines,
    )

    return result


@router.post("/generate/custom", response_model=PackageResult)
async def generate_custom_package(request: MissionPackageRequest):
    """Generate a custom mission asset package with specific options."""
    agent = get_packager_agent()

    # Validate character
    if request.main_character_id.lower() not in agent.get_available_characters():
        raise HTTPException(status_code=404, detail=f"Character not found: {request.main_character_id}")

    # Validate location
    try:
        location = WorldLocation(request.location.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid location: {request.location}")

    # Validate sky type
    try:
        sky_type = SkyType(request.sky_type.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid sky type: {request.sky_type}")

    # Validate mission icon
    try:
        mission_icon = MissionIcon(request.mission_type.lower())
    except ValueError:
        mission_icon = MissionIcon.DELIVERY

    config = MissionAssetConfig(
        main_character_id=request.main_character_id,
        supporting_characters=request.supporting_characters,
        location=location,
        sky_type=sky_type,
        time_of_day=request.time_of_day,
        mission_type=request.mission_type,
        mission_icon=mission_icon,
        include_portraits=request.include_portraits,
        include_states=request.include_states,
        include_expressions=request.include_expressions,
        include_transformation=request.include_transformation,
        include_scenes=request.include_scenes,
        include_voice=request.include_voice,
        include_sounds=request.include_sounds,
        include_animations=request.include_animations,
        quality=request.quality,
        dialogue_lines=request.dialogue_lines,
    )

    pkg_request = PackageRequest(
        mission_name=request.mission_name,
        config=config,
        output_dir=request.output_dir,
        create_zip=request.create_zip,
    )

    result = await agent.generate_package(pkg_request)
    return result


@router.post("/validate")
async def validate_package(request: ValidatePackageRequest):
    """Validate an existing package against its manifest."""
    # Validate path to prevent directory traversal attacks
    validated_path = validate_asset_path(request.manifest_path)

    agent = get_packager_agent()

    validation = await agent.validate_package(str(validated_path))
    return validation


@router.websocket("/ws/{session_id}")
async def package_generation_websocket(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time package generation progress."""
    await websocket.accept()
    agent = get_packager_agent()

    try:
        while True:
            progress = agent.get_current_progress()
            if progress:
                await websocket.send_json(progress.model_dump())

                # Check if complete
                if progress.progress_percent >= 100:
                    break
            else:
                await websocket.send_json({
                    "status": "idle",
                    "message": "Waiting for generation to start",
                })

            await asyncio.sleep(1)  # Poll every second

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({
            "error": str(e),
        })
