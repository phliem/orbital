"""Fixture checks for the Becker Station title commitment."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from takehome.services.checklist import (
    PROPERTY_NOT_FOUND,
    ChecklistGenerationError,
    ModelFinding,
    ModelReport,
    RequestedCheck,
    TitleChecklistReport,
    assemble_report,
    checklist_source_for_keys,
    extract_property_parts,
    generate_title_checklist,
    generation_failure_detail,
    grounded_document_line,
    property_line_for,
    recorded_drafts,
)
from takehome.services.citations import excerpt_on_page, read_pages
from takehome.services.llm import NO_MODEL_KEY_MESSAGE, NoModelKeyError, chat_with_document

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "sample-docs"
    / "alta-title-commitment-733-becker-station.pdf"
)


def _item(report, check_id: str):
    match = next(item for item in report.items if item.check_id == check_id)
    return match


def test_fixture_pages_contain_planted_facts() -> None:
    pages = read_pages(str(FIXTURE))
    assert len(pages) == 3
    assert "three (3) stories" in pages[1]
    assert "thirty-six (36) feet" in pages[1]
    assert "$4,200,000" in pages[1]
    assert "First Pioneer Bank" in pages[1]
    assert "drive-through restaurant" in pages[2]
    assert "storm drainage easement" in pages[2]
    assert "Becker Station Lane" in pages[2]
    assert "ALTA/NSPS" in pages[1]


_RESIDENTIAL = (
    "building_height_and_massing",
    "buildable_area_easements",
    "monetary_encumbrances",
    "use_restrictions",
    "access_rights",
)
_COMMERCIAL = (
    "permitted_use",
    "premises_easements",
    "access_and_shared_drives",
    "security_interests",
    "building_limits",
)


def _assert_grounded(report, check_id: str, page: int, phrase: str) -> None:
    item = _item(report, check_id)
    assert item.status == "found"
    assert item.citation.verified is True
    assert item.citation.page == page
    assert item.citation.excerpt is not None
    assert phrase in item.citation.excerpt
    assert item.document_says == item.citation.excerpt
    assert item.parent_id == check_id
    assert "fourth" not in item.assessments[report.client_id].recommendation.lower()
    assert "snda" not in item.assessments[report.client_id].recommendation.lower()


@pytest.mark.asyncio
async def test_residential_fixture_uses_generic_categories() -> None:
    report = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="willowbank",
        use_model=False,
    )
    assert report.source == "recorded"
    assert report.persona_id == "residential_developer"
    assert [item.check_id for item in report.items] == list(_RESIDENTIAL)
    assert report.property_line == (
        "733 Becker Station Road, Fairmont Crossing, Colorado 80991 · "
        "APN 1973-08-4-12-008 · $6,850,000"
    )
    pages = read_pages(str(FIXTURE))
    _assert_grounded(report, "building_height_and_massing", 2, "three (3) stories")
    _assert_grounded(report, "buildable_area_easements", 3, "storm drainage easement")
    _assert_grounded(report, "monetary_encumbrances", 2, "First Pioneer Bank")
    _assert_grounded(report, "use_restrictions", 3, "drive-through restaurant")
    _assert_grounded(report, "access_rights", 3, "Becker Station Lane")
    height = _item(report, "building_height_and_massing")
    assert height.citation.excerpt is not None
    assert excerpt_on_page(pages[1], height.citation.excerpt)
    assert "northstar" not in height.assessments
    assert "open_demolition_permit" not in {item.check_id for item in report.items}


@pytest.mark.asyncio
async def test_commercial_tenant_files_the_same_clauses_under_its_own_categories() -> None:
    residential = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="willowbank",
        use_model=False,
    )
    commercial = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="northstar",
        use_model=False,
    )
    assert commercial.persona_id == "commercial_tenant"
    assert [item.check_id for item in commercial.items] == list(_COMMERCIAL)
    _assert_grounded(commercial, "permitted_use", 3, "drive-through restaurant")
    _assert_grounded(commercial, "premises_easements", 3, "storm drainage easement")
    _assert_grounded(commercial, "access_and_shared_drives", 3, "Becker Station Lane")
    _assert_grounded(commercial, "security_interests", 2, "First Pioneer Bank")
    _assert_grounded(commercial, "building_limits", 2, "three (3) stories")
    assert (
        _item(commercial, "building_limits").citation.excerpt
        == _item(residential, "building_height_and_massing").citation.excerpt
    )
    assert (
        _item(commercial, "permitted_use").citation.excerpt
        == _item(residential, "use_restrictions").citation.excerpt
    )
    assert "willowbank" not in _item(commercial, "security_interests").assessments


def test_forged_excerpt_is_not_a_citation() -> None:
    pages = read_pages(str(FIXTURE))
    drafts = recorded_drafts(pages)
    drafts[0].excerpt = "This sentence does not appear in the commitment."
    report = assemble_report(
        drafts,
        pages,
        conversation_id="becker",
        client_id="willowbank",
        source="recorded",
    )
    height = _item(report, "building_height_and_massing")
    assert height.citation.verified is False
    assert height.citation.excerpt is None
    assert height.status == "not_found"
    assert height.document_says == "Not found in this document."
    assert height.assessments["willowbank"].summary == "Not found in this document."
    assert height.assessments["willowbank"].risk == "needs_evidence"
    assert "fourth" not in height.assessments["willowbank"].recommendation.lower()
    assert "northstar" not in height.assessments


def test_a_short_quote_is_not_evidence() -> None:
    pages = read_pages(str(FIXTURE))
    drafts = recorded_drafts(pages)
    drafts[0].excerpt = "the Land"
    report = assemble_report(
        drafts,
        pages,
        conversation_id="becker",
        client_id="willowbank",
        source="recorded",
    )
    height = _item(report, "building_height_and_massing")
    assert height.status == "not_found"
    assert height.citation.verified is False
    assert height.citation.excerpt is None
    assert height.assessments["willowbank"].summary == "Not found in this document."


def test_verified_document_line_uses_the_excerpt_unless_the_paraphrase_is_in_the_file() -> None:
    pages = read_pages(str(FIXTURE))
    height = next(
        item.excerpt
        for item in recorded_drafts(pages)
        if item.check_id == "building_height_and_massing"
    )
    assert height is not None
    assert grounded_document_line(pages, height, "Not found in this document.") == height
    paraphrase = (
        "No building may exceed three stories or 36 feet, measured from 1987 finished grade."
    )
    assert grounded_document_line(pages, height, paraphrase) == height
    drive = next(
        item.excerpt for item in recorded_drafts(pages) if item.check_id == "use_restrictions"
    )
    assert drive is not None
    assert grounded_document_line(pages, drive, drive) == drive


def test_other_document_is_not_found() -> None:
    pages = ["A short lease for a different building."]
    report = assemble_report(
        recorded_drafts(pages),
        pages,
        conversation_id="other",
        client_id="willowbank",
        source="recorded",
    )
    assert len(report.items) == 5
    assert all(item.status == "not_found" for item in report.items)
    assert all(item.citation.verified is False for item in report.items)
    assert all(item.document_says == "Not found in this document." for item in report.items)
    assert report.property_line == PROPERTY_NOT_FOUND


def test_property_line_joins_the_parts_that_are_present() -> None:
    labeled = "\n".join(
        [
            "Property address",
            "15 Market Street, Denver, Colorado 80202",
            "Assessor's Parcel No.",
            "12-34-567",
            "Amount of Insurance",
            "$1,250,000 (proposed purchase price)",
            "Deed of Trust securing an original principal amount of $4,200,000",
        ]
    )
    assert extract_property_parts(labeled) == [
        "15 Market Street, Denver, Colorado 80202",
        "APN 12-34-567",
        "$1,250,000",
    ]
    assert property_line_for([labeled], source="recorded") == (
        "15 Market Street, Denver, Colorado 80202 · APN 12-34-567 · $1,250,000"
    )

    address_only = "relating to\nFloors 8-10, 100 Bishopsgate, London EC2M 1GT\n"
    assert property_line_for([address_only], source="model") == (
        "Floors 8-10, 100 Bishopsgate, London EC2M 1GT"
    )
    lease = (
        "relating to\nFloors 8-10, 100 Bishopsgate, London EC2M 1GT\n"
        '"the Initial Rent" means Eight Hundred and Fifty Thousand Pounds (£850,000) per annum'
    )
    assert property_line_for([lease], source="recorded") == (
        "Floors 8-10, 100 Bishopsgate, London EC2M 1GT · £850,000"
    )
    assert property_line_for(["No address, parcel, or price in this file."], source="recorded") == (
        PROPERTY_NOT_FOUND
    )


def test_generation_failure_payload() -> None:
    detail = generation_failure_detail(
        ChecklistGenerationError("The model request failed before a checklist was returned.")
    )
    assert detail["error"] == "generation_failed"
    assert "failed" in detail["message"]


@pytest.mark.asyncio
async def test_simulate_failure_raises() -> None:
    with pytest.raises(ChecklistGenerationError):
        await generate_title_checklist(
            file_path=str(FIXTURE),
            conversation_id="becker",
            client_id="willowbank",
            simulate_failure=True,
        )


def _commercial_without_building_limits() -> list[RequestedCheck]:
    return [
        RequestedCheck(
            title="Permitted use and use restrictions", category="Included in this review"
        ),
        RequestedCheck(title="Easements across the premises", category="Included in this review"),
        RequestedCheck(title="Access and shared drives", category="Included in this review"),
        RequestedCheck(
            title="Security interests and occupation", category="Included in this review"
        ),
    ]


@pytest.mark.asyncio
async def test_unselected_category_is_omitted_and_the_prompt_has_no_canned_risk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    checks = _commercial_without_building_limits()
    recorded = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="northstar",
        use_model=False,
        checks=checks,
    )
    recorded_ids = [item.check_id for item in recorded.items]
    assert recorded_ids == [
        "permitted_use",
        "premises_easements",
        "access_and_shared_drives",
        "security_interests",
    ]
    assert "building_limits" not in recorded_ids
    assert "building_height_and_massing" not in recorded_ids
    assert recorded.items[0].citation.verified is True

    captured: dict[str, str] = {}

    class FakeAgent:
        def __init__(self, model: object, *, output_type: object, system_prompt: str) -> None:
            captured["system"] = system_prompt

        async def run(self, prompt: str) -> SimpleNamespace:
            captured["user"] = prompt
            return SimpleNamespace(output=ModelReport(findings=[]))

    monkeypatch.setattr("takehome.services.llm.build_model", lambda: "fake-model")
    monkeypatch.setattr("pydantic_ai.Agent", FakeAgent)

    report = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="northstar",
        use_model=True,
        checks=checks,
    )
    user = captured["user"].split("--- Page", 1)[0]
    selected, _, excluded = user.partition("Excluded categories")
    blob = captured["system"] + "\n" + user
    lowered = blob.lower()
    assert "Excluded categories" in user
    assert "building_limits" in excluded
    assert "building_limits" not in selected
    assert "do not report a clause that belongs to an excluded category" in excluded.lower()
    assert "building_height_and_massing" not in blob
    assert "permitted_use" in selected
    assert "security_interests" in selected
    assert "snda" not in lowered
    assert "fourth" not in lowered
    assert "52 homes" not in lowered
    assert "drive-through" not in lowered
    assert "first pioneer" not in lowered
    assert "becker" not in lowered
    assert "usually absent" not in lowered
    assert "willowbank" not in captured["system"].lower()
    assert "distinct" in captured["system"].lower()
    assert [item.check_id for item in report.items] == recorded_ids
    assert all(item.status == "not_found" for item in report.items)


def _residential_without_height() -> list[RequestedCheck]:
    return [
        RequestedCheck(title=title, category="Included in this review")
        for title in (
            "Easements over the buildable area",
            "Monetary encumbrances",
            "Use restrictions",
            "Access",
        )
    ]


@pytest.mark.asyncio
async def test_unticked_height_is_not_filed_under_use_restrictions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    full = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="willowbank",
        use_model=False,
    )
    height = _item(full, "building_height_and_massing").citation.excerpt
    use = _item(full, "use_restrictions").citation.excerpt
    assert height is not None and "three (3) stories" in height
    assert use is not None and "drive-through" in use

    checks = _residential_without_height()
    recorded = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="willowbank",
        use_model=False,
        checks=checks,
    )
    recorded_text = " ".join(item.citation.excerpt or "" for item in recorded.items)
    assert "three (3) stories" not in recorded_text
    assert "Height restriction" not in [item.short_title for item in recorded.items]
    assert "building_height_and_massing" not in {item.parent_id for item in recorded.items}

    captured: dict[str, str] = {}

    class FakeAgent:
        def __init__(self, model: object, *, output_type: object, system_prompt: str) -> None:
            captured["system"] = system_prompt

        async def run(self, prompt: str) -> SimpleNamespace:
            captured["user"] = prompt
            return SimpleNamespace(
                output=ModelReport(
                    findings=[
                        _model_finding("building_height_and_massing", height, "Height restriction"),
                        _model_finding("use_restrictions", use, "Use restrictions"),
                    ]
                )
            )

    monkeypatch.setattr("takehome.services.llm.build_model", lambda: "fake-model")
    monkeypatch.setattr("pydantic_ai.Agent", FakeAgent)

    report = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="willowbank",
        use_model=True,
        checks=checks,
    )
    user = captured["user"].split("--- Page", 1)[0]
    selected, _, excluded = user.partition("Excluded categories")
    assert "building_height_and_massing" in excluded
    assert "Height and massing" in excluded
    assert "building_height_and_massing" not in selected
    assert "excludes height and bulk" in selected.lower()
    assert "do not report a clause that belongs to an excluded category" in user.lower()
    assert (
        "do not report a clause that belongs to an excluded category" in captured["system"].lower()
    )
    ids = [item.check_id for item in report.items]
    assert "building_height_and_massing" not in ids
    assert not any(item.check_id.startswith("building_height_and_massing") for item in report.items)
    use_items = [item for item in report.items if item.parent_id == "use_restrictions"]
    assert len(use_items) == 1
    assert use_items[0].citation.excerpt == use
    assert use_items[0].short_title != "Height restriction"
    assert "three (3) stories" not in " ".join(item.citation.excerpt or "" for item in report.items)


@pytest.mark.asyncio
async def test_chat_without_a_key_does_not_call_the_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("takehome.services.llm.provider_has_credentials", lambda: False)

    def boom() -> None:
        raise AssertionError("the model was called")

    monkeypatch.setattr("takehome.services.llm.get_agent", boom)
    with pytest.raises(NoModelKeyError, match="No LLM API key configured"):
        async for _chunk in chat_with_document(
            "What are the biggest risks?",
            "Deed of Trust in favor of First Pioneer Bank.",
            [],
        ):
            raise AssertionError("a chunk was yielded")


def test_provider_keys_choose_model_or_refuse() -> None:
    with pytest.raises(NoModelKeyError, match="No LLM API key configured"):
        checklist_source_for_keys(provider="anthropic", anthropic_key="", openai_key="")
    assert (
        checklist_source_for_keys(provider="anthropic", anthropic_key="sk-ant", openai_key="")
        == "model"
    )
    with pytest.raises(NoModelKeyError):
        checklist_source_for_keys(provider="openai", anthropic_key="sk-ant", openai_key="")
    assert (
        checklist_source_for_keys(provider="openai", anthropic_key="", openai_key="sk-openai")
        == "model"
    )


@pytest.mark.asyncio
async def test_generation_without_a_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: False,
    )
    with pytest.raises(NoModelKeyError, match="No LLM API key configured") as caught:
        await generate_title_checklist(
            file_path=str(FIXTURE),
            conversation_id="becker",
            client_id="willowbank",
        )
    assert str(caught.value) == NO_MODEL_KEY_MESSAGE


def _model_finding(category_id: str, excerpt: str, short_title: str) -> ModelFinding:
    return ModelFinding(
        category_id=category_id,
        status="found",
        page=1,
        excerpt=excerpt,
        short_title=short_title,
        risk="issue",
        summary=short_title,
        recommendation="Confirm this item before relying on it.",
    )


@pytest.mark.asyncio
async def test_custom_check_without_a_key_is_not_found() -> None:
    report = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="willowbank",
        use_model=False,
        document_type="commercial-lease",
        checks=[RequestedCheck(title="Repair obligations", category="Added by you")],
    )
    assert report.document_type == "commercial-lease"
    assert [item.title for item in report.items] == ["Repair obligations"]
    item = report.items[0]
    assert item.check_id == "custom:repair_obligations"
    assert item.status == "not_found"
    assert item.document_says == "Not found in this document."
    assert item.citation.verified is False
    assert item.assessments["willowbank"].summary == "Not found in this document."


@pytest.mark.asyncio
async def test_empty_lease_selection_returns_no_findings() -> None:
    report = await generate_title_checklist(
        file_path=str(FIXTURE),
        conversation_id="becker",
        client_id="willowbank",
        use_model=False,
        document_type="commercial-lease",
        checks=[],
    )
    assert report.items == []
    assert report.document_type == "commercial-lease"


@pytest.mark.asyncio
async def test_lease_custom_check_is_sent_to_the_model(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import fitz

    path = tmp_path / "lease.pdf"
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_textbox(
        fitz.Rect(72, 72, 540, 700),
        "LEASE\nThe Tenant shall keep the Premises in good repair.\n",
    )
    pdf.save(path)
    pdf.close()

    captured: dict[str, str] = {}

    class FakeAgent:
        def __init__(self, model: object, *, output_type: object, system_prompt: str) -> None:
            captured["system"] = system_prompt

        async def run(self, prompt: str) -> SimpleNamespace:
            captured["user"] = prompt
            return SimpleNamespace(
                output=ModelReport(
                    findings=[
                        _model_finding(
                            "custom:repair_obligations",
                            "The Tenant shall keep the Premises in good repair.",
                            "Repair clause",
                        )
                    ]
                )
            )

    monkeypatch.setattr("takehome.services.llm.build_model", lambda: "fake-model")
    monkeypatch.setattr(
        "takehome.services.llm.provider_has_credentials",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr("pydantic_ai.Agent", FakeAgent)

    report = await generate_title_checklist(
        file_path=str(path),
        conversation_id="lease",
        client_id="willowbank",
        use_model=True,
        document_type="commercial-lease",
        checks=[RequestedCheck(title="Repair obligations", category="Added by you")],
    )
    assert "Repair obligations" in captured["user"]
    assert "custom:repair_obligations" in captured["user"]
    assert "distinct item" in captured["system"].lower()
    assert "building_height_and_massing" not in captured["system"]
    assert "Document type: Commercial Lease" in captured["user"]
    assert "Repair obligations" in captured["user"]
    assert len(report.items) == 1
    item = report.items[0]
    assert item.title == "Repair obligations"
    assert item.short_title == "Repair clause"
    assert item.parent_id == "custom:repair_obligations"
    assert item.status == "found"
    assert item.citation.verified is True
    assert item.document_says
    assert report.document_type == "commercial-lease"


@pytest.mark.asyncio
async def test_an_instruction_returns_one_card_per_incident(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import fitz

    incidents = (
        (
            "2014 diesel spill",
            "On 12 March 2014 a diesel spill of about 200 litres was recorded beside the north loading bay.",
        ),
        (
            "2018 solvent in the tank pit",
            "In June 2018 solvent was found in the former tank pit at the south boundary.",
        ),
        (
            "2021 stained soil",
            "A 2021 inspection noted stained soil next to the waste oil store.",
        ),
    )
    path = tmp_path / "phase-i.pdf"
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_textbox(
        fitz.Rect(72, 72, 540, 760),
        "Property address: 15 Market Street, Denver, Colorado 80202\n"
        "ENVIRONMENTAL SITE ASSESSMENT\n"
        + "\n".join(sentence for _title, sentence in incidents)
        + "\n",
    )
    pdf.save(path)
    pdf.close()

    class FakeAgent:
        def __init__(self, model: object, *, output_type: object, system_prompt: str) -> None:
            return None

        async def run(self, prompt: str) -> SimpleNamespace:
            findings = [
                _model_finding("custom:find_pollution_incidents", sentence, title)
                for title, sentence in incidents
            ]
            findings.append(
                _model_finding(
                    "custom:find_pollution_incidents",
                    "This invented spill does not appear in the file.",
                    "Invented spill",
                )
            )
            return SimpleNamespace(output=ModelReport(findings=findings))

    monkeypatch.setattr("takehome.services.llm.build_model", lambda: "fake-model")
    monkeypatch.setattr(
        "takehome.services.llm.provider_has_credentials",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        "takehome.services.checklist.extract_property_address",
        lambda _text: None,
    )
    monkeypatch.setattr("pydantic_ai.Agent", FakeAgent)

    report = await generate_title_checklist(
        file_path=str(path),
        conversation_id="phase-i",
        client_id="northstar",
        use_model=True,
        document_type="environmental-assessments",
        checks=[RequestedCheck(title="find pollution incidents", category="Added by you")],
    )
    assert report.document_type == "environmental-assessments"
    assert len(report.items) == 3
    assert [item.short_title for item in report.items] == [title for title, _sentence in incidents]
    assert {item.parent_id for item in report.items} == {"custom:find_pollution_incidents"}
    assert {item.title for item in report.items} == {"find pollution incidents"}
    pages = read_pages(str(path))
    for item, (_title, sentence) in zip(report.items, incidents, strict=True):
        assert item.status == "found"
        assert item.citation.verified is True
        assert item.citation.page == 1
        assert item.citation.excerpt == sentence
        assert item.check_id in {
            "custom:find_pollution_incidents",
            "custom:find_pollution_incidents:2",
            "custom:find_pollution_incidents:3",
        }
        assert excerpt_on_page(pages[0], sentence)
        assert item.assessments["northstar"].summary == item.short_title
    assert all("Invented" not in (item.short_title or "") for item in report.items)


@pytest.mark.asyncio
async def test_an_instruction_with_no_verified_item_is_not_found(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import fitz

    path = tmp_path / "clean.pdf"
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_textbox(
        fitz.Rect(72, 72, 540, 400),
        "Property address: 15 Market Street, Denver, Colorado 80202\n"
        "ENVIRONMENTAL SITE ASSESSMENT\nNo spills recorded.\n",
    )
    pdf.save(path)
    pdf.close()

    class FakeAgent:
        def __init__(self, model: object, *, output_type: object, system_prompt: str) -> None:
            return None

        async def run(self, prompt: str) -> SimpleNamespace:
            return SimpleNamespace(
                output=ModelReport(
                    findings=[
                        ModelFinding(
                            category_id="custom:find_pollution_incidents",
                            status="found",
                            page=1,
                            excerpt="A diesel spill that was never written down.",
                            short_title="Missing spill",
                            risk="issue",
                            summary="A diesel spill.",
                            recommendation="Treat it as an issue.",
                        )
                    ]
                )
            )

    monkeypatch.setattr("takehome.services.llm.build_model", lambda: "fake-model")
    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        "takehome.services.checklist.extract_property_address",
        lambda _text: None,
    )
    monkeypatch.setattr("pydantic_ai.Agent", FakeAgent)
    report = await generate_title_checklist(
        file_path=str(path),
        conversation_id="clean",
        client_id="willowbank",
        use_model=True,
        document_type="environmental-assessments",
        checks=[RequestedCheck(title="find pollution incidents", category="Added by you")],
    )
    assert len(report.items) == 1
    item = report.items[0]
    assert item.status == "not_found"
    assert item.short_title == "find pollution incidents"
    assert item.citation.excerpt is None
    assert item.assessments["willowbank"].summary == "Not found in this document."
    assert "issue" not in item.assessments["willowbank"].recommendation.lower()
    assert "diesel" not in item.assessments["willowbank"].summary.lower()


def test_an_old_report_payload_still_loads() -> None:
    report = TitleChecklistReport.model_validate(
        {
            "conversation_id": "old",
            "client_id": "willowbank",
            "source": "model",
            "items": [
                {
                    "check_id": "height_restriction",
                    "title": "Height restriction",
                    "short_title": "Height restriction",
                    "clause": "Exception 8(a)",
                    "status": "found",
                    "document_says": "No building may exceed three stories.",
                    "citation": {
                        "page": 2,
                        "clause": "Exception 8(a)",
                        "excerpt": "three stories or thirty-six feet",
                        "verified": True,
                    },
                    "assessments": {
                        "willowbank": {
                            "risk": "issue",
                            "summary": "Caps height.",
                            "recommendation": "Redesign.",
                            "certainty": "medium",
                        },
                        "northstar": {
                            "risk": "low_priority",
                            "summary": "Under the cap.",
                            "recommendation": "No action.",
                            "certainty": "high",
                        },
                    },
                }
            ],
        }
    )
    assert report.persona_id is None
    assert report.items[0].parent_id == ""
    willowbank = report.items[0].assessments["willowbank"]
    assert willowbank.risk == "issue"
    assert "certainty" not in willowbank.model_dump()
    assert report.items[0].assessments["northstar"].risk == "low_priority"


@pytest.mark.asyncio
async def test_run_without_a_key_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    import io

    from fastapi import HTTPException, UploadFile
    from starlette.datastructures import Headers

    from takehome.db.session import async_session, engine
    from takehome.services.conversation import create_conversation, delete_conversation
    from takehome.services.document import upload_document
    from takehome.web.routers.checklist import ChecklistCreate, create_title_checklist

    monkeypatch.setattr(
        "takehome.services.checklist.provider_has_credentials",
        lambda *_args, **_kwargs: False,
    )
    conversation_id = ""
    try:
        async with async_session() as session:
            conversation = await create_conversation(session)
            conversation_id = conversation.id
            await upload_document(
                session,
                conversation_id,
                UploadFile(
                    file=io.BytesIO(FIXTURE.read_bytes()),
                    filename=FIXTURE.name,
                    headers=Headers({"content-type": "application/pdf"}),
                ),
            )
        async with async_session() as session:
            with pytest.raises(HTTPException) as caught:
                await create_title_checklist(
                    conversation_id,
                    ChecklistCreate(
                        client_id="northstar",
                        document_type="environmental-assessments",
                        checks=[RequestedCheck(title="Break clause", category="Added by you")],
                    ),
                    session,
                )
        assert caught.value.status_code == 503
        detail = caught.value.detail
        assert isinstance(detail, dict)
        assert detail["error"] == "no_api_key"
        assert detail["message"] == NO_MODEL_KEY_MESSAGE
    finally:
        if conversation_id:
            async with async_session() as session:
                await delete_conversation(session, conversation_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_run_stores_document_type_on_the_document(monkeypatch: pytest.MonkeyPatch) -> None:
    import io

    from fastapi import UploadFile
    from sqlalchemy import select
    from starlette.datastructures import Headers

    from takehome.db.models import Document
    from takehome.db.session import async_session, engine
    from takehome.services.checklist import TitleChecklistReport
    from takehome.services.conversation import create_conversation, delete_conversation
    from takehome.services.document import upload_document
    from takehome.web.routers.checklist import ChecklistCreate, create_title_checklist

    async def fake_generate(**kwargs: object) -> TitleChecklistReport:
        return TitleChecklistReport(
            conversation_id=str(kwargs["conversation_id"]),
            client_id="northstar",
            source="model",
            document_type="environmental-assessments",
            items=[],
        )

    monkeypatch.setattr(
        "takehome.web.routers.checklist.generate_title_checklist",
        fake_generate,
    )
    conversation_id = ""
    try:
        async with async_session() as session:
            conversation = await create_conversation(session)
            conversation_id = conversation.id
            await upload_document(
                session,
                conversation_id,
                UploadFile(
                    file=io.BytesIO(FIXTURE.read_bytes()),
                    filename=FIXTURE.name,
                    headers=Headers({"content-type": "application/pdf"}),
                ),
            )
        async with async_session() as session:
            report = await create_title_checklist(
                conversation_id,
                ChecklistCreate(
                    client_id="northstar",
                    document_type="environmental-assessments",
                    checks=[RequestedCheck(title="Break clause", category="Added by you")],
                ),
                session,
            )
        assert report.document_type == "environmental-assessments"
        async with async_session() as session:
            stored = await session.scalar(
                select(Document).where(Document.conversation_id == conversation_id)
            )
            assert stored is not None
            assert stored.document_type == "environmental-assessments"
    finally:
        if conversation_id:
            async with async_session() as session:
                await delete_conversation(session, conversation_id)
        await engine.dispose()


@pytest.mark.asyncio
async def test_chat_without_a_key_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    from takehome.db.session import async_session, engine
    from takehome.services.conversation import create_conversation, delete_conversation
    from takehome.web.routers.messages import MessageCreate, send_message

    monkeypatch.setattr(
        "takehome.web.routers.messages.provider_has_credentials",
        lambda: False,
    )
    conversation_id = ""
    try:
        async with async_session() as session:
            conversation = await create_conversation(session)
            conversation_id = conversation.id
            with pytest.raises(HTTPException) as caught:
                await send_message(conversation_id, MessageCreate(content="Hello"), session)
        assert caught.value.status_code == 503
        detail = caught.value.detail
        assert isinstance(detail, dict)
        assert detail["message"] == NO_MODEL_KEY_MESSAGE
    finally:
        if conversation_id:
            async with async_session() as session:
                await delete_conversation(session, conversation_id)
        await engine.dispose()
