"""Return the configured LLM backend."""

import config
from llm.base import LLMBackend

_instance: LLMBackend | None = None


def get_llm() -> LLMBackend:
    global _instance
    if _instance is None:
        provider = config.LLM_PROVIDER.lower()
        if provider == "openai":
            from llm.openai_backend import OpenAIBackend
            _instance = OpenAIBackend()
        else:
            from llm.ollama_backend import OllamaBackend
            _instance = OllamaBackend()
    return _instance
