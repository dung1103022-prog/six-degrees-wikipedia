// A decorative, full-viewport night-sky WebGL background: five glowing ridge silhouettes, twinkling
// stars, and random meteors, drifting a little under the mouse for a light "floating" feel (design:
// 2026-09-22, from a reference WebGL page the user supplied -- rewritten from scratch here as a plain
// component; no external package, no network fetch, ADR-016). Purely presentational: it reads no app
// data and drives no behavior, so one instance is mounted once for the whole app (see App.tsx) rather
// than per page.
//
// Degrades safely, in order:
//   1. prefers-reduced-motion -> no canvas at all; the static gradient already on <body> (index.css)
//      shows instead, and nothing here ever starts an animation loop.
//   2. WebGL unavailable, or shader/program creation fails -> caught, canvas hidden, same fallback.
//   3. while `reduced` (../lib/backgroundQuality.tsx) is true -- the 3D graph panel is drawing a real
//      result in its own, separate WebGL context -- this canvas keeps running, but at a capped device
//      pixel ratio and roughly a quarter the frame rate, so the graph gets the GPU headroom.
import { useEffect, useRef, useState } from "react";
import { useBackgroundQuality } from "../lib/backgroundQuality";

const MAX_DPR_FULL = 2;
const MAX_DPR_REDUCED = 1;
const MOUSE_SMOOTH = 0.04;
const REDUCED_FRAME_MS = 1000 / 24; // ~24fps while the graph's own WebGL context also wants GPU time

const VS = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// One layer's shape, glow tint and how fast it drifts (in time and under the mouse) is inlined per
// block rather than looped over an array: WebGL1 / GLSL ES 1.00 does not reliably support indexing an
// array by a non-constant loop variable across every GPU/driver, so the five layers are spelled out.
const FS = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

float fbm(float x) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 5; i++) {
    val += amp * noise(x * freq);
    freq *= 2.17;
    amp *= 0.48;
  }
  return val;
}

float meteor(vec2 uv, float t) {
  float cycle = mod(t * 0.15, 1.0);
  float seed = floor(t * 0.15);
  float h = hash(seed * 7.31);
  float h2 = hash(seed * 13.17);
  if (h > 0.30) return 0.0; // most cycles: no meteor at all, like the reference video
  vec2 start = vec2(0.2 + h2 * 0.6, 0.7 + h * 0.25);
  vec2 dir = normalize(vec2(1.0, -0.6 - h * 0.3));
  float progress = smoothstep(0.0, 0.7, cycle);
  vec2 pos = start + dir * progress * 0.5;
  vec2 toP = uv - pos;
  float along = dot(toP, dir);
  float perp = length(toP - dir * along);
  float trail = smoothstep(0.0, -0.12, along) * smoothstep(-0.18, -0.04, along);
  float core = smoothstep(0.003, 0.0, perp) * trail;
  float glow = smoothstep(0.012, 0.0, perp) * trail * 0.3;
  float fade = smoothstep(0.0, 0.1, cycle) * smoothstep(0.8, 0.55, cycle);
  return (core + glow) * fade;
}

