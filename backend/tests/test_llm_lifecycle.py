from unittest.mock import MagicMock, patch

import pytest

from backend.core.llm.transformers_adapter import TransformersLLM


class _DummyTokenizer:
    def __init__(self):
        self.eos_token = "</s>"
        self.pad_token = None
        self.pad_token_id = 0

    def __call__(self, *args, **kwargs):
        return MagicMock()

    def encode(self, text, add_special_tokens=False):
        return [1, 2]

    def decode(self, ids, skip_special_tokens=True):
        return "decoded"

    def apply_chat_template(self, messages, tokenize=False, add_generation_prompt=True):
        return "template"


class _DummyModel:
    def __init__(self, device="cpu"):
        self._device = device
        self.device = device

    def parameters(self):
        yield MagicMock(device=self._device)

    def generate(self, *args, **kwargs):
        return MagicMock()


def test_load_model_cpu_fallback(monkeypatch):
    """
    Ensure the adapter falls back to CPU if the primary load fails.
    """
    load_calls = []

    def fake_from_pretrained(model_name, **kwargs):
        load_calls.append(kwargs.get("device_map"))
        # First call fails, second succeeds
        if len(load_calls) == 1:
            raise RuntimeError("CUDA OOM")
        return _DummyModel(device=kwargs.get("device_map", "cpu"))

    # Patch tokenizer and model loading
    monkeypatch.setattr(
        "backend.core.llm.transformers_adapter.AutoTokenizer.from_pretrained",
        lambda *a, **k: _DummyTokenizer(),
    )
    monkeypatch.setattr(
        "backend.core.llm.transformers_adapter.AutoModelForCausalLM.from_pretrained",
        fake_from_pretrained,
    )

    llm = TransformersLLM(
        model_name="stub-model",
        device="cuda",
        load_in_4bit=True,
        allow_cpu_fallback=True,
        fallback_device="cpu",
    )

    llm.load_model()

    # First attempt may already be CPU if CUDA unavailable; ensure a second retry happens
    assert len(load_calls) >= 2
    assert load_calls[-1] == "cpu" or load_calls[-1] is None
    assert llm.device == "cpu"
    assert llm.is_loaded


def test_auto_device_selects_cpu_when_no_cuda(monkeypatch):
    """
    If device='auto' and CUDA unavailable, model should resolve to CPU without raising.
    """
    monkeypatch.setattr(
        "backend.core.llm.transformers_adapter.AutoTokenizer.from_pretrained",
        lambda *a, **k: _DummyTokenizer(),
    )
    monkeypatch.setattr(
        "backend.core.llm.transformers_adapter.AutoModelForCausalLM.from_pretrained",
        lambda *a, **k: _DummyModel(device="cpu"),
    )
    monkeypatch.setattr(
        "backend.core.llm.transformers_adapter.torch.cuda.is_available",
        lambda: False,
    )

    llm = TransformersLLM(
        model_name="stub-model",
        device="auto",
        allow_cpu_fallback=True,
    )
    llm.load_model()
    assert llm.device == "cpu"
    assert llm.is_loaded


def test_no_fallback_when_disabled(monkeypatch):
    """
    If fallback disabled, failure should propagate.
    """
    monkeypatch.setattr(
        "backend.core.llm.transformers_adapter.AutoTokenizer.from_pretrained",
        lambda *a, **k: _DummyTokenizer(),
    )
    monkeypatch.setattr(
        "backend.core.llm.transformers_adapter.AutoModelForCausalLM.from_pretrained",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("forced failure")),
    )

    llm = TransformersLLM(
        model_name="stub-model",
        device="cuda",
        allow_cpu_fallback=False,
    )

    with pytest.raises(RuntimeError):
        llm.load_model()
