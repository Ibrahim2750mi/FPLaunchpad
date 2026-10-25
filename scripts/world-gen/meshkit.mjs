// Tiny vertex-coloured mesh toolkit used to author the island and guide-light GLBs procedurally.
import { clamp, noise3, mix, mulberry32 } from "../../src/world/noise.js";

export const hexRgb = (h) => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const C = (c) => (typeof c === "string" ? hexRgb(c) : c);
export const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
export const shade = (c, f) => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];
/** Painterly colour variation: low-frequency brightness drift plus a slight warm/cool shift. */
export function paint(c, x, y, z, seed = 0, amount = 0.22) {
  const n = noise3(x * 0.33, y * 0.33, z * 0.33, seed) - 0.5;
  const m = noise3(x * 0.9 + 9, y * 0.9, z * 0.9, seed + 5) - 0.5;
  const f = 1 + n * amount * 1.6 + m * amount * 0.5;
  const w = n * 0.07;
  return [clamp(c[0] * f * (1 + w)), clamp(c[1] * f), clamp(c[2] * f * (1 - w))];
}

function xf(p, m) {
  let [x, y, z] = p;
  const s = m.s ?? 1;
  const [sx, sy, sz] = Array.isArray(s) ? s : [s, s, s];
  x *= sx; y *= sy; z *= sz;
  if (m.rx) { const c = Math.cos(m.rx), si = Math.sin(m.rx); [y, z] = [y * c - z * si, y * si + z * c]; }
  if (m.rz) { const c = Math.cos(m.rz), si = Math.sin(m.rz); [x, y] = [x * c - y * si, x * si + y * c]; }
  if (m.ry) { const c = Math.cos(m.ry), si = Math.sin(m.ry); [x, z] = [x * c + z * si, -x * si + z * c]; }
  const t = m.t ?? [0, 0, 0];
  return [x + t[0], y + t[1], z + t[2]];
}

export class Mesh {
  constructor({ flat = false } = {}) {
    this.p = []; this.c = []; this.i = []; this.flat = flat;
  }
  vert(x, y, z, c) {
    const n = this.p.length / 3;
    this.p.push(x, y, z); this.c.push(c[0], c[1], c[2]);
    return n;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get triCount() { return this.i.length / 3; }
  get vertCount() { return this.p.length / 3; }

  /** Append another mesh with an optional TRS transform and colour tint multiplier. */
  append(part, m = {}) {
    const col = (k) => {
      const c = [part.c[k * 3], part.c[k * 3 + 1], part.c[k * 3 + 2]];
      return m.tint ? [clamp(c[0] * m.tint[0]), clamp(c[1] * m.tint[1]), clamp(c[2] * m.tint[2])] : c;
    };
    const pos = (k) => xf([part.p[k * 3], part.p[k * 3 + 1], part.p[k * 3 + 2]], m);
    if (part.flat) {
      for (let f = 0; f < part.i.length; f += 3) {
        const ids = [part.i[f], part.i[f + 1], part.i[f + 2]].map((k) => {
          const q = pos(k);
          return this.vert(q[0], q[1], q[2], col(k));
        });
        this.tri(ids[0], ids[1], ids[2]);
      }
    } else {
      const base = this.vertCount;
      for (let k = 0; k < part.vertCount; k += 1) { const q = pos(k); this.vert(q[0], q[1], q[2], col(k)); }
      for (let f = 0; f < part.i.length; f += 1) this.i.push(part.i[f] + base);
    }
    return this;
  }

  /** Triangle-level brightness variation for the flat painterly meshes. */
  facetJitter(seed, amount) {
    const rng = mulberry32(seed);
    for (let f = 0; f < this.i.length; f += 3) {
      const factor = 1 + (rng() - 0.5) * 2 * amount;
      for (let q = 0; q < 3; q += 1) for (let a = 0; a < 3; a += 1) {
        const index = this.i[f + q] * 3 + a;
        this.c[index] = clamp(this.c[index] * factor);
      }
    }
    return this;
  }

  normals() {
    const n = new Float32Array(this.p.length);
    for (let f = 0; f < this.i.length; f += 3) {
      const [a, b, c] = [this.i[f] * 3, this.i[f + 1] * 3, this.i[f + 2] * 3];
      const ux = this.p[b] - this.p[a], uy = this.p[b + 1] - this.p[a + 1], uz = this.p[b + 2] - this.p[a + 2];
      const vx = this.p[c] - this.p[a], vy = this.p[c + 1] - this.p[a + 1], vz = this.p[c + 2] - this.p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
    }
    for (let k = 0; k < n.length; k += 3) {
      const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
      n[k] /= l; n[k + 1] /= l; n[k + 2] /= l;
    }
    return n;
  }

  bounds() {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < this.p.length; k += 3) for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], this.p[k + a]); max[a] = Math.max(max[a], this.p[k + a]);
    }
    return { min, max };
  }
}

