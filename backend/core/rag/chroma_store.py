"""
ChromaDB Vector Store for Super Wings Simulator RAG.
Provides high-quality vector storage and retrieval.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field

import chromadb
from chromadb.config import Settings as ChromaSettings
from chromadb.utils import embedding_functions

logger = logging.getLogger(__name__)


@dataclass
class Document:
    """Document structure for RAG."""
    id: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[List[float]] = None


@dataclass
class SearchResult:
    """Search result structure."""
    document: Document
    score: float
    rank: int


class ChromaVectorStore:
    """
    ChromaDB-based vector store for game knowledge retrieval.
    Supports persistent storage and semantic search.
    """

    def __init__(
        self,
        persist_directory: str = "./data/chroma_db",
        collection_name: str = "super_wings_knowledge",
        embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    ):
        self.persist_directory = Path(persist_directory)
        self.collection_name = collection_name
        self.embedding_model_name = embedding_model

        # Ensure persist directory exists
        self.persist_directory.mkdir(parents=True, exist_ok=True)

        # Initialize ChromaDB client
        self._client = chromadb.PersistentClient(
            path=str(self.persist_directory),
            settings=ChromaSettings(
                anonymized_telemetry=False,
                allow_reset=True,
            )
        )

        # Initialize embedding function
        self._embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=embedding_model
        )

        # Get or create collection
        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            embedding_function=self._embedding_fn,
            metadata={"hnsw:space": "cosine"}
        )

        logger.info(
            f"ChromaDB initialized: collection={collection_name}, "
            f"documents={self._collection.count()}"
        )

    @property
    def count(self) -> int:
        """Get number of documents in collection."""
        return self._collection.count()

    def add_documents(
        self,
        documents: List[Document],
        batch_size: int = 100,
    ) -> int:
        """
        Add documents to the vector store.

        Args:
            documents: List of documents to add
            batch_size: Batch size for adding

        Returns:
            Number of documents added
        """
        if not documents:
            return 0

        added = 0
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]

            ids = [doc.id for doc in batch]
            contents = [doc.content for doc in batch]
            metadatas = [doc.metadata for doc in batch]

            self._collection.add(
                ids=ids,
                documents=contents,
                metadatas=metadatas,
            )
            added += len(batch)

        logger.info(f"Added {added} documents to collection {self.collection_name}")
        return added

    def add_document(self, document: Document) -> None:
        """Add a single document."""
        self.add_documents([document])

    def update_document(self, document: Document) -> None:
        """Update an existing document."""
        self._collection.update(
            ids=[document.id],
            documents=[document.content],
            metadatas=[document.metadata],
        )

    def delete_document(self, document_id: str) -> None:
        """Delete a document by ID."""
        self._collection.delete(ids=[document_id])

    def delete_by_metadata(self, where: Dict[str, Any]) -> None:
        """Delete documents matching metadata filter."""
        self._collection.delete(where=where)

    def search(
        self,
        query: str,
        top_k: int = 5,
        where: Optional[Dict[str, Any]] = None,
        where_document: Optional[Dict[str, Any]] = None,
        min_score: float = 0.0,
    ) -> List[SearchResult]:
        """
        Search for similar documents.

        Args:
            query: Search query text
            top_k: Number of results to return
            where: Metadata filter
            where_document: Document content filter
            min_score: Minimum similarity score (0-1, higher is more similar)

        Returns:
            List of search results
        """
        results = self._collection.query(
            query_texts=[query],
            n_results=top_k,
            where=where,
            where_document=where_document,
            include=["documents", "metadatas", "distances"],
        )

        search_results = []
        if results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                # ChromaDB returns distances, convert to similarity score
                # For cosine distance: similarity = 1 - distance
                distance = results["distances"][0][i] if results["distances"] else 0
                score = 1.0 - distance  # Convert distance to similarity

                if score >= min_score:
                    doc = Document(
                        id=doc_id,
                        content=results["documents"][0][i] if results["documents"] else "",
                        metadata=results["metadatas"][0][i] if results["metadatas"] else {},
                    )
                    search_results.append(SearchResult(
                        document=doc,
                        score=score,
                        rank=i + 1,
                    ))

        return search_results

    def search_with_embeddings(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        where: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        """Search using pre-computed embedding."""
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        search_results = []
        if results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                distance = results["distances"][0][i] if results["distances"] else 0
                score = 1.0 - distance

                doc = Document(
                    id=doc_id,
                    content=results["documents"][0][i] if results["documents"] else "",
                    metadata=results["metadatas"][0][i] if results["metadatas"] else {},
                )
                search_results.append(SearchResult(
                    document=doc,
                    score=score,
                    rank=i + 1,
                ))

        return search_results

    def get_document(self, document_id: str) -> Optional[Document]:
        """Get a document by ID."""
        results = self._collection.get(
            ids=[document_id],
            include=["documents", "metadatas"],
        )

        if results["ids"]:
            return Document(
                id=results["ids"][0],
                content=results["documents"][0] if results["documents"] else "",
                metadata=results["metadatas"][0] if results["metadatas"] else {},
            )
        return None

    def get_all_documents(
        self,
        limit: int = 1000,
        offset: int = 0,
        where: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        """Get all documents (with optional filtering)."""
        results = self._collection.get(
            limit=limit,
            offset=offset,
            where=where,
            include=["documents", "metadatas"],
        )

        documents = []
        if results["ids"]:
            for i, doc_id in enumerate(results["ids"]):
                doc = Document(
                    id=doc_id,
                    content=results["documents"][i] if results["documents"] else "",
                    metadata=results["metadatas"][i] if results["metadatas"] else {},
                )
                documents.append(doc)

        return documents

    def clear(self) -> None:
        """Clear all documents from collection."""
        # Delete and recreate collection
        self._client.delete_collection(self.collection_name)
        self._collection = self._client.create_collection(
            name=self.collection_name,
            embedding_function=self._embedding_fn,
            metadata={"hnsw:space": "cosine"}
        )
        logger.info(f"Cleared collection {self.collection_name}")

    def get_stats(self) -> Dict[str, Any]:
        """Get collection statistics."""
        return {
            "collection_name": self.collection_name,
            "document_count": self.count,
            "persist_directory": str(self.persist_directory),
            "embedding_model": self.embedding_model_name,
        }


# Singleton instances for different collections
_stores: Dict[str, ChromaVectorStore] = {}


def get_vector_store(
    collection_name: Optional[str] = None,
    **kwargs
) -> ChromaVectorStore:
    """Get or create vector store singleton."""
    global _stores

    from ...config import get_settings
    settings = get_settings()

    name = collection_name or settings.rag.collection_name

    if name not in _stores:
        _stores[name] = ChromaVectorStore(
            persist_directory=kwargs.get("persist_directory", settings.rag.chroma_persist_dir),
            collection_name=name,
            embedding_model=kwargs.get("embedding_model", settings.rag.embedding_model),
        )

    return _stores[name]


def get_character_store() -> ChromaVectorStore:
    """Get character knowledge store."""
    return get_vector_store(collection_name="super_wings_characters")


def get_location_store() -> ChromaVectorStore:
    """Get location knowledge store."""
    return get_vector_store(collection_name="super_wings_locations")


def get_mission_store() -> ChromaVectorStore:
    """Get mission knowledge store."""
    return get_vector_store(collection_name="super_wings_missions")


def get_npc_store() -> ChromaVectorStore:
    """Get NPC knowledge store."""
    return get_vector_store(collection_name="super_wings_npcs")


def get_event_store() -> ChromaVectorStore:
    """Get event knowledge store."""
    return get_vector_store(collection_name="super_wings_events")


def get_tutorial_store() -> ChromaVectorStore:
    """Get tutorial knowledge store."""
    return get_vector_store(collection_name="super_wings_tutorials")


def get_achievement_store() -> ChromaVectorStore:
    """Get achievement knowledge store."""
    return get_vector_store(collection_name="super_wings_achievements")


def get_mechanics_store() -> ChromaVectorStore:
    """Get game mechanics knowledge store."""
    return get_vector_store(collection_name="super_wings_mechanics")
