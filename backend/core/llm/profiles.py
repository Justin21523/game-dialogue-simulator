"""
Predefined generation profiles for the LLM.
"""

from __future__ import annotations

from typing import Dict

from .base import GenerationConfig

# Base presets; we instantiate new GenerationConfig on each request to avoid mutation.
_PROFILE_DEFINITIONS: Dict[str, Dict] = {
    "default": dict(max_length=256, temperature=0.7, top_p=0.9, top_k=50, repetition_penalty=1.1, do_sample=True),
    "concise": dict(max_length=80, temperature=0.4, top_p=0.8, top_k=30, repetition_penalty=1.2, do_sample=False),
    "balanced": dict(max_length=200, temperature=0.65, top_p=0.9, top_k=40, repetition_penalty=1.1, do_sample=True),
    "creative": dict(max_length=400, temperature=0.9, top_p=0.95, top_k=60, repetition_penalty=1.05, do_sample=True),
    "longform": dict(max_length=600, temperature=0.7, top_p=0.9, top_k=50, repetition_penalty=1.05, do_sample=True),
    "streaming": dict(max_length=160, temperature=0.75, top_p=0.9, top_k=40, repetition_penalty=1.1, do_sample=True),
}


def get_generation_profile(name: str = "default") -> GenerationConfig:
    """
    Retrieve a GenerationConfig by profile name.

    Args:
        name: Profile name (default/concise/balanced/creative/longform/streaming)

    Returns:
        GenerationConfig instance
    """
    profile = _PROFILE_DEFINITIONS.get(name.lower(), _PROFILE_DEFINITIONS["default"])
    return GenerationConfig(**profile)


def list_generation_profiles():
    """List available profile names."""
    return sorted(_PROFILE_DEFINITIONS.keys())