/** Revolve a [radius, y] profile (bottom to top) around Y. Faces point outward for rising profiles. */
export function lathe(profile, seg, { color = "#ffffff", colorFn, flat = true, seed = 0, jitter = 0.12 } = {}) {
  const m = new Mesh({ flat });
  const rings = profile.map(([r, y], i) => {
    const ring = [];
    const pole = r < 1e-5;
    const count = pole ? 1 : seg;
    for (let s = 0; s < count; s += 1) {
      const a = (s / seg) * Math.PI * 2;
      const x = Math.cos(a) * r, z = -Math.sin(a) * r;
      const base = colorFn ? colorFn(r, y, i / (profile.length - 1), a) : C(color);
      ring.push(m.vert(x, y, z, jitter ? paint(C(base), x, y, z, seed, jitter) : C(base)));
    }
    return ring;
  });
  for (let i = 0; i < rings.length - 1; i += 1) {
    const lo = rings[i], hi = rings[i + 1];
    for (let s = 0; s < seg; s += 1) {
      const s1 = (s + 1) % seg;
      const a = lo.length === 1 ? lo[0] : lo[s], b = lo.length === 1 ? lo[0] : lo[s1];
      const c = hi.length === 1 ? hi[0] : hi[s], d = hi.length === 1 ? hi[0] : hi[s1];
      if (lo.length === 1 && hi.length === 1) continue;
      if (lo.length === 1) m.tri(a, d, c);
      else if (hi.length === 1) m.tri(a, b, c);
      else m.quad(a, b, d, c);
    }
  }
  return m;
}

export function cylinder(r0, r1, h, seg, bottom, top, opts = {}) {
  const cb = C(bottom), ct = C(top ?? bottom);
  const profile = opts.caps === false ? [[r0, 0], [r1, h]] : [[0, 0], [r0, 0], [r1, h], [0, h]];
  const profileFixed = opts.caps === false ? profile : [[0, 0], [r0, 0], [r1, h], [0, h]];
  return lathe(profileFixed, seg, { ...opts, colorFn: (r, y) => lerpC(cb, ct, h ? y / h : 0) });
}

export function box(w, h, d, bottom, top, opts = {}) {
  const m = new Mesh({ flat: true });
  const cb = C(bottom), ct = C(top ?? bottom);
  const xs = [-w / 2, w / 2], zs = [-d / 2, d / 2];
  const v = [];
  for (const y of [0, h]) for (const z of zs) for (const x of xs) v.push(m.vert(x, y, z, opts.jitter === 0 ? (y ? ct : cb) : paint(y ? ct : cb, x, y, z, opts.seed ?? 0, 0.1)));
  // index = y*4 + z*2 + x
  m.quad(v[4], v[6], v[7], v[5]); // +y
  m.quad(v[0], v[1], v[3], v[2]); // -y
  m.quad(v[2], v[3], v[7], v[6]); // +z
  m.quad(v[0], v[4], v[5], v[1]); // -z
  m.quad(v[1], v[5], v[7], v[3]); // +x
  m.quad(v[0], v[2], v[6], v[4]); // -x
  return m;
}

