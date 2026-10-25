// The four lesson islands. Coordinates are island-local: +Y up, entrance toward +Z, journey runs toward -Z.
import { Mesh, C, lerpC, shade, ribbon, paint } from "./meshkit.mjs";
import { islandBody, hangers, scatter } from "./body.mjs";
import { stepStone, roundTree, pine, rock, flower, lanternPost, gate, column, hexColumn, glowOrb, mulberry32, crystal, disc, box, blob, cylinder, lathe, sweep } from "./props.mjs";
import { spinTrack, bobTrack, quatY } from "./glb.mjs";
import { fbm2, noise2, smoothstep, mix, clamp } from "../../src/world/noise.js";

const anchor = (name, p, extras) => ({ name, position: p, parent: "Anchors", extras: { anchor: true, ...extras } });
const glowPoint = (name, p, size) => ({ name, position: p, scale: size, parent: "Glows", extras: { glow: true } });
const baseNodes = () => [{ name: "Anchors" }, { name: "Glows" }];
const distToSeg = (px, pz, a, b) => {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = clamp(((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz || 1));
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
};
const distToPoly = (px, pz, pts) => {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i += 1) d = Math.min(d, distToSeg(px, pz, pts[i], pts[i + 1]));
  return d;
};
const floatingChunk = (rng, color, cap, r = 1.2) => {
  const m = new Mesh();
  m.append(rock(r, color, Math.floor(rng() * 90), 0.8));
  m.append(cylinder(r * 0.78, r * 0.7, 0.28, 8, cap, cap, { jitter: 0.1 }), { t: [0, r * 0.45, 0] });
  m.append(cylinder(0.02, r * 0.5, r * 1.3, 6, color, color, { caps: false }), { t: [0, -r * 1.7, 0], s: 1 });
  return m;
};

