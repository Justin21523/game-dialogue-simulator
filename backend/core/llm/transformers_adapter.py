"""
Transformers LLM Adapter for Super Wings Simulator.
Direct model loading using HuggingFace Transformers.
"""

import asyncio
import logging
import torch
from concurrent.futures import ThreadPoolExecutor
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    PreTrainedModel,
    PreTrainedTokenizer,
    TextIteratorStreamer,
    BitsAndBytesConfig,
)
from threading import Thread

from .base import BaseLLM, ChatMessage, LLMResponse, GenerationConfig, MessageRole

logger = logging.getLogger(__name__)

# Thread pool for blocking operations
_executor = ThreadPoolExecutor(max_workers=2)


class TransformersLLM(BaseLLM):
    """
    Direct Transformers-based LLM implementation.
    Loads models directly onto GPU without Ollama/vLLM.
    """

    def __init__(
        self,
        model_name: str = "Qwen/Qwen2.5-7B-Instruct",
        device: str = "cuda",
        torch_dtype: str = "float16",
        load_in_8bit: bool = False,
        load_in_4bit: bool = False,
        allow_cpu_fallback: bool = True,
        fallback_device: str = "cpu",
        max_memory: Optional[Dict[int, str]] = None,
        trust_remote_code: bool = True,
    ):
        super().__init__(model_name)
        self.device = device
        self.torch_dtype = getattr(torch, torch_dtype) if isinstance(torch_dtype, str) else torch_dtype
        self.load_in_8bit = load_in_8bit
        self.load_in_4bit = load_in_4bit
        self.allow_cpu_fallback = allow_cpu_fallback
        self.fallback_device = fallback_device
        self.max_memory = max_memory
        self.trust_remote_code = trust_remote_code
        self._initial_device = device

        self._model: Optional[PreTrainedModel] = None
        self._tokenizer: Optional[PreTrainedTokenizer] = None

    def load_model(self) -> None:
        """Load the model directly using Transformers."""
        if self._loaded:
            logger.info(f"Model {self.model_name} already loaded")
            return
        fallback_attempted = False

        # Resolve target device
        resolved_device = self.device
        if resolved_device == "auto":
            resolved_device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Auto device selection -> {resolved_device}")
        elif resolved_device == "cuda" and not torch.cuda.is_available():
            if self.allow_cpu_fallback:
                logger.warning("CUDA requested but not available; falling back to CPU")
                resolved_device = self.fallback_device
            else:
                raise RuntimeError("CUDA requested but torch.cuda.is_available() is False and fallback is disabled")

        self.device = resolved_device

        logger.info(f"Loading model: {self.model_name}")
        logger.info(f"Device: {self.device}, dtype: {self.torch_dtype}")

        def _do_load(device_override: Optional[str] = None):
            """Internal helper to load the model on a target device."""
            target_device = device_override or self.device

            # Prepare quantization config if needed
            quantization_config = None
            if target_device != "cpu":
                if self.load_in_4bit:
                    quantization_config = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_compute_dtype=self.torch_dtype,
                        bnb_4bit_use_double_quant=True,
                        bnb_4bit_quant_type="nf4",
                    )
                elif self.load_in_8bit:
                    quantization_config = BitsAndBytesConfig(load_in_8bit=True)

            model_kwargs = {
                "trust_remote_code": self.trust_remote_code,
                "torch_dtype": self.torch_dtype if target_device != "cpu" else torch.float32,
            }

            if quantization_config:
                model_kwargs["quantization_config"] = quantization_config
                model_kwargs["device_map"] = "auto"
            else:
                model_kwargs["device_map"] = target_device if target_device != "cuda" else "auto"

            if self.max_memory:
                model_kwargs["max_memory"] = self.max_memory

            self._model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                **model_kwargs
            )
            return target_device

        try:
            # Load tokenizer
            self._tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                trust_remote_code=self.trust_remote_code,
                padding_side="left",
            )

            # Set pad token if not set
            if self._tokenizer.pad_token is None:
                self._tokenizer.pad_token = self._tokenizer.eos_token

            # Attempt primary load
            target_device = _do_load()
            self.device = target_device
            self._loaded = True
            logger.info(f"Model {self.model_name} loaded successfully on {target_device}")
            logger.info(f"Model device: {next(self._model.parameters()).device}")

        except Exception as e:
            logger.error(f"Primary load failed on {self.device}: {e}")
            # Optional CPU fallback
            if self.allow_cpu_fallback and not fallback_attempted:
                fallback_attempted = True
                try:
                    logger.warning(f"Falling back to {self.fallback_device} without quantization")
                    # Reset quantization for fallback
                    self.load_in_4bit = False
                    self.load_in_8bit = False
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    target_device = _do_load(self.fallback_device)
                    self.device = target_device
                    self._loaded = True
                    logger.info(f"Model {self.model_name} loaded on fallback device {target_device}")
                    return
                except Exception as e2:
                    logger.error(f"Fallback load failed: {e2}")
                    raise RuntimeError(f"Model loading failed after fallback: {e2}") from e
            raise RuntimeError(f"Model loading failed: {e}") from e

    def unload_model(self) -> None:
        """Unload model from memory."""
        if self._model is not None:
            del self._model
            self._model = None

        if self._tokenizer is not None:
            del self._tokenizer
            self._tokenizer = None

        self._loaded = False

        # Clear CUDA cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info(f"Model {self.model_name} unloaded")

    def _format_messages(self, messages: List[ChatMessage]) -> str:
        """Format chat messages for the model."""
        # Use tokenizer's chat template if available
        if hasattr(self._tokenizer, "apply_chat_template"):
            formatted = self._tokenizer.apply_chat_template(
                [m.to_dict() for m in messages],
                tokenize=False,
                add_generation_prompt=True,
            )
            return formatted

        # Fallback: simple formatting
        formatted_parts = []
        for msg in messages:
            if msg.role == MessageRole.SYSTEM:
                formatted_parts.append(f"System: {msg.content}")
            elif msg.role == MessageRole.USER:
                formatted_parts.append(f"User: {msg.content}")
            elif msg.role == MessageRole.ASSISTANT:
                formatted_parts.append(f"Assistant: {msg.content}")

        formatted_parts.append("Assistant:")
        return "\n\n".join(formatted_parts)

    def _generate_sync(
        self,
        input_text: str,
        config: GenerationConfig,
    ) -> str:
        """Synchronous generation."""
        inputs = self._tokenizer(
            input_text,
            return_tensors="pt",
            padding=True,
            truncation=True,
        ).to(self._model.device)

        # Generation parameters
        gen_kwargs = {
            "max_new_tokens": config.max_length,
            "temperature": config.temperature if config.do_sample else 1.0,
            "top_p": config.top_p if config.do_sample else 1.0,
            "top_k": config.top_k if config.do_sample else 50,
            "repetition_penalty": config.repetition_penalty,
            "do_sample": config.do_sample,
            "pad_token_id": self._tokenizer.pad_token_id,
            "eos_token_id": self._tokenizer.eos_token_id,
        }

        # Add stop sequences if provided
        if config.stop_sequences:
            stop_ids = [
                self._tokenizer.encode(seq, add_special_tokens=False)
                for seq in config.stop_sequences
            ]
            # Use the first stop sequence
            if stop_ids and stop_ids[0]:
                gen_kwargs["eos_token_id"] = [
                    self._tokenizer.eos_token_id,
                    *[ids[0] for ids in stop_ids if ids]
                ]

        with torch.no_grad():
            outputs = self._model.generate(
                **inputs,
                **gen_kwargs,
            )

        # Decode output (skip input tokens)
        input_length = inputs["input_ids"].shape[1]
        generated_ids = outputs[0][input_length:]
        generated_text = self._tokenizer.decode(
            generated_ids,
            skip_special_tokens=True,
        )

        return generated_text.strip()

    async def generate(
        self,
        prompt: str,
        config: Optional[GenerationConfig] = None,
        **kwargs
    ) -> LLMResponse:
        """Generate text from prompt."""
        if not self._loaded:
            self.load_model()

        config = config or GenerationConfig()

        # Run generation in thread pool
        loop = asyncio.get_event_loop()
        generated_text = await loop.run_in_executor(
            _executor,
            self._generate_sync,
            prompt,
            config,
        )

        return LLMResponse(
            content=generated_text,
            model_name=self.model_name,
            usage={
                "prompt_tokens": self.count_tokens(prompt),
                "completion_tokens": self.count_tokens(generated_text),
                "total_tokens": self.count_tokens(prompt) + self.count_tokens(generated_text),
            },
            finish_reason="stop",
        )

    async def chat(
        self,
        messages: List[ChatMessage],
        config: Optional[GenerationConfig] = None,
        **kwargs
    ) -> LLMResponse:
        """Generate response from chat messages."""
        if not self._loaded:
            self.load_model()

        config = config or GenerationConfig()
        formatted_prompt = self._format_messages(messages)

        return await self.generate(formatted_prompt, config, **kwargs)

    async def stream_generate(
        self,
        prompt: str,
        config: Optional[GenerationConfig] = None,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """Stream generate text token by token."""
        if not self._loaded:
            self.load_model()

        config = config or GenerationConfig()

        # Create streamer
        streamer = TextIteratorStreamer(
            self._tokenizer,
            skip_prompt=True,
            skip_special_tokens=True,
        )

        inputs = self._tokenizer(
            prompt,
            return_tensors="pt",
            padding=True,
            truncation=True,
        ).to(self._model.device)

        gen_kwargs = {
            "max_new_tokens": config.max_length,
            "temperature": config.temperature if config.do_sample else 1.0,
            "top_p": config.top_p if config.do_sample else 1.0,
            "do_sample": config.do_sample,
            "pad_token_id": self._tokenizer.pad_token_id,
            "streamer": streamer,
        }

        # Run generation in separate thread
        def generate():
            with torch.no_grad():
                self._model.generate(**inputs, **gen_kwargs)

        thread = Thread(target=generate)
        thread.start()

        # Yield tokens as they're generated
        for text in streamer:
            yield text

        thread.join()

    async def stream_chat(
        self,
        messages: List[ChatMessage],
        config: Optional[GenerationConfig] = None,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """Stream chat response token by token."""
        if not self._loaded:
            self.load_model()

        config = config or GenerationConfig()
        formatted_prompt = self._format_messages(messages)

        async for token in self.stream_generate(formatted_prompt, config, **kwargs):
            yield token


# Singleton instance
_llm_instance: Optional[TransformersLLM] = None


def get_llm(
    model_name: Optional[str] = None,
    **kwargs
) -> TransformersLLM:
    """Get or create LLM singleton instance."""
    global _llm_instance

    if _llm_instance is None:
        from ...config import get_settings
        settings = get_settings()

        _llm_instance = TransformersLLM(
            model_name=model_name or settings.llm.model_name,
            device=settings.llm.device,
            torch_dtype=settings.llm.torch_dtype,
            load_in_8bit=settings.llm.load_in_8bit,
            load_in_4bit=settings.llm.load_in_4bit,
            allow_cpu_fallback=settings.llm.allow_cpu_fallback,
            fallback_device=settings.llm.fallback_device,
            **kwargs
        )

    return _llm_instance


def reload_llm(**kwargs) -> TransformersLLM:
    """Reload LLM with new configuration."""
    global _llm_instance

    if _llm_instance is not None:
        _llm_instance.unload_model()

    _llm_instance = None
    return get_llm(**kwargs)
