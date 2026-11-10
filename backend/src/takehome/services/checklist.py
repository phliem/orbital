"""Title checklist: one persona, verified quotes, and one card per distinct item.

With an API key, a model reads the PDF and returns structured findings. Without
one, generation fails with NoModelKeyError. Tests can replay a recorded reading
of the Becker Station commitment by passing use_model=False. An excerpt is
evidence only after it is found in the extracted text and is long enough to
identify a passage.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

import structlog
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.config import settings
from takehome.db.models import Conversation, Document
from takehome.services.citations import locate_excerpt, normalize_text, read_pages
from takehome.services.llm import (
    NO_MODEL_KEY_MESSAGE,
    NoModelKeyError,
    extract_property_address,
    provider_has_credentials,
)
from takehome.services.personas import (
    CategoryDef,
    ClientId,
    PersonaDef,
    category_ids,
    group_label,
    persona_for_client,
)

logger = structlog.get_logger()

Risk = Literal["issue", "needs_evidence", "low_priority"]
CheckStatus = Literal["found", "not_found", "needs_evidence"]
ReportSource = Literal["model", "recorded"]
DocumentType = Literal["commercial-lease", "environmental-assessments", "title-report"]
Burden = Literal["burden", "benefit", "both"]

PROPERTY_LINE = "733 Becker Station Road · APN 1973-08-4-12-008 · $6,850,000"
PROPERTY_NOT_FOUND = "Not found in this document."
_BECKER_EXPECTED = Path(__file__).resolve().parents[3] / "fixtures" / "becker-expected.json"

# Phrases that identify the Becker Station commitment. All five must be present
# before the recorded reading is applied to a PDF. Tests only.
_BECKER_ANCHORS: tuple[str, ...] = (
    "three (3) stories",
    "storm drainage easement",
    "First Pioneer Bank",
    "drive-through restaurant",
    "Becker Station Lane",
)

_DOCUMENT_TYPE_LABEL: dict[DocumentType, str] = {
    "commercial-lease": "Commercial Lease",
    "environmental-assessments": "Environmental assessments",
    "title-report": "Title report",
}


class ChecklistGenerationError(Exception):
    """The model did not return a usable checklist."""


class Assessment(BaseModel):
    """A persona's reading of one finding. Older rows may still store certainty; it is ignored."""

    model_config = ConfigDict(extra="ignore")

    risk: Risk
    summary: str
    recommendation: str
    unresolved_note: str | None = None


class Citation(BaseModel):
    page: int | None = None
    clause: str | None = None
    excerpt: str | None = None
    verified: bool = False


class ChecklistItem(BaseModel):
    check_id: str
    parent_id: str = ""
    title: str
    short_title: str
    clause: str
    status: CheckStatus
    document_says: str
    citation: Citation
    burden: Burden | None = None
    assessments: dict[str, Assessment]


class UnreadablePdfError(ChecklistGenerationError):
    """The PDF has no text that can be reviewed."""


class RequestedCheck(BaseModel):
    """One document check the lawyer left ticked, with its confirm-step group."""

    title: str
    category: str


class TitleChecklistReport(BaseModel):
    conversation_id: str
    client_id: ClientId
    source: ReportSource
    document_type: DocumentType = "title-report"
    persona_id: str | None = None
    property_line: str | None = None
    # None on reports saved before the selection was stored. A list is the
    # selection sent with that generation, including titles that are not findings.
    requested_checks: list[RequestedCheck] | None = None
    items: list[ChecklistItem]
    review_id: str | None = None
    resolved_ids: list[str] = Field(default_factory=list)


class ModelFinding(BaseModel):
    model_config = ConfigDict(extra="ignore")

    category_id: str
    status: CheckStatus
    page: int | None = None
    excerpt: str | None = None
    short_title: str | None = None
    burden: Burden | None = None
    risk: Risk | None = None
    summary: str | None = None
    recommendation: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _accept_check_id(cls, data: object) -> object:
        raw = _string_key_dict(data)
        if raw is None or "category_id" in raw or "check_id" not in raw:
            return data
        check_id = raw.get("check_id")
        if isinstance(check_id, str):
            raw["category_id"] = check_id
        return raw


