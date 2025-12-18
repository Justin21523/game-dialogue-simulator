import json
from pathlib import Path

import pytest

from backend.tests.conftest import DummyLLM


@pytest.fixture(autouse=True)
def reset_rag_globals(monkeypatch, tmp_path):
    """
    Isolate Chroma stores to a temp directory and reset singletons.
    """
    from backend.core.rag import chroma_store, knowledge_base
    chroma_store._stores.clear()
    knowledge_base._knowledge_base = None

    chroma_dir = tmp_path / "chroma"
    chroma_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("RAG_CHROMA_PERSIST_DIR", str(chroma_dir))
    monkeypatch.setenv("RAG_AUTO_INDEX", "True")
    # Patch ChromaVectorStore to an in-memory fake to avoid SQLite/embedding dependencies
    from backend.core.rag.chroma_store import Document, SearchResult

    class _FakeStore:
        def __init__(self, persist_directory=None, collection_name=None, embedding_model=None):
            self.docs = {}
            self.collection_name = collection_name or "test"

        @property
        def count(self):
            return len(self.docs)

        def add_documents(self, documents, batch_size=100):
            for doc in documents:
                self.docs[doc.id] = doc
            return len(documents)

        def add_document(self, document):
            return self.add_documents([document])

        def search(self, query, top_k=5, where=None, where_document=None, min_score=0.0):
            results = []
            for idx, doc in enumerate(list(self.docs.values())[:top_k]):
                results.append(SearchResult(document=doc, score=1.0, rank=idx + 1))
            return results

        def get_document(self, document_id):
            return self.docs.get(document_id)

        def clear(self):
            self.docs = {}

        def get_stats(self):
            return {"collection_name": self.collection_name, "document_count": self.count}

    monkeypatch.setattr("backend.core.rag.chroma_store.ChromaVectorStore", _FakeStore)
    # Patch embedding function to avoid downloading models
    class _DummyEmbeddingFn:
        def __call__(self, texts):
            return [[0.0] * 10 for _ in texts]

    monkeypatch.setattr(
        "backend.core.rag.chroma_store.embedding_functions.SentenceTransformerEmbeddingFunction",
        lambda model_name=None: _DummyEmbeddingFn(),
    )
    yield
    chroma_store._stores.clear()
    knowledge_base._knowledge_base = None


def test_knowledge_base_index_all(tmp_path, monkeypatch):
    """
    Ensure knowledge base can index all JSON sources into a fresh Chroma store.
    """
    from backend.core.rag.knowledge_base import GameKnowledgeBase

    kb = GameKnowledgeBase(
        characters_file="./data/characters.json",
        knowledge_dir="./backend/data/knowledge",
    )
    results = kb.index_all(force_reindex=True)

    assert results["characters"] > 0
    assert results["locations"] > 0
    assert results["missions"] > 0
    # Ensure collections have stats
    stats = kb.get_stats()
    assert stats["characters"]["document_count"] >= results["characters"]


def _load_characters():
    with open("./data/characters.json", "r", encoding="utf-8") as f:
        return json.load(f)["characters"]


@pytest.mark.asyncio
async def test_dispatch_agent_with_dummy_llm():
    from backend.core.agents.mission_dispatcher import MissionDispatcherAgent, MissionRequest

    agent = MissionDispatcherAgent(llm=DummyLLM('{"recommended_character": "donnie", "confidence": 0.9, "reasoning": "build"}'))
    agent.load_characters("./data/characters.json")

    request = MissionRequest(
        mission_type="construction",
        location="Paris",
        problem_description="A playground needs repairs",
        urgency="high",
    )
    rec = await agent.recommend_dispatch(request)
    assert rec.recommended_character in _load_characters()
    assert rec.confidence >= 0


@pytest.mark.asyncio
async def test_dialogue_agent_with_dummy_llm():
    from backend.core.agents.character_dialogue import CharacterDialogueAgent, DialogueRequest, DialogueType

    agent = CharacterDialogueAgent(llm=DummyLLM("Hi, I'm Jett!"))
    agent.load_characters("./data/characters.json")

    req = DialogueRequest(
        character_id="jett",
        dialogue_type=DialogueType.GREETING,
        situation="Starting mission",
        location="Tokyo",
        problem="Deliver a package",
    )
    text = await agent.generate_dialogue(req)
    assert "Jett" in text or len(text) > 0
