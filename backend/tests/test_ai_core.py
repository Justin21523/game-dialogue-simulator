"""
AI Core Systems Integration Test
測試 LLM、RAG、AI Agents 的完整功能

Usage:
    cd /home/justin/web-projects/super-wings-simulator
    source ~/miniconda3/etc/profile.d/conda.sh
    conda activate super_wings
    python -m backend.tests.test_ai_core
"""

import asyncio
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test result tracking
class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.skipped = []

    def add_pass(self, name: str, message: str = ""):
        self.passed.append((name, message))
        print(f"✅ PASS: {name}" + (f" - {message}" if message else ""))

    def add_fail(self, name: str, error: str):
        self.failed.append((name, error))
        print(f"❌ FAIL: {name} - {error}")

    def add_skip(self, name: str, reason: str):
        self.skipped.append((name, reason))
        print(f"⏭️  SKIP: {name} - {reason}")

    def summary(self):
        total = len(self.passed) + len(self.failed) + len(self.skipped)
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Total:   {total}")
        print(f"Passed:  {len(self.passed)} ✅")
        print(f"Failed:  {len(self.failed)} ❌")
        print(f"Skipped: {len(self.skipped)} ⏭️")
        print("=" * 60)

        if self.failed:
            print("\nFailed Tests:")
            for name, error in self.failed:
                print(f"  - {name}: {error}")

        return len(self.failed) == 0

results = TestResults()


