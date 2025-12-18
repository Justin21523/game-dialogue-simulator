"""
Sound Effect Agent for Super Wings Simulator.
Handles sound effect generation using AudioCraft/AudioGen.
"""

import logging
import asyncio
from pathlib import Path
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from .base_agent import BaseAgent, ReasoningMode, PlanStep

logger = logging.getLogger(__name__)


class SoundCategory(str, Enum):
    """Categories of sound effects."""
    UI = "ui"
    FLIGHT = "flight"
    TRANSFORMATION = "transformation"
    ENVIRONMENT = "environment"
    ACTION = "action"
    CELEBRATION = "celebration"


class UISoundType(str, Enum):
    """UI sound effect types."""
    BUTTON_CLICK = "button_click"
    BUTTON_HOVER = "button_hover"
    MENU_OPEN = "menu_open"
    MENU_CLOSE = "menu_close"
    NOTIFICATION = "notification"
    SUCCESS = "success"
    ERROR = "error"
    COIN_COLLECT = "coin_collect"
    STAR_COLLECT = "star_collect"
    LEVEL_UP = "level_up"


class FlightSoundType(str, Enum):
    """Flight-related sound effect types."""
    TAKEOFF = "takeoff"
    FLYING = "flying"
    LANDING = "landing"
    WHOOSH = "whoosh"
    ENGINE_IDLE = "engine_idle"
    ENGINE_ACCELERATE = "engine_accelerate"
    PROPELLER = "propeller"


class TransformationSoundType(str, Enum):
    """Transformation sound effect types."""
    TRANSFORM_START = "transform_start"
    TRANSFORM_PROGRESS = "transform_progress"
    TRANSFORM_COMPLETE = "transform_complete"
    MECHANICAL_SHIFT = "mechanical_shift"
    POWER_UP = "power_up"


class EnvironmentSoundType(str, Enum):
    """Environment sound effect types."""
    WIND = "wind"
    RAIN = "rain"
    THUNDER = "thunder"
    OCEAN_WAVES = "ocean_waves"
    BIRDS = "birds"
    CITY_AMBIENT = "city_ambient"
    JUNGLE_AMBIENT = "jungle_ambient"
    AIRPORT_AMBIENT = "airport_ambient"


class ActionSoundType(str, Enum):
    """Action sound effect types."""
    DELIVERY_DROP = "delivery_drop"
    PACKAGE_OPEN = "package_open"
    TOOL_USE = "tool_use"
    RESCUE_ALERT = "rescue_alert"
    HELPING_HAND = "helping_hand"


class CelebrationSoundType(str, Enum):
    """Celebration sound effect types."""
    FANFARE = "fanfare"
    APPLAUSE = "applause"
    CHEERING = "cheering"
    FIREWORKS = "fireworks"
    VICTORY_JINGLE = "victory_jingle"