float stars(vec2 uv, float density) {
  vec2 cell = floor(uv * density);
  vec2 sub = fract(uv * density);
  float h = hash2(cell);
  float brightness = step(0.975, h);
  float size = 0.025 + h * 0.045;
  float d = length(sub - vec2(hash2(cell + 100.0), hash2(cell + 200.0)));
  float star = brightness * smoothstep(size, 0.0, d);
  star *= 0.5 + 0.5 * sin(u_time * (1.0 + h * 3.0) + h * 6.28);
  return star;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 mouse = u_mouse * 2.0 - 1.0;

  vec3 skyTop = vec3(0.015, 0.012, 0.045);
  vec3 skyMid = vec3(0.035, 0.025, 0.085);
  vec3 skyBottom = vec3(0.065, 0.045, 0.14);
  vec3 col = mix(skyBottom, skyMid, smoothstep(0.3, 0.6, uv.y));
  col = mix(col, skyTop, smoothstep(0.6, 1.0, uv.y));

  float horizonGlow = exp(-pow((uv.y - 0.35) * 3.8, 2.0));
  col += vec3(0.15, 0.07, 0.26) * horizonGlow * 0.8;
  float centerGlow = exp(-pow((uv.x - 0.5) * 1.5, 2.0)) * exp(-pow((uv.y - 0.35) * 4.0, 2.0));
  col += vec3(0.14, 0.10, 0.24) * centerGlow * 0.6;

  float starField = stars(uv * vec2(aspect, 1.0), 60.0)
                   + stars(uv * vec2(aspect, 1.0) + 500.0, 100.0) * 0.7
                   + stars(uv * vec2(aspect, 1.0) + 900.0, 160.0) * 0.4;
  float starMask = 1.0;
  float xC, yS, prof, mTop, mtn, rDist, rGlow;
  vec3 lC;

  // Layer 0 (farthest: slowest drift, smallest mouse parallax)
  lC = vec3(0.14, 0.10, 0.24);
  xC = uv.x * aspect * 1.6 + u_time * 0.006 + mouse.x * 0.010;
  yS = mouse.y * 0.003;
  prof = fbm(xC) * 0.10 + fbm(xC * 0.3 + 17.0) * 0.07;
  mTop = 0.40 + prof + yS;
  mtn = smoothstep(mTop + 0.003, mTop - 0.001, uv.y);
  rDist = abs(uv.y - mTop);
  rGlow = smoothstep(0.012, 0.0, rDist) * 0.18;
  col = mix(col, lC, mtn);
  col += vec3(0.20, 0.10, 0.35) * rGlow;
  starMask *= (1.0 - mtn);

  // Layer 1
  lC = vec3(0.11, 0.07, 0.19);
  xC = uv.x * aspect * 2.0 + u_time * 0.012 + mouse.x * 0.020;
  yS = mouse.y * 0.006;
  prof = fbm(xC) * 0.13 + fbm(xC * 0.3 + 34.0) * 0.091;
  mTop = 0.33 + prof + yS;
  mtn = smoothstep(mTop + 0.003, mTop - 0.001, uv.y);
  rDist = abs(uv.y - mTop);
  rGlow = smoothstep(0.012, 0.0, rDist) * 0.15;
  col = mix(col, lC, mtn);
  col += vec3(0.20, 0.10, 0.35) * rGlow;
  starMask *= (1.0 - mtn);

  // Layer 2
  lC = vec3(0.08, 0.05, 0.14);
  xC = uv.x * aspect * 2.6 + u_time * 0.020 + mouse.x * 0.034;
  yS = mouse.y * 0.010;
  prof = fbm(xC) * 0.16 + fbm(xC * 0.3 + 51.0) * 0.112;
  mTop = 0.26 + prof + yS;
  mtn = smoothstep(mTop + 0.003, mTop - 0.001, uv.y);
  rDist = abs(uv.y - mTop);
  rGlow = smoothstep(0.012, 0.0, rDist) * 0.12;
  col = mix(col, lC, mtn);
  col += vec3(0.20, 0.10, 0.35) * rGlow;
  starMask *= (1.0 - mtn);

  // Layer 3
  lC = vec3(0.05, 0.03, 0.09);
  xC = uv.x * aspect * 3.2 + u_time * 0.030 + mouse.x * 0.050;
  yS = mouse.y * 0.015;
  prof = fbm(xC) * 0.14 + fbm(xC * 0.3 + 68.0) * 0.098;
  mTop = 0.18 + prof + yS;
  mtn = smoothstep(mTop + 0.003, mTop - 0.001, uv.y);
  rDist = abs(uv.y - mTop);
  rGlow = smoothstep(0.012, 0.0, rDist) * 0.09;
  col = mix(col, lC, mtn);
  col += vec3(0.20, 0.10, 0.35) * rGlow;
  starMask *= (1.0 - mtn);

  // Layer 4 (nearest: fastest drift, largest mouse parallax)
  lC = vec3(0.03, 0.018, 0.055);
  xC = uv.x * aspect * 4.0 + u_time * 0.044 + mouse.x * 0.070;
  yS = mouse.y * 0.021;
  prof = fbm(xC) * 0.11 + fbm(xC * 0.3 + 85.0) * 0.077;
  mTop = 0.09 + prof + yS;
  mtn = smoothstep(mTop + 0.003, mTop - 0.001, uv.y);
  rDist = abs(uv.y - mTop);
  rGlow = smoothstep(0.012, 0.0, rDist) * 0.06;
  col = mix(col, lC, mtn);
  col += vec3(0.20, 0.10, 0.35) * rGlow;
  starMask *= (1.0 - mtn);

  col += vec3(0.9, 0.8, 1.0) * starField * starMask;
  float met = meteor(uv * vec2(aspect, 1.0), u_time);
  col += vec3(0.8, 0.6, 1.0) * met * starMask;

  float vig = 1.0 - 0.3 * pow(length((uv - 0.5) * vec2(1.1, 1.6)), 2.0);
  col *= vig;

  float haze = exp(-pow((uv.y - 0.33) * 5.0, 2.0)) * 0.05;
  col += vec3(0.15, 0.10, 0.30) * haze;

  col = pow(col, vec3(0.95));
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
  return shader;
}