/* ------------------------------------------------------------------ Verdant Isle: List.map */
export function buildVerdant() {
  const seed = 11, rng = mulberry32(seed * 97), R = 17;
  const laneZ = [9, 4.5, 0, -4.5, -9], laneX = 5.4;
  const lane = (x, z) => smoothstep(10.8, 7.2, Math.abs(x)) * smoothstep(14.5, 11.5, z) * smoothstep(-14.5, -11.8, z);
  const topFn = (x, z) => {
    const r = Math.hypot(x, z) / R;
    let h = 0.75 * (1 - r * r) + 1.5 * (fbm2(x * 0.075 + 3, z * 0.075, seed, 3) - 0.5) + 0.3 * (noise2(x * 0.22, z * 0.22, seed + 4) - 0.5);
    h = mix(h, 0.2, lane(x, z) * 0.93);
    const ch = Math.exp(-(x * x) / 1.5) * smoothstep(-13.5, -11, z) * smoothstep(13.5, 11, z);
    return h - 0.5 * ch;
  };
  const stonePts = [...laneZ.map((z) => [-laneX, z]), ...laneZ.map((z) => [laneX, z])];
  const topColor = (x, y, z) => {
    const g = fbm2(x * 0.11, z * 0.11, seed + 2, 3);
    let c = lerpC(C("#6bd16c"), C("#38a874"), g);
    c = lerpC(c, C("#b4e87c"), smoothstep(0.5, 1.4, y) * 0.55);
    c = lerpC(c, C("#a6e27e"), lane(x, z) * 0.5);
    const near = Math.min(...stonePts.map((p) => Math.hypot(p[0] - x, p[1] - z)));
    c = lerpC(c, C("#e3d6bc"), smoothstep(2.4, 1.3, near) * 0.8);
    c = lerpC(c, C("#c9b79a"), Math.exp(-(x * x) / 2.2) * smoothstep(-13, -11, z) * smoothstep(13, 11, z) * 0.7);
    return c;
  };
  const body = islandBody({ R, depth: 13, seed, topFn, topColor, lipColor: "#7be06a", soilColor: "#94606a", rockTop: "#b08494", rockBottom: "#4d3b78" });
  const H = body.H;

  const props = new Mesh();
  const glow = new Mesh();
  const nodes = baseNodes();
  const parts = [];

  // Stepping stones + rune glows: input lane (warm) on the left, output lane (aqua) on the right.
  laneZ.forEach((z, i) => {
    for (const [side, rune, name] of [[-1, ["#fff1b8", "#ffc864"], "lane_in"], [1, ["#d6fff2", "#5fe0c8"], "lane_out"]]) {
      const x = side * laneX, y = H(x, z);
      props.append(stepStone(1.35, "#c4b6cb", "#eee4f2"), { t: [x, y - 0.04, z], ry: rng() * 6 });
      glow.append(disc(0.8, 14, rune[0], rune[1]), { t: [x, y + 0.53, z] });
      nodes.push(anchor(`${name}_${i}`, [x, y + 0.5, z]));
    }
    // Arch bridge over the light channel, one per row.
    const y0 = H(0, z) + 0.3;
    const arc = Array.from({ length: 9 }, (_, k) => { const t = (k / 8) * Math.PI; return [-Math.cos(t) * 2.1, y0 + Math.sin(t) * 1.0, z]; });
    props.append(sweep(arc, [[-0.62, -0.14], [0.62, -0.14], [0.62, 0.16], [-0.62, 0.16]], { colorFn: (t) => lerpC(C("#cdbfd6"), C("#efe6f4"), Math.sin(t * Math.PI)) }));
    nodes.push(anchor(`work_${i}`, [0, y0 + 1.4, z]));
  });

  // Light channel the function flows through.
  const chPts = Array.from({ length: 14 }, (_, k) => { const z = 12.8 - (k / 13) * 25.6; return [0, H(0, z) + 0.22, z]; });
  glow.append(ribbon(chPts, 1.5, (t, side) => lerpC(C("#b9fff0"), C("#46d4c6"), Math.abs(side - 0.5) * 2)));

  // Gate and lanterns.
  const gz = 13.4;
  props.append(gate({ w: 3.4, h: 3.7, stone: "#cdbfd6", accent: "#f0e8f6" }), { t: [0, H(0, gz) - 0.05, gz] });
  glow.append(blob(0.4, { detail: 1, jitter: 0.04, color: "#fff3b0", flat: false }), { t: [0, H(0, gz) + 3.7 + 3.4 * 0.78 + 0.2, gz] });
  nodes.push(anchor("landmark_gate", [0, H(0, gz) + 1.6, gz + 1.5]));
  for (const [x, z] of [[-6.9, 12.3], [6.9, 12.3], [-6.9, -11.4], [6.9, -11.4]]) {
    const { wood, orb } = lanternPost(2.5);
    props.append(wood, { t: [x, H(x, z) - 0.05, z] });
    glow.append(orb, { t: [x, H(x, z) + 2.65, z] });
    nodes.push(glowPoint(`glow_gold_${nodes.length}`, [x, H(x, z) + 2.65, z], 2.6));
  }

  // The great tree at the far end.
  const tz = -12.6, ty = H(0, tz);
  props.append(lathe([[0, 0], [1.5, 0], [1.1, 1.6], [0.8, 4], [1.0, 6.4], [1.5, 7.4], [0, 7.4]], 8, { colorFn: (r, y) => lerpC(C("#8c6272"), C("#b88a92"), y / 7.4), jitter: 0.14, seed: 4 }), { t: [0, ty - 0.1, tz] });
  const canopy = ["#4fb76a", "#6fd07a", "#92e07e", "#f4a9c8"];
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * 6.28, rr = k === 0 ? 0 : 2.8;
    props.append(blob(k === 0 ? 4.2 : 3 + rng() * 0.8, { detail: 1, jitter: 0.2, seed: 40 + k, color: canopy[k % 4], flat: true, squash: 0.82 }), { t: [Math.cos(a) * rr, ty + 8.8 + (k === 0 ? 1.2 : rng() * 1.6), tz + Math.sin(a) * rr] });
  }
  for (let k = 0; k < 9; k += 1) {
    const a = rng() * 6.28, rr = 2 + rng() * 3.2;
    glow.append(blob(0.26, { detail: 0, color: "#ffe9a0", flat: true }), { t: [Math.cos(a) * rr, ty + 7.6 + rng() * 3.2, tz + Math.sin(a) * rr + 1] });
  }
  nodes.push(anchor("landmark_tree", [0, ty + 2.4, tz + 3.4]));
  nodes.push(glowPoint("glow_pink_tree", [0, ty + 9.6, tz], 9));

  // Trees, bushes, rocks, flowers outside the lanes.
  const avoid = (x, z) => Math.abs(x) < 8.4 && z < 15 && z > -15.5;
  const treePal = [["#4fb86a", "#72d078", "#9be37e"], ["#3ea46f", "#5fc678", "#f1a6c6"], ["#56bd6e", "#8adc7e", "#ffd88a"]];
  const treeSpots = scatter(14, rng, { minR: 8, maxR: 15.2, minDist: 3.4, avoid });
  treeSpots.forEach(([x, z], i) => {
    const t = i % 5 === 4
      ? pine(4.2 + rng() * 2, 1.6, ["#3b9a78", "#2c7a76"], null)
      : roundTree(rng, 2.2 + rng() * 1.7, 1.6 + rng() * 1.0, treePal[i % 3], i * 7);
    props.append(t, { t: [x, H(x, z) - 0.1, z], ry: rng() * 6 });
  });
  scatter(11, rng, { minR: 6, maxR: 15, minDist: 2, avoid: (x, z) => Math.abs(x) < 7.6 || avoid(x, z) && false, taken: treeSpots })
    .forEach(([x, z], i) => props.append(blob(0.9 + rng() * 0.5, { detail: 1, jitter: 0.22, seed: 80 + i, color: i % 3 ? "#58c06e" : "#7fd57b", flat: true, squash: 0.7 }), { t: [x, H(x, z) + 0.15, z] }));
  scatter(7, rng, { minR: 6, maxR: 15.5, minDist: 2.2, avoid }).forEach(([x, z], i) => props.append(rock(0.55 + rng() * 0.6, i % 2 ? "#a99ab4" : "#8f84a2", 120 + i), { t: [x, H(x, z) + 0.05, z], ry: rng() * 6 }));
  const petals = ["#ffadcf", "#fff0a8", "#ffffff", "#ffc29a"];
  for (let c = 0; c < 9; c += 1) {
    const cx = (rng() < 0.5 ? -1 : 1) * (7.3 + rng() * 2.3), cz = -11 + rng() * 22;
    for (let k = 0; k < 4; k += 1) {
      const x = cx + (rng() - 0.5) * 1.6, z = cz + (rng() - 0.5) * 1.6;
      props.append(flower(petals[(c + k) % 4]), { t: [x, H(x, z) + 0.2, z] });
    }
  }
  props.append(hangers(body, rng, { count: 11, colorTop: "#7a5a7c", colorBottom: "#43d6b6", length: [3, 7], radius: 0.1 }));

  // Floating chunks (animated).
  const floats = [["float_a", [-20.5, -2.6, 3]], ["float_b", [18.5, -5, -5.5]], ["float_c", [-13.5, -9.5, -13]]];
  for (const [name, pos] of floats) {
    nodes.push({ name, position: pos });
    parts.push({ name: `${name}_mesh`, nodeName: `${name}_body`, parent: name, mesh: floatingChunk(rng, "#8e7aa4", "#6fd070", 1.1 + rng() * 0.5), material: "paint" });
  }
  const anim = { name: "verdant_ambient", tracks: floats.map(([name, pos], i) => bobTrack(name, pos, 0.55, 7 + i * 1.7, i * 0.33)) };

  nodes.push(anchor("landmark_pin", [0, H(0, 0) + 9.5, 1]));
  nodes.push(glowPoint("glow_aqua_channel", [0, H(0, 0) + 1.2, 0], 6));
  parts.unshift(
    { name: "terrain", mesh: body.mesh, material: "paint" },
    { name: "props", mesh: props, material: "paint" },
    { name: "glows", mesh: glow, material: "glow" },
  );
  return { id: "map", fileBase: "verdant-isle", spec: { name: "VerdantIsle", parts, nodes, animations: [anim] }, body };
}

