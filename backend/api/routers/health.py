"""
Health check router for Super Wings Simulator.
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ...config import get_settings
from pathlib import Path
import json

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
@router.get("/")
async def health_check() -> Dict[str, Any]:
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "service": "super-wings-simulator",
    }


@router.get("/detailed")
async def detailed_health_check() -> Dict[str, Any]:
    """Detailed health check with component status."""
    settings = get_settings()
    components = {}

    # Check LLM
    try:
        from ...core.llm import get_llm
        llm = get_llm()
        components["llm"] = {
            "status": "healthy",
            "model": settings.llm.model_name,
            "loaded": llm._model is not None if hasattr(llm, '_model') else False,
        }
    except Exception as e:
        components["llm"] = {
            "status": "unhealthy",
            "error": str(e),
        }

    # Check RAG/Knowledge Base
    try:
        from ...core.rag import get_knowledge_base
        kb = get_knowledge_base()
        stats = kb.get_stats()
        components["knowledge_base"] = {
            "status": "healthy",
            "stats": stats,
        }
    except Exception as e:
        components["knowledge_base"] = {
            "status": "unhealthy",
            "error": str(e),
        }

    # Check Vector Store
    try:
        from ...core.rag import get_vector_store
        store = get_vector_store()
        components["vector_store"] = {
            "status": "healthy",
            "collection": store.collection_name,
            "document_count": store.count,
        }
    except Exception as e:
        components["vector_store"] = {
            "status": "unhealthy",
            "error": str(e),
        }

    # Validate RAG schemas (lightweight existence + key checks)
    def _validate_schema() -> Dict[str, Any]:
        try:
            base = Path("./backend/data/knowledge")
            required_files = [
                base / "locations.json",
                base / "mission_types.json",
                base / "tutorials.json",
                Path(settings.game.characters_file),
            ]
            missing = [str(p) for p in required_files if not p.exists()]
            if missing:
                return {"status": "unhealthy", "error": f"Missing files: {', '.join(missing)}"}

            # Basic key checks
            with open(settings.game.characters_file, "r", encoding="utf-8") as f:
                chars = json.load(f)
            if not isinstance(chars.get("characters"), dict) or not chars["characters"]:
                return {"status": "unhealthy", "error": "characters.json missing 'characters' entries"}

            with open(base / "locations.json", "r", encoding="utf-8") as f:
                loc = json.load(f)
            if not isinstance(loc.get("locations"), dict):
                return {"status": "unhealthy", "error": "locations.json missing 'locations' object"}

            return {"status": "healthy", "files_checked": len(required_files)}
        except Exception as e:  # pragma: no cover - defensive
            return {"status": "unhealthy", "error": str(e)}

    components["rag_schema"] = _validate_schema()

    # Overall status
    all_healthy = all(
        c.get("status") == "healthy"
        for c in components.values()
    )

    return {
        "status": "healthy" if all_healthy else "degraded",
        "service": "super-wings-simulator",
        "environment": settings.api.environment,
        "api_prefix": settings.api.api_prefix,
        "components": components,
    }


@router.get("/ready")
async def readiness_check() -> Dict[str, str]:
    """
    Readiness check for container orchestration.
    Returns 200 if the service is ready to accept traffic.
    """
    settings = get_settings()

    # For production, check critical components
    if settings.api.environment == "production":
        try:
            from ...core.llm import get_llm
            llm = get_llm()
            if llm._model is None:
                raise HTTPException(status_code=503, detail="LLM not loaded")
        except ImportError:
            pass  # LLM not required for readiness

    return {"status": "ready"}


@router.get("/live")
async def liveness_check() -> Dict[str, str]:
    """
    Liveness check for container orchestration.
    Returns 200 if the service is alive.
    """
    return {"status": "alive"}
