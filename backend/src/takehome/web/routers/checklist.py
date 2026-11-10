from __future__ import annotations

from typing import Literal
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.db.models import Conversation, Document, TitleReport
from takehome.db.session import get_session
from takehome.services.checklist import (
    PROPERTY_NOT_FOUND,
    ChecklistGenerationError,
    ClientId,
    DocumentType,
    RequestedCheck,
    TitleChecklistReport,
    UnreadablePdfError,
    generate_title_checklist,
    generation_failure_detail,
    stored_property_line,
    with_stored_property,
)
from takehome.services.conversation import get_conversation
from takehome.services.llm import NoModelKeyError

logger = structlog.get_logger()

router = APIRouter(prefix="/api/conversations", tags=["title-checklist"])


class ChecklistCreate(BaseModel):
    client_id: Literal["willowbank", "northstar"]
    simulate_failure: bool = False
    checks: list[RequestedCheck] | None = None
    document_type: DocumentType = "title-report"


class ResolutionUpdate(BaseModel):
    review_id: str
    check_id: str
    resolved: bool


def _stored_report(row: TitleReport) -> TitleChecklistReport:
    report = TitleChecklistReport.model_validate_json(row.payload)
    if report.review_id is None:
        return report.model_copy(update={"review_id": row.id})
    return report


def _error(status_code: int, error: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": error, "message": message})


async def _align_property_line(
    session: AsyncSession,
    conversation: Conversation,
    row: TitleReport,
    report: TitleChecklistReport,
) -> TitleChecklistReport:
    """Fill a missing property line from the address stored for this project."""
    stored = stored_property_line(
        conversation.title, conversation.title_source, conversation.property_line
    )
    aligned = with_stored_property(report, stored)
    changed = False
    if aligned.property_line != report.property_line:
        row.payload = aligned.model_dump_json()
        changed = True
    if (
        aligned.property_line
        and aligned.property_line != PROPERTY_NOT_FOUND
        and conversation.property_line != aligned.property_line
    ):
        conversation.property_line = aligned.property_line
        changed = True
    if changed:
        await session.commit()
    return aligned


async def _load_report(session: AsyncSession, conversation_id: str) -> TitleReport | None:
    stmt = (
        select(TitleReport)
        .where(TitleReport.conversation_id == conversation_id)
        .execution_options(populate_existing=True)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


def _require_same_persona(existing: TitleReport | None, client_id: ClientId) -> None:
    if (
        existing
        and TitleChecklistReport.model_validate_json(existing.payload).client_id != client_id
    ):
        raise _error(
            409,
            "persona_locked",
            "This PDF already has a persona. Remove it and upload it again to choose another.",
        )


@router.get("/{conversation_id}/title-checklist", response_model=TitleChecklistReport)
async def get_title_checklist(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
) -> TitleChecklistReport:
    """Return the stored checklist, if this project has been run."""
    conversation = await session.get(Conversation, conversation_id, with_for_update=True)
    if conversation is None:
        raise _error(404, "not_found", "Conversation not found")
    row = await _load_report(session, conversation_id)
    if row is None:
        raise _error(404, "no_report", "No report yet.")
    report = _stored_report(row)
    return await _align_property_line(session, conversation, row, report)


@router.patch("/{conversation_id}/title-checklist/resolution", response_model=TitleChecklistReport)
async def update_resolution(
    conversation_id: str,
    body: ResolutionUpdate,
    session: AsyncSession = Depends(get_session),
) -> TitleChecklistReport:
    conversation = await session.get(Conversation, conversation_id, with_for_update=True)
    if conversation is None:
        raise _error(404, "not_found", "Conversation not found")
    row = await _load_report(session, conversation_id)
    if row is None:
        raise _error(404, "no_report", "No report yet.")
    report = _stored_report(row)
    if report.review_id != body.review_id:
        raise _error(409, "report_changed", "This report has changed. Reload it and try again.")
    if not any(item.check_id == body.check_id for item in report.items):
        raise _error(404, "highlight_not_found", "Highlight not found.")

    resolved = set(report.resolved_ids)
    if body.resolved:
        resolved.add(body.check_id)
    else:
        resolved.discard(body.check_id)
    report.resolved_ids = [item.check_id for item in report.items if item.check_id in resolved]
    row.payload = report.model_dump_json()
    await session.commit()
    return report


@router.post("/{conversation_id}/title-checklist", response_model=TitleChecklistReport)
async def create_title_checklist(
    conversation_id: str,
    body: ChecklistCreate,
    session: AsyncSession = Depends(get_session),
) -> TitleChecklistReport:
    """Generate the checklist for the conversation's single PDF and the selected persona."""
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise _error(404, "not_found", "Conversation not found")
    if not conversation.documents:
        raise _error(400, "no_document", "Upload a PDF before running the report.")

    document = conversation.documents[0]
    document_id = document.id
    client_id: ClientId = body.client_id
    document_type: DocumentType = body.document_type
    _require_same_persona(await _load_report(session, conversation_id), client_id)
    try:
        report = await generate_title_checklist(
            file_path=document.file_path,
            conversation_id=conversation_id,
            client_id=client_id,
            simulate_failure=body.simulate_failure,
            checks=body.checks,
            document_type=document_type,
        )
    except NoModelKeyError as exc:
        logger.warning("Title checklist needs an API key", conversation_id=conversation_id)
        raise HTTPException(
            status_code=503,
            detail={"error": "no_api_key", "message": str(exc)},
        ) from exc
    except UnreadablePdfError as exc:
        raise _error(422, "unreadable_pdf", str(exc)) from exc
    except ChecklistGenerationError as exc:
        logger.exception("Title checklist generation failed", conversation_id=conversation_id)
        raise HTTPException(status_code=502, detail=generation_failure_detail(exc)) from exc

    # Serialize report writes with PDF deletion and competing first reports.
    current = await session.get(
        Conversation, conversation_id, populate_existing=True, with_for_update=True
    )
    if (
        current is None
        or await session.scalar(select(Document.id).where(Document.id == document_id)) is None
    ):
        raise _error(409, "document_changed", "The PDF changed while the report was running.")
    existing = await _load_report(session, conversation_id)
    _require_same_persona(existing, client_id)
    document.document_type = document_type
    report = with_stored_property(
        report,
        stored_property_line(current.title, current.title_source, current.property_line),
    )
    if report.property_line and report.property_line != PROPERTY_NOT_FOUND:
        current.property_line = report.property_line
    report.review_id = uuid4().hex
    payload = report.model_dump_json()
    if existing is None:
        session.add(TitleReport(conversation_id=conversation_id, payload=payload))
    else:
        existing.payload = payload
    await session.commit()

    logger.info(
        "Title checklist stored",
        conversation_id=conversation_id,
        client_id=client_id,
        source=report.source,
    )
    return report
