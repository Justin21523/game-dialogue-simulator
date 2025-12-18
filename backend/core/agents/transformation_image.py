"""
Transformation Image Agent for Super Wings Simulator.
Handles character transformation sequence image generation.
"""

import logging
from pathlib import Path
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from .base_agent import BaseAgent, ReasoningMode, PlanStep
from .comfyui_workflow import get_comfyui_agent, GenerationRequest, GenerationType
from .prompt_engineer import get_prompt_agent

logger = logging.getLogger(__name__)


class TransformationStage(str, Enum):
    """Stages of character transformation."""
    PLANE_FORM = "plane_form"
    INITIATING = "initiating"
    EARLY_TRANSFORM = "early_transform"
    MID_TRANSFORM = "mid_transform"
    LATE_TRANSFORM = "late_transform"
    ROBOT_FORM = "robot_form"


class TransformationEffect(str, Enum):
    """Visual effects for transformation."""
    ENERGY_GLOW = "energy_glow"
    SPARKLES = "sparkles"
    MOTION_BLUR = "motion_blur"
    LIGHT_RAYS = "light_rays"
    ELECTRIC_ARCS = "electric_arcs"


class TransformationRequest(BaseModel):
    """Request for transformation image generation."""
    character_id: str
    stage: Optional[TransformationStage] = None
    progress: float = 0.5  # 0.0 = plane, 1.0 = robot
    effects: List[TransformationEffect] = []
    num_keyframes: int = 5
    additional_details: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class TransformationResult(BaseModel):
    """Result of transformation image generation."""
    success: bool
    character_id: str
    stage: Optional[str] = None
    progress: float = 0.0
    images: List[Dict[str, Any]] = []
    prompt_used: str = ""
    negative_prompt_used: str = ""
    generation_time_ms: float = 0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class TransformationSequenceResult(BaseModel):
    """Result of transformation sequence generation."""
    character_id: str
    total_frames: int
    completed_frames: int
    failed_frames: int
    frames: List[TransformationResult] = []
    errors: List[Dict[str, str]] = []


# Stage descriptions for prompt building
STAGE_DESCRIPTIONS = {
    TransformationStage.PLANE_FORM: {
        "progress": 0.0,
        "description": "in full airplane form, sleek jet plane body, wings extended",
        "pose": "flying pose, aerodynamic position",
    },
    TransformationStage.INITIATING: {
        "progress": 0.15,
        "description": "beginning transformation, slight movement in body panels",
        "pose": "starting to shift, energy building",
    },
    TransformationStage.EARLY_TRANSFORM: {
        "progress": 0.35,
        "description": "wings folding, front section lifting, legs starting to form",
        "pose": "parts unfolding, mechanical shifting visible",
    },
    TransformationStage.MID_TRANSFORM: {
        "progress": 0.5,
        "description": "halfway transformed, body vertical, arms forming from wings",
        "pose": "dramatic mid-transformation, equal parts plane and robot",
    },
    TransformationStage.LATE_TRANSFORM: {
        "progress": 0.75,
        "description": "mostly robot form, head visible, limbs nearly complete",
        "pose": "robot stance emerging, final adjustments",
    },
    TransformationStage.ROBOT_FORM: {
        "progress": 1.0,
        "description": "fully transformed robot mode, standing heroic pose",
        "pose": "complete robot form, confident stance, ready for action",
    },
}

EFFECT_DESCRIPTIONS = {
    TransformationEffect.ENERGY_GLOW: "glowing energy aura, bright light emanating from body",
    TransformationEffect.SPARKLES: "magical sparkles, shimmering light particles",
    TransformationEffect.MOTION_BLUR: "dynamic motion blur, speed lines, movement energy",
    TransformationEffect.LIGHT_RAYS: "radiant light rays, dramatic lighting beams",
    TransformationEffect.ELECTRIC_ARCS: "electric arcs, energy crackling, power surge",
}


# Singleton instance
_transformation_agent: Optional["TransformationImageAgent"] = None


def get_transformation_agent() -> "TransformationImageAgent":
    """Get or create TransformationImageAgent singleton."""
    global _transformation_agent
    if _transformation_agent is None:
        _transformation_agent = TransformationImageAgent()
    return _transformation_agent


