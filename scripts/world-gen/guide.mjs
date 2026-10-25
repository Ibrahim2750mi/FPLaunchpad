// "Wick": the small guiding light. An original spirit - a seed of light with petal fins, three orbiting motes and a short tail.
import { Mesh, C, lerpC, blob, lathe } from "./meshkit.mjs";
import { quatY, quatZ, quatX } from "./glb.mjs";

const petal = () => {
  const m = new Mesh();
  const prof = [[0, 0], [0.12, 0.05], [0.3, 0.22], [0.34, 0.5], [0.2, 0.82], [0, 1.05]];
  m.append(lathe(prof, 6, { flat: true, colorFn: (r, y) => lerpC(C("#fff4cf"), C("#ffc1d9"), y), jitter: 0 }), { s: [1, 1, 0.22], rz: 1.2 });
  return m;
};

export function buildGuide() {
  const core = blob(0.34, { detail: 2, jitter: 0.02, flat: false, colorFn: (x, y, z) => lerpC(C("#fff0b8"), C("#ffffff"), (y / 0.34) * 0.5 + 0.5) });
  const shell = blob(0.52, { detail: 1, jitter: 0.04, flat: false, color: "#ffe6a8" });
  const tail = new Mesh();
  const tailProf = [[0.0, 0], [0.2, -0.2], [0.14, -0.7], [0.07, -1.3], [0, -1.9]];
  tail.append(lathe(tailProf.map(([r, z]) => [r, -z]), 8, { flat: false, colorFn: (r, y) => lerpC(C("#fff2c0"), C("#000000"), Math.min(1, y / 1.9)), jitter: 0 }), { rx: 1.5708 });
  const mote = () => blob(0.1, { detail: 0, jitter: 0, flat: true, color: "#fff6d8" });
  const nodes = [
    { name: "Anchors" },
    { name: "GuideBody", parent: "Root" },
    { name: "Orbit_0", parent: "GuideBody" }, { name: "Orbit_1", parent: "GuideBody", rotation: quatZ(1.0) }, { name: "Orbit_2", parent: "GuideBody", rotation: quatX(1.0) },
    { name: "PetalPivot_L", parent: "GuideBody", position: [-0.22, 0.02, 0] }, { name: "PetalPivot_R", parent: "GuideBody", position: [0.22, 0.02, 0] },
    { name: "TailPivot", parent: "GuideBody", position: [0, 0, 0.25] },
    { name: "guide_halo", parent: "Anchors", position: [0, 0, 0], extras: { halo: true } },
  ];
  const parts = [
    { name: "Core", mesh: core, material: "glow", parent: "GuideBody" },
    { name: "Shell", mesh: shell, material: "glow_add", parent: "GuideBody" },
    { name: "Tail", mesh: tail, material: "glow_add", parent: "TailPivot" },
    { name: "Petal_L", mesh: petal(), material: "glow", parent: "PetalPivot_L" },
    { name: "Petal_R", mesh: petal(), material: "glow", parent: "PetalPivot_R", scale: [-1, 1, 1] },
    { name: "Mote_0", mesh: mote(), material: "glow", parent: "Orbit_0", position: [0.62, 0, 0] },
    { name: "Mote_1", mesh: mote(), material: "glow", parent: "Orbit_1", position: [0.7, 0, 0] },
    { name: "Mote_2", mesh: mote(), material: "glow", parent: "Orbit_2", position: [0.56, 0, 0] },
  ];
  const turn = (node, secs, steps = 8, q = quatY, phase = 0) => ({
    node, path: "rotation",
    times: Array.from({ length: steps + 1 }, (_, i) => (i / steps) * secs),
    values: Array.from({ length: steps + 1 }, (_, i) => q(((i / steps) + phase) * Math.PI * 2)),
  });
  const flat = (node, path, times, values) => ({ node, path, times, values });
  const sc = (v) => [v, v, v];
  const animations = [
    { name: "idle", tracks: [
      turn("Orbit_0", 4), turn("Orbit_1", 5, 8, quatY, 0.3), turn("Orbit_2", 6.5, 8, quatY, 0.6),
      flat("Core", "scale", [0, 1, 2, 3, 4], [sc(1), sc(1.1), sc(1), sc(1.08), sc(1)]),
      flat("Shell", "scale", [0, 1.3, 2.6, 4], [sc(1), sc(1.18), sc(0.96), sc(1)]),
      flat("PetalPivot_L", "rotation", [0, 0.8, 1.6, 2.4, 3.2, 4], [quatZ(0.2), quatZ(0.46), quatZ(0.2), quatZ(0.46), quatZ(0.2), quatZ(0.2)]),
      flat("PetalPivot_R", "rotation", [0, 0.8, 1.6, 2.4, 3.2, 4], [quatZ(-0.2), quatZ(-0.46), quatZ(-0.2), quatZ(-0.46), quatZ(-0.2), quatZ(-0.2)]),
      flat("GuideBody", "translation", [0, 1, 2, 3, 4], [[0, 0, 0], [0, 0.1, 0], [0, 0, 0], [0, 0.08, 0], [0, 0, 0]]),
      flat("TailPivot", "scale", [0, 2, 4], [sc(0.35), sc(0.5), sc(0.35)]),
    ] },
    { name: "travel", tracks: [
      turn("Orbit_0", 1.2, 6), turn("Orbit_1", 1.5, 6, quatY, 0.3), turn("Orbit_2", 1.8, 6, quatY, 0.6),
      flat("Core", "scale", [0, 0.6, 1.2], [[0.9, 0.9, 1.5], [0.82, 0.82, 1.7], [0.9, 0.9, 1.5]]),
      flat("Shell", "scale", [0, 0.6, 1.2], [[0.9, 0.9, 1.4], [0.8, 0.8, 1.6], [0.9, 0.9, 1.4]]),
      flat("PetalPivot_L", "rotation", [0, 0.3, 0.6, 0.9, 1.2], [quatZ(0.8), quatZ(0.95), quatZ(0.8), quatZ(0.95), quatZ(0.8)]),
      flat("PetalPivot_R", "rotation", [0, 0.3, 0.6, 0.9, 1.2], [quatZ(-0.8), quatZ(-0.95), quatZ(-0.8), quatZ(-0.95), quatZ(-0.8)]),
      flat("TailPivot", "scale", [0, 0.6, 1.2], [sc(1.3), sc(1.7), sc(1.3)]),
    ] },
    { name: "arrive", tracks: [
      turn("Orbit_0", 0.9, 6, quatY), turn("Orbit_1", 0.9, 6, quatY, 0.3), turn("Orbit_2", 0.9, 6, quatY, 0.6),
      flat("Core", "scale", [0, 0.18, 0.5, 0.9], [[0.9, 0.9, 1.4], sc(1.55), sc(0.95), sc(1)]),
      flat("Shell", "scale", [0, 0.2, 0.9], [sc(1), sc(2.4), sc(1)]),
      flat("Orbit_0", "scale", [0, 0.25, 0.9], [sc(1), sc(1.9), sc(1)]),
      flat("PetalPivot_L", "rotation", [0, 0.2, 0.9], [quatZ(0.8), quatZ(-0.1), quatZ(0.2)]),
      flat("PetalPivot_R", "rotation", [0, 0.2, 0.9], [quatZ(-0.8), quatZ(0.1), quatZ(-0.2)]),
      flat("TailPivot", "scale", [0, 0.3, 0.9], [sc(1.4), sc(0.2), sc(0.35)]),
    ] },
    { name: "complete", tracks: [
      turn("Orbit_0", 2.4, 12, quatY), turn("Orbit_1", 2.4, 12, quatY, 0.3), turn("Orbit_2", 2.4, 12, quatY, 0.6),
      turn("GuideBody", 2.4, 12, quatY),
      flat("Core", "scale", [0, 0.5, 1.2, 2.4], [sc(1), sc(1.9), sc(1.5), sc(1.15)]),
      flat("Shell", "scale", [0, 0.5, 1.4, 2.4], [sc(1), sc(3.2), sc(2), sc(1.2)]),
      flat("Orbit_0", "scale", [0, 0.6, 1.4, 2.4], [sc(1), sc(2.8), sc(2), sc(1.4)]),
      flat("Orbit_1", "scale", [0, 0.6, 1.4, 2.4], [sc(1), sc(2.4), sc(1.8), sc(1.3)]),
      flat("PetalPivot_L", "rotation", [0, 0.6, 2.4], [quatZ(0.2), quatZ(-0.3), quatZ(0.1)]),
      flat("PetalPivot_R", "rotation", [0, 0.6, 2.4], [quatZ(-0.2), quatZ(0.3), quatZ(-0.1)]),
    ] },
  ];
  return { id: "guide", fileBase: "guide-light", spec: { name: "GuideLight", parts, nodes, animations } };
}
