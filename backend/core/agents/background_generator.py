"""
Background Generator Agent for Super Wings Simulator.
Handles scene background and sky image generation.
"""

import logging
from pathlib import Path
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import shutil
from pydantic import BaseModel

from .base_agent import BaseAgent, ReasoningMode, PlanStep
from .comfyui_workflow import get_comfyui_agent, GenerationRequest, GenerationType
from .prompt_engineer import get_prompt_agent

logger = logging.getLogger(__name__)


class SkyType(str, Enum):
    """Types of sky backgrounds."""

    BLUE_SKY = "blue_sky"
    SUNSET_SKY = "sunset_sky"
    NIGHT_SKY = "night_sky"
    STORMY_SKY = "stormy_sky"
    DAWN_SKY = "dawn_sky"
    CLOUDY_SKY = "cloudy_sky"


class WorldLocation(str, Enum):
    """World locations for backgrounds."""

    # Europe
    PARIS = "paris"
    LONDON = "london"
    ROME = "rome"
    BARCELONA = "barcelona"
    # Asia
    TOKYO = "tokyo"
    BEIJING = "beijing"
    SEOUL = "seoul"
    BANGKOK = "bangkok"
    # Americas
    NEW_YORK = "new_york"
    RIO = "rio"
    MEXICO_CITY = "mexico_city"
    # Other continents
    AFRICAN_SAVANNA = "african_savanna"
    AUSTRALIAN_OUTBACK = "australian_outback"
    EGYPTIAN_PYRAMIDS = "egyptian_pyramids"
    # Special locations
    WORLD_AIRPORT = "world_airport"
    OCEAN = "ocean"
    MOUNTAINS = "mountains"
    JUNGLE = "jungle"
    DESERT = "desert"
    ARCTIC = "arctic"
    UNDERWATER = "underwater"
    VOLCANO = "volcano"
    OUTER_SPACE = "outer_space"
    CLOUDS = "clouds"


class BackgroundCategory(str, Enum):
    """Categories of backgrounds."""

    SKY = "sky"
    WORLD_LOCATION = "world_location"
    SPECIAL = "special"


class BackgroundRequest(BaseModel):
    """Request for background generation."""

    category: BackgroundCategory = BackgroundCategory.WORLD_LOCATION
    sky_type: Optional[SkyType] = None
    location: Optional[WorldLocation] = None
    time_of_day: Optional[str] = None
    weather: Optional[str] = None
    additional_details: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class BackgroundResult(BaseModel):
    """Result of background generation."""

    success: bool
    category: str
    location: Optional[str] = None
    images: List[Dict[str, Any]] = field(default_factory=list)
    prompt_used: str = ""
    negative_prompt_used: str = ""
    generation_time_ms: float = 0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class BatchBackgroundResult(BaseModel):
    """Result of batch background generation."""

    total_requested: int
    total_completed: int
    total_failed: int
    results: List[BackgroundResult] = field(default_factory=list)
    errors: List[Dict[str, str]] = field(default_factory=list)