/* ------------------------------------------------------------------ Ember Isle: List.foldl */
export function buildEmber() {
  const seed = 23, rng = mulberry32(seed * 131), R = 17;
  const spiral = (s) => { const r = 13.3 - 6.4 * s, a = -1.75 + s * 4.7; return [Math.cos(a) * r, -Math.sin(a) * r]; };
  const spiralPts = Array.from({ length: 48 }, (_, i) => spiral(i / 47));
  const topFn = (x, z) => {
    const r = Math.hypot(x, z);
    const mound = 5.6 * smoothstep(15.5, 1.8, r) ** 1.3;
    const n = 0.9 * (fbm2(x * 0.09 + 5, z * 0.09, seed, 3) - 0.5) + 0.35 * (noise2(x * 0.3, z * 0.3, seed + 3) - 0.5);
    return mound + n * smoothstep(0, 5, r) - 0.9 * smoothstep(3.6, 2.0, r);
  };
  const topColor = (x, y, z) => {
    const r = Math.hypot(x, z);
    const g = fbm2(x * 0.12, z * 0.12, seed + 1, 3);
    let c = lerpC(C("#55404f"), C("#7b5560"), g);
    c = lerpC(c, C("#3f2f45"), smoothstep(0.4, 0.8, noise2(x * 0.4, z * 0.4, seed + 9)) * 0.5);
    c = lerpC(c, C("#e4793a"), smoothstep(5.2, 3.2, r) * 0.65);
    c = lerpC(c, C("#d9a266"), smoothstep(2.6, 1.2, distToPoly(x, z, spiralPts)) * 0.75);
    return c;
  };
  const body = islandBody({ R, depth: 13.5, seed, topFn, topColor, lipColor: "#f2a64c", soilColor: "#8d5560", rockTop: "#a9707a", rockBottom: "#4b3159" });
  const H = body.H;
  const props = new Mesh(), glow = new Mesh(), nodes = baseNodes(), parts = [];
  const flameNodes = [];

  // Forge at the centre: the accumulator lives above it.
  const fy = H(0, 0);
  props.append(cylinder(4.6, 4.2, 0.8, 12, "#6a5062", "#8a6a78", { seed: 2 }), { t: [0, fy - 0.2, 0] });
  const bowl = [[0, 0], [1.7, 0], [2.7, 0.8], [3.1, 2.0], [3.0, 2.35], [2.7, 2.35], [2.55, 2.0], [2.1, 1.3], [0, 1.1]];
  props.append(lathe(bowl, 12, { colorFn: (r, y) => (y > 1.0 && r < 2.6 && y < 2.2 ? lerpC(C("#c8502e"), C("#f29a3c"), r / 2.6) : lerpC(C("#3e3341"), C("#6a5266"), Math.min(1, y / 2.4))), jitter: 0.1 }), { t: [0, fy + 0.55, 0] });
  glow.append(disc(2.3, 20, "#fff0a8", "#ff8c3a"), { t: [0, fy + 2.15, 0] });
  nodes.push(anchor("landmark_forge", [0, fy + 4.2, 0]));
  nodes.push(anchor("forge_mouth", [0, fy + 2.4, 0]));
  nodes.push(glowPoint("glow_ember_forge", [0, fy + 2.6, 0], 11));

  // Spiral stairway: seven stepping stones, torches on alternate ones.
  const stones = Array.from({ length: 7 }, (_, i) => spiral(i / 6));
  stones.forEach(([x, z], i) => {
    const y = H(x, z);
    props.append(stepStone(1.35, "#8e7480", "#cdaea0"), { t: [x, y - 0.04, z], ry: rng() * 6 });
    glow.append(disc(0.8, 14, "#ffe2a0", "#ff8a4a"), { t: [x, y + 0.53, z] });
    nodes.push(anchor(`spiral_${i}`, [x, y + 0.5, z]));
    if (i % 2 === 1) {
      const a = Math.atan2(-z, x), tx = x + Math.cos(a) * 2.1, tz = z - Math.sin(a) * 2.1, ty = H(tx, tz);
      props.append(cylinder(0.14, 0.1, 2.0, 6, "#4a3a4c", "#6b5668", { caps: false }), { t: [tx, ty - 0.05, tz] });
      const fname = `flame_${flameNodes.length}`;
      flameNodes.push([fname, [tx, ty + 2.0, tz]]);
      nodes.push({ name: fname, position: [tx, ty + 2.0, tz] });
      parts.push({ name: `${fname}_mesh`, nodeName: `${fname}_body`, parent: fname, mesh: cylinder(0.32, 0.01, 1.1, 6, "#ff9a3c", "#fff0a0", { caps: false, jitter: 0 }), material: "glow" });
      nodes.push(glowPoint(`glow_ember_${fname}`, [tx, ty + 2.5, tz], 3.2));
    }
  });
  const gA = -1.75, gr = 15.6;
  const gx = Math.cos(gA) * gr, gz = -Math.sin(gA) * gr;
  props.append(gate({ w: 3.0, h: 3.6, stone: "#5a4558", accent: "#8a6a74", archColor: "#6a5262" }), { t: [gx, H(gx, gz) - 0.2, gz], ry: -0.1 });
  nodes.push(anchor("landmark_gate", [gx, H(gx, gz) + 1.6, gz + 1.4]));

  // Basalt columns, ember trees, lava cracks.
  const colSpots = [[-13.5, -4], [-14.4, -2], [-12.6, -2.6], [13.8, -6], [12.9, -8.4], [14.6, -4.4], [-4, -14.6], [-6.5, -13.8], [3.5, -14.8]];
  colSpots.forEach(([x, z], i) => props.append(hexColumn(0.85 + rng() * 0.4, 2.2 + rng() * 3.6, "#352a3c", i % 2 ? "#6a5668" : "#5a485c", i), { t: [x, H(x, z) - 0.3, z], ry: rng() * 6 }));
  const emberPal = ["#e8742f", "#f4a04a", "#cc4f38"];
  scatter(7, rng, { minR: 11, maxR: 15.4, minDist: 3.6, avoid: (x, z) => distToPoly(x, z, spiralPts) < 3.4 || colSpots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 2.8) })
    .forEach(([x, z], i) => props.append(roundTree(rng, 2 + rng() * 1.5, 1.4 + rng() * 0.8, emberPal, 300 + i), { t: [x, H(x, z) - 0.1, z], ry: rng() * 6 }));
  scatter(9, rng, { minR: 5, maxR: 15, minDist: 2, avoid: (x, z) => distToPoly(x, z, spiralPts) < 2.4 }).forEach(([x, z], i) => props.append(rock(0.5 + rng() * 0.7, i % 2 ? "#4a3a50" : "#6a5468", 200 + i), { t: [x, H(x, z) + 0.05, z], ry: rng() * 6 }));
  for (let c = 0; c < 6; c += 1) {
    const a0 = (c / 6) * 6.28 + 0.4;
    const pts = Array.from({ length: 11 }, (_, k) => {
      const r = 3.9 + k * 0.95, a = a0 + Math.sin(k * 1.3 + c) * 0.22;
      const x = Math.cos(a) * r, z = -Math.sin(a) * r;
      return [x, H(x, z) + 0.08, z];
    });
    glow.append(ribbon(pts, 0.34, (t, side) => lerpC(C("#ffd27a"), C("#d9402a"), clamp(t * 1.1 + Math.abs(side - 0.5)))));
  }
  props.append(hangers(body, rng, { count: 11, colorTop: "#7b5568", colorBottom: "#f2994a", length: [3, 7], radius: 0.1 }));

  const floats = [["float_a", [-20, -3, 4]], ["float_b", [19, -4.5, -3]], ["float_c", [8, -11, 15]]];
  for (const [name, pos] of floats) {
    nodes.push({ name, position: pos });
    parts.push({ name: `${name}_mesh`, nodeName: `${name}_body`, parent: name, mesh: floatingChunk(rng, "#8a6470", "#f0a04a", 1 + rng() * 0.5), material: "paint" });
  }
  const flick = flameNodes.map(([n, pos], i) => ({
    node: n, path: "scale", times: [0, 0.35, 0.7, 1.05, 1.4].map((t) => t * (1 + i * 0.13)),
    values: [[1, 1, 1], [0.86, 1.2, 0.86], [1.08, 0.9, 1.08], [0.92, 1.16, 0.92], [1, 1, 1]],
  }));
  const anim = { name: "ember_ambient", tracks: [...flick, ...floats.map(([name, pos], i) => bobTrack(name, pos, 0.5, 6 + i * 1.9, i * 0.4))] };
  // Align track lengths so the loop is clean per node; the mixer handles differing durations.

  nodes.push(anchor("landmark_pin", [0, fy + 10.5, 0]));
  parts.unshift({ name: "terrain", mesh: body.mesh, material: "paint" }, { name: "props", mesh: props, material: "paint" }, { name: "glows", mesh: glow, material: "glow" });
  return { id: "fold", fileBase: "ember-isle", spec: { name: "EmberIsle", parts, nodes, animations: [anim] }, body };
}

