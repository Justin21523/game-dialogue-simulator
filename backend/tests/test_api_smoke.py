import pytest
import pytest_asyncio
import httpx
from contextlib import asynccontextmanager


class StubDialogueAgent:
    async def generate_dialogue(self, request):
        return "stub dialogue"


class StubDispatcherAgent:
    async def recommend_dispatch(self, request):
        class _Rec:
            recommended_character = "jett"
            confidence = 0.9
            reasoning = "stub"
            alternative = None
            mission_tips = []
            explanation = "stub explanation"
        return _Rec()


@pytest_asyncio.fixture
async def async_client(monkeypatch):
    # Stub agents to avoid real model loads
    monkeypatch.setenv("RAG_AUTO_INDEX", "False")
    monkeypatch.setenv("LLM_PRELOAD", "False")
    monkeypatch.setattr(
        "backend.api.routers.dialogue.get_dialogue_agent",
        lambda **kwargs: StubDialogueAgent(),
    )
    monkeypatch.setattr(
        "backend.api.routers.dispatch.get_dispatcher_agent",
        lambda **kwargs: StubDispatcherAgent(),
    )
    # Reload app with updated env settings
    import importlib
    import backend.config as cfg
    import backend.main as main_mod

    importlib.reload(cfg)
    importlib.reload(main_mod)
    local_app = main_mod.create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    local_app.router.lifespan_context = _noop_lifespan

    transport = httpx.ASGITransport(app=local_app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    try:
        yield client
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_health(async_client):
    resp = await async_client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_dialogue_generate(async_client):
    payload = {
        "character_id": "jett",
        "dialogue_type": "greeting",
        "situation": "start mission",
        "location": "Paris",
        "problem": "deliver gift"
    }
    resp = await async_client.post("/api/v1/dialogue/generate", json=payload)
    assert resp.status_code == 200
    assert resp.json()["dialogue"] == "stub dialogue"


@pytest.mark.asyncio
async def test_dispatch_recommend(async_client):
    payload = {
        "mission_type": "delivery",
        "location": "Paris",
        "problem_description": "deliver a cake",
        "urgency": "normal"
    }
    resp = await async_client.post("/api/v1/dispatch/recommend", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["recommended_character"] == "jett"
    assert body["confidence"] > 0