# Sound descriptions for AudioGen
SOUND_DESCRIPTIONS = {
    # UI Sounds
    UISoundType.BUTTON_CLICK: "short click sound, UI button press, game interface, clean digital",
    UISoundType.BUTTON_HOVER: "soft hover sound, subtle UI feedback, light digital tone",
    UISoundType.MENU_OPEN: "menu opening sound, smooth whoosh, interface slide in",
    UISoundType.MENU_CLOSE: "menu closing sound, gentle swoosh, interface fade out",
    UISoundType.NOTIFICATION: "notification bell, pleasant alert tone, attention getter",
    UISoundType.SUCCESS: "success chime, positive feedback sound, achievement unlocked",
    UISoundType.ERROR: "error buzz, negative feedback, wrong action indicator",
    UISoundType.COIN_COLLECT: "coin collect sound, shiny ding, reward pickup",
    UISoundType.STAR_COLLECT: "magical star collect sound, sparkle chime, special pickup",
    UISoundType.LEVEL_UP: "level up fanfare, achievement sound, celebration jingle",

    # Flight Sounds
    FlightSoundType.TAKEOFF: "airplane takeoff sound, jet engine acceleration, ascending",
    FlightSoundType.FLYING: "airplane flying steady, jet whoosh, wind passing",
    FlightSoundType.LANDING: "airplane landing, wheels touchdown, engine deceleration",
    FlightSoundType.WHOOSH: "fast flying whoosh, speed pass by, sonic movement",
    FlightSoundType.ENGINE_IDLE: "jet engine idle, steady hum, airplane waiting",
    FlightSoundType.ENGINE_ACCELERATE: "jet engine accelerating, power increase, thrust",
    FlightSoundType.PROPELLER: "propeller spinning, aircraft propeller sound, rotors",

    # Transformation Sounds
    TransformationSoundType.TRANSFORM_START: "transformation beginning, mechanical activation, power surge",
    TransformationSoundType.TRANSFORM_PROGRESS: "mechanical transformation, gears shifting, parts moving",
    TransformationSoundType.TRANSFORM_COMPLETE: "transformation complete, heroic power up, ready for action",
    TransformationSoundType.MECHANICAL_SHIFT: "mechanical parts shifting, robot joints moving, metallic clank",
    TransformationSoundType.POWER_UP: "power up sound, energy charging, getting stronger",

    # Environment Sounds
    EnvironmentSoundType.WIND: "gentle wind blowing, breeze, outdoor atmosphere",
    EnvironmentSoundType.RAIN: "rain falling, raindrops, wet weather ambient",
    EnvironmentSoundType.THUNDER: "thunder rumble, storm sound, dramatic weather",
    EnvironmentSoundType.OCEAN_WAVES: "ocean waves, beach sound, water lapping",
    EnvironmentSoundType.BIRDS: "birds chirping, nature sounds, outdoor ambiance",
    EnvironmentSoundType.CITY_AMBIENT: "city ambient, urban sounds, traffic distant",
    EnvironmentSoundType.JUNGLE_AMBIENT: "jungle ambient, tropical forest, exotic birds",
    EnvironmentSoundType.AIRPORT_AMBIENT: "airport ambient, busy terminal, announcements distant",

    # Action Sounds
    ActionSoundType.DELIVERY_DROP: "package delivery drop, box landing, successful delivery",
    ActionSoundType.PACKAGE_OPEN: "package opening, cardboard unwrap, gift reveal",
    ActionSoundType.TOOL_USE: "tool being used, construction sound, fixing things",
    ActionSoundType.RESCUE_ALERT: "rescue alert siren, emergency sound, help needed",
    ActionSoundType.HELPING_HAND: "helping success, positive action, good deed done",

    # Celebration Sounds
    CelebrationSoundType.FANFARE: "triumphant fanfare, victory horns, celebration brass",
    CelebrationSoundType.APPLAUSE: "crowd applause, clapping, audience appreciation",
    CelebrationSoundType.CHEERING: "crowd cheering, happy voices, celebration shouts",
    CelebrationSoundType.FIREWORKS: "fireworks explosion, celebration sparkles, festival sounds",
    CelebrationSoundType.VICTORY_JINGLE: "victory jingle, winning music, champion tune",
}


class SoundRequest(BaseModel):
    """Request for sound effect generation."""
    category: SoundCategory
    sound_type: str
    duration: float = 2.0  # seconds
    custom_description: Optional[str] = None
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class SoundResult(BaseModel):
    """Result of sound effect generation."""
    success: bool
    category: str
    sound_type: str
    audio_path: Optional[str] = None
    duration_seconds: float = 0.0
    sample_rate: int = 32000
    generation_time_ms: float = 0.0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class BatchSoundResult(BaseModel):
    """Result of batch sound effect generation."""
    total_requested: int
    total_completed: int
    total_failed: int
    results: List[SoundResult] = []
    errors: List[Dict[str, str]] = []


# Singleton instance
_sound_agent: Optional["SoundEffectAgent"] = None


def get_sound_effect_agent() -> "SoundEffectAgent":
    """Get or create SoundEffectAgent singleton."""
    global _sound_agent
    if _sound_agent is None:
        _sound_agent = SoundEffectAgent()
    return _sound_agent


