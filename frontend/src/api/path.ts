// GET /api/path?p=...&p=... (SPEC §3.7). The frontend sends the list of the URL as it is and shows the
// verdict of the server: it never validates a path itself (SPEC §5.6). By contract the endpoint always
// answers 200 with a PathResponse (C-12); anything else is an unexpected failure.
import type { PathResponse } from "./types";

export type PathOutcome = { ok: true; response: PathResponse } | { ok: false; reason: string };

function isPathResponse(value: unknown): value is PathResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).valid === "boolean" &&
    Array.isArray((value as Record<string, unknown>).path)
  );
}

export async function fetchPath(names: readonly string[]): Promise<PathOutcome> {
  const query = new URLSearchParams();
  for (const name of names) query.append("p", name);
  const queryString = query.toString();

  let response: Response;
  try {
    response = await fetch(queryString === "" ? "/api/path" : `/api/path?${queryString}`);
  } catch {
    return { ok: false, reason: "không kết nối được tới máy chủ" };
  }
  if (!response.ok) return { ok: false, reason: `lỗi HTTP ${response.status}` };

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // not JSON: reported below
  }
  return isPathResponse(body) ? { ok: true, response: body } : { ok: false, reason: "máy chủ trả về dữ liệu không đúng dạng" };
}
