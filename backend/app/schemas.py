"""API schemas (SPEC §2)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PersonMeta(BaseModel):
    name: str
    thumbnail: str | None
    wiki_url: str
    description: str | None


class Level(BaseModel):
    level: int
    nodes: list[str]


class SearchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    found: bool
    from_: str = Field(alias="from")
    to: str
    length: int | None
    nodes_explored: int
    path: list[PersonMeta]
    levels: list[Level]


class ResolveResponse(BaseModel):
    query: str
    status: Literal["resolved", "ambiguous", "unresolved"]
    person: PersonMeta | None
    candidates: list[PersonMeta]


class PathResponse(BaseModel):
    valid: bool
    path: list[PersonMeta]


class ErrorDetail(BaseModel):
    code: Literal["UNRESOLVED_NAME", "AMBIGUOUS_NAME"]
    param: Literal["from", "to"]
    input: str
    candidates: list[PersonMeta]


class ErrorResponse(BaseModel):
    detail: ErrorDetail
