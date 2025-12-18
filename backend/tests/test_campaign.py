import pytest

from backend.api.routers import campaign as campaign_router
from backend.api.routers.campaign import CampaignGenerationRequest, generate_campaign
from backend.core.agents import MissionNarratorAgent, Narration
from backend.config import get_settings


@pytest.fixture(autouse=True)
def disable_auto_index():
    """Prevent heavy knowledge-base indexing during tests."""
    settings = get_settings()
    settings.rag.auto_index = False
    yield


@pytest.fixture(autouse=True)
def stub_narration(monkeypatch):
    """Avoid real LLM calls."""

    async def _stub(self, request, use_llm=True):
        return Narration(
            phase=request.phase,
            text="stub narration",
            character_id=request.character_id,
            location=request.location,
        )

    monkeypatch.setattr(MissionNarratorAgent, "generate_narration", _stub)
    yield


@pytest.fixture(autouse=True)
def deterministic_choice(monkeypatch):
    """Make random.choice deterministic for predictable assertions."""
    monkeypatch.setattr(campaign_router.random, "choice", lambda seq: seq[0])
    yield


@pytest.mark.asyncio
async def test_campaign_generate_respects_length_and_preferred_types():
    request = CampaignGenerationRequest(
        theme="global_warming",
        length=3,
        preferred_types=["Rescue", "Delivery"],
        location_hints=["Paris", "Tokyo"],
    )

    resp = await generate_campaign(request)

    assert resp.mission_count == request.length
    assert len(resp.missions) == request.length

    mission_types = [m.mission_type for m in resp.missions]
    # preferred_types are cycled in order
    assert mission_types[:2] == ["Rescue", "Delivery"]

    for mission in resp.missions:
        assert mission.objectives, "objectives should be present"
        for obj in mission.objectives:
            assert obj.type, "objective type required"
            assert obj.description, "objective description required"
