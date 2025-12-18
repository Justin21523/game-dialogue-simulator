"""
Progress API router for Super Wings Simulator.
Provides player progress analysis and recommendations with WebSocket streaming support.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ...core.agents import (
    get_progress_agent,
    PlayerProgress,
    AnalysisType,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class PlayerProgressRequest(BaseModel):
    """Request body for player progress."""
    player_id: str
    missions_completed: int = 0
    missions_failed: int = 0
    characters_used: Dict[str, int] = {}
    characters_unlocked: List[str] = []
    character_levels: Dict[str, int] = {}
    locations_visited: List[str] = []
    achievements_earned: List[str] = []
    mission_types_completed: Dict[str, int] = {}
    total_money_earned: int = 0
    total_playtime_minutes: int = 0
    player_level: int = 1


class AnalysisResponse(BaseModel):
    """Response for progress analysis."""
    player_id: str
    analysis_type: str
    overall_progress: str
    strengths: List[str]
    improvements: List[str]
    playstyle: str
    key_stats: Dict[str, Any]


class RecommendationResponse(BaseModel):
    """Response for recommendations."""
    player_id: str
    recommendations: List[Dict[str, Any]]


class AchievementProgressResponse(BaseModel):
    """Response for achievement progress."""
    player_id: str
    earned_achievements: List[str]
    close_achievements: List[Dict[str, Any]]
    next_suggestions: List[str]


class MilestoneStatusResponse(BaseModel):
    """Response for milestone status."""
    player_id: str
    current_milestone: Optional[str]
    next_milestone: Optional[str]
    progress_percentage: float
    milestones_reached: List[str]


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_progress(
    request: PlayerProgressRequest,
    language: str = "en",
) -> AnalysisResponse:
    """
    Analyze player's game progress and provide insights.
    """
    try:
        agent = get_progress_agent()

        progress = PlayerProgress(
            player_id=request.player_id,
            missions_completed=request.missions_completed,
            missions_failed=request.missions_failed,
            characters_used=request.characters_used,
            characters_unlocked=request.characters_unlocked,
            character_levels=request.character_levels,
            locations_visited=request.locations_visited,
            achievements_earned=request.achievements_earned,
            mission_types_completed=request.mission_types_completed,
            total_money_earned=request.total_money_earned,
            total_playtime_minutes=request.total_playtime_minutes,
            player_level=request.player_level,
        )

        analysis = await agent.analyze_progress(progress, language=language)

        return AnalysisResponse(
            player_id=request.player_id,
            analysis_type=analysis.analysis_type.value,
            overall_progress=analysis.overall_progress,
            strengths=analysis.strengths,
            improvements=analysis.improvements,
            playstyle=analysis.playstyle,
            key_stats=analysis.key_stats,
        )

    except Exception as e:
        logger.error(f"Progress analysis failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze progress: {str(e)}",
        )


@router.post("/recommend", response_model=RecommendationResponse)
async def get_recommendations(
    request: PlayerProgressRequest,
    language: str = "en",
) -> RecommendationResponse:
    """
    Get personalized recommendations for the player.
    """
    try:
        agent = get_progress_agent()

        progress = PlayerProgress(
            player_id=request.player_id,
            missions_completed=request.missions_completed,
            missions_failed=request.missions_failed,
            characters_used=request.characters_used,
            characters_unlocked=request.characters_unlocked,
            character_levels=request.character_levels,
            locations_visited=request.locations_visited,
            achievements_earned=request.achievements_earned,
            mission_types_completed=request.mission_types_completed,
            total_money_earned=request.total_money_earned,
            total_playtime_minutes=request.total_playtime_minutes,
            player_level=request.player_level,
        )

        recommendations = await agent.get_recommendations(progress, language=language)

        return RecommendationResponse(
            player_id=request.player_id,
            recommendations=[
                {
                    "title": rec.title,
                    "description": rec.description,
                    "priority": rec.priority,
                    "category": rec.category,
                    "estimated_benefit": rec.estimated_benefit,
                }
                for rec in recommendations
            ],
        )

    except Exception as e:
        logger.error(f"Recommendation generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate recommendations: {str(e)}",
        )


@router.post("/achievements", response_model=AchievementProgressResponse)
async def check_achievements(
    request: PlayerProgressRequest,
    language: str = "en",
) -> AchievementProgressResponse:
    """
    Check player's achievement progress.
    """
    try:
        agent = get_progress_agent()

        progress = PlayerProgress(
            player_id=request.player_id,
            missions_completed=request.missions_completed,
            missions_failed=request.missions_failed,
            characters_used=request.characters_used,
            characters_unlocked=request.characters_unlocked,
            character_levels=request.character_levels,
            locations_visited=request.locations_visited,
            achievements_earned=request.achievements_earned,
            mission_types_completed=request.mission_types_completed,
            total_money_earned=request.total_money_earned,
            total_playtime_minutes=request.total_playtime_minutes,
            player_level=request.player_level,
        )

        result = await agent.check_achievements(progress, language=language)

        return AchievementProgressResponse(
            player_id=request.player_id,
            earned_achievements=result.get("earned", []),
            close_achievements=result.get("close_to_earning", []),
            next_suggestions=result.get("suggestions", []),
        )

    except Exception as e:
        logger.error(f"Achievement check failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check achievements: {str(e)}",
        )


@router.post("/milestones", response_model=MilestoneStatusResponse)
async def get_milestone_status(
    request: PlayerProgressRequest,
    language: str = "en",
) -> MilestoneStatusResponse:
    """
    Get player's milestone status.
    """
    try:
        agent = get_progress_agent()

        progress = PlayerProgress(
            player_id=request.player_id,
            missions_completed=request.missions_completed,
            missions_failed=request.missions_failed,
            characters_used=request.characters_used,
            characters_unlocked=request.characters_unlocked,
            character_levels=request.character_levels,
            locations_visited=request.locations_visited,
            achievements_earned=request.achievements_earned,
            mission_types_completed=request.mission_types_completed,
            total_money_earned=request.total_money_earned,
            total_playtime_minutes=request.total_playtime_minutes,
            player_level=request.player_level,
        )

        result = await agent.get_milestone_status(progress, language=language)

        return MilestoneStatusResponse(
            player_id=request.player_id,
            current_milestone=result.get("current_milestone"),
            next_milestone=result.get("next_milestone"),
            progress_percentage=result.get("progress_percentage", 0.0),
            milestones_reached=result.get("milestones_reached", []),
        )

    except Exception as e:
        logger.error(f"Milestone status check failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check milestone status: {str(e)}",
        )


@router.get("/analysis-types")
async def list_analysis_types() -> Dict[str, Any]:
    """
    List available analysis types.
    """
    return {
        "analysis_types": [t.value for t in AnalysisType],
        "supported_languages": ["en", "zh"],
    }


@router.websocket("/ws/{session_id}")
async def progress_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming progress analysis.

    Message format (client -> server):
    {
        "type": "analyze" | "recommend" | "achievements" | "milestones",
        "player_id": "player123",
        "missions_completed": 10,
        ...other progress fields...,
        "language": "en"
    }

    Response format (server -> client):
    {
        "type": "analysis_token" | "analysis_complete" | "error",
        "token": "...",
        "result": {...}
    }
    """
    await websocket.accept()
    logger.info(f"Progress WebSocket connected: session={session_id}")

    try:
        agent = get_progress_agent()

        while True:
            # Receive message
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type", "analyze")
            language = message.get("language", "en")

            try:
                # Build PlayerProgress from message
                progress = PlayerProgress(
                    player_id=message.get("player_id", "unknown"),
                    missions_completed=message.get("missions_completed", 0),
                    missions_failed=message.get("missions_failed", 0),
                    characters_used=message.get("characters_used", {}),
                    characters_unlocked=message.get("characters_unlocked", []),
                    character_levels=message.get("character_levels", {}),
                    locations_visited=message.get("locations_visited", []),
                    achievements_earned=message.get("achievements_earned", []),
                    mission_types_completed=message.get("mission_types_completed", {}),
                    total_money_earned=message.get("total_money_earned", 0),
                    total_playtime_minutes=message.get("total_playtime_minutes", 0),
                    player_level=message.get("player_level", 1),
                )

                if msg_type == "analyze":
                    # Stream analysis
                    full_content = ""
                    async for token in agent.stream_analysis(progress, language=language):
                        full_content += token
                        await websocket.send_json({
                            "type": "analysis_token",
                            "token": token,
                        })

                    # Send completion with parsed analysis
                    analysis = await agent.analyze_progress(progress, language=language)

                    await websocket.send_json({
                        "type": "analysis_complete",
                        "player_id": progress.player_id,
                        "result": {
                            "analysis_type": analysis.analysis_type.value,
                            "overall_progress": analysis.overall_progress,
                            "strengths": analysis.strengths,
                            "improvements": analysis.improvements,
                            "playstyle": analysis.playstyle,
                            "key_stats": analysis.key_stats,
                        },
                    })

                elif msg_type == "recommend":
                    # Non-streaming recommendations
                    recommendations = await agent.get_recommendations(progress, language=language)

                    await websocket.send_json({
                        "type": "analysis_complete",
                        "player_id": progress.player_id,
                        "result": {
                            "recommendations": [
                                {
                                    "title": rec.title,
                                    "description": rec.description,
                                    "priority": rec.priority,
                                    "category": rec.category,
                                    "estimated_benefit": rec.estimated_benefit,
                                }
                                for rec in recommendations
                            ],
                        },
                    })

                elif msg_type == "achievements":
                    # Non-streaming achievement check
                    result = await agent.check_achievements(progress, language=language)

                    await websocket.send_json({
                        "type": "analysis_complete",
                        "player_id": progress.player_id,
                        "result": result,
                    })

                elif msg_type == "milestones":
                    # Non-streaming milestone status
                    result = await agent.get_milestone_status(progress, language=language)

                    await websocket.send_json({
                        "type": "analysis_complete",
                        "player_id": progress.player_id,
                        "result": result,
                    })

                else:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Unknown message type: {msg_type}",
                    })

            except Exception as e:
                logger.error(f"Progress analysis error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "error": str(e),
                })

    except WebSocketDisconnect:
        logger.info(f"Progress WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"Progress WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass
