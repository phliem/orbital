"""Uploading a PDF names the project after the property address."""

from __future__ import annotations

import io
from pathlib import Path

import fitz
import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from starlette.datastructures import Headers

from takehome.db.models import Conversation, Document, TitleReport
from takehome.db.session import async_session, engine
from takehome.services.checklist import (
    PROPERTY_NOT_FOUND,
    TitleChecklistReport,
    apply_project_title,
    assemble_report,
    generate_title_checklist,
    property_line_for,
    resolve_property_address,
    resolve_property_line,
)
from takehome.services.citations import read_pages
from takehome.services.conversation import (
    create_conversation,
    delete_conversation,
    update_conversation,
)
from takehome.services.document import delete_document, upload_document
from takehome.web.routers.checklist import (
    ChecklistCreate,
    ResolutionUpdate,
    create_title_checklist,
    get_title_checklist,
    update_resolution,
)

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "sample-docs"
    / "alta-title-commitment-733-becker-station.pdf"
)
BISHOPSGATE = "Floors 8-10, 100 Bishopsgate, London EC2M 1GT"
VICTORIA = "42-48 Victoria Park Road, London E9 7HD"


@pytest.fixture(autouse=True)
async def _close_db_pool():
    """The shared engine keeps connections on the first test's event loop."""
    yield
    await engine.dispose()


def _recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: False,
    )


def _pdf_upload(path: Path) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(path.read_bytes()),
        filename=path.name,
        headers=Headers({"content-type": "application/pdf"}),
    )


def _write_pdf(path: Path, text: str) -> None:
    document = fitz.open()
    page = document.new_page()
    page.insert_textbox(fitz.Rect(72, 72, 540, 700), text)
    document.save(path)
    document.close()


async def _upload(conversation_id: str, path: Path) -> None:
    async with async_session() as session:
        document = await upload_document(session, conversation_id, _pdf_upload(path))
        await apply_project_title(session, conversation_id, document.file_path)


async def _stored(conversation_id: str) -> tuple[str, str, str | None]:
    async with async_session() as session:
        stored = await session.get(Conversation, conversation_id)
        assert stored is not None
        return stored.title, stored.title_source, stored.property_line


@pytest.mark.asyncio
async def test_reupload_unlocks_persona_and_clears_previous_address(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _recorded(monkeypatch)
    calls: list[str] = []

    async def fake_generate(**kwargs: object) -> TitleChecklistReport:
        calls.append(str(kwargs["client_id"]))
        return assemble_report(
            [],
            [],
            conversation_id=str(kwargs["conversation_id"]),
            client_id="willowbank" if kwargs["client_id"] == "willowbank" else "northstar",
            source="model",
        )

    monkeypatch.setattr("takehome.web.routers.checklist.generate_title_checklist", fake_generate)
    async with async_session() as session:
        project = await create_conversation(session)
    try:
        await _upload(project.id, FIXTURE)
        async with async_session() as session:
            first = await create_title_checklist(
                project.id, ChecklistCreate(client_id="willowbank"), session
            )
        assert first.property_line and "Becker" in first.property_line

        assert first.review_id
        check_id = first.items[0].check_id
        async with async_session() as session:
            await update_resolution(
                project.id,
                ResolutionUpdate(review_id=first.review_id, check_id=check_id, resolved=True),
                session,
            )
        async with async_session() as session:
            saved = await get_title_checklist(project.id, session)
        assert saved.resolved_ids == [check_id]

        async with async_session() as session:
            with pytest.raises(HTTPException) as caught:
                await create_title_checklist(
                    project.id, ChecklistCreate(client_id="northstar"), session
                )
        assert caught.value.status_code == 409
        assert calls == ["willowbank"]

        async with async_session() as session:
            document_id = await session.scalar(
                select(Document.id).where(Document.conversation_id == project.id)
            )
            assert document_id is not None
            assert await delete_document(session, document_id)
        assert await _stored(project.id) == ("Untitled project", "default", None)

        pdf = tmp_path / "parcel-only.pdf"
        _write_pdf(pdf, "Assessor's Parcel No. 123-456")
        await _upload(project.id, pdf)
        assert await _stored(project.id) == ("Untitled project", "default", "APN 123-456")
        async with async_session() as session:
            second = await create_title_checklist(
                project.id, ChecklistCreate(client_id="northstar"), session
            )
        assert second.client_id == "northstar"
        assert second.property_line == "APN 123-456"
        assert second.resolved_ids == []
        async with async_session() as session:
            with pytest.raises(HTTPException) as stale:
                await update_resolution(
                    project.id,
                    ResolutionUpdate(review_id=first.review_id, check_id=check_id, resolved=False),
                    session,
                )
        assert stale.value.status_code == 409
    finally:
        async with async_session() as session:
            await delete_conversation(session, project.id)


@pytest.mark.asyncio
async def test_upload_names_the_project_after_the_becker_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _recorded(monkeypatch)
    async with async_session() as session:
        conversation = await create_conversation(session)
        conversation_id = conversation.id
    try:
        await _upload(conversation_id, FIXTURE)
        pages = read_pages(str(FIXTURE))
        line = property_line_for(pages, source="model")
        address = line.split(" · ", 1)[0]
        assert address == "733 Becker Station Road, Fairmont Crossing, Colorado 80991"
        assert "APN 1973-08-4-12-008" in line
        assert "$6,850,000" in line
        assert await _stored(conversation_id) == (address, "document", line)
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)


