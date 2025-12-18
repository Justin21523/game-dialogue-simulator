"""
RAG module for Super Wings Simulator.
Provides ChromaDB-based vector storage and retrieval.
"""

from .chroma_store import (
    ChromaVectorStore,
    Document,
    SearchResult,
    get_vector_store,
    get_character_store,
    get_location_store,
    get_mission_store,
    get_npc_store,
    get_event_store,
)
from .knowledge_base import (
    GameKnowledgeBase,
    RetrievalContext,
    get_knowledge_base,
)

__all__ = [
    # Vector Store
    "ChromaVectorStore",
    "Document",
    "SearchResult",
    "get_vector_store",
    "get_character_store",
    "get_location_store",
    "get_mission_store",
    "get_npc_store",
    "get_event_store",
    # Knowledge Base
    "GameKnowledgeBase",
    "RetrievalContext",
    "get_knowledge_base",
]
