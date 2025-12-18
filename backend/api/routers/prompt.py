"""
Prompt Engineering API router for Super Wings Simulator.
Provides endpoints for building and optimizing image generation prompts.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...core.agents import (
    get_prompt_agent,
    PromptCategory,
    ViewAngle,
    CharacterState,
    CharacterExpression,
    PromptRequest,
    EnhancedPrompt,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class CharacterPromptRequest(BaseModel):
    """Request for character prompt building."""
    character_id: str
    view_angle: Optional[str] = None
    state: Optional[str] = None
    expression: Optional[str] = None
    additional_details: Optional[str] = None
    include_style: bool = True


class BackgroundPromptRequest(BaseModel):
    """Request for background prompt building."""
    background_type: str
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    weather: Optional[str] = None
    include_style: bool = True


class UIPromptRequest(BaseModel):
    """Request for UI element prompt building."""
    element_type: str
    icon_name: Optional[str] = None
    color_scheme: Optional[str] = None


class TransformationPromptRequest(BaseModel):
    """Request for transformation prompt building."""
    character_id: str
    transformation_progress: float = 0.5
    include_effects: bool = True


class EnhancePromptRequest(BaseModel):
    """Request for prompt enhancement."""
    base_prompt: str
    add_style: bool = True
    add_quality: bool = True
    add_lighting: bool = True


class PromptResponse(BaseModel):
    """Response with enhanced prompt."""
    positive_prompt: str
    negative_prompt: str
    character_id: Optional[str] = None
    lora_path: Optional[str] = None
    lora_weight: float = 0.9
    resolution: Dict[str, int] = {"width": 1024, "height": 1024}
    recommended_steps: int = 40
    recommended_cfg: float = 8.0
    metadata: Dict[str, Any] = {}


class CharacterInfoResponse(BaseModel):
    """Response with character information."""
    character_id: str
    name: str
    name_zh: str
    colors: str
    features: str
    unique: str
    eye_color: str
    specialization: str
    lora_path: str
    critical_warning: Optional[str] = None


@router.get("/characters")
async def list_characters() -> Dict[str, Any]:
    """
    List all available characters with their information.
    """
    try:
        agent = get_prompt_agent()
        characters = []

        for char_id in agent.get_all_characters():
            char_info = agent.get_character_info(char_id)
            if char_info:
                characters.append({
                    "id": char_info.character_id,
                    "name": char_info.name,
                    "name_zh": char_info.name_zh,
                    "colors": char_info.colors,
                    "specialization": char_info.specialization,
                    "critical_warning": char_info.critical_warning,
                })

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


@router.get("/characters/{character_id}", response_model=CharacterInfoResponse)
async def get_character_info(character_id: str) -> CharacterInfoResponse:
    """
    Get detailed information for a specific character.
    """
    try:
        agent = get_prompt_agent()
        char_info = agent.get_character_info(character_id)

        if not char_info:
            raise HTTPException(
                status_code=404,
                detail=f"Character not found: {character_id}"
            )

        return CharacterInfoResponse(
            character_id=char_info.character_id,
            name=char_info.name,
            name_zh=char_info.name_zh,
            colors=char_info.colors,
            features=char_info.features,
            unique=char_info.unique,
            eye_color=char_info.eye_color,
            specialization=char_info.specialization,
            lora_path=char_info.lora_path,
            critical_warning=char_info.critical_warning,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get character info: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get character info: {str(e)}"
        )


@router.post("/character", response_model=PromptResponse)
async def build_character_prompt(request: CharacterPromptRequest) -> PromptResponse:
    """
    Build an optimized prompt for character image generation.
    """
    try:
        agent = get_prompt_agent()

        # Parse enums
        view_angle = None
        if request.view_angle:
            try:
                view_angle = ViewAngle(request.view_angle)
            except ValueError:
                pass

        state = None
        if request.state:
            try:
                state = CharacterState(request.state)
            except ValueError:
                pass

        expression = None
        if request.expression:
            try:
                expression = CharacterExpression(request.expression)
            except ValueError:
                pass

        result = agent.build_character_prompt(
            character_id=request.character_id,
            view_angle=view_angle,
            state=state,
            expression=expression,
            additional_details=request.additional_details,
            include_style=request.include_style,
        )

        return PromptResponse(
            positive_prompt=result.positive_prompt,
            negative_prompt=result.negative_prompt,
            character_id=result.character_id,
            lora_path=result.lora_path,
            lora_weight=result.lora_weight,
            resolution=result.resolution,
            recommended_steps=result.recommended_steps,
            recommended_cfg=result.recommended_cfg,
            metadata=result.metadata,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to build character prompt: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build prompt: {str(e)}"
        )


@router.post("/background", response_model=PromptResponse)
async def build_background_prompt(request: BackgroundPromptRequest) -> PromptResponse:
    """
    Build an optimized prompt for background image generation.
    """
    try:
        agent = get_prompt_agent()

        result = agent.build_background_prompt(
            background_type=request.background_type,
            location=request.location,
            time_of_day=request.time_of_day,
            weather=request.weather,
            include_style=request.include_style,
        )

        return PromptResponse(
            positive_prompt=result.positive_prompt,
            negative_prompt=result.negative_prompt,
            resolution=result.resolution,
            recommended_steps=result.recommended_steps,
            recommended_cfg=result.recommended_cfg,
            metadata=result.metadata,
        )

    except Exception as e:
        logger.error(f"Failed to build background prompt: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build prompt: {str(e)}"
        )


@router.post("/ui", response_model=PromptResponse)
async def build_ui_prompt(request: UIPromptRequest) -> PromptResponse:
    """
    Build an optimized prompt for UI element generation.
    """
    try:
        agent = get_prompt_agent()

        result = agent.build_ui_prompt(
            element_type=request.element_type,
            icon_name=request.icon_name,
            color_scheme=request.color_scheme,
        )

        return PromptResponse(
            positive_prompt=result.positive_prompt,
            negative_prompt=result.negative_prompt,
            resolution=result.resolution,
            recommended_steps=result.recommended_steps,
            recommended_cfg=result.recommended_cfg,
            metadata=result.metadata,
        )

    except Exception as e:
        logger.error(f"Failed to build UI prompt: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build prompt: {str(e)}"
        )


@router.post("/transformation", response_model=PromptResponse)
async def build_transformation_prompt(request: TransformationPromptRequest) -> PromptResponse:
    """
    Build an optimized prompt for character transformation sequence.
    """
    try:
        agent = get_prompt_agent()

        result = agent.build_transformation_prompt(
            character_id=request.character_id,
            transformation_progress=request.transformation_progress,
            include_effects=request.include_effects,
        )

        return PromptResponse(
            positive_prompt=result.positive_prompt,
            negative_prompt=result.negative_prompt,
            character_id=result.character_id,
            lora_path=result.lora_path,
            lora_weight=result.lora_weight,
            resolution=result.resolution,
            recommended_steps=result.recommended_steps,
            recommended_cfg=result.recommended_cfg,
            metadata=result.metadata,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to build transformation prompt: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build prompt: {str(e)}"
        )


@router.post("/enhance")
async def enhance_prompt(request: EnhancePromptRequest) -> Dict[str, str]:
    """
    Enhance a base prompt with style and quality keywords.
    """
    try:
        agent = get_prompt_agent()

        enhanced = agent.enhance_prompt(
            base_prompt=request.base_prompt,
            add_style=request.add_style,
            add_quality=request.add_quality,
            add_lighting=request.add_lighting,
        )

        return {
            "original_prompt": request.base_prompt,
            "enhanced_prompt": enhanced,
        }

    except Exception as e:
        logger.error(f"Failed to enhance prompt: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enhance prompt: {str(e)}"
        )


@router.get("/view-angles")
async def list_view_angles() -> Dict[str, Any]:
    """
    List available view angles for character prompts.
    """
    return {
        "view_angles": [
            {"value": v.value, "name": v.name.replace("_", " ").title()}
            for v in ViewAngle
        ]
    }


@router.get("/states")
async def list_states() -> Dict[str, Any]:
    """
    List available character states.
    """
    return {
        "states": [
            {"value": s.value, "name": s.name.replace("_", " ").title()}
            for s in CharacterState
        ]
    }


@router.get("/expressions")
async def list_expressions() -> Dict[str, Any]:
    """
    List available character expressions.
    """
    return {
        "expressions": [
            {"value": e.value, "name": e.name.replace("_", " ").title()}
            for e in CharacterExpression
        ]
    }


@router.get("/style-keywords")
async def get_style_keywords() -> Dict[str, Any]:
    """
    Get the style keywords used in prompt generation.
    """
    try:
        agent = get_prompt_agent()
        return {
            "style_keywords": agent.get_style_keywords(),
            "negative_prompts": agent.get_negative_prompts(),
        }
    except Exception as e:
        logger.error(f"Failed to get style keywords: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get style keywords: {str(e)}"
        )


@router.get("/resolutions")
async def get_resolutions() -> Dict[str, Any]:
    """
    Get available resolution presets.
    """
    try:
        agent = get_prompt_agent()
        resolutions = agent.settings.get("generation_parameters", {}).get("resolutions", {})
        return {"resolutions": resolutions}
    except Exception as e:
        logger.error(f"Failed to get resolutions: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get resolutions: {str(e)}"
        )
