"""
Image Generation API router for Super Wings Simulator.
Provides endpoints for character, background, and UI image generation.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ...core.agents import (
    get_character_image_agent,
    PortraitType,
    ImageCategory,
    CharacterState,
    CharacterExpression,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class PortraitRequest(BaseModel):
    """Request for portrait generation."""
    character_id: str
    portrait_type: str = "front_view"
    additional_details: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class StateImageRequest(BaseModel):
    """Request for state image generation."""
    character_id: str
    state: str
    additional_details: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class ExpressionImageRequest(BaseModel):
    """Request for expression image generation."""
    character_id: str
    expression: str
    additional_details: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class BatchPortraitRequest(BaseModel):
    """Request for batch portrait generation."""
    character_id: str
    portrait_types: Optional[List[str]] = None  # None = all types
    save_to_disk: bool = True


class CharacterPackRequest(BaseModel):
    """Request for full character pack generation."""
    character_id: str
    include_portraits: bool = True
    include_states: bool = True
    include_expressions: bool = True
    save_to_disk: bool = True


class ImageResponse(BaseModel):
    """Response for image generation."""
    success: bool
    character_id: str
    category: str
    images: List[Dict[str, Any]] = []
    prompt_used: str = ""
    generation_time_ms: float = 0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class BatchResponse(BaseModel):
    """Response for batch generation."""
    total_requested: int
    total_completed: int
    total_failed: int
    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []


@router.get("/character/types")
async def get_character_types() -> Dict[str, Any]:
    """
    Get available character image types.
    """
    return {
        "portrait_types": [p.value for p in PortraitType],
        "states": [s.value for s in CharacterState],
        "expressions": [e.value for e in CharacterExpression],
        "categories": [c.value for c in ImageCategory],
    }


@router.get("/character/list")
async def list_characters() -> Dict[str, Any]:
    """
    List all available characters for image generation.
    """
    try:
        agent = get_character_image_agent()
        characters = agent.get_available_characters()

        return {
            "characters": characters,
            "total": len(characters),
        }
    except Exception as e:
        logger.error(f"Failed to list characters: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list characters: {str(e)}"
        )


@router.post("/character/portrait", response_model=ImageResponse)
async def generate_portrait(request: PortraitRequest) -> ImageResponse:
    """
    Generate a character portrait.
    """
    try:
        agent = get_character_image_agent()

        # Parse portrait type
        try:
            portrait_type = PortraitType(request.portrait_type)
        except ValueError:
            portrait_type = PortraitType.FRONT_VIEW

        result = await agent.generate_portrait(
            character_id=request.character_id,
            portrait_type=portrait_type,
            additional_details=request.additional_details,
            save_to_disk=request.save_to_disk,
            output_filename=request.output_filename,
        )

        return ImageResponse(
            success=result.success,
            character_id=result.character_id,
            category=result.category,
            images=result.images,
            prompt_used=result.prompt_used,
            generation_time_ms=result.generation_time_ms,
            error_message=result.error_message,
            metadata=result.metadata,
        )

    except Exception as e:
        logger.error(f"Portrait generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Portrait generation failed: {str(e)}"
        )


@router.post("/character/state", response_model=ImageResponse)
async def generate_state_image(request: StateImageRequest) -> ImageResponse:
    """
    Generate a character state image.
    """
    try:
        agent = get_character_image_agent()

        # Parse state
        try:
            state = CharacterState(request.state)
        except ValueError:
            state = CharacterState.IDLE

        result = await agent.generate_state_image(
            character_id=request.character_id,
            state=state,
            additional_details=request.additional_details,
            save_to_disk=request.save_to_disk,
            output_filename=request.output_filename,
        )

        return ImageResponse(
            success=result.success,
            character_id=result.character_id,
            category=result.category,
            images=result.images,
            prompt_used=result.prompt_used,
            generation_time_ms=result.generation_time_ms,
            error_message=result.error_message,
            metadata=result.metadata,
        )

    except Exception as e:
        logger.error(f"State image generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"State image generation failed: {str(e)}"
        )


@router.post("/character/expression", response_model=ImageResponse)
async def generate_expression_image(request: ExpressionImageRequest) -> ImageResponse:
    """
    Generate a character expression image.
    """
    try:
        agent = get_character_image_agent()

        # Parse expression
        try:
            expression = CharacterExpression(request.expression)
        except ValueError:
            expression = CharacterExpression.HAPPY

        result = await agent.generate_expression_image(
            character_id=request.character_id,
            expression=expression,
            additional_details=request.additional_details,
            save_to_disk=request.save_to_disk,
            output_filename=request.output_filename,
        )

        return ImageResponse(
            success=result.success,
            character_id=result.character_id,
            category=result.category,
            images=result.images,
            prompt_used=result.prompt_used,
            generation_time_ms=result.generation_time_ms,
            error_message=result.error_message,
            metadata=result.metadata,
        )

    except Exception as e:
        logger.error(f"Expression image generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Expression image generation failed: {str(e)}"
        )


@router.post("/character/batch/portraits", response_model=BatchResponse)
async def generate_all_portraits(request: BatchPortraitRequest) -> BatchResponse:
    """
    Generate all portrait types for a character.
    """
    try:
        agent = get_character_image_agent()

        result = await agent.generate_all_portraits(
            character_id=request.character_id,
            save_to_disk=request.save_to_disk,
        )

        return BatchResponse(
            total_requested=result.total_requested,
            total_completed=result.total_completed,
            total_failed=result.total_failed,
            results=[r.model_dump() for r in result.results],
            errors=result.errors,
        )

    except Exception as e:
        logger.error(f"Batch portrait generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Batch portrait generation failed: {str(e)}"
        )


@router.post("/character/batch/states", response_model=BatchResponse)
async def generate_all_states(request: BatchPortraitRequest) -> BatchResponse:
    """
    Generate all state images for a character.
    """
    try:
        agent = get_character_image_agent()

        result = await agent.generate_all_states(
            character_id=request.character_id,
            save_to_disk=request.save_to_disk,
        )

        return BatchResponse(
            total_requested=result.total_requested,
            total_completed=result.total_completed,
            total_failed=result.total_failed,
            results=[r.model_dump() for r in result.results],
            errors=result.errors,
        )

    except Exception as e:
        logger.error(f"Batch state generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Batch state generation failed: {str(e)}"
        )


@router.post("/character/batch/expressions", response_model=BatchResponse)
async def generate_all_expressions(request: BatchPortraitRequest) -> BatchResponse:
    """
    Generate all expression images for a character.
    """
    try:
        agent = get_character_image_agent()

        result = await agent.generate_all_expressions(
            character_id=request.character_id,
            save_to_disk=request.save_to_disk,
        )

        return BatchResponse(
            total_requested=result.total_requested,
            total_completed=result.total_completed,
            total_failed=result.total_failed,
            results=[r.model_dump() for r in result.results],
            errors=result.errors,
        )

    except Exception as e:
        logger.error(f"Batch expression generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Batch expression generation failed: {str(e)}"
        )


@router.post("/character/pack")
async def generate_character_pack(request: CharacterPackRequest) -> Dict[str, Any]:
    """
    Generate a complete image pack for a character.
    Includes all portraits, states, and expressions based on request.
    """
    try:
        agent = get_character_image_agent()

        results = await agent.generate_character_pack(
            character_id=request.character_id,
            include_portraits=request.include_portraits,
            include_states=request.include_states,
            include_expressions=request.include_expressions,
            save_to_disk=request.save_to_disk,
        )

        # Convert results to serializable format
        response = {
            "character_id": request.character_id,
            "categories": {},
            "summary": {
                "total_generated": 0,
                "total_failed": 0,
            }
        }

        for category, batch_result in results.items():
            response["categories"][category] = {
                "total_requested": batch_result.total_requested,
                "total_completed": batch_result.total_completed,
                "total_failed": batch_result.total_failed,
                "errors": batch_result.errors,
            }
            response["summary"]["total_generated"] += batch_result.total_completed
            response["summary"]["total_failed"] += batch_result.total_failed

        return response

    except Exception as e:
        logger.error(f"Character pack generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Character pack generation failed: {str(e)}"
        )


@router.websocket("/character/ws/{session_id}")
async def character_image_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming character image generation progress.

    Message format (client -> server):
    {
        "type": "portrait" | "state" | "expression" | "pack",
        "character_id": "jett",
        "portrait_type": "front_view",
        "state": "idle",
        "expression": "happy",
        ...
    }

    Response format (server -> client):
    {
        "type": "started" | "progress" | "completed" | "error",
        "character_id": "jett",
        "category": "portrait",
        "images": [...],
        "progress": 0.0-1.0,
        "error": "..."
    }
    """
    await websocket.accept()
    logger.info(f"Character image WebSocket connected: session={session_id}")

    try:
        agent = get_character_image_agent()

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type", "portrait")
            character_id = message.get("character_id", "jett")

            try:
                await websocket.send_json({
                    "type": "started",
                    "character_id": character_id,
                    "message": f"Starting {msg_type} generation"
                })

                if msg_type == "portrait":
                    # Parse portrait type
                    try:
                        portrait_type = PortraitType(message.get("portrait_type", "front_view"))
                    except ValueError:
                        portrait_type = PortraitType.FRONT_VIEW

                    result = await agent.generate_portrait(
                        character_id=character_id,
                        portrait_type=portrait_type,
                        additional_details=message.get("additional_details"),
                        save_to_disk=message.get("save_to_disk", True),
                    )

                elif msg_type == "state":
                    try:
                        state = CharacterState(message.get("state", "idle"))
                    except ValueError:
                        state = CharacterState.IDLE

                    result = await agent.generate_state_image(
                        character_id=character_id,
                        state=state,
                        additional_details=message.get("additional_details"),
                        save_to_disk=message.get("save_to_disk", True),
                    )

                elif msg_type == "expression":
                    try:
                        expression = CharacterExpression(message.get("expression", "happy"))
                    except ValueError:
                        expression = CharacterExpression.HAPPY

                    result = await agent.generate_expression_image(
                        character_id=character_id,
                        expression=expression,
                        additional_details=message.get("additional_details"),
                        save_to_disk=message.get("save_to_disk", True),
                    )

                else:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Unknown type: {msg_type}"
                    })
                    continue

                # Send completion
                await websocket.send_json({
                    "type": "completed",
                    "character_id": character_id,
                    "category": result.category,
                    "success": result.success,
                    "images": result.images,
                    "prompt_used": result.prompt_used,
                    "generation_time_ms": result.generation_time_ms,
                    "error_message": result.error_message,
                })

            except Exception as e:
                logger.error(f"Generation error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "character_id": character_id,
                    "error": str(e)
                })

    except WebSocketDisconnect:
        logger.info(f"Character image WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"Character image WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass
