"""
UI Asset Generator Agent for Super Wings Simulator.
Handles UI element, icon, and button image generation.
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


class IconCategory(str, Enum):
    """Categories of UI icons."""
    MISSION = "mission"
    RESOURCE = "resource"
    ACHIEVEMENT = "achievement"
    CHARACTER = "character"
    NAVIGATION = "navigation"
    STATUS = "status"


class MissionIcon(str, Enum):
    """Mission-related icons."""
    DELIVERY = "delivery"
    RESCUE = "rescue"
    CONSTRUCTION = "construction"
    EXPLORATION = "exploration"
    SPORTS = "sports"
    ANIMAL_CARE = "animal_care"


class ResourceIcon(str, Enum):
    """Resource-related icons."""
    FUEL = "fuel"
    COINS = "coins"
    STARS = "stars"
    ENERGY = "energy"


class AchievementIcon(str, Enum):
    """Achievement-related icons."""
    BRONZE_BADGE = "bronze_badge"
    SILVER_BADGE = "silver_badge"
    GOLD_BADGE = "gold_badge"
    DIAMOND_BADGE = "diamond_badge"
    TROPHY = "trophy"
    RIBBON = "ribbon"


class ButtonType(str, Enum):
    """Types of UI buttons."""
    PRIMARY = "primary"
    SECONDARY = "secondary"
    SUCCESS = "success"
    WARNING = "warning"
    DANGER = "danger"
    INFO = "info"


class UIElementType(str, Enum):
    """Types of UI elements."""
    ICON = "icon"
    BUTTON = "button"
    BADGE = "badge"
    PROGRESS_BAR = "progress_bar"
    FRAME = "frame"
    PANEL = "panel"


# Icon descriptions for prompt building
MISSION_ICON_DESCRIPTIONS = {
    MissionIcon.DELIVERY: "package delivery icon, cardboard box with wings, simple clean design",
    MissionIcon.RESCUE: "rescue mission icon, life ring or helping hand symbol, emergency theme",
    MissionIcon.CONSTRUCTION: "construction icon, tools and building symbol, work theme",
    MissionIcon.EXPLORATION: "exploration icon, compass or map symbol, adventure theme",
    MissionIcon.SPORTS: "sports icon, trophy or athletic symbol, competition theme",
    MissionIcon.ANIMAL_CARE: "animal care icon, paw print or animal symbol, nature theme",
}

RESOURCE_ICON_DESCRIPTIONS = {
    ResourceIcon.FUEL: "fuel icon, gas can or fuel droplet, energy theme, yellow/orange color",
    ResourceIcon.COINS: "gold coins icon, shiny currency symbol, wealth theme, golden color",
    ResourceIcon.STARS: "stars icon, shining star symbol, reward theme, yellow/gold color",
    ResourceIcon.ENERGY: "energy icon, lightning bolt or battery symbol, power theme, blue/yellow",
}

ACHIEVEMENT_ICON_DESCRIPTIONS = {
    AchievementIcon.BRONZE_BADGE: "bronze badge icon, third place award, copper colored medal",
    AchievementIcon.SILVER_BADGE: "silver badge icon, second place award, silver colored medal",
    AchievementIcon.GOLD_BADGE: "gold badge icon, first place award, golden colored medal",
    AchievementIcon.DIAMOND_BADGE: "diamond badge icon, premium award, sparkling diamond medal",
    AchievementIcon.TROPHY: "trophy icon, golden cup, championship award, winner symbol",
    AchievementIcon.RIBBON: "ribbon icon, award ribbon, achievement symbol, colorful design",
}


class UIAssetRequest(BaseModel):
    """Request for UI asset generation."""
    element_type: UIElementType = UIElementType.ICON
    icon_category: Optional[IconCategory] = None
    mission_icon: Optional[MissionIcon] = None
    resource_icon: Optional[ResourceIcon] = None
    achievement_icon: Optional[AchievementIcon] = None
    button_type: Optional[ButtonType] = None
    color_scheme: Optional[str] = None
    additional_details: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class UIAssetResult(BaseModel):
    """Result of UI asset generation."""
    success: bool
    element_type: str
    images: List[Dict[str, Any]] = []
    prompt_used: str = ""
    negative_prompt_used: str = ""
    generation_time_ms: float = 0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class BatchUIAssetResult(BaseModel):
    """Result of batch UI asset generation."""
    total_requested: int
    total_completed: int
    total_failed: int
    results: List[UIAssetResult] = []
    errors: List[Dict[str, str]] = []


# Singleton instance
_ui_asset_agent: Optional["UIAssetGeneratorAgent"] = None


def get_ui_asset_agent() -> "UIAssetGeneratorAgent":
    """Get or create UIAssetGeneratorAgent singleton."""
    global _ui_asset_agent
    if _ui_asset_agent is None:
        _ui_asset_agent = UIAssetGeneratorAgent()
    return _ui_asset_agent


class UIAssetGeneratorAgent(BaseAgent):
    """
    Agent for generating UI assets.

    This agent handles:
    - Mission icons (6 types)
    - Resource icons (4 types)
    - Achievement icons (6 types)
    - Button elements
    - Other UI components
    """

    def __init__(
        self,
        output_dir: str = "./assets/ui",
    ):
        super().__init__(
            name="ui_asset_generator_agent",
            description="Agent for generating Super Wings UI assets",
            reasoning_mode=ReasoningMode.SIMPLE,
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
        return """You are a UI Asset Generator agent for Super Wings.
Your role is to generate clean, game-ready UI icons and elements.
You understand game UI design and can generate icons, buttons, and badges."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute UI asset generation step."""
        return {"step": step.step_number, "output": "UI asset generated", "success": True}

    def get_available_mission_icons(self) -> List[str]:
        """Get list of available mission icons."""
        return [m.value for m in MissionIcon]

    def get_available_resource_icons(self) -> List[str]:
        """Get list of available resource icons."""
        return [r.value for r in ResourceIcon]

    def get_available_achievement_icons(self) -> List[str]:
        """Get list of available achievement icons."""
        return [a.value for a in AchievementIcon]

    async def generate_mission_icon(
        self,
        icon_type: MissionIcon,
        color_scheme: Optional[str] = None,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> UIAssetResult:
        """
        Generate a mission icon.

        Args:
            icon_type: Type of mission icon
            color_scheme: Optional color scheme
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            UIAssetResult with generated image info
        """
        try:
            # Build prompt
            icon_desc = MISSION_ICON_DESCRIPTIONS.get(icon_type, "mission icon")
            prompt_parts = [
                icon_desc,
                "game UI icon, flat design, clean simple style",
                "centered composition, transparent background ready",
                "high contrast, clear silhouette, cartoon style",
                "Super Wings theme, kid-friendly, colorful",
            ]

            if color_scheme:
                prompt_parts.append(f"{color_scheme} color scheme")

            positive_prompt = ", ".join(prompt_parts)
            negative_prompt = "blurry, low quality, complex background, photograph, realistic, text, watermark"

            # Generate filename
            if not output_filename:
                output_filename = f"mission_icon_{icon_type.value}"

            # Create generation request
            resolution = self.prompt_agent.get_resolution("ui_icon")
            gen_request = GenerationRequest(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=resolution["width"],
                height=resolution["height"],
                steps=30,
                cfg_scale=7.0,
                generation_type=GenerationType.UI_ELEMENT,
                output_filename=output_filename,
            )

            # Generate image
            result = await self.comfyui_agent.generate(gen_request, save_to_disk=save_to_disk)

            return UIAssetResult(
                success=result.success,
                element_type="mission_icon",
                images=result.images,
                prompt_used=positive_prompt,
                negative_prompt_used=negative_prompt,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "icon_type": icon_type.value,
                    "category": "mission",
                }
            )

        except Exception as e:
            logger.error(f"Mission icon generation failed: {e}")
            return UIAssetResult(
                success=False,
                element_type="mission_icon",
                error_message=str(e),
            )

    async def generate_resource_icon(
        self,
        icon_type: ResourceIcon,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> UIAssetResult:
        """
        Generate a resource icon.

        Args:
            icon_type: Type of resource icon
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            UIAssetResult with generated image info
        """
        try:
            icon_desc = RESOURCE_ICON_DESCRIPTIONS.get(icon_type, "resource icon")
            prompt_parts = [
                icon_desc,
                "game resource icon, flat design, glossy finish",
                "centered composition, transparent background ready",
                "high contrast, clear silhouette, cartoon style",
                "Super Wings theme, kid-friendly, vibrant colors",
            ]

            positive_prompt = ", ".join(prompt_parts)
            negative_prompt = "blurry, low quality, complex background, photograph, realistic, text, watermark"

            if not output_filename:
                output_filename = f"resource_icon_{icon_type.value}"

            resolution = self.prompt_agent.get_resolution("ui_icon")
            gen_request = GenerationRequest(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=resolution["width"],
                height=resolution["height"],
                steps=30,
                cfg_scale=7.0,
                generation_type=GenerationType.UI_ELEMENT,
                output_filename=output_filename,
            )

            result = await self.comfyui_agent.generate(gen_request, save_to_disk=save_to_disk)

            return UIAssetResult(
                success=result.success,
                element_type="resource_icon",
                images=result.images,
                prompt_used=positive_prompt,
                negative_prompt_used=negative_prompt,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "icon_type": icon_type.value,
                    "category": "resource",
                }
            )

        except Exception as e:
            logger.error(f"Resource icon generation failed: {e}")
            return UIAssetResult(
                success=False,
                element_type="resource_icon",
                error_message=str(e),
            )

    async def generate_achievement_icon(
        self,
        icon_type: AchievementIcon,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> UIAssetResult:
        """
        Generate an achievement icon.

        Args:
            icon_type: Type of achievement icon
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            UIAssetResult with generated image info
        """
        try:
            icon_desc = ACHIEVEMENT_ICON_DESCRIPTIONS.get(icon_type, "achievement icon")
            prompt_parts = [
                icon_desc,
                "game achievement badge, shiny metallic finish",
                "centered composition, transparent background ready",
                "high quality, detailed, celebratory design",
                "Super Wings theme, kid-friendly, rewarding feel",
            ]

            positive_prompt = ", ".join(prompt_parts)
            negative_prompt = "blurry, low quality, complex background, photograph, realistic, text, watermark"

            if not output_filename:
                output_filename = f"achievement_icon_{icon_type.value}"

            resolution = self.prompt_agent.get_resolution("ui_icon")
            gen_request = GenerationRequest(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=resolution["width"],
                height=resolution["height"],
                steps=35,
                cfg_scale=7.5,
                generation_type=GenerationType.UI_ELEMENT,
                output_filename=output_filename,
            )

            result = await self.comfyui_agent.generate(gen_request, save_to_disk=save_to_disk)

            return UIAssetResult(
                success=result.success,
                element_type="achievement_icon",
                images=result.images,
                prompt_used=positive_prompt,
                negative_prompt_used=negative_prompt,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "icon_type": icon_type.value,
                    "category": "achievement",
                }
            )

        except Exception as e:
            logger.error(f"Achievement icon generation failed: {e}")
            return UIAssetResult(
                success=False,
                element_type="achievement_icon",
                error_message=str(e),
            )

    async def generate_button(
        self,
        button_type: ButtonType = ButtonType.PRIMARY,
        button_text: Optional[str] = None,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> UIAssetResult:
        """
        Generate a UI button.

        Args:
            button_type: Type of button
            button_text: Optional text context for button style
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            UIAssetResult with generated image info
        """
        try:
            # Button color schemes
            button_colors = {
                ButtonType.PRIMARY: "bright blue, friendly primary button",
                ButtonType.SECONDARY: "soft gray, subtle secondary button",
                ButtonType.SUCCESS: "vibrant green, success action button",
                ButtonType.WARNING: "warm orange, warning alert button",
                ButtonType.DANGER: "bold red, danger action button",
                ButtonType.INFO: "light blue, informational button",
            }

            color_desc = button_colors.get(button_type, "colorful button")
            prompt_parts = [
                f"game UI button, {color_desc}",
                "rounded rectangle shape, glossy finish",
                "3D effect with subtle shadow and highlight",
                "clean modern design, cartoon game style",
                "Super Wings theme, kid-friendly, inviting",
            ]

            positive_prompt = ", ".join(prompt_parts)
            negative_prompt = "blurry, low quality, complex background, photograph, realistic, text characters"

            if not output_filename:
                output_filename = f"button_{button_type.value}"

            resolution = self.prompt_agent.get_resolution("button")
            gen_request = GenerationRequest(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=resolution["width"],
                height=resolution["height"],
                steps=30,
                cfg_scale=7.0,
                generation_type=GenerationType.UI_ELEMENT,
                output_filename=output_filename,
            )

            result = await self.comfyui_agent.generate(gen_request, save_to_disk=save_to_disk)

            return UIAssetResult(
                success=result.success,
                element_type="button",
                images=result.images,
                prompt_used=positive_prompt,
                negative_prompt_used=negative_prompt,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "button_type": button_type.value,
                }
            )

        except Exception as e:
            logger.error(f"Button generation failed: {e}")
            return UIAssetResult(
                success=False,
                element_type="button",
                error_message=str(e),
            )

    async def generate_ui_asset(
        self,
        request: UIAssetRequest,
    ) -> UIAssetResult:
        """
        Main entry point for UI asset generation.

        Args:
            request: UIAssetRequest with all parameters

        Returns:
            UIAssetResult with generated image info
        """
        if request.element_type == UIElementType.ICON:
            if request.mission_icon:
                return await self.generate_mission_icon(
                    icon_type=request.mission_icon,
                    color_scheme=request.color_scheme,
                    save_to_disk=request.save_to_disk,
                    output_filename=request.output_filename,
                )
            elif request.resource_icon:
                return await self.generate_resource_icon(
                    icon_type=request.resource_icon,
                    save_to_disk=request.save_to_disk,
                    output_filename=request.output_filename,
                )
            elif request.achievement_icon:
                return await self.generate_achievement_icon(
                    icon_type=request.achievement_icon,
                    save_to_disk=request.save_to_disk,
                    output_filename=request.output_filename,
                )
            else:
                return UIAssetResult(
                    success=False,
                    element_type="icon",
                    error_message="No icon type specified",
                )

        elif request.element_type == UIElementType.BUTTON:
            button_type = request.button_type or ButtonType.PRIMARY
            return await self.generate_button(
                button_type=button_type,
                save_to_disk=request.save_to_disk,
                output_filename=request.output_filename,
            )

        else:
            return UIAssetResult(
                success=False,
                element_type=request.element_type.value,
                error_message=f"Unsupported element type: {request.element_type}",
            )

    async def generate_all_mission_icons(
        self,
        save_to_disk: bool = True,
    ) -> BatchUIAssetResult:
        """Generate all mission icons."""
        results = []
        errors = []

        for icon_type in MissionIcon:
            logger.info(f"Generating mission icon: {icon_type.value}")
            result = await self.generate_mission_icon(
                icon_type=icon_type,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "icon_type": icon_type.value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchUIAssetResult(
            total_requested=len(MissionIcon),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_all_resource_icons(
        self,
        save_to_disk: bool = True,
    ) -> BatchUIAssetResult:
        """Generate all resource icons."""
        results = []
        errors = []

        for icon_type in ResourceIcon:
            logger.info(f"Generating resource icon: {icon_type.value}")
            result = await self.generate_resource_icon(
                icon_type=icon_type,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "icon_type": icon_type.value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchUIAssetResult(
            total_requested=len(ResourceIcon),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_all_achievement_icons(
        self,
        save_to_disk: bool = True,
    ) -> BatchUIAssetResult:
        """Generate all achievement icons."""
        results = []
        errors = []

        for icon_type in AchievementIcon:
            logger.info(f"Generating achievement icon: {icon_type.value}")
            result = await self.generate_achievement_icon(
                icon_type=icon_type,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "icon_type": icon_type.value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchUIAssetResult(
            total_requested=len(AchievementIcon),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_all_buttons(
        self,
        save_to_disk: bool = True,
    ) -> BatchUIAssetResult:
        """Generate all button types."""
        results = []
        errors = []

        for button_type in ButtonType:
            logger.info(f"Generating button: {button_type.value}")
            result = await self.generate_button(
                button_type=button_type,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "button_type": button_type.value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchUIAssetResult(
            total_requested=len(ButtonType),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_complete_ui_pack(
        self,
        save_to_disk: bool = True,
    ) -> Dict[str, BatchUIAssetResult]:
        """
        Generate a complete UI asset pack.

        Returns:
            Dictionary with results for each category
        """
        results = {}

        logger.info("Generating mission icons pack")
        results["mission_icons"] = await self.generate_all_mission_icons(save_to_disk)

        logger.info("Generating resource icons pack")
        results["resource_icons"] = await self.generate_all_resource_icons(save_to_disk)

        logger.info("Generating achievement icons pack")
        results["achievement_icons"] = await self.generate_all_achievement_icons(save_to_disk)

        logger.info("Generating buttons pack")
        results["buttons"] = await self.generate_all_buttons(save_to_disk)

        return results