class TransformationImageAgent(BaseAgent):
    """
    Agent for generating character transformation sequences.

    This agent handles:
    - Single transformation frame generation
    - Complete transformation sequence (5-10 keyframes)
    - Transformation progress control (0.0 plane -> 1.0 robot)
    - Visual effects integration
    """

    def __init__(
        self,
        output_dir: str = "./assets/images/transformations",
    ):
        super().__init__(
            name="transformation_image_agent",
            description="Agent for generating Super Wings transformation sequences",
            reasoning_mode=ReasoningMode.COT,
            enable_planning=False,
        )

        self.output_dir = Path(output_dir)
        self._comfyui_agent = None
        self._prompt_agent = None

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
        return """You are a Transformation Image agent for Super Wings.
Your role is to generate transformation sequence images showing characters
changing from plane to robot form. You understand mechanical transformation
aesthetics and can create visually dramatic sequences."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute transformation image generation step."""
        return {"step": step.step_number, "output": "Transformation generated", "success": True}

    def get_stage_for_progress(self, progress: float) -> TransformationStage:
        """Get the appropriate stage for a progress value."""
        if progress <= 0.1:
            return TransformationStage.PLANE_FORM
        elif progress <= 0.25:
            return TransformationStage.INITIATING
        elif progress <= 0.45:
            return TransformationStage.EARLY_TRANSFORM
        elif progress <= 0.65:
            return TransformationStage.MID_TRANSFORM
        elif progress <= 0.85:
            return TransformationStage.LATE_TRANSFORM
        else:
            return TransformationStage.ROBOT_FORM

    def _build_transformation_prompt(
        self,
        character_id: str,
        progress: float,
        effects: Optional[List[TransformationEffect]] = None,
        additional_details: Optional[str] = None,
    ) -> tuple[str, str]:
        """Build prompt for transformation frame."""
        if effects is None:
            effects = []

        # Get character info
        char_info = self.prompt_agent.get_character_info(character_id)
        if not char_info:
            raise ValueError(f"Unknown character: {character_id}")

        # Determine stage
        stage = self.get_stage_for_progress(progress)
        stage_info = STAGE_DESCRIPTIONS[stage]

        prompt_parts = []

        # Character identity
        prompt_parts.append(char_info.trigger)
        prompt_parts.append(f"{char_info.colors} coloring")
        prompt_parts.append(char_info.unique)

        # Transformation state
        prompt_parts.append(stage_info["description"])
        prompt_parts.append(stage_info["pose"])

        # Progress-specific details
        if 0.2 < progress < 0.8:
            prompt_parts.append("transformation in progress, mechanical parts visible")
            prompt_parts.append("dynamic pose, energy radiating")

        # Effects
        for effect in effects:
            effect_desc = EFFECT_DESCRIPTIONS.get(effect, "")
            if effect_desc:
                prompt_parts.append(effect_desc)

        # Default effects for transformation
        if not effects:
            prompt_parts.append("transformation energy glow, dynamic lighting")

        # Additional details
        if additional_details:
            prompt_parts.append(additional_details)

        # Style
        style = self.prompt_agent.get_style_keywords()
        prompt_parts.append(style.get("base", ""))
        prompt_parts.append(style.get("quality", ""))
        prompt_parts.append("dramatic lighting, action scene")

        positive_prompt = ", ".join(filter(None, prompt_parts))

        # Negative prompt
        negative_prompt = self.prompt_agent.optimize_negative_prompt(
            include_character_protection=True,
            character_id=character_id,
            additional_negatives=["static pose", "boring composition"]
        )

        return positive_prompt, negative_prompt

    async def generate_transformation_frame(
        self,
        character_id: str,
        progress: float = 0.5,
        effects: Optional[List[TransformationEffect]] = None,
        additional_details: Optional[str] = None,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> TransformationResult:
        """
        Generate a single transformation frame.

        Args:
            character_id: Character ID
            progress: Transformation progress (0.0 = plane, 1.0 = robot)
            effects: Visual effects to include (defaults to empty list)
            additional_details: Extra prompt details
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            TransformationResult with generated image info
        """
        if effects is None:
            effects = []

        try:
            # Clamp progress
            progress = max(0.0, min(1.0, progress))

            # Build prompt
            positive_prompt, negative_prompt = self._build_transformation_prompt(
                character_id=character_id,
                progress=progress,
                effects=effects,
                additional_details=additional_details,
            )

            # Get character LoRA
            char_info = self.prompt_agent.get_character_info(character_id)

            # Generate filename
            if not output_filename:
                progress_pct = int(progress * 100)
                output_filename = f"{character_id}_transform_{progress_pct:03d}"

            # Create generation request
            resolution = self.prompt_agent.get_resolution("portrait")
            gen_request = GenerationRequest(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=resolution["width"],
                height=resolution["height"],
                steps=45,  # More steps for complex transformation
                cfg_scale=8.5,
                lora_path=char_info.lora_path if char_info else None,
                lora_weight=0.85,  # Slightly lower for transformation flexibility
                generation_type=GenerationType.TRANSFORMATION,
                output_filename=output_filename,
            )

            # Generate image
            result = await self.comfyui_agent.generate(gen_request, save_to_disk=save_to_disk)

            stage = self.get_stage_for_progress(progress)

            return TransformationResult(
                success=result.success,
                character_id=character_id,
                stage=stage.value,
                progress=progress,
                images=result.images,
                prompt_used=positive_prompt,
                negative_prompt_used=negative_prompt,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "stage": stage.value,
                    "progress": progress,
                    "effects": [e.value for e in effects],
                }
            )

        except Exception as e:
            logger.error(f"Transformation frame generation failed: {e}")
            return TransformationResult(
                success=False,
                character_id=character_id,
                progress=progress,
                error_message=str(e),
            )

    async def generate_transformation_sequence(
        self,
        character_id: str,
        num_keyframes: int = 5,
        effects: Optional[List[TransformationEffect]] = None,
        save_to_disk: bool = True,
    ) -> TransformationSequenceResult:
        """
        Generate a complete transformation sequence.

        Args:
            character_id: Character ID
            num_keyframes: Number of frames to generate (5-10)
            effects: Visual effects for all frames (defaults to empty list)
            save_to_disk: Whether to save images locally

        Returns:
            TransformationSequenceResult with all frames
        """
        if effects is None:
            effects = []
        # Clamp keyframes
        num_keyframes = max(3, min(10, num_keyframes))

        frames = []
        errors = []

        # Calculate progress values for each frame
        progress_values = [i / (num_keyframes - 1) for i in range(num_keyframes)]

        for i, progress in enumerate(progress_values):
            logger.info(f"Generating transformation frame {i+1}/{num_keyframes} "
                       f"(progress: {progress:.2f}) for {character_id}")

            result = await self.generate_transformation_frame(
                character_id=character_id,
                progress=progress,
                effects=effects,
                save_to_disk=save_to_disk,
            )

            if result.success:
                frames.append(result)
            else:
                errors.append({
                    "frame": i + 1,
                    "progress": progress,
                    "error": result.error_message or "Unknown error",
                })

        return TransformationSequenceResult(
            character_id=character_id,
            total_frames=num_keyframes,
            completed_frames=len(frames),
            failed_frames=len(errors),
            frames=frames,
            errors=errors,
        )

    async def generate_stage_frames(
        self,
        character_id: str,
        effects: Optional[List[TransformationEffect]] = None,
        save_to_disk: bool = True,
    ) -> TransformationSequenceResult:
        """
        Generate one frame for each transformation stage.

        Args:
            character_id: Character ID
            effects: Visual effects for all frames (defaults to empty list)
            save_to_disk: Whether to save images locally

        Returns:
            TransformationSequenceResult with all stage frames
        """
        if effects is None:
            effects = []

        frames = []
        errors = []

        for stage in TransformationStage:
            stage_info = STAGE_DESCRIPTIONS[stage]
            progress = stage_info["progress"]

            logger.info(f"Generating {stage.value} for {character_id}")

            result = await self.generate_transformation_frame(
                character_id=character_id,
                progress=progress,
                effects=effects,
                save_to_disk=save_to_disk,
                output_filename=f"{character_id}_transform_{stage.value}",
            )

            if result.success:
                frames.append(result)
            else:
                errors.append({
                    "stage": stage.value,
                    "error": result.error_message or "Unknown error",
                })

        return TransformationSequenceResult(
            character_id=character_id,
            total_frames=len(TransformationStage),
            completed_frames=len(frames),
            failed_frames=len(errors),
            frames=frames,
            errors=errors,
        )

    async def generate_all_characters_transformation(
        self,
        num_keyframes: int = 5,
        effects: Optional[List[TransformationEffect]] = None,
        save_to_disk: bool = True,
    ) -> Dict[str, TransformationSequenceResult]:
        """
        Generate transformation sequences for all characters.

        Args:
            num_keyframes: Number of frames per character
            effects: Visual effects for all frames (defaults to empty list)
            save_to_disk: Whether to save images locally

        Returns:
            Dictionary with results for each character
        """
        if effects is None:
            effects = []

        results = {}

        for character_id in self.prompt_agent.get_all_characters():
            logger.info(f"Generating transformation sequence for {character_id}")

            results[character_id] = await self.generate_transformation_sequence(
                character_id=character_id,
                num_keyframes=num_keyframes,
                effects=effects,
                save_to_disk=save_to_disk,
            )

        return results
