// Shared floating-island body: terrain top with a rolled lip, strata-banded rock underside, vines, floating chunks.
import { Mesh, C, lerpC, shade, paint, cylinder } from "./meshkit.mjs";
import { noise2, smoothstep, clamp, mix } from "../../src/world/noise.js";

export function islandBody({
  R = 17, depth = 13, seed = 1, segs = 64, rings = 17, underRings = 13, lobe = 0.1,
  topFn, topColor, lipColor, soilColor = "#8a5a60", rockTop = "#a77a86", rockBottom = "#4c3a72", puffy = false,
}) {
  const m = new Mesh({ flat: false });
  const radiusAt = (a) => R * (1 + lobe * (noise2(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3, seed) - 0.5) * 2 + 0.035 * Math.sin(3 * a + seed));
  const rimY = (x, z) => topFn(x, z) - 0.95;
  const lip = C(lipColor), soil = C(soilColor), rt = C(rockTop), rb = C(rockBottom);
  const center = m.vert(0, topFn(0, 0), 0, paint(C(topColor(0, topFn(0, 0), 0, 0, 0)), 0, 0, 0, seed, 0.2));
  let prev = null;
  const grid = [];
  for (let k = 1; k <= rings; k += 1) {
    const f = k / rings, fr = f ** 0.88;
    const ring = [];
    for (let s = 0; s < segs; s += 1) {
      const a = (s / segs) * Math.PI * 2;
      const rr = fr * radiusAt(a);
      const x = Math.cos(a) * rr, z = -Math.sin(a) * rr;
      const e = smoothstep(0.84, 1, f);
      const y = topFn(x, z) - e * e * 0.95;
      let col = C(topColor(x, y, z, f, a));
      col = lerpC(col, lip, smoothstep(0.9, 0.985, f) * 0.8);
      col = lerpC(col, soil, smoothstep(0.985, 1, f));
      ring.push(m.vert(x, y, z, paint(col, x, y, z, seed, 0.2)));
    }
    grid.push(ring);
  }
  const under = [];
  for (let j = 1; j <= underRings; j += 1) {
    const g = j / underRings;
    const ring = [];
    const pole = j === underRings;
    for (let s = 0; s < (pole ? 1 : segs); s += 1) {
      const a = (s / segs) * Math.PI * 2;
      const Ra = radiusAt(a);
      const wob = 0.86 + 0.28 * noise2(a * 1.9 + seed, g * 2.4, seed + 3);
      const rr = pole ? 0 : Ra * (1 - g) ** 0.82 * wob;
      const x = Math.cos(a) * rr, z = -Math.sin(a) * rr;
      const rimYa = rimY(Math.cos(a) * Ra, -Math.sin(a) * Ra);
      const dy = depth * g ** 0.9 * (0.82 + 0.36 * noise2(a * 2.3 + 5, g * 1.7, seed + 9));
      const y = rimYa - dy - (pole ? depth * 0.12 : 0);
      const strata = Math.sin(y * 1.45 + noise2(x * 0.25, z * 0.25, seed) * 4) * 0.5 + 0.5;
      let col = lerpC(soil, lerpC(rt, rb, smoothstep(0.08, 0.95, g)), smoothstep(0, 0.22, g));
      col = shade(col, 0.88 + strata * 0.2);
      if (puffy) col = lerpC(col, [0.98, 0.9, 0.96], 0.55);
      ring.push(m.vert(x, y, z, paint(col, x, y, z, seed + 2, 0.24)));
    }
    under.push(ring);
  }
  // Top fan + rings.
  for (let s = 0; s < segs; s += 1) m.tri(center, grid[0][s], grid[0][(s + 1) % segs]);
  for (let k = 0; k < rings - 1; k += 1) for (let s = 0; s < segs; s += 1) {
    const s1 = (s + 1) % segs;
    m.quad(grid[k][s], grid[k + 1][s], grid[k + 1][s1], grid[k][s1]);
  }
  // Rim to underside rings (outward-facing).
  const stack = [grid[rings - 1], ...under];
  for (let k = 0; k < stack.length - 1; k += 1) {
    const lo = stack[k], hi = stack[k + 1];
    for (let s = 0; s < segs; s += 1) {
      const s1 = (s + 1) % segs;
      if (hi.length === 1) m.tri(lo[s], hi[0], lo[s1]);
      else m.quad(lo[s], hi[s], hi[s1], lo[s1]);
    }
  }
  const underY = (x, z) => {
    const a = (Math.atan2(-z, x) + Math.PI * 2) % (Math.PI * 2);
    const Ra = radiusAt(a);
    const r = Math.hypot(x, z);
    const g = clamp(1 - (r / Ra) ** (1 / 0.82), 0, 1);
    return rimY(Math.cos(a) * Ra, -Math.sin(a) * Ra) - depth * g ** 0.9;
  };
  return { mesh: m, H: topFn, radiusAt, underY, R, depth, seed };
}

/** Hanging vines / icicles / roots below the rim. */
export function hangers(body, rng, { count = 10, colorTop, colorBottom, length = [3, 6.5], radius = 0.12, seg = 5 }) {
  const m = new Mesh({ flat: true });
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const rr = body.radiusAt(a) * (0.55 + rng() * 0.38);
    const x = Math.cos(a) * rr, z = -Math.sin(a) * rr;
    const y0 = body.underY(x, z) + 0.4;
    const len = length[0] + rng() * (length[1] - length[0]);
    // A tapered root, wide at its base and pointed at the hanging end.
    const up = cylinder(0.01, radius, len, seg, colorBottom, colorTop, { caps: false, jitter: 0.1, seed: i });
    m.append(up, { t: [x, y0 - len, z], ry: rng() * 6 });
  }
  return m;
}

/** Deterministic scatter with minimum spacing and an avoid predicate. */
export function scatter(count, rng, { minR = 0, maxR = 16, minDist = 2, avoid = () => false, tries = 60, taken = [] }) {
  const out = [];
  const all = [...taken];
  for (let n = 0; n < count; n += 1) {
    for (let t = 0; t < tries; t += 1) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(mix(minR * minR, maxR * maxR, rng()));
      const x = Math.cos(a) * r, z = -Math.sin(a) * r;
      if (avoid(x, z)) continue;
      if (all.some((p) => Math.hypot(p[0] - x, p[1] - z) < minDist)) continue;
      out.push([x, z]); all.push([x, z]);
      break;
    }
  }
  return out;
}
