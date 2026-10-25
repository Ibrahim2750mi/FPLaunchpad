// Dependency-free binary glTF writer for the generated island meshes and animation clips.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const align4 = (value) => (value + 3) & ~3;

const MATERIALS = {
  paint: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.96 } },
  glow: { pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 }, emissiveFactor: [1, 1, 1] },
  glow_add: { pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 0.78], metallicFactor: 0, roughnessFactor: 1 }, emissiveFactor: [1, 1, 1], alphaMode: "BLEND", doubleSided: true },
  glass: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.78], metallicFactor: 0, roughnessFactor: 0.3 }, alphaMode: "BLEND", doubleSided: true },
};

export async function writeGlb(file, spec) {
  const chunks = [];
  let byteLength = 0;
  const addAccessor = (array, type, componentType, { normalized = false, target, min, max } = {}) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const offset = align4(byteLength);
    if (offset > byteLength) chunks.push(Buffer.alloc(offset - byteLength));
    chunks.push(bytes);
    byteLength = offset + bytes.length;
    const bufferView = json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) }) - 1;
    const accessor = { bufferView, componentType, count: array.length / ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type]), type, ...(normalized ? { normalized: true } : {}), ...(min ? { min } : {}), ...(max ? { max } : {}) };
    json.accessors.push(accessor);
    return json.accessors.length - 1;
  };
  const json = {
    asset: { version: "2.0", generator: "FPLaunchpad procedural world generator", copyright: "CC0 1.0 - generated procedurally for FPLaunchpad" },
    scene: 0, scenes: [{ name: spec.name, nodes: [] }], nodes: [], meshes: [], materials: [],
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], animations: [],
  };
  const nodes = new Map();
  const ensureNode = (name) => {
    if (!nodes.has(name)) {
      const index = json.nodes.push({ name }) - 1;
      nodes.set(name, index);
    }
    return nodes.get(name);
  };
  const root = ensureNode("Root");
  json.scenes[0].nodes.push(root);
  const specs = [{ name: "Root" }, ...(spec.nodes ?? [])];
  const parentByName = new Map([["Root", null]]);
  for (const node of specs.slice(1)) {
    const index = ensureNode(node.name);
    parentByName.set(node.name, node.parent ?? "Root");
    const out = json.nodes[index];
    if (node.position) out.translation = node.position;
    if (node.rotation) out.rotation = node.rotation;
    if (node.scale) out.scale = Array.isArray(node.scale) ? node.scale : [node.scale, node.scale, node.scale];
    if (node.extras) out.extras = node.extras;
  }
  for (const part of spec.parts ?? []) {
    if (!part.mesh?.triCount) continue;
    const mesh = part.mesh;
    const position = new Float32Array(mesh.p);
    const normals = mesh.normals();
    const colors = new Uint16Array(mesh.vertCount * 4);
    for (let i = 0; i < mesh.vertCount; i += 1) {
      for (let c = 0; c < 3; c += 1) colors[i * 4 + c] = Math.round(Math.min(1, Math.max(0, toLinear(mesh.c[i * 3 + c]))) * 65535);
      colors[i * 4 + 3] = 65535;
    }
    const indices = mesh.vertCount > 65535 ? new Uint32Array(mesh.i) : new Uint16Array(mesh.i);
    const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < position.length; i += 3) for (let c = 0; c < 3; c += 1) {
      mins[c] = Math.min(mins[c], position[i + c]); maxs[c] = Math.max(maxs[c], position[i + c]);
    }
    const attrs = {
      POSITION: addAccessor(position, "VEC3", 5126, { target: 34962, min: mins, max: maxs }),
      NORMAL: addAccessor(normals, "VEC3", 5126, { target: 34962 }),
      COLOR_0: addAccessor(colors, "VEC4", 5123, { normalized: true, target: 34962 }),
    };
    let minIndex = Infinity, maxIndex = -Infinity;
    for (const value of indices) { minIndex = Math.min(minIndex, value); maxIndex = Math.max(maxIndex, value); }
    const indexAccessor = addAccessor(indices, "SCALAR", indices instanceof Uint32Array ? 5125 : 5123, { target: 34963, min: [minIndex], max: [maxIndex] });
    const key = part.material ?? "paint";
    let material = json.materials.findIndex((m) => m.name === key);
    if (material < 0) { json.materials.push({ name: key, ...(MATERIALS[key] ?? MATERIALS.paint) }); material = json.materials.length - 1; }
    const meshIndex = json.meshes.push({ name: part.name, primitives: [{ attributes: attrs, indices: indexAccessor, material }] }) - 1;
    const nodeIndex = ensureNode(part.nodeName ?? part.name);
    json.nodes[nodeIndex].mesh = meshIndex;
    parentByName.set(part.nodeName ?? part.name, part.parent ?? "Root");
    if (part.position) json.nodes[nodeIndex].translation = part.position;
    if (part.scale) json.nodes[nodeIndex].scale = Array.isArray(part.scale) ? part.scale : [part.scale, part.scale, part.scale];
  }
  for (const [name, parentName] of parentByName) {
    if (!parentName) continue;
    const parentIndex = ensureNode(parentName), childIndex = ensureNode(name);
    (json.nodes[parentIndex].children ??= []).push(childIndex);
  }
  for (const animation of spec.animations ?? []) {
    const channels = [], samplers = [];
    for (const track of animation.tracks) {
      const input = addAccessor(new Float32Array(track.times), "SCALAR", 5126);
      const type = track.path === "rotation" ? "VEC4" : "VEC3";
      const output = addAccessor(new Float32Array(track.values.flat()), type, 5126);
      const sampler = samplers.push({ input, output, interpolation: "LINEAR" }) - 1;
      channels.push({ sampler, target: { node: ensureNode(track.node), path: track.path } });
    }
    json.animations.push({ name: animation.name, samplers, channels });
  }
  json.buffers[0].byteLength = align4(byteLength);
  const bin = Buffer.concat(chunks);
  const paddedBin = bin.length === json.buffers[0].byteLength ? bin : Buffer.concat([bin, Buffer.alloc(json.buffers[0].byteLength - bin.length)]);
  const jsonBytesRaw = Buffer.from(JSON.stringify(json));
  const jsonBytes = Buffer.concat([jsonBytesRaw, Buffer.alloc(align4(jsonBytesRaw.length) - jsonBytesRaw.length, 0x20)]);
  const totalLength = 12 + 8 + jsonBytes.length + 8 + paddedBin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBytes.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(paddedBin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.concat([header, jsonHeader, jsonBytes, binHeader, paddedBin]));
  return { bytes: totalLength, parts: (spec.parts ?? []).filter((p) => p.mesh?.triCount).map((p) => ({ name: p.name, material: p.material ?? "paint", tris: p.mesh.triCount, verts: p.mesh.vertCount })), tris: (spec.parts ?? []).reduce((sum, p) => sum + (p.mesh?.triCount ?? 0), 0), verts: (spec.parts ?? []).reduce((sum, p) => sum + (p.mesh?.vertCount ?? 0), 0) };
}

export const quatY = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
export const quatZ = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
export const quatX = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
export const spinTrack = (node, seconds, steps = 8, quat = quatY) => ({ node, path: "rotation", times: Array.from({ length: steps + 1 }, (_, i) => (i / steps) * seconds), values: Array.from({ length: steps + 1 }, (_, i) => quat((i / steps) * Math.PI * 2)) });
export const bobTrack = (node, base, amp, seconds, phase = 0, steps = 8) => ({ node, path: "translation", times: Array.from({ length: steps + 1 }, (_, i) => (i / steps) * seconds), values: Array.from({ length: steps + 1 }, (_, i) => [base[0], base[1] + Math.sin((i / steps + phase) * Math.PI * 2) * amp, base[2]]) });