export default function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { reduced } = useBackgroundQuality();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  // Read synchronously, in the initial state itself, not via an effect: an effect would only
  // *correct* the default after the first commit, and that first commit would already have run the
  // WebGL-setup effect below with the wrong (true) value -- one wasted context/canvas even under
  // prefers-reduced-motion, and briefly the very motion this is meant to never start.
  const [motionOk, setMotionOk] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent): void => setMotionOk(!event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!motionOk) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;

    let gl: WebGLRenderingContext | null;
    try {
      gl = canvas.getContext("webgl", { antialias: true, alpha: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
    if (gl === null) {
      setSupported(false);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    const program = vs !== null && fs !== null ? gl.createProgram() : null;
    if (vs === null || fs === null || program === null) {
      setSupported(false);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setSupported(false);
      return;
    }
    gl.useProgram(program);
    setSupported(true);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMouse = gl.getUniformLocation(program, "u_mouse");

    let mx = 0.5;
    let my = 0.5;
    let smx = 0.5;
    let smy = 0.5;
    function onMouseMove(event: MouseEvent): void {
      mx = event.clientX / window.innerWidth;
      my = 1 - event.clientY / window.innerHeight;
    }
    window.addEventListener("mousemove", onMouseMove);

    function resize(): void {
      const cap = reducedRef.current ? MAX_DPR_REDUCED : MAX_DPR_FULL;
      const dpr = Math.min(window.devicePixelRatio || 1, cap);
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      // `canvas`/`gl` are narrowed non-null above, but that narrowing does not carry into a nested
      // function declaration -- asserted the same way `gl!` already is just below.
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width;
        canvas!.height = height;
        gl!.viewport(0, 0, width, height);
      }
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let lastDraw = 0;
    function frame(t: number): void {
      raf = window.requestAnimationFrame(frame);
      if (reducedRef.current && t - lastDraw < REDUCED_FRAME_MS) return;
      lastDraw = t;
      resize(); // cheap: a no-op unless the reduced/full dpr cap or the window size actually changed
      smx += (mx - smx) * MOUSE_SMOOTH;
      smy += (my - smy) * MOUSE_SMOOTH;
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, t * 0.001);
      gl!.uniform2f(uMouse, smx, smy);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [motionOk]);

  const showCanvas = motionOk && supported;
  return (
    <div className="ambient-bg" aria-hidden="true" data-testid="ambient-background" data-quality={reduced ? "reduced" : "full"}>
      {motionOk ? <canvas ref={canvasRef} className="ambient-bg-canvas" style={{ display: showCanvas ? "block" : "none" }} /> : null}
    </div>
  );
}
