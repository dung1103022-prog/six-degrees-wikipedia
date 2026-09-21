// Where the graph is drawn: the result of a search (SearchResponse: search page and the new search of /share).
// The path of a valid /share link comes from /api/path (PathResponse) and has no levels: nothing to animate.
// GraphView is replaced by a marker that shows which response it was handed.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { mockApi, navigate, pathResponse, personMeta } from "./helpers/api";
import { LEVELS, PATH, RESPONSE, makeResponse } from "./helpers/graph";

vi.mock("../src/components/GraphView", async () => {
  const { createElement } = await import("react");
  return {
    // `response` is `null` on SearchPage before any search (the panel is always mounted, design:
    // 2026-09-21): the marker still renders then, with data-levels="0" and no data-found.
    default: ({ response }: { response: { levels: unknown[]; found: boolean } | null }) =>
      createElement("div", {
        "data-testid": "graph-view",
        "data-levels": response ? String(response.levels.length) : "0",
        "data-found": response ? String(response.found) : "none",
      }),
  };
});

async function search() {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("Start Person"), "S");
  await user.type(screen.getByLabelText("End Person"), "T");
  await user.click(screen.getByRole("button", { name: "Start Search" }));
}

describe("the graph in the pages", () => {
  it("search page: a found path is drawn from the levels of the response", async () => {
    mockApi((url) => (url.pathname === "/api/search" ? { body: RESPONSE } : undefined));
    await search();
    const view = await screen.findByTestId("graph-view");
    expect(view).toHaveAttribute("data-levels", String(LEVELS.length));
    expect(view).toHaveAttribute("data-found", "true");
  });

  it("search page: a search that found nothing draws the explored levels too", async () => {
    mockApi((url) => (url.pathname === "/api/search" ? { body: makeResponse([["S"], ["a", "b"]], null) } : undefined));
    await search();
    expect(await screen.findByTestId("graph-view")).toHaveAttribute("data-found", "false");
  });

  it("search page: the graph panel is always mounted, empty before a result and after an error", async () => {
    mockApi((url) => (url.pathname === "/api/search" ? { status: 500, body: { detail: "boom" } } : undefined));
    render(<App />);
    expect(screen.getByTestId("graph-view")).toHaveAttribute("data-levels", "0"); // before any search
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Start Person"), "S");
    await user.type(screen.getByLabelText("End Person"), "T");
    await user.click(screen.getByRole("button", { name: "Start Search" }));
    await screen.findByRole("alert");
    expect(screen.getByTestId("graph-view")).toHaveAttribute("data-levels", "0"); // still empty after an error
  });

  it("/share, valid link: only the path of /api/path, no levels, so no graph", async () => {
    navigate("/share?p=S&p=P1");
    mockApi((url) => (url.pathname === "/api/path" ? { body: pathResponse([personMeta("S"), personMeta("P1")]) } : undefined));
    render(<App />);
    await screen.findByRole("list", { name: "Path" });
    expect(screen.queryByTestId("graph-view")).not.toBeInTheDocument();
  });

  it("/share, link no longer valid: the new search is drawn like any search result", async () => {
    navigate(`/share?${new URLSearchParams(PATH.map((n) => ["p", n]))}`);
    mockApi((url) => {
      if (url.pathname === "/api/path") return { body: pathResponse(null) };
      if (url.pathname === "/api/search") return { body: RESPONSE };
      return undefined;
    });
    render(<App />);
    expect(await screen.findByTestId("graph-view")).toHaveAttribute("data-levels", String(LEVELS.length));
  });
});
