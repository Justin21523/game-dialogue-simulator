"""
LLM module for Super Wings Simulator.
Provides direct model loading via Transformers.
"""

from .base import (
    BaseLLM,
    ChatMessage,
    LLMResponse,
    GenerationConfig,
    MessageRole,
)
from .transformers_adapter import (
    TransformersLLM,
    get_llm,
    reload_llm,
)
from .profiles import get_generation_profile, list_generation_profiles

__all__ = [
    # Base classes
    "BaseLLM",
    "ChatMessage",
    "LLMResponse",
    "GenerationConfig",
    "MessageRole",
    # Transformers implementation
    "TransformersLLM",
    "get_llm",
    "reload_llm",
    # Profiles
    "get_generation_profile",
    "list_generation_profiles",
]
