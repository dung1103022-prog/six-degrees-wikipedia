// GET /api/search (SPEC §3.2). One call, one outcome. Errors are told apart by `detail.code`
// (UNRESOLVED_NAME / AMBIGUOUS_NAME), never by reading a message. Nothing else is fetched here.
import type { ErrorDetail, PersonMeta, SearchResponse } from "./types";

export type SearchFailure =
  | { kind: "unresolved"; detail: ErrorDetail }
  | { kind: "ambiguous"; detail: ErrorDetail }
  | { kind: "other"; reason: string }; // HTTP 5xx / 422, a body of an unexpected shape, an unknown code, the network

export type SearchOutcome = { ok: true; response: SearchResponse } | { ok: false; failure: SearchFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersonMeta(value: unknown): value is PersonMeta {
  return isRecord(value) && typeof value.name === "string" && typeof value.wiki_url === "string";
}

function isSearchResponse(value: unknown): value is SearchResponse {
  return isRecord(value) && typeof value.found === "boolean" && Array.isArray(value.path) && Array.isArray(value.levels);
}

/** The `detail` of an ErrorResponse (SPEC §2), or null when the body is not one this page knows. */
function errorDetailOf(body: unknown): ErrorDetail | null {
  if (!isRecord(body) || !isRecord(body.detail)) return null;
  const { code, param, input, candidates } = body.detail;
  if (code !== "UNRESOLVED_NAME" && code !== "AMBIGUOUS_NAME") return null;
  if (param !== "from" && param !== "to") return null;
  if (typeof input !== "string" || !Array.isArray(candidates)) return null;
  return { code, param, input, candidates: candidates.filter(isPersonMeta) };
}

export async function searchPeople(from: string, to: string): Promise<SearchOutcome> {
  const query = new URLSearchParams();
  query.append("from", from);
  query.append("to", to);

  let response: Response;
  try {
    response = await fetch(`/api/search?${query.toString()}`);
  } catch {
    return { ok: false, failure: { kind: "other", reason: "could not connect to the server" } };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // not JSON: handled below as an unexpected answer
  }

  if (response.ok) {
    return isSearchResponse(body)
      ? { ok: true, response: body }
      : { ok: false, failure: { kind: "other", reason: "server returned data in an unexpected format" } };
  }

  const detail = errorDetailOf(body);
  if (detail === null) return { ok: false, failure: { kind: "other", reason: `HTTP error ${response.status}` } };
  return { ok: false, failure: { kind: detail.code === "AMBIGUOUS_NAME" ? "ambiguous" : "unresolved", detail } };
}
