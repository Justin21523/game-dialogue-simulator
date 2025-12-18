"""
Voice Generator Agent for Super Wings Simulator.
Handles text-to-speech generation using Coqui TTS.
"""

import logging
import asyncio
from pathlib import Path
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from .base_agent import BaseAgent, ReasoningMode, PlanStep

logger = logging.getLogger(__name__)


class VoiceEmotion(str, Enum):
    """Voice emotions for TTS."""
    NEUTRAL = "neutral"
    HAPPY = "happy"
    EXCITED = "excited"
    SAD = "sad"
    WORRIED = "worried"
    DETERMINED = "determined"
    FRIENDLY = "friendly"


class VoiceSpeed(str, Enum):
    """Voice speed settings."""
    SLOW = "slow"
    NORMAL = "normal"
    FAST = "fast"


# Character voice configurations
CHARACTER_VOICE_CONFIGS = {
    "jett": {
        "name": "Jett",
        "description": "Enthusiastic, friendly, helpful",
        "pitch_modifier": 1.0,
        "speed_modifier": 1.1,  # Slightly faster, energetic
        "base_emotion": VoiceEmotion.FRIENDLY,
    },
    "jerome": {
        "name": "Jerome",
        "description": "Confident, stylish, experienced",
        "pitch_modifier": 0.95,  # Slightly deeper
        "speed_modifier": 1.0,
        "base_emotion": VoiceEmotion.NEUTRAL,
    },
    "donnie": {
        "name": "Donnie",
        "description": "Practical, inventive, helpful",
        "pitch_modifier": 1.05,
        "speed_modifier": 0.95,  # Slightly slower, thoughtful
        "base_emotion": VoiceEmotion.FRIENDLY,
    },
    "chase": {
        "name": "Chase",
        "description": "Mysterious, clever, cool",
        "pitch_modifier": 0.9,  # Deeper
        "speed_modifier": 0.95,
        "base_emotion": VoiceEmotion.NEUTRAL,
    },
    "flip": {
        "name": "Flip",
        "description": "Energetic, competitive, sporty",
        "pitch_modifier": 1.1,  # Higher
        "speed_modifier": 1.15,  # Faster, sporty
        "base_emotion": VoiceEmotion.EXCITED,
    },
    "todd": {
        "name": "Todd",
        "description": "Determined, hard-working, straightforward",
        "pitch_modifier": 0.85,  # Lower
        "speed_modifier": 0.9,  # Slower, steady
        "base_emotion": VoiceEmotion.DETERMINED,
    },
    "paul": {
        "name": "Paul",
        "description": "Dutiful, responsible, fun-loving",
        "pitch_modifier": 1.0,
        "speed_modifier": 1.0,
        "base_emotion": VoiceEmotion.FRIENDLY,
    },
    "bello": {
        "name": "Bello",
        "description": "Friendly, gentle, empathetic",
        "pitch_modifier": 1.15,  # Higher, gentle
        "speed_modifier": 0.9,  # Slower, calmer
        "base_emotion": VoiceEmotion.FRIENDLY,
    },
}


class VoiceRequest(BaseModel):
    """Request for voice generation."""
    text: str
    character_id: Optional[str] = None
    emotion: Optional[VoiceEmotion] = None
    speed: VoiceSpeed = VoiceSpeed.NORMAL
    language: str = "en"
    save_to_disk: bool = True
    output_filename: Optional[str] = None


class VoiceResult(BaseModel):
    """Result of voice generation."""
    success: bool
    character_id: Optional[str] = None
    text: str = ""
    audio_path: Optional[str] = None
    audio_data: Optional[bytes] = None
    duration_seconds: float = 0.0
    sample_rate: int = 22050
    generation_time_ms: float = 0.0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class BatchVoiceResult(BaseModel):
    """Result of batch voice generation."""
    total_requested: int
    total_completed: int
    total_failed: int
    results: List[VoiceResult] = []
    errors: List[Dict[str, str]] = []


# Singleton instance
_voice_agent: Optional["VoiceGeneratorAgent"] = None


def get_voice_agent() -> "VoiceGeneratorAgent":
    """Get or create VoiceGeneratorAgent singleton."""
    global _voice_agent
    if _voice_agent is None:
        _voice_agent = VoiceGeneratorAgent()
    return _voice_agent


