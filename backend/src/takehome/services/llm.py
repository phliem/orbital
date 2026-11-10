from __future__ import annotations

import re
from collections.abc import AsyncIterator

from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIResponsesModel, OpenAIResponsesModelSettings
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider

from takehome.config import Settings, settings
from takehome.services.citations import normalize_text


class NoModelKeyError(Exception):
    """Chat, checklist generation, or model address extraction ran with no API key."""


NO_MODEL_KEY_MESSAGE = "No LLM API key configured. Set ANTHROPIC_API_KEY/OPENAI_API_KEY in .env"


def _build_model(config: Settings) -> Model:
    if config.llm_provider == "openai":
        api_key = config.openai_api_key.get_secret_value().strip()
        if not api_key:
            raise ValueError("Set OPENAI_API_KEY when LLM_PROVIDER=openai.")
        return OpenAIResponsesModel(
            "gpt-6-luna",
            provider=OpenAIProvider(api_key=api_key),
            settings=OpenAIResponsesModelSettings(openai_store=False),
        )

    api_key = config.anthropic_api_key.get_secret_value().strip()
    if not api_key:
        raise ValueError("Set ANTHROPIC_API_KEY when LLM_PROVIDER=anthropic.")
    return AnthropicModel(
        "claude-haiku-4-5-20251001",
        provider=AnthropicProvider(api_key=api_key),
    )


_CHAT_SYSTEM_PROMPT = (
    "You are a helpful legal document assistant for commercial real estate lawyers. "
    "You help lawyers review and understand documents during due diligence.\n\n"
    "IMPORTANT INSTRUCTIONS:\n"
    "- Answer questions based on the document content provided.\n"
    "- When referencing specific parts of the document, cite the relevant section or clause.\n"
    "- If the answer is not in the document, say so clearly. Do not fabricate information.\n"
    "- Be concise and precise. Lawyers value accuracy over verbosity.\n"
    "- When you reference specific content, mention the section, clause, or page."
)

_agent: Agent[None, str] | None = None


def build_model(config: Settings | None = None) -> Model:
    """Build the configured chat model. Raises ValueError when its API key is empty."""
    return _build_model(config or settings)


def provider_has_credentials(config: Settings | None = None) -> bool:
    """True when the selected provider has a non-empty API key."""
    active = config or settings
    if active.llm_provider == "openai":
        return bool(active.openai_api_key.get_secret_value().strip())
    return bool(active.anthropic_api_key.get_secret_value().strip())


def get_agent() -> Agent[None, str]:
    """Create the chat agent on first use so the app can boot without an API key."""
    global _agent
    if _agent is None:
        _agent = Agent(build_model(), system_prompt=_CHAT_SYSTEM_PROMPT)
    return _agent


async def extract_property_address(document_text: str) -> str | None:
    """Ask the configured model for a street address. None when the text has none.

    The returned address is kept only when it appears in document_text. With no
    API key this raises NoModelKeyError instead of guessing.
    """
    if not provider_has_credentials():
        raise NoModelKeyError(NO_MODEL_KEY_MESSAGE)
    if not document_text.strip():
        return None
    # Imported here so a test can stand in for the model the same way the checklist does.
    from pydantic_ai import Agent

    agent: Agent[None, str] = Agent(
        build_model(),
        output_type=str,
        system_prompt=(
            "Extract the property street address or premises from the document text. "
            "Return only that address. Do not include an APN, parcel number, or price. "
            "If the text has no address, return NONE."
        ),
    )
    result = await agent.run(document_text)
    text = " ".join(str(result.output).split()).strip().strip("\"'")
    if not text or re.fullmatch(r"(none|not found|n/a)", text, flags=re.IGNORECASE):
        return None
    if not re.search(r"\d", text) or len(text) > 120:
        return None
    if normalize_text(text) not in normalize_text(document_text):
        return None
    return text


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await get_agent().run(
        f"Generate a concise 3-5 word title for a conversation that starts with: '{user_message}'. "
        "Return only the title, nothing else."
    )
    title = str(result.output).strip().strip('"').strip("'")
    # Truncate if too long
    if len(title) > 100:
        title = title[:97] + "..."
    return title


async def chat_with_document(
    user_message: str,
    document_text: str | None,
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[str]:
    """Stream a response to the user's message, yielding text chunks.

    Builds a prompt that includes document context and conversation history,
    then streams the response from the LLM. With no API key, raises
    NoModelKeyError and does not call the model.
    """
    if not provider_has_credentials():
        raise NoModelKeyError(NO_MODEL_KEY_MESSAGE)

    # Build the full prompt with context
    prompt_parts: list[str] = []

    # Add document context if available
    if document_text:
        prompt_parts.append(
            "The following is the content of the document being discussed:\n\n"
            "<document>\n"
            f"{document_text}\n"
            "</document>\n"
        )
    else:
        prompt_parts.append(
            "No document has been uploaded yet. If the user asks about a document, "
            "let them know they need to upload one first.\n"
        )

    # Add conversation history
    if conversation_history:
        prompt_parts.append("Previous conversation:\n")
        for msg in conversation_history:
            role = msg["role"]
            content = msg["content"]
            if role == "user":
                prompt_parts.append(f"User: {content}\n")
            elif role == "assistant":
                prompt_parts.append(f"Assistant: {content}\n")
        prompt_parts.append("\n")

    # Add the current user message
    prompt_parts.append(f"User: {user_message}")

    full_prompt = "\n".join(prompt_parts)

    async with get_agent().run_stream(full_prompt) as result:
        async for text in result.stream_text(delta=True):
            yield text


def count_sources_cited(response: str) -> int:
    """Count the number of references to document sections, clauses, pages, etc."""
    patterns = [
        r"section\s+\d+",
        r"clause\s+\d+",
        r"page\s+\d+",
        r"paragraph\s+\d+",
    ]
    count = 0
    for pattern in patterns:
        count += len(re.findall(pattern, response, re.IGNORECASE))
    return count
