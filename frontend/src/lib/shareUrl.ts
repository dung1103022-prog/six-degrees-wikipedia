// Share URL (SPEC §5.1, FE-01). The query is built with URLSearchParams.append and read with
// getAll: never encodeURIComponent, never string concatenation of names. That gives the
// application/x-www-form-urlencoded encoding both sides agree on: a space becomes "+", a real "+"
// becomes "%2B", and "&", ",", "?", "/" inside a name cannot split or leak into another parameter.

const PARAM = "p";

/**
 * `/share?p=A&p=B...` for the canonical names of a path, in path order. The names come from
 * `SearchResponse.path[].name`; nothing else (thumbnail, description, alias, user input) goes in.
 */
export function buildShareUrl(names: readonly string[]): string {
  const params = new URLSearchParams();
  for (const name of names) params.append(PARAM, name);
  const query = params.toString();
  return query === "" ? "/share" : `/share?${query}`;
}

/** The `p` values of a query string (`location.search` or a bare query), in order. */
export function parseShareNames(search: string): string[] {
  return new URLSearchParams(search).getAll(PARAM);
}
