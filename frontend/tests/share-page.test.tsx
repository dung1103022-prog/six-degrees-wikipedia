// SPEC §5.6, §7.9 — FE-04: the /share page.
// It calls GET /api/path with exactly the `p` list of the URL and never validates a path itself.
// UI language is English: the invalid-link message contains "no longer valid".
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import App from "../src/App";
import { errorReply, mockApi, navigate, pathResponse, personMeta, searchResponse } from "./helpers/api";

const A = personMeta("A");
const B = personMeta("B");
const C = personMeta("C");
const INVALID = /no longer valid/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pQuery = (names: string[]) => `/share?${new URLSearchParams(names.map((n) => ["p", n]))}`;

describe("/share page", () => {
  it("@spec FE-04 valid path: calls /api/path with exactly the p list, shows the returned path, calls nothing else", async () => {
    navigate(pQuery(["A", "B", "C"]));
    const { calls } = mockApi((url) => (url.pathname === "/api/path" ? { body: pathResponse([A, B, C]) } : undefined));

    render(<App />);

    const list = await screen.findByRole("list", { name: "Path" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    ["A", "B", "C"].forEach((name, i) => expect(items[i]).toHaveTextContent(name));
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
    expect(calls.map((c) => c.pathname)).toEqual(["/api/path"]);
    expect(calls[0]!.searchParams.getAll("p")).toEqual(["A", "B", "C"]);
  });

  it("@spec FE-04 sends the list as it is: no client-side validation (11 names, an underscore, a duplicate)", async () => {
    const names = ["A", "B", "B", "Albert_Einstein", "C", "D", "E", "F", "G", "H", "I"]; // 11 > the limit of 10
    navigate(pQuery(names));
    const { callsTo } = mockApi((url) => {
      if (url.pathname === "/api/path") return { body: pathResponse(null) };
      if (url.pathname === "/api/search") return errorReply("UNRESOLVED_NAME", "to", "I");
      return undefined;
    });

    render(<App />);

    await screen.findByText(INVALID);
    expect(callsTo("/api/path")).toHaveLength(1);
    expect(callsTo("/api/path")[0]!.searchParams.getAll("p")).toEqual(names);
  });

  it("@spec FE-04 valid=false with at least two p: shows the message, then runs a NEW search from p[0] to p[-1]", async () => {
    navigate(pQuery(["A", "B", "C"]));
    const { calls } = mockApi((url) => {
      if (url.pathname === "/api/path") return { body: pathResponse(null) };
      if (url.pathname === "/api/search") return { body: searchResponse([A, personMeta("X"), C]) };
      return undefined;
    });

    render(<App />);

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Path" });
    expect(within(list).getAllByRole("listitem")[1]).toHaveTextContent("X");
    expect(calls.map((c) => c.pathname)).toEqual(["/api/path", "/api/search"]); // in this order, nothing else
    expect(calls[1]!.searchParams.get("from")).toBe("A");
    expect(calls[1]!.searchParams.get("to")).toBe("C");
  });

  it("@spec FE-04 the new search failing with 404 shows the error by detail.code; the invalid-link message stays", async () => {
    navigate(pQuery(["A", "B"]));
    mockApi((url) => {
      if (url.pathname === "/api/path") return { body: pathResponse(null) };
      if (url.pathname === "/api/search") return errorReply("UNRESOLVED_NAME", "to", "B");
      return undefined;
    });

    render(<App />);

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not find/i);
  });

  it.each([
    ["no p at all", "/share", []],
    ["a single p", "/share?p=Solo", ["Solo"]],
  ])("@spec FE-04 valid=false with fewer than two p (%s): only the message, no search", async (_label, url, names) => {
    navigate(url);
    const { calls } = mockApi((u) => (u.pathname === "/api/path" ? { body: pathResponse(null) } : undefined));

    render(<App />);

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    await sleep(50); // give a wrongly-issued search the time to happen
    expect(calls.map((c) => c.pathname)).toEqual(["/api/path"]);
    expect(calls[0]!.searchParams.getAll("p")).toEqual(names);
    expect(screen.queryByRole("list", { name: "Path" })).not.toBeInTheDocument();
  });

  it("@spec FE-04 under React StrictMode (effects run twice) /api/path is still called once and the path is shown", async () => {
    navigate(pQuery(["A", "B"]));
    const { calls } = mockApi((url) => (url.pathname === "/api/path" ? { body: pathResponse([A, B]) } : undefined));

    render(<App />, { wrapper: StrictMode });

    expect(await screen.findByRole("list", { name: "Path" })).toBeInTheDocument();
    await sleep(50);
    expect(calls.map((c) => c.pathname)).toEqual(["/api/path"]);
  });

  it("@spec FE-04 valid=true is shown as returned, whatever the number of p: no search, nothing else is called", async () => {
    navigate("/share?p=A");
    const { calls } = mockApi((url) => (url.pathname === "/api/path" ? { body: pathResponse([A]) } : undefined));

    render(<App />);

    const list = await screen.findByRole("list", { name: "Path" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await sleep(50);
    expect(calls.map((c) => c.pathname)).toEqual(["/api/path"]);
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
  });

  it("@spec FE-04 /api/path itself failing (HTTP 500) is an error alert, not an invalid link, and starts no search", async () => {
    navigate(pQuery(["A", "B"]));
    const { calls } = mockApi((url) => (url.pathname === "/api/path" ? { status: 500, body: { detail: "boom" } } : undefined));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the path/i);
    await sleep(50);
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
    expect(calls.map((c) => c.pathname)).toEqual(["/api/path"]);
  });

  it("@spec FE-04 the new search failing with AMBIGUOUS_NAME lists the candidates; choosing one searches again with its canonical name", async () => {
    navigate(pQuery(["Amb", "B", "C"]));
    const one = personMeta("Person One");
    const two = personMeta("Person Two");
    const { callsTo } = mockApi((url) => {
      if (url.pathname === "/api/path") return { body: pathResponse(null) };
      if (url.pathname !== "/api/search") return undefined;
      const from = url.searchParams.get("from") ?? "";
      if (from === "Amb") return errorReply("AMBIGUOUS_NAME", "from", "Amb", [one, two]);
      return { body: searchResponse([personMeta(from), personMeta("C")]) };
    });
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/is ambiguous/i);
    await user.click(screen.getByRole("button", { name: /Person Two/ }));

    await waitFor(() => expect(callsTo("/api/search")).toHaveLength(2));
    const again = callsTo("/api/search")[1]!;
    expect(again.searchParams.get("from")).toBe("Person Two");
    expect(again.searchParams.get("to")).toBe("C"); // the last p, unchanged
    expect(await screen.findByRole("list", { name: "Path" })).toBeInTheDocument();
    expect(screen.getByText(INVALID)).toBeInTheDocument(); // the invalid-link message stays
    expect(callsTo("/api/path")).toHaveLength(1); // the path is not asked for again
  });
});
