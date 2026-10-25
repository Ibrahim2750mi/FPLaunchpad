const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mix = (a, b, t) => a + (b - a) * t;
const v3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a, n) => [a[0] * n, a[1] * n, a[2] * n];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => scale3(a, 1 / (Math.hypot(...a) || 1));
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

function compose(node) {
  const [x, y, z, w] = node.rotation;
  const [sx, sy, sz] = node.scale;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([
    (1 - 2 * (yy + zz)) * sx, (2 * (xy + wz)) * sx, (2 * (xz - wy)) * sx, 0,
    (2 * (xy - wz)) * sy, (1 - 2 * (xx + zz)) * sy, (2 * (yz + wx)) * sy, 0,
    (2 * (xz + wy)) * sz, (2 * (yz - wx)) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    node.translation[0], node.translation[1], node.translation[2], 1,
  ]);
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov * Math.PI / 360), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(eye, target) {
  const z = norm3(sub3(eye, target));
  const x = norm3(cross3([0, 1, 0], z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
  ]);
}

const rotateY = ([x, y, z], angle) => [x * Math.cos(angle) + z * Math.sin(angle), y, -x * Math.sin(angle) + z * Math.cos(angle)];
const fromTyped = (buffer, byteOffset, byteLength, Type) => new Type(buffer.slice(byteOffset, byteOffset + byteLength));

async function loadGlb(url, gl) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  const source = await response.arrayBuffer();
  const view = new DataView(source);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error(`Invalid GLB: ${url}`);
  let offset = 12, json, binary;
  while (offset < source.byteLength) {
    const size = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(source.slice(offset, offset + size)).trim());
    else if (type === 0x004e4942) binary = source.slice(offset, offset + size);
    offset += size;
  }
  if (!json || !binary) throw new Error(`GLB is missing a JSON or binary chunk: ${url}`);
  const accessor = (index) => {
    const a = json.accessors[index], bv = json.bufferViews[a.bufferView];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const bytes = { 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const byteOffset = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const data = fromTyped(binary, byteOffset, a.count * components * bytes, { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType]);
    return { data, count: a.count, components, normalized: Boolean(a.normalized), componentType: a.componentType };
  };
  const nodes = json.nodes.map((n) => ({
    name: n.name ?? "", translation: [...(n.translation ?? [0, 0, 0])], rotation: [...(n.rotation ?? [0, 0, 0, 1])], scale: [...(n.scale ?? [1, 1, 1])],
    children: n.children ?? [], mesh: n.mesh, extras: n.extras ?? {},
  }));
  const parents = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => n.children.forEach((child) => { parents[child] = i; }));
  const byName = new Map(nodes.map((n, i) => [n.name, i]));
  const drawables = [];
  json.meshes.forEach((mesh, meshIndex) => mesh.primitives.forEach((primitive) => {
    const attrs = {};
    for (const [key, index] of Object.entries(primitive.attributes)) {
      const a = accessor(index), bufferObject = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bufferObject);
      gl.bufferData(gl.ARRAY_BUFFER, a.data, gl.STATIC_DRAW);
      attrs[key] = { buffer: bufferObject, components: a.components, normalized: a.normalized, componentType: a.componentType };
    }
    const indexAccessor = accessor(primitive.indices), indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexAccessor.data, gl.STATIC_DRAW);
    const nodeIndexes = nodes.map((node, index) => node.mesh === meshIndex ? index : -1).filter((index) => index >= 0);
    for (const nodeIndex of nodeIndexes) drawables.push({ nodeIndex, attrs, indexBuffer, indexCount: indexAccessor.count, indexType: indexAccessor.componentType === 5125 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, material: json.materials?.[primitive.material]?.name ?? "paint" });
  }));
  const animations = (json.animations ?? []).map((animation) => ({
    name: animation.name,
    tracks: animation.channels.map((channel) => {
      const sampler = animation.samplers[channel.sampler];
      return { node: channel.target.node, path: channel.target.path, times: accessor(sampler.input).data, values: accessor(sampler.output).data, components: accessor(sampler.output).components };
    }),
  }));
  const baseNodes = nodes.map((n) => ({ translation: [...n.translation], rotation: [...n.rotation], scale: [...n.scale] }));
  return { url, json, nodes, parents, byName, drawables, animations, baseNodes, roots: json.scenes?.[json.scene ?? 0]?.nodes ?? [0] };
}

function shader(gl, type, source) {
  const value = gl.createShader(type); gl.shaderSource(value, source); gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value));
  return value;
}

