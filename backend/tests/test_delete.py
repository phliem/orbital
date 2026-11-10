"""Deleting a project or its document removes the stored PDF and derived rows."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select

from takehome.config import settings
from takehome.db.models import Conversation, Document, Message, TitleReport
from takehome.db.session import async_session, engine
from takehome.services.conversation import (
    InvalidTitleError,
    delete_conversation,
    update_conversation,
)
from takehome.services.document import delete_document


@pytest.fixture(autouse=True)
async def _close_db_pool():
    """The shared engine keeps connections on the first test's event loop."""
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
def _uploads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Stored PDFs in these tests live in the directory deletes are allowed to touch."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))


async def _counts(conversation_id: str) -> tuple[int, int, int, int]:
    async with async_session() as session:
        conversation = await session.scalar(
            select(func.count()).select_from(Conversation).where(Conversation.id == conversation_id)
        )
        messages = await session.scalar(
            select(func.count())
            .select_from(Message)
            .where(Message.conversation_id == conversation_id)
        )
        documents = await session.scalar(
            select(func.count())
            .select_from(Document)
            .where(Document.conversation_id == conversation_id)
        )
        reports = await session.scalar(
            select(func.count())
            .select_from(TitleReport)
            .where(TitleReport.conversation_id == conversation_id)
        )
    return conversation or 0, messages or 0, documents or 0, reports or 0


async def _seed(tmp_path: Path, title: str) -> tuple[str, str, Path]:
    pdf = tmp_path / f"{title}.pdf"
    pdf.write_bytes(b"%PDF-1.4 cascade")
    async with async_session() as session:
        conversation = Conversation(title=title)
        session.add(conversation)
        await session.commit()
        await session.refresh(conversation)
        session.add(
            Message(
                conversation_id=conversation.id,
                role="user",
                content="What are the biggest risks?",
                sources_cited=0,
            )
        )
        document = Document(
            conversation_id=conversation.id,
            filename="commitment.pdf",
            file_path=str(pdf),
            page_count=1,
        )
        session.add(document)
        session.add(TitleReport(conversation_id=conversation.id, payload="{}"))
        await session.commit()
        await session.refresh(document)
        return conversation.id, document.id, pdf


@pytest.mark.asyncio
async def test_delete_project_cascades_files_messages_and_report(tmp_path: Path) -> None:
    conversation_id, _document_id, pdf = await _seed(tmp_path, "delete-project")
    other_id, _other_document, other_pdf = await _seed(tmp_path, "keep-project")
    try:
        async with async_session() as session:
            assert await delete_conversation(session, conversation_id) is True
            assert await delete_conversation(session, conversation_id) is False

        assert not pdf.exists()
        assert await _counts(conversation_id) == (0, 0, 0, 0)
        assert other_pdf.exists()
        assert await _counts(other_id) == (1, 1, 1, 1)
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)
            await delete_conversation(session, other_id)


@pytest.mark.asyncio
async def test_rename_project_trims_and_rejects_a_blank_title(tmp_path: Path) -> None:
    conversation_id, _document_id, _pdf = await _seed(tmp_path, "rename-me")
    try:
        async with async_session() as session:
            updated = await update_conversation(session, conversation_id, "  Fairmont homes  ")
            assert updated is not None
            assert updated.title == "Fairmont homes"
            assert await update_conversation(session, "missing-project", "Nope") is None

        with pytest.raises(InvalidTitleError):
            async with async_session() as session:
                await update_conversation(session, conversation_id, "   ")
        with pytest.raises(InvalidTitleError):
            async with async_session() as session:
                await update_conversation(session, conversation_id, "x" * 121)

        async with async_session() as session:
            stored = await session.get(Conversation, conversation_id)
            assert stored is not None
            assert stored.title == "Fairmont homes"
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)


@pytest.mark.asyncio
async def test_delete_document_cascades_file_and_report_only(tmp_path: Path) -> None:
    conversation_id, document_id, pdf = await _seed(tmp_path, "delete-document")
    try:
        async with async_session() as session:
            assert await delete_document(session, document_id) is True
            assert await delete_document(session, document_id) is False

        assert not pdf.exists()
        assert await _counts(conversation_id) == (1, 1, 0, 0)
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)
