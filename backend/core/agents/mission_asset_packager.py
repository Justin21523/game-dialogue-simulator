"""
Mission Asset Packager Agent for Super Wings Simulator.
Integrates all asset generation agents to create complete mission asset packages.
"""

import logging
import asyncio
import json
import shutil
from pathlib import Path
from enum import Enum
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field

from .base_agent import BaseAgent, ReasoningMode, PlanStep
from .character_image import get_character_image_agent, PortraitType, CharacterImageRequest
from .background_generator import get_background_agent, SkyType, WorldLocation
from .ui_asset_generator import get_ui_asset_agent, MissionIcon, ResourceIcon
from .transformation_image import get_transformation_agent, TransformationEffect
from .scene_composer import get_scene_composer_agent, SceneType, CharacterPlacement
from .voice_generator import get_voice_agent, VoiceEmotion
from .sound_effect import get_sound_effect_agent, SoundCategory
from .animation_sequence import get_animation_agent, AnimationType

logger = logging.getLogger(__name__)


class AssetType(str, Enum):
    """Types of assets in a package."""
    CHARACTER_IMAGE = "character_image"
    BACKGROUND = "background"
    UI_ELEMENT = "ui_element"
    TRANSFORMATION = "transformation"
    SCENE = "scene"
    VOICE = "voice"
    SOUND_EFFECT = "sound_effect"
    ANIMATION = "animation"


class PackageQuality(str, Enum):
    """Quality levels for asset packages."""
    LOW = "low"  # Fast generation, lower quality
    MEDIUM = "medium"  # Balanced
    HIGH = "high"  # Full quality, slower


class MissionAssetConfig(BaseModel):
    """Configuration for mission asset generation."""
    # Characters
    main_character_id: str
    supporting_characters: List[str] = []

    # Location
    location: WorldLocation = WorldLocation.PARIS
    sky_type: SkyType = SkyType.BLUE_SKY
    time_of_day: str = "day"

    # Mission type
    mission_type: str = "delivery"
    mission_icon: MissionIcon = MissionIcon.DELIVERY

    # Generation options
    include_portraits: bool = True
    include_states: bool = True
    include_expressions: bool = True
    include_transformation: bool = True
    include_scenes: bool = True
    include_voice: bool = True
    include_sounds: bool = True
    include_animations: bool = True

    # Quality
    quality: PackageQuality = PackageQuality.MEDIUM

    # Dialogue for voice generation
    dialogue_lines: List[Dict[str, str]] = []


class AssetManifestItem(BaseModel):
    """Item in the asset manifest."""
    asset_type: AssetType
    asset_id: str
    filename: str
    path: str
    size_bytes: int = 0
    generated_at: str = ""
    metadata: Dict[str, Any] = {}


class AssetManifest(BaseModel):
    """Manifest of all assets in a package."""
    package_id: str
    mission_name: str
    created_at: str
    version: str = "1.0.0"
    total_assets: int = 0
    total_size_bytes: int = 0
    main_character: str
    location: str
    assets: List[AssetManifestItem] = []
    generation_stats: Dict[str, Any] = {}


class PackageRequest(BaseModel):
    """Request for mission asset package generation."""
    mission_name: str
    config: MissionAssetConfig
    output_dir: Optional[str] = None
    create_zip: bool = False


class PackageResult(BaseModel):
    """Result of mission asset package generation."""
    success: bool
    package_id: str
    mission_name: str
    output_dir: str
    manifest_path: Optional[str] = None
    zip_path: Optional[str] = None
    total_assets: int = 0
    successful_assets: int = 0
    failed_assets: int = 0
    total_size_bytes: int = 0
    generation_time_ms: float = 0
    error_message: Optional[str] = None
    errors: List[Dict[str, str]] = []
    manifest: Optional[AssetManifest] = None


class GenerationProgress(BaseModel):
    """Progress of asset package generation."""
    package_id: str
    phase: str
    current_step: int
    total_steps: int
    current_asset: str
    progress_percent: float
    message: str


# Singleton instance
_packager_agent: Optional["MissionAssetPackagerAgent"] = None


