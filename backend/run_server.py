#!/usr/bin/env python3
"""
Super Wings Simulator API Server
啟動 FastAPI 後端服務

Usage:
    cd /home/justin/web-projects/super-wings-simulator
    source ~/miniconda3/etc/profile.d/conda.sh
    conda activate super_wings
    python backend/run_server.py
"""

import os
import sys
import logging

# Set environment variables for AI_WAREHOUSE 3.0 structure
os.environ.setdefault('HF_HOME', '/mnt/c/ai_cache/huggingface')
os.environ.setdefault('TRANSFORMERS_CACHE', '/mnt/c/ai_cache/huggingface')
os.environ.setdefault('TORCH_HOME', '/mnt/c/ai_cache/torch')
os.environ.setdefault('XDG_CACHE_HOME', '/mnt/c/ai_cache')

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uvicorn
from backend.config import get_settings


def setup_logging():
    """Configure logging."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
        ]
    )


def preload_models():
    """Optionally preload LLM model."""
    settings = get_settings()

    if settings.llm.preload:
        print("🔄 Preloading LLM model...")
        from backend.core.llm import get_llm
        llm = get_llm()
        llm.load_model()
        print("✅ LLM model loaded!")


def main():
    """Run the API server."""
    setup_logging()
    settings = get_settings()

    print("=" * 60)
    print("Super Wings Simulator API Server")
    print("=" * 60)
    print(f"Environment: {settings.api.environment}")
    print(f"LLM Model: {settings.llm.model_name}")
    print(f"API Prefix: {settings.api.api_prefix}")
    print(f"API URL: http://{settings.api.host}:{settings.api.port}")
    print("=" * 60)

    # Optionally preload models
    preload_models()

    # Index knowledge base
    if settings.rag.auto_index:
        print("📚 Indexing knowledge base...")
        try:
            from backend.core.rag import get_knowledge_base
            kb = get_knowledge_base()
            kb.index_all()
            print("✅ Knowledge base indexed!")
        except Exception as e:
            print(f"⚠️ Knowledge base indexing skipped: {e}")

    # Run server
    print("\n🚀 Starting server...")
    uvicorn.run(
        "backend.main:app",
        host=settings.api.host,
        port=settings.api.port,
        reload=settings.api.debug or settings.api.environment == "development",
        log_level="info" if settings.api.debug else "warning",
    )


if __name__ == "__main__":
    main()
