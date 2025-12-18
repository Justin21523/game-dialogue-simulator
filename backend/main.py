"""
FastAPI Main Entry Point for Super Wings Simulator Backend.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .api.routers import (
    health,
    missions,
    characters,
    dialogue,
    tutorial,
    progress,
    dispatch,
    events,
    narration,
    comfyui,
    prompt,
    image_generation,
    voice,
    sound,
    animation,
    assets,
    campaign,
    npc,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    settings = get_settings()
    logger.info(f"Starting Super Wings Simulator Backend")
    logger.info(f"Environment: {settings.api.environment}")

    # Initialize services on startup
    if settings.rag.auto_index:
        try:
            from .core.rag import get_knowledge_base
            kb = get_knowledge_base()
            indexed = kb.index_all()
            logger.info(f"Knowledge base indexed: {indexed}")
        except Exception as e:
            logger.warning(f"Knowledge base indexing failed: {e}")

    # Pre-load LLM if configured
    if settings.llm.preload:
        try:
            from .core.llm import get_llm
            llm = get_llm()
            logger.info(f"LLM pre-loaded: {settings.llm.model_name}")
        except Exception as e:
            logger.warning(f"LLM pre-loading failed: {e}")

    yield

    # Cleanup on shutdown
    logger.info("Shutting down Super Wings Simulator Backend")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    api_prefix = settings.api.api_prefix.rstrip("/")

    app = FastAPI(
        title="Super Wings Simulator API",
        description="LLM-powered backend for Super Wings Simulator game",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.api.environment != "production" else None,
        redoc_url="/redoc" if settings.api.environment != "production" else None,
    )
    logger.info(f"API prefix set to {api_prefix or '/'}")

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(health.router, prefix=f"{api_prefix}/health", tags=["Health"])
    app.include_router(missions.router, prefix=f"{api_prefix}/missions", tags=["Missions"])
    app.include_router(characters.router, prefix=f"{api_prefix}/characters", tags=["Characters"])
    app.include_router(dialogue.router, prefix=f"{api_prefix}/dialogue", tags=["Dialogue"])
    app.include_router(tutorial.router, prefix=f"{api_prefix}/tutorial", tags=["Tutorial"])
    app.include_router(progress.router, prefix=f"{api_prefix}/progress", tags=["Progress"])
    app.include_router(dispatch.router, prefix=f"{api_prefix}/dispatch", tags=["Dispatch"])
    app.include_router(events.router, prefix=f"{api_prefix}/events", tags=["Events"])
    app.include_router(narration.router, prefix=f"{api_prefix}/narration", tags=["Narration"])
    app.include_router(comfyui.router, prefix=f"{api_prefix}/comfyui", tags=["ComfyUI"])
    app.include_router(prompt.router, prefix=f"{api_prefix}/prompt", tags=["Prompt Engineering"])
    app.include_router(image_generation.router, prefix=f"{api_prefix}/image", tags=["Image Generation"])
    app.include_router(voice.router, prefix=f"{api_prefix}/voice", tags=["Voice Generation"])
    app.include_router(sound.router, prefix=f"{api_prefix}/sound", tags=["Sound Effects"])
    app.include_router(animation.router, prefix=f"{api_prefix}/animation", tags=["Animation"])
    app.include_router(assets.router, prefix=f"{api_prefix}/assets", tags=["Asset Packaging"])
    app.include_router(campaign.router, prefix=f"{api_prefix}/campaign", tags=["Campaigns"])
    app.include_router(npc.router, prefix=f"{api_prefix}/npc", tags=["NPC Generation"])
    # Additional content/image utility routers
    try:
        from .api.routers import images, content
        app.include_router(images.router, prefix=f"{api_prefix}/images", tags=["Images"])
        app.include_router(content.router, prefix=f"{api_prefix}/content", tags=["Content"])
    except Exception as e:  # pragma: no cover - defensive import
        logger.warning(f"Optional routers failed to load: {e}")

    @app.get("/")
    async def root():
        """Root endpoint."""
        return {
            "name": "Super Wings Simulator API",
            "version": "1.0.0",
            "status": "running",
            "api_prefix": api_prefix or "/",
        }

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "backend.main:app",
        host=settings.api.host,
        port=settings.api.port,
        reload=settings.api.environment == "development",
    )