class ModelReport(BaseModel):
    findings: list[ModelFinding]


class DraftFinding(BaseModel):
    check_id: str
    status: CheckStatus
    page: int | None = None
    excerpt: str | None = None
    short_title: str | None = None
    burden: Burden | None = None
    assessment: Assessment | None = None


@dataclass(frozen=True)
class PlannedCheck:
    """One question the model is asked. A question can produce several findings."""

    check_id: str
    title: str
    category: str
    description: str
    guidance: str
    evidence: str
    custom: bool


def anchors_present(pages: list[str]) -> bool:
    haystack = normalize_text("\n".join(pages))
    return all(normalize_text(anchor) in haystack for anchor in _BECKER_ANCHORS)


def custom_check_id(title: str, used: set[str]) -> str:
    """Stable id for a free-text check. Persona category ids are never reused."""
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_") or "check"
    candidate = f"custom:{slug}"[:80]
    number = 2
    while candidate in used:
        suffix = f"_{number}"
        candidate = f"custom:{slug}"[: 80 - len(suffix)] + suffix
        number += 1
    used.add(candidate)
    return candidate


def plan_checks(
    checks: list[RequestedCheck] | None,
    document_type: DocumentType,
    client_id: ClientId,
) -> list[PlannedCheck]:
    """Persona categories the lawyer left on, then each custom instruction."""
    persona = persona_for_client(client_id)
    used = set(category_ids())
    planned: list[PlannedCheck] = []
    category_names = {category.name for category in persona.categories}
    if document_type == "title-report":
        selected = None if checks is None else {check.title: check for check in checks}
        for category in persona.categories:
            if selected is None:
                if not category.enabled_by_default:
                    continue
                group = group_label(category.group)
            else:
                request = selected.get(category.name)
                if request is None:
                    continue
                group = request.category.strip() or group_label(category.group)
            planned.append(
                PlannedCheck(
                    check_id=category.id,
                    title=category.name,
                    category=group,
                    description=category.description,
                    guidance=category.guidance,
                    evidence=category.evidence,
                    custom=False,
                )
            )
            used.add(category.id)
    if not checks:
        return planned
    for check in checks:
        title = check.title.strip()
        if not title:
            continue
        if document_type == "title-report" and title in category_names:
            continue
        if document_type == "title-report" and check.category.strip().lower() != "added by you":
            continue
        planned.append(
            PlannedCheck(
                check_id=custom_check_id(title, used),
                title=title,
                category=check.category.strip() or "Added by you",
                description="",
                guidance="",
                evidence="",
                custom=True,
            )
        )
    return planned


def _finding_line(item: PlannedCheck) -> str:
    if item.custom:
        return (
            f"- {item.check_id} (instruction: {item.title}). "
            "Return one finding for each distinct item this instruction matches. "
            "Set short_title to a short name for that item."
        )
    return (
        f"- {item.check_id}: {item.title}. {item.description} "
        f"Look for: {item.evidence} {item.guidance}"
    )


def excluded_categories(persona: PersonaDef, planned: list[PlannedCheck]) -> list[CategoryDef]:
    """Persona categories the lawyer left unticked."""
    enabled = {item.check_id for item in planned if not item.custom}
    return [category for category in persona.categories if category.id not in enabled]


def checklist_instruction(
    planned: list[PlannedCheck],
    checks: list[RequestedCheck] | None = None,
    document_type: DocumentType = "title-report",
    persona: PersonaDef | None = None,
) -> str:
    """The part of the model request that names the selected checks. Page text follows it."""
    label = _DOCUMENT_TYPE_LABEL[document_type]
    if checks is None:
        listed = [f"- {item.title}" for item in planned]
    else:
        listed = [f"- {check.category}: {check.title}" for check in checks]
    finding_lines = "\n".join(_finding_line(item) for item in planned)
    selected = "\n".join(listed) if listed else "- (none)"
    findings = finding_lines if finding_lines else "- (none)"
    excluded = ""
    if document_type == "title-report" and persona is not None:
        left_out = excluded_categories(persona, planned)
        if left_out:
            lines = "\n".join(
                f"- {category.id}: {category.name}. {category.description} {category.guidance}"
                for category in left_out
            )
        else:
            lines = "- (none)"
        excluded = (
            "\n\nExcluded categories. Do not return these ids. "
            "Do not report a clause that belongs to an excluded category under a selected category:\n"
            f"{lines}"
        )
    return (
        f"Document type: {label}\n\n"
        "Selected document checks:\n"
        f"{selected}\n\n"
        "Return one finding for each distinct matching item under these ids, "
        "and no other ids:\n"
        f"{findings}"
        f"{excluded}"
    )