class SoundEffectAgent(BaseAgent):
    """
    Agent for generating sound effects using AudioCraft.

    This agent handles:
    - UI sound effects
    - Flight sounds
    - Transformation sounds
    - Environment ambient sounds
    - Action and celebration sounds
    """

    def __init__(
        self,
        model_name: str = "facebook/audiogen-medium",
        output_dir: str = "./assets/audio/effects",
        device: str = "cuda",
        default_duration: float = 5.0,
    ):
        super().__init__(
            name="sound_effect_agent",
            description="Agent for generating Super Wings sound effects",
            reasoning_mode=ReasoningMode.COT,
            enable_planning=False,
        )

        self.model_name = model_name
        self.output_dir = Path(output_dir)
        self.device = device
        self.default_duration = default_duration
        self._model = None
        self._initialized = False

    @property
    def model(self):
        """Lazy load AudioGen model."""
        if self._model is None:
            self._initialize_model()
        return self._model

    def _initialize_model(self):
        """Initialize AudioGen model."""
        try:
            from audiocraft.models import AudioGen
            self._model = AudioGen.get_pretrained(self.model_name)
            self._model.set_generation_params(duration=self.default_duration)
            self._initialized = True
            logger.info(f"AudioGen model loaded: {self.model_name}")
        except ImportError:
            logger.warning("AudioCraft not installed. Install with: pip install audiocraft")
            self._model = None
        except Exception as e:
            logger.error(f"Failed to initialize AudioGen: {e}")
            self._model = None

    async def get_system_prompt(self) -> str:
        return """You are a Sound Effect Generator agent for Super Wings.
Your role is to generate appropriate sound effects for game events.
You understand audio design and can create fitting sounds for
UI interactions, flight, transformations, and celebrations."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute sound generation step."""
        return {"step": step.step_number, "output": "Sound generated", "success": True}

    def get_sound_description(self, category: SoundCategory, sound_type: str) -> Optional[str]:
        """Get description for a sound type."""
        # Map to appropriate enum
        type_maps = {
            SoundCategory.UI: UISoundType,
            SoundCategory.FLIGHT: FlightSoundType,
            SoundCategory.TRANSFORMATION: TransformationSoundType,
            SoundCategory.ENVIRONMENT: EnvironmentSoundType,
            SoundCategory.ACTION: ActionSoundType,
            SoundCategory.CELEBRATION: CelebrationSoundType,
        }

        enum_class = type_maps.get(category)
        if enum_class:
            try:
                enum_value = enum_class(sound_type)
                return SOUND_DESCRIPTIONS.get(enum_value)
            except ValueError:
                pass
        return None

    def is_available(self) -> bool:
        """Check if AudioGen is available."""
        try:
            _ = self.model
            return self._model is not None
        except Exception:
            return False

    async def generate_sound(
        self,
        request: SoundRequest,
    ) -> SoundResult:
        """
        Generate a sound effect.

        Args:
            request: SoundRequest with all parameters

        Returns:
            SoundResult with generated audio info
        """
        import time
        start_time = time.time()

        try:
            # Check model availability
            if not self.is_available():
                return SoundResult(
                    success=False,
                    category=request.category.value,
                    sound_type=request.sound_type,
                    error_message="AudioGen model not available. Install audiocraft.",
                )

            # Get sound description
            description = request.custom_description
            if not description:
                description = self.get_sound_description(request.category, request.sound_type)
            if not description:
                description = f"{request.sound_type} sound effect"

            # Prepare output path
            if request.save_to_disk:
                self.output_dir.mkdir(parents=True, exist_ok=True)

                if request.output_filename:
                    output_path = self.output_dir / f"{request.output_filename}.wav"
                else:
                    output_path = self.output_dir / f"{request.category.value}_{request.sound_type}.wav"
            else:
                output_path = Path("/tmp") / f"temp_sound_{int(time.time())}.wav"

            # Set duration
            self.model.set_generation_params(duration=request.duration)

            # Generate audio
            loop = asyncio.get_event_loop()

            def generate():
                import torchaudio
                wav = self.model.generate([description])
                audio_write_path = str(output_path).replace('.wav', '')
                torchaudio.save(
                    str(output_path),
                    wav[0].cpu(),
                    sample_rate=self.model.sample_rate,
                )
                return wav.shape[-1] / self.model.sample_rate

            actual_duration = await loop.run_in_executor(None, generate)

            generation_time = (time.time() - start_time) * 1000

            return SoundResult(
                success=True,
                category=request.category.value,
                sound_type=request.sound_type,
                audio_path=str(output_path),
                duration_seconds=actual_duration,
                sample_rate=self.model.sample_rate if self._model else 32000,
                generation_time_ms=generation_time,
                metadata={
                    "description": description,
                    "requested_duration": request.duration,
                }
            )

        except Exception as e:
            generation_time = (time.time() - start_time) * 1000
            logger.error(f"Sound generation failed: {e}")
            return SoundResult(
                success=False,
                category=request.category.value,
                sound_type=request.sound_type,
                generation_time_ms=generation_time,
                error_message=str(e),
            )

    async def generate_ui_sound(
        self,
        sound_type: UISoundType,
        duration: float = 1.0,
        save_to_disk: bool = True,
    ) -> SoundResult:
        """Generate a UI sound effect."""
        request = SoundRequest(
            category=SoundCategory.UI,
            sound_type=sound_type.value,
            duration=duration,
            save_to_disk=save_to_disk,
        )
        return await self.generate_sound(request)

    async def generate_flight_sound(
        self,
        sound_type: FlightSoundType,
        duration: float = 3.0,
        save_to_disk: bool = True,
    ) -> SoundResult:
        """Generate a flight sound effect."""
        request = SoundRequest(
            category=SoundCategory.FLIGHT,
            sound_type=sound_type.value,
            duration=duration,
            save_to_disk=save_to_disk,
        )
        return await self.generate_sound(request)

    async def generate_transformation_sound(
        self,
        sound_type: TransformationSoundType,
        duration: float = 2.0,
        save_to_disk: bool = True,
    ) -> SoundResult:
        """Generate a transformation sound effect."""
        request = SoundRequest(
            category=SoundCategory.TRANSFORMATION,
            sound_type=sound_type.value,
            duration=duration,
            save_to_disk=save_to_disk,
        )
        return await self.generate_sound(request)

    async def generate_all_ui_sounds(
        self,
        save_to_disk: bool = True,
    ) -> BatchSoundResult:
        """Generate all UI sound effects."""
        results = []
        errors = []

        for sound_type in UISoundType:
            logger.info(f"Generating UI sound: {sound_type.value}")
            result = await self.generate_ui_sound(
                sound_type=sound_type,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "sound_type": sound_type.value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchSoundResult(
            total_requested=len(UISoundType),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_complete_sound_pack(
        self,
        save_to_disk: bool = True,
    ) -> Dict[str, BatchSoundResult]:
        """
        Generate a complete sound effect pack.

        Returns:
            Dictionary with results for each category
        """
        results = {}

        # UI sounds
        logger.info("Generating UI sounds pack")
        ui_results = []
        ui_errors = []
        for st in UISoundType:
            r = await self.generate_ui_sound(st, save_to_disk=save_to_disk)
            if r.success:
                ui_results.append(r)
            else:
                ui_errors.append({"sound_type": st.value, "error": r.error_message})
        results["ui"] = BatchSoundResult(
            total_requested=len(UISoundType),
            total_completed=len(ui_results),
            total_failed=len(ui_errors),
            results=ui_results,
            errors=ui_errors,
        )

        # Flight sounds
        logger.info("Generating flight sounds pack")
        flight_results = []
        flight_errors = []
        for st in FlightSoundType:
            r = await self.generate_flight_sound(st, save_to_disk=save_to_disk)
            if r.success:
                flight_results.append(r)
            else:
                flight_errors.append({"sound_type": st.value, "error": r.error_message})
        results["flight"] = BatchSoundResult(
            total_requested=len(FlightSoundType),
            total_completed=len(flight_results),
            total_failed=len(flight_errors),
            results=flight_results,
            errors=flight_errors,
        )

        # Transformation sounds
        logger.info("Generating transformation sounds pack")
        transform_results = []
        transform_errors = []
        for st in TransformationSoundType:
            r = await self.generate_transformation_sound(st, save_to_disk=save_to_disk)
            if r.success:
                transform_results.append(r)
            else:
                transform_errors.append({"sound_type": st.value, "error": r.error_message})
        results["transformation"] = BatchSoundResult(
            total_requested=len(TransformationSoundType),
            total_completed=len(transform_results),
            total_failed=len(transform_errors),
            results=transform_results,
            errors=transform_errors,
        )

        return results
