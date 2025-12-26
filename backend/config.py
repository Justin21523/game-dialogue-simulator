"""
Configuration management for Super Wings Simulator backend.
"""

import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class LLMConfig(BaseSettings):
    """LLM model configuration."""

    model_name: str = Field(
        default="/mnt/c/ai_models/llm/Qwen2.5-7B-Instruct",
        description="HuggingFace model name or local path for direct loading"
    )
    device: str = Field(
        default="cuda",
        description="Device to load model (cuda, cpu, auto)"
    )
    torch_dtype: str = Field(
        default="float16",
        description="Torch dtype (float16, bfloat16, float32)"
    )
    max_length: int = Field(
        default=2048,
        description="Maximum sequence length"
    )
    temperature: float = Field(
        default=0.7,
        description="Generation temperature"
    )
    top_p: float = Field(
        default=0.9,
        description="Top-p sampling"
    )
    load_in_8bit: bool = Field(
        default=False,
        description="Load model in 8-bit quantization"
    )
    load_in_4bit: bool = Field(
        default=True,
        description="Load model in 4-bit quantization (recommended for 7B+ models)"
    )
    allow_cpu_fallback: bool = Field(
        default=True,
        description="Automatically fall back to CPU if GPU load fails"
    )
    fallback_device: str = Field(
        default="cpu",
        description="Fallback device when GPU loading fails"
    )
    preload: bool = Field(
        default=False,
        description="Preload model on startup"
    )

    class Config:
        env_prefix = "LLM_"


class RAGConfig(BaseSettings):
    """RAG and ChromaDB configuration."""

    chroma_persist_dir: str = Field(
        default="./data/chroma_db",
        description="ChromaDB persistence directory"
    )
    collection_name: str = Field(
        default="super_wings_knowledge",
        description="Default ChromaDB collection name"
    )
    embedding_model: str = Field(
        default="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        description="Embedding model for vector search"
    )
    chunk_size: int = Field(
        default=500,
        description="Text chunk size for indexing"
    )
    chunk_overlap: int = Field(
        default=50,
        description="Overlap between chunks"
    )
    top_k: int = Field(
        default=5,
        description="Number of results to retrieve"
    )
    auto_index: bool = Field(
        default=True,
        description="Auto-index knowledge on startup"
    )

    class Config:
        env_prefix = "RAG_"


class APIConfig(BaseSettings):
    """API server configuration."""

    host: str = Field(default="0.0.0.0", description="API host")
    port: int = Field(default=8001, description="API port")  # Use 8001 to avoid frontend port conflicts.
    debug: bool = Field(default=False, description="Debug mode")
    dev_mode: bool = Field(
        default=True,
        description="Development mode (disables API key authentication)"
    )
    api_key: str = Field(
        default="",
        description="API key for authentication (leave empty to disable)"
    )
    environment: str = Field(
        default="development",
        description="Environment (development, staging, production)"
    )
    cors_origins: list = Field(
        default=["http://localhost:3000", "http://localhost:5173", "*"],
        description="Allowed CORS origins"
    )
    api_prefix: str = Field(default="/api/v1", description="API prefix")
    request_timeout: int = Field(default=300, description="Request timeout in seconds")

    class Config:
        env_prefix = "API_"


class AgentConfig(BaseSettings):
    """Agent system configuration."""

    max_iterations: int = Field(
        default=10,
        description="Maximum agent iterations"
    )
    max_tools_per_iteration: int = Field(
        default=3,
        description="Maximum tools per iteration"
    )
    enable_reasoning: bool = Field(
        default=True,
        description="Enable chain-of-thought reasoning"
    )
    reasoning_mode: str = Field(
        default="react",
        description="Reasoning mode (cot, react)"
    )

    class Config:
        env_prefix = "AGENT_"


class GameConfig(BaseSettings):
    """Game-specific configuration."""

    characters_file: str = Field(
        default="./data/characters.json",
        description="Path to characters data file"
    )
    knowledge_dir: str = Field(
        default="./backend/data/knowledge",
        description="Path to knowledge base directory"
    )
    session_timeout: int = Field(
        default=3600,
        description="Game session timeout in seconds"
    )

    class Config:
        env_prefix = "GAME_"


