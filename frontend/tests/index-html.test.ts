// SPEC §5.5, Q-7, Q-8, §7.9 — FE-05: frontend/index.html and the BUILT dist/index.html hold exactly one
// <!--OG--> inside <head>, and none of the five properties that only /share may create.
// The built file is the output of `npm run build` (`npm test` runs it first); when it is missing
// the test FAILS, it is never skipped.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "index.html");
const BUILT = path.join(ROOT, "dist", "index.html");
const PLACEHOLDER = "<!--OG-->";
const FORBIDDEN = ["og:title", "og:description", "og:image", "og:url", "twitter:card"];

function readOrFail(file: string): string {
  expect(existsSync(file), `${file} does not exist (run \`npm run build\` first)`).toBe(true);
  return readFileSync(file, "utf-8");
}

function expectOgContract(html: string): void {
  expect(html.split(PLACEHOLDER).length - 1, "number of <!--OG--> placeholders").toBe(1);
  const at = html.indexOf(PLACEHOLDER);
  const headOpen = html.search(/<head[\s>]/i);
  const headClose = html.search(/<\/head\s*>/i);
  expect(headOpen, "<head> opening tag").toBeGreaterThanOrEqual(0);
  expect(headClose, "</head> closing tag").toBeGreaterThan(headOpen);
  expect(at, "placeholder inside <head>").toBeGreaterThan(headOpen);
  expect(at, "placeholder inside <head>").toBeLessThan(headClose);
  for (const property of FORBIDDEN) {
    expect(html, `static ${property} is forbidden`).not.toContain(property);
  }
}

describe("index.html", () => {
  it("@spec FE-05 frontend/index.html: one <!--OG--> inside <head>, no static og:*/twitter:card of /share", () => {
    expectOgContract(readOrFail(SOURCE));
  });

  it("@spec FE-05 built dist/index.html: one <!--OG--> inside <head>, no static og:*/twitter:card of /share", () => {
    expectOgContract(readOrFail(BUILT));
  });
});