/* ------------------------------------------------------------------ Frost Isle: let reduction */
export function buildFrost() {
  const seed = 37, rng = mulberry32(seed * 71), R = 16.5;
  const px = [0, -3.6, 3.4, -3.2, 0.4], pz = [10.5, 5.2, -0.2, -5.6, -10.8], lv = [0, 1.5, 3, 4.5, 6];
  const zb = pz.slice(1).map((z, k) => (pz[k] + z) / 2);
  const topFn = (x, z) => {
    const r = Math.hypot(x, z) / R;
    let h = 0.5 * (1 - r * r) + 0.55 * (fbm2(x * 0.08 + 2, z * 0.08, seed, 3) - 0.5);
    for (const b of zb) h += 1.5 * smoothstep(b + 0.9, b - 0.9, z);
    return h;
  };
  const stonePts = px.map((x, i) => [x, pz[i]]);
  const topColor = (x, y, z) => {
    const slope = Math.abs(topFn(x, z + 0.5) - topFn(x, z - 0.5));
    let c = lerpC(C("#f4faff"), C("#cfe3fa"), fbm2(x * 0.1, z * 0.1, seed, 3));
    c = lerpC(c, C("#86b0e6"), smoothstep(0.35, 1.1, slope) * 0.75);
    const near = Math.min(...stonePts.map((p) => Math.hypot(p[0] - x, p[1] - z)));
    c = lerpC(c, C("#a9d8f4"), smoothstep(2.8, 1.6, near) * 0.7);
    return c;
  };
  const body = islandBody({ R, depth: 15, seed, topFn, topColor, lipColor: "#ffffff", soilColor: "#8aa2d4", rockTop: "#8fa3d6", rockBottom: "#4a4f92", lobe: 0.09 });
  const H = body.H;
  const props = new Mesh(), glow = new Mesh(), nodes = baseNodes(), parts = [];

  px.forEach((x, i) => {
    const z = pz[i], y = H(x, z);
    props.append(stepStone(1.45, "#b9d5ee", "#f2faff"), { t: [x, y - 0.04, z], ry: rng() * 6 });
    glow.append(disc(0.85, 14, "#ffffff", "#7fd0ff"), { t: [x, y + 0.53, z] });
    nodes.push(anchor(`path_${i}`, [x, y + 0.5, z]));
  });
  const gz = 13.6;
  props.append(gate({ w: 3.2, h: 3.6, stone: "#bcd4ee", accent: "#f4fbff", archColor: "#a9c8ea" }), { t: [0, H(0, gz) - 0.05, gz] });
  nodes.push(anchor("landmark_gate", [0, H(0, gz) + 1.6, gz + 1.5]));

  // Summit spire (glowing ice) + cluster.
  const sz = -13.2, sy = H(0, sz);
  const spire = new Mesh();
  spire.append(crystal(2.0, 9.5, 6, "#5aa3ee", "#f2fcff"), { t: [0, sy - 0.4, sz] });
  [[-2.4, 0.3, 4.2, 0.2], [2.6, -0.4, 5, -0.22], [-1.0, 2.4, 3.2, 0.12], [1.6, 2.2, 3.8, -0.1], [0.4, -2.3, 2.8, 0.3]].forEach(([dx, dz, h, tilt], i) =>
    spire.append(crystal(0.75 + (i % 3) * 0.2, h, 6, "#63aef0", "#e6f7ff"), { t: [dx, sy - 0.3, sz + dz], rz: tilt, rx: tilt * 0.6 }));
  spire.facetJitter(5, 0.14);
  glow.append(spire);
  nodes.push(anchor("landmark_summit", [0, sy + 11.8, sz + 0.5]));
  nodes.push(glowPoint("glow_ice_summit", [0, sy + 7.5, sz], 12));
  // Aurora ring (additive, animated).
  nodes.push({ name: "aurora", position: [0, sy + 8.5, sz] });
  const ring = lathe([[7.2, 0], [7.4, 2.4]], 36, { flat: false, colorFn: (r, y) => (y < 1 ? C("#000000") : C("#6bf0c8")), jitter: 0 });
  const ring2 = lathe([[6.2, 0.9], [6.35, 3.6]], 36, { flat: false, colorFn: (r, y) => (y < 1.4 ? C("#000000") : C("#9a7cff")), jitter: 0 });
  parts.push({ name: "aurora_mesh", nodeName: "aurora_body", parent: "aurora", mesh: new Mesh().append(ring).append(ring2), material: "glow_add" });

  // Frozen waterfall hanging off the right edge.
  const wx = 14.2, wzp = -2.5, wy = H(wx - 1.5, wzp);
  const wf = [[wx - 1, wy + 0.1, wzp], [wx + 0.2, wy - 0.8, wzp], [wx + 0.9, wy - 3, wzp], [wx + 1.1, -9, wzp], [wx + 1.1, -22, wzp]];
  glow.append(ribbon(wf, 1.9, (t, side) => lerpC(C("#ffffff"), C("#8fc4f0"), Math.min(1, t * 1.3 + Math.abs(side - 0.5))), { up: [0, 0, 1], taper: (t) => 1 - t * 0.5 }));
  nodes.push(glowPoint("glow_ice_fall", [wx + 1.1, -9, wzp], 6));

  // Snow pines, mounds, crystals.
  const avoid = (x, z) => px.some((p, i) => Math.hypot(p - x, pz[i] - z) < 3.4) || (Math.abs(x) < 2.6 && z < -9.5);
  scatter(13, rng, { minR: 6, maxR: 14.5, minDist: 3, avoid }).forEach(([x, z], i) => props.append(pine(3.6 + rng() * 2.6, 1.3 + rng() * 0.4, ["#3d93a2", "#2b6c8e"], "#f4fbff"), { t: [x, H(x, z) - 0.05, z], ry: rng() * 6 }));
  scatter(10, rng, { minR: 4, maxR: 15, minDist: 2.6, avoid }).forEach(([x, z], i) => props.append(blob(1.1 + rng() * 1.1, { detail: 1, jitter: 0.2, seed: 60 + i, color: "#f2f9ff", flat: false, squash: 0.45 }), { t: [x, H(x, z) - 0.1, z] }));
  const crystals = new Mesh();
  scatter(6, rng, { minR: 5, maxR: 14, minDist: 4.2, avoid }).forEach(([x, z], i) => {
    for (let k = 0; k < 3; k += 1) crystals.append(crystal(0.28 + rng() * 0.22, 1.4 + rng() * 1.6, 6, "#58a0ec", "#e6f7ff"), { t: [x + (rng() - 0.5) * 1.1, H(x, z) - 0.1, z + (rng() - 0.5) * 1.1], rz: (rng() - 0.5) * 0.5, rx: (rng() - 0.5) * 0.5 });
    nodes.push(glowPoint(`glow_ice_${i}`, [x, H(x, z) + 1.3, z], 3.4));
  });
  crystals.facetJitter(11, 0.14);
  glow.append(crystals);
  props.append(hangers(body, rng, { count: 15, colorTop: "#9fb6e2", colorBottom: "#e8fbff", length: [3, 8.5], radius: 0.13 }));

  const floats = [["float_a", [-19, -2, 5]], ["float_b", [17.5, -7, -9]], ["float_c", [-12, -10.5, -14]]];
  for (const [name, pos] of floats) {
    nodes.push({ name, position: pos });
    parts.push({ name: `${name}_mesh`, nodeName: `${name}_body`, parent: name, mesh: floatingChunk(rng, "#8294c8", "#f4fbff", 1.1 + rng() * 0.5), material: "paint" });
  }
  const anim = { name: "frost_ambient", tracks: [spinTrack("aurora", 36, 8), ...floats.map(([name, pos], i) => bobTrack(name, pos, 0.5, 7 + i * 1.4, i * 0.37))] };
  nodes.push(anchor("landmark_pin", [0, H(0, -2) + 10.5, -2]));
  parts.unshift({ name: "terrain", mesh: body.mesh, material: "paint" }, { name: "props", mesh: props, material: "paint" }, { name: "glows", mesh: glow, material: "glow" });
  return { id: "let", fileBase: "frost-isle", spec: { name: "FrostIsle", parts, nodes, animations: [anim] }, body };
}

