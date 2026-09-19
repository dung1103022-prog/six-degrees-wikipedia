// Test helpers: a mock of the backend API (SPEC §3) and payload factories typed with the GENERATED
// API types. Payload shapes follow the examples in SPEC §3.2, §3.6, §3.7.
import { vi } from "vitest";
import type { ErrorDetail, PathResponse, PersonMeta, SearchResponse } from "../../src/api/types";

export interface Reply {
  status?: number;
  body: unknown;
}

/** Return a reply for a request the test expects, `undefined` for one it does not (that fails the test). */
export type Handler = (url: URL) => Reply | undefined;

export function mockApi(handler: Handler) {
  const calls: URL[] = [];
  const fetchMock = vi.fn(async (input: unknown) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, "http://localhost");
    calls.push(url);
    const reply = handler(url);
    if (!reply) throw new Error(`Test has no mock for ${url.pathname}${url.search}`);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, callsTo: (pathname: string) => calls.filter((c) => c.pathname === pathname) };
}

export function personMeta(name: string, thumbnail: string | null = null, description: string | null = null): PersonMeta {
  return { name, thumbnail, wiki_url: `https://en.wikipedia.org/wiki/${name.replaceAll(" ", "_")}`, description };
}

/** A found path through `people`, in order (SearchResponse, SPEC §2). */
export function searchResponse(people: PersonMeta[]): SearchResponse {
  const first = people[0]!;
  const last = people[people.length - 1]!;
  return {
    found: true,
    from: first.name,
    to: last.name,
    length: people.length - 1,
    nodes_explored: people.length,
    path: people,
    levels: people.map((p, level) => ({ level, nodes: [p.name] })),
  };
}

export function pathResponse(people: PersonMeta[] | null): PathResponse {
  return people === null ? { valid: false, path: [] } : { valid: true, path: people };
}

/** 404 ErrorResponse (SPEC §3.2). */
export function errorReply(code: ErrorDetail["code"], param: ErrorDetail["param"], input: string, candidates: PersonMeta[] = []): Reply {
  return { status: 404, body: { detail: { code, param, input, candidates } } };
}

export function navigate(url: string): void {
  window.history.pushState({}, "", url);
}
