import os


def pytest_configure(config):
    # Silence known deprecation about TRANSFORMERS_CACHE in transformers>=4.56
    config.addinivalue_line(
        "filterwarnings",
        "ignore:Using `TRANSFORMERS_CACHE` is deprecated:FutureWarning",
    )
    # Silence CUDA availability warnings in CPU-only test environments
    config.addinivalue_line(
        "filterwarnings",
        "ignore:CUDA initialization.*cudaGetDeviceCount.*:UserWarning",
    )
    # Silence joblib permission warnings from temp dir issues
    config.addinivalue_line(
        "filterwarnings",
        "ignore:.*joblib will operate in serial mode.*:UserWarning",
    )
    # Prefer HF_HOME to avoid triggering the warning; fall back to local cache if unset
    os.environ.setdefault("HF_HOME", os.environ.get("TRANSFORMERS_CACHE", "./.cache/huggingface"))


# ---------------------------------------------------------------------------
# Common test utilities / fixtures
# ---------------------------------------------------------------------------
class DummyChatResponse:
    def __init__(self, content: str):
        self.content = content


class DummyLLM:
    """
    Lightweight async stub to avoid loading real models in tests.
    """

    def __init__(self, reply: str = "stubbed response"):
        self.reply = reply
        self._loaded = True
        self._model = None

    @property
    def is_loaded(self):
        return True

    async def chat(self, messages, config=None, **kwargs):
        return DummyChatResponse(self.reply)

    async def stream_chat(self, messages, config=None, **kwargs):
        # Yield tokenized words to mimic streaming
        for token in self.reply.split():
            yield token

    def unload_model(self):
        self._loaded = False


def pytest_unconfigure(config):
    """
    Reset globals that might have been changed by tests to avoid leaking state.
    """
    try:
        from backend.core.rag.chroma_store import _stores
        _stores.clear()
    except Exception:
        pass
    try:
        from backend.core.rag import knowledge_base
        knowledge_base._knowledge_base = None
    except Exception:
        pass