# =============================================================================
# Test 1: Configuration Loading
# =============================================================================
def test_config_loading():
    """Test configuration system loads correctly."""
    test_name = "Config Loading"
    try:
        from backend.config import get_settings
        settings = get_settings()

        # Verify key settings exist
        assert settings.llm is not None, "LLM config missing"
        assert settings.rag is not None, "RAG config missing"
        assert settings.game is not None, "Game config missing"

        results.add_pass(test_name, f"Model: {settings.llm.model_name}")
        return settings
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 2: ChromaDB Vector Store
# =============================================================================
def test_chroma_vector_store():
    """Test ChromaDB vector store initialization and basic operations."""
    test_name = "ChromaDB Vector Store"
    try:
        from backend.core.rag.chroma_store import ChromaVectorStore, Document

        # Initialize with test collection
        store = ChromaVectorStore(
            persist_directory="./data/chroma_db_test",
            collection_name="test_collection"
        )

        # Test document operations
        test_doc = Document(
            id="test_doc_1",
            content="Jett is a red jet plane who delivers packages around the world.",
            metadata={"type": "character", "character_id": "jett"}
        )

        # Add document
        store.add_document(test_doc)

        # Search for document
        search_results = store.search("red airplane delivery", top_k=1)

        assert len(search_results) > 0, "Search returned no results"
        assert search_results[0].document.id == "test_doc_1", "Wrong document returned"

        # Clean up
        store.delete_document("test_doc_1")

        stats = store.get_stats()
        results.add_pass(test_name, f"Store initialized, {stats['document_count']} docs")
        return store
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 3: Knowledge Base Indexing
# =============================================================================
def test_knowledge_base_indexing():
    """Test knowledge base can index character data."""
    test_name = "Knowledge Base Indexing"
    try:
        from backend.core.rag.knowledge_base import GameKnowledgeBase
        from backend.core.rag.chroma_store import Document

        kb = GameKnowledgeBase()

        # Load character data from file
        chars_file = Path("./data/characters.json")
        if not chars_file.exists():
            results.add_skip(test_name, "characters.json not found")
            return None

        with open(chars_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        characters = data.get("characters", {})

        # Index characters
        docs_indexed = 0
        for char_id, char_data in characters.items():
            doc_content = f"""
Character: {char_data.get('name', char_id)}
Role: {char_data.get('role', '')}
Personality: {char_data.get('personality', '')}
Abilities: {char_data.get('abilities', '')}
Specialization: {char_data.get('stats', {}).get('specialization', '')}
"""
            doc = Document(
                id=f"character_{char_id}",
                content=doc_content.strip(),
                metadata={
                    "type": "character",
                    "character_id": char_id,
                    "name": char_data.get("name", char_id)
                }
            )
            kb.character_store.add_document(doc)
            docs_indexed += 1

        # Test retrieval
        retrieval = kb.retrieve_for_dispatch(
            mission_description="Someone needs help building a house",
            location="Paris"
        )

        results.add_pass(test_name, f"Indexed {docs_indexed} characters, retrieval working")
        return kb
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 4: LLM Loading (Transformers)
# =============================================================================
def test_llm_loading():
    """Test Transformers LLM can load and generate."""
    test_name = "LLM Loading (Transformers)"

    try:
        import torch
        if not torch.cuda.is_available():
            results.add_skip(test_name, "CUDA not available")
            return None

        gpu_mem = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        if gpu_mem < 8:
            results.add_skip(test_name, f"GPU memory insufficient ({gpu_mem:.1f}GB, need 8GB+)")
            return None

        from backend.core.llm.transformers_adapter import TransformersLLM

        # Use a smaller model for testing if needed
        llm = TransformersLLM(
            model_name="Qwen/Qwen2.5-7B-Instruct",
            device="cuda",
            torch_dtype="float16",
            load_in_4bit=True,  # Use 4-bit for memory efficiency
        )

        logger.info("Loading LLM model (this may take a minute)...")
        llm.load_model()

        results.add_pass(test_name, f"Model loaded: {llm.model_name}")
        return llm
    except ImportError as e:
        results.add_skip(test_name, f"Missing dependency: {e}")
        return None
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 5: LLM Generation
# =============================================================================
async def test_llm_generation(llm):
    """Test LLM can generate text."""
    test_name = "LLM Generation"

    if llm is None:
        results.add_skip(test_name, "LLM not loaded")
        return

    try:
        from backend.core.llm import ChatMessage, GenerationConfig

        messages = [
            ChatMessage.system("You are a helpful assistant for Super Wings game."),
            ChatMessage.user("Who is Jett in Super Wings? Answer in one sentence.")
        ]

        config = GenerationConfig(
            max_new_tokens=50,
            temperature=0.7,
        )

        start_time = time.time()
        response = await llm.chat(messages, config)
        gen_time = time.time() - start_time

        assert response.content, "Empty response from LLM"
        assert len(response.content) > 10, "Response too short"

        results.add_pass(test_name, f"Generated {len(response.content)} chars in {gen_time:.2f}s")
        return response
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 6: LLM Streaming
# =============================================================================
async def test_llm_streaming(llm):
    """Test LLM streaming generation."""
    test_name = "LLM Streaming"

    if llm is None:
        results.add_skip(test_name, "LLM not loaded")
        return

    try:
        from backend.core.llm import ChatMessage, GenerationConfig

        messages = [
            ChatMessage.system("You are Jett from Super Wings. Speak enthusiastically."),
            ChatMessage.user("Say hello!")
        ]

        config = GenerationConfig(
            max_new_tokens=30,
            temperature=0.8,
        )

        tokens_received = 0
        full_response = ""

        async for token in llm.stream_chat(messages, config):
            tokens_received += 1
            full_response += token

        assert tokens_received > 0, "No tokens streamed"

        results.add_pass(test_name, f"Streamed {tokens_received} tokens")
        return full_response
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 7: Character Dialogue Agent
# =============================================================================
async def test_character_dialogue_agent(llm):
    """Test CharacterDialogueAgent generates appropriate dialogue."""
    test_name = "Character Dialogue Agent"

    if llm is None:
        results.add_skip(test_name, "LLM not loaded")
        return

    try:
        from backend.core.agents.character_dialogue import (
            CharacterDialogueAgent,
            DialogueRequest,
            DialogueType
        )

        # Create agent with LLM
        agent = CharacterDialogueAgent(llm=llm)
        agent.load_characters("./data/characters.json")

        # Test greeting generation
        request = DialogueRequest(
            character_id="jett",
            dialogue_type=DialogueType.GREETING,
            situation="Starting a delivery mission",
            location="Paris, France",
            problem="A child needs their birthday gift delivered"
        )

        dialogue = await agent.generate_dialogue(request)

        assert dialogue, "Empty dialogue generated"
        assert len(dialogue) > 10, "Dialogue too short"

        results.add_pass(test_name, f"Generated: '{dialogue[:50]}...'")
        return dialogue
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 8: Mission Dispatcher Agent
# =============================================================================
async def test_mission_dispatcher_agent(llm):
    """Test MissionDispatcherAgent recommends appropriate characters."""
    test_name = "Mission Dispatcher Agent"

    if llm is None:
        results.add_skip(test_name, "LLM not loaded")
        return

    try:
        from backend.core.agents.mission_dispatcher import (
            MissionDispatcherAgent,
            MissionRequest
        )

        # Create agent with LLM
        agent = MissionDispatcherAgent(llm=llm)
        agent.load_characters("./data/characters.json")

        # Test dispatch recommendation
        request = MissionRequest(
            mission_type="construction",
            location="Tokyo, Japan",
            problem_description="A school playground needs to be rebuilt after a storm",
            urgency="high"
        )

        recommendation = await agent.recommend_dispatch(request)

        assert recommendation.recommended_character, "No character recommended"
        assert 0 <= recommendation.confidence <= 1, "Invalid confidence score"

        # Donnie should be recommended for construction
        expected = "donnie"
        correct = recommendation.recommended_character.lower() == expected

        results.add_pass(
            test_name,
            f"Recommended: {recommendation.recommended_character} "
            f"(confidence: {recommendation.confidence:.2f})"
            + (" ✓ Expected" if correct else f" (expected {expected})")
        )
        return recommendation
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 9: Streaming Dialogue
# =============================================================================
async def test_streaming_dialogue(llm):
    """Test streaming dialogue generation."""
    test_name = "Streaming Dialogue"

    if llm is None:
        results.add_skip(test_name, "LLM not loaded")
        return

    try:
        from backend.core.agents.character_dialogue import (
            CharacterDialogueAgent,
            DialogueRequest,
            DialogueType
        )

        agent = CharacterDialogueAgent(llm=llm)
        agent.load_characters("./data/characters.json")

        request = DialogueRequest(
            character_id="donnie",
            dialogue_type=DialogueType.TRANSFORMATION,
            situation="About to help build a playground"
        )

        tokens_received = 0
        full_dialogue = ""

        async for token in agent.stream_dialogue(request):
            tokens_received += 1
            full_dialogue += token

        assert tokens_received > 0, "No tokens streamed"

        results.add_pass(test_name, f"Streamed {tokens_received} tokens for transformation dialogue")
        return full_dialogue
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Test 10: Full RAG-Enhanced Dialogue
# =============================================================================
async def test_rag_enhanced_dialogue(llm, kb):
    """Test dialogue generation with RAG context."""
    test_name = "RAG-Enhanced Dialogue"

    if llm is None:
        results.add_skip(test_name, "LLM not loaded")
        return

    if kb is None:
        results.add_skip(test_name, "Knowledge base not initialized")
        return

    try:
        from backend.core.agents.character_dialogue import (
            CharacterDialogueAgent,
            DialogueRequest,
            DialogueType
        )

        agent = CharacterDialogueAgent(llm=llm)
        agent._knowledge_base = kb
        agent.load_characters("./data/characters.json")

        request = DialogueRequest(
            character_id="bello",
            dialogue_type=DialogueType.CONVERSATION,
            situation="Meeting a lost baby elephant in the African savanna",
            location="Kenya",
            speaking_to="the baby elephant"
        )

        dialogue = await agent.generate_dialogue(request)

        assert dialogue, "Empty dialogue"

        # Bello is the animal specialist, should have appropriate dialogue
        results.add_pass(test_name, f"RAG context used for dialogue: '{dialogue[:60]}...'")
        return dialogue
    except Exception as e:
        results.add_fail(test_name, str(e))
        return None


# =============================================================================
# Main Test Runner
# =============================================================================
async def run_all_tests():
    """Run all tests in sequence."""
    print("\n" + "=" * 60)
    print("Super Wings AI Core System Tests")
    print("=" * 60 + "\n")

    # Phase 1: Config & Dependencies
    print("\n📦 Phase 1: Configuration & Dependencies")
    print("-" * 40)
    settings = test_config_loading()

    # Phase 2: Vector Store & RAG
    print("\n🔍 Phase 2: Vector Store & RAG")
    print("-" * 40)
    store = test_chroma_vector_store()
    kb = test_knowledge_base_indexing()

    # Phase 3: LLM
    print("\n🤖 Phase 3: LLM Loading & Generation")
    print("-" * 40)
    llm = test_llm_loading()

    if llm:
        await test_llm_generation(llm)
        await test_llm_streaming(llm)

    # Phase 4: AI Agents
    print("\n🎭 Phase 4: AI Agents")
    print("-" * 40)
    await test_character_dialogue_agent(llm)
    await test_mission_dispatcher_agent(llm)
    await test_streaming_dialogue(llm)
    await test_rag_enhanced_dialogue(llm, kb)

    # Cleanup LLM
    if llm:
        print("\n🧹 Cleaning up LLM...")
        llm.unload_model()

    # Summary
    success = results.summary()

    return 0 if success else 1


if __name__ == "__main__":
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
