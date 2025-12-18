import pytest

from backend.core.llm import get_generation_profile, list_generation_profiles, GenerationConfig


def test_profiles_list_contains_expected():
    profiles = list_generation_profiles()
    assert "default" in profiles
    assert "concise" in profiles
    assert "creative" in profiles


@pytest.mark.parametrize("name,expected_max", [
    ("default", 256),
    ("concise", 80),
    ("longform", 600),
])
def test_generation_profile_values(name, expected_max):
    cfg = get_generation_profile(name)
    assert isinstance(cfg, GenerationConfig)
    assert cfg.max_length == expected_max
    # Ensure we get a fresh instance each time
    cfg.temperature += 0.1
    cfg2 = get_generation_profile(name)
    assert cfg2.temperature != cfg.temperature


def test_unknown_profile_falls_back_to_default():
    cfg = get_generation_profile("unknown_profile_name")
    assert cfg.max_length == get_generation_profile("default").max_length
