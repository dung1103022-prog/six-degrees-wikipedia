// Named aliases for the GENERATED types (src/api/schema.d.ts, `npm run gen:types`, SPEC §3.5).
// No API type is declared by hand here: every alias points into the generated schema.
import type { components } from "./schema";

type Schemas = components["schemas"];

export type PersonMeta = Schemas["PersonMeta"];
export type Level = Schemas["Level"];
export type SearchResponse = Schemas["SearchResponse"];
export type ResolveResponse = Schemas["ResolveResponse"];
export type PathResponse = Schemas["PathResponse"];
export type ErrorDetail = Schemas["ErrorDetail"];
export type ErrorResponse = Schemas["ErrorResponse"];