function createPipeline(gl) {
  const vertex = `#version 300 es
    in vec3 a_position; in vec3 a_normal; in vec4 a_color;
    uniform mat4 u_mvp; uniform mat4 u_model;
    out vec4 v_color; out float v_light; out float v_fog;
    void main(){ vec3 normal=normalize(mat3(u_model)*a_normal); v_light=max(dot(normal,normalize(vec3(-0.45,0.82,0.35))),0.0); v_color=a_color; vec4 clip=u_mvp*vec4(a_position,1.0); gl_Position=clip; v_fog=smoothstep(48.0,190.0,clip.w); }`;
  const fragment = `#version 300 es
    precision highp float;
    in vec4 v_color; in float v_light; in float v_fog; uniform float u_emissive; uniform float u_alpha; uniform float u_day;
    out vec4 outColor;
    void main(){
      float light=mix(0.29,0.5,u_day)+v_light*mix(0.68,0.65,u_day);
      vec3 rgb=mix(v_color.rgb*light,v_color.rgb*(1.06+u_day*0.1),u_emissive);
      float luminance=dot(rgb,vec3(0.2126,0.7152,0.0722));
      rgb=mix(vec3(luminance),rgb,mix(0.48,0.62,u_day));
      rgb*=mix(vec3(0.9,0.91,1.05),vec3(1.02,1.0,0.95),u_day);
      rgb=mix(rgb,vec3(0.48,0.44,0.68),v_fog*0.48);
      outColor=vec4(rgb,v_color.a*u_alpha);
    }`;
  const program = gl.createProgram(); gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vertex)); gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  return { program, attrs: { position: gl.getAttribLocation(program, "a_position"), normal: gl.getAttribLocation(program, "a_normal"), color: gl.getAttribLocation(program, "a_color") }, uniforms: { mvp: gl.getUniformLocation(program, "u_mvp"), model: gl.getUniformLocation(program, "u_model"), emissive: gl.getUniformLocation(program, "u_emissive"), alpha: gl.getUniformLocation(program, "u_alpha"), day: gl.getUniformLocation(program, "u_day") } };
}

function sampleTrack(track, time, loopDuration) {
  const times = track.times, duration = times[times.length - 1] || loopDuration || 1;
  const t = loopDuration ? time % duration : clamp(time, 0, duration);
  let hi = 1;
  while (hi < times.length - 1 && times[hi] < t) hi += 1;
  const lo = Math.max(0, hi - 1), span = times[hi] - times[lo] || 1, f = clamp((t - times[lo]) / span, 0, 1);
  const start = lo * track.components, end = hi * track.components;
  return Array.from({ length: track.components }, (_, i) => mix(track.values[start + i], track.values[end + i], f));
}

function applyClip(model, name, time, loop = true) {
  model.nodes.forEach((node, i) => Object.assign(node, { translation: [...model.baseNodes[i].translation], rotation: [...model.baseNodes[i].rotation], scale: [...model.baseNodes[i].scale] }));
  const clip = model.animations.find((entry) => entry.name === name);
  if (!clip) return;
  const duration = Math.max(...clip.tracks.map((track) => track.times[track.times.length - 1]));
  const t = loop ? time : Math.min(time, duration);
  for (const track of clip.tracks) model.nodes[track.node][track.path] = sampleTrack(track, t, loop ? duration : 0);
}

