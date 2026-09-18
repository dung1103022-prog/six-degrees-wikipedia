"""Test infrastructure for Phase 1 (SPEC §0.2).

- Blocks all outbound network connections for the whole test session.
- Validates that every @pytest.mark.spec("ID") refers to an ID defined in SPEC.md §7.
- Reports Phase 1 test IDs (SPEC §7.0) that have no test yet (informational only).
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


def _phase1_ids(all_ids: set[str]) -> set[str]:
    """Phase 1 groups as listed in SPEC §7.0."""

    def rng(prefix: str, lo: int, hi: int) -> set[str]:
        return {f"{prefix}-{i:02d}" for i in range(lo, hi + 1)}

    wanted = {i for i in all_ids if i.split("-")[0] in {"BFS", "RES", "API"}}
    wanted |= rng("SCH", 1, 8) | rng("PTH", 1, 10) | rng("DAT", 1, 7) | rng("DAT", 9, 16)
    return wanted & all_ids


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


def pytest_terminal_summary(terminalreporter, exitstatus, config) -> None:
    missing = sorted(_phase1_ids(spec_test_ids()) - _collected_ids)
    terminalreporter.section("SPEC Phase 1 test-ID coverage")
    if missing:
        terminalreporter.write_line("Phase 1 IDs without a test: " + ", ".join(missing))
    else:
        terminalreporter.write_line("All Phase 1 IDs have at least one test.")


# --------------------------------------------------------------------------- fixtures


@pytest.fixture
def valid_dir() -> Path:
    return VALID_DIR
