"""
Super Wings Simulator FastAPI Application.
Main API entry point.
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..config import get_settings
from .routers import (
    health,
    characters,
    dialogue,
    dispatch,
    narration,
    events,
    tutorial,
    progress,
    missions,
    images,
    content,
    # ===== 新增以下 8 個 =====
    assets,
    campaign,
    comfyui,
    prompt,
    image_generation,
    animation,
    sound,
    voice,
    # ===== RAG 系統 =====
    rag,
    # ===== NPC 生成系統 =====
    npc,
)

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan events."""
    # Startup
    logger.info("🚀 Starting Super Wings Simulator API...")
    logger.info(f"Environment: {settings.api.environment}")
    logger.info(f"LLM Model: {settings.llm.model_name}")

    yield

    # Shutdown
    logger.info("👋 Shutting down Super Wings Simulator API...")

    # Unload LLM if loaded
    try:
        from ..core.llm import get_llm
        llm = get_llm()
        if llm._loaded:
            llm.unload_model()
            logger.info("LLM model unloaded")
    except Exception as e:
        logger.warning(f"Error unloading LLM: {e}")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Super Wings Simulator API - AI-powered game backend",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(
    health.router,
    prefix=f"{settings.api.api_prefix}/health",
    tags=["Health"]
)

app.include_router(
    characters.router,
    prefix=f"{settings.api.api_prefix}/characters",
    tags=["Characters"]
)

app.include_router(
    dialogue.router,
    prefix=f"{settings.api.api_prefix}/dialogue",
    tags=["Dialogue"]
)

app.include_router(
    dispatch.router,
    prefix=f"{settings.api.api_prefix}/dispatch",
    tags=["Dispatch"]
)

app.include_router(
    narration.router,
    prefix=f"{settings.api.api_prefix}/narration",
    tags=["Narration"]
)

app.include_router(
    events.router,
    prefix=f"{settings.api.api_prefix}/events",
    tags=["Events"]
)

app.include_router(
    tutorial.router,
    prefix=f"{settings.api.api_prefix}/tutorial",
    tags=["Tutorial"]
)

app.include_router(
    progress.router,
    prefix=f"{settings.api.api_prefix}/progress",
    tags=["Progress"]
)

app.include_router(
    missions.router,
    prefix=f"{settings.api.api_prefix}/missions",
    tags=["Missions"]
)

app.include_router(
    images.router,
    prefix=f"{settings.api.api_prefix}/images",
    tags=["Images"]
)

app.include_router(
    content.router,
    prefix=f"{settings.api.api_prefix}/content",
    tags=["Content Generation"]
)

# ===== 新增：修復 404 錯誤 =====
app.include_router(
    assets.router,
    prefix=f"{settings.api.api_prefix}/assets",
    tags=["Assets"]
)

app.include_router(
    campaign.router,
    prefix=f"{settings.api.api_prefix}/campaign",
    tags=["Campaign"]
)

# ===== 新增：圖片生成基礎設施 =====
app.include_router(
    comfyui.router,
    prefix=f"{settings.api.api_prefix}/comfyui",
    tags=["ComfyUI"]
)

app.include_router(
    prompt.router,
    prefix=f"{settings.api.api_prefix}/prompt",
    tags=["Prompt Engineering"]
)

app.include_router(
    image_generation.router,
    prefix=f"{settings.api.api_prefix}/image-generation",
    tags=["Image Generation"]
)

# ===== 新增：動畫與多媒體 =====
app.include_router(
    animation.router,
    prefix=f"{settings.api.api_prefix}/animation",
    tags=["Animation"]
)

app.include_router(
    sound.router,
    prefix=f"{settings.api.api_prefix}/sound",
    tags=["Sound Effects"]
)

app.include_router(
    voice.router,
    prefix=f"{settings.api.api_prefix}/voice",
    tags=["Voice Generation"]
)

# ===== 新增：RAG 系統 =====
app.include_router(
    rag.router,
    prefix=f"{settings.api.api_prefix}/rag",
    tags=["RAG"]
)

# ===== 新增：NPC 生成系統 =====
app.include_router(
    npc.router,
    prefix=f"{settings.api.api_prefix}/npc",
    tags=["NPC Generation"]
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "api": settings.api.api_prefix,
    }