function nodeMatrices(model) {
  const worlds = new Array(model.nodes.length);
  const visit = (index, parent) => {
    const local = compose(model.nodes[index]);
    const world = parent ? multiply(parent, local) : local;
    worlds[index] = world;
    model.nodes[index].children.forEach((child) => visit(child, world));
  };
  model.roots.forEach((root) => visit(root, null));
  return worlds;
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  return [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
}

export function createWorldExperience({ canvas, labels, onGuideArrive, onIslandSelect, onSkyFacing }) {
  let gl;
  try { gl = canvas.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "high-performance" }); } catch { return null; }
  if (!gl) return null;
  let pipeline;
  try { pipeline = createPipeline(gl); } catch (error) { console.warn("3D scene shader setup failed:", error); return null; }
  const ctx = labels.getContext("2d");
  const state = { lessonId: "map", adventureStep: 0, stepCount: 0, activeIndex: -1, inputItems: [], outputItems: [], expressionText: "", done: false, error: false, mode: "subset" };
  const models = new Map();
  const adventureIsles = new Map();
  let manifest, guide, day = false, motion = true, overview = false, adventureMode = false, orbitYaw = 0, orbitPitch = 0, previousKey = "", transitionAt = 0, flightAt = 0, flightDuration = 1850, flightArc = 0.55, guideArrivalPending = false;
  let camera = { eye: [0, 12, 36], target: [0, 0, 0] }, cameraFrom = null, cameraTo = null;
  let guideFrom = null, guideTo = null;
  let islandHotspots = [], hoveredIslandId = null;
  let skyFacing = false;
  let raf = 0;
  const sceneEl = document.getElementById("worldScene");
  const palette = { map: "#fff0b7", fold: "#ffc275", let: "#c7e8ff", function: "#ffe7a8" };
  const activeId = () => manifest?.islands?.[state.lessonId] ? state.lessonId : "map";
  const layout = () => manifest?.islands?.[activeId()];
  const selectedModel = () => models.get(activeId());
  const instanceMatrix = (config) => {
    const [x, y, z] = config.world.position, angle = config.world.yaw, s = config.world.scale ?? 1;
    const c = Math.cos(angle) * s, sn = Math.sin(angle) * s;
    return new Float32Array([c, 0, -sn, 0, 0, s, 0, 0, sn, 0, c, 0, x, y, z, 1]);
  };
  const forestMatrix = (position, yaw, scale) => {
    const c = Math.cos(yaw) * scale, sn = Math.sin(yaw) * scale;
    return new Float32Array([c, 0, -sn, 0, 0, scale, 0, 0, sn, 0, c, 0, position[0], position[1], position[2], 1]);
  };
  const adventureModelFor = (step) => ["map", "fold", "let", "function"][Math.abs(step) % 4];
  const adventurePalettes = [
    { grass: "#739b76", rock: "#665b75", stone: "#94829a", leaf: "#b4cc83", glow: "#f3d79c" },
    { grass: "#6d968c", rock: "#536779", stone: "#8096a2", leaf: "#9ac7b2", glow: "#b9e6e0" },
    { grass: "#9d8b68", rock: "#66566b", stone: "#998072", leaf: "#c3aa78", glow: "#ffd78f" },
    { grass: "#6d809d", rock: "#535675", stone: "#8586a6", leaf: "#a8bed0", glow: "#d9c8ff" },
    { grass: "#7c9670", rock: "#565e64", stone: "#89917c", leaf: "#c4c989", glow: "#e8e6a9" },
  ];
  const createAdventureIsle = (seed) => {
    let randomState = (Math.abs(seed) + 1) * 2654435761 >>> 0;
    const random = () => { randomState = randomState + 0x6D2B79F5 | 0; let t = Math.imul(randomState ^ randomState >>> 15, 1 | randomState); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const palette = adventurePalettes[Math.abs(seed) % adventurePalettes.length];
    const positions = [], normals = [], colors = [], indices = [];
    const rgb = (hex, shade = 1) => [1, 3, 5].map((at) => Math.max(0, Math.min(1, parseInt(hex.slice(at, at + 2), 16) / 255 * shade)));
    const pushTriangle = (a, b, c, color) => {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = norm3(cross3(ab, ac)), faceColor = [...rgb(color, 0.84 + random() * 0.3), 1];
      for (const point of [a, b, c]) { positions.push(...point); normals.push(...normal); colors.push(...faceColor); indices.push(indices.length); }
    };
    const pushQuad = (a, b, c, d, color) => { pushTriangle(a, b, c, color); pushTriangle(a, c, d, color); };
    const ring = (radius, y, count, phase, warp = 0.1) => Array.from({ length: count }, (_, i) => {
      const angle = i / count * Math.PI * 2 + phase;
      const wobble = 1 + Math.sin(angle * 3 + seed) * warp + Math.cos(angle * 5 - seed * 0.7) * warp * 0.55;
      return [Math.cos(angle) * radius * wobble, y + Math.sin(angle * 2 + seed) * warp * 0.65, Math.sin(angle) * radius * wobble];
    });
    const cone = (x, y, z, height, radius, color, count = 7, topRadius = 0) => {
      const phase = random() * Math.PI * 2;
      const lower = ring(radius, y, count, phase, 0.025).map(([px, py, pz]) => [px + x, py, pz + z]);
      const upper = ring(topRadius, y + height, count, phase, 0.02).map(([px, py, pz]) => [px + x, py, pz + z]);
      for (let i = 0; i < count; i += 1) {
        const next = (i + 1) % count;
        if (topRadius <= 0.001) pushTriangle(lower[i], lower[next], [x, y + height, z], color);
        else pushQuad(lower[i], lower[next], upper[next], upper[i], color);
        pushTriangle([x, y, z], lower[next], lower[i], color);
      }
    };

    const sides = 22, phase = random() * Math.PI * 2, baseRadius = 8.5 + random() * 2.2;
    const layers = [
      { y: 0.15, radius: 1, color: palette.grass },
      { y: -1.3 - random() * 0.5, radius: 0.91, color: palette.rock },
      { y: -4.2 - random() * 0.8, radius: 0.65, color: palette.rock },
      { y: -7.2 - random() * 0.8, radius: 0.37, color: palette.stone },
      { y: -9.5 - random() * 1.2, radius: 0.08, color: palette.rock },
    ];
    const rings = layers.map((layer) => ring(baseRadius * layer.radius, layer.y, sides, phase, layer.radius > 0.3 ? 0.11 : 0.18));
    for (let layer = 0; layer < rings.length - 1; layer += 1) {
      for (let i = 0; i < sides; i += 1) {
        const next = (i + 1) % sides;
        pushQuad(rings[layer][i], rings[layer][next], rings[layer + 1][next], rings[layer + 1][i], layers[layer + 1].color);
      }
    }
    const center = [0, 0.22, 0], top = rings[0];
    for (let i = 0; i < sides; i += 1) pushTriangle(center, top[(i + 1) % sides], top[i], palette.grass);

    const treeCount = 3 + Math.floor(random() * 5);
    for (let i = 0; i < treeCount; i += 1) {
      const angle = phase + i * 2.399 + random() * 0.3, radius = baseRadius * (0.24 + random() * 0.43);
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius, height = 4.3 + random() * 4.8;
      cone(x, 0.18, z, height * 0.46, 0.24 + random() * 0.12, palette.stone, 6, 0.16);
      cone(x, 0.18 + height * 0.32, z, height * 0.55, 1.25 + random() * 0.9, palette.leaf, 7);
      if (random() > 0.48) cone(x + .3, 0.18 + height * .55, z - .25, height * .35, .95, palette.grass, 7);
    }
    const featureAngle = phase + random() * Math.PI * 2, featureRadius = baseRadius * (0.05 + random() * 0.19);
    const fx = Math.cos(featureAngle) * featureRadius, fz = Math.sin(featureAngle) * featureRadius;
    const motif = Math.abs(seed) % 4;
    if (motif === 0) {
      cone(fx, .25, fz, 7 + random() * 5, .75 + random() * .7, palette.glow, 6);
      cone(fx + 1.1, .25, fz + .7, 4.3, .48, palette.stone, 6);
    } else if (motif === 1) {
      cone(fx - 1.4, .2, fz, 4.8, .48, palette.stone, 6, .38);
      cone(fx + 1.4, .2, fz, 4.8, .48, palette.stone, 6, .38);
      cone(fx, 4.35, fz, 1, 1.9, palette.glow, 6, 1.6);
    } else if (motif === 2) {
      cone(fx, .25, fz, 3.8, 1.3, palette.stone, 7, .9);
      cone(fx, 3.9, fz, 4.7, .48, palette.glow, 5);
      cone(fx + 1.8, .25, fz - 1.4, 2.9, .7, palette.leaf, 6);
    } else {
      cone(fx, .25, fz, 5.6, 1.4, palette.leaf, 7);
      cone(fx - 1.1, .25, fz + 1.5, 3.2, .6, palette.glow, 5);
    }
    for (let i = 0; i < 5; i += 1) {
      const angle = random() * Math.PI * 2, radius = baseRadius * (.72 + random() * .36);
      cone(Math.cos(angle) * radius, -1.2 - random() * 3, Math.sin(angle) * radius, 1.5 + random() * 3, .45 + random() * .7, i % 2 ? palette.rock : palette.glow, 5);
    }
    const upload = (target, data) => { const buffer = gl.createBuffer(); gl.bindBuffer(target, buffer); gl.bufferData(target, data, gl.STATIC_DRAW); return buffer; };
    return {
      nodes: [{ translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], children: [] }],
      baseNodes: [{ translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }],
      roots: [0], animations: [],
      drawables: [{ nodeIndex: 0, material: "paint", indexCount: indices.length, indexType: gl.UNSIGNED_SHORT,
        indexBuffer: upload(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices)),
        attrs: {
          POSITION: { buffer: upload(gl.ARRAY_BUFFER, new Float32Array(positions)), components: 3, componentType: 5126, normalized: false },
          NORMAL: { buffer: upload(gl.ARRAY_BUFFER, new Float32Array(normals)), components: 3, componentType: 5126, normalized: false },
          COLOR_0: { buffer: upload(gl.ARRAY_BUFFER, new Float32Array(colors)), components: 4, componentType: 5126, normalized: false },
        } }],
    };
  };
  const adventureIsleFor = (seed) => {
    if (!adventureIsles.has(seed)) adventureIsles.set(seed, createAdventureIsle(seed));
    return adventureIsles.get(seed);
  };
  const adventurePosition = (step) => {
    const origin = manifest?.islands?.map?.world?.position ?? [0, 0, 0];
    if (step === 0) return [...origin];
    // A deterministic golden-angle route keeps every reduction on a unique
    // isle while keeping adjacent destinations close enough for a camera flight.
    const angle = step * 2.399963229728653;
    const radius = 20 * Math.sqrt(step);
    return [origin[0] + Math.cos(angle) * radius, origin[1] + Math.sin(step * 1.37) * 5, origin[2] + Math.sin(angle) * radius];
  };
  const adventureRoot = (id, step, scale = null) => {
    const config = manifest.islands[id];
    return forestMatrix(adventurePosition(step), config.world.yaw + step * 0.19, scale ?? config.world.scale ?? 1);
  };
  const activeRoot = (id = activeId()) => adventureMode ? adventureRoot(id, state.adventureStep) : instanceMatrix(manifest.islands[id]);
  const activeAnchor = (id, name) => getAnchorWorld(id, name, activeRoot(id));
  const localAnchorName = (id, index = 0) => {
    const config = manifest.islands[id];
    if (id === "map") return `work_${index}`;
    if (id === "fold") return `spiral_${index}`;
    return `path_${index}`;
  };
  const lessonPathIndex = (id = activeId()) => {
    const count = manifest?.islands?.[id]?.anchors?.count ?? 4;
    const itemCount = Math.max(1, state.inputItems.length || count);
    const itemIndex = clamp(state.activeIndex >= 0 ? state.activeIndex : Math.max(0, state.stepCount - 1), 0, itemCount - 1);
    return Math.round(itemIndex * (count - 1) / Math.max(1, itemCount - 1));
  };
  const getAnchorWorld = (id, name, root = null) => {
    const model = models.get(id), config = manifest?.islands?.[id];
    if (!model || !config) return null;
    const nodeIndex = model.byName.get(name);
    if (nodeIndex === undefined) return null;
    const local = model.nodes[nodeIndex].translation;
    return transformPoint(root ?? instanceMatrix(config), local);
  };
  const valuesAt = (id, type, index) => getAnchorWorld(id, id === "map" ? `${type}_${index}` : id === "fold" ? `spiral_${index}` : `path_${index}`);
  const focusFor = (id, index) => activeAnchor(id, localAnchorName(id, index)) ?? activeAnchor(id, "landmark_gate") ?? [0, 0, 0];

  function fitCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.65);
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    for (const target of [canvas, labels]) {
      target.width = Math.round(w * ratio); target.height = Math.round(h * ratio);
      target.style.width = `${w}px`; target.style.height = `${h}px`;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function targetCamera(now = performance.now(), newIsland = false) {
    const config = layout(), model = selectedModel();
    if (!config || !model) return;
    if (overview) {
      const next = { eye: [0, 112, 132], target: [0, 2, -58] };
      cameraFrom = { eye: [...camera.eye], target: [...camera.target] };
      cameraTo = next;
      flightAt = now;
      flightDuration = (newIsland ? 1800 : 1100) * (0.94 + Math.random() * 0.12);
      flightArc = 0.45 + Math.random() * 0.35;
      if (!motion) { camera = next; cameraFrom = cameraTo = null; }
      return;
    }
    if (adventureMode) {
      // Adventure reductions travel by sliding the existing camera rig toward
      // the next generated isle. Keep the player's current viewing angle while
      // the island itself moves through the frame, as it does in the home arena.
      const position = adventurePosition(state.adventureStep);
      // The generated isles include tall trees and landmarks. Aim above the
      // ground plane so the complete island, rather than its base, sits in the
      // center of the view during each reduction flight.
      const focus = [position[0], position[1] + 3.8, position[2]];
      const currentOffset = sub3(camera.eye, camera.target);
      const currentDistance = Math.hypot(...currentOffset) || 1;
      const rigOffset = scale3(currentOffset, 31 / currentDistance);
      const next = { eye: v3(focus, rigOffset), target: focus };
      cameraFrom = { eye: [...camera.eye], target: [...camera.target] };
      cameraTo = next;
      flightAt = now;
      flightDuration = (newIsland ? 3000 : 1450) * (0.94 + Math.random() * 0.12);
      flightArc = newIsland ? 0.9 + Math.random() * 0.3 : 0.45;
      if (!motion) { camera = next; cameraFrom = cameraTo = null; }
      return;
    }
    const pathCount = config.anchors.count ?? 4;
    const index = lessonPathIndex(activeId());
    const focus = focusFor(activeId(), index);
    let offset;
    if (config.rig.orbit) {
      const progress = index / Math.max(1, pathCount - 1);
      const angle = -0.48 + progress * Math.PI * 0.95;
      offset = [Math.sin(angle) * config.rig.orbit.radius, config.rig.orbit.height, Math.cos(angle) * config.rig.orbit.radius];
    } else {
      offset = config.rig.offset;
      // Frame the full island on the opening reduction, then move in along its path.
      const baseDistance = state.stepCount ? 28 : 36;
      offset = [offset[0] * 0.42, Math.max(offset[1], 12), baseDistance - Math.min(7, state.stepCount * 1.5)];
    }
    const spun = rotateY(offset, config.world.yaw + (adventureMode ? state.adventureStep * 0.19 : 0));
    const next = { eye: v3(focus, spun), target: v3(focus, [0, 1.2, 0]) };
    cameraFrom = { eye: [...camera.eye], target: [...camera.target] };
    cameraTo = next;
    flightAt = now;
    flightDuration = (newIsland ? 2600 : 1450) * (0.94 + Math.random() * 0.12);
    flightArc = (newIsland ? 1.05 : 0.45) + Math.random() * (newIsland ? 0.5 : 0.3);
    if (!motion) { camera = next; cameraFrom = cameraTo = null; }
  }

  function positionGuide(now) {
    const id = activeId(), config = layout(), model = selectedModel();
    if (!config || !model) return null;
    const count = config.anchors.count ?? 4;
    const index = lessonPathIndex(id);
    let start, end;
    if (id === "map") {
      const inPoint = activeAnchor(id, `lane_in_${index}`), outPoint = activeAnchor(id, `lane_out_${index}`);
      start = guideFrom ?? inPoint; end = guideTo ?? (state.done ? outPoint : inPoint);
    } else if (id === "fold") {
      start = guideFrom ?? activeAnchor(id, `spiral_${index}`);
      end = guideTo ?? (state.done ? activeAnchor(id, "landmark_forge") : activeAnchor(id, `spiral_${index}`));
    } else {
      start = guideFrom ?? activeAnchor(id, `path_${index}`);
      end = guideTo ?? activeAnchor(id, `path_${index}`);
    }
    if (!start || !end) return null;
    const t = motion ? clamp((now - transitionAt) / 1450, 0, 1) : 1;
    const eased = t * t * (3 - 2 * t);
    return v3(start, scale3(sub3(end, start), eased));
  }

  function renderLabels(viewProjection, guidePosition, now, width, height) {
    ctx.clearRect(0, 0, width, height);
    islandHotspots = [];
    const project = (point) => {
      const [x, y, z] = point;
      const cx = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
      const cy = viewProjection[1] * x + viewProjection[5] * y + viewProjection[9] * z + viewProjection[13];
      const cz = viewProjection[2] * x + viewProjection[6] * y + viewProjection[10] * z + viewProjection[14];
      const cw = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];
      if (cw <= 0 || cz / cw < -1 || cz / cw > 1) return null;
      return { x: (cx / cw * 0.5 + 0.5) * width, y: (1 - (cy / cw * 0.5 + 0.5)) * height };
    };
    if (overview && manifest) {
      const ids = ["map", "fold", "let", "function"];
      const centers = ids.map((id) => {
        const world = manifest.islands[id]?.world?.position;
        return world ? { id, point: project([world[0], world[1] + 7, world[2]]) } : null;
      }).filter((item) => item?.point);
      islandHotspots = centers.map(({ id, point }) => ({ id, x: point.x, y: point.y, radius: 42 }));
      ctx.save();
      ctx.setLineDash([2, 9]); ctx.lineWidth = 1.25; ctx.strokeStyle = "rgba(224,215,255,.48)";
      ctx.shadowBlur = 12; ctx.shadowColor = "rgba(207,193,255,.72)";
      ctx.beginPath(); centers.forEach(({ point }, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      if (centers.length > 2) ctx.lineTo(centers[0].point.x, centers[0].point.y);
      ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
      for (const { id, point } of centers) {
        const names = id === "map" ? ["landmark_gate", "landmark_pin", "landmark_tree"]
          : id === "fold" ? ["landmark_gate", "landmark_pin", "landmark_forge"]
            : id === "let" ? ["landmark_gate", "landmark_pin", "landmark_summit"]
              : ["landmark_gate", "landmark_pin", "landmark_dome"];
        const stars = names.map((name) => getAnchorWorld(id, name)).filter(Boolean).map(project).filter(Boolean);
        ctx.strokeStyle = `${palette[id] || "#fff0b7"}88`; ctx.shadowBlur = 9; ctx.shadowColor = palette[id] || "#fff0b7";
        ctx.beginPath(); stars.forEach((star, index) => index ? ctx.lineTo(star.x, star.y) : ctx.moveTo(star.x, star.y)); ctx.stroke();
        for (const star of stars) {
          ctx.fillStyle = "#fff8dd"; ctx.beginPath(); ctx.arc(star.x, star.y, 3, 0, Math.PI * 2); ctx.fill();
        }
        const beacon = (hoveredIslandId === id ? 9 : 6) + Math.sin(now / 420 + centers.findIndex((item) => item.id === id)) * 1.2;
        ctx.shadowBlur = 22; ctx.shadowColor = palette[id] || "#fff0b7";
        ctx.strokeStyle = `${palette[id] || "#fff0b7"}99`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(point.x, point.y, beacon + 7, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = palette[id] || "#fff0b7";
        ctx.beginPath(); ctx.arc(point.x, point.y, beacon, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fffdf2"; ctx.beginPath(); ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.font = "600 15px 'DM Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(255,249,232,.96)"; ctx.shadowBlur = 7; ctx.shadowColor = "rgba(9,7,26,.95)";
        ctx.fillText(manifest.islands[id].place.toUpperCase(), point.x, point.y - 12);
      }
      ctx.restore();
    }
    const drawTag = (value, x, y, tint, fontSize = 16, active = false) => {
      const text = String(value);
      ctx.font = `${active ? 700 : 600} ${fontSize}px 'DM Mono', monospace`;
      const boxWidth = ctx.measureText(text).width + (active ? 24 : 20);
      const boxHeight = fontSize + (active ? 17 : 14);
      const left = x - boxWidth / 2, top = y - boxHeight / 2;
      ctx.shadowColor = active ? tint : "rgba(8,7,27,.58)"; ctx.shadowBlur = active ? 19 : 13; ctx.shadowOffsetY = 3;
      ctx.fillStyle = active ? "rgba(19,20,43,.98)" : "rgba(15,15,42,.96)";
      ctx.strokeStyle = `${tint}${active ? "ff" : "cc"}`; ctx.lineWidth = active ? 1.6 : 1;
      ctx.beginPath(); ctx.roundRect(left, top, boxWidth, boxHeight, boxHeight / 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = tint; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, x, y + 0.5);
      ctx.textBaseline = "alphabetic";
    };
    const id = activeId(), cfg = layout();
    if (cfg) {
      const count = cfg.anchors.count ?? 4;
      const pathPoints = [];
      for (let i = 0; i < count; i += 1) {
        const point = id === "map" ? getAnchorWorld(id, `work_${i}`) : getAnchorWorld(id, id === "fold" ? `spiral_${i}` : `path_${i}`);
        if (point) pathPoints.push(project(point));
      }
      ctx.save();
      ctx.setLineDash([3, 8]); ctx.lineWidth = 1.5; ctx.strokeStyle = `${palette[id] || "#fff0b7"}99`;
      ctx.shadowBlur = 13; ctx.shadowColor = palette[id] || "#fff0b7";
      ctx.beginPath(); pathPoints.filter(Boolean).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.setLineDash([]);
      if (id === "map") {
        const n = Math.min(count, Math.max(3, state.inputItems.length));
        for (let i = 0; i < n; i += 1) {
          const modelIndex = Math.round(i * (count - 1) / Math.max(1, n - 1));
          const input = project(getAnchorWorld(id, `lane_in_${modelIndex}`));
          const output = project(getAnchorWorld(id, `lane_out_${modelIndex}`));
          for (const [point, value, tint] of [[input, state.inputItems[i], "#fff1c9"], [output, state.outputItems[i], "#a3ffe8"]]) {
            if (!point || value === undefined) continue;
            const active = i === state.activeIndex;
            drawTag(value, point.x, point.y - 20, tint, active ? 21 : 17, active);
          }
        }
      } else if (id === "fold") {
        const n = Math.min(count, state.inputItems.length);
        for (let i = 0; i < n; i += 1) {
          const modelIndex = Math.round(i * (count - 1) / Math.max(1, n - 1));
          const point = project(getAnchorWorld("fold", `spiral_${modelIndex}`));
          if (!point) continue;
          const active = i === state.activeIndex;
          drawTag(state.inputItems[i], point.x, point.y - 18, active ? "#fff2ca" : "#ffca92", active ? 21 : 16, active);
        }
        const forge = project(getAnchorWorld("fold", "landmark_forge"));
        if (forge && state.accumulatorText) drawTag(`Σ ${state.accumulatorText}`, forge.x, forge.y - 19, "#fff2c6", 13);
      }
      ctx.restore();
    }
    if (guidePosition) {
      const p = project(guidePosition);
      if (p) {
        const radius = 22 + Math.sin(now / 190) * 3;
        const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius);
        glow.addColorStop(0, "rgba(255,255,245,.95)"); glow.addColorStop(0.2, `${palette[activeId()] || "#fff0b7"}c9`); glow.addColorStop(1, "rgba(255,222,150,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Sparse distant motes add scale and air without obscuring the authored geometry.
    for (let i = 0; i < 26; i += 1) {
      const x = (i * 173.17 + Math.sin(now / 5100 + i) * 24 + width) % width;
      const y = (i * 97.31 + Math.sin(now / 2400 + i * 1.7) * 12 + height) % height;
      const r = 0.8 + (i % 4) * 0.3;
      ctx.globalAlpha = motion ? 0.18 + 0.24 * (0.5 + 0.5 * Math.sin(now / 760 + i)) : 0.28;
      ctx.fillStyle = "#fff1ca"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function setAttributes(drawable) {
    const bind = (key, location, fallback, size) => {
      const attr = drawable.attrs[key];
      if (!attr || location < 0) { gl.disableVertexAttribArray(location); gl.vertexAttrib4fv(location, fallback); return; }
      gl.bindBuffer(gl.ARRAY_BUFFER, attr.buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, attr.components || size, attr.componentType === 5123 ? gl.UNSIGNED_SHORT : gl.FLOAT, attr.normalized, 0, 0);
    };
    bind("POSITION", pipeline.attrs.position, [0, 0, 0, 1], 3);
    bind("NORMAL", pipeline.attrs.normal, [0, 1, 0, 0], 3);
    bind("COLOR_0", pipeline.attrs.color, [1, 1, 1, 1], 4);
  }

  function drawModel(model, rootMatrix, pv, time, clipName, loop = true) {
    applyClip(model, clipName, time, loop);
    const locals = nodeMatrices(model);
    for (const drawable of model.drawables) {
      const nodeWorld = multiply(rootMatrix, locals[drawable.nodeIndex]);
      const mvp = multiply(pv, nodeWorld);
      const emissive = drawable.material !== "paint";
      const additive = drawable.material === "glow_add";
      gl.uniformMatrix4fv(pipeline.uniforms.model, false, nodeWorld);
      gl.uniformMatrix4fv(pipeline.uniforms.mvp, false, mvp);
      gl.uniform1f(pipeline.uniforms.emissive, emissive ? 1 : 0);
      gl.uniform1f(pipeline.uniforms.alpha, drawable.material === "glow_add" ? 0.78 : 1);
      if (additive) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); }
      else { gl.disable(gl.BLEND); gl.depthMask(true); }
      setAttributes(drawable);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, drawable.indexBuffer);
      gl.drawElements(gl.TRIANGLES, drawable.indexCount, drawable.indexType, 0);
    }
    gl.disable(gl.BLEND); gl.depthMask(true);
    return locals;
  }

  function frame(now) {
    const width = window.innerWidth, height = window.innerHeight;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.useProgram(pipeline.program);
    gl.uniform1f(pipeline.uniforms.day, day ? 1 : 0);
    const flight = cameraTo ? (motion ? clamp((now - flightAt) / flightDuration, 0, 1) : 1) : 1;
    const eased = flight * flight * (3 - 2 * flight);
    if (cameraTo && cameraFrom) {
      const arc = motion ? Math.sin(Math.PI * eased) * flightArc : 0;
      camera.eye = cameraFrom.eye.map((v, i) => mix(v, cameraTo.eye[i], eased) + (i === 1 ? arc : 0));
      camera.target = cameraFrom.target.map((v, i) => mix(v, cameraTo.target[i], eased) + (i === 1 ? arc * 0.22 : 0));
      if (flight >= 1) { camera = cameraTo; cameraFrom = cameraTo = null; }
    }
    const p = perspective(layout()?.rig.fov ?? 52, width / height, 0.1, 650);
    const offset = sub3(camera.eye, camera.target);
    const distance = Math.hypot(...offset) || 1;
    const baseYaw = Math.atan2(offset[0], offset[2]);
    const basePitch = Math.asin(clamp(offset[1] / distance, -1, 1));
    const yaw = baseYaw + orbitYaw, pitch = clamp(basePitch + orbitPitch, -1.12, 1.12);
    const nextSkyFacing = skyFacing ? pitch < -0.045 : pitch < -0.12;
    if (nextSkyFacing !== skyFacing) {
      skyFacing = nextSkyFacing;
      onSkyFacing?.(skyFacing);
    }
    const orbitEye = v3(camera.target, [Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance]);
    const pv = multiply(p, lookAt(orbitEye, camera.target));
    if (adventureMode && manifest?.islands) {
      // Keep the active route island as the only island in the adventure view.
      // This lets each reduction read as a clear destination instead of a group.
      const step = Math.max(0, state.adventureStep | 0);
      const id = adventureModelFor(step);
      if (manifest.islands[id]) {
        drawModel(adventureIsleFor(step), adventureRoot(id, step), pv, motion ? now / 1000 : 0, null, true);
      }
    } else {
      for (const [id, config] of Object.entries(manifest?.islands ?? {})) {
        const model = models.get(id);
        if (!model) continue;
        drawModel(model, instanceMatrix(config), pv, motion ? now / 1000 : 0, config.clips?.[0]?.name, true);
      }
    }
    let guidePosition = positionGuide(now);
    if (guideArrivalPending && (!motion || now - transitionAt >= 1450)) {
      guideArrivalPending = false;
      onGuideArrive?.();
    }
    if (guide) {
      const clip = motion && now - transitionAt < 1450 ? "travel" : "idle";
      let guideRoot = identity();
      if (guidePosition) {
        const node = { translation: guidePosition, rotation: [0, 0, 0, 1], scale: [1.7, 1.7, 1.7] };
        guideRoot = compose(node);
      }
      drawModel(guide, guideRoot, pv, motion ? (now - transitionAt) / 1000 : 0, clip, true);
    }
    renderLabels(pv, guidePosition, motion ? now : 0, width, height);
    raf = requestAnimationFrame(frame);
  }

  async function boot() {
    manifest = await (await fetch("assets/world/manifest.json")).json();
    const entries = Object.entries(manifest.islands);
    await Promise.all(entries.map(async ([id, config]) => models.set(id, await loadGlb(config.file, gl))));
    guide = await loadGlb(manifest.guide.file, gl);
    sceneEl.classList.add("world-3d-ready");
    fitCanvas();
    targetCamera(performance.now(), true);
    transitionAt = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  fitCanvas();
  window.addEventListener("resize", fitCanvas, { passive: true });
  boot().catch((error) => { console.warn("3D world could not load; keeping the illustrated fallback.", error); });

  return {
    setState(next) {
      const oldLesson = state.lessonId;
      const oldStepCount = state.stepCount;
      const oldPoint = positionGuide(performance.now());
      const oldAdventureStep = state.adventureStep;
      const key = `${next.lessonId}:${next.adventureStep ?? 0}:${next.stepCount}:${next.activeIndex}:${next.done}:${next.mode}`;
      Object.assign(state, next);
      // The app publishes its first lesson before the 3D manifest has loaded.
      // Keep that state and let boot() frame it once the island data is ready.
      if (!manifest) { previousKey = key; return; }
      if (key !== previousKey) {
        const switched = oldLesson !== state.lessonId || oldAdventureStep !== state.adventureStep;
        const now = performance.now();
        guideFrom = switched ? null : (oldPoint ?? null);
        const id = activeId();
        const index = lessonPathIndex(id);
        guideTo = id === "map"
          ? activeAnchor(id, state.stepCount === 0 && !state.done ? `lane_in_${index}` : `lane_out_${index}`)
          : id === "fold"
            ? activeAnchor(id, state.done ? "landmark_forge" : `spiral_${index}`)
            : activeAnchor(id, `path_${index}`);
        transitionAt = now;
        if (state.stepCount !== oldStepCount || switched) guideArrivalPending = true;
        if (models.size) targetCamera(now, switched);
        previousKey = key;
      }
    },
    pickIsland(x, y) {
      if (!overview || !islandHotspots.length) return false;
      const nearest = islandHotspots
        .map((spot) => ({ ...spot, distance: Math.hypot(x - spot.x, y - spot.y) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest || nearest.distance > nearest.radius) return false;
      onIslandSelect?.(nearest.id);
      return true;
    },
    hoverIsland(x, y) {
      if (!overview || !islandHotspots.length) { hoveredIslandId = null; return false; }
      const nearest = islandHotspots
        .map((spot) => ({ ...spot, distance: Math.hypot(x - spot.x, y - spot.y) }))
        .sort((a, b) => a.distance - b.distance)[0];
      hoveredIslandId = nearest && nearest.distance <= nearest.radius ? nearest.id : null;
      return hoveredIslandId !== null;
    },
    setTheme(value) { day = Boolean(value); },
    setOverview(value) {
      const next = Boolean(value);
      if (overview === next) return;
      overview = next;
      orbitYaw = 0; orbitPitch = 0;
      if (models.size) targetCamera(performance.now(), true);
    },
    setAdventureMode(value) {
      adventureMode = Boolean(value);
      if (adventureMode) overview = false;
      if (models.size) targetCamera(performance.now(), true);
    },
    rotateView(dx, dy) {
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      if (cameraTo) { camera = cameraTo; cameraFrom = cameraTo = null; }
      orbitYaw = (orbitYaw - dx * 0.0032) % (Math.PI * 2);
      orbitPitch = clamp(orbitPitch + dy * 0.0028, -0.88, 0.88);
    },
    faceForward() {
      if (cameraTo) { camera = cameraTo; cameraFrom = cameraTo = null; }
      orbitYaw = 0;
      orbitPitch = 0;
      if (models.size) targetCamera(performance.now(), true);
    },
    setMotion(value) {
      motion = Boolean(value);
      if (!motion) {
        if (cameraTo) { camera = cameraTo; cameraFrom = cameraTo = null; }
        transitionAt = performance.now() - 1200;
        if (models.size) targetCamera(performance.now());
      }
    },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener("resize", fitCanvas); gl.getExtension("WEBGL_lose_context")?.loseContext(); },
  };
}
