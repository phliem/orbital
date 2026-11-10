from __future__ import annotations

import os
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from takehome.db.session import get_session
from takehome.services.checklist import apply_project_title
from takehome.services.conversation import get_conversation
from takehome.services.document import (
    delete_document,
    get_document,
    is_stored_upload,
    stored_file_size,
    upload_document,
)

logger = structlog.get_logger()

router = APIRouter(tags=["documents"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class DocumentOut(BaseModel):
    id: str
    conversation_id: str
    filename: str
    page_count: int
    document_type: str = "title-report"
    uploaded_at: datetime
    size_bytes: int | None = None

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.post(
    "/api/conversations/{conversation_id}/documents",
    response_model=DocumentOut,
    status_code=201,
)
async def upload_document_endpoint(
    conversation_id: str,
    file: UploadFile,
    session: AsyncSession = Depends(get_session),
) -> DocumentOut:
    """Upload a PDF document for a conversation.

    Only one document per conversation is allowed. Returns 409 if a document
    already exists.
    """
    # Verify the conversation exists
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        document = await upload_document(session, conversation_id, file)
    except ValueError as exc:
        error_message = str(exc)
        if "already has a document" in error_message:
            raise HTTPException(status_code=409, detail=error_message) from exc
        raise HTTPException(status_code=400, detail=error_message) from exc

    logger.info(
        "Document uploaded",
        conversation_id=conversation_id,
        document_id=document.id,
        filename=document.filename,
    )

    await apply_project_title(session, conversation_id, document.file_path)

    return DocumentOut(
        id=document.id,
        conversation_id=document.conversation_id,
        filename=document.filename,
        page_count=document.page_count,
        document_type=document.document_type,
        uploaded_at=document.uploaded_at,
        size_bytes=stored_file_size(document.file_path),
    )


@router.delete("/api/documents/{document_id}", status_code=204)
async def delete_document_endpoint(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a document, its PDF, and the checklist generated from it."""
    deleted = await delete_document(session, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")


@router.get("/api/documents/{document_id}/content")
async def serve_document_file(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """Serve the raw PDF file for download/viewing."""
    document = await get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if not is_stored_upload(document.file_path) or not os.path.isfile(document.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=document.file_path,
        filename=document.filename,
        media_type="application/pdf",
    )
