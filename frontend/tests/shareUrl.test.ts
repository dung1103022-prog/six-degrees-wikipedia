// SPEC §5.1, §7.9 — FE-01: the share URL is built with URLSearchParams, never by hand.
import { describe, expect, it } from "vitest";
import { buildShareUrl, parseShareNames } from "../src/lib/shareUrl";

// Special names of SPEC §7.1.
const SPECIAL = ["Earth, Wind & Fire", "Florence + the Machine", "Prince (musician)", "Who? (band)", "AC/DC", "Beyoncé", "Nguyễn Du"];

const searchOf = (url: string) => new URL(url, "http://localhost").search;

describe("share URL", () => {
  it("@spec FE-01 builds /share with one repeated p per name, in path order (SPEC §5.1 example)", () => {
    expect(buildShareUrl(["Albert Einstein", "Nikola Tesla", "Isaac Newton"])).toBe(
      "/share?p=Albert+Einstein&p=Nikola+Tesla&p=Isaac+Newton",
    );
  });

  it("@spec FE-01 encodes a space as + and a real + as %2B (application/x-www-form-urlencoded)", () => {
    expect(buildShareUrl(["Florence + the Machine", "Prince (musician)"])).toBe(
      "/share?p=Florence+%2B+the+Machine&p=Prince+%28musician%29",
    );
  });

  it("@spec FE-01 is not encodeURIComponent: no %20, and & , ? / inside a name never split or leak", () => {
    const url = buildShareUrl(SPECIAL);
    expect(url).not.toContain("%20");
    expect(url.startsWith("/share?")).toBe(true);
    // one p per name, however many & or , the names contain
    expect(new URLSearchParams(searchOf(url)).getAll("p")).toHaveLength(SPECIAL.length);
    expect(buildShareUrl(["Earth, Wind & Fire"])).toBe("/share?p=Earth%2C+Wind+%26+Fire");
  });

  it("@spec FE-01 round-trips every special name, alone and together, through URLSearchParams.getAll", () => {
    for (const name of SPECIAL) {
      expect(parseShareNames(searchOf(buildShareUrl([name])))).toEqual([name]);
    }
    expect(parseShareNames(searchOf(buildShareUrl(SPECIAL)))).toEqual(SPECIAL);
  });

  it("@spec FE-01 reads names with getAll: repeated p in order, other params ignored, none -> []", () => {
    expect(parseShareNames("?p=A&x=1&p=B")).toEqual(["A", "B"]);
    expect(parseShareNames("?p=Florence+%2B+the+Machine")).toEqual(["Florence + the Machine"]);
    expect(parseShareNames("")).toEqual([]);
  });
});
