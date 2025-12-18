"""
Character Image Agent for Super Wings Simulator.
Handles character portrait, state, and expression image generation.
"""

import logging
from pathlib import Path
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from .base_agent import BaseAgent, ReasoningMode, PlanStep
from .comfyui_workflow import get_comfyui_agent, GenerationRequest, GenerationType
from .prompt_engineer import (
    get_prompt_agent,
    ViewAngle,
    CharacterState,
    CharacterExpression,
)

logger = logging.getLogger(__name__)


class PortraitType(str, Enum):
    """Types of character portraits."""
    FRONT_VIEW = "front_view"
    THREE_QUARTER_VIEW = "three_quarter_view"
    SIDE_VIEW = "side_view"
    FLYING_POSE = "flying_pose"
    TRANSFORMATION = "transformation"
    ACTION_POSE = "action_pose"
    LANDING_POSE = "landing_pose"
    HEROIC_POSE = "heroic_pose"


class ImageCategory(str, Enum):
    """Categories of character images."""
    PORTRAIT = "portrait"
    STATE = "state"
    EXPRESSION = "expression"


class CharacterImageRequest(BaseModel):
    """Request for character image generation."""
    character_id: str
    category: ImageCategory = ImageCategory.PORTRAIT
    portrait_type: Optional[PortraitType] = None
    state: Optional[CharacterState] = None
    expression: Optional[CharacterExpression] = None
    additional_details: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class CharacterImageResult(BaseModel):
    """Result of character image generation."""
    success: bool
    character_id: str
    category: str
    images: List[Dict[str, Any]] = []
    prompt_used: str = ""
    negative_prompt_used: str = ""
    lora_path: Optional[str] = None
    generation_time_ms: float = 0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class BatchGenerationRequest(BaseModel):
    """Request for batch character image generation."""
    character_ids: List[str]
    categories: List[ImageCategory] = [ImageCategory.PORTRAIT]
    portrait_types: Optional[List[PortraitType]] = None
    states: Optional[List[CharacterState]] = None
    expressions: Optional[List[CharacterExpression]] = None


class BatchGenerationResult(BaseModel):
    """Result of batch generation."""
    total_requested: int
    total_completed: int
    total_failed: int
    results: List[CharacterImageResult] = []
    errors: List[Dict[str, str]] = []


# Singleton instance
_character_image_agent: Optional["CharacterImageAgent"] = None


def get_character_image_agent() -> "CharacterImageAgent":
    """Get or create CharacterImageAgent singleton."""
    global _character_image_agent
    if _character_image_agent is None:
        _character_image_agent = CharacterImageAgent()
    return _character_image_agent


