"""SPEC §9, N-2 — the network guard in ``conftest.py`` must allow the loopback TCP connections
that asyncio needs internally on Windows, while still blocking every other outbound connection
(SPEC §0.2: "mọi kết nối ra ngoài phải làm test fail").

Root cause (confirmed by reading CPython's ``socket`` module, 3.14, on this machine): Windows has
no native ``socketpair()`` syscall, so ``socket.socketpair()`` falls back to
``socket._fallback_socketpair`` (see ``socket.py``), which opens a listening TCP socket on
``127.0.0.1`` (or ``::1`` for AF_INET6) and connects a second socket to it. anyio's selector
thread (``anyio._core._asyncio_selector_thread``, used by Starlette/FastAPI's ``TestClient`` to
bridge the Proactor event loop) calls ``socket.socketpair()`` for its wakeup pipe. The old guard
blocked every ``connect``/``connect_ex`` whose socket family was not ``AF_UNIX``, so this
loopback TCP connect raised ``NetworkBlockedError`` before ``TestClient`` could even start,
which is exactly the failure N-2 describes ("TestClient không khởi động được").

These tests exercise the *installed* guard directly (the patched ``socket.socket.connect`` /
``connect_ex``, active for the whole pytest session via ``pytest_configure``), not a copy of it,
so a regression here is caught the same way N-2 was: at test-collection time, without needing a
real ASGI app.

No SPEC test ID: N-2 is test infrastructure, not an application contract (same footing as
``test_startup_logging.py``).
"""
from __future__ import annotations

import socket

import pytest

from conftest import NetworkBlockedError

# SPEC §8: documentation/example addresses that are guaranteed to be non-loopback and
# guaranteed to never accept a connection from this test run, so a wrongly-permissive guard
# cannot pass by accident (RFC 5737 TEST-NET-1 / RFC 3849 documentation-only ranges). The guard
# must reject these before any real network I/O is attempted.
EXTERNAL_IPV4 = "203.0.113.1"
EXTERNAL_IPV6 = "2001:db8::1"


def _listen(family: socket.AddressFamily, host: str) -> socket.socket:
    srv = socket.socket(family, socket.SOCK_STREAM)
    srv.bind((host, 0))
    srv.listen(1)
    return srv


def test_loopback_ipv4_connect_is_allowed():
    srv = _listen(socket.AF_INET, "127.0.0.1")
    try:
        port = srv.getsockname()[1]
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            client.connect(("127.0.0.1", port))  # must not raise NetworkBlockedError
        finally:
            client.close()
    finally:
        srv.close()


def test_loopback_ipv4_connect_ex_is_allowed():
    srv = _listen(socket.AF_INET, "127.0.0.1")
    try:
        port = srv.getsockname()[1]
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            errno = client.connect_ex(("127.0.0.1", port))  # must not raise
            assert errno == 0
        finally:
            client.close()
    finally:
        srv.close()


def test_loopback_ipv6_connect_is_allowed():
    if not socket.has_ipv6:
        pytest.skip("no IPv6 support on this machine")
    try:
        srv = _listen(socket.AF_INET6, "::1")
    except OSError:
        pytest.skip("::1 is not available on this machine")
    try:
        port = srv.getsockname()[1]
        client = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        try:
            client.connect(("::1", port))  # must not raise NetworkBlockedError
        finally:
            client.close()
    finally:
        srv.close()


def test_socketpair_works_under_the_guard():
    """This is exactly what anyio's selector thread does on Windows (see module docstring)."""
    a, b = socket.socketpair()
    a.close()
    b.close()


def test_external_ipv4_connect_is_still_blocked():
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with pytest.raises(NetworkBlockedError):
            client.connect((EXTERNAL_IPV4, 80))
    finally:
        client.close()


def test_external_ipv4_connect_ex_is_still_blocked():
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with pytest.raises(NetworkBlockedError):
            client.connect_ex((EXTERNAL_IPV4, 80))
    finally:
        client.close()


def test_external_ipv6_connect_is_still_blocked():
    if not socket.has_ipv6:
        pytest.skip("no IPv6 support on this machine")
    client = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    try:
        with pytest.raises(NetworkBlockedError):
            client.connect((EXTERNAL_IPV6, 80))
    finally:
        client.close()


def test_hostname_address_is_still_blocked():
    """A non-numeric host must never be treated as loopback by string luck; the guard must not
    resolve DNS to decide (that would itself be network access)."""
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with pytest.raises(NetworkBlockedError):
            client.connect(("localhost", 80))
    finally:
        client.close()