# Location descriptions for prompt building
LOCATION_DESCRIPTIONS = {
    WorldLocation.PARIS: "Paris cityscape, Eiffel Tower visible, French architecture, romantic atmosphere",
    WorldLocation.LONDON: "London skyline, Big Ben, Thames River, British architecture, cloudy sky",
    WorldLocation.ROME: "Rome ancient ruins, Colosseum, Italian architecture, Mediterranean feel",
    WorldLocation.BARCELONA: "Barcelona cityscape, Sagrada Familia, colorful Spanish architecture",
    WorldLocation.TOKYO: "Tokyo skyline, futuristic buildings, neon lights, Japanese architecture",
    WorldLocation.BEIJING: "Beijing cityscape, Great Wall glimpse, Chinese traditional architecture",
    WorldLocation.SEOUL: "Seoul modern cityscape, Korean architecture mix, mountains in background",
    WorldLocation.BANGKOK: "Bangkok temples, golden spires, Thai architecture, tropical atmosphere",
    WorldLocation.NEW_YORK: "New York City skyline, skyscrapers, Statue of Liberty, urban landscape",
    WorldLocation.RIO: "Rio de Janeiro, Christ the Redeemer, beaches, tropical mountains",
    WorldLocation.MEXICO_CITY: "Mexico City landmarks, Aztec ruins, colonial architecture",
    WorldLocation.AFRICAN_SAVANNA: "African savanna landscape, acacia trees, golden grasslands, wildlife habitat",
    WorldLocation.AUSTRALIAN_OUTBACK: "Australian outback, red desert, unique rock formations, vast landscape",
    WorldLocation.EGYPTIAN_PYRAMIDS: "Egyptian pyramids, desert landscape, ancient monuments, sandy atmosphere",
    WorldLocation.WORLD_AIRPORT: "World Airport, Super Wings home base, colorful modern airport, friendly atmosphere",
    WorldLocation.OCEAN: "Ocean view, endless blue water, waves, clear horizon, maritime atmosphere",
    WorldLocation.MOUNTAINS: "Mountain range, snowy peaks, alpine landscape, majestic scenery",
    WorldLocation.JUNGLE: "Dense jungle, tropical rainforest, exotic plants, lush green canopy",
    WorldLocation.DESERT: "Desert landscape, sand dunes, arid terrain, golden sands",
    WorldLocation.ARCTIC: "Arctic landscape, ice and snow, polar region, frozen beauty",
    WorldLocation.UNDERWATER: "Underwater scene, coral reef, ocean floor, marine life habitat",
    WorldLocation.VOLCANO: "Volcanic landscape, active volcano, lava flows, dramatic terrain",
    WorldLocation.OUTER_SPACE: "Outer space, stars, nebula, cosmic atmosphere, infinite void",
    WorldLocation.CLOUDS: "Above the clouds, fluffy white clouds, blue sky, aerial view",
}

SKY_DESCRIPTIONS = {
    SkyType.BLUE_SKY: "clear blue sky, bright sunshine, few fluffy white clouds, perfect day",
    SkyType.SUNSET_SKY: "beautiful sunset, orange and pink sky, golden hour, warm colors",
    SkyType.NIGHT_SKY: "night sky, stars visible, moon, dark blue atmosphere, peaceful",
    SkyType.STORMY_SKY: "stormy sky, dark clouds, dramatic atmosphere, lightning in distance",
    SkyType.DAWN_SKY: "dawn sky, soft pink and purple, early morning, gentle light",
    SkyType.CLOUDY_SKY: "overcast sky, gray clouds, soft diffused light, moody atmosphere",
}


# Singleton instance
_background_agent: Optional["BackgroundGeneratorAgent"] = None


def get_background_agent() -> "BackgroundGeneratorAgent":
    """Get or create BackgroundGeneratorAgent singleton."""
    global _background_agent
    if _background_agent is None:
        _background_agent = BackgroundGeneratorAgent()
    return _background_agent


