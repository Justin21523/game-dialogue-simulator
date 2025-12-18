"""
Scene Composer Agent for Super Wings Simulator.
Handles compositing characters with backgrounds into complete scenes.
"""

import logging
from pathlib import Path
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

from .base_agent import BaseAgent, ReasoningMode, PlanStep
from .comfyui_workflow import get_comfyui_agent, GenerationRequest, GenerationType
from .prompt_engineer import get_prompt_agent, ViewAngle, CharacterState

logger = logging.getLogger(__name__)


class SceneType(str, Enum):
    """Types of composed scenes."""
    MISSION_START = "mission_start"
    IN_FLIGHT = "in_flight"
    ARRIVAL = "arrival"
    ACTION = "action"
    CELEBRATION = "celebration"
    GROUP_SHOT = "group_shot"


class LayerType(str, Enum):
    """Types of layers in a scene."""
    BACKGROUND = "background"
    MIDGROUND = "midground"
    CHARACTER = "character"
    FOREGROUND = "foreground"
    EFFECTS = "effects"


class VisualEffect(str, Enum):
    """Visual effects for scenes."""
    MOTION_BLUR = "motion_blur"
    GLOW = "glow"
    SHADOW = "shadow"
    LENS_FLARE = "lens_flare"
    SPEED_LINES = "speed_lines"
    PARTICLES = "particles"
    DEPTH_OF_FIELD = "depth_of_field"


class CharacterPlacement(BaseModel):
    """Placement info for a character in a scene."""
    character_id: str
    position: str = "center"  # left, center, right, custom
    scale: float = 1.0
    state: Optional[CharacterState] = None
    view_angle: Optional[ViewAngle] = None


class SceneRequest(BaseModel):
    """Request for scene composition."""
    scene_type: SceneType = SceneType.IN_FLIGHT
    characters: List[CharacterPlacement] = []
    background_location: Optional[str] = None
    sky_type: Optional[str] = None
    time_of_day: Optional[str] = None
    effects: List[VisualEffect] = []
    additional_details: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class SceneResult(BaseModel):
    """Result of scene composition."""
    success: bool
    scene_type: str
    characters: List[str] = []
    images: List[Dict[str, Any]] = []
    prompt_used: str = ""
    negative_prompt_used: str = ""
    generation_time_ms: float = 0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


# Scene type descriptions
SCENE_TYPE_DESCRIPTIONS = {
    SceneType.MISSION_START: {
        "description": "departure scene, takeoff from World Airport",
        "character_state": CharacterState.TAKEOFF,
        "atmosphere": "exciting, adventurous, morning energy",
    },
    SceneType.IN_FLIGHT: {
        "description": "flying through the sky, soaring above clouds",
        "character_state": CharacterState.IN_FLIGHT,
        "atmosphere": "dynamic, free, exhilarating",
    },
    SceneType.ARRIVAL: {
        "description": "arriving at destination, descending to location",
        "character_state": CharacterState.LANDING,
        "atmosphere": "anticipation, discovery, new adventure",
    },
    SceneType.ACTION: {
        "description": "action scene, helping someone, problem solving",
        "character_state": CharacterState.WORKING,
        "atmosphere": "heroic, determined, focused",
    },
    SceneType.CELEBRATION: {
        "description": "celebration scene, mission complete, happy ending",
        "character_state": CharacterState.CELEBRATING,
        "atmosphere": "joyful, triumphant, warm",
    },
    SceneType.GROUP_SHOT: {
        "description": "group scene, multiple characters together",
        "character_state": CharacterState.IDLE,
        "atmosphere": "friendly, team spirit, unity",
    },
}

EFFECT_DESCRIPTIONS = {
    VisualEffect.MOTION_BLUR: "motion blur effect, speed indication",
    VisualEffect.GLOW: "soft glow effect, warm lighting",
    VisualEffect.SHADOW: "dramatic shadows, depth effect",
    VisualEffect.LENS_FLARE: "lens flare, sun glare effect",
    VisualEffect.SPEED_LINES: "speed lines, dynamic movement indication",
    VisualEffect.PARTICLES: "particle effects, sparkles or debris",
    VisualEffect.DEPTH_OF_FIELD: "depth of field, background blur",
}


# Singleton instance
_scene_composer_agent: Optional["SceneComposerAgent"] = None


