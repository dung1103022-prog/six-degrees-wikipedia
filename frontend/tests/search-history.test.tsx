// History on the search page (SPEC ADR-006, Q-15): a successful search is remembered in localStorage, listed,
// and a click on an entry searches again. UI language is Vietnamese (Q-3): the list is the region
// "Search History", one button per entry, its text holding the two names.
//
// SPEC N-4: what an entry holds and how a repeated entry is treated are NOT contract, and no test locks them.
// So these tests look at the page, not at the stored JSON, and never repeat an entry. (Where a test has to
// preload storage it uses the HistoryEntry type of lib/history, so a change of the shape fails to compile.)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { HISTORY_LIMIT, HISTORY_STORAGE_KEY, type HistoryEntry } from "../src/lib/history";
import { errorReply, mockApi, personMeta, searchResponse } from "./helpers/api";
import { makeResponse } from "./helpers/graph";

const REGION = "Search History";

const preload = (entries: HistoryEntry[]) => window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
const entry = (i: number): HistoryEntry => ({ from: `From ${i}`, to: `To ${i}` });
const region = () => screen.queryByRole("region", { name: REGION });
const historyButtons = () => within(screen.getByRole("region", { name: REGION })).getAllByRole("button");

/** A search API that resolves any input to the same canonical pair. */
function apiResolvingTo(from: string, to: string) {
  return mockApi((url) => (url.pathname === "/api/search" ? { body: searchResponse([personMeta(from), personMeta(to)]) } : undefined));
}

async function submit(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.type(screen.getByLabelText("Start Person"), from);
  await user.type(screen.getByLabelText("End Person"), to);
  await user.click(screen.getByRole("button", { name: "Start Search" }));
}

