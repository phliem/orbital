from __future__ import annotations

import os
import uuid

import structlog
from fastapi import UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.config import settings
from takehome.db.models import Conversation, Document, TitleReport
from takehome.services.citations import read_pages

logger = structlog.get_logger()


def upload_destination(filename: str | None) -> str:
    """A new file path inside the upload directory.

    The original name is only a basename, so a filename such as ``../../x.pdf``
    cannot write outside that directory.
    """
    raw = (filename or "document.pdf").replace("\\", "/").replace("\x00", "")
    base = os.path.basename(raw).strip()
    if base in {"", ".", ".."}:
        base = "document.pdf"
    root = os.path.realpath(settings.upload_dir)
    os.makedirs(root, exist_ok=True)
    path = os.path.realpath(os.path.join(root, f"{uuid.uuid4().hex}_{base}"))
    if os.path.commonpath([root, path]) != root:
        raise ValueError("Invalid filename.")
    return path


def is_stored_upload(path: str) -> bool:
    """True when path resolves to a file inside the upload directory."""
    root = os.path.realpath(settings.upload_dir)
    try:
        resolved = os.path.realpath(path)
    except OSError:
        return False
    try:
        return os.path.commonpath([root, resolved]) == root and resolved != root
    except ValueError:
        return False


async def upload_document(
    session: AsyncSession, conversation_id: str, file: UploadFile
) -> Document:
    """Upload and process a PDF document for a conversation.

    Validates the file is a PDF, saves it to disk, extracts text using PyMuPDF,
    and stores metadata in the database.

    Raises ValueError if the conversation already has a document or the file is not a PDF.
    """
    # Serialize uploads and deletes for this single-document project.
    if await session.get(Conversation, conversation_id, with_for_update=True) is None:
        raise ValueError("Conversation not found.")
    existing = await get_document_for_conversation(session, conversation_id)
    if existing is not None:
        raise ValueError(
            "Conversation already has a document. Only one document per conversation is allowed."
        )

    # Validate file type
    if file.content_type not in ("application/pdf", "application/x-pdf"):
        filename = file.filename or ""
        if not filename.lower().endswith(".pdf"):
            raise ValueError("Only PDF files are supported.")

    # Read file content
    content = await file.read()
    if not content.startswith(b"%PDF"):
        raise ValueError("Only PDF files are supported.")

    # Validate file size
    if len(content) > settings.max_upload_size:
        raise ValueError(
            f"File too large. Maximum size is {settings.max_upload_size // (1024 * 1024)}MB."
        )

    original_filename = (
        os.path.basename(
            (file.filename or "document.pdf").replace("\\", "/").replace("\x00", "")
        ).strip()
        or "document.pdf"
    )
    file_path = upload_destination(original_filename)

    # Save the file to disk
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info("Saved uploaded PDF", filename=original_filename, path=file_path, size=len(content))

    # Extract text using PyMuPDF
    extracted_text = ""
    page_count = 0
    try:
        page_texts = read_pages(file_path)
        page_count = len(page_texts)
        pages: list[str] = []
        for page_num, text in enumerate(page_texts, start=1):
            if text.strip():
                pages.append(f"--- Page {page_num} ---\n{text}")
        extracted_text = "\n\n".join(pages)
    except Exception:
        logger.exception("Failed to extract text from PDF", filename=original_filename)
        extracted_text = ""

    logger.info(
        "Extracted text from PDF",
        filename=original_filename,
        page_count=page_count,
        text_length=len(extracted_text),
    )

    # Create the document record
    document = Document(
        conversation_id=conversation_id,
        filename=original_filename,
        file_path=file_path,
        extracted_text=extracted_text if extracted_text else None,
        page_count=page_count,
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    return document


async def get_document(session: AsyncSession, document_id: str) -> Document | None:
    """Get a document by its ID."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_document_for_conversation(
    session: AsyncSession, conversation_id: str
) -> Document | None:
    """Get the document for a conversation, if one exists."""
    stmt = select(Document).where(Document.conversation_id == conversation_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


def stored_file_size(path: str) -> int | None:
    """Byte size of a stored PDF, or None when the file is already gone."""
    try:
        return os.path.getsize(path)
    except OSError:
        return None


def remove_stored_file(path: str) -> None:
    """Delete a stored PDF. A missing file is not an error.

    Paths outside the upload directory are left untouched.
    """
    if not is_stored_upload(path):
        logger.warning("Refusing to delete a file outside the upload directory", path=path)
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except OSError:
        logger.exception("Could not remove stored file", path=path)


async def delete_document(session: AsyncSession, document_id: str) -> bool:
    """Delete one document, its PDF, and the checklist generated from it.

    Chat messages stay with the project. Returns False when the document does not exist.
    """
    document = await get_document(session, document_id)
    if document is None:
        return False
    path = document.file_path
    conversation_id = document.conversation_id
    conversation = await session.get(
        Conversation, conversation_id, populate_existing=True, with_for_update=True
    )
    if (
        conversation is None
        or await session.scalar(select(Document.id).where(Document.id == document_id)) is None
    ):
        return False
    conversation.property_line = None
    if conversation.title_source == "document":
        conversation.title = "Untitled project"
        conversation.title_source = "default"
    await session.execute(delete(TitleReport).where(TitleReport.conversation_id == conversation_id))
    await session.delete(document)
    await session.commit()
    remove_stored_file(path)
    return True