/** Subdivided, jittered icosphere. Use for foliage, rocks, clouds. */
export function blob(r, { detail = 1, jitter = 0.18, seed = 1, color = "#ffffff", colorFn, flat = false, squash = 1 } = {}) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((v) => { const l = Math.hypot(...v); return v.map((c) => c / l); });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d += 1) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (cache.has(key)) return cache.get(key);
      const v = verts[a].map((c, k) => (c + verts[b][k]) / 2);
      const l = Math.hypot(...v);
      verts.push(v.map((c) => c / l));
      cache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const m = new Mesh({ flat });
  const ids = verts.map((v, k) => {
    const k2 = 1 + (noise3(v[0] * 1.7 + seed, v[1] * 1.7, v[2] * 1.7, seed) - 0.5) * 2 * jitter;
    const x = v[0] * r * k2, y = v[1] * r * k2 * squash, z = v[2] * r * k2;
    const base = colorFn ? colorFn(x, y, z, v) : C(color);
    return m.vert(x, y, z, paint(C(base), x, y, z, seed, 0.16));
  });
  for (const [a, b, c] of faces) m.tri(ids[a], ids[b], ids[c]);
  return m;
}

export function crystal(r, h, sides, bottom, top, opts = {}) {
  const cb = C(bottom), ct = C(top);
  return lathe([[0, 0], [r * 0.92, 0], [r, h * 0.58], [r * 0.55, h * 0.8], [0, h]], sides, {
    flat: true, ...opts, colorFn: (rr, y) => lerpC(cb, ct, clamp(y / h)),
  });
}

/** Sweep a 2D profile along a 3D polyline. Returns a flat-shaded mesh. closed profiles join the last/first point. */
export function sweep(points, profile, { color = "#ffffff", colorFn, up = [0, 1, 0], closed = true, flat = true, scaleFn } = {}) {
  const m = new Mesh({ flat });
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rows = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const T = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let R = cross(T, up);
    if (Math.hypot(...R) < 1e-4) R = cross(T, [1, 0, 0]);
    R = norm(R);
    const U = norm(cross(R, T));
    const k = scaleFn ? scaleFn(i / (points.length - 1)) : 1;
    return profile.map(([u, v], j) => {
      const x = p[0] + (R[0] * u + U[0] * v) * k, y = p[1] + (R[1] * u + U[1] * v) * k, z = p[2] + (R[2] * u + U[2] * v) * k;
      const c = colorFn ? colorFn(i / Math.max(1, points.length - 1), j / Math.max(1, profile.length - 1), [x, y, z]) : C(color);
      return m.vert(x, y, z, c);
    });
  });
  const n = profile.length, last = closed ? n : n - 1;
  for (let i = 0; i < rows.length - 1; i += 1) for (let j = 0; j < last; j += 1) {
    const j1 = (j + 1) % n;
    m.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j1], rows[i][j1]);
  }
  return m;
}

/** Flat ribbon lying along a polyline (e.g. glowing path inlay, stream, waterfall). */
export function ribbon(points, width, colorFn, { up = [0, 1, 0], taper } = {}) {
  const m = new Mesh({ flat: false });
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rows = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const T = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const R = norm(cross(T, up));
    const t = i / (points.length - 1);
    const w = (width / 2) * (taper ? taper(t) : 1);
    return [m.vert(p[0] - R[0] * w, p[1] - R[1] * w, p[2] - R[2] * w, colorFn(t, 0)), m.vert(p[0] + R[0] * w, p[1] + R[1] * w, p[2] + R[2] * w, colorFn(t, 1))];
  });
  for (let i = 0; i < rows.length - 1; i += 1) {
    m.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
  }
  return m;
}

/** Disc/oval facing up (or Y-rotated via transform). */
export function disc(r, seg, c0, c1 = c0) {
  const m = new Mesh({ flat: false });
  const o = m.vert(0, 0, 0, C(c0));
  const ring = [];
  for (let s = 0; s < seg; s += 1) {
    const a = (s / seg) * Math.PI * 2;
    ring.push(m.vert(Math.cos(a) * r, 0, -Math.sin(a) * r, C(c1)));
  }
  for (let s = 0; s < seg; s += 1) m.tri(o, ring[(s + 1) % seg], ring[s]);
  return m;
}
