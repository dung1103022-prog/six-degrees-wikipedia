"""Test infrastructure for Phase 1 (SPEC §0.2).

- Blocks all outbound network connections for the whole test session.
- Validates that every @pytest.mark.spec("ID") refers to an ID defined in SPEC.md §7.
- Reports required Phase 1 test IDs (SPEC §7.0: phase IDs minus IDs that fully depend
  on a not-yet-approved decision) that have no test yet.
"""
from __future__ import annotations

import re
import socket
from pathlib import Path

import pytest

SPEC_PATH = Path(__file__).resolve().parents[2] / "SPEC.md"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
VALID_DIR = FIXTURES / "valid"


# --------------------------------------------------------------------------- network


class NetworkBlockedError(RuntimeError):
    pass


_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex


def _guard(sock: socket.socket) -> None:
    if sock.family != getattr(socket, "AF_UNIX", object()):
        raise NetworkBlockedError("Network access is blocked in tests (SPEC §0.2)")


def _blocked_connect(self, *args, **kwargs):
    _guard(self)
    return _real_connect(self, *args, **kwargs)


def _blocked_connect_ex(self, *args, **kwargs):
    _guard(self)
    return _real_connect_ex(self, *args, **kwargs)


def pytest_configure(config: pytest.Config) -> None:
    socket.socket.connect = _blocked_connect  # type: ignore[method-assign]
    socket.socket.connect_ex = _blocked_connect_ex  # type: ignore[method-assign]


def pytest_unconfigure(config: pytest.Config) -> None:
    socket.socket.connect = _real_connect  # type: ignore[method-assign]
    socket.socket.connect_ex = _real_connect_ex  # type: ignore[method-assign]


# --------------------------------------------------------------------------- spec IDs

_ID_ROW = re.compile(r"^\| ([A-Z]{2,3}-\d{2}) \|", re.MULTILINE)


def spec_test_ids() -> set[str]:
    text = SPEC_PATH.read_text(encoding="utf-8")
    section = text[text.index("## 7. Test cases") : text.index("## 8. Out of scope")]
    return set(_ID_ROW.findall(section))


_TOKEN = re.compile(r"^([A-Z]{2,3})-(\*|\d{2})(?:\.\.(\d{2}))?$")


def _section_70(text: str) -> str:
    return text[text.index("### 7.0 ") : text.index("### 7.1 ")]


def _expand(token: str, all_ids: set[str]) -> set[str]:
    m = _TOKEN.match(token.strip())
    if not m:
        raise pytest.UsageError(f"SPEC §7.0: cannot parse test-ID token {token!r}")
    prefix, lo, hi = m.groups()
    if lo == "*":
        return {i for i in all_ids if i.startswith(prefix + "-")}
    hi = hi or lo
    return {f"{prefix}-{n:02d}" for n in range(int(lo), int(hi) + 1)} & all_ids


def required_ids(phase: int) -> set[str]:
    """SPEC §7.0: IDs of the phase minus IDs whose scope is "toàn bộ" in the
    "Test ID phụ thuộc điểm chưa duyệt" table. Both tables are read from SPEC.md."""
    text = SPEC_PATH.read_text(encoding="utf-8")
    all_ids = spec_test_ids()
    section = _section_70(text)
    phase_ids: set[str] = set()
    for row in re.findall(r"^\| ([^|]+) \| (\d+)\b[^|]*\|$", section, re.MULTILINE):
        tokens, row_phase = row
        if int(row_phase) == phase:
            for token in tokens.split(","):
                phase_ids |= _expand(token, all_ids)
    pending = set(
        re.findall(r"^\| ([A-Z]{2,3}-\d{2}) \| [^|]+ \| toàn bộ \|", section, re.MULTILINE)
    )
    if not phase_ids:
        raise pytest.UsageError(f"SPEC §7.0: no test IDs found for phase {phase}")
    return phase_ids - pending


_collected_ids: set[str] = set()


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    known = spec_test_ids()
    errors = []
    for item in items:
        for mark in item.iter_markers(name="spec"):
            if len(mark.args) != 1 or not isinstance(mark.args[0], str):
                errors.append(f"{item.nodeid}: spec marker needs exactly one string ID")
                continue
            test_id = mark.args[0]
            if test_id not in known:
                errors.append(f"{item.nodeid}: unknown spec ID {test_id!r} (not in SPEC.md §7)")
            _collected_ids.add(test_id)
    if errors:
        raise pytest.UsageError("\n".join(errors))


#: Phases whose implementation is open (SPEC §0.3). Phase 2 opened in v2.4 (Q-2), Phase 3 in v2.9.
OPEN_PHASES = (1, 2, 3)


def pytest_terminal_summary(terminalreporter, exitstatus, config) -> None:
    terminalreporter.section("SPEC required test-ID coverage (SPEC §7.0)")
    for phase in OPEN_PHASES:
        required = required_ids(phase)
        missing = sorted(required - _collected_ids)
        terminalreporter.write_line(
            f"Phase {phase}: required {len(required)}, covered {len(required & _collected_ids)}"
        )
        if missing:
            terminalreporter.write_line(
                f"  Missing Phase {phase} required IDs: " + ", ".join(missing)
            )
        else:
            terminalreporter.write_line(
                f"  All required Phase {phase} IDs have at least one test."
            )


# --------------------------------------------------------------------------- fixtures


@pytest.fixture
def valid_dir() -> Path:
    return VALID_DIR