class CharacterImageAgent(BaseAgent):
    """
    Agent for generating character images.

    This agent handles:
    - Character portrait generation (8 view angles)
    - Character state images (10 states)
    - Character expression images (8 expressions)
    - Integration with ComfyUI and PromptEngineer agents
    """

    def __init__(
        self,
        output_dir: str = "./assets/images/characters",
    ):
        super().__init__(
            name="character_image_agent",
            description="Agent for generating Super Wings character images",
            reasoning_mode=ReasoningMode.SIMPLE,
            enable_planning=False,
        )

        self.output_dir = Path(output_dir)
        self._comfyui_agent = None
        self._prompt_agent = None

        # Mapping from PortraitType to ViewAngle
        self._portrait_to_view = {
            PortraitType.FRONT_VIEW: ViewAngle.FRONT_VIEW,
            PortraitType.THREE_QUARTER_VIEW: ViewAngle.THREE_QUARTER_VIEW,
            PortraitType.SIDE_VIEW: ViewAngle.SIDE_VIEW,
            PortraitType.FLYING_POSE: ViewAngle.FLYING_POSE,
            PortraitType.TRANSFORMATION: ViewAngle.TRANSFORMATION,
            PortraitType.ACTION_POSE: ViewAngle.ACTION_POSE,
            PortraitType.LANDING_POSE: ViewAngle.LANDING_POSE,
            PortraitType.HEROIC_POSE: ViewAngle.HEROIC_POSE,
        }

    @property
    def comfyui_agent(self):
        """Get ComfyUI agent."""
        if self._comfyui_agent is None:
            self._comfyui_agent = get_comfyui_agent()
        return self._comfyui_agent

    @property
    def prompt_agent(self):
        """Get Prompt Engineer agent."""
        if self._prompt_agent is None:
            self._prompt_agent = get_prompt_agent()
        return self._prompt_agent

    async def get_system_prompt(self) -> str:
        return """You are a Character Image generation agent for Super Wings.
Your role is to generate high-quality character images using SDXL + LoRA models.
You understand character features and can generate portraits, states, and expressions."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute image generation step."""
        return {"step": step.step_number, "output": "Image generated", "success": True}

    def get_available_characters(self) -> List[str]:
        """Get list of available character IDs."""
        return self.prompt_agent.get_all_characters()

    def get_available_portrait_types(self) -> List[str]:
        """Get list of available portrait types."""
        return [p.value for p in PortraitType]

    def get_available_states(self) -> List[str]:
        """Get list of available character states."""
        return [s.value for s in CharacterState]

    def get_available_expressions(self) -> List[str]:
        """Get list of available character expressions."""
        return [e.value for e in CharacterExpression]

    async def generate_portrait(
        self,
        character_id: str,
        portrait_type: PortraitType = PortraitType.FRONT_VIEW,
        additional_details: Optional[str] = None,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> CharacterImageResult:
        """
        Generate a character portrait.

        Args:
            character_id: Character ID (jett, flip, etc.)
            portrait_type: Type of portrait/view angle
            additional_details: Extra prompt details
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            CharacterImageResult with generated image info
        """
        try:
            # Get view angle from portrait type
            view_angle = self._portrait_to_view.get(portrait_type, ViewAngle.FRONT_VIEW)

            # Build prompt using PromptEngineerAgent
            enhanced_prompt = self.prompt_agent.build_character_prompt(
                character_id=character_id,
                view_angle=view_angle,
                additional_details=additional_details,
            )

            # Generate filename
            if not output_filename:
                output_filename = f"{character_id}_{portrait_type.value}"

            # Create generation request
            gen_request = GenerationRequest(
                prompt=enhanced_prompt.positive_prompt,
                negative_prompt=enhanced_prompt.negative_prompt,
                width=enhanced_prompt.resolution["width"],
                height=enhanced_prompt.resolution["height"],
                steps=enhanced_prompt.recommended_steps,
                cfg_scale=enhanced_prompt.recommended_cfg,
                lora_path=enhanced_prompt.lora_path,
                lora_weight=enhanced_prompt.lora_weight,
                generation_type=GenerationType.CHARACTER_PORTRAIT,
                output_filename=output_filename,
            )

            # Generate image using ComfyUIWorkflowAgent
            result = await self.comfyui_agent.generate(gen_request, save_to_disk=save_to_disk)

            return CharacterImageResult(
                success=result.success,
                character_id=character_id,
                category="portrait",
                images=result.images,
                prompt_used=enhanced_prompt.positive_prompt,
                negative_prompt_used=enhanced_prompt.negative_prompt,
                lora_path=enhanced_prompt.lora_path,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "portrait_type": portrait_type.value,
                    "view_angle": view_angle.value,
                    **enhanced_prompt.metadata,
                }
            )

        except Exception as e:
            logger.error(f"Portrait generation failed: {e}")
            return CharacterImageResult(
                success=False,
                character_id=character_id,
                category="portrait",
                error_message=str(e),
            )

    async def generate_state_image(
        self,
        character_id: str,
        state: CharacterState,
        additional_details: Optional[str] = None,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> CharacterImageResult:
        """
        Generate a character state image.

        Args:
            character_id: Character ID
            state: Character state
            additional_details: Extra prompt details
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            CharacterImageResult with generated image info
        """
        try:
            # Build prompt with state
            enhanced_prompt = self.prompt_agent.build_character_prompt(
                character_id=character_id,
                state=state,
                additional_details=additional_details,
            )

            # Generate filename
            if not output_filename:
                output_filename = f"{character_id}_state_{state.value}"

            # Create generation request
            gen_request = GenerationRequest(
                prompt=enhanced_prompt.positive_prompt,
                negative_prompt=enhanced_prompt.negative_prompt,
                width=enhanced_prompt.resolution["width"],
                height=enhanced_prompt.resolution["height"],
                steps=enhanced_prompt.recommended_steps,
                cfg_scale=enhanced_prompt.recommended_cfg,
                lora_path=enhanced_prompt.lora_path,
                lora_weight=enhanced_prompt.lora_weight,
                generation_type=GenerationType.CHARACTER_STATE,
                output_filename=output_filename,
            )

            # Generate image
            result = await self.comfyui_agent.generate(gen_request, save_to_disk=save_to_disk)

            return CharacterImageResult(
                success=result.success,
                character_id=character_id,
                category="state",
                images=result.images,
                prompt_used=enhanced_prompt.positive_prompt,
                negative_prompt_used=enhanced_prompt.negative_prompt,
                lora_path=enhanced_prompt.lora_path,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "state": state.value,
                    **enhanced_prompt.metadata,
                }
            )

        except Exception as e:
            logger.error(f"State image generation failed: {e}")
            return CharacterImageResult(
                success=False,
                character_id=character_id,
                category="state",
                error_message=str(e),
            )

    async def generate_expression_image(
        self,
        character_id: str,
        expression: CharacterExpression,
        additional_details: Optional[str] = None,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> CharacterImageResult:
        """
        Generate a character expression image.

        Args:
            character_id: Character ID
            expression: Character expression
            additional_details: Extra prompt details
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            CharacterImageResult with generated image info
        """
        try:
            # Build prompt with expression
            enhanced_prompt = self.prompt_agent.build_character_prompt(
                character_id=character_id,
                view_angle=ViewAngle.FRONT_VIEW,  # Expressions typically front-facing
                expression=expression,
                additional_details=additional_details,
            )

            # Generate filename
            if not output_filename:
                output_filename = f"{character_id}_expr_{expression.value}"

            # Create generation request
            gen_request = GenerationRequest(
                prompt=enhanced_prompt.positive_prompt,
                negative_prompt=enhanced_prompt.negative_prompt,
                width=enhanced_prompt.resolution["width"],
                height=enhanced_prompt.resolution["height"],
                steps=enhanced_prompt.recommended_steps,
                cfg_scale=enhanced_prompt.recommended_cfg,
                lora_path=enhanced_prompt.lora_path,
                lora_weight=enhanced_prompt.lora_weight,
                generation_type=GenerationType.CHARACTER_EXPRESSION,
                output_filename=output_filename,
            )

            # Generate image
            result = await self.comfyui_agent.generate(gen_request, save_to_disk=save_to_disk)

            return CharacterImageResult(
                success=result.success,
                character_id=character_id,
                category="expression",
                images=result.images,
                prompt_used=enhanced_prompt.positive_prompt,
                negative_prompt_used=enhanced_prompt.negative_prompt,
                lora_path=enhanced_prompt.lora_path,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "expression": expression.value,
                    **enhanced_prompt.metadata,
                }
            )

        except Exception as e:
            logger.error(f"Expression image generation failed: {e}")
            return CharacterImageResult(
                success=False,
                character_id=character_id,
                category="expression",
                error_message=str(e),
            )

    async def generate_image(
        self,
        request: CharacterImageRequest,
    ) -> CharacterImageResult:
        """
        Main entry point for character image generation.

        Args:
            request: CharacterImageRequest with all parameters

        Returns:
            CharacterImageResult with generated image info
        """
        if request.category == ImageCategory.PORTRAIT:
            portrait_type = request.portrait_type or PortraitType.FRONT_VIEW
            return await self.generate_portrait(
                character_id=request.character_id,
                portrait_type=portrait_type,
                additional_details=request.additional_details,
                save_to_disk=request.save_to_disk,
                output_filename=request.output_filename,
            )

        elif request.category == ImageCategory.STATE:
            state = request.state or CharacterState.IDLE
            return await self.generate_state_image(
                character_id=request.character_id,
                state=state,
                additional_details=request.additional_details,
                save_to_disk=request.save_to_disk,
                output_filename=request.output_filename,
            )

        elif request.category == ImageCategory.EXPRESSION:
            expression = request.expression or CharacterExpression.HAPPY
            return await self.generate_expression_image(
                character_id=request.character_id,
                expression=expression,
                additional_details=request.additional_details,
                save_to_disk=request.save_to_disk,
                output_filename=request.output_filename,
            )

        else:
            return CharacterImageResult(
                success=False,
                character_id=request.character_id,
                category=request.category.value,
                error_message=f"Unknown category: {request.category}",
            )

    async def generate_all_portraits(
        self,
        character_id: str,
        save_to_disk: bool = True,
    ) -> BatchGenerationResult:
        """
        Generate all portrait types for a character.

        Args:
            character_id: Character ID
            save_to_disk: Whether to save images locally

        Returns:
            BatchGenerationResult with all generated images
        """
        results = []
        errors = []

        for portrait_type in PortraitType:
            logger.info(f"Generating {portrait_type.value} for {character_id}")

            result = await self.generate_portrait(
                character_id=character_id,
                portrait_type=portrait_type,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "character_id": character_id,
                    "portrait_type": portrait_type.value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchGenerationResult(
            total_requested=len(PortraitType),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_all_states(
        self,
        character_id: str,
        save_to_disk: bool = True,
    ) -> BatchGenerationResult:
        """
        Generate all state images for a character.

        Args:
            character_id: Character ID
            save_to_disk: Whether to save images locally

        Returns:
            BatchGenerationResult with all generated images
        """
        results = []
        errors = []

        for state in CharacterState:
            logger.info(f"Generating state {state.value} for {character_id}")

            result = await self.generate_state_image(
                character_id=character_id,
                state=state,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "character_id": character_id,
                    "state": state.value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchGenerationResult(
            total_requested=len(CharacterState),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_all_expressions(
        self,
        character_id: str,
        save_to_disk: bool = True,
    ) -> BatchGenerationResult:
        """
        Generate all expression images for a character.

        Args:
            character_id: Character ID
            save_to_disk: Whether to save images locally

        Returns:
            BatchGenerationResult with all generated images
        """
        results = []
        errors = []

        for expression in CharacterExpression:
            logger.info(f"Generating expression {expression.value} for {character_id}")

            result = await self.generate_expression_image(
                character_id=character_id,
                expression=expression,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "character_id": character_id,
                    "expression": expression.value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchGenerationResult(
            total_requested=len(CharacterExpression),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_character_pack(
        self,
        character_id: str,
        include_portraits: bool = True,
        include_states: bool = True,
        include_expressions: bool = True,
        save_to_disk: bool = True,
    ) -> Dict[str, BatchGenerationResult]:
        """
        Generate a complete image pack for a character.

        Args:
            character_id: Character ID
            include_portraits: Generate all portraits
            include_states: Generate all states
            include_expressions: Generate all expressions
            save_to_disk: Whether to save images locally

        Returns:
            Dictionary with results for each category
        """
        results = {}

        if include_portraits:
            logger.info(f"Generating portrait pack for {character_id}")
            results["portraits"] = await self.generate_all_portraits(
                character_id=character_id,
                save_to_disk=save_to_disk,
            )

        if include_states:
            logger.info(f"Generating state pack for {character_id}")
            results["states"] = await self.generate_all_states(
                character_id=character_id,
                save_to_disk=save_to_disk,
            )

        if include_expressions:
            logger.info(f"Generating expression pack for {character_id}")
            results["expressions"] = await self.generate_all_expressions(
                character_id=character_id,
                save_to_disk=save_to_disk,
            )

        return results
