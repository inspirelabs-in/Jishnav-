"""OpenAI LLM backend (streaming via openai SDK)."""

import logging
from typing import AsyncIterator

import config
from llm.base import LLMBackend

log = logging.getLogger(__name__)


class OpenAIBackend(LLMBackend):
    def __init__(self):
        from openai import AsyncOpenAI
        self.client     = AsyncOpenAI(api_key=config.OPENAI_API_KEY)
        self.model      = config.OPENAI_MODEL
        self.last_usage = {"input_tokens": 0, "output_tokens": 0}

    async def generate(
        self,
        system_prompt: str,
        messages: list[dict],
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> AsyncIterator[str]:
        all_messages = [{"role": "system", "content": system_prompt}] + messages
        stream = await self.client.chat.completions.create(
            model          = self.model,
            messages       = all_messages,
            temperature    = temperature,
            max_tokens     = max_tokens,
            stream         = True,
            stream_options = {"include_usage": True},  # final chunk carries token counts
        )
        async for chunk in stream:
            # The last chunk has usage populated but empty choices — capture it
            if chunk.usage:
                self.last_usage = {
                    "input_tokens":  chunk.usage.prompt_tokens     or 0,
                    "output_tokens": chunk.usage.completion_tokens or 0,
                }
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