class BackgroundGeneratorAgent(BaseAgent):
    """
    Agent for generating scene backgrounds.

    This agent handles:
    - Sky backgrounds (6 types)
    - World location backgrounds (25 locations)
    - Special scene backgrounds
    """

    def __init__(
        self,
        output_dir: str = "./assets/images/backgrounds",
    ):
        super().__init__(
            name="background_generator_agent",
            description="Agent for generating Super Wings scene backgrounds",
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
        return """You are a Background Generator agent for Super Wings.
Your role is to generate high-quality background images for game scenes.
You understand world locations and can generate appropriate scenery."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute background generation step."""
        return {
            "step": step.step_number,
            "output": "Background generated",
            "success": True,
        }

    def get_available_sky_types(self) -> List[str]:
        """Get list of available sky types."""
        return [s.value for s in SkyType]

    def get_available_locations(self) -> List[str]:
        """Get list of available world locations."""
        return [l.value for l in WorldLocation]

    def get_location_description(self, location: WorldLocation) -> str:
        """Get description for a location."""
        return LOCATION_DESCRIPTIONS.get(location, "scenic landscape")

    def get_sky_description(self, sky_type: SkyType) -> str:
        """Get description for a sky type."""
        return SKY_DESCRIPTIONS.get(sky_type, "blue sky")

    async def generate_sky_background(
        self,
        sky_type: SkyType = SkyType.BLUE_SKY,
        additional_details: Optional[str] = None,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> BackgroundResult:
        """
        Generate a sky background.

        Args:
            sky_type: Type of sky
            additional_details: Extra prompt details
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            BackgroundResult with generated image info
        """
        try:
            # Build prompt
            sky_desc = self.get_sky_description(sky_type)
            prompt_parts = [
                sky_desc,
                "sky background, panoramic view",
                "no characters, no planes, no aircraft",
            ]

            if additional_details:
                prompt_parts.append(additional_details)

            # Add style keywords
            style = self.prompt_agent.get_style_keywords()
            prompt_parts.append(style.get("base", "").replace("character", "scene"))
            prompt_parts.append(style.get("quality", ""))

            positive_prompt = ", ".join(filter(None, prompt_parts))

            # Build negative prompt
            negative_prompt = self.prompt_agent.optimize_negative_prompt(
                include_character_protection=False,
                include_anatomy=False,
                additional_negatives=[
                    "characters",
                    "planes",
                    "aircraft",
                    "robots",
                    "faces",
                    "people",
                ],
            )

            # Generate filename
            if not output_filename:
                output_filename = f"sky_{sky_type.value}"

            # Create generation request
            resolution = self.prompt_agent.get_resolution("background")
            gen_request = GenerationRequest(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=resolution["width"],
                height=resolution["height"],
                steps=35,
                cfg_scale=7.5,
                generation_type=GenerationType.BACKGROUND,
                output_filename=output_filename,
            )

            # Generate image
            result = await self.comfyui_agent.generate(
                gen_request, save_to_disk=save_to_disk
            )

            return BackgroundResult(
                success=result.success,
                category="sky",
                location=sky_type.value,
                images=result.images,
                prompt_used=positive_prompt,
                negative_prompt_used=negative_prompt,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "sky_type": sky_type.value,
                },
            )

        except Exception as e:
            logger.error(f"Sky background generation failed: {e}")
            return BackgroundResult(
                success=False,
                category="sky",
                error_message=str(e),
            )

    async def generate_location_background(
        self,
        location: WorldLocation,
        time_of_day: Optional[str] = None,
        weather: Optional[str] = None,
        additional_details: Optional[str] = None,
        save_to_disk: bool = True,
        output_filename: Optional[str] = None,
    ) -> BackgroundResult:
        """
        Generate a world location background.

        Args:
            location: World location
            time_of_day: Time setting (day, sunset, night)
            weather: Weather condition
            additional_details: Extra prompt details
            save_to_disk: Whether to save images locally
            output_filename: Custom filename

        Returns:
            BackgroundResult with generated image info
        """
        try:
            # Build prompt
            location_desc = self.get_location_description(location)
            prompt_parts = [
                location_desc,
                "scenic background, wide landscape view",
            ]

            # Add time of day
            if time_of_day:
                time_modifiers = {
                    "day": "bright daylight, clear sky",
                    "sunset": "golden hour, sunset lighting, warm colors",
                    "night": "night time, moon visible, city lights",
                    "dawn": "early morning, soft light, misty atmosphere",
                }
                prompt_parts.append(time_modifiers.get(time_of_day, time_of_day))

            # Add weather
            if weather:
                prompt_parts.append(weather)

            if additional_details:
                prompt_parts.append(additional_details)

            # Add style keywords
            style = self.prompt_agent.get_style_keywords()
            prompt_parts.append(style.get("base", "").replace("character", "scene"))
            prompt_parts.append(style.get("quality", ""))

            positive_prompt = ", ".join(filter(None, prompt_parts))

            # Build negative prompt
            negative_prompt = self.prompt_agent.optimize_negative_prompt(
                include_character_protection=False,
                include_anatomy=False,
                additional_negatives=[
                    "characters",
                    "planes",
                    "aircraft",
                    "robots",
                    "faces",
                    "people",
                ],
            )

            # Generate filename
            if not output_filename:
                output_filename = f"location_{location.value}"
                if time_of_day:
                    output_filename += f"_{time_of_day}"

            # Create generation request
            resolution = self.prompt_agent.get_resolution("background")
            gen_request = GenerationRequest(
                prompt=positive_prompt,
                negative_prompt=negative_prompt,
                width=resolution["width"],
                height=resolution["height"],
                steps=35,
                cfg_scale=7.5,
                generation_type=GenerationType.BACKGROUND,
                output_filename=output_filename,
            )

            # Generate image
            result = await self.comfyui_agent.generate(
                gen_request, save_to_disk=save_to_disk
            )

            return BackgroundResult(
                success=result.success,
                category="world_location",
                location=location.value,
                images=result.images,
                prompt_used=positive_prompt,
                negative_prompt_used=negative_prompt,
                generation_time_ms=result.generation_time_ms,
                error_message=result.error_message,
                metadata={
                    "location": location.value,
                    "time_of_day": time_of_day,
                    "weather": weather,
                },
            )

        except Exception as e:
            logger.error(f"Location background generation failed: {e}")
            return BackgroundResult(
                success=False,
                category="world_location",
                location=location.value,
                error_message=str(e),
            )

    async def generate_background(
        self,
        request: BackgroundRequest,
    ) -> BackgroundResult:
        """
        Main entry point for background generation.

        Args:
            request: BackgroundRequest with all parameters

        Returns:
            BackgroundResult with generated image info
        """
        if request.category == BackgroundCategory.SKY:
            sky_type = request.sky_type or SkyType.BLUE_SKY
            return await self.generate_sky_background(
                sky_type=sky_type,
                additional_details=request.additional_details,
                save_to_disk=request.save_to_disk,
                output_filename=request.output_filename,
            )

        elif request.category == BackgroundCategory.WORLD_LOCATION:
            location = request.location or WorldLocation.WORLD_AIRPORT
            return await self.generate_location_background(
                location=location,
                time_of_day=request.time_of_day,
                weather=request.weather,
                additional_details=request.additional_details,
                save_to_disk=request.save_to_disk,
                output_filename=request.output_filename,
            )

        else:
            # Special category uses location_background with custom details
            return await self.generate_location_background(
                location=request.location or WorldLocation.WORLD_AIRPORT,
                time_of_day=request.time_of_day,
                weather=request.weather,
                additional_details=request.additional_details,
                save_to_disk=request.save_to_disk,
                output_filename=request.output_filename,
            )

    async def generate_all_sky_backgrounds(
        self,
        save_to_disk: bool = True,
    ) -> BatchBackgroundResult:
        """
        Generate all sky background types.

        Args:
            save_to_disk: Whether to save images locally

        Returns:
            BatchBackgroundResult with all generated images
        """
        results = []
        errors = []

        for sky_type in SkyType:
            logger.info(f"Generating sky background: {sky_type.value}")

            result = await self.generate_sky_background(
                sky_type=sky_type,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append(
                    {
                        "sky_type": sky_type.value,
                        "error": result.error_message or "Unknown error",
                    }
                )

        return BatchBackgroundResult(
            total_requested=len(SkyType),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_all_location_backgrounds(
        self,
        time_of_day: Optional[str] = None,
        save_to_disk: bool = True,
    ) -> BatchBackgroundResult:
        """
        Generate backgrounds for all world locations.

        Args:
            time_of_day: Optional time setting for all locations
            save_to_disk: Whether to save images locally

        Returns:
            BatchBackgroundResult with all generated images
        """
        results = []
        errors = []

        for location in WorldLocation:
            logger.info(f"Generating location background: {location.value}")

            result = await self.generate_location_background(
                location=location,
                time_of_day=time_of_day,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append(
                    {
                        "location": location.value,
                        "error": result.error_message or "Unknown error",
                    }
                )

        return BatchBackgroundResult(
            total_requested=len(WorldLocation),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_complete_background_pack(
        self,
        include_skies: bool = True,
        include_locations: bool = True,
        save_to_disk: bool = True,
    ) -> Dict[str, BatchBackgroundResult]:
        """
        Generate a complete background pack.

        Args:
            include_skies: Generate all sky backgrounds
            include_locations: Generate all location backgrounds
            save_to_disk: Whether to save images locally

        Returns:
            Dictionary with results for each category
        """
        results = {}

        if include_skies:
            logger.info("Generating sky background pack")
            results["skies"] = await self.generate_all_sky_backgrounds(
                save_to_disk=save_to_disk,
            )

        if include_locations:
            logger.info("Generating location background pack")
            results["locations"] = await self.generate_all_location_backgrounds(
                save_to_disk=save_to_disk,
            )

        return results

    def _save_image(self, src_path: str, category: str, filename: str) -> dict:
        dest_dir = self.output_dir / category
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / f"{filename}.png"
        shutil.copy2(src_path, dest_path)
        return {
            "path": str(dest_path),
            "category": category,
            "filename": dest_path.name,
        }
