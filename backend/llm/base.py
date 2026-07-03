"""Abstract LLM interface."""

from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMBackend(ABC):
    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        messages: list[dict],   # [{"role": "user"|"assistant", "content": str}, ...]
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> AsyncIterator[str]:
        """Yield text token chunks as they stream from the model."""
        ...
