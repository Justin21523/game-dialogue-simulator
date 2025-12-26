"""
Character Appearance API - AI-driven character image selection.
Allows characters to dynamically change their appearance based on context.
"""

import logging
import secrets
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class AppearanceRequest(BaseModel):
    """Request for AI character appearance selection."""
    character_id: str
    current_action: Optional[str] = "idle"  # idle, walking, running, jumping, talking, delivering
    emotion: Optional[str] = "neutral"  # happy, sad, excited, worried, neutral
    location: Optional[str] = None
    weather: Optional[str] = "clear"
    time_of_day: Optional[str] = "day"
    mission_context: Optional[Dict[str, Any]] = None


class AppearanceResponse(BaseModel):
    """Response with selected character appearance."""
    character_id: str
    selected_pose: str
    selected_expression: str
    reasoning: str
    should_update: bool  # Whether to actually update the image
    transition_duration: float  # Duration of fade transition in seconds


# 角色可用的姿勢和表情
CHARACTER_POSES = {
    "jett": ["idle", "flying", "running", "action_pose", "celebration"],
    "jerome": ["idle", "flying", "action_pose", "celebration"],
    "donnie": ["idle", "flying", "digging", "action_pose"],
    "chase": ["idle", "flying", "racing", "action_pose"],
    "flip": ["idle", "flying", "action_pose"],
    "todd": ["idle", "flying", "action_pose"],
    "paul": ["idle", "flying", "police_pose"],
    "bello": ["idle", "flying", "action_pose"]
}

CHARACTER_EXPRESSIONS = {
    "jett": ["happy", "excited", "confident", "neutral"],
    "jerome": ["happy", "playful", "confident", "neutral"],
    "donnie": ["happy", "focused", "excited", "neutral"],
    "chase": ["happy", "excited", "focused", "neutral"],
    "flip": ["happy", "cool", "excited", "neutral"],
    "todd": ["happy", "excited", "confident", "neutral"],
    "paul": ["serious", "confident", "happy", "neutral"],
    "bello": ["happy", "excited", "confident", "neutral"]
}


@router.post("/select", response_model=AppearanceResponse)
async def select_character_appearance(request: AppearanceRequest) -> AppearanceResponse:
    """
    AI-driven character appearance selection based on context.

    This endpoint uses context (action, emotion, location) to intelligently
    select the most appropriate character pose and expression.
    """
    try:
        character_id = request.character_id.lower()

        # Get available poses and expressions for this character
        available_poses = CHARACTER_POSES.get(character_id, ["idle", "flying", "action_pose"])
        available_expressions = CHARACTER_EXPRESSIONS.get(character_id, ["happy", "neutral"])

        logger.info(f"Selecting appearance for {character_id}: action={request.current_action}, emotion={request.emotion}")

        # ===== AI-like selection logic =====
        # In production, this would call an LLM. For now, use smart heuristics.

        # 1. Select pose based on action
        selected_pose = "idle"
        if request.current_action == "walking" or request.current_action == "running":
            if "running" in available_poses:
                selected_pose = "running"
            elif "action_pose" in available_poses:
                selected_pose = "action_pose"
        elif request.current_action == "jumping" or request.current_action == "flying":
            if "flying" in available_poses:
                selected_pose = "flying"
        elif request.current_action == "delivering" or request.current_action == "celebrating":
            if "celebration" in available_poses:
                selected_pose = "celebration"
            elif "action_pose" in available_poses:
                selected_pose = "action_pose"
        elif request.current_action == "talking":
            selected_pose = "idle"
        else:
            # Random selection for variety
            rng = secrets.SystemRandom()
            if rng.random() < 0.15:  # 15% chance to change pose randomly
                selected_pose = rng.choice(available_poses)

        # 2. Select expression based on emotion
        selected_expression = "neutral"
        emotion_map = {
            "happy": ["happy", "excited"],
            "excited": ["excited", "happy"],
            "sad": ["neutral"],
            "worried": ["neutral"],
            "confident": ["confident", "happy"],
            "neutral": ["neutral", "happy"]
        }

        emotion = request.emotion or "neutral"
        preferred_expressions = emotion_map.get(emotion, ["neutral"])
        for pref in preferred_expressions:
            if pref in available_expressions:
                selected_expression = pref
                break

        # 3. Decide if we should actually update (avoid too frequent changes)
        rng = secrets.SystemRandom()
        should_update = rng.random() < 0.3  # 30% chance to actually change

        # Always update if action is significant
        if request.current_action in ["flying", "celebrating", "delivering"]:
            should_update = True

        # 4. Generate reasoning
        reasoning = f"Selected {selected_pose} pose for {request.current_action} action, "
        reasoning += f"with {selected_expression} expression for {emotion} emotion"

        # 5. Determine transition duration
        transition_duration = 0.5  # Default 0.5 seconds
        if request.current_action in ["flying", "jumping"]:
            transition_duration = 0.3  # Faster for action poses
        elif request.current_action == "celebrating":
            transition_duration = 0.7  # Slower for celebration

        logger.info(f"Selected appearance: {selected_pose}/{selected_expression}, update={should_update}")

        return AppearanceResponse(
            character_id=character_id,
            selected_pose=selected_pose,
            selected_expression=selected_expression,
            reasoning=reasoning,
            should_update=should_update,
            transition_duration=transition_duration
        )

    except Exception as e:
        logger.error(f"Error selecting character appearance: {e}")
        # Return fallback response instead of error
        return AppearanceResponse(
            character_id=request.character_id,
            selected_pose="idle",
            selected_expression="neutral",
            reasoning=f"Error occurred, using fallback: {str(e)}",
            should_update=False,
            transition_duration=0.5
        )


@router.get("/poses/{character_id}")
async def get_available_poses(character_id: str) -> Dict[str, Any]:
    """Get all available poses and expressions for a character."""
    character_id = character_id.lower()

    return {
        "character_id": character_id,
        "poses": CHARACTER_POSES.get(character_id, ["idle", "flying", "action_pose"]),
        "expressions": CHARACTER_EXPRESSIONS.get(character_id, ["happy", "neutral"])
    }
