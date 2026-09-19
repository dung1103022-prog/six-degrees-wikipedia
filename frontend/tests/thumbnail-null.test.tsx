// SPEC §2, Q-11, Q-19, §7.9 — FE-06: PersonMeta with thumbnail = null.
// Everywhere a PersonMeta is shown (search path, AMBIGUOUS_NAME candidates, /share path) the frontend
// draws a placeholder (data-testid="thumb-placeholder"): no <img> at all for it (never an empty, "null"
// or "None" src), no crash, and the name is still there. A string thumbnail is used verbatim (Q-11).
// jsdom does not load images, so "no image request" is checked as "no <img> element".
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../src/App";
import { errorReply, mockApi, navigate, pathResponse, personMeta, searchResponse } from "./helpers/api";

// A real-looking MediaWiki thumbnail URL, query string included: it must reach the <img> untouched.
const THUMB = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Nikola_Tesla.jpg/200px-Nikola_Tesla.jpg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original";

const NO_PHOTO = personMeta("No Photo", null, "A person without a picture");
const WITH_PHOTO = personMeta("With Photo", THUMB, "A person with a picture");
const PLACEHOLDER = "thumb-placeholder";

function imgSources(root: HTMLElement | Document = document): (string | null)[] {
  return [...root.querySelectorAll("img")].map((img) => img.getAttribute("src"));
}

function expectNoBrokenImages(): void {
  for (const src of imgSources()) {
    expect(src).toBeTruthy();
    expect(["null", "None", "undefined", ""]).not.toContain(src);
  }
}

async function runSearch() {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("Từ"), "No Photo");
  await user.type(screen.getByLabelText("Đến"), "With Photo");
  await user.click(screen.getByRole("button", { name: "Tìm đường" }));
  return user;
}

describe("thumbnail = null", () => {
  it("@spec FE-06 search path: a placeholder for the person without a picture, the verbatim <img> for the other", async () => {
    mockApi((url) => (url.pathname === "/api/search" ? { body: searchResponse([NO_PHOTO, WITH_PHOTO]) } : undefined));

    await runSearch();

    const list = await screen.findByRole("list", { name: "Đường đi" });
    const [noPhoto, withPhoto] = within(list).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(noPhoto).toHaveTextContent("No Photo");
    expect(within(noPhoto).getByTestId(PLACEHOLDER)).toBeInTheDocument();
    expect(noPhoto.querySelector("img")).toBeNull();
    expect(within(withPhoto).queryByTestId(PLACEHOLDER)).not.toBeInTheDocument();
    expect(imgSources(withPhoto)).toEqual([THUMB]); // not trimmed, not resized, not re-encoded
    expectNoBrokenImages();
  });

  it("@spec FE-06 search path where nobody has a picture: no <img> at all", async () => {
    mockApi((url) => (url.pathname === "/api/search" ? { body: searchResponse([NO_PHOTO, personMeta("Also None")]) } : undefined));

    await runSearch();

    const list = await screen.findByRole("list", { name: "Đường đi" });
    expect(within(list).getAllByTestId(PLACEHOLDER)).toHaveLength(2);
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });

  it("@spec FE-06 AMBIGUOUS_NAME candidates: placeholders for null thumbnails, names still shown", async () => {
    mockApi((url) =>
      url.pathname === "/api/search" ? errorReply("AMBIGUOUS_NAME", "from", "X", [NO_PHOTO, WITH_PHOTO]) : undefined,
    );

    await runSearch();

    const noPhoto = await screen.findByRole("button", { name: /No Photo/ });
    const withPhoto = screen.getByRole("button", { name: /With Photo/ });
    expect(within(noPhoto).getByTestId(PLACEHOLDER)).toBeInTheDocument();
    expect(noPhoto.querySelector("img")).toBeNull();
    expect(imgSources(withPhoto)).toEqual([THUMB]);
    expectNoBrokenImages();
  });

  it("@spec FE-06 /share path: placeholder for null thumbnails, verbatim <img> otherwise", async () => {
    navigate("/share?p=No+Photo&p=With+Photo");
    mockApi((url) => (url.pathname === "/api/path" ? { body: pathResponse([NO_PHOTO, WITH_PHOTO]) } : undefined));

    render(<App />);

    const list = await screen.findByRole("list", { name: "Đường đi" });
    const [noPhoto, withPhoto] = within(list).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(noPhoto).toHaveTextContent("No Photo");
    expect(within(noPhoto).getByTestId(PLACEHOLDER)).toBeInTheDocument();
    expect(noPhoto.querySelector("img")).toBeNull();
    expect(imgSources(withPhoto)).toEqual([THUMB]);
    expectNoBrokenImages();
  });
});
