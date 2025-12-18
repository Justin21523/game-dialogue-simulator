"""
Prompt Engineer Agent for Super Wings Simulator.
Handles prompt optimization and character-specific prompt building.
"""

import json
import logging
from pathlib import Path
from enum import Enum
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from .base_agent import BaseAgent, ReasoningMode, PlanStep

logger = logging.getLogger(__name__)


class PromptCategory(str, Enum):
    """Categories of prompts."""
    CHARACTER_PORTRAIT = "character_portrait"
    CHARACTER_STATE = "character_state"
    CHARACTER_EXPRESSION = "character_expression"
    BACKGROUND = "background"
    UI_ELEMENT = "ui_element"
    TRANSFORMATION = "transformation"
    SCENE = "scene"


class ViewAngle(str, Enum):
    """Supported view angles for character prompts."""
    FRONT_VIEW = "front_view"
    THREE_QUARTER_VIEW = "three_quarter_view"
    SIDE_VIEW = "side_view"
    FLYING_POSE = "flying_pose"
    TRANSFORMATION = "transformation"
    ACTION_POSE = "action_pose"
    LANDING_POSE = "landing_pose"
    HEROIC_POSE = "heroic_pose"


class CharacterState(str, Enum):
    """Character states for image generation."""
    IDLE = "idle"
    IN_FLIGHT = "in_flight"
    TAKEOFF = "takeoff"
    LANDING = "landing"
    TRANSFORMING = "transforming"
    TRANSFORMED = "transformed"
    CELEBRATING = "celebrating"
    THINKING = "thinking"
    WORKING = "working"
    RESTING = "resting"


class CharacterExpression(str, Enum):
    """Character expressions for image generation."""
    HAPPY = "happy"
    EXCITED = "excited"
    SURPRISED = "surprised"
    DETERMINED = "determined"
    WORRIED = "worried"
    PROUD = "proud"
    CURIOUS = "curious"
    FRIENDLY = "friendly"


@dataclass
class CharacterInfo:
    """Character information for prompt building."""
    character_id: str
    trigger: str
    name: str
    name_zh: str
    colors: str
    color_detail: str
    features: str
    unique: str
    style: str
    eye_color: str
    specialization: str
    lora_path: str
    critical_warning: Optional[str] = None


class PromptRequest(BaseModel):
    """Request for prompt engineering."""
    category: PromptCategory
    character_id: Optional[str] = None
    view_angle: Optional[ViewAngle] = None
    state: Optional[CharacterState] = None
    expression: Optional[CharacterExpression] = None
    background_type: Optional[str] = None
    scene_description: Optional[str] = None
    additional_details: Optional[str] = None
    style_override: Optional[str] = None


class EnhancedPrompt(BaseModel):
    """Enhanced prompt result."""
    positive_prompt: str
    negative_prompt: str
    character_id: Optional[str] = None
    lora_path: Optional[str] = None
    lora_weight: float = 0.9
    resolution: Dict[str, int] = {"width": 1024, "height": 1024}
    recommended_steps: int = 40
    recommended_cfg: float = 8.0
    metadata: Dict[str, Any] = {}


# Singleton instance
_prompt_agent: Optional["PromptEngineerAgent"] = None


def get_prompt_agent() -> "PromptEngineerAgent":
    """Get or create PromptEngineerAgent singleton."""
    global _prompt_agent
    if _prompt_agent is None:
        _prompt_agent = PromptEngineerAgent()
    return _prompt_agent


