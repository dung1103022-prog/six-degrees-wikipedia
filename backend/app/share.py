"""GET /share and OG meta injection (SPEC §5.1–5.5; Q-2 chốt ở v2.4).

/share always answers 200 text/html. The valid/invalid verdict comes only from
``paths.validate_path`` (SPEC §5.3), the same function GET /api/path uses.
"""
from __future__ import annotations

import html
from collections.abc import Mapping, Sequence
from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse

from app import paths
from app.data import DataValidationError, Person

#: Placeholder that dist/index.html must contain exactly once (SPEC §5.5).
OG_PLACEHOLDER = "<!--OG-->"

#: Single source of the og:title format (SPEC §5.4). Its language is Q-3 (still OPEN);
#: changing the wording here does not change the contract.
OG_TITLE_FORMAT = "{first} → {last}: {n} bước"

SHARE_PATH = "/share"

router = APIRouter()


def load_index_template(dist_dir: Path | str) -> str:
    """Read dist/index.html and check the <!--OG--> placeholder (SPEC §5.5, §6.5).

    Called only when /share is registered (Phase 2), never by the Phase 1 loader.
    """
    path = Path(dist_dir) / "index.html"
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise DataValidationError(f"[OG] missing {path}") from None
    count = text.count(OG_PLACEHOLDER)
    if count != 1:
        raise DataValidationError(
            f"[OG] {path} must contain exactly one {OG_PLACEHOLDER} placeholder (found {count})"
        )
    return text


def build_share_url(base_url: str, names: Sequence[str]) -> str:
    """Share URL rebuilt from the validated names only (SPEC §5.4, §5.1)."""
    return f"{base_url.rstrip('/')}{SHARE_PATH}?" + urlencode({"p": list(names)}, doseq=True)


def _meta(attr: str, key: str, value: str) -> str:
    # html.escape guards the HTML layer; URL encoding is not a substitute (SPEC §5.4).
    return f'<meta {attr}="{html.escape(key, quote=True)}" content="{html.escape(value, quote=True)}">'


def og_tags(names: Sequence[str], people: Mapping[str, Person], share_url: str) -> str:
    """OG meta for a validated path, in the order given by SPEC §5.4."""
    first, last = names[0], names[-1]
    tags = [
        _meta("property", "og:title", OG_TITLE_FORMAT.format(first=first, last=last, n=len(names) - 1)),
        _meta("property", "og:description", " → ".join(names)),
    ]
    thumbnail = people[first].thumbnail
    if thumbnail is not None:  # tag dropped entirely when there is no thumbnail
        tags.append(_meta("property", "og:image", thumbnail))
    tags.append(_meta("property", "og:url", share_url))
    tags.append(_meta("name", "twitter:card", "summary"))
    return "\n".join(tags)


def render(template: str, replacement: str) -> str:
    """Replace the single placeholder; the rest of index.html is untouched."""
    return template.replace(OG_PLACEHOLDER, replacement, 1)


@router.get(SHARE_PATH, response_class=HTMLResponse)
def share(request: Request, p: list[str] = Query(default=[])) -> HTMLResponse:
    data = request.app.state.data
    names = paths.validate_path(p, data.edges)
    if names is None:
        # SPEC §5.4 (v2.4): placeholder -> "" ; the static meta of dist/index.html
        # are the site's default OG. The server adds nothing of its own.
        body = render(request.app.state.index_template, "")
    else:
        url = build_share_url(str(request.base_url), names)
        body = render(request.app.state.index_template, og_tags(names, data.people, url))
    return HTMLResponse(body)
