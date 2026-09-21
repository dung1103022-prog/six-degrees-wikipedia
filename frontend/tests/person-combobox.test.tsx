// The Start/End Person field's A–Z suggestion dropdown (design request, 2026-09-21). One GET
// /api/people (already existed, Phase 1), cached, filtered client-side — see src/lib/people.ts and
// SPEC.md v2.16 for why this does not count as the "autocomplete" §0.3 excludes.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import PersonCombobox from "../src/components/PersonCombobox";
import { __resetPeopleCacheForTests } from "../src/lib/people";
import { mockApi } from "./helpers/api";

const NAMES = ["Albert Einstein", "Albert Camus", "Beyoncé", "Marie Curie", "Nikola Tesla"];

function Harness() {
  const [value, setValue] = useState("");
  return <PersonCombobox id="p" label="Start Person" value={value} onChange={setValue} />;
}

beforeEach(() => __resetPeopleCacheForTests());
afterEach(() => __resetPeopleCacheForTests());

describe("PersonCombobox", () => {
  it("shows no list before the field is focused", () => {
    mockApi((url) => (url.pathname === "/api/people" ? { body: NAMES } : undefined));
    render(<Harness />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("on focus (empty field), lists the names GET /api/people returned", async () => {
    mockApi((url) => (url.pathname === "/api/people" ? { body: NAMES } : undefined));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));

    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(NAMES);
  });

  it("typing filters the list by substring, case-insensitive", async () => {
    mockApi((url) => (url.pathname === "/api/people" ? { body: NAMES } : undefined));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");
    await user.type(screen.getByRole("combobox"), "albert");

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Albert Einstein", "Albert Camus"]);
  });

  it("clicking an option fills the field and closes the list", async () => {
    mockApi((url) => (url.pathname === "/api/people" ? { body: NAMES } : undefined));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    const list = await screen.findByRole("listbox");
    await user.click(within(list).getByText("Marie Curie"));

    expect(screen.getByRole("combobox")).toHaveValue("Marie Curie");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ArrowDown then Enter selects the highlighted option", async () => {
    mockApi((url) => (url.pathname === "/api/people" ? { body: NAMES } : undefined));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}{Enter}"); // highlight starts at Albert Einstein (index 0) -> Albert Camus

    expect(screen.getByRole("combobox")).toHaveValue("Albert Camus");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape closes the list without changing the value", async () => {
    mockApi((url) => (url.pathname === "/api/people" ? { body: NAMES } : undefined));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("fetches /api/people only once, however many times the field is focused", async () => {
    const { callsTo } = mockApi((url) => (url.pathname === "/api/people" ? { body: NAMES } : undefined));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");

    await waitFor(() => expect(callsTo("/api/people")).toHaveLength(1));
  });

  it("a rejected /api/people leaves the field usable as plain text (no crash, no list)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "Anyone");

    expect(screen.getByRole("combobox")).toHaveValue("Anyone");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
