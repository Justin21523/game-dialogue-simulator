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
from backend.core.asset_manifest import get_asset_manifest

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


# ===== Asset Manifest Endpoints =====

@router.get("/manifest")
async def get_manifest(
    force_scan: bool = Query(False, description="強制重新掃描資產（忽略快取）"),
):
    """
    取得完整資產清單（供前端使用）

    這個端點返回所有可用資產的清單，包括：
    - 背景圖片（按目的地分類）
    - 建築物（按類型分類）
    - NPC（按原型分類）
    - 物品（按類型分類）
    - 3D 模型

    Returns:
        包含所有資產清單和統計資訊的字典
    """
    manifest = get_asset_manifest(force_scan=force_scan)

    return {
        "backgrounds": dict(manifest.backgrounds),
        "buildings": dict(manifest.buildings),
        "npcs": dict(manifest.npcs),
        "items": dict(manifest.items),
        "models_3d": dict(manifest.models_3d),
        "stats": {
            "total_backgrounds": manifest.stats['total_backgrounds'],
            "total_buildings": manifest.stats['total_buildings'],
            "total_npcs": manifest.stats['total_npcs'],
            "total_items": manifest.stats['total_items'],
            "total_3d_models": manifest.stats['total_3d_models'],
            "destinations": len([k for k in manifest.backgrounds.keys() if k not in ['sky', 'clouds']]),
            "building_types": len(manifest.buildings.keys()),
            "npc_archetypes": len(manifest.npcs.keys()),
            "item_types": len(manifest.items.keys()),
            "scan_time": manifest.stats.get('scan_time', 0),
        }
    }


@router.get("/manifest/backgrounds")
async def get_available_backgrounds(
    destination: Optional[str] = Query(None, description="目的地（例如 'paris'）"),
):
    """
    取得可用的背景資產 keys

    Args:
        destination: 特定目的地。如果不指定，返回所有背景。

    Returns:
        背景 keys 列表
    """
    manifest = get_asset_manifest()

    if destination:
        backgrounds = manifest.get_available_backgrounds(destination)
        return {
            "destination": destination,
            "backgrounds": backgrounds,
            "count": len(backgrounds)
        }
    else:
        # 返回所有目的地
        all_dest = {
            dest: manifest.get_available_backgrounds(dest)
            for dest in manifest.backgrounds.keys()
            if dest not in ['sky', 'clouds']
        }
        return {
            "destinations": all_dest,
            "total_destinations": len(all_dest),
            "total_backgrounds": sum(len(v) for v in all_dest.values())
        }


@router.get("/manifest/buildings")
async def get_available_buildings(
    building_type: Optional[str] = Query(None, description="建築類型（例如 'cafe'）"),
):
    """
    取得可用的建築資產 keys

    Args:
        building_type: 特定建築類型。如果不指定，返回所有建築。

    Returns:
        建築 keys 列表
    """
    manifest = get_asset_manifest()

    if building_type:
        buildings = manifest.get_available_buildings(building_type)
        return {
            "building_type": building_type,
            "buildings": buildings,
            "count": len(buildings)
        }
    else:
        return {
            "building_types": dict(manifest.buildings),
            "total_types": len(manifest.buildings),
            "total_buildings": sum(len(v) for v in manifest.buildings.values())
        }


@router.get("/manifest/npcs")
async def get_available_npcs(
    archetype: Optional[str] = Query(None, description="NPC 原型（例如 'citizen'）"),
):
    """
    取得可用的 NPC 資產 keys

    Args:
        archetype: 特定 NPC 原型。如果不指定，返回所有 NPC。

    Returns:
        NPC keys 列表
    """
    manifest = get_asset_manifest()

    if archetype:
        npcs = manifest.get_available_npcs(archetype)
        return {
            "archetype": archetype,
            "npcs": npcs,
            "count": len(npcs)
        }
    else:
        return {
            "archetypes": dict(manifest.npcs),
            "total_archetypes": len(manifest.npcs),
            "total_npcs": sum(len(v) for v in manifest.npcs.values())
        }


@router.get("/manifest/items")
async def get_available_items(
    item_type: Optional[str] = Query(None, description="物品類型（例如 'collectible'）"),
):
    """
    取得可用的物品資產 keys

    Args:
        item_type: 特定物品類型。如果不指定，返回所有物品。

    Returns:
        物品 keys 列表
    """
    manifest = get_asset_manifest()

    if item_type:
        items = manifest.get_available_items(item_type)
        return {
            "item_type": item_type,
            "items": items,
            "count": len(items)
        }
    else:
        return {
            "item_types": dict(manifest.items),
            "total_types": len(manifest.items),
            "total_items": sum(len(v) for v in manifest.items.values())
        }


@router.post("/manifest/invalidate")
async def invalidate_manifest_cache():
    """
    清除資產清單快取，強制下次重新掃描

    這個端點用於開發階段，當添加新資產後需要重新掃描時使用。
    """
    from backend.core.asset_manifest import invalidate_cache
    invalidate_cache()
    return {
        "message": "快取已清除，下次調用會重新掃描資產",
        "status": "success"
    }
