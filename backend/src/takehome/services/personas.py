"""Lawyer-edited title personas. Loaded once, and rejected if the file is unsound."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

ClientId = Literal["willowbank", "northstar"]
_REQUIRED_CLIENTS = frozenset({"willowbank", "northstar"})
_SLUG = re.compile(r"[a-z][a-z0-9_]*")
DEFAULT_PATH = Path(__file__).resolve().parents[3] / "config" / "personas.yaml"
GROUP_LABELS = {"included": "Included in this review"}


class PersonaConfigError(RuntimeError):
    """backend/config/personas.yaml cannot be used."""


class CategoryDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str
    guidance: str
    evidence: str
    group: Literal["included"]
    enabled_by_default: bool = True

    @field_validator("id", "name", "description", "guidance", "evidence")
    @classmethod
    def _collapsed(cls, value: str) -> str:
        text = " ".join(value.split()).strip()
        if not text:
            raise ValueError("must not be blank")
        return text

    @field_validator("id")
    @classmethod
    def _slug(cls, value: str) -> str:
        if not _SLUG.fullmatch(value):
            raise ValueError("id must be a lowercase slug")
        if value.startswith("custom"):
            raise ValueError("id is reserved")
        return value


class PersonaDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str
    categories: list[CategoryDef]

    @field_validator("id", "name", "description")
    @classmethod
    def _collapsed(cls, value: str) -> str:
        text = " ".join(value.split()).strip()
        if not text:
            raise ValueError("must not be blank")
        return text

    @field_validator("id")
    @classmethod
    def _slug(cls, value: str) -> str:
        if not _SLUG.fullmatch(value):
            raise ValueError("id must be a lowercase slug")
        return value

    @model_validator(mode="after")
    def _unique_categories(self) -> PersonaDef:
        if not self.categories:
            raise ValueError(f"{self.id} has no categories")
        ids = [category.id for category in self.categories]
        names = [category.name for category in self.categories]
        if len(ids) != len(set(ids)):
            raise ValueError(f"{self.id} repeats a category id")
        if len(names) != len(set(names)):
            raise ValueError(f"{self.id} repeats a category name")
        return self


class ClientDef(BaseModel):
    """An example client. Categories live on the persona, not here."""

    model_config = ConfigDict(extra="forbid")

    id: ClientId
    name: str
    persona: str

    @field_validator("name", "persona")
    @classmethod
    def _collapsed(cls, value: str) -> str:
        text = " ".join(value.split()).strip()
        if not text:
            raise ValueError("must not be blank")
        return text


class PersonaFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    personas: list[PersonaDef] = Field(min_length=1)
    clients: list[ClientDef] = Field(min_length=1)

    @model_validator(mode="after")
    def _references(self) -> PersonaFile:
        persona_ids = [persona.id for persona in self.personas]
        if len(persona_ids) != len(set(persona_ids)):
            raise ValueError("duplicate persona id")
        known = set(persona_ids)
        client_ids = [client.id for client in self.clients]
        if len(client_ids) != len(set(client_ids)):
            raise ValueError("duplicate client id")
        if set(client_ids) != set(_REQUIRED_CLIENTS):
            raise ValueError("clients must be willowbank and northstar")
        for client in self.clients:
            if client.persona not in known:
                raise ValueError(f"{client.id} points at an unknown persona")
        return self


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _scalar(text: str) -> object:
    if text in {"true", "True"}:
        return True
    if text in {"false", "False"}:
        return False
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
        return text[1:-1]
    return text


def _content_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        lines.append(raw.rstrip())
    return lines


def _parse_block(lines: list[str], index: int, indent: int) -> tuple[object, int]:
    if index >= len(lines):
        return {}, index
    if lines[index].strip().startswith("- "):
        return _parse_list(lines, index, indent)
    return _parse_map(lines, index, indent)


def _parse_folded(lines: list[str], index: int, indent: int) -> tuple[str, int]:
    parts: list[str] = []
    while index < len(lines) and _indent(lines[index]) >= indent:
        parts.append(lines[index].strip())
        index += 1
    return " ".join(parts).strip(), index


def _parse_map(lines: list[str], index: int, indent: int) -> tuple[dict[str, object], int]:
    result: dict[str, object] = {}
    while index < len(lines):
        current = _indent(lines[index])
        if current < indent or lines[index].strip().startswith("- "):
            break
        if current != indent:
            raise PersonaConfigError(f"Unexpected indent in personas.yaml: {lines[index].strip()}")
        text = lines[index].strip()
        key, sep, rest = text.partition(":")
        if not sep or not key.strip():
            raise PersonaConfigError(f"Expected a key in personas.yaml: {text}")
        key = key.strip()
        rest = rest.strip()
        index += 1
        if rest in {">", "|"}:
            value, index = _parse_folded(lines, index, indent + 2)
            result[key] = value
            continue
        if rest == "":
            if index < len(lines) and _indent(lines[index]) > indent:
                child, index = _parse_block(lines, index, _indent(lines[index]))
                result[key] = child
            else:
                result[key] = ""
            continue
        result[key] = _scalar(rest)
    return result, index


def _parse_list(lines: list[str], index: int, indent: int) -> tuple[list[object], int]:
    items: list[object] = []
    while index < len(lines):
        if _indent(lines[index]) != indent or not lines[index].strip().startswith("- "):
            break
        payload = lines[index].strip()[2:]
        index += 1
        if ":" not in payload:
            items.append(_scalar(payload))
            continue
        child_indent = indent + 2
        item_lines = [" " * child_indent + payload]
        while index < len(lines) and _indent(lines[index]) >= child_indent:
            item_lines.append(lines[index])
            index += 1
        child, _ = _parse_map(item_lines, 0, child_indent)
        items.append(child)
    return items, index


def parse_persona_yaml(text: str) -> object:
    """The subset of YAML used by personas.yaml: maps, lists, scalars, and folded text."""
    lines = _content_lines(text)
    if not lines:
        raise PersonaConfigError("personas.yaml is empty")
    parsed, index = _parse_block(lines, 0, _indent(lines[0]))
    if index != len(lines):
        raise PersonaConfigError("personas.yaml has unread lines")
    return parsed


def load_persona_file(path: Path) -> PersonaFile:
    try:
        raw = parse_persona_yaml(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PersonaConfigError(f"Missing {path}") from exc
    except PersonaConfigError:
        raise
    except Exception as exc:
        raise PersonaConfigError(f"Could not read {path}: {exc}") from exc
    try:
        return PersonaFile.model_validate(raw)
    except ValidationError as exc:
        raise PersonaConfigError(f"{path} is invalid: {exc}") from exc


def group_label(group: str) -> str:
    try:
        return GROUP_LABELS[group]
    except KeyError as exc:
        raise PersonaConfigError(f"Unknown category group {group}") from exc


class CheckGroup(BaseModel):
    category: str
    titles: list[str]


def groups_for_persona(persona: PersonaDef) -> list[CheckGroup]:
    """Confirm-checks groups, in file order, skipping categories turned off."""
    groups: list[CheckGroup] = []
    index: dict[str, CheckGroup] = {}
    for category in persona.categories:
        if not category.enabled_by_default:
            continue
        label = group_label(category.group)
        bucket = index.get(label)
        if bucket is None:
            bucket = CheckGroup(category=label, titles=[])
            index[label] = bucket
            groups.append(bucket)
        bucket.titles.append(category.name)
    return groups


_CATALOG = load_persona_file(DEFAULT_PATH)


def persona_catalog() -> PersonaFile:
    return _CATALOG


def persona_for_client(client_id: str) -> PersonaDef:
    catalog = persona_catalog()
    for client in catalog.clients:
        if client.id == client_id:
            for persona in catalog.personas:
                if persona.id == client.persona:
                    return persona
    raise PersonaConfigError(f"No persona for {client_id}")


def category_ids() -> set[str]:
    return {
        category.id for persona in persona_catalog().personas for category in persona.categories
    }
