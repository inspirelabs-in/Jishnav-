"""Ollama LLM backend (streaming via REST API)."""

import json
import logging
from typing import AsyncIterator

import httpx

import config
from llm.base import LLMBackend

log = logging.getLogger(__name__)


class OllamaBackend(LLMBackend):
    def __init__(self):
        self.url        = config.OLLAMA_URL
        self.model      = config.OLLAMA_MODEL
        self.last_usage = {"input_tokens": 0, "output_tokens": 0}

    async def generate(
        self,
        system_prompt: str,
        messages: list[dict],
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> AsyncIterator[str]:
        payload = {
            "model":  self.model,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
            "messages": [{"role": "system", "content": system_prompt}] + messages,
        }

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", f"{self.url}/api/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        chunk = data.get("message", {}).get("content", "")
                        if chunk:
                            yield chunk
                        if data.get("done"):
                            # Ollama's final chunk carries prompt_eval_count + eval_count
                            self.last_usage = {
                                "input_tokens":  data.get("prompt_eval_count", 0),
                                "output_tokens": data.get("eval_count", 0),
                            }
                            break
                    except json.JSONDecodeError:
                        continue