describe("search history", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows nothing when there is no history yet", () => {
    render(<App />);
    expect(region()).not.toBeInTheDocument();
  });

  it("remembers a successful search under the CANONICAL names of the result, not the typed text", async () => {
    apiResolvingTo("Albert Einstein", "Nikola Tesla");
    const user = userEvent.setup();
    render(<App />);

    await submit(user, "Einstein", "Tesla");

    await screen.findByRole("list", { name: "Path" });
    const [only] = historyButtons();
    expect(historyButtons()).toHaveLength(1);
    expect(only).toHaveTextContent("Albert Einstein");
    expect(only).toHaveTextContent("Nikola Tesla"); // the typed "Einstein" / "Tesla" would not contain "Albert" / "Nikola"
  });

  it("a search that finds no path (HTTP 200, found=false) was still a search: it is remembered", async () => {
    mockApi((url) => (url.pathname === "/api/search" ? { body: makeResponse([["A"], ["b"]], null) } : undefined));
    const user = userEvent.setup();
    render(<App />);

    await submit(user, "A", "Z");

    await screen.findByRole("status");
    expect(historyButtons()).toHaveLength(1);
  });

  it("does not remember a search that failed: not found, ambiguous, server error, network", async () => {
    const user = userEvent.setup();
    const attempts: [string, Parameters<typeof mockApi>[0]][] = [
      ["unresolved", (u) => (u.pathname === "/api/search" ? errorReply("UNRESOLVED_NAME", "from", "X") : undefined)],
      ["ambiguous", (u) => (u.pathname === "/api/search" ? errorReply("AMBIGUOUS_NAME", "from", "X", [personMeta("P1"), personMeta("P2")]) : undefined)],
      ["HTTP 500", (u) => (u.pathname === "/api/search" ? { status: 500, body: { detail: "boom" } } : undefined)],
    ];
    for (const [, handler] of attempts) {
      mockApi(handler);
      const { unmount } = render(<App />);
      await submit(user, "X", "Y");
      await screen.findByRole("alert");
      expect(region()).not.toBeInTheDocument();
      unmount();
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<App />);
    await submit(user, "X", "Y");
    await screen.findByRole("alert");
    expect(region()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  });

  it("an ambiguous name chosen from the candidates is remembered once it succeeds, with the canonical name", async () => {
    mockApi((url) => {
      if (url.pathname !== "/api/search") return undefined;
      const from = url.searchParams.get("from") ?? "";
      if (from === "X") return errorReply("AMBIGUOUS_NAME", "from", "X", [personMeta("Person One"), personMeta("Person Two")]);
      return { body: searchResponse([personMeta(from), personMeta("Zed")]) };
    });
    const user = userEvent.setup();
    render(<App />);

    await submit(user, "X", "Zed");
    await user.click(await screen.findByRole("button", { name: /Person Two/ }));

    await screen.findByRole("list", { name: "Path" });
    expect(historyButtons()).toHaveLength(1);
    expect(historyButtons()[0]).toHaveTextContent("Person Two");
    expect(historyButtons()[0]).toHaveTextContent("Zed");
  });

  it("is still there after a reload of the page, and loading it asks the server for nothing", async () => {
    const { calls } = apiResolvingTo("Alice", "Bob");
    const user = userEvent.setup();
    const first = render(<App />);
    await submit(user, "Alice", "Bob");
    await screen.findByRole("list", { name: "Path" });
    first.unmount();
    calls.length = 0;

    render(<App />); // a fresh page

    expect(historyButtons()).toHaveLength(1);
    expect(historyButtons()[0]).toHaveTextContent("Alice");
    expect(historyButtons()[0]).toHaveTextContent("Bob");
    expect(calls).toHaveLength(0);
  });

  it("lists what is stored, newest first as the hook keeps it", () => {
    preload([entry(1), entry(2), entry(3)]);
    render(<App />);
    expect(historyButtons().map((b) => b.textContent)).toEqual([
      expect.stringContaining("From 1"),
      expect.stringContaining("From 2"),
      expect.stringContaining("From 3"),
    ]);
  });

  it("a click on an entry searches again: one GET /api/search with the entry's two names, inputs filled, result shown", async () => {
    preload([{ from: "Albert Einstein", to: "Nikola Tesla" }]);
    const { calls } = apiResolvingTo("Albert Einstein", "Nikola Tesla");
    const user = userEvent.setup();
    render(<App />);

    await user.click(historyButtons()[0]!);

    await screen.findByRole("list", { name: "Path" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.pathname).toBe("/api/search");
    expect(calls[0]!.searchParams.get("from")).toBe("Albert Einstein");
    expect(calls[0]!.searchParams.get("to")).toBe("Nikola Tesla");
    expect(screen.getByLabelText("Start Person")).toHaveValue("Albert Einstein");
    expect(screen.getByLabelText("End Person")).toHaveValue("Nikola Tesla");
  });

  it("a click on an entry whose search now fails shows the error like any search", async () => {
    preload([entry(1)]);
    mockApi((url) => (url.pathname === "/api/search" ? errorReply("UNRESOLVED_NAME", "from", "From 1") : undefined));
    const user = userEvent.setup();
    render(<App />);

    await user.click(historyButtons()[0]!);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not find/i);
  });

  it(`keeps at most ${HISTORY_LIMIT} entries: with a full history, one more search drops the oldest`, async () => {
    preload(Array.from({ length: HISTORY_LIMIT }, (_, i) => entry(i))); // newest first: entry(0) .. the oldest entry(19)
    apiResolvingTo("New A", "New B");
    const user = userEvent.setup();
    render(<App />);
    expect(historyButtons()).toHaveLength(HISTORY_LIMIT);

    await submit(user, "New A", "New B");

    await screen.findByRole("list", { name: "Path" });
    const texts = historyButtons().map((b) => b.textContent ?? "");
    expect(texts).toHaveLength(HISTORY_LIMIT);
    expect(texts.some((t) => t.includes("New A") && t.includes("New B"))).toBe(true);
    expect(texts.some((t) => t.includes("From 19"))).toBe(false); // the oldest is gone
    expect(texts.some((t) => t.includes("From 0"))).toBe(true);
  });

  it("blocked storage (it throws): the page does not crash, the search works and shows the entry in memory", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage is blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    apiResolvingTo("Alice", "Bob");
    const user = userEvent.setup();
    render(<App />);
    expect(region()).not.toBeInTheDocument();

    await submit(user, "Alice", "Bob");

    expect(await screen.findByRole("list", { name: "Path" })).toBeInTheDocument();
    await waitFor(() => expect(historyButtons()).toHaveLength(1));
  });

  it.each([
    ["JSON that does not parse", "{not json"],
    ["valid JSON that is not a list", '{"from":"A","to":"B"}'],
  ])("corrupt storage (%s): no history shown, no crash, and the next search is remembered", async (_label, raw) => {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, raw);
    apiResolvingTo("Alice", "Bob");
    const user = userEvent.setup();
    render(<App />);
    expect(region()).not.toBeInTheDocument();

    await submit(user, "Alice", "Bob");

    await screen.findByRole("list", { name: "Path" });
    expect(historyButtons()).toHaveLength(1);
  });

  it("under React StrictMode one search is one entry", async () => {
    apiResolvingTo("Alice", "Bob");
    const user = userEvent.setup();
    render(<App />, { wrapper: StrictMode });

    await submit(user, "Alice", "Bob");

    await screen.findByRole("list", { name: "Path" });
    expect(historyButtons()).toHaveLength(1);
  });
});
