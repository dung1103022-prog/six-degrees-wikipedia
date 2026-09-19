// Coverage mechanism for the frontend's SPEC test IDs (SPEC §7.9, Q-16).
//
// Pure functions: the Vitest reporter (./reporter.ts) feeds them the outcome of every test.
// The list of required IDs is read from SPEC.md itself, exactly as backend/tests/conftest.py does:
// every FE-NN row of section 7, minus the IDs whose scope is "toàn bộ" in the table
// "Test ID phụ thuộc điểm chưa duyệt" (section 7.0). Nothing is hardcoded here.

const FE_PREFIX = "FE-";
const FE_ID = /^FE-\d{2}$/;
const ID_ROW = /^\| ([A-Z]{2,3}-\d{2}) \|/gm;
const PENDING_ROW = /^\| ([A-Z]{2,3}-\d{2}) \| [^|]+ \| toàn bộ \|/gm;
const SPEC_TAG = /@spec\s+([A-Za-z0-9-]+)/g;

export interface TestOutcome {
  /** Vitest `fullName`: enclosing `describe` titles joined with the test title. */
  fullName: string;
  state: "passed" | "failed" | "skipped" | "pending";
}

export interface CoverageReport {
  /** Tags that name an unknown ID, an ID that is not FE-*, or a malformed ID. */
  errors: string[];
  /** Required IDs without a passing test; only filled on a full run. */
  missing: string[];
  /** Required IDs with at least one passing test. */
  covered: string[];
  required: string[];
  ok: boolean;
}

function section7(spec: string): string {
  const start = spec.indexOf("## 7. Test cases");
  const end = spec.indexOf("## 8. Out of scope");
  if (start === -1 || end === -1) throw new Error("SPEC.md: cannot find sections '## 7. Test cases' / '## 8. Out of scope'");
  return spec.slice(start, end);
}

function section70(section: string): string {
  const start = section.indexOf("### 7.0 ");
  const end = section.indexOf("### 7.1 ");
  return start === -1 || end === -1 ? "" : section.slice(start, end);
}

function matches(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map((m) => m[1] as string);
}

/** Every test ID defined in section 7, whatever its prefix. */
export function knownIds(spec: string): Set<string> {
  return new Set(matches(ID_ROW, section7(spec)));
}

export function requiredFrontendIds(spec: string): Set<string> {
  const section = section7(spec);
  const pending = new Set(matches(PENDING_ROW, section70(section)));
  return new Set([...knownIds(spec)].filter((id) => id.startsWith(FE_PREFIX) && !pending.has(id)));
}

/** The raw IDs named by `@spec <id>` tokens in a test's full name (not validated). */
export function extractSpecTags(fullName: string): string[] {
  return matches(SPEC_TAG, fullName);
}

export function evaluateCoverage(spec: string, tests: readonly TestOutcome[], options: { fullRun: boolean }): CoverageReport {
  const known = knownIds(spec);
  const required = requiredFrontendIds(spec);
  const errors: string[] = [];
  const passed = new Set<string>();

  for (const test of tests) {
    for (const tag of extractSpecTags(test.fullName)) {
      if (!FE_ID.test(tag)) {
        errors.push(`"${test.fullName}": @spec ${tag} is not a frontend test ID (expected FE-NN)`);
      } else if (!known.has(tag)) {
        errors.push(`"${test.fullName}": @spec ${tag} is not defined in SPEC.md section 7`);
      } else if (test.state === "passed") {
        passed.add(tag);
      }
    }
  }

  const sorted = [...required].sort();
  const covered = sorted.filter((id) => passed.has(id));
  const missing = options.fullRun ? sorted.filter((id) => !passed.has(id)) : [];
  return { errors, missing, covered, required: sorted, ok: errors.length === 0 && missing.length === 0 };
}
