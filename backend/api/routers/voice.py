"""
Voice Generation Router.
Handles TTS and RVC voice conversion requests (placeholder tone synthesis for now).
"""

import hashlib
import logging
import math
import os
import wave
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ...config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


class VoiceRequest(BaseModel):
    text: str
    character_id: str
    emotion: Optional[str] = "neutral"
    speed: Optional[str] = "normal"  # fast/normal/slow


def _ensure_output_dir() -> Path:
    """Create and return the configured voice output directory."""
    settings = get_settings()
    out_dir = Path(settings.tts.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def _synthesize_tone(text: str, character_id: str, emotion: str) -> Path:
    """
    Simple tone-based placeholder synthesis to avoid external TTS dependencies.
    Generates a short WAV file whose pitch is derived from the text hash.
    """
    settings = get_settings()
    sample_rate = settings.tts.sample_rate
    duration = max(1.5, min(4.0, len(text) / 12))

    # Derive frequency from text hash for slight variation
    digest = hashlib.md5(f"{character_id}:{text}".encode("utf-8")).hexdigest()
    freq = 440 + (int(digest[:4], 16) % 220)  # 440-660 Hz

    # Emotion affects amplitude slightly
    amp = 0.2
    if emotion in ("excited", "happy"):
        amp = 0.25
    elif emotion in ("sad", "worried"):
        amp = 0.15

    out_dir = _ensure_output_dir()
    filename = f"{character_id}_{digest[:8]}.wav"
    filepath = out_dir / filename

    # Reuse existing file if already synthesized
    if filepath.exists():
        return filepath

    n_frames = int(duration * sample_rate)
    with wave.open(str(filepath), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)

        for i in range(n_frames):
            t = i / sample_rate
            sample = amp * math.sin(2 * math.pi * freq * t)
            wf.writeframesraw(int(sample * 32767).to_bytes(2, byteorder="little", signed=True))

    return filepath


@router.post("/generate")
async def generate_voice(request: VoiceRequest):
    """
    Generate voice line for a character.
    For now, synthesize a lightweight WAV tone placeholder and return a URL for playback.
    """
    try:
        logger.info(f"Generating voice for {request.character_id}: {request.text}")
        path = _synthesize_tone(request.text, request.character_id, request.emotion or "neutral")
        audio_url = f"/api/voice/audio/{path.name}"

        return {
            "status": "success",
            "audio_url": audio_url,
            "format": "wav",
            "transcript": request.text,
        }

    except Exception as e:
        logger.error(f"Voice generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio/{filename}")
async def get_audio_file(filename: str):
    """
    Serve generated audio files from the configured output directory.
    """
    out_dir = _ensure_output_dir()
    file_path = out_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(str(file_path))
