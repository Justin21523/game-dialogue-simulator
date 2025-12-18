"""
Tutorial API router for Super Wings Simulator.
Provides game tutorials and guidance with WebSocket streaming support.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ...core.agents import (
    get_tutorial_agent,
    TutorialRequest,
    TutorialHintRequest,
    TutorialType,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class TutorialExplainRequest(BaseModel):
    """Request body for tutorial explanation."""
    topic: str
    tutorial_type: Optional[str] = None
    character_id: Optional[str] = None
    player_level: Optional[int] = None
    language: str = "en"


class TutorialHintRequestBody(BaseModel):
    """Request body for game hints."""
    current_situation: str
    character_id: Optional[str] = None
    mission_type: Optional[str] = None
    player_progress: Optional[Dict[str, Any]] = None


class TutorialResponseBody(BaseModel):
    """Response for tutorial content."""
    topic: str
    content: str
    tips: List[str] = []
    related_topics: List[str] = []
    character_id: Optional[str] = None


@router.post("/explain", response_model=TutorialResponseBody)
async def explain_topic(request: TutorialExplainRequest) -> TutorialResponseBody:
    """
    Get a tutorial explanation for a game topic.
    """
    try:
        agent = get_tutorial_agent()

        # Convert string to enum
        tutorial_type = None
        if request.tutorial_type:
            try:
                tutorial_type = TutorialType(request.tutorial_type)
            except ValueError:
                pass

        tutorial_request = TutorialRequest(
            topic=request.topic,
            tutorial_type=tutorial_type,
            character_id=request.character_id,
            player_level=request.player_level,
            language=request.language,
        )

        response = await agent.explain_topic(tutorial_request)

        return TutorialResponseBody(
            topic=response.topic,
            content=response.content,
            tips=response.tips,
            related_topics=response.related_topics,
            character_id=response.character_id,
        )

    except Exception as e:
        logger.error(f"Tutorial explanation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate tutorial: {str(e)}",
        )


@router.post("/hint", response_model=TutorialResponseBody)
async def get_hint(request: TutorialHintRequestBody) -> TutorialResponseBody:
    """
    Get a contextual game hint.
    """
    try:
        agent = get_tutorial_agent()

        hint_request = TutorialHintRequest(
            current_situation=request.current_situation,
            character_id=request.character_id,
            mission_type=request.mission_type,
            player_progress=request.player_progress,
        )

        response = await agent.get_hint(hint_request)

        return TutorialResponseBody(
            topic=response.topic,
            content=response.content,
            tips=response.tips,
            related_topics=response.related_topics,
            character_id=response.character_id,
        )

    except Exception as e:
        logger.error(f"Hint generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate hint: {str(e)}",
        )


@router.get("/character/{character_id}", response_model=TutorialResponseBody)
async def get_character_guide(
    character_id: str,
    language: str = "en",
) -> TutorialResponseBody:
    """
    Get a comprehensive guide for a specific character.
    """
    try:
        agent = get_tutorial_agent()

        response = await agent.get_character_guide(
            character_id=character_id,
            language=language,
        )

        return TutorialResponseBody(
            topic=response.topic,
            content=response.content,
            tips=response.tips,
            related_topics=response.related_topics,
            character_id=response.character_id,
        )

    except Exception as e:
        logger.error(f"Character guide generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate character guide: {str(e)}",
        )


@router.get("/mission-type/{mission_type}", response_model=TutorialResponseBody)
async def get_mission_type_guide(
    mission_type: str,
    language: str = "en",
) -> TutorialResponseBody:
    """
    Get a guide for a specific mission type.
    """
    try:
        agent = get_tutorial_agent()

        response = await agent.get_mission_type_guide(
            mission_type=mission_type,
            language=language,
        )

        return TutorialResponseBody(
            topic=response.topic,
            content=response.content,
            tips=response.tips,
            related_topics=response.related_topics,
        )

    except Exception as e:
        logger.error(f"Mission type guide generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate mission type guide: {str(e)}",
        )


@router.get("/types")
async def list_tutorial_types() -> Dict[str, Any]:
    """
    List available tutorial types.
    """
    return {
        "tutorial_types": [t.value for t in TutorialType],
        "supported_languages": ["en", "zh"],
    }


@router.websocket("/ws/{session_id}")
async def tutorial_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming tutorial generation.

    Message format (client -> server):
    {
        "type": "explain" | "hint" | "character_guide" | "mission_guide",
        "topic": "...",
        "tutorial_type": "getting_started",
        "character_id": "jett",
        "language": "en",
        ...other fields...
    }

    Response format (server -> client):
    {
        "type": "tutorial_token" | "tutorial_complete" | "error",
        "token": "...",
        "full_content": "...",
        "tips": [...],
        "related_topics": [...]
    }
    """
    await websocket.accept()
    logger.info(f"Tutorial WebSocket connected: session={session_id}")

    try:
        agent = get_tutorial_agent()

        while True:
            # Receive message
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type", "explain")

            try:
                if msg_type == "explain":
                    # Parse tutorial request
                    tutorial_type = None
                    if message.get("tutorial_type"):
                        try:
                            tutorial_type = TutorialType(message["tutorial_type"])
                        except ValueError:
                            pass

                    request = TutorialRequest(
                        topic=message.get("topic", ""),
                        tutorial_type=tutorial_type,
                        character_id=message.get("character_id"),
                        player_level=message.get("player_level"),
                        language=message.get("language", "en"),
                    )

                    # Stream explanation
                    full_content = ""
                    async for token in agent.stream_explanation(request):
                        full_content += token
                        await websocket.send_json({
                            "type": "tutorial_token",
                            "token": token,
                        })

                    # Get tips for the topic
                    tips = agent._get_tips_for_topic(message.get("topic", ""))
                    related = agent._get_related_topics(message.get("topic", ""))

                    # Send completion
                    await websocket.send_json({
                        "type": "tutorial_complete",
                        "topic": message.get("topic", ""),
                        "full_content": full_content,
                        "tips": tips,
                        "related_topics": related,
                    })

                elif msg_type == "hint":
                    # Non-streaming hint (hints should be quick)
                    request = TutorialHintRequest(
                        current_situation=message.get("current_situation", ""),
                        character_id=message.get("character_id"),
                        mission_type=message.get("mission_type"),
                        player_progress=message.get("player_progress"),
                    )

                    response = await agent.get_hint(request)

                    await websocket.send_json({
                        "type": "tutorial_complete",
                        "topic": "Game Hint",
                        "full_content": response.content,
                        "tips": response.tips,
                        "related_topics": response.related_topics,
                    })

                elif msg_type == "character_guide":
                    # Non-streaming character guide
                    response = await agent.get_character_guide(
                        character_id=message.get("character_id", "jett"),
                        language=message.get("language", "en"),
                    )

                    await websocket.send_json({
                        "type": "tutorial_complete",
                        "topic": response.topic,
                        "full_content": response.content,
                        "tips": response.tips,
                        "related_topics": response.related_topics,
                        "character_id": response.character_id,
                    })

                elif msg_type == "mission_guide":
                    # Non-streaming mission guide
                    response = await agent.get_mission_type_guide(
                        mission_type=message.get("mission_type", "delivery"),
                        language=message.get("language", "en"),
                    )

                    await websocket.send_json({
                        "type": "tutorial_complete",
                        "topic": response.topic,
                        "full_content": response.content,
                        "tips": response.tips,
                        "related_topics": response.related_topics,
                    })

                else:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Unknown message type: {msg_type}",
                    })

            except Exception as e:
                logger.error(f"Tutorial generation error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "error": str(e),
                })

    except WebSocketDisconnect:
        logger.info(f"Tutorial WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"Tutorial WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass
