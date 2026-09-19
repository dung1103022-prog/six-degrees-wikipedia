// SPEC §3.2, §3.6, §7.9 — FE-03: search errors are handled by `detail.code`, never by parsing a message.
// UI language is Vietnamese (Q-3). Labels used here: "Từ", "Đến", the button "Tìm đường", and error
// messages in an element with role "alert".
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { errorReply, mockApi, personMeta, searchResponse } from "./helpers/api";

const ONE = personMeta("Person One");
const TWO = personMeta("Person Two");

async function search(from: string, to: string) {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("Từ"), from);
  await user.type(screen.getByLabelText("Đến"), to);
  await user.click(screen.getByRole("button", { name: "Tìm đường" }));
  return user;
}

describe("search errors", () => {
  it("@spec FE-03 AMBIGUOUS_NAME on `from` lists the candidates; choosing one searches again with its canonical name", async () => {
    const { callsTo } = mockApi((url) => {
      if (url.pathname !== "/api/search") return undefined;
      const from = url.searchParams.get("from") ?? "";
      if (from === "X") return errorReply("AMBIGUOUS_NAME", "from", "X", [ONE, TWO]);
      return { body: searchResponse([personMeta(from), personMeta("Zed")]) };
    });

    const user = await search("X", "Zed");

    expect(await screen.findByRole("alert")).toHaveTextContent(/không rõ ràng/i);
    const one = screen.getByRole("button", { name: /Person One/ });
    const two = screen.getByRole("button", { name: /Person Two/ });
    expect(one).toBeInTheDocument();
    expect(callsTo("/api/search")).toHaveLength(1); // nothing is searched until a candidate is chosen

    await user.click(two);

    await waitFor(() => expect(callsTo("/api/search")).toHaveLength(2));
    const again = callsTo("/api/search")[1]!;
    expect(again.searchParams.get("from")).toBe("Person Two"); // the candidate's canonical name
    expect(again.searchParams.get("to")).toBe("Zed"); // the other input is unchanged
    expect(await screen.findByRole("list", { name: "Đường đi" })).toBeInTheDocument();
  });

  it("@spec FE-03 AMBIGUOUS_NAME on `to` replaces `to`, keeps `from`", async () => {
    const { callsTo } = mockApi((url) => {
      if (url.pathname !== "/api/search") return undefined;
      const to = url.searchParams.get("to") ?? "";
      if (to === "Y") return errorReply("AMBIGUOUS_NAME", "to", "Y", [ONE, TWO]);
      return { body: searchResponse([personMeta("Alice"), personMeta(to)]) };
    });

    const user = await search("Alice", "Y");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: /Person One/ }));

    await waitFor(() => expect(callsTo("/api/search")).toHaveLength(2));
    const again = callsTo("/api/search")[1]!;
    expect(again.searchParams.get("from")).toBe("Alice");
    expect(again.searchParams.get("to")).toBe("Person One");
  });

  it.each(["from", "to"] as const)("@spec FE-03 UNRESOLVED_NAME on `%s` names the input and offers no candidates", async (param) => {
    const { callsTo } = mockApi((url) =>
      url.pathname === "/api/search" ? errorReply("UNRESOLVED_NAME", param, "Nobody Here") : undefined,
    );

    await search("Nobody Here", "Zed");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/không tìm thấy/i);
    expect(alert).toHaveTextContent("Nobody Here");
    expect(alert).not.toHaveTextContent(/không rõ ràng/i);
    expect(screen.queryByRole("button", { name: /Person One/ })).not.toBeInTheDocument();
    expect(callsTo("/api/search")).toHaveLength(1);
  });
});

describe("search request and the other outcomes", () => {
  it("@spec FE-03 sends exactly one GET /api/search with from and to as typed (special characters intact)", async () => {
    const { calls } = mockApi((url) =>
      url.pathname === "/api/search" ? { body: searchResponse([personMeta("Earth, Wind & Fire"), personMeta("AC/DC")]) } : undefined,
    );

    await search("Earth, Wind & Fire", "AC/DC");

    await screen.findByRole("list", { name: "Đường đi" });
    expect(calls).toHaveLength(1); // no /api/resolve, no /api/path, no second search
    expect(calls[0]!.pathname).toBe("/api/search");
    expect(calls[0]!.searchParams.get("from")).toBe("Earth, Wind & Fire");
    expect(calls[0]!.searchParams.get("to")).toBe("AC/DC");
  });

  it("@spec FE-03 a found path is shown in order; nothing is reported as an error", async () => {
    mockApi((url) =>
      url.pathname === "/api/search"
        ? { body: searchResponse([personMeta("A"), personMeta("B"), personMeta("C")]) }
        : undefined,
    );

    await search("A", "C");

    const items = within(await screen.findByRole("list", { name: "Đường đi" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    ["A", "B", "C"].forEach((name, i) => expect(items[i]).toHaveTextContent(name));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("@spec FE-03 found=false (HTTP 200) is a result, not an error: a status message, no alert, no path", async () => {
    mockApi((url) =>
      url.pathname === "/api/search"
        ? {
            body: {
              found: false,
              from: "A",
              to: "Z",
              length: null,
              nodes_explored: 4,
              path: [],
              levels: [{ level: 0, nodes: ["A"] }],
            },
          }
        : undefined,
    );

    await search("A", "Z");

    expect(await screen.findByRole("status")).toHaveTextContent(/không có đường đi/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Đường đi" })).not.toBeInTheDocument();
  });

  it("@spec FE-03 HTTP 500 is a search error shown in an alert; no candidates, no second request", async () => {
    const { callsTo } = mockApi((url) =>
      url.pathname === "/api/search" ? { status: 500, body: { detail: "Internal Server Error" } } : undefined,
    );

    await search("A", "B");

    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể tìm kiếm/i);
    expect(screen.queryByRole("button", { name: /Person/ })).not.toBeInTheDocument();
    expect(callsTo("/api/search")).toHaveLength(1);
  });

  it("@spec FE-03 the network failing (fetch rejects) is a search error shown in an alert", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await search("A", "B");

    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể tìm kiếm/i);
  });

  it("@spec FE-03 a 404 whose detail.code is not one the page knows is a generic error, not a crash", async () => {
    mockApi((url) =>
      url.pathname === "/api/search"
        ? { status: 404, body: { detail: { code: "SOMETHING_NEW", param: "from", input: "A", candidates: [] } } }
        : undefined,
    );

    await search("A", "B");

    expect(await screen.findByRole("alert")).toHaveTextContent(/không thể tìm kiếm/i);
  });

  it("@spec FE-03 the search button stays disabled, and nothing is sent, while a field is empty", async () => {
    const { calls } = mockApi(() => undefined);
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole("button", { name: "Tìm đường" });

    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Từ"), "A");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Đến"), "B");
    expect(button).toBeEnabled();
    expect(calls).toHaveLength(0);
  });
});
