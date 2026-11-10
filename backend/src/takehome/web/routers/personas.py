"""The persona lists the setup screen confirms."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from takehome.services.personas import CheckGroup, groups_for_persona, persona_catalog

router = APIRouter(prefix="/api", tags=["personas"])


class CategoryOut(BaseModel):
    id: str
    name: str


class PersonaOut(BaseModel):
    id: str
    name: str
    description: str
    categories: list[CategoryOut]


class ClientOut(BaseModel):
    id: str
    name: str
    persona_id: str
    persona_name: str
    groups: list[CheckGroup]


class CatalogOut(BaseModel):
    personas: list[PersonaOut]
    clients: list[ClientOut]


@router.get("/personas", response_model=CatalogOut)
def get_personas() -> CatalogOut:
    catalog = persona_catalog()
    by_id = {persona.id: persona for persona in catalog.personas}
    return CatalogOut(
        personas=[
            PersonaOut(
                id=persona.id,
                name=persona.name,
                description=persona.description,
                categories=[
                    CategoryOut(id=category.id, name=category.name)
                    for category in persona.categories
                ],
            )
            for persona in catalog.personas
        ],
        clients=[
            ClientOut(
                id=client.id,
                name=client.name,
                persona_id=client.persona,
                persona_name=by_id[client.persona].name,
                groups=groups_for_persona(by_id[client.persona]),
            )
            for client in catalog.clients
        ],
    )