class PromptEngineerAgent(BaseAgent):
    """
    Agent for engineering and optimizing image generation prompts.

    This agent handles:
    - Loading shared settings and character descriptions
    - Building character-specific prompts with LoRA integration
    - Enhancing base prompts with style and quality keywords
    - Optimizing negative prompts for best results
    """

    def __init__(
        self,
        settings_path: str = "./prompts/game_assets/shared_settings.json",
    ):
        super().__init__(
            name="prompt_engineer_agent",
            description="Agent for engineering and optimizing image generation prompts",
            reasoning_mode=ReasoningMode.COT,
            enable_planning=False,
        )

        self.settings_path = Path(settings_path)
        self._settings: Optional[Dict[str, Any]] = None
        self._characters: Dict[str, CharacterInfo] = {}

        # View angle templates
        self._view_templates = {
            ViewAngle.FRONT_VIEW: "front view, facing camera, symmetrical pose",
            ViewAngle.THREE_QUARTER_VIEW: "three-quarter view, angled perspective",
            ViewAngle.SIDE_VIEW: "side view, profile angle",
            ViewAngle.FLYING_POSE: "flying pose, dynamic flight angle, soaring through sky",
            ViewAngle.TRANSFORMATION: "mid-transformation pose, changing form",
            ViewAngle.ACTION_POSE: "dynamic action pose, energetic movement",
            ViewAngle.LANDING_POSE: "landing pose, approaching ground",
            ViewAngle.HEROIC_POSE: "heroic pose, confident stance",
        }

        # State templates
        self._state_templates = {
            CharacterState.IDLE: "standing idle, relaxed pose",
            CharacterState.IN_FLIGHT: "flying through the air, wings extended",
            CharacterState.TAKEOFF: "taking off, ascending motion",
            CharacterState.LANDING: "landing, descending, wheels down",
            CharacterState.TRANSFORMING: "mid-transformation, morphing between forms",
            CharacterState.TRANSFORMED: "fully transformed into robot mode",
            CharacterState.CELEBRATING: "celebrating, joyful pose, arms up",
            CharacterState.THINKING: "thinking pose, contemplative expression",
            CharacterState.WORKING: "working pose, focused on task",
            CharacterState.RESTING: "resting pose, relaxed position",
        }

        # Expression templates
        self._expression_templates = {
            CharacterExpression.HAPPY: "happy expression, bright smile, joyful",
            CharacterExpression.EXCITED: "excited expression, enthusiastic, energetic",
            CharacterExpression.SURPRISED: "surprised expression, wide eyes, amazed",
            CharacterExpression.DETERMINED: "determined expression, focused, resolute",
            CharacterExpression.WORRIED: "worried expression, concerned look",
            CharacterExpression.PROUD: "proud expression, satisfied smile, accomplished",
            CharacterExpression.CURIOUS: "curious expression, interested look, inquisitive",
            CharacterExpression.FRIENDLY: "friendly expression, welcoming smile, approachable",
        }

    @property
    def settings(self) -> Dict[str, Any]:
        """Load and cache settings."""
        if self._settings is None:
            self._load_settings()
        return self._settings

    def _load_settings(self) -> None:
        """Load shared settings from JSON file."""
        try:
            with open(self.settings_path, 'r', encoding='utf-8') as f:
                self._settings = json.load(f)

            # Build character info objects
            char_descs = self._settings.get("character_descriptions", {})
            lora_paths = self._settings.get("lora_paths", {})

            for char_id, desc in char_descs.items():
                self._characters[char_id] = CharacterInfo(
                    character_id=char_id,
                    trigger=desc.get("trigger", char_id),
                    name=desc.get("name", char_id.capitalize()),
                    name_zh=desc.get("name_zh", ""),
                    colors=desc.get("colors", ""),
                    color_detail=desc.get("color_detail", ""),
                    features=desc.get("features", ""),
                    unique=desc.get("unique", ""),
                    style=desc.get("style", ""),
                    eye_color=desc.get("eye_color", ""),
                    specialization=desc.get("specialization", ""),
                    lora_path=lora_paths.get(char_id, ""),
                    critical_warning=desc.get("critical_warning"),
                )

            logger.info(f"Loaded settings with {len(self._characters)} characters")
        except Exception as e:
            logger.error(f"Failed to load settings: {e}")
            self._settings = {}

    async def get_system_prompt(self) -> str:
        return """You are a Prompt Engineering agent for Super Wings image generation.
Your role is to craft optimized prompts for Stable Diffusion XL with LoRA models.
You understand character features, style keywords, and how to structure prompts for best results."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute prompt engineering step."""
        return {"step": step.step_number, "output": "Prompt engineered", "success": True}

    def get_character_info(self, character_id: str) -> Optional[CharacterInfo]:
        """Get character information by ID."""
        _ = self.settings  # Ensure settings are loaded
        return self._characters.get(character_id.lower())

    def get_all_characters(self) -> List[str]:
        """Get list of all character IDs."""
        _ = self.settings
        return list(self._characters.keys())

    def get_style_keywords(self) -> Dict[str, str]:
        """Get style keywords from settings."""
        return self.settings.get("style_keywords", {})

    def get_negative_prompts(self) -> Dict[str, str]:
        """Get negative prompt components."""
        return self.settings.get("negative_prompts", {})

    def get_resolution(self, resolution_key: str) -> Dict[str, int]:
        """Get resolution by key."""
        resolutions = self.settings.get("generation_parameters", {}).get("resolutions", {})
        return resolutions.get(resolution_key, {"width": 1024, "height": 1024})

    def build_character_prompt(
        self,
        character_id: str,
        view_angle: Optional[ViewAngle] = None,
        state: Optional[CharacterState] = None,
        expression: Optional[CharacterExpression] = None,
        additional_details: Optional[str] = None,
        include_style: bool = True,
    ) -> EnhancedPrompt:
        """
        Build a complete prompt for a character image.

        Args:
            character_id: Character ID (jett, flip, etc.)
            view_angle: Camera angle/view
            state: Character state
            expression: Character expression
            additional_details: Extra prompt details
            include_style: Whether to include style keywords

        Returns:
            EnhancedPrompt with positive/negative prompts and settings
        """
        char_info = self.get_character_info(character_id)
        if not char_info:
            raise ValueError(f"Unknown character: {character_id}")

        # Build prompt parts
        prompt_parts = []

        # 1. Character trigger and basic description
        prompt_parts.append(char_info.trigger)
        prompt_parts.append(char_info.features)

        # 2. Color emphasis
        prompt_parts.append(f"{char_info.colors} coloring")

        # 3. Unique features (critical for character distinction)
        prompt_parts.append(char_info.unique)

        # 4. Eye color
        prompt_parts.append(f"{char_info.eye_color} eyes")

        # 5. View angle
        if view_angle:
            prompt_parts.append(self._view_templates.get(view_angle, ""))

        # 6. State
        if state:
            prompt_parts.append(self._state_templates.get(state, ""))

        # 7. Expression
        if expression:
            prompt_parts.append(self._expression_templates.get(expression, ""))
        else:
            # Default to character's natural style
            prompt_parts.append(char_info.style)

        # 8. Additional details
        if additional_details:
            prompt_parts.append(additional_details)

        # 9. Style keywords
        if include_style:
            style = self.get_style_keywords()
            prompt_parts.append(style.get("base", ""))
            prompt_parts.append(style.get("lighting", ""))
            prompt_parts.append(style.get("quality", ""))

        # Combine and clean
        positive_prompt = ", ".join(filter(None, prompt_parts))

        # Build negative prompt
        negative_prompt = self.optimize_negative_prompt(
            include_character_protection=True,
            character_id=character_id,
        )

        # Determine resolution based on view
        if view_angle in [ViewAngle.FLYING_POSE, ViewAngle.ACTION_POSE]:
            resolution = self.get_resolution("background")  # Wider for action
        else:
            resolution = self.get_resolution("portrait")

        return EnhancedPrompt(
            positive_prompt=positive_prompt,
            negative_prompt=negative_prompt,
            character_id=character_id,
            lora_path=char_info.lora_path,
            lora_weight=0.9,
            resolution=resolution,
            recommended_steps=40,
            recommended_cfg=8.0,
            metadata={
                "character_name": char_info.name,
                "view_angle": view_angle.value if view_angle else None,
                "state": state.value if state else None,
                "expression": expression.value if expression else None,
                "critical_warning": char_info.critical_warning,
            }
        )

    def enhance_prompt(
        self,
        base_prompt: str,
        category: PromptCategory = PromptCategory.CHARACTER_PORTRAIT,
        add_style: bool = True,
        add_quality: bool = True,
        add_lighting: bool = True,
    ) -> str:
        """
        Enhance a base prompt with style and quality keywords.

        Args:
            base_prompt: The base prompt to enhance
            category: Type of image being generated
            add_style: Add style keywords
            add_quality: Add quality keywords
            add_lighting: Add lighting keywords

        Returns:
            Enhanced prompt string
        """
        parts = [base_prompt]
        style = self.get_style_keywords()

        if add_style:
            parts.append(style.get("base", ""))

        if add_lighting:
            parts.append(style.get("lighting", ""))

        if add_quality:
            parts.append(style.get("quality", ""))

        return ", ".join(filter(None, parts))

    def optimize_negative_prompt(
        self,
        include_character_protection: bool = True,
        include_quality: bool = True,
        include_anatomy: bool = True,
        include_style_exclusion: bool = True,
        character_id: Optional[str] = None,
        additional_negatives: Optional[List[str]] = None,
    ) -> str:
        """
        Build an optimized negative prompt.

        Args:
            include_character_protection: Add prompts to prevent character mixing
            include_quality: Add quality-related negatives
            include_anatomy: Add anatomy-related negatives
            include_style_exclusion: Add style exclusion negatives
            character_id: Character ID for specific protections
            additional_negatives: Extra negative prompts to add

        Returns:
            Optimized negative prompt string
        """
        neg_prompts = self.get_negative_prompts()
        parts = []

        # Base negatives (human exclusion)
        parts.append(neg_prompts.get("base", ""))

        # Character protection
        if include_character_protection:
            parts.append(neg_prompts.get("multi_character", ""))

            # Add specific character exclusions
            if character_id:
                other_chars = [c for c in self.get_all_characters() if c != character_id]
                char_exclusions = ", ".join([f"not {c}, no {c}" for c in other_chars[:3]])
                parts.append(char_exclusions)

        # Quality negatives
        if include_quality:
            parts.append(neg_prompts.get("quality", ""))

        # Anatomy negatives
        if include_anatomy:
            parts.append(neg_prompts.get("anatomy", ""))

        # Style exclusions
        if include_style_exclusion:
            parts.append(neg_prompts.get("style_exclusion", ""))

        # Artifacts
        parts.append(neg_prompts.get("artifacts", ""))

        # Color errors
        parts.append(neg_prompts.get("color_error", ""))

        # Additional negatives
        if additional_negatives:
            parts.extend(additional_negatives)

        return ", ".join(filter(None, parts))

    def build_background_prompt(
        self,
        background_type: str,
        location: Optional[str] = None,
        time_of_day: Optional[str] = None,
        weather: Optional[str] = None,
        include_style: bool = True,
    ) -> EnhancedPrompt:
        """
        Build a prompt for background generation.

        Args:
            background_type: Type of background (sky, city, nature, etc.)
            location: Specific location name
            time_of_day: Time setting (day, sunset, night)
            weather: Weather condition
            include_style: Add style keywords

        Returns:
            EnhancedPrompt for background
        """
        parts = []

        # Background type
        parts.append(f"{background_type} background")

        # Location
        if location:
            parts.append(f"{location} scene")

        # Time of day
        if time_of_day:
            time_modifiers = {
                "day": "bright daylight, blue sky, sunny",
                "sunset": "golden hour, orange sky, warm lighting",
                "night": "night sky, stars, moonlit",
                "dawn": "early morning, soft pink sky, gentle light",
            }
            parts.append(time_modifiers.get(time_of_day, time_of_day))

        # Weather
        if weather:
            parts.append(weather)

        # Style
        if include_style:
            style = self.get_style_keywords()
            parts.append(style.get("base", "").replace("character", "scene"))
            parts.append(style.get("quality", ""))

        positive_prompt = ", ".join(filter(None, parts))

        # Background-specific negative prompt
        negative_prompt = self.optimize_negative_prompt(
            include_character_protection=False,
            include_anatomy=False,
            additional_negatives=["characters", "planes", "aircraft", "robots", "faces"]
        )

        return EnhancedPrompt(
            positive_prompt=positive_prompt,
            negative_prompt=negative_prompt,
            resolution=self.get_resolution("background"),
            recommended_steps=35,
            recommended_cfg=7.5,
            metadata={
                "category": "background",
                "background_type": background_type,
                "location": location,
                "time_of_day": time_of_day,
            }
        )

    def build_ui_prompt(
        self,
        element_type: str,
        icon_name: Optional[str] = None,
        color_scheme: Optional[str] = None,
    ) -> EnhancedPrompt:
        """
        Build a prompt for UI element generation.

        Args:
            element_type: Type of UI element (icon, button, badge)
            icon_name: Specific icon name/description
            color_scheme: Color scheme to use

        Returns:
            EnhancedPrompt for UI element
        """
        parts = []

        # Element type
        parts.append(f"game {element_type}")

        # Icon details
        if icon_name:
            parts.append(icon_name)

        # Color
        if color_scheme:
            parts.append(f"{color_scheme} color scheme")

        # UI-specific style
        parts.append("clean design, flat shading, game UI style")
        parts.append("centered composition, transparent background ready")
        parts.append("high contrast, clear silhouette")

        positive_prompt = ", ".join(filter(None, parts))

        negative_prompt = "blurry, low quality, complex background, characters, photograph, realistic"

        # UI uses smaller resolution
        resolution = self.get_resolution("ui_icon")
        if element_type == "button":
            resolution = self.get_resolution("button")

        return EnhancedPrompt(
            positive_prompt=positive_prompt,
            negative_prompt=negative_prompt,
            resolution=resolution,
            recommended_steps=30,
            recommended_cfg=7.0,
            metadata={
                "category": "ui_element",
                "element_type": element_type,
                "icon_name": icon_name,
            }
        )

    def build_transformation_prompt(
        self,
        character_id: str,
        transformation_progress: float,
        include_effects: bool = True,
    ) -> EnhancedPrompt:
        """
        Build a prompt for character transformation sequence.

        Args:
            character_id: Character ID
            transformation_progress: Progress from 0.0 (plane) to 1.0 (robot)
            include_effects: Add transformation effect keywords

        Returns:
            EnhancedPrompt for transformation frame
        """
        char_info = self.get_character_info(character_id)
        if not char_info:
            raise ValueError(f"Unknown character: {character_id}")

        parts = []

        # Character base
        parts.append(char_info.trigger)
        parts.append(f"{char_info.colors} coloring")

        # Transformation state
        if transformation_progress < 0.3:
            parts.append("plane form, beginning transformation")
            parts.append("slight movement, parts starting to shift")
        elif transformation_progress < 0.7:
            parts.append("mid-transformation, morphing between forms")
            parts.append("parts unfolding, mechanical transition")
        else:
            parts.append("near robot form, completing transformation")
            parts.append("legs extended, arms forming, robot stance emerging")

        # Effects
        if include_effects:
            parts.append("energy glow, transformation light effects")
            parts.append("dynamic motion blur, action lines")

        # Style
        style = self.get_style_keywords()
        parts.append(style.get("base", ""))
        parts.append(style.get("quality", ""))

        positive_prompt = ", ".join(filter(None, parts))
        negative_prompt = self.optimize_negative_prompt(
            include_character_protection=True,
            character_id=character_id,
        )

        return EnhancedPrompt(
            positive_prompt=positive_prompt,
            negative_prompt=negative_prompt,
            character_id=character_id,
            lora_path=char_info.lora_path,
            lora_weight=0.85,  # Slightly lower for transformation flexibility
            resolution=self.get_resolution("portrait"),
            recommended_steps=45,  # More steps for complex transformation
            recommended_cfg=8.5,
            metadata={
                "category": "transformation",
                "character_name": char_info.name,
                "transformation_progress": transformation_progress,
            }
        )

    async def engineer_prompt(self, request: PromptRequest) -> EnhancedPrompt:
        """
        Main entry point for prompt engineering.

        Args:
            request: PromptRequest with all parameters

        Returns:
            EnhancedPrompt ready for generation
        """
        if request.category == PromptCategory.CHARACTER_PORTRAIT:
            return self.build_character_prompt(
                character_id=request.character_id or "jett",
                view_angle=request.view_angle,
                state=request.state,
                expression=request.expression,
                additional_details=request.additional_details,
            )
        elif request.category == PromptCategory.BACKGROUND:
            return self.build_background_prompt(
                background_type=request.background_type or "sky",
                location=request.scene_description,
            )
        elif request.category == PromptCategory.UI_ELEMENT:
            return self.build_ui_prompt(
                element_type=request.background_type or "icon",
                icon_name=request.additional_details,
            )
        elif request.category == PromptCategory.TRANSFORMATION:
            return self.build_transformation_prompt(
                character_id=request.character_id or "jett",
                transformation_progress=0.5,
            )
        else:
            # Default to character portrait
            return self.build_character_prompt(
                character_id=request.character_id or "jett",
                view_angle=request.view_angle,
                additional_details=request.additional_details,
            )