def _title_system(persona: PersonaDef) -> str:
    return f"""You review one title document for a commercial real estate lawyer.
It may be a US title commitment or title report, or a UK register of title.
The page text is the only source.

Persona: {persona.name}. {persona.description}
Consider only the categories and instructions listed in the user message.
The user message names any categories left out of this review.
Do not return an excluded category id.
Do not report a clause that belongs to an excluded category under a selected category.
Follow the exclusion stated in each selected category's guidance.

A category may match more than once. Return a separate finding for each distinct clause.
An instruction may match more than once. Return a separate finding for each distinct item.
Do not merge distinct clauses or items into one finding.
Set short_title to a short name for that clause or item.
When a category matches once, short_title may be the category name.

For each finding:
- category_id is one of the listed ids
- status is found or not_found
- when status is found, excerpt is a verbatim span of the page text, long enough to identify the clause, and page is the 1-based page of that span
- when the category is an easement or access, set burden to burden, benefit, or both when the text says which
- risk is issue, needs_evidence, or low_priority for this persona
- summary and recommendation follow from the quoted text
If a listed category or instruction is not addressed, return one item for that category_id with status not_found, excerpt null, and page null.
Do not invent amounts, permit numbers, parties, or a building programme.
Do not apply a predetermined risk.
Return no category_id that was not listed.
"""


def _instruction_system(label: str) -> str:
    return f"""You are reviewing one uploaded document ({label}) for a commercial real estate lawyer.
The page text is the only source.

Each selected check is an instruction. Return one finding for every distinct item in the document that the instruction asks for.
Do not collapse several items into one finding.
For each finding:
- category_id is the listed check id
- short_title names that one item
- status is found
- excerpt is a verbatim span of the page text, long enough to identify the passage
- page is the 1-based page that contains the excerpt
- risk is issue, needs_evidence, or low_priority
- summary and recommendation follow from the quoted text
If an instruction matches nothing, return one item for that category_id with status not_found, excerpt null, page null, and short_title equal to the instruction.
Do not invent incidents, amounts, or parties.
Return no category_id that was not listed.
"""


def system_prompt_for(
    planned: list[PlannedCheck],
    document_type: DocumentType,
    persona: PersonaDef,
) -> str:
    """System prompt for this persona, or for free-text instructions on other document types."""
    del planned
    if document_type == "title-report":
        return _title_system(persona)
    return _instruction_system(_DOCUMENT_TYPE_LABEL[document_type])


def _not_found_assessment() -> Assessment:
    return Assessment(
        risk="needs_evidence",
        summary="Not found in this document.",
        recommendation=(
            "Not found in this document. A lawyer should confirm the point from the source file."
        ),
    )


def _missing_draft(check_id: str) -> DraftFinding:
    return DraftFinding(check_id=check_id, status="not_found", page=None, excerpt=None)


def _recorded_assessment(excerpt: str) -> Assessment:
    summary = excerpt.strip()
    if len(summary) > 280:
        summary = summary[:277].rstrip() + "..."
    return Assessment(
        risk="needs_evidence",
        summary=summary,
        recommendation="Confirm how this clause applies to this persona.",
    )


