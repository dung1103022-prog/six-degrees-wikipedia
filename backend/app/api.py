"""Phase 1 API routes (SPEC §3.1, §3.2, §3.6, §3.7)."""
from __future__ import annotations

import unicodedata
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from app import paths
from app.data import AppData
from app.graph import shortest_path
from app.resolver import resolve
from app.schemas import (
    ErrorDetail,
    ErrorResponse,
    Level,
    PathResponse,
    PersonMeta,
    ResolveResponse,
    SearchResponse,
)

router = APIRouter(prefix="/api")


def _data(request: Request) -> AppData:
    return request.app.state.data


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def _meta(data: AppData, name: str) -> PersonMeta:
    p = data.people[name]
    return PersonMeta(name=name, thumbnail=p.thumbnail, wiki_url=p.wiki_url, description=p.description)


def _resolve_or_404(data: AppData, raw: str, param: Literal["from", "to"]) -> str:
    text = _nfc(raw)
    result = resolve(data.resolver, text)
    if result.status == "resolved":
        assert result.name is not None
        return result.name
    detail = ErrorDetail(
        code="AMBIGUOUS_NAME" if result.status == "ambiguous" else "UNRESOLVED_NAME",
        param=param,
        input=text,
        candidates=[_meta(data, n) for n in result.candidates],
    )
    raise HTTPException(status_code=404, detail=detail.model_dump(mode="json"))


@router.get("/people", response_model=list[str])
def get_people(request: Request) -> list[str]:
    return sorted(_data(request).graph)


@router.get(
    "/search",
    response_model=SearchResponse,
    responses={404: {"model": ErrorResponse}},
)
def search(
    request: Request,
    from_: str = Query(alias="from", min_length=1),
    to: str = Query(min_length=1),
) -> SearchResponse:
    # The 255-character upper bound (C-4) is not applied: not yet approved (SPEC §0.4).
    data = _data(request)
    start = _resolve_or_404(data, from_, "from")
    target = _resolve_or_404(data, to, "to")
    result = shortest_path(data.graph, start, target)
    return SearchResponse(
        found=result.found,
        from_=start,
        to=target,
        length=len(result.path) - 1 if result.found else None,
        nodes_explored=sum(len(level) for level in result.levels),
        path=[_meta(data, n) for n in result.path],
        levels=[Level(level=i, nodes=nodes) for i, nodes in enumerate(result.levels)],
    )


@router.get("/resolve", response_model=ResolveResponse)
def resolve_name(request: Request, q: str = Query()) -> ResolveResponse:
    # Length bounds for q (C-4) are not applied: not yet approved (SPEC §0.4).
    data = _data(request)
    text = _nfc(q)
    result = resolve(data.resolver, text)
    return ResolveResponse(
        query=text,
        status=result.status,
        person=_meta(data, result.name) if result.name is not None else None,
        candidates=[_meta(data, n) for n in result.candidates],
    )


@router.get("/path", response_model=PathResponse)
def get_path(request: Request, p: list[str] = Query(default=[])) -> PathResponse:
    data = _data(request)
    # Module attribute, not a bound name: /share must share this exact function (PTH-11).
    names = paths.validate_path(p, data.edges)
    if names is None:
        return PathResponse(valid=False, path=[])
    return PathResponse(valid=True, path=[_meta(data, n) for n in names])
