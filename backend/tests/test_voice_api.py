import pytest

from backend.api.routers.voice import generate_voice, VoiceRequest, _ensure_output_dir
from backend.config import get_settings


@pytest.fixture(autouse=True)
def disable_heavy_startup():
    settings = get_settings()
    settings.rag.auto_index = False
    settings.llm.preload = False
    yield


@pytest.mark.asyncio
async def test_voice_generate_creates_audio_file(tmp_path, monkeypatch):
    # Redirect output to temp to avoid polluting repo
    settings = get_settings()
    monkeypatch.setattr(settings.tts, "output_dir", str(tmp_path / "voices"))

    req = VoiceRequest(text="Hello Super Wings", character_id="jett")
    data = await generate_voice(req)
    assert data["audio_url"].startswith("/api/voice/audio/")

    filename = data["audio_url"].split("/")[-1]
    audio_path = _ensure_output_dir() / filename
    assert audio_path.exists()