@pytest.mark.asyncio
async def test_upload_names_a_lease_after_its_premises(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _recorded(monkeypatch)
    pdf = tmp_path / "lease.pdf"
    _write_pdf(pdf, f"LEASE\nrelating to\n{BISHOPSGATE}\n")
    async with async_session() as session:
        conversation = await create_conversation(session)
        conversation_id = conversation.id
    try:
        await _upload(conversation_id, pdf)
        assert await _stored(conversation_id) == (BISHOPSGATE, "document", BISHOPSGATE)
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)


@pytest.mark.asyncio
async def test_a_custom_title_is_not_replaced_on_upload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _recorded(monkeypatch)
    async with async_session() as session:
        conversation = await create_conversation(session)
        conversation_id = conversation.id
        await update_conversation(session, conversation_id, "Fairmont homes")
    try:
        await _upload(conversation_id, FIXTURE)
        stored_title, stored_source, stored_line = await _stored(conversation_id)
        assert stored_title == "Fairmont homes"
        assert stored_source == "custom"
        assert stored_line is not None
        assert stored_line.startswith("733 Becker Station Road, Fairmont Crossing")
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)


@pytest.mark.asyncio
async def test_upload_without_an_address_keeps_the_default_title(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _recorded(monkeypatch)
    pdf = tmp_path / "note.pdf"
    _write_pdf(pdf, "A note with no site, parcel, or price.")
    async with async_session() as session:
        conversation = await create_conversation(session)
        conversation_id = conversation.id
        assert conversation.title == "Untitled project"
    try:
        await _upload(conversation_id, pdf)
        assert await _stored(conversation_id) == ("Untitled project", "default", None)
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)


@pytest.mark.asyncio
async def test_a_model_supplies_the_address_when_the_text_has_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: True,
    )

    async def fake_address(_text: str) -> str | None:
        return "15 Market Street"

    monkeypatch.setattr(
        "takehome.services.checklist.extract_property_address",
        fake_address,
    )
    pages = ["The plan shows 15 Market Street beside the creek."]
    assert await resolve_property_line(pages) == "15 Market Street"
    assert await resolve_property_address(pages) == "15 Market Street"


@pytest.mark.asyncio
async def test_a_model_address_missing_from_the_text_is_dropped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: True,
    )

    async def fake_address(_text: str) -> str | None:
        return "15 Market Street"

    monkeypatch.setattr(
        "takehome.services.checklist.extract_property_address",
        fake_address,
    )
    pages = ["Nothing labeled as a site."]
    assert await resolve_property_line(pages) == PROPERTY_NOT_FOUND


@pytest.mark.asyncio
async def test_model_address_extraction_without_a_key_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from takehome.services.llm import NoModelKeyError, extract_property_address

    monkeypatch.setattr(
        "takehome.services.llm.provider_has_credentials",
        lambda *_args, **_kwargs: False,
    )
    with pytest.raises(NoModelKeyError, match="No LLM API key configured"):
        await extract_property_address("15 Market Street is the site.")
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: False,
    )
    with pytest.raises(NoModelKeyError, match="No LLM API key configured"):
        await resolve_property_line(["No labeled address in this note."], use_model=True)


@pytest.mark.asyncio
async def test_labeled_address_fills_the_title_and_the_property_row(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No API key: a labeled address is the project title and the Property row."""
    _recorded(monkeypatch)
    pdf = tmp_path / "victoria.pdf"
    _write_pdf(pdf, f"Property address: {VICTORIA}\n")
    async with async_session() as session:
        conversation = await create_conversation(session)
        conversation_id = conversation.id
    try:
        await _upload(conversation_id, pdf)
        assert await _stored(conversation_id) == (VICTORIA, "document", VICTORIA)
        report = await generate_title_checklist(
            file_path=str(pdf),
            conversation_id=conversation_id,
            client_id="willowbank",
            use_model=False,
        )
        assert report.property_line == VICTORIA
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)


@pytest.mark.asyncio
async def test_model_address_is_the_property_line(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When the text pass misses, the address used for the title is the Property row."""
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: True,
    )

    async def fake_address(_text: str) -> str | None:
        return VICTORIA

    monkeypatch.setattr(
        "takehome.services.checklist.extract_property_address",
        fake_address,
    )
    pdf = tmp_path / "schedule.pdf"
    _write_pdf(pdf, f"The schedule refers to {VICTORIA} for the site.")
    report = await generate_title_checklist(
        file_path=str(pdf),
        conversation_id="victoria",
        client_id="willowbank",
        use_model=True,
        checks=[],
    )
    assert report.property_line == VICTORIA


