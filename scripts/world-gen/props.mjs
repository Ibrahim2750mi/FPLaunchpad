// Reusable prop builders (all return Mesh parts; flat unless noted).
import { Mesh, C, lerpC, cylinder, box, blob, lathe, crystal, sweep, disc } from "./meshkit.mjs";
import { mulberry32 } from "../../src/world/noise.js";

export const stepStone = (r = 1.3, base = "#bfb2c8", top = "#e8dff0") =>
  lathe([[0, 0], [r, 0], [r * 0.98, 0.14], [r * 0.9, 0.42], [r * 0.74, 0.52], [0, 0.52]], 9, { colorFn: (rr, y) => lerpC(C(base), C(top), Math.min(1, y / 0.52)), jitter: 0.1 });

export function roundTree(rng, h, canopy, palette, seed = 1) {
  const m = new Mesh();
  m.append(cylinder(0.3, 0.2, h, 6, "#8a6272", "#a77a84", { caps: false }));
  const n = 3;
  for (let k = 0; k < n; k += 1) {
    const a = rng() * 6.28, d = k === 0 ? 0 : canopy * 0.45;
    const col = palette[Math.floor(rng() * palette.length)];
    m.append(blob(canopy * (k === 0 ? 1 : 0.72 + rng() * 0.2), { detail: 1, jitter: 0.2, seed: seed + k, color: col, flat: true, squash: 0.85 }), {
      t: [Math.cos(a) * d, h + canopy * 0.35 + (k === 0 ? 0.2 : rng() * canopy * 0.4), Math.sin(a) * d],
    });
  }
  return m;
}

export function pine(h, r, body, snow = null, levels = 3) {
  const m = new Mesh();
  m.append(cylinder(0.22, 0.18, h * 0.25, 6, "#6a4b5e", "#7d5a6c", { caps: false }));
  for (let l = 0; l < levels; l += 1) {
    const y = h * 0.14 + (l * h * 0.8) / levels;
    const rr = r * (1 - l * 0.24);
    m.append(cylinder(rr, 0.02, (h * 0.8) / levels * 1.45, 7, body[0], body[1], { caps: false, jitter: 0.14, seed: l }), { t: [0, y, 0] });
    if (snow) m.append(cylinder(rr * 0.78, 0.02, (h * 0.8) / levels * 0.95, 7, snow, "#ffffff", { caps: false, jitter: 0.05 }), { t: [0, y + (h * 0.8) / levels * 0.62, 0] });
  }
  return m;
}

export const rock = (r, color, seed = 1, squash = 0.65) => blob(r, { detail: 1, jitter: 0.28, seed, color, flat: true, squash });

export function flower(color) {
  return blob(0.2, { detail: 0, jitter: 0.1, color, flat: true, squash: 0.8 });
}

export function lanternPost(h = 2.4, post = "#7a5a72") {
  const wood = cylinder(0.12, 0.09, h, 6, post, "#9a7488", { caps: false });
  const orb = blob(0.34, { detail: 1, jitter: 0.06, color: "#fff2c4", flat: false });
  return { wood, orb };
}

/** Stone gate: two pillars and an arch. Faces +z. */
export function gate({ w = 3.5, h = 3.8, depth = 1.0, stone = "#d8cadc", accent = "#f0e4f2", archColor = null }) {
  const m = new Mesh();
  for (const sx of [-1, 1]) {
    m.append(box(1.05, h, depth, stone, accent, { seed: 3 }), { t: [sx * w, 0, 0] });
    m.append(box(1.45, 0.4, depth + 0.3, accent, accent, { jitter: 0 }), { t: [sx * w, h, 0] });
    m.append(box(1.4, 0.35, depth + 0.25, stone, stone, { jitter: 0 }), { t: [sx * w, 0, 0] });
  }
  const pts = Array.from({ length: 9 }, (_, i) => {
    const t = (i / 8) * Math.PI;
    return [Math.cos(t) * w, h + 0.2 + Math.sin(t) * (w * 0.78), 0];
  });
  m.append(sweep(pts, [[-depth / 2, -0.32], [depth / 2, -0.32], [depth / 2, 0.32], [-depth / 2, 0.32]], { colorFn: (t) => lerpC(C(archColor ?? stone), C(accent), Math.sin(t * Math.PI)) }));
  return m;
}

export function column(h = 5.2, r = 0.7, tone = "#f2e8da", gold = "#e5c070") {
  const prof = [[0, 0], [r * 1.55, 0], [r * 1.55, 0.35], [r * 1.05, 0.5], [r, 0.7], [r * 0.9, h], [r * 1.3, h + 0.15], [r * 1.55, h + 0.5], [r * 1.55, h + 0.7], [0, h + 0.7]];
  return lathe(prof, 10, { colorFn: (rr, y) => (y > h + 0.1 || y < 0.4 ? C(gold) : lerpC(C(tone), C("#e2d3c4"), Math.min(1, y / h) * 0.5)), jitter: 0.08 });
}

export const hexColumn = (r, h, bottom, top, seed = 0) => cylinder(r, r * 0.92, h, 6, bottom, top, { jitter: 0.14, seed });

export function glowOrb(r, c0, c1) {
  return blob(r, { detail: 1, jitter: 0.04, colorFn: (x, y, z) => lerpC(C(c0), C(c1), Math.min(1, Math.max(0, y / r * 0.5 + 0.5))), flat: false });
}

export { mulberry32, crystal, disc, box, blob, cylinder, lathe, sweep };