def get_packager_agent() -> "MissionAssetPackagerAgent":
    """Get or create MissionAssetPackagerAgent singleton."""
    global _packager_agent
    if _packager_agent is None:
        _packager_agent = MissionAssetPackagerAgent()
    return _packager_agent


class MissionAssetPackagerAgent(BaseAgent):
    """
    Agent for packaging complete mission asset sets.

    This agent orchestrates all other asset generation agents to create
    complete, validated asset packages for game missions. It handles:
    - Coordinating multiple generation agents
    - Asset validation and completeness checking
    - Package manifest creation
    - Optional ZIP compression
    """

    def __init__(
        self,
        output_base_dir: str = "./assets/packages",
    ):
        super().__init__(
            name="mission_asset_packager_agent",
            description="Agent for packaging complete Super Wings mission assets",
            reasoning_mode=ReasoningMode.REACT,
            enable_planning=True,
        )

        self.output_base_dir = Path(output_base_dir)

        # Lazy-loaded agents
        self._character_agent = None
        self._background_agent = None
        self._ui_agent = None
        self._transformation_agent = None
        self._scene_agent = None
        self._voice_agent = None
        self._sound_agent = None
        self._animation_agent = None

        # Progress tracking
        self._current_progress: Optional[GenerationProgress] = None

    @property
    def character_agent(self):
        """Get Character Image agent."""
        if self._character_agent is None:
            self._character_agent = get_character_image_agent()
        return self._character_agent

    @property
    def background_agent(self):
        if self._background_agent is None:
            self._background_agent = get_background_agent()
        return self._background_agent

    @property
    def ui_agent(self):
        """Get UI Asset Generator agent."""
        if self._ui_agent is None:
            self._ui_agent = get_ui_asset_agent()
        return self._ui_agent

    @property
    def transformation_agent(self):
        if self._transformation_agent is None:
            self._transformation_agent = get_transformation_agent()
        return self._transformation_agent

    @property
    def scene_agent(self):
        if self._scene_agent is None:
            self._scene_agent = get_scene_composer_agent()
        return self._scene_agent

    @property
    def voice_agent(self):
        if self._voice_agent is None:
            self._voice_agent = get_voice_agent()
        return self._voice_agent

    @property
    def sound_agent(self):
        """Get Sound Effect agent."""
        if self._sound_agent is None:
            self._sound_agent = get_sound_effect_agent()
        return self._sound_agent

    @property
    def animation_agent(self):
        if self._animation_agent is None:
            self._animation_agent = get_animation_agent()
        return self._animation_agent

    async def get_system_prompt(self) -> str:
        return """You are a Mission Asset Packager agent for Super Wings.
Your role is to coordinate all asset generation agents and create
complete, validated asset packages for game missions. You understand
the requirements for each mission type and ensure all necessary
assets are generated correctly."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute asset packaging step."""
        return {"step": step.step_number, "output": "Assets packaged", "success": True}

    def _update_progress(
        self,
        package_id: str,
        phase: str,
        current_step: int,
        total_steps: int,
        current_asset: str,
        message: str,
    ):
        """Update generation progress."""
        progress_percent = (current_step / total_steps * 100) if total_steps > 0 else 0
        self._current_progress = GenerationProgress(
            package_id=package_id,
            phase=phase,
            current_step=current_step,
            total_steps=total_steps,
            current_asset=current_asset,
            progress_percent=progress_percent,
            message=message,
        )
        logger.info(f"[{package_id}] {phase}: {message} ({progress_percent:.1f}%)")

    def get_current_progress(self) -> Optional[GenerationProgress]:
        """Get current generation progress."""
        return self._current_progress

    def _calculate_quality_settings(self, quality: PackageQuality) -> Dict[str, Any]:
        """Get generation settings based on quality level."""
        settings = {
            PackageQuality.LOW: {
                "steps": 25,
                "cfg_scale": 7.0,
                "num_keyframes": 3,
                "portrait_types": [PortraitType.FRONT_VIEW, PortraitType.FLYING_POSE],
            },
            PackageQuality.MEDIUM: {
                "steps": 35,
                "cfg_scale": 7.5,
                "num_keyframes": 5,
                "portrait_types": [
                    PortraitType.FRONT_VIEW,
                    PortraitType.FLYING_POSE,
                    PortraitType.TRANSFORMATION,
                    PortraitType.ACTION_POSE,
                ],
            },
            PackageQuality.HIGH: {
                "steps": 45,
                "cfg_scale": 8.0,
                "num_keyframes": 8,
                "portrait_types": list(PortraitType),
            },
        }
        return settings.get(quality, settings[PackageQuality.MEDIUM])

    async def generate_package(
        self,
        request: PackageRequest,
    ) -> PackageResult:
        """
        Generate a complete mission asset package.

        Args:
            request: PackageRequest with configuration

        Returns:
            PackageResult with generated package info
        """
        import time
        start_time = time.time()

        # Generate package ID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        package_id = f"{request.mission_name}_{timestamp}"

        # Setup output directory
        output_dir = Path(request.output_dir) if request.output_dir else self.output_base_dir / package_id
        output_dir.mkdir(parents=True, exist_ok=True)

        # Create subdirectories
        subdirs = {
            "images": output_dir / "images",
            "characters": output_dir / "images" / "characters",
            "backgrounds": output_dir / "images" / "backgrounds",
            "ui": output_dir / "images" / "ui",
            "transformations": output_dir / "images" / "transformations",
            "scenes": output_dir / "images" / "scenes",
            "audio": output_dir / "audio",
            "voices": output_dir / "audio" / "voices",
            "sounds": output_dir / "audio" / "sounds",
            "animations": output_dir / "animations",
        }

        for subdir in subdirs.values():
            subdir.mkdir(parents=True, exist_ok=True)

        config = request.config
        quality_settings = self._calculate_quality_settings(config.quality)

        manifest_items: List[AssetManifestItem] = []
        errors: List[Dict[str, str]] = []

        # Calculate total steps
        total_steps = self._calculate_total_steps(config)
        current_step = 0

        try:
            # Phase 1: Character Images
            if config.include_portraits:
                self._update_progress(package_id, "characters", current_step, total_steps,
                                     config.main_character_id, "Generating character portraits")

                char_result = await self._generate_character_assets(
                    config.main_character_id,
                    subdirs["characters"],
                    quality_settings,
                )
                manifest_items.extend(char_result["items"])
                errors.extend(char_result["errors"])
                current_step += 1

                # Supporting characters
                for char_id in config.supporting_characters:
                    self._update_progress(package_id, "characters", current_step, total_steps,
                                         char_id, f"Generating {char_id} portraits")
                    char_result = await self._generate_character_assets(
                        char_id,
                        subdirs["characters"],
                        quality_settings,
                    )
                    manifest_items.extend(char_result["items"])
                    errors.extend(char_result["errors"])
                    current_step += 1

            # Phase 2: Backgrounds
            self._update_progress(package_id, "backgrounds", current_step, total_steps,
                                 config.location.value, "Generating backgrounds")

            bg_result = await self._generate_background_assets(
                config.location,
                config.sky_type,
                subdirs["backgrounds"],
            )
            manifest_items.extend(bg_result["items"])
            errors.extend(bg_result["errors"])
            current_step += 1

            # Phase 3: UI Assets
            self._update_progress(package_id, "ui", current_step, total_steps,
                                 config.mission_icon.value, "Generating UI assets")

            ui_result = await self._generate_ui_assets(
                config.mission_icon,
                subdirs["ui"],
            )
            manifest_items.extend(ui_result["items"])
            errors.extend(ui_result["errors"])
            current_step += 1

            # Phase 4: Transformation
            if config.include_transformation:
                self._update_progress(package_id, "transformation", current_step, total_steps,
                                     config.main_character_id, "Generating transformation sequence")

                transform_result = await self._generate_transformation_assets(
                    config.main_character_id,
                    subdirs["transformations"],
                    quality_settings["num_keyframes"],
                )
                manifest_items.extend(transform_result["items"])
                errors.extend(transform_result["errors"])
                current_step += 1

            # Phase 5: Scenes
            if config.include_scenes:
                self._update_progress(package_id, "scenes", current_step, total_steps,
                                     "mission_scenes", "Generating scene compositions")

                scene_result = await self._generate_scene_assets(
                    config.main_character_id,
                    config.location,
                    config.time_of_day,
                    subdirs["scenes"],
                )
                manifest_items.extend(scene_result["items"])
                errors.extend(scene_result["errors"])
                current_step += 1

            # Phase 6: Voice
            if config.include_voice and config.dialogue_lines:
                self._update_progress(package_id, "voice", current_step, total_steps,
                                     "dialogue", "Generating voice lines")

                voice_result = await self._generate_voice_assets(
                    config.dialogue_lines,
                    subdirs["voices"],
                )
                manifest_items.extend(voice_result["items"])
                errors.extend(voice_result["errors"])
                current_step += 1

            # Phase 7: Sound Effects
            if config.include_sounds:
                self._update_progress(package_id, "sounds", current_step, total_steps,
                                     "sound_effects", "Generating sound effects")

                sound_result = await self._generate_sound_assets(
                    subdirs["sounds"],
                )
                manifest_items.extend(sound_result["items"])
                errors.extend(sound_result["errors"])
                current_step += 1

            # Phase 8: Animations
            if config.include_animations:
                self._update_progress(package_id, "animations", current_step, total_steps,
                                     config.main_character_id, "Planning animations")

                anim_result = await self._generate_animation_assets(
                    config.main_character_id,
                    subdirs["animations"],
                )
                manifest_items.extend(anim_result["items"])
                errors.extend(anim_result["errors"])
                current_step += 1

            # Create manifest
            self._update_progress(package_id, "finalize", current_step, total_steps,
                                 "manifest", "Creating package manifest")

            total_size = sum(item.size_bytes for item in manifest_items)

            manifest = AssetManifest(
                package_id=package_id,
                mission_name=request.mission_name,
                created_at=datetime.now().isoformat(),
                total_assets=len(manifest_items),
                total_size_bytes=total_size,
                main_character=config.main_character_id,
                location=config.location.value,
                assets=manifest_items,
                generation_stats={
                    "quality": config.quality.value,
                    "generation_time_ms": (time.time() - start_time) * 1000,
                    "successful": len(manifest_items),
                    "failed": len(errors),
                }
            )

            # Save manifest
            manifest_path = output_dir / "manifest.json"
            with open(manifest_path, "w") as f:
                f.write(manifest.model_dump_json(indent=2))

            # Create ZIP if requested
            zip_path = None
            if request.create_zip:
                self._update_progress(package_id, "finalize", total_steps, total_steps,
                                     "zip", "Creating ZIP archive")
                zip_path = self._create_zip_archive(output_dir, package_id)

            generation_time = (time.time() - start_time) * 1000

            return PackageResult(
                success=True,
                package_id=package_id,
                mission_name=request.mission_name,
                output_dir=str(output_dir),
                manifest_path=str(manifest_path),
                zip_path=str(zip_path) if zip_path else None,
                total_assets=len(manifest_items) + len(errors),
                successful_assets=len(manifest_items),
                failed_assets=len(errors),
                total_size_bytes=total_size,
                generation_time_ms=generation_time,
                errors=errors,
                manifest=manifest,
            )

        except Exception as e:
            logger.error(f"Package generation failed: {e}")
            return PackageResult(
                success=False,
                package_id=package_id,
                mission_name=request.mission_name,
                output_dir=str(output_dir),
                error_message=str(e),
                errors=errors,
                generation_time_ms=(time.time() - start_time) * 1000,
            )

    def _calculate_total_steps(self, config: MissionAssetConfig) -> int:
        """Calculate total generation steps."""
        steps = 0
        if config.include_portraits:
            steps += 1 + len(config.supporting_characters)  # Main + supporting
        steps += 1  # Backgrounds
        steps += 1  # UI
        if config.include_transformation:
            steps += 1
        if config.include_scenes:
            steps += 1
        if config.include_voice and config.dialogue_lines:
            steps += 1
        if config.include_sounds:
            steps += 1
        if config.include_animations:
            steps += 1
        steps += 1  # Finalize
        return steps

    async def _generate_character_assets(
        self,
        character_id: str,
        output_dir: Path,
        quality_settings: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate character image assets."""
        items = []
        errors = []

        try:
            # Generate portraits for specified types
            for portrait_type in quality_settings["portrait_types"]:
                result = await self.character_agent.generate_portrait(
                    character_id=character_id,
                    portrait_type=portrait_type,
                    save_to_disk=True,
                )

                if result.success and result.images:
                    for img in result.images:
                        items.append(AssetManifestItem(
                            asset_type=AssetType.CHARACTER_IMAGE,
                            asset_id=f"{character_id}_{portrait_type.value}",
                            filename=img.get("filename", ""),
                            path=img.get("path", ""),
                            size_bytes=img.get("size_bytes", 0),
                            generated_at=datetime.now().isoformat(),
                            metadata={
                                "character_id": character_id,
                                "portrait_type": portrait_type.value,
                            }
                        ))
                else:
                    errors.append({
                        "asset_type": "character_image",
                        "asset_id": f"{character_id}_{portrait_type.value}",
                        "error": result.error_message or "Unknown error",
                    })

        except Exception as e:
            errors.append({
                "asset_type": "character_image",
                "asset_id": character_id,
                "error": str(e),
            })

        return {"items": items, "errors": errors}

    async def _generate_background_assets(
        self,
        location: WorldLocation,
        sky_type: SkyType,
        output_dir: Path,
    ) -> Dict[str, Any]:
        """Generate background assets."""
        items = []
        errors = []

        try:
            # Generate sky background
            sky_result = await self.background_agent.generate_sky_background(
                sky_type=sky_type,
                save_to_disk=True,
            )

            if sky_result.success and sky_result.images:
                for img in sky_result.images:
                    items.append(AssetManifestItem(
                        asset_type=AssetType.BACKGROUND,
                        asset_id=f"sky_{sky_type.value}",
                        filename=img.get("filename", ""),
                        path=img.get("path", ""),
                        size_bytes=img.get("size_bytes", 0),
                        generated_at=datetime.now().isoformat(),
                        metadata={"sky_type": sky_type.value}
                    ))
            else:
                errors.append({
                    "asset_type": "background",
                    "asset_id": f"sky_{sky_type.value}",
                    "error": sky_result.error_message or "Unknown error",
                })

            # Generate location background
            loc_result = await self.background_agent.generate_location_background(
                location=location,
                save_to_disk=True,
            )

            if loc_result.success and loc_result.images:
                for img in loc_result.images:
                    items.append(AssetManifestItem(
                        asset_type=AssetType.BACKGROUND,
                        asset_id=f"location_{location.value}",
                        filename=img.get("filename", ""),
                        path=img.get("path", ""),
                        size_bytes=img.get("size_bytes", 0),
                        generated_at=datetime.now().isoformat(),
                        metadata={"location": location.value}
                    ))
            else:
                errors.append({
                    "asset_type": "background",
                    "asset_id": f"location_{location.value}",
                    "error": loc_result.error_message or "Unknown error",
                })

        except Exception as e:
            errors.append({
                "asset_type": "background",
                "asset_id": location.value,
                "error": str(e),
            })

        return {"items": items, "errors": errors}

    async def _generate_ui_assets(
        self,
        mission_icon: MissionIcon,
        output_dir: Path,
    ) -> Dict[str, Any]:
        """Generate UI assets."""
        items = []
        errors = []

        try:
            # Generate mission icon
            result = await self.ui_agent.generate_mission_icon(
                icon_type=mission_icon,
                save_to_disk=True,
            )

            if result.success and result.images:
                for img in result.images:
                    items.append(AssetManifestItem(
                        asset_type=AssetType.UI_ELEMENT,
                        asset_id=f"mission_icon_{mission_icon.value}",
                        filename=img.get("filename", ""),
                        path=img.get("path", ""),
                        size_bytes=img.get("size_bytes", 0),
                        generated_at=datetime.now().isoformat(),
                        metadata={"icon_type": mission_icon.value}
                    ))
            else:
                errors.append({
                    "asset_type": "ui_element",
                    "asset_id": f"mission_icon_{mission_icon.value}",
                    "error": result.error_message or "Unknown error",
                })

        except Exception as e:
            errors.append({
                "asset_type": "ui_element",
                "asset_id": mission_icon.value,
                "error": str(e),
            })

        return {"items": items, "errors": errors}

    async def _generate_transformation_assets(
        self,
        character_id: str,
        output_dir: Path,
        num_keyframes: int,
    ) -> Dict[str, Any]:
        """Generate transformation sequence assets."""
        items = []
        errors = []

        try:
            result = await self.transformation_agent.generate_transformation_sequence(
                character_id=character_id,
                num_keyframes=num_keyframes,
                effects=[TransformationEffect.ENERGY_GLOW, TransformationEffect.SPARKLES],
                save_to_disk=True,
            )

            for frame in result.frames:
                if frame.success and frame.images:
                    for img in frame.images:
                        items.append(AssetManifestItem(
                            asset_type=AssetType.TRANSFORMATION,
                            asset_id=f"{character_id}_transform_{int(frame.progress * 100):03d}",
                            filename=img.get("filename", ""),
                            path=img.get("path", ""),
                            size_bytes=img.get("size_bytes", 0),
                            generated_at=datetime.now().isoformat(),
                            metadata={
                                "character_id": character_id,
                                "progress": frame.progress,
                                "stage": frame.stage,
                            }
                        ))

            for error in result.errors:
                errors.append({
                    "asset_type": "transformation",
                    "asset_id": f"{character_id}_frame_{error.get('frame', 'unknown')}",
                    "error": error.get("error", "Unknown error"),
                })

        except Exception as e:
            errors.append({
                "asset_type": "transformation",
                "asset_id": character_id,
                "error": str(e),
            })

        return {"items": items, "errors": errors}

    async def _generate_scene_assets(
        self,
        character_id: str,
        location: WorldLocation,
        time_of_day: str,
        output_dir: Path,
    ) -> Dict[str, Any]:
        """Generate scene composition assets."""
        items = []
        errors = []

        try:
            # Generate key mission scenes
            scene_types = [SceneType.IN_FLIGHT, SceneType.ARRIVAL, SceneType.ACTION]

            for scene_type in scene_types:
                result = await self.scene_agent.compose_mission_scene(
                    character_id=character_id,
                    location=location.value,
                    scene_type=scene_type,
                    time_of_day=time_of_day,
                    save_to_disk=True,
                )

                if result.success and result.images:
                    for img in result.images:
                        items.append(AssetManifestItem(
                            asset_type=AssetType.SCENE,
                            asset_id=f"scene_{scene_type.value}_{character_id}",
                            filename=img.get("filename", ""),
                            path=img.get("path", ""),
                            size_bytes=img.get("size_bytes", 0),
                            generated_at=datetime.now().isoformat(),
                            metadata={
                                "scene_type": scene_type.value,
                                "character_id": character_id,
                                "location": location.value,
                            }
                        ))
                else:
                    errors.append({
                        "asset_type": "scene",
                        "asset_id": f"scene_{scene_type.value}",
                        "error": result.error_message or "Unknown error",
                    })

        except Exception as e:
            errors.append({
                "asset_type": "scene",
                "asset_id": character_id,
                "error": str(e),
            })

        return {"items": items, "errors": errors}

    async def _generate_voice_assets(
        self,
        dialogue_lines: List[Dict[str, str]],
        output_dir: Path,
    ) -> Dict[str, Any]:
        """Generate voice assets."""
        items = []
        errors = []

        try:
            result = await self.voice_agent.generate_dialogue(
                dialogue=dialogue_lines,
                save_to_disk=True,
            )

            for i, voice_result in enumerate(result.results):
                if voice_result.success and voice_result.audio_path:
                    items.append(AssetManifestItem(
                        asset_type=AssetType.VOICE,
                        asset_id=f"dialogue_{i:03d}_{voice_result.character_id or 'narrator'}",
                        filename=Path(voice_result.audio_path).name,
                        path=voice_result.audio_path,
                        size_bytes=0,  # Would need to check file size
                        generated_at=datetime.now().isoformat(),
                        metadata={
                            "character_id": voice_result.character_id,
                            "text": voice_result.text[:50],
                            "duration_seconds": voice_result.duration_seconds,
                        }
                    ))

            for error in result.errors:
                errors.append({
                    "asset_type": "voice",
                    "asset_id": f"dialogue_{error.get('line', 'unknown')}",
                    "error": error.get("error", "Unknown error"),
                })

        except Exception as e:
            errors.append({
                "asset_type": "voice",
                "asset_id": "dialogue",
                "error": str(e),
            })

        return {"items": items, "errors": errors}

    async def _generate_sound_assets(
        self,
        output_dir: Path,
    ) -> Dict[str, Any]:
        """Generate sound effect assets."""
        items = []
        errors = []

        try:
            # Generate essential mission sounds
            from .sound_effect import FlightSoundType, TransformationSoundType

            # Flight sounds
            for sound_type in [FlightSoundType.TAKEOFF, FlightSoundType.FLYING]:
                result = await self.sound_agent.generate_flight_sound(
                    sound_type=sound_type,
                    save_to_disk=True,
                )

                if result.success and result.audio_path:
                    items.append(AssetManifestItem(
                        asset_type=AssetType.SOUND_EFFECT,
                        asset_id=f"sound_flight_{sound_type.value}",
                        filename=Path(result.audio_path).name,
                        path=result.audio_path,
                        size_bytes=0,
                        generated_at=datetime.now().isoformat(),
                        metadata={
                            "sound_category": "flight",
                            "sound_type": sound_type.value,
                        }
                    ))
                else:
                    errors.append({
                        "asset_type": "sound_effect",
                        "asset_id": f"sound_flight_{sound_type.value}",
                        "error": result.error_message or "Unknown error",
                    })

            # Transformation sound
            result = await self.sound_agent.generate_transformation_sound(
                sound_type=TransformationSoundType.TRANSFORM_COMPLETE,
                save_to_disk=True,
            )

            if result.success and result.audio_path:
                items.append(AssetManifestItem(
                    asset_type=AssetType.SOUND_EFFECT,
                    asset_id="sound_transformation",
                    filename=Path(result.audio_path).name,
                    path=result.audio_path,
                    size_bytes=0,
                    generated_at=datetime.now().isoformat(),
                    metadata={"sound_category": "transformation"}
                ))
            else:
                errors.append({
                    "asset_type": "sound_effect",
                    "asset_id": "sound_transformation",
                    "error": result.error_message or "Unknown error",
                })

        except Exception as e:
            errors.append({
                "asset_type": "sound_effect",
                "asset_id": "sounds",
                "error": str(e),
            })

        return {"items": items, "errors": errors}

    async def _generate_animation_assets(
        self,
        character_id: str,
        output_dir: Path,
    ) -> Dict[str, Any]:
        """Generate animation plan assets."""
        items = []
        errors = []

        try:
            # Generate animation plans (these are JSON data, not images)
            animation_types = [AnimationType.TRANSFORMATION, AnimationType.FLIGHT]

            for anim_type in animation_types:
                if anim_type == AnimationType.TRANSFORMATION:
                    result = await self.animation_agent.plan_transformation_animation(
                        character_id=character_id,
                        duration_ms=3000,
                    )
                else:
                    result = await self.animation_agent.plan_flight_animation(
                        character_id=character_id,
                        duration_ms=2000,
                    )

                if result.success and result.plan:
                    # Save animation plan as JSON
                    plan_filename = f"{character_id}_{anim_type.value}_plan.json"
                    plan_path = output_dir / plan_filename

                    with open(plan_path, "w") as f:
                        f.write(result.plan.model_dump_json(indent=2))

                    items.append(AssetManifestItem(
                        asset_type=AssetType.ANIMATION,
                        asset_id=f"animation_{anim_type.value}_{character_id}",
                        filename=plan_filename,
                        path=str(plan_path),
                        size_bytes=plan_path.stat().st_size if plan_path.exists() else 0,
                        generated_at=datetime.now().isoformat(),
                        metadata={
                            "animation_type": anim_type.value,
                            "character_id": character_id,
                            "total_frames": result.plan.total_frames,
                            "duration_ms": result.plan.total_duration_ms,
                        }
                    ))
                else:
                    errors.append({
                        "asset_type": "animation",
                        "asset_id": f"animation_{anim_type.value}",
                        "error": result.error_message or "Unknown error",
                    })

        except Exception as e:
            errors.append({
                "asset_type": "animation",
                "asset_id": character_id,
                "error": str(e),
            })

        return {"items": items, "errors": errors}

    def _create_zip_archive(self, source_dir: Path, package_id: str) -> Path:
        """Create ZIP archive of package."""
        zip_path = source_dir.parent / f"{package_id}.zip"
        shutil.make_archive(
            str(zip_path.with_suffix("")),
            "zip",
            source_dir,
        )
        return zip_path

    async def generate_quick_pack(
        self,
        character_id: str,
        location: str = "paris",
    ) -> PackageResult:
        """
        Generate a quick asset pack with minimal assets.

        Args:
            character_id: Main character ID
            location: Mission location

        Returns:
            PackageResult with generated package
        """
        try:
            loc = WorldLocation(location.lower())
        except ValueError:
            loc = WorldLocation.PARIS

        config = MissionAssetConfig(
            main_character_id=character_id,
            location=loc,
            quality=PackageQuality.LOW,
            include_portraits=True,
            include_states=False,
            include_expressions=False,
            include_transformation=True,
            include_scenes=True,
            include_voice=False,
            include_sounds=False,
            include_animations=True,
        )

        request = PackageRequest(
            mission_name=f"quick_{character_id}_{location}",
            config=config,
        )

        return await self.generate_package(request)

    async def generate_full_pack(
        self,
        character_id: str,
        location: str = "paris",
        supporting_characters: List[str] = [],
        dialogue_lines: List[Dict[str, str]] = [],
    ) -> PackageResult:
        """
        Generate a full asset pack with all assets.

        Args:
            character_id: Main character ID
            location: Mission location
            supporting_characters: Additional character IDs
            dialogue_lines: Dialogue for voice generation

        Returns:
            PackageResult with generated package
        """
        try:
            loc = WorldLocation(location.lower())
        except ValueError:
            loc = WorldLocation.PARIS

        config = MissionAssetConfig(
            main_character_id=character_id,
            supporting_characters=supporting_characters,
            location=loc,
            quality=PackageQuality.HIGH,
            include_portraits=True,
            include_states=True,
            include_expressions=True,
            include_transformation=True,
            include_scenes=True,
            include_voice=bool(dialogue_lines),
            include_sounds=True,
            include_animations=True,
            dialogue_lines=dialogue_lines,
        )

        request = PackageRequest(
            mission_name=f"full_{character_id}_{location}",
            config=config,
            create_zip=True,
        )

        return await self.generate_package(request)

    def get_available_locations(self) -> List[str]:
        """Get list of available world locations."""
        return [loc.value for loc in WorldLocation]

    def get_available_characters(self) -> List[str]:
        """Get list of available characters."""
        return ["jett", "flip", "donnie", "todd", "paul", "bello", "chase", "jerome"]

    async def validate_package(self, manifest_path: str) -> Dict[str, Any]:
        """
        Validate an existing package against its manifest.

        Args:
            manifest_path: Path to manifest.json

        Returns:
            Validation result with missing/corrupt files
        """
        manifest_file = Path(manifest_path)
        if not manifest_file.exists():
            return {"valid": False, "error": "Manifest not found"}

        with open(manifest_file) as f:
            manifest_data = json.load(f)

        manifest = AssetManifest(**manifest_data)

        missing_files = []
        valid_files = []

        for asset in manifest.assets:
            asset_path = Path(asset.path)
            if asset_path.exists():
                valid_files.append(asset.asset_id)
            else:
                missing_files.append({
                    "asset_id": asset.asset_id,
                    "expected_path": asset.path,
                })

        return {
            "valid": len(missing_files) == 0,
            "total_assets": len(manifest.assets),
            "valid_files": len(valid_files),
            "missing_files": missing_files,
            "package_id": manifest.package_id,
        }
