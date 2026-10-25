// Generates assets/world/models/*.glb and assets/world/manifest.json.
// Run: npm run build:assets
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeGlb } from "./world-gen/glb.mjs";
import { buildVerdant, buildEmber, buildFrost, buildLibrary } from "./world-gen/islands.mjs";
import { buildGuide } from "./world-gen/guide.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = (p) => resolve(root, "assets/world", p);

// Island placement in the archipelago, and per-layout camera rigs (island-local offsets).
const LAYOUT = {
  map: {
    place: "Verdant Isle", lesson: "List.map", layout: "lanes", short: "map",
    world: { position: [-25, 0, 0], yaw: 0.22, scale: 1 },
    anchors: { lanesIn: "lane_in_", lanesOut: "lane_out_", work: "work_", count: 5, gate: "landmark_gate", end: "landmark_tree", pin: "landmark_pin" },
    rig: { offset: [-4.5, 9.5, 15.5], look: [0.6, 1.4, -5], fov: 52 },
    palette: { item: "#ffd98a", output: "#7ff0d2", glow: "#ffe9a8" },
    ambient: [{ preset: "petals", anchor: "landmark_tree", spread: [16, 7, 16], rate: 5 }, { preset: "fireflies", anchor: "landmark_pin", spread: [18, 6, 18], rate: 3 }],
  },
  fold: {
    place: "Ember Isle", lesson: "List.foldl", layout: "spiral", short: "fold",
    world: { position: [26, 5, -40], yaw: -0.18, scale: 1 },
    anchors: { spiral: "spiral_", count: 7, forge: "landmark_forge", mouth: "forge_mouth", gate: "landmark_gate", pin: "landmark_pin" },
    rig: { orbit: { radius: 22, height: 11.5, lead: 0.55, lookBlend: 0.32 }, fov: 50 },
    palette: { item: "#ffc576", output: "#ff9a5a", glow: "#ffb066" },
    ambient: [{ preset: "embers", anchor: "landmark_forge", spread: [9, 8, 9], rate: 14 }],
  },
  let: {
    place: "Frost Isle", lesson: "let", layout: "ascent", short: "let",
    world: { position: [-23, 12, -86], yaw: 0.12, scale: 1.05 },
    anchors: { path: "path_", count: 5, end: "landmark_summit", gate: "landmark_gate", pin: "landmark_pin" },
    rig: { offset: [3.6, 7.2, 14], look: [0, 2.8, -7], fov: 52 },
    palette: { item: "#bfe6ff", output: "#ffffff", glow: "#a9dcff" },
    ambient: [{ preset: "snow", anchor: "landmark_pin", spread: [20, 12, 20], rate: 12 }],
  },
  function: {
    place: "Cloud Library", lesson: "function calls", layout: "nave", short: "function",
    world: { position: [18, 22, -136], yaw: -0.1, scale: 1.12 },
    anchors: { path: "path_", count: 4, end: "landmark_lectern", gate: "landmark_gate", dome: "landmark_dome", pin: "landmark_pin" },
    rig: { offset: [0, 6.2, 13.5], look: [0, 3, -8], fov: 54 },
    palette: { item: "#ffe7a6", output: "#fff7de", glow: "#ffe08a" },
    ambient: [{ preset: "pages", anchor: "landmark_dome", spread: [16, 8, 16], rate: 4 }],
  },
};

const builders = [buildVerdant(), buildEmber(), buildFrost(), buildLibrary()];
const guide = buildGuide();
const manifest = {
  version: 1,
  generator: "scripts/generate-world-assets.mjs",
  license: "CC0-1.0 (all geometry generated procedurally; no third-party material)",
  islands: {},
  guide: {},
  environment: {
    skyDay: "assets/floating-world/backgrounds/sky_day.jpg",
    skyDusk: "assets/floating-world/backgrounds/sky_dusk.jpg",
    particleAtlas: "assets/floating-world/webp/particles/particle_atlas.webp",
    godRays: "assets/floating-world/webp/particles/god_rays.webp",
    glow: "assets/floating-world/webp/particles/glow_warm.webp",
    clouds: ["01", "02", "03", "04", "05", "06"].map((n) => `assets/floating-world/webp/clouds/cloud_${n}_{theme}.webp`),
    mist: ["assets/floating-world/webp/mist/mist_band_{theme}.webp", "assets/floating-world/webp/mist/mist_band_b_{theme}.webp"],
    farIslands: ["verdant", "ember", "frost"].map((n) => `assets/floating-world/webp/islands/far/far_island_${n}_{theme}.webp`),
  },
};

for (const b of builders) {
  const file = out(`models/${b.fileBase}.glb`);
  const info = await writeGlb(file, b.spec);
  const names = new Set([...(b.spec.nodes ?? []).map((n) => n.name), ...(b.spec.parts ?? []).map((p) => p.nodeName ?? p.name)]);
  const anchors = [...names].filter((n) => /^(lane_|work_|spiral_|path_|landmark_|forge_|glow_|float_|flame_|aurora|book_ring)/.test(n));
  const clips = (b.spec.animations ?? []).map((a) => ({ name: a.name, seconds: Math.max(...a.tracks.flatMap((t) => t.times)) }));
  manifest.islands[b.id] = {
    file: `assets/world/models/${b.fileBase}.glb`, ...LAYOUT[b.id],
    stats: { bytes: info.bytes, triangles: info.tris, vertices: info.verts, meshes: info.parts.map((p) => ({ name: p.name, material: p.material, tris: p.tris })) },
    clips, anchorNodes: anchors,
  };
  console.log(`${b.fileBase.padEnd(14)} ${String(info.tris).padStart(6)} tris  ${(info.bytes / 1024).toFixed(0).padStart(5)} KB  clips: ${clips.map((c) => `${c.name} (${c.seconds.toFixed(1)}s)`).join(", ")}`);
}
{
  const file = out(`models/${guide.fileBase}.glb`);
  const info = await writeGlb(file, guide.spec);
  const clips = (guide.spec.animations ?? []).map((a) => ({ name: a.name, seconds: Math.max(...a.tracks.flatMap((t) => t.times)), loop: ["idle", "travel"].includes(a.name) }));
  manifest.guide = { file: `assets/world/models/${guide.fileBase}.glb`, stats: { bytes: info.bytes, triangles: info.tris, vertices: info.verts }, clips };
  console.log(`${guide.fileBase.padEnd(14)} ${String(info.tris).padStart(6)} tris  ${(info.bytes / 1024).toFixed(0).padStart(5)} KB  clips: ${clips.map((c) => `${c.name} (${c.seconds.toFixed(1)}s)`).join(", ")}`);
}
await writeFile(out("manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("manifest.json written");