@pytest.mark.asyncio
async def test_a_saved_report_uses_the_address_kept_for_the_title() -> None:
    """Projects named before property_line existed still show that address."""
    async with async_session() as session:
        conversation = await create_conversation(session)
        conversation_id = conversation.id
    try:
        payload = TitleChecklistReport(
            conversation_id=conversation_id,
            client_id="willowbank",
            source="model",
            property_line=PROPERTY_NOT_FOUND,
            items=[],
        ).model_dump_json()
        async with async_session() as session:
            stored = await session.get(Conversation, conversation_id)
            assert stored is not None
            stored.title = VICTORIA
            stored.title_source = "document"
            stored.property_line = None
            session.add(TitleReport(conversation_id=conversation_id, payload=payload))
            await session.commit()

        async with async_session() as session:
            report = await get_title_checklist(conversation_id, session)
        assert report.property_line == VICTORIA

        async with async_session() as session:
            stored = await session.get(Conversation, conversation_id)
            assert stored is not None
            assert stored.property_line == VICTORIA
            await update_conversation(session, conversation_id, "Victoria homes")

        async with async_session() as session:
            report = await get_title_checklist(conversation_id, session)
            stored = await session.get(Conversation, conversation_id)
        assert stored is not None
        assert stored.title == "Victoria homes"
        assert stored.title_source == "custom"
        assert stored.property_line == VICTORIA
        assert report.property_line == VICTORIA
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)


@pytest.mark.asyncio
async def test_a_renamed_title_is_not_used_as_the_property() -> None:
    async with async_session() as session:
        conversation = await create_conversation(session)
        conversation_id = conversation.id
    try:
        payload = TitleChecklistReport(
            conversation_id=conversation_id,
            client_id="willowbank",
            source="recorded",
            property_line=PROPERTY_NOT_FOUND,
            items=[],
        ).model_dump_json()
        async with async_session() as session:
            stored = await session.get(Conversation, conversation_id)
            assert stored is not None
            stored.title = "Fairmont homes"
            stored.title_source = "custom"
            stored.property_line = None
            session.add(TitleReport(conversation_id=conversation_id, payload=payload))
            await session.commit()

        async with async_session() as session:
            report = await get_title_checklist(conversation_id, session)
            stored = await session.get(Conversation, conversation_id)
        assert report.property_line == PROPERTY_NOT_FOUND
        assert stored is not None
        assert stored.property_line is None
        assert stored.title == "Fairmont homes"
    finally:
        async with async_session() as session:
            await delete_conversation(session, conversation_id)


@pytest.mark.asyncio
async def test_empty_pdf_cannot_generate_a_review(tmp_path: Path) -> None:
    from takehome.services.checklist import UnreadablePdfError

    pdf = tmp_path / "scan-without-text.pdf"
    _write_pdf(pdf, "")
    with pytest.raises(UnreadablePdfError, match="searchable PDF"):
        await generate_title_checklist(
            file_path=str(pdf),
            conversation_id="scan",
            client_id="willowbank",
            use_model=False,
        )


@pytest.mark.asyncio
async def test_replacement_chat_ignores_old_pdf_and_preserves_concurrent_rename(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from takehome.db.models import Message
    from takehome.web.routers import messages

    _recorded(monkeypatch)
    monkeypatch.setattr(messages, "provider_has_credentials", lambda: True)
    observed: list[dict[str, str]] = []

    async def fake_chat(*, user_message, document_text, conversation_history):
        assert document_text and "Replacement document" in document_text
        observed.extend(conversation_history)
        yield "Answer for the current PDF"

    monkeypatch.setattr(messages, "chat_with_document", fake_chat)
    async with async_session() as session:
        project = await create_conversation(session)
    try:
        await _upload(project.id, FIXTURE)
        async with async_session() as session:
            old_id = await session.scalar(
                select(Document.id).where(Document.conversation_id == project.id)
            )
            assert old_id
            session.add(
                Message(
                    conversation_id=project.id,
                    document_id=old_id,
                    role="assistant",
                    content="Old PDF answer",
                )
            )
            await session.commit()
            assert await delete_document(session, old_id)

        replacement = tmp_path / "replacement.pdf"
        _write_pdf(replacement, "Replacement document")
        await _upload(project.id, replacement)

        async def rename_during_generation(_content: str) -> str:
            async with async_session() as session:
                await update_conversation(session, project.id, "Manual rename")
            return "Automatic title"

        monkeypatch.setattr(messages, "generate_title", rename_during_generation)
        async with async_session() as session:
            response = await messages.send_message(
                project.id, messages.MessageCreate(content="Question"), session
            )
            async for _ in response.body_iterator:
                pass
        async with async_session() as session:
            current = await messages.list_messages(project.id, session)
        assert observed == []
        assert [message.content for message in current] == [
            "Question",
            "Answer for the current PDF",
        ]
        assert (await _stored(project.id))[0] == "Manual rename"
    finally:
        async with async_session() as session:
            await delete_conversation(session, project.id)