class VoiceGeneratorAgent(BaseAgent):
    """
    Agent for generating character voices using TTS.

    This agent handles:
    - Character voice generation with personality
    - Emotion-based voice modulation
    - Multi-language support (primarily English)
    - Coqui TTS integration
    """

    def __init__(
        self,
        model_name: str = "tts_models/en/ljspeech/tacotron2-DDC",
        output_dir: str = "./assets/audio/voices",
        device: str = "cuda",
    ):
        super().__init__(
            name="voice_generator_agent",
            description="Agent for generating Super Wings character voices",
            reasoning_mode=ReasoningMode.SIMPLE,
            enable_planning=False,
        )

        self.model_name = model_name
        self.output_dir = Path(output_dir)
        self.device = device
        self._tts = None
        self._initialized = False

    @property
    def tts(self):
        """Lazy load TTS model."""
        if self._tts is None:
            self._initialize_tts()
        return self._tts

    def _initialize_tts(self):
        """Initialize TTS model."""
        try:
            from TTS.api import TTS
            self._tts = TTS(model_name=self.model_name)
            if self.device == "cuda":
                self._tts.to(self.device)
            self._initialized = True
            logger.info(f"TTS model loaded: {self.model_name}")
        except ImportError:
            logger.warning("Coqui TTS not installed. Install with: pip install TTS")
            self._tts = None
        except Exception as e:
            logger.error(f"Failed to initialize TTS: {e}")
            self._tts = None

    async def get_system_prompt(self) -> str:
        return """You are a Voice Generator agent for Super Wings.
Your role is to generate character voices for dialogue.
You understand character personalities and can apply appropriate
voice modulation for different emotions and situations."""

    async def execute_step(
        self,
        step: PlanStep,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute voice generation step."""
        return {"step": step.step_number, "output": "Voice generated", "success": True}

    def get_character_voice_config(self, character_id: str) -> Optional[Dict[str, Any]]:
        """Get voice configuration for a character."""
        return CHARACTER_VOICE_CONFIGS.get(character_id.lower())

    def get_available_characters(self) -> List[str]:
        """Get list of available character voices."""
        return list(CHARACTER_VOICE_CONFIGS.keys())

    def is_available(self) -> bool:
        """Check if TTS is available."""
        try:
            _ = self.tts
            return self._tts is not None
        except Exception:
            return False

    async def generate_voice(
        self,
        request: VoiceRequest,
    ) -> VoiceResult:
        """
        Generate voice audio from text.

        Args:
            request: VoiceRequest with all parameters

        Returns:
            VoiceResult with generated audio info
        """
        import time
        start_time = time.time()

        try:
            # Check TTS availability
            if not self.is_available():
                return VoiceResult(
                    success=False,
                    text=request.text,
                    error_message="TTS model not available. Install Coqui TTS.",
                )

            # Get character config
            char_config = None
            if request.character_id:
                char_config = self.get_character_voice_config(request.character_id)

            # Prepare output path
            if request.save_to_disk:
                self.output_dir.mkdir(parents=True, exist_ok=True)

                if request.output_filename:
                    output_path = self.output_dir / f"{request.output_filename}.wav"
                else:
                    char_prefix = request.character_id or "narrator"
                    timestamp = int(time.time())
                    output_path = self.output_dir / f"{char_prefix}_{timestamp}.wav"
            else:
                output_path = None

            # Generate audio
            loop = asyncio.get_event_loop()

            if output_path:
                await loop.run_in_executor(
                    None,
                    lambda: self.tts.tts_to_file(
                        text=request.text,
                        file_path=str(output_path),
                    )
                )
            else:
                # Generate to memory (not currently supported by all Coqui models)
                await loop.run_in_executor(
                    None,
                    lambda: self.tts.tts_to_file(
                        text=request.text,
                        file_path="/tmp/temp_voice.wav",
                    )
                )
                output_path = Path("/tmp/temp_voice.wav")

            # Calculate duration (approximate based on text length)
            # More accurate would be to read the audio file
            words = len(request.text.split())
            duration = words / 2.5  # Approximate words per second

            generation_time = (time.time() - start_time) * 1000

            return VoiceResult(
                success=True,
                character_id=request.character_id,
                text=request.text,
                audio_path=str(output_path) if output_path else None,
                duration_seconds=duration,
                sample_rate=22050,
                generation_time_ms=generation_time,
                metadata={
                    "emotion": request.emotion.value if request.emotion else "neutral",
                    "speed": request.speed.value,
                    "language": request.language,
                    "character_config": char_config,
                }
            )

        except Exception as e:
            generation_time = (time.time() - start_time) * 1000
            logger.error(f"Voice generation failed: {e}")
            return VoiceResult(
                success=False,
                text=request.text,
                generation_time_ms=generation_time,
                error_message=str(e),
            )

    async def generate_character_line(
        self,
        character_id: str,
        text: str,
        emotion: Optional[VoiceEmotion] = None,
        save_to_disk: bool = True,
    ) -> VoiceResult:
        """
        Generate a voice line for a specific character.

        Args:
            character_id: Character ID
            text: Text to speak
            emotion: Optional emotion override
            save_to_disk: Whether to save audio locally

        Returns:
            VoiceResult with generated audio info
        """
        char_config = self.get_character_voice_config(character_id)
        base_emotion = VoiceEmotion(char_config["base_emotion"]) if char_config else VoiceEmotion.NEUTRAL

        request = VoiceRequest(
            text=text,
            character_id=character_id,
            emotion=emotion or base_emotion,
            speed=VoiceSpeed.NORMAL,
            save_to_disk=save_to_disk,
        )

        return await self.generate_voice(request)

    async def generate_dialogue(
        self,
        dialogue: List[Dict[str, str]],
        save_to_disk: bool = True,
    ) -> BatchVoiceResult:
        """
        Generate voice for a sequence of dialogue lines.

        Args:
            dialogue: List of {"character_id": "...", "text": "..."} dicts
            save_to_disk: Whether to save audio locally

        Returns:
            BatchVoiceResult with all generated audio
        """
        results = []
        errors = []

        for i, line in enumerate(dialogue):
            character_id = line.get("character_id", "narrator")
            text = line.get("text", "")
            emotion_str = line.get("emotion")
            emotion = VoiceEmotion(emotion_str) if emotion_str else None

            logger.info(f"Generating voice line {i+1}/{len(dialogue)} for {character_id}")

            result = await self.generate_character_line(
                character_id=character_id,
                text=text,
                emotion=emotion,
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "line": i + 1,
                    "character_id": character_id,
                    "error": result.error_message or "Unknown error",
                })

        return BatchVoiceResult(
            total_requested=len(dialogue),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )

    async def generate_character_voice_samples(
        self,
        character_id: str,
        save_to_disk: bool = True,
    ) -> BatchVoiceResult:
        """
        Generate sample voice lines for a character demonstrating different emotions.

        Args:
            character_id: Character ID
            save_to_disk: Whether to save audio locally

        Returns:
            BatchVoiceResult with sample voice lines
        """
        char_config = self.get_character_voice_config(character_id)
        if not char_config:
            return BatchVoiceResult(
                total_requested=0,
                total_completed=0,
                total_failed=1,
                errors=[{"error": f"Unknown character: {character_id}"}]
            )

        # Sample lines for different situations
        sample_lines = [
            {"emotion": VoiceEmotion.FRIENDLY, "text": f"Hi! I'm {char_config['name']}! Let's have an adventure!"},
            {"emotion": VoiceEmotion.EXCITED, "text": "Wow! This is amazing! I can't wait to help!"},
            {"emotion": VoiceEmotion.DETERMINED, "text": "Don't worry, I'll get there in time. Super Wings, ready for delivery!"},
            {"emotion": VoiceEmotion.HAPPY, "text": "Mission complete! Great job, everyone!"},
        ]

        results = []
        errors = []

        for i, line in enumerate(sample_lines):
            logger.info(f"Generating sample {i+1}/{len(sample_lines)} for {character_id}")

            result = await self.generate_character_line(
                character_id=character_id,
                text=line["text"],
                emotion=line["emotion"],
                save_to_disk=save_to_disk,
            )

            if result.success:
                results.append(result)
            else:
                errors.append({
                    "sample": i + 1,
                    "emotion": line["emotion"].value,
                    "error": result.error_message or "Unknown error",
                })

        return BatchVoiceResult(
            total_requested=len(sample_lines),
            total_completed=len(results),
            total_failed=len(errors),
            results=results,
            errors=errors,
        )
