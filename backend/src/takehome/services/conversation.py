from __future__ import annotations

from typing import Literal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from takehome.db.models import Conversation, Document
from takehome.services.document import remove_stored_file

TITLE_MAX_LENGTH = 120
TitleSource = Literal["default", "document", "custom"]


class InvalidTitleError(ValueError):
    """A project title was blank or longer than the field allows."""


async def create_conversation(session: AsyncSession) -> Conversation:
    """Create a new conversation with default title."""
    conversation = Conversation()
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return conversation


async def list_conversations(session: AsyncSession) -> list[Conversation]:
    """List all conversations ordered by most recently updated."""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.documents))
        .order_by(Conversation.updated_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_conversation(session: AsyncSession, conversation_id: str) -> Conversation | None:
    """Get a single conversation with its documents eagerly loaded."""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.documents))
        .where(Conversation.id == conversation_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


def clean_title(title: str) -> str:
    """Trim a project title and reject a blank or oversized value."""
    text = title.strip()
    if not text:
        raise InvalidTitleError("Enter a project title.")
    if len(text) > TITLE_MAX_LENGTH:
        raise InvalidTitleError("Project title must be 120 characters or fewer.")
    return text


async def update_conversation(
    session: AsyncSession,
    conversation_id: str,
    title: str,
    *,
    source: TitleSource = "custom",
) -> Conversation | None:
    """Update the title of a conversation. Returns None when it does not exist.

    A call from Manage project marks the title custom. An automatic name passes
    source="document" or source="default" so a later upload can still replace it.
    """
    text = clean_title(title)
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        return None
    conversation.title = text
    conversation.title_source = source
    await session.commit()
    await session.refresh(conversation)
    return conversation


async def delete_conversation(session: AsyncSession, conversation_id: str) -> bool:
    """Delete a project and the rows that belong to it, then its PDF files.

    Messages, documents, and the stored checklist cascade through the foreign keys.
    Returns False when the project does not exist.
    """
    exists = await session.scalar(select(Conversation.id).where(Conversation.id == conversation_id))
    if exists is None:
        return False
    paths = list(
        (
            await session.execute(
                select(Document.file_path).where(Document.conversation_id == conversation_id)
            )
        )
        .scalars()
        .all()
    )
    await session.execute(delete(Conversation).where(Conversation.id == conversation_id))
    await session.commit()
    for path in paths:
        remove_stored_file(path)
    return True
