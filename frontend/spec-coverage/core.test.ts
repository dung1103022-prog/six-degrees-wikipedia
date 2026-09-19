// Tests of the FE-ID coverage mechanism itself (SPEC §7.9, Q-16). They carry no @spec tag on purpose:
// the mechanism is infrastructure, not a SPEC test ID.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateCoverage, extractSpecTags, requiredFrontendIds, type TestOutcome } from "./core";

// A miniature SPEC with the same table shapes the real one uses.
const MINI_SPEC = `
# Title
Mentions of FE-77 outside section 7 are not test rows.

## 7. Test cases

### 7.0 Pha
| Nhóm | Pha |
|---|---|
| FE-* | 4 |

#### Test ID phụ thuộc điểm chưa duyệt
| ID | Phụ thuộc | Phạm vi | Phần phụ thuộc |
|---|---|---|---|
| FE-09 | C-99 | toàn bộ | thứ gì đó |
| FE-08 | C-98 | một phần | phần khác |
| API-17 | C-3 | toàn bộ | x |

### 7.1 Fixture
Not a test table.

### 7.9 Frontend
| ID | Kiểm tra |
|---|---|
| FE-01 | một |
| FE-02 | hai |
| FE-08 | tám (một phần: vẫn bắt buộc) |
| FE-09 | chín (toàn bộ phụ thuộc: không bắt buộc) |

### 7.10 Backend
| ID | Kiểm tra |
|---|---|
| SPA-01 | không phải FE |

## 8. Out of scope
| FE-55 | ngoài §7 |
`;

const t = (fullName: string, state: TestOutcome["state"] = "passed"): TestOutcome => ({ fullName, state });

describe("requiredFrontendIds", () => {
  it("takes FE-* rows of section 7, minus IDs whose scope is 'toàn bộ'", () => {
    expect([...requiredFrontendIds(MINI_SPEC)].sort()).toEqual(["FE-01", "FE-02", "FE-08"]);
  });

  it("reads the real SPEC.md, which requires FE-01..FE-06", () => {
    const spec = readFileSync(path.resolve(__dirname, "../../SPEC.md"), "utf-8");
    const ids = requiredFrontendIds(spec);
    for (const id of ["FE-01", "FE-02", "FE-03", "FE-04", "FE-05", "FE-06"]) expect(ids.has(id)).toBe(true);
    expect([...ids].every((id) => id.startsWith("FE-"))).toBe(true);
  });
});

describe("extractSpecTags", () => {
  it("finds every spec tag in a test's full name", () => {
    expect(extractSpecTags("page @spec FE-01 @spec FE-02 does things")).toEqual(["FE-01", "FE-02"]);
    expect(extractSpecTags("no tag here")).toEqual([]);
    expect(extractSpecTags("@spec fe-1 and @spec SPA-01")).toEqual(["fe-1", "SPA-01"]);
  });
});

describe("evaluateCoverage", () => {
  const all = (tests: TestOutcome[], fullRun = true) => evaluateCoverage(MINI_SPEC, tests, { fullRun });

  it("is satisfied when every required ID has a passing test", () => {
    const r = all([t("@spec FE-01 a"), t("x @spec FE-02 @spec FE-08 b")]);
    expect(r.errors).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("does not count skipped, todo or failed tests as coverage", () => {
    for (const state of ["skipped", "pending", "failed"] as const) {
      const r = all([t("@spec FE-01 a"), t("@spec FE-02 b", state), t("@spec FE-08 c")]);
      expect(r.missing).toEqual(["FE-02"]);
      expect(r.ok).toBe(false);
    }
  });

  it("fails when a required ID has no test at all, and lists every missing ID", () => {
    const r = all([t("@spec FE-01 a")]);
    expect(r.missing).toEqual(["FE-02", "FE-08"]);
    expect(r.ok).toBe(false);
  });

  it("one ID may have several tests; one passing test is enough", () => {
    const r = all([t("@spec FE-01 a"), t("@spec FE-01 b", "failed"), t("@spec FE-02 c"), t("@spec FE-08 d")]);
    expect(r.missing).toEqual([]);
  });

  it("reports a tag whose ID is not in section 7, is not an FE- ID, or is malformed", () => {
    const r = all([
      t("@spec FE-01 a"),
      t("@spec FE-02 b"),
      t("@spec FE-08 c"),
      t("@spec FE-42 unknown"),
      t("@spec SPA-01 wrong prefix"),
      t("@spec FE-1 malformed"),
    ]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors.join("\n")).toMatch(/FE-42/);
    expect(r.errors.join("\n")).toMatch(/SPA-01/);
    expect(r.errors.join("\n")).toMatch(/FE-1\b/);
    expect(r.ok).toBe(false);
  });

  it("a filtered run only validates tags; it does not demand full coverage", () => {
    const partial = all([t("@spec FE-01 a")], false);
    expect(partial.missing).toEqual([]);
    expect(partial.ok).toBe(true);
    const bad = all([t("@spec FE-42 a")], false);
    expect(bad.errors).toHaveLength(1);
    expect(bad.ok).toBe(false);
  });
});