def _string_key_dict(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    parsed: dict[str, object] = {}
    for key, item in cast(dict[object, object], value).items():
        if isinstance(key, str):
            parsed[key] = item
    return parsed


def _becker_expected() -> dict[str, object]:
    parsed = _string_key_dict(json.loads(_BECKER_EXPECTED.read_text(encoding="utf-8")))
    if parsed is None:
        raise ChecklistGenerationError("The Becker expectation file is unreadable.")
    return parsed


def recorded_drafts(
    pages: list[str],
    client_id: ClientId = "willowbank",
    planned: list[PlannedCheck] | None = None,
) -> list[DraftFinding]:
    """Recorded Becker excerpts for tests, or Not found when this is another PDF.

    The expectation file is not a category definition and is not used when a
    model is called.
    """
    if planned is None:
        planned = plan_checks(None, "title-report", client_id)
    persona = persona_for_client(client_id)
    expected: dict[str, object] = {}
    if anchors_present(pages):
        parsed_rows = _string_key_dict(_becker_expected().get(persona.id))
        if parsed_rows is not None:
            expected = parsed_rows
    drafts: list[DraftFinding] = []
    for item in planned:
        spec = _string_key_dict(expected.get(item.check_id)) if not item.custom else None
        excerpt = spec.get("excerpt") if spec is not None else None
        page = spec.get("page") if spec is not None else None
        if not isinstance(excerpt, str) or not excerpt.strip():
            drafts.append(_missing_draft(item.check_id))
            continue
        drafts.append(
            DraftFinding(
                check_id=item.check_id,
                status="found",
                page=page if isinstance(page, int) else None,
                excerpt=excerpt,
                short_title=item.title,
                assessment=_recorded_assessment(excerpt),
            )
        )
    return drafts


def _draft_from_model(finding: ModelFinding) -> DraftFinding:
    excerpt = (finding.excerpt or "").strip() or None
    summary = (finding.summary or "").strip()
    recommendation = (finding.recommendation or "").strip()
    assessment = None
    if finding.status != "not_found":
        assessment = Assessment(
            risk=finding.risk or "needs_evidence",
            summary=summary or (excerpt or "The document states this."),
            recommendation=recommendation
            or "Confirm how this clause applies before relying on it.",
        )
    return DraftFinding(
        check_id=finding.category_id,
        status=finding.status,
        page=finding.page,
        excerpt=excerpt,
        short_title=(finding.short_title or "").strip() or None,
        burden=finding.burden,
        assessment=assessment,
    )


def _item_name(raw: str | None, fallback: str) -> str:
    text = " ".join((raw or "").split()).strip()
    if not text:
        return fallback
    if len(text) > 80:
        return text[:77].rstrip() + "..."
    return text


def _render_pages(pages: list[str]) -> str:
    return "\n\n".join(f"--- Page {index} ---\n{text}" for index, text in enumerate(pages, start=1))


async def _drafts_from_live_model(
    pages: list[str],
    planned: list[PlannedCheck],
    checks: list[RequestedCheck] | None,
    document_type: DocumentType,
    persona: PersonaDef,
) -> list[DraftFinding]:
    from pydantic_ai import Agent

    from takehome.services.llm import build_model

    instruction = checklist_instruction(planned, checks, document_type, persona)
    agent: Agent[None, ModelReport] = Agent(
        build_model(),
        output_type=ModelReport,
        system_prompt=system_prompt_for(planned, document_type, persona),
    )
    label = _DOCUMENT_TYPE_LABEL[document_type]
    prompt = (
        f"{instruction}\n\n"
        f"Review the {label} below. Analyse the document against each selected check.\n\n"
        f"{_render_pages(pages)}"
    )
    try:
        result = await agent.run(prompt)
    except (NoModelKeyError, ChecklistGenerationError):
        raise
    except Exception as exc:
        message = str(exc).strip() or exc.__class__.__name__
        raise ChecklistGenerationError(message[:500]) from exc
    return [_draft_from_model(finding) for finding in result.output.findings]


def _lookup(planned: list[PlannedCheck]) -> dict[str, PlannedCheck]:
    mapping: dict[str, PlannedCheck] = {}
    for item in planned:
        mapping[item.check_id] = item
        mapping.setdefault(item.title, item)
    return mapping


def _not_found_item(item: PlannedCheck, client_id: ClientId) -> ChecklistItem:
    return ChecklistItem(
        check_id=item.check_id,
        parent_id=item.check_id,
        title=item.title,
        short_title=item.title,
        clause="",
        status="not_found",
        document_says=PROPERTY_NOT_FOUND,
        citation=Citation(page=None, clause=None, excerpt=None, verified=False),
        assessments={client_id: _not_found_assessment()},
    )


def _found_item(
    item: PlannedCheck,
    draft: DraftFinding,
    excerpt: str,
    page: int,
    index: int,
    pages: list[str],
    client_id: ClientId,
) -> ChecklistItem:
    assessment = draft.assessment or Assessment(
        risk="needs_evidence",
        summary=excerpt,
        recommendation="Confirm how this clause applies before relying on it.",
    )
    check_id = item.check_id if index == 0 else f"{item.check_id}:{index + 1}"
    return ChecklistItem(
        check_id=check_id,
        parent_id=item.check_id,
        title=item.title,
        short_title=_item_name(draft.short_title, item.title),
        clause="",
        status="found",
        document_says=grounded_document_line(pages, excerpt, ""),
        citation=Citation(page=page, clause=None, excerpt=excerpt, verified=True),
        burden=draft.burden,
        assessments={client_id: assessment},
    )


def assemble_report(
    drafts: list[DraftFinding],
    pages: list[str],
    *,
    conversation_id: str,
    client_id: ClientId,
    source: ReportSource,
    requested_checks: list[RequestedCheck] | None = None,
    planned: list[PlannedCheck] | None = None,
    document_type: DocumentType = "title-report",
    property_line: str | None = None,
    persona_id: str | None = None,
) -> TitleChecklistReport:
    """Verify each excerpt. One card per verified item. Not found only when none survive."""
    if planned is None:
        planned = plan_checks(requested_checks, document_type, client_id)
    if persona_id is None:
        persona_id = persona_for_client(client_id).id
    buckets: dict[str, list[DraftFinding]] = {item.check_id: [] for item in planned}
    enabled = {item.check_id for item in planned}
    known = _lookup(planned)
    for draft in drafts:
        # A category the lawyer left unticked is not a place to file a clause,
        # including when the model names that category id anyway.
        if draft.check_id in category_ids() and draft.check_id not in enabled:
            continue
        match = known.get(draft.check_id)
        if match is None or match.check_id not in enabled:
            continue
        buckets[match.check_id].append(draft)
    items: list[ChecklistItem] = []
    for planned_item in planned:
        verified: list[tuple[DraftFinding, str, int]] = []
        seen: set[str] = set()
        for draft in buckets[planned_item.check_id]:
            if draft.status == "not_found":
                continue
            excerpt = (draft.excerpt or "").strip()
            located = locate_excerpt(pages, excerpt, draft.page)
            if located is None:
                continue
            key = normalize_text(excerpt)
            if key in seen:
                continue
            seen.add(key)
            verified.append((draft, excerpt, located))
        if not verified:
            items.append(_not_found_item(planned_item, client_id))
            continue
        for index, (draft, excerpt, located) in enumerate(verified):
            items.append(
                _found_item(planned_item, draft, excerpt, located, index, pages, client_id)
            )
    return TitleChecklistReport(
        conversation_id=conversation_id,
        client_id=client_id,
        source=source,
        document_type=document_type,
        persona_id=persona_id,
        property_line=property_line
        if property_line is not None
        else property_line_for(pages, source=source),
        requested_checks=requested_checks,
        items=items,
    )


async def generate_title_checklist(
    *,
    file_path: str,
    conversation_id: str,
    client_id: ClientId,
    use_model: bool | None = None,
    simulate_failure: bool = False,
    checks: list[RequestedCheck] | None = None,
    document_type: DocumentType = "title-report",
) -> TitleChecklistReport:
    """Run the checklist for one uploaded PDF and the checks left selected.

    use_model=False replays the recorded Becker reading and is for tests.
    The API leaves use_model unset. With no API key that path raises
    NoModelKeyError instead of serving the recording.
    """
    if simulate_failure:
        raise ChecklistGenerationError("The model request failed before a checklist was returned.")
    try:
        pages = read_pages(file_path)
    except Exception as exc:
        raise ChecklistGenerationError("The PDF could not be read.") from exc
    if not any(page.strip() for page in pages):
        raise UnreadablePdfError(
            "This PDF has no extractable text. Upload a searchable PDF to run the review."
        )
    if use_model is None and not provider_has_credentials(settings):
        raise NoModelKeyError(NO_MODEL_KEY_MESSAGE)
    persona = persona_for_client(client_id)
    planned = plan_checks(checks, document_type, client_id)
    live = use_model is not False
    source: ReportSource = "model" if live else "recorded"
    property_line = await resolve_property_line(pages, use_model=use_model)
    if not planned:
        return assemble_report(
            [],
            pages,
            conversation_id=conversation_id,
            client_id=client_id,
            source=source,
            planned=[],
            requested_checks=checks,
            document_type=document_type,
            property_line=property_line,
            persona_id=persona.id,
        )
    if live:
        drafts = await _drafts_from_live_model(pages, planned, checks, document_type, persona)
    else:
        drafts = recorded_drafts(pages, client_id, planned)
    return assemble_report(
        drafts,
        pages,
        conversation_id=conversation_id,
        client_id=client_id,
        source=source,
        planned=planned,
        requested_checks=checks,
        document_type=document_type,
        property_line=property_line,
        persona_id=persona.id,
    )


def checklist_source_for_keys(
    *,
    provider: str,
    anthropic_key: str,
    openai_key: str,
) -> ReportSource:
    """The live model is used only when the selected provider has a key."""
    if provider == "openai":
        if not openai_key.strip():
            raise NoModelKeyError(NO_MODEL_KEY_MESSAGE)
        return "model"
    if not anthropic_key.strip():
        raise NoModelKeyError(NO_MODEL_KEY_MESSAGE)
    return "model"


def _clean_piece(value: str) -> str:
    return " ".join(value.split()).strip(" .;")


def _first_group(text: str, patterns: tuple[str, ...]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        piece = _clean_piece(match.group(1))
        if piece:
            return piece
    return None


def _extract_property(text: str) -> tuple[str | None, list[str]]:
    address = _first_group(
        text,
        (
            r"Property address\s*:?\s+([^\n]+)",
            r"Commonly known as\s+([^\n.]+)",
            r"relating to\s+([^\n]+)",
            r"Premises\s*[:\-]\s*([^\n]+)",
            r"known as\s+([^\n,]+,\s*[^\n,]+,\s*[A-Z0-9]{2,4}\s*[A-Z0-9]{3})",
        ),
    )
    if address and (len(address) > 160 or not re.search(r"\d", address)):
        address = None
    apn = _first_group(
        text,
        (
            r"Assessor'?s Parcel No\.?\s+([A-Za-z0-9][A-Za-z0-9\-]+)",
            r"\bAPN\b\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-]+)",
            r"Parcel (?:Number|No\.?)\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-]+)",
        ),
    )
    amount = _first_group(
        text,
        (
            r"Amount of Insurance\s+(\$[\d,]+)",
            r"Proposed Amount of Insurance:\s*(\$[\d,]+)",
            r"(?:purchase price|contract price)[^\n]{0,80}?(\$[\d,]+)",
            r"Initial Rent\b[\s\S]{0,120}?\(([£$][\d,]+)\)",
        ),
    )
    parts: list[str] = []
    if apn:
        parts.append(apn if apn.upper().startswith("APN") else f"APN {apn}")
    if amount:
        parts.append(amount)
    return address, parts


def extract_property_parts(text: str) -> list[str]:
    """Address, then APN, then price. A missing part is left out."""
    address, details = _extract_property(text)
    return [address, *details] if address else details


def property_line_for(pages: list[str], *, source: ReportSource) -> str:
    """Extracted address, APN, and price.

    source="recorded" keeps the shortened Becker fixture line for tests that
    replay that reading. Naming a project always uses the regex pass.
    """
    if source == "recorded" and anchors_present(pages):
        return PROPERTY_LINE
    parts = extract_property_parts("\n".join(pages))
    if not parts:
        return PROPERTY_NOT_FOUND
    return " · ".join(parts)


def address_in_pages(pages: list[str], address: str) -> bool:
    """True when the address is a contiguous span of the extracted text."""
    return normalize_text(address) in normalize_text("\n".join(pages))


async def _resolve_property(
    pages: list[str], *, use_model: bool | None = None
) -> tuple[str | None, str]:
    address, details = _extract_property("\n".join(pages))
    if not address:
        if use_model is True and not provider_has_credentials(settings):
            raise NoModelKeyError(NO_MODEL_KEY_MESSAGE)
        live = provider_has_credentials(settings) if use_model is None else use_model
        if live:
            excerpt = "\n\n".join(pages[:3])[:8000]
            try:
                candidate = await extract_property_address(excerpt)
            except NoModelKeyError:
                raise
            except Exception:
                logger.exception("Property address extraction failed")
            else:
                if (
                    candidate
                    and normalize_text(candidate)
                    not in {normalize_text(detail) for detail in details}
                    and address_in_pages(pages, candidate)
                ):
                    address = candidate
    parts = [address, *details] if address else details
    return address, " · ".join(parts) or PROPERTY_NOT_FOUND


async def resolve_property_line(pages: list[str], *, use_model: bool | None = None) -> str:
    """Return the available address, parcel number, and price for the report."""
    _, line = await _resolve_property(pages, use_model=use_model)
    return line


async def resolve_property_address(pages: list[str]) -> str | None:
    """Return only the extracted street address."""
    address, _ = await _resolve_property(pages)
    return address


async def apply_project_title(session: AsyncSession, conversation_id: str, file_path: str) -> None:
    """Name the project after the property address, unless a person renamed it.

    The extracted line is stored either way. A later rename changes the title
    only, and the Property row keeps this line.
    """
    try:
        pages = read_pages(file_path)
    except Exception:
        logger.exception(
            "Could not read the PDF for a project title", conversation_id=conversation_id
        )
        return
    try:
        address, line = await _resolve_property(pages)
    except Exception:
        logger.exception(
            "Could not resolve a property address for the project title",
            conversation_id=conversation_id,
        )
        return
    if line == PROPERTY_NOT_FOUND:
        return
    conversation = await session.get(
        Conversation, conversation_id, populate_existing=True, with_for_update=True
    )
    if (
        conversation is None
        or await session.scalar(
            select(Document.id).where(
                Document.conversation_id == conversation_id, Document.file_path == file_path
            )
        )
        is None
    ):
        return
    conversation.property_line = line
    if conversation.title_source != "custom" and address and len(address) <= 120:
        conversation.title = address
        conversation.title_source = "document"
    await session.commit()


def grounded_document_line(pages: list[str], excerpt: str, catalog_says: str) -> str:
    """The Document sentence for a verified finding.

    A canned paraphrase is kept only when that paraphrase itself is in the file.
    The Not found sentence is never used once a quote has verified.
    """
    canned = catalog_says.strip()
    if canned and canned != PROPERTY_NOT_FOUND and locate_excerpt(pages, canned, None) is not None:
        return canned
    return excerpt.strip()


def stored_property_line(title: str, title_source: str, property_line: str | None) -> str | None:
    """The extracted line, or the address kept as a document title before that column existed."""
    if property_line and property_line.strip() and property_line.strip() != PROPERTY_NOT_FOUND:
        return property_line.strip()
    if title_source == "document":
        address = title.strip()
        if address and address != PROPERTY_NOT_FOUND:
            return address
    return None


def with_stored_property(report: TitleChecklistReport, stored: str | None) -> TitleChecklistReport:
    """Use the extracted address when a saved report still says it was not found."""
    current = (report.property_line or "").strip()
    if current and current != PROPERTY_NOT_FOUND:
        return report
    if not stored:
        return report
    return report.model_copy(update={"property_line": stored})


def generation_failure_detail(exc: ChecklistGenerationError) -> dict[str, str]:
    """Structured error body nested under HTTPException.detail."""
    return {"error": "generation_failed", "message": str(exc)}
