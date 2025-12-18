"""
Base LLM Interface for Super Wings Simulator.
Provides abstract base class for LLM implementations.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional, Union
from enum import Enum

logger = logging.getLogger(__name__)


class MessageRole(str, Enum):
    """Chat message roles."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


@dataclass
class ChatMessage:
    """Single chat message."""

    role: MessageRole
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, str]:
        """Convert to dictionary format."""
        return {"role": self.role.value, "content": self.content}

    @classmethod
    def system(cls, content: str) -> "ChatMessage":
        """Create system message."""
        return cls(role=MessageRole.SYSTEM, content=content)

    @classmethod
    def user(cls, content: str) -> "ChatMessage":
        """Create user message."""
        return cls(role=MessageRole.USER, content=content)

    @classmethod
    def assistant(cls, content: str) -> "ChatMessage":
        """Create assistant message."""
        return cls(role=MessageRole.ASSISTANT, content=content)


@dataclass
class LLMResponse:
    """LLM response structure."""

    content: str
    model_name: str
    usage: Dict[str, int] = field(default_factory=dict)
    finish_reason: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def total_tokens(self) -> int:
        """Get total tokens used."""
        return self.usage.get("total_tokens", 0)


@dataclass
class GenerationConfig:
    """Generation configuration parameters."""

    max_new_tokens: int = 256  # Alias for compatibility
    max_length: Optional[int] = None  # legacy
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 50
    repetition_penalty: float = 1.1
    do_sample: bool = True
    num_return_sequences: int = 1
    stop_sequences: List[str] = field(default_factory=list)

    def __post_init__(self):
        if self.max_length is not None:
            self.max_new_tokens = self.max_length


class BaseLLM(ABC):
    """
    Abstract base class for LLM implementations.
    Provides unified interface for different LLM backends.
    """

    def __init__(self, model_name: str):
        self.model_name = model_name
        self._loaded = False
        self._model = None
        self._tokenizer = None

    @property
    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        return self._loaded

    @abstractmethod
    def load_model(self) -> None:
        """Load the LLM model into memory."""
        pass

    @abstractmethod
    def unload_model(self) -> None:
        """Unload the model from memory."""
        pass

    @abstractmethod
    async def generate(
        self, prompt: str, config: Optional[GenerationConfig] = None, **kwargs
    ) -> LLMResponse:
        """
        Generate text from a prompt.

        Args:
            prompt: Input prompt text
            config: Generation configuration
            **kwargs: Additional generation parameters

        Returns:
            LLMResponse with generated text
        """
        pass

    @abstractmethod
    async def chat(
        self,
        messages: List[ChatMessage],
        config: Optional[GenerationConfig] = None,
        **kwargs,
    ) -> LLMResponse:
        """
        Generate response from chat messages.

        Args:
            messages: List of chat messages
            config: Generation configuration
            **kwargs: Additional generation parameters

        Returns:
            LLMResponse with generated text
        """
        pass

    @abstractmethod
    async def stream_generate(
        self, prompt: str, config: Optional[GenerationConfig] = None, **kwargs
    ) -> AsyncGenerator[str, None]:
        """
        Stream generate text token by token.

        Args:
            prompt: Input prompt text
            config: Generation configuration
            **kwargs: Additional generation parameters

        Yields:
            Generated text tokens
        """
        pass

    @abstractmethod
    async def stream_chat(
        self,
        messages: List[ChatMessage],
        config: Optional[GenerationConfig] = None,
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat response token by token.

        Args:
            messages: List of chat messages
            config: Generation configuration
            **kwargs: Additional generation parameters

        Yields:
            Generated text tokens
        """
        pass

    def count_tokens(self, text: str) -> int:
        """
        Count tokens in text.

        Args:
            text: Input text

        Returns:
            Number of tokens
        """
        if self._tokenizer is None:
            # Rough estimation if tokenizer not available
            return len(text) // 4
        return len(self._tokenizer.encode(text))

    def is_available(self) -> bool:
        """Check if LLM is available and healthy."""
        return self._loaded and self._model is not None

    def __repr__(self) -> str:
        status = "loaded" if self._loaded else "not loaded"
        return f"{self.__class__.__name__}(model={self.model_name}, status={status})"