/* ------------------------------------------------------------------ Cloud Library: function calls */
export function buildLibrary() {
  const seed = 53, rng = mulberry32(seed * 53), R = 18;
  const topFn = (x, z) => 0.45 * (1 - (Math.hypot(x, z) / R) ** 2) + 0.12 * (noise2(x * 0.2, z * 0.2, seed) - 0.5);
  const topColor = (x, y, z) => {
    const r = Math.hypot(x, z);
    let c = lerpC(C("#fbf1e4"), C("#f1dfe9"), fbm2(x * 0.1, z * 0.1, seed, 2));
    c = lerpC(c, C("#e8c476"), smoothstep(0.5, 0, Math.abs(r - 9.2)) * 0.8);
    c = lerpC(c, C("#fff8ec"), smoothstep(3.6, 2.2, Math.abs(x)) * smoothstep(-12, -9, z) * smoothstep(13, 11, z) * 0.7);
    return c;
  };
  const body = islandBody({ R, depth: 11, seed, topFn, topColor, lipColor: "#fff6fa", soilColor: "#f6e6ee", rockTop: "#eadcf0", rockBottom: "#b9a8e0", puffy: true, lobe: 0.06 });
  const H = body.H;
  const props = new Mesh(), glow = new Mesh(), clouds = new Mesh(), nodes = baseNodes(), parts = [];
  const top = H(0, 0);

  // Cloud puffs hugging the rim and underside.
  const puffPal = ["#fff6fb", "#f7e4f1", "#efe0f6", "#fff0e4"];
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * 6.28 + rng() * 0.3, r = 14.8 + rng() * 2.6;
    clouds.append(blob(3.2 + rng() * 2.4, { detail: 1, jitter: 0.28, seed: 500 + k, color: puffPal[k % 4], flat: false, squash: 0.62 }), { t: [Math.cos(a) * r, -1.6 - rng() * 2.4, -Math.sin(a) * r] });
  }
  for (let k = 0; k < 7; k += 1) {
    const a = rng() * 6.28, r = rng() * 7;
    clouds.append(blob(3 + rng() * 1.8, { detail: 1, jitter: 0.3, seed: 540 + k, color: puffPal[k % 4], flat: false, squash: 0.65 }), { t: [Math.cos(a) * r, -6.5 - rng() * 4.5, -Math.sin(a) * r] });
  }

  // Nave floor, colonnades, entablature.
  const floor = new Mesh();
  floor.append(box(5.8, 0.16, 23.5, "#f8f0e2", "#fffaf0", { jitter: 0 }), { t: [0, top - 0.02, -0.6] });
  for (const sx of [-1, 1]) floor.append(box(0.22, 0.2, 23.5, "#e6bf70", "#f4d890", { jitter: 0 }), { t: [sx * 2.8, top - 0.02, -0.6] });
  props.append(floor);
  const colZ = [8, 3, -2, -7];
  for (const sx of [-1, 1]) {
    for (const z of colZ) props.append(column(5.2, 0.7), { t: [sx * 4.3, H(sx * 4.3, z) - 0.05, z] });
    props.append(box(1.5, 0.7, 18.4, "#f1e5d6", "#fff6ea", { jitter: 0 }), { t: [sx * 4.3, top + 5.8, 0.5] });
    props.append(box(1.9, 0.18, 18.8, "#e6bf70", "#f4d890", { jitter: 0 }), { t: [sx * 4.3, top + 6.5, 0.5] });
  }
  // Page stones along the nave.
  const stoneZ = [9, 3, -3, -8.6];
  stoneZ.forEach((z, i) => {
    props.append(box(2.9, 0.26, 2.3, "#f0e6d4", "#fffaf0", { jitter: 0.04 }), { t: [0, H(0, z) + 0.04, z], ry: (i % 2 ? 1 : -1) * 0.1 });
    glow.append(disc(0.78, 14, "#fff4c8", "#f0b850"), { t: [0, H(0, z) + 0.32, z] });
    nodes.push(anchor(`path_${i}`, [0, H(0, z) + 0.3, z]));
  });
  // Lectern with open book.
  const lz = -11.4;
  props.append(lathe([[0, 0], [1.2, 0], [0.9, 0.5], [0.55, 1.9], [0.8, 2.1], [0, 2.1]], 8, { colorFn: (r, y) => lerpC(C("#a97a68"), C("#c99a84"), y / 2.1), jitter: 0.1 }), { t: [0, top, lz] });
  props.append(box(2.1, 0.14, 1.7, "#a97a68", "#c99a84", { jitter: 0 }), { t: [0, top + 2.1, lz], rx: -0.35 });
  for (const sx of [-1, 1]) props.append(box(1.0, 0.09, 1.5, "#fffaf0", "#fff4e0", { jitter: 0 }), { t: [sx * 0.52, top + 2.3, lz - 0.02], rx: -0.35, rz: sx * -0.14 });
  glow.append(disc(0.9, 14, "#fff7d0", "#ffcf6a"), { t: [0, top + 2.5, lz + 0.1], rx: -0.35 });
  nodes.push(anchor("landmark_lectern", [0, top + 3.7, lz]));

  // Back rotunda: drum, dome, finial.
  const dz = -14.2;
  props.append(cylinder(5.3, 5.2, 5.2, 14, "#f3e6d6", "#fff3e4", { seed: 6 }), { t: [0, top - 0.1, dz] });
  props.append(cylinder(5.6, 5.5, 0.35, 14, "#e6bf70", "#f4d890", { jitter: 0 }), { t: [0, top + 5.1, dz] });
  const domeProf = Array.from({ length: 8 }, (_, i) => { const t = (i / 7) * (Math.PI / 2); return [Math.cos(t) * 5.1, 5.4 + Math.sin(t) * 4.2]; });
  props.append(lathe(domeProf, 14, { colorFn: (r, y) => lerpC(C("#f6c9d2"), C("#fff0f4"), (y - 5.4) / 4.2), jitter: 0.1 }), { t: [0, top, dz] });
  props.append(cylinder(0.22, 0.02, 1.6, 6, "#e6bf70", "#f8e0a0", { caps: false, jitter: 0 }), { t: [0, top + 9.5, dz] });
  glow.append(blob(0.42, { detail: 1, jitter: 0.03, color: "#fff5c0", flat: false }), { t: [0, top + 11.3, dz] });
  for (let k = -2; k <= 2; k += 1) {
    const th = k * 0.42;
    glow.append(box(0.9, 2.2, 0.14, "#ffd77a", "#fff0b0", { jitter: 0 }), { t: [Math.sin(th) * 5.28, top + 1.2, dz + Math.cos(th) * 5.28], ry: th });
  }
  nodes.push(anchor("landmark_dome", [0, top + 11.6, dz]));
  nodes.push(glowPoint("glow_gold_dome", [0, top + 11.3, dz], 7));

  // Bookshelves with rows of spines.
  const spine = ["#d9605e", "#e8a24a", "#5fa8c8", "#7bbf86", "#a98ad6", "#f0cf6a", "#e48ab0"];
  for (const sx of [-1, 1]) {
    props.append(box(1.5, 4.6, 15, "#9a6f6a", "#b88a82", { jitter: 0.05 }), { t: [sx * 9.2, top - 0.05, 1.5] });
    for (let row = 0; row < 3; row += 1) for (let b = 0; b < 12; b += 1) {
      const h = 0.9 + rng() * 0.35;
      props.append(box(0.38, h, 0.28, spine[(b + row * 3 + (sx > 0 ? 2 : 0)) % 7], spine[(b + row * 3 + (sx > 0 ? 2 : 0)) % 7], { jitter: 0 }), { t: [sx * (9.2 - 0.8), top + 0.4 + row * 1.4, -4.8 + b * 1.04 + (rng() - 0.5) * 0.1], s: 1 });
    }
  }
  // Gate.
  const gz = 14.3;
  props.append(gate({ w: 3.6, h: 4.2, stone: "#f1e5d6", accent: "#fff6ea", archColor: "#e6bf70" }), { t: [0, H(0, gz) - 0.05, gz] });
  nodes.push(anchor("landmark_gate", [0, top + 1.6, gz + 1.5]));
  glow.append(blob(0.4, { detail: 1, jitter: 0.03, color: "#fff3b0", flat: false }), { t: [0, top + 4.2 + 3.6 * 0.78 + 0.35, gz] });

  // Floating book ring (animated) and drifting single books.
  nodes.push({ name: "book_ring", position: [0, top + 13.4, dz] });
  const ringBooks = new Mesh();
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * 6.28;
    ringBooks.append(box(0.9, 0.16, 0.65, spine[k % 7], "#fff4e0", { jitter: 0 }), { t: [Math.cos(a) * 4.4, Math.sin(a * 2) * 0.35, -Math.sin(a) * 4.4], ry: a + 1.57, rz: 0.2 });
  }
  parts.push({ name: "book_ring_mesh", nodeName: "book_ring_body", parent: "book_ring", mesh: ringBooks, material: "paint" });
  const floats = [["float_a", [-20, 0, 6]], ["float_b", [19.5, -2, -7]], ["float_c", [-9, -13, -14]]];
  for (const [name, pos] of floats) {
    nodes.push({ name, position: pos });
    const m = new Mesh();
    m.append(blob(2 + rng(), { detail: 1, jitter: 0.3, seed: 600 + pos[0], color: "#fff4fb", flat: false, squash: 0.6 }));
    m.append(box(0.9, 0.16, 0.65, "#e8a24a", "#fff4e0", { jitter: 0 }), { t: [0, 1.2, 0], rz: 0.2 });
    parts.push({ name: `${name}_mesh`, nodeName: `${name}_body`, parent: name, mesh: m, material: "paint" });
  }
  const anim = { name: "library_ambient", tracks: [spinTrack("book_ring", 30, 8), ...floats.map(([name, pos], i) => bobTrack(name, pos, 0.6, 7 + i * 1.6, i * 0.3))] };
  nodes.push(anchor("landmark_pin", [0, top + 14.2, dz + 6]));
  parts.unshift({ name: "terrain", mesh: body.mesh, material: "paint" }, { name: "clouds", mesh: clouds, material: "paint" }, { name: "props", mesh: props, material: "paint" }, { name: "glows", mesh: glow, material: "glow" });
  return { id: "function", fileBase: "cloud-library", spec: { name: "CloudLibrary", parts, nodes, animations: [anim] }, body };
}
