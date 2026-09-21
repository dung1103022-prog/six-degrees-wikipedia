// The full list of names for the Start/End autocomplete (design request, 2026-09-21; SPEC.md v2.16
// notes the exception to the §0.3 "no autocomplete" line). `GET /api/people` already existed
// (Phase 1) and already returns every canonical name sorted A-Z — nothing new on the backend. It is
// fetched at most once per page load, cached here, and filtered entirely client-side: no server-side
// search endpoint, no cache layer, no new API surface (§0.3, v2.16).
let peoplePromise: Promise<readonly string[]> | null = null;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Never rejects: on any failure the list is just empty, so the field still works as plain text. */
/** Test-only: forget the cached list, so each test starts from a clean fetch. */
export function __resetPeopleCacheForTests(): void {
  peoplePromise = null;
}

export function loadPeople(): Promise<readonly string[]> {
  if (peoplePromise === null) {
    peoplePromise = fetch("/api/people")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => (isStringArray(data) ? data : []))
      .catch(() => []);
  }
  return peoplePromise;
}