def get_scene_composer_agent() -> "SceneComposerAgent":
    """Get or create SceneComposerAgent singleton."""
    global _scene_composer_agent
    if _scene_composer_agent is None:
        _scene_composer_agent = SceneComposerAgent()
    return _scene_composer_agent


class SceneComposerAgent(BaseAgent):
    """
    Agent for composing complete scenes.

    This agent handles:
    - Combining characters with backgrounds
    - Scene type composition (mission start, in-flight, etc.)
    - Visual effects integration
    - Multi-character scenes
    """

    def __init__(
        self,
        output_dir: str = "./assets/images/scenes",
    ):
        super().__init__(
            name="scene_composer_agent",
            description="Agent for composing Super Wings scenes",
            reasoning_mode=ReasoningMode.REACT,
            enable_planning=True,
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
        return """You are a Scene Composer agent for Super Wings.
Your role is to compose complete scenes by combining characters with backgrounds.
You understand scene composition, visual storytelling, and can create
compelling imagery for different game scenarios."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute scene composition step."""
        return {"step": step.step_number, "output": "Scene composed", "success": True}

    def _build_scene_prompt(
        self,
        scene_type: SceneType,
        characters: List[CharacterPlacement],
        background_location: Optional[str] = None,
        sky_type: Optional[str] = None,
        time_of_day: Optional[str] = None,
        effects: List[VisualEffect] = [],
        additional_details: Optional[str] = None,
    ) -> Tuple[str, str, Optional[str]]:
        """Build prompt for scene composition."""
        scene_info = SCENE_TYPE_DESCRIPTIONS[scene_type]

        prompt_parts = []
        lora_path = None

        # Scene description
        prompt_parts.append(scene_info["description"])
        prompt_parts.append(scene_info["atmosphere"])

        # Characters
        if characters:
            char_descriptions = []
            for placement in characters:
                char_info = self.prompt_agent.get_character_info(placement.character_id)
                if char_info:
                    char_desc = f"{char_info.trigger}, {char_info.colors}"
                    if placement.position != "center":
                        char_desc += f" on {placement.position}"
                    char_descriptions.append(char_desc)

                    # Use first character's LoRA
                    if lora_path is None:
                        lora_path = char_info.lora_path

            if len(char_descriptions) == 1:
                prompt_parts.append(char_descriptions[0])
            else:
                prompt_parts.append(f"featuring {', '.join(char_descriptions)}")

            # Character state from scene type
            state = scene_info["character_state"]
            state_desc = {
                CharacterState.TAKEOFF: "taking off, ascending motion",
                CharacterState.IN_FLIGHT: "flying dynamically through sky",
                CharacterState.LANDING: "approaching for landing",
                CharacterState.WORKING: "actively helping, focused action",
                CharacterState.CELEBRATING: "celebrating joyfully, happy pose",
                CharacterState.IDLE: "standing together, friendly pose",
            }
            prompt_parts.append(state_desc.get(state, "in action"))

        # Background
        if background_location:
            prompt_parts.append(f"{background_location} background")

        if sky_type:
            prompt_parts.append(f"{sky_type} sky")

        if time_of_day:
            time_descs = {
                "day": "bright daylight",
                "sunset": "golden sunset lighting",
                "night": "night scene with stars",
                "dawn": "early morning light",
            }
            prompt_parts.append(time_descs.get(time_of_day, time_of_day))

        # Effects
        for effect in effects:
            effect_desc = EFFECT_DESCRIPTIONS.get(effect, "")
            if effect_desc:
                prompt_parts.append(effect_desc)

        # Additional details
        if additional_details:
            prompt_parts.append(additional_details)

        # Style
        style = self.prompt_agent.get_style_keywords()
        prompt_parts.append(style.get("base", ""))
        prompt_parts.append(style.get("quality", ""))
        prompt_parts.append("cinematic composition, professional scene")

        positive_prompt = ", ".join(filter(None, prompt_parts))

        # Negative prompt
        negative_prompt = self.prompt_agent.optimize_negative_prompt(
            include_character_protection=True,
            character_id=characters[0].character_id if characters else None,
            additional_negatives=["amateur composition", "cluttered scene"]
        )

        return positive_prompt, negative_prompt, lora_path

    async def compose_scene(
        self,
        request: SceneRequest,
    ) -> SceneResult:
        """
        Compose a complete scene.

        Args:
            request: SceneRequest with all parameters

        Returns:
            SceneResult with composed image info
        """
        try:
            # Build prompt
            positive_prompt, negative_prompt, lora_path = self._build_scene_prompt(
                scene_type=request.scene_type,
                characters=request.characters,
                background_location=request.background_location,
                sky_type=request.sky_type,
                time_of_day=request.time_of_day,
                effects=request.effects,
                additional_details=request.additional_details,
            )

            # Generate filename
            if not request.output_filename:
                char_ids = "_".join([c.character_id for c in request.characters[:2]])
                request.output_filename = f"scene_{request.scene_type.value}_{char_ids}"

            # Create generation request
            resolution = self.prompt_agent.get_resolution("background")
            gen_request = GenerationRequest(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=resolution["width"],
                height=resolution["height"],
                steps=40,
                cfg_scale=8.0,
                lora_path=lora_path,
                lora_weight=0.8,  # Lower weight for scene composition
                generation_type=GenerationType.SCENE_COMPOSITE,
                output_filename=request.output_filename,
            )

            # Generate image
            result = await self.comfyui_agent.generate(gen_request, save_to_disk=request.save_to_disk)

            return SceneResult(
                success=result.success,
                scene_type=request.scene_type.value,
                characters=[c.character_id for c in request.characters],
                images=result.images,
                prompt_used=positive_prompt,
                negative_prompt_used=negative_prompt,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "scene_type": request.scene_type.value,
                    "background_location": request.background_location,
                    "time_of_day": request.time_of_day,
                    "effects": [e.value for e in request.effects],
                }
            )

        except Exception as e:
            logger.error(f"Scene composition failed: {e}")
            return SceneResult(
                success=False,
                scene_type=request.scene_type.value,
                error_message=str(e),
            )

    async def compose_mission_scene(
        self,
        character_id: str,
        location: str,
        scene_type: SceneType = SceneType.IN_FLIGHT,
        time_of_day: str = "day",
        save_to_disk: bool = True,
    ) -> SceneResult:
        """
        Compose a mission scene with a character at a location.

        Args:
            character_id: Main character ID
            location: Background location
            scene_type: Type of scene
            time_of_day: Time setting
            save_to_disk: Whether to save images locally

        Returns:
            SceneResult with composed image info
        """
        request = SceneRequest(
            scene_type=scene_type,
            characters=[CharacterPlacement(character_id=character_id)],
            background_location=location,
            time_of_day=time_of_day,
            effects=[VisualEffect.MOTION_BLUR] if scene_type == SceneType.IN_FLIGHT else [],
            save_to_disk=save_to_disk,
        )

        return await self.compose_scene(request)

    async def compose_celebration_scene(
        self,
        character_ids: List[str],
        location: Optional[str] = None,
        save_to_disk: bool = True,
    ) -> SceneResult:
        """
        Compose a celebration scene with multiple characters.

        Args:
            character_ids: List of character IDs
            location: Optional background location
            save_to_disk: Whether to save images locally

        Returns:
            SceneResult with composed image info
        """
        characters = [
            CharacterPlacement(character_id=cid, position=pos)
            for cid, pos in zip(character_ids, ["left", "center", "right"][:len(character_ids)])
        ]

        request = SceneRequest(
            scene_type=SceneType.CELEBRATION,
            characters=characters,
            background_location=location or "world_airport",
            time_of_day="day",
            effects=[VisualEffect.GLOW, VisualEffect.PARTICLES],
            save_to_disk=save_to_disk,
        )

        return await self.compose_scene(request)

    async def generate_mission_scene_pack(
        self,
        character_id: str,
        location: str,
        save_to_disk: bool = True,
    ) -> Dict[str, SceneResult]:
        """
        Generate a complete set of scenes for a mission.

        Args:
            character_id: Character ID
            location: Mission location
            save_to_disk: Whether to save images locally

        Returns:
            Dictionary with results for each scene type
        """
        results = {}

        scene_configs = [
            (SceneType.MISSION_START, "world_airport", "day"),
            (SceneType.IN_FLIGHT, "clouds", "day"),
            (SceneType.ARRIVAL, location, "day"),
            (SceneType.ACTION, location, "day"),
            (SceneType.CELEBRATION, location, "sunset"),
        ]

        for scene_type, bg_location, time in scene_configs:
            logger.info(f"Generating {scene_type.value} scene for {character_id}")

            result = await self.compose_mission_scene(
                character_id=character_id,
                location=bg_location,
                scene_type=scene_type,
                time_of_day=time,
                save_to_disk=save_to_disk,
            )

            results[scene_type.value] = result

        return results