class ComfyUIConfig(BaseSettings):
    """ComfyUI server configuration."""

    server_address: str = Field(
        default="127.0.0.1:8188",
        description="ComfyUI server address (host:port)"
    )
    api_endpoint: str = Field(
        default="http://127.0.0.1:8188/prompt",
        description="ComfyUI API endpoint for submitting prompts"
    )
    ws_endpoint: str = Field(
        default="ws://127.0.0.1:8188/ws",
        description="ComfyUI WebSocket endpoint for progress"
    )
    timeout: int = Field(
        default=300,
        description="Generation timeout in seconds"
    )
    max_concurrent: int = Field(
        default=2,
        description="Maximum concurrent generations"
    )
    output_dir: str = Field(
        default="./assets/generated",
        description="Generated assets output directory"
    )
    base_model: str = Field(
        default="sd_xl_base_1.0.safetensors",
        description="SDXL base model checkpoint name"
    )

    class Config:
        env_prefix = "COMFYUI_"


class ImageGenerationConfig(BaseSettings):
    """Image generation configuration."""

    default_steps: int = Field(
        default=40,
        description="Default sampling steps"
    )
    default_cfg_scale: float = Field(
        default=8.0,
        description="Default CFG scale"
    )
    default_lora_weight: float = Field(
        default=0.9,
        description="Default LoRA weight"
    )
    default_sampler: str = Field(
        default="dpmpp_2m",
        description="Default sampler name"
    )
    default_scheduler: str = Field(
        default="karras",
        description="Default scheduler"
    )
    lora_base_path: str = Field(
        default="/mnt/data/training/lora/super-wings",
        description="Base path for LoRA models"
    )
    prompts_dir: str = Field(
        default="./prompts/game_assets",
        description="Directory containing prompt templates"
    )
    cache_enabled: bool = Field(
        default=True,
        description="Enable image caching"
    )
    cache_dir: str = Field(
        default="./cache/images",
        description="Image cache directory"
    )

    class Config:
        env_prefix = "IMG_"


class TTSConfig(BaseSettings):
    """Text-to-Speech configuration (Coqui TTS)."""

    model_name: str = Field(
        default="tts_models/en/ljspeech/tacotron2-DDC",
        description="Coqui TTS model name"
    )
    device: str = Field(
        default="cuda",
        description="Device for TTS (cuda, cpu)"
    )
    output_dir: str = Field(
        default="./assets/audio/voices",
        description="Voice output directory"
    )
    sample_rate: int = Field(
        default=22050,
        description="Audio sample rate"
    )

    class Config:
        env_prefix = "TTS_"


class AudioGenConfig(BaseSettings):
    """AudioCraft/AudioGen configuration."""

    model_name: str = Field(
        default="facebook/audiogen-medium",
        description="AudioGen model name"
    )
    device: str = Field(
        default="cuda",
        description="Device for AudioGen (cuda, cpu)"
    )
    output_dir: str = Field(
        default="./assets/audio/effects",
        description="Sound effects output directory"
    )
    duration: float = Field(
        default=5.0,
        description="Default audio duration in seconds"
    )

    class Config:
        env_prefix = "AUDIOGEN_"


class Settings(BaseSettings):
    """Main application settings."""

    app_name: str = "Super Wings Simulator API"
    app_version: str = "1.0.0"

    # Sub-configurations
    llm: LLMConfig = Field(default_factory=LLMConfig)
    rag: RAGConfig = Field(default_factory=RAGConfig)
    api: APIConfig = Field(default_factory=APIConfig)
    agent: AgentConfig = Field(default_factory=AgentConfig)
    game: GameConfig = Field(default_factory=GameConfig)

    # Phase B: image generation and media
    comfyui: ComfyUIConfig = Field(default_factory=ComfyUIConfig)
    image: ImageGenerationConfig = Field(default_factory=ImageGenerationConfig)
    tts: TTSConfig = Field(default_factory=TTSConfig)
    audiogen: AudioGenConfig = Field(default_factory=AudioGenConfig)

    # Paths
    base_dir: Path = Field(
        default_factory=lambda: Path(__file__).parent.parent,
        description="Project base directory"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore unknown environment variables


# Global settings instance
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get or create settings singleton."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reload_settings() -> Settings:
    """Reload settings from environment."""
    global _settings
    _settings = Settings()
    return _settings
