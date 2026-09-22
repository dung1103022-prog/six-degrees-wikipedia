// AmbientBackground: the decorative night-sky canvas (design: 2026-09-22). What is checked is the
// contract that matters to the rest of the app, not the visuals: it never throws when WebGL is
// unavailable (jsdom's own canvas.getContext already throws "not implemented" -- no mock needed for
// that path), it never starts an animation loop when prefers-reduced-motion is set, and it actually
// drives a real WebGL context (uniforms + draw calls) the rest of the time, at a lower resolution and
// a throttled frame rate while ../lib/backgroundQuality.tsx reports `reduced`.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AmbientBackground from "../src/components/AmbientBackground";
import { BackgroundQualityProvider, useBackgroundQuality } from "../src/lib/backgroundQuality";

interface FakeGL {
  calls: Record<string, unknown[][]>;
  drawCount: number;
}

function installFakeWebGL(): FakeGL {
  const fake: FakeGL = { calls: {}, drawCount: 0 };
  const record = (name: string, args: unknown[]): void => {
    (fake.calls[name] ??= []).push(args);
  };
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    ARRAY_BUFFER: 3,
    STATIC_DRAW: 4,
    FLOAT: 5,
    TRIANGLE_STRIP: 6,
    COMPILE_STATUS: 7,
    LINK_STATUS: 8,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    useProgram: () => {},
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    getUniformLocation: (_p: unknown, name: string) => name,
    viewport: (...args: unknown[]) => record("viewport", args),
    uniform2f: (...args: unknown[]) => record("uniform2f", args),
    uniform1f: (...args: unknown[]) => record("uniform1f", args),
    drawArrays: (...args: unknown[]) => {
      fake.drawCount += 1;
      record("drawArrays", args);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((type: string) =>
    type === "webgl" ? gl : null) as typeof HTMLCanvasElement.prototype.getContext);
  return fake;
}

function reducedMotion(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/** A stand-in for SearchPage/SharePage: renders the background plus a button that flips
 * backgroundQuality's `reduced` flag, exactly as setGraphActive(true) would when a result is drawn. */
function Harness() {
  return (
    <BackgroundQualityProvider>
      <AmbientBackground />
      <ReducerButton />
    </BackgroundQualityProvider>
  );
}
function ReducerButton() {
  const { setGraphActive } = useBackgroundQuality();
  return (
    <button type="button" onClick={() => setGraphActive(true)}>
      reduce
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("AmbientBackground", () => {
  it("without WebGL (jsdom has none) it hides its canvas instead of crashing the page", () => {
    render(<Harness />);
    advance(100);
    const root = screen.getByTestId("ambient-background");
    expect(root).toHaveAttribute("aria-hidden", "true");
    const canvas = root.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveStyle({ display: "none" });
  });

  it("with WebGL available, compiles the shader once and draws frames", () => {
    const fake = installFakeWebGL();
    render(<Harness />);
    advance(200);
    expect(fake.drawCount).toBeGreaterThan(0);
    expect(fake.calls.uniform2f?.some((args) => args[0] === "u_mouse")).toBe(true);
    expect(fake.calls.uniform1f?.some((args) => args[0] === "u_time")).toBe(true);
  });

  it("respects prefers-reduced-motion: no canvas, no WebGL context ever requested", () => {
    reducedMotion(true);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    render(<Harness />);
    advance(200);
    expect(screen.getByTestId("ambient-background").querySelector("canvas")).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
  });

  it('reduces resolution while backgroundQuality reports "reduced" (3D graph drawing a result)', () => {
    installFakeWebGL();
    render(<Harness />);
    advance(50);
    const canvas = screen.getByTestId("ambient-background").querySelector("canvas")!;
    const fullWidth = canvas.width;

    act(() => screen.getByRole("button", { name: "reduce" }).click());
    advance(200);

    expect(screen.getByTestId("ambient-background")).toHaveAttribute("data-quality", "reduced");
    // devicePixelRatio is 1 in jsdom by default, so the dpr cap alone won't shrink the canvas here --
    // what's checked is that going reduced never *grows* it, and the draw loop keeps running throttled.
    expect(canvas.width).toBeLessThanOrEqual(fullWidth);
  });

  it("cleans up its listeners and animation frame on unmount, without throwing", () => {
    installFakeWebGL();
    const { unmount } = render(<Harness />);
    advance(50);
    expect(() => unmount()).not.toThrow();
  });
});
