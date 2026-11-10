"""The shipped persona file, and the ways a bad edit is rejected."""

from __future__ import annotations

from pathlib import Path

import pytest

from takehome.services.personas import (
    PersonaConfigError,
    groups_for_persona,
    load_persona_file,
    persona_catalog,
    persona_for_client,
)

RESIDENTIAL = [
    "Height and massing",
    "Easements over the buildable area",
    "Monetary encumbrances",
    "Use restrictions",
    "Access",
]
COMMERCIAL = [
    "Permitted use and use restrictions",
    "Easements across the premises",
    "Access and shared drives",
    "Security interests and occupation",
    "Building limits",
]


def test_shipped_personas_are_five_and_five() -> None:
    catalog = persona_catalog()
    assert [persona.id for persona in catalog.personas] == [
        "residential_developer",
        "commercial_tenant",
    ]
    assert [persona.name for persona in catalog.personas] == [
        "Residential Developer",
        "Commercial Tenant",
    ]
    residential, commercial = catalog.personas
    assert [category.name for category in residential.categories] == RESIDENTIAL
    assert [category.name for category in commercial.categories] == COMMERCIAL
    assert persona_for_client("willowbank").id == "residential_developer"
    assert persona_for_client("northstar").id == "commercial_tenant"
    assert [group.titles for group in groups_for_persona(residential)] == [RESIDENTIAL]
    assert [group.titles for group in groups_for_persona(commercial)] == [COMMERCIAL]


def test_a_client_cannot_define_categories(tmp_path: Path) -> None:
    path = tmp_path / "personas.yaml"
    path.write_text(
        """
personas:
  - id: residential_developer
    name: Residential Developer
    description: Any residential developer or buyer.
    categories:
      - id: access_rights
        name: Access
        description: A way in.
        guidance: Quote the way in.
        evidence: An easement.
        group: included
clients:
  - id: willowbank
    name: Willowbank Homes LLC
    persona: residential_developer
    categories: []
  - id: northstar
    name: Northstar Burger Co.
    persona: residential_developer
""",
        encoding="utf-8",
    )
    with pytest.raises(PersonaConfigError):
        load_persona_file(path)


def test_an_unknown_persona_reference_fails(tmp_path: Path) -> None:
    path = tmp_path / "personas.yaml"
    path.write_text(
        """
personas:
  - id: residential_developer
    name: Residential Developer
    description: Any residential developer or buyer.
    categories:
      - id: access_rights
        name: Access
        description: A way in.
        guidance: Quote the way in.
        evidence: An easement.
        group: included
clients:
  - id: willowbank
    name: Willowbank Homes LLC
    persona: missing
  - id: northstar
    name: Northstar Burger Co.
    persona: residential_developer
""",
        encoding="utf-8",
    )
    with pytest.raises(PersonaConfigError):
        load_persona_file(path)
