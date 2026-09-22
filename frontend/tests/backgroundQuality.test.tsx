// backgroundQuality: the small context SearchPage/SharePage use to tell AmbientBackground the 3D
// graph is drawing a real result (design: 2026-09-22). Tested on its own, independent of either
// component, since both consume it.
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BackgroundQualityProvider, useBackgroundQuality } from "../src/lib/backgroundQuality";

function Probe() {
  const { reduced, setGraphActive } = useBackgroundQuality();
  return (
    <>
      <span data-testid="reduced">{String(reduced)}</span>
      <button type="button" onClick={() => setGraphActive(true)}>
        on
      </button>
      <button type="button" onClick={() => setGraphActive(false)}>
        off
      </button>
    </>
  );
}

describe("backgroundQuality", () => {
  it("starts not reduced, and setGraphActive toggles it", () => {
    render(
      <BackgroundQualityProvider>
        <Probe />
      </BackgroundQualityProvider>,
    );
    expect(screen.getByTestId("reduced")).toHaveTextContent("false");

    act(() => screen.getByRole("button", { name: "on" }).click());
    expect(screen.getByTestId("reduced")).toHaveTextContent("true");

    act(() => screen.getByRole("button", { name: "off" }).click());
    expect(screen.getByTestId("reduced")).toHaveTextContent("false");
  });

  it("throws a clear error when used outside the provider", () => {
    // Swallow the error React logs to the console for this one expected throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useBackgroundQuality must be used within/);
    spy.mockRestore();
  });
});
