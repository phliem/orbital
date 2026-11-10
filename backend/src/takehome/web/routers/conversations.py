from __future__ import annotations

import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.db.models import Conversation, Document
from takehome.db.session import get_session
from takehome.services.conversation import (
    InvalidTitleError,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    update_conversation,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class ConversationListItem(BaseModel):
    id: str
    title: str
    property_line: str | None = None
    created_at: datetime
    updated_at: datetime
    has_document: bool

    model_config = {"from_attributes": True}


class ConversationDetail(BaseModel):
    id: str
    title: str
    property_line: str | None = None
    created_at: datetime
    updated_at: datetime
    has_document: bool
    document: DocumentInfo | None = None

    model_config = {"from_attributes": True}


class DocumentInfo(BaseModel):
    id: str
    filename: str
    page_count: int
    document_type: str = "title-report"
    uploaded_at: datetime
    size_bytes: int | None = None

    model_config = {"from_attributes": True}


def _property_line(conversation: Conversation) -> str | None:
    """The extracted line, falling back to a title this app set from that address."""
    if conversation.property_line and conversation.property_line.strip():
        return conversation.property_line.strip()
    if conversation.title_source == "document" and conversation.title.strip():
        return conversation.title.strip()
    return None


def _document_info(document: Document) -> DocumentInfo:
    size_bytes: int | None
    try:
        size_bytes = os.path.getsize(document.file_path)
    except OSError:
        size_bytes = None
    return DocumentInfo(
        id=document.id,
        filename=document.filename,
        page_count=document.page_count,
        document_type=document.document_type,
        uploaded_at=document.uploaded_at,
        size_bytes=size_bytes,
    )


class ConversationCreate(BaseModel):
    pass


class ConversationUpdate(BaseModel):
    title: str


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.get("", response_model=list[ConversationListItem])
async def list_conversations_endpoint(
    session: AsyncSession = Depends(get_session),
) -> list[ConversationListItem]:
    """List all conversations, ordered by most recently updated."""
    conversations = await list_conversations(session)
    return [
        ConversationListItem(
            id=c.id,
            title=c.title,
            property_line=_property_line(c),
            created_at=c.created_at,
            updated_at=c.updated_at,
            has_document=len(c.documents) > 0,
        )
        for c in conversations
    ]


@router.post("", response_model=ConversationDetail, status_code=201)
async def create_conversation_endpoint(
    session: AsyncSession = Depends(get_session),
) -> ConversationDetail:
    """Create a new conversation."""
    conversation = await create_conversation(session)
    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        property_line=_property_line(conversation),
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        has_document=False,
        document=None,
    )


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation_endpoint(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
) -> ConversationDetail:
    """Get a single conversation with its document info."""
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    doc_info = _document_info(conversation.documents[0]) if conversation.documents else None

    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        property_line=_property_line(conversation),
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        has_document=doc_info is not None,
        document=doc_info,
    )


@router.patch("/{conversation_id}", response_model=ConversationDetail)
async def update_conversation_endpoint(
    conversation_id: str,
    body: ConversationUpdate,
    session: AsyncSession = Depends(get_session),
) -> ConversationDetail:
    """Update a conversation's title."""
    try:
        conversation = await update_conversation(session, conversation_id, body.title)
    except InvalidTitleError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_title", "message": str(exc)},
        ) from exc
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    doc_info = _document_info(conversation.documents[0]) if conversation.documents else None

    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        property_line=_property_line(conversation),
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        has_document=doc_info is not None,
        document=doc_info,
    )


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation_endpoint(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a conversation and all associated data."""
    deleted = await delete_conversation(session, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
