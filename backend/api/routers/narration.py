"""
Narration API router for Super Wings Simulator.
Provides mission narration generation with WebSocket streaming support.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ...core.agents import (
    get_narrator_agent,
    NarrationRequest,
    NarrationPhase,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class NarrationRequestBody(BaseModel):
    """Request body for narration generation."""
    character_id: str
    phase: str
    location: str
    problem: Optional[str] = None
    solution: Optional[str] = None
    npc_name: Optional[str] = None
    conditions: Optional[str] = None
    current_area: Optional[str] = None
    result: Optional[str] = None


class NarrationResponse(BaseModel):
    """Response for narration."""
    character_id: str
    phase: str
    narration: str
    location: str


class FullMissionNarrationRequest(BaseModel):
    """Request body for full mission narration."""
    character_id: str
    location: str
    problem: str
    solution: str
    npc_name: str
    include_phases: Optional[List[str]] = None


class FullMissionNarrationResponse(BaseModel):
    """Response for full mission narration."""
    character_id: str
    location: str
    narrations: Dict[str, str]
    full_story: str


@router.post("/generate", response_model=NarrationResponse)
async def generate_narration(request: NarrationRequestBody) -> NarrationResponse:
    """
    Generate narration for a specific mission phase.
    """
    try:
        agent = get_narrator_agent()

        # Parse phase
        try:
            phase = NarrationPhase(request.phase)
        except ValueError:
            phase = NarrationPhase.DEPARTURE

        narration_request = NarrationRequest(
            character_id=request.character_id,
            phase=phase,
            location=request.location,
            problem=request.problem,
            solution=request.solution,
            npc_name=request.npc_name,
            conditions=request.conditions,
            current_area=request.current_area,
            result=request.result,
        )

        narration = await agent.generate_narration(narration_request)

        return NarrationResponse(
            character_id=request.character_id,
            phase=request.phase,
            narration=narration.text,
            location=request.location,
        )

    except Exception as e:
        logger.error(f"Narration generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate narration: {str(e)}",
        )


@router.post("/full-mission", response_model=FullMissionNarrationResponse)
async def generate_full_mission_narration(
    request: FullMissionNarrationRequest,
) -> FullMissionNarrationResponse:
    """
    Generate narration for all phases of a mission.
    """
    try:
        agent = get_narrator_agent()

        # Parse included phases
        phases = None
        if request.include_phases:
            phases = []
            for p in request.include_phases:
                try:
                    phases.append(NarrationPhase(p))
                except ValueError:
                    pass

        result = await agent.narrate_full_mission(
            character_id=request.character_id,
            location=request.location,
            problem=request.problem,
            solution=request.solution,
            npc_name=request.npc_name,
            include_phases=phases,
        )

        return FullMissionNarrationResponse(
            character_id=request.character_id,
            location=request.location,
            narrations=result.get("narrations", {}),
            full_story=result.get("full_story", ""),
        )

    except Exception as e:
        logger.error(f"Full mission narration failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate full mission narration: {str(e)}",
        )


@router.get("/phases")
async def list_narration_phases() -> Dict[str, Any]:
    """
    List available narration phases.
    """
    phase_descriptions = {
        "departure": "Character takes off from World Airport",
        "flying": "Character travels to destination",
        "arrival": "Character arrives at mission location",
        "transformation": "Character transforms to solve the problem",
        "solving": "Character works on solving the problem",
        "success": "Problem is solved successfully",
        "return": "Character returns to World Airport",
    }

    return {
        "phases": [p.value for p in NarrationPhase],
        "descriptions": phase_descriptions,
        "typical_order": [
            "departure",
            "flying",
            "arrival",
            "transformation",
            "solving",
            "success",
            "return",
        ],
    }


@router.websocket("/ws/{session_id}")
async def narration_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming narration generation.

    Message format (client -> server):
    {
        "type": "narrate" | "full_mission",
        "character_id": "jett",
        "phase": "departure",  # for "narrate" type
        "location": "Paris",
        "problem": "...",
        "solution": "...",
        "npc_name": "...",
        ...other fields...
    }

    Response format (server -> client):
    {
        "type": "narration_token" | "narration_complete" | "error",
        "token": "...",
        "phase": "departure",
        "full_narration": "...",
        "narrations": {...}  # for full_mission
    }
    """
    await websocket.accept()
    logger.info(f"Narration WebSocket connected: session={session_id}")

    try:
        agent = get_narrator_agent()

        while True:
            # Receive message
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type", "narrate")

            try:
                if msg_type == "narrate":
                    # Parse phase
                    try:
                        phase = NarrationPhase(message.get("phase", "departure"))
                    except ValueError:
                        phase = NarrationPhase.DEPARTURE

                    request = NarrationRequest(
                        character_id=message.get("character_id", "jett"),
                        phase=phase,
                        location=message.get("location", ""),
                        problem=message.get("problem"),
                        solution=message.get("solution"),
                        npc_name=message.get("npc_name"),
                        conditions=message.get("conditions"),
                        current_area=message.get("current_area"),
                        result=message.get("result"),
                    )

                    # Stream narration
                    full_narration = ""
                    async for token in agent.stream_narration(request):
                        full_narration += token
                        await websocket.send_json({
                            "type": "narration_token",
                            "token": token,
                            "phase": phase.value,
                        })

                    # Send completion
                    await websocket.send_json({
                        "type": "narration_complete",
                        "character_id": message.get("character_id", "jett"),
                        "phase": phase.value,
                        "full_narration": full_narration,
                        "location": message.get("location", ""),
                    })

                elif msg_type == "full_mission":
                    # Generate all narrations for a mission
                    # This is non-streaming but returns multiple narrations

                    phases = None
                    if message.get("include_phases"):
                        phases = []
                        for p in message["include_phases"]:
                            try:
                                phases.append(NarrationPhase(p))
                            except ValueError:
                                pass

                    result = await agent.narrate_full_mission(
                        character_id=message.get("character_id", "jett"),
                        location=message.get("location", ""),
                        problem=message.get("problem", ""),
                        solution=message.get("solution", ""),
                        npc_name=message.get("npc_name", ""),
                        include_phases=phases,
                    )

                    await websocket.send_json({
                        "type": "narration_complete",
                        "character_id": message.get("character_id", "jett"),
                        "location": message.get("location", ""),
                        "narrations": result.get("narrations", {}),
                        "full_story": result.get("full_story", ""),
                    })

                else:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Unknown message type: {msg_type}",
                    })

            except Exception as e:
                logger.error(f"Narration generation error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "error": str(e),
                })

    except WebSocketDisconnect:
        logger.info(f"Narration WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"Narration WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass
