import { createWorldExperience } from "./src/world/scene.js";

const examples = [
  {
    id: "map", place: "Verdant Isle", file: "map_values.lean", title: "Map each value",
    description: "Watch a function transform each list item in turn.", kind: "map", preview: ["1", "2", "3"],
    source: "#eval let xs := [1, 2, 3]; let double := fun x => x * 2; List.map double xs",
  },
  {
    id: "fold", place: "Ember Isle", file: "fold_a_list.lean", title: "Fold a list",
    description: "Follow the accumulator as it combines each item.", kind: "fold", preview: ["1", "2", "3"],
    source: "#eval List.foldl (fun acc x => acc + x) 0 [1, 2, 3]",
  },
  {
    id: "let", place: "Frost Isle", file: "let_and_numbers.lean", title: "Reduce a let expression",
    description: "Substitute names, then reduce the arithmetic.", kind: "scalar", preview: [],
    source: "#eval let x := 4; let y := x + 1; y * 2",
  },
  {
    id: "function", place: "Cloud Library", file: "define_a_function.lean", title: "Call a function",
    description: "Unfold a definition and reduce its function body.", kind: "scalar", preview: [],
    source: "def square := fun x => x * x\n#eval square 4",
  },
];

// These are the in-world positions used by both the camera and the reduction path.
// Keeping them together makes the light trail stay attached to its island as we fly in.
const sceneAnchors = {
  map: { x: 0.5, y: 0.55 },
  fold: { x: 0.81, y: 0.53 },
  let: { x: 0.12, y: 0.65 },
  function: { x: 0.84, y: 0.19 },
  custom: { x: 0.5, y: 0.5 },
};

const $ = (id) => document.getElementById(id);
let example = examples[0];
let activeSource = example.source;
let engine = null;
let response = null;
let history = [];
let engineError = "";
let executionMode = "subset";
let customProgram = false;
let runGeneration = 0;
let leanRuntimePromise = null;
let stepSoundsEnabled = true;
let dayTheme = false;
let motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sceneCamera = { x: 0, y: 0, zoom: 1.02, targetX: 0, targetY: 0, targetZoom: 1.02 };
let worldExperience = null;

import("./dist/lean-stepper.js").then((module) => {
  engine = module;
  startExample();
}).catch(() => {
  engineError = "Could not load the stepper. Run npm install and npm run build.";
  render();
});

function selectExample(id) {
  const next = examples.find((item) => item.id === id);
  if (!next) return;
  example = next;
  playStepTone(392, 0.08);
  customProgram = false;
  startExample();
}

function startExample() {
  runGeneration += 1;
  history = [];
  executionMode = "subset";
  activeSource = example.source;
  $("sourceEditor").value = activeSource;
  response = engine ? engine.startForUi(activeSource) : null;
  render();
}

function advance() {
  if (executionMode !== "subset" || !engine || !response || response.done || response.error) return;
  history.push(response);
  const previous = response;
  response = engine.stepForUi(response.machine);
  playStepTone(523, 0.12);
  if (response.done && !response.error) {
    response = {
      ...response,
      activeIndex: -1,
      inputItems: previous.inputItems,
      outputItems: previous.outputItems,
      accumulatorText: previous.accumulatorText,
    };
  }
  render();
}

function rewind() {
  if (executionMode !== "subset" || !history.length) return;
  response = history.pop();
  render();
}

function reset() {
  if (customProgram) runProgram();
  else startExample();
}

function inferKind(source) {
  if (/\bList\.map\b/.test(source)) return "map";
  if (/\bList\.(?:foldl|foldr)\b/.test(source)) return "fold";
  return "scalar";
}

function inferListPreview(source) {
  const literal = source.match(/\[\s*-?\d+(?:\s*,\s*-?\d+)*\s*\]/);
  return literal ? literal[0].slice(1, -1).split(",").map((item) => item.trim()) : [];
}

async function runProgram() {
  const source = $("sourceEditor").value;
  if (!source.trim()) {
    response = { error: "Enter Lean code to run.", done: true, stepCount: 0, expressionText: "" };
    executionMode = "subset";
    render();
    return;
  }

  runGeneration += 1;
  const generation = runGeneration;
  activeSource = source;
  customProgram = true;
  example = {
    id: "custom",
    file: "custom.lean",
    title: "Your program",
    description: "The view is generated from the code you entered.",
    kind: inferKind(source),
    preview: inferListPreview(source),
    source,
  };
  history = [];
  response = null;
  executionMode = "checking";
  render();

  if (!engine) {
    executionMode = "unavailable";
    engineError = "The stepper bundle is not available. Build the project, then try again.";
    render();
    return;
  }

  const initial = engine.startForUi(source);
  let probe = initial;
  let supported = !probe.error;
  let reductions = 0;
  while (supported && !probe.done && reductions < 500) {
    probe = engine.stepForUi(probe.machine);
    supported = !probe.error;
    reductions += 1;
  }
  if (supported && !probe.done) supported = false;

  if (generation !== runGeneration) return;
  if (supported) {
    executionMode = "subset";
    response = initial;
    render();
  } else {
    await runWithLean4(source, generation);
  }
}

async function loadLeanRuntime(generation) {
  if (!leanRuntimePromise) {
    leanRuntimePromise = import("./dist/lean-runtime.js").then(async ({ Lean4 }) => {
      const runtime = new Lean4({
        onProgress: (message) => {
          if (generation === runGeneration && executionMode === "lean-loading") {
            $("runtimeMessage").textContent = `Lean 4 · ${message}`;
          }
        },
      });
      await runtime.init();
      return runtime;
    }).catch((error) => {
      leanRuntimePromise = null;
      throw error;
    });
  }
  return leanRuntimePromise;
}

async function runWithLean4(source, generation) {
  executionMode = "lean-loading";
  response = null;
  render();
  $("runtimeMessage").textContent = "Outside the stepper subset · loading the real Lean 4 runtime. First run downloads and caches its runtime files.";
  try {
    const runtime = await loadLeanRuntime(generation);
    if (generation !== runGeneration) return;
    const result = await runtime.run(source);
    if (generation !== runGeneration) return;
    const cleaned = cleanLeanResult(result);
    response = {
      mode: "lean",
      done: true,
      stepCount: 0,
      error: cleaned.error,
      stdout: cleaned.output,
      stderr: "",
      expressionText: "Lean 4 program",
    };
    executionMode = "lean";
    history = [];
    render();
  } catch (error) {
    if (generation !== runGeneration) return;
    response = {
      mode: "lean",
      done: true,
      stepCount: 0,
      error: `Could not start Lean 4: ${error?.message || error}`,
      stdout: "",
      stderr: "",
      expressionText: "Lean 4 could not start",
    };
    executionMode = "lean-unavailable";
    render();
  }
}

function cleanLeanResult(result) {
  const messages = [];
  let hasLeanError = false;
  for (const line of (result.stdout || "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const diagnostic = JSON.parse(line);
      if (diagnostic.severity === "error") hasLeanError = true;
      if (typeof diagnostic.data === "string" && diagnostic.data.trim()) messages.push(diagnostic.data.trim());
    } catch {
      messages.push(line.trim());
    }
  }
  const stderr = (result.stderr || "").split("\n").filter((line) =>
    line.trim() && !line.includes("wasm streaming compile failed") && !line.startsWith("falling back to ArrayBuffer") && !/^\[DEBUG[:\]]/.test(line),
  );
  const output = [...messages, ...stderr].join("\n");
  const failed = result.exitCode !== 0 || hasLeanError;
  return {
    error: failed ? output || `Lean exited with code ${result.exitCode}.` : "",
    output,
  };
}

function renderSamples() {
  $("sampleList").innerHTML = examples.map((item) => `
    <button class="sample-item ${item.id === example.id ? "active" : ""}" type="button" aria-pressed="${item.id === example.id}" data-id="${item.id}">
      <span class="sample-icon">${item.kind === "map" ? "✧" : item.kind === "fold" ? "◉" : item.kind === "let" ? "❄" : "☁"}</span>
      <span class="sample-copy"><strong>${item.place}</strong><small>${item.title}</small></span>
      <span class="isle-arrow">${item.id === example.id ? "✦" : "↗"}</span>
    </button>`).join("");
  $("sampleList").querySelectorAll(".sample-item").forEach((item) => {
    item.addEventListener("click", () => selectExample(item.dataset.id));
  });
  const index = examples.findIndex((item) => item.id === example.id);
  $("journeyCount").textContent = `${String(index + 1).padStart(2, "0")} / ${String(examples.length).padStart(2, "0")}`;
}

function renderCode() {
  const source = activeSource;
  const focusStart = response?.focusStart ?? -1;
  const focusEnd = response?.focusEnd ?? -1;
  let offset = 0;
  $("codeBody").innerHTML = source.split("\n").map((line, lineIndex) => {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;
    const selectedStart = Math.max(0, focusStart - lineStart);
    const selectedEnd = Math.min(line.length, focusEnd - lineStart);
    let visibleLine;
    if (focusStart >= 0 && selectedEnd > selectedStart) {
      visibleLine = `${escapeHtml(line.slice(0, selectedStart))}<span class="code-redex">${escapeHtml(line.slice(selectedStart, selectedEnd))}</span>${escapeHtml(line.slice(selectedEnd))}`;
    } else {
      visibleLine = escapeHtml(line);
    }
    const activeLine = focusStart >= lineStart && focusStart <= lineEnd;
    return `<div class="code-line ${activeLine ? "current" : ""}" data-line="${lineIndex}"><span class="line-number">${String(lineIndex + 1).padStart(2, "0")}</span><span class="line-content">${visibleLine}</span></div>`;
  }).join("");
}

function renderMapVisual() {
  const items = response?.inputItems?.length ? response.inputItems : example.preview;
  const outputs = response?.outputItems || [];
  const active = response?.activeIndex ?? -1;
  if (!items.length) return `<div class="eval-empty">Waiting for a list value…</div>`;
  return `<div class="eval-visual"><div class="eval-operation">List.map · input → result</div><div class="eval-list-row">${items.map((value, index) => {
    const output = outputs[index] || "";
    const classes = ["eval-box", index === active ? "active" : "", output ? "done" : ""].filter(Boolean).join(" ");
    return `<div class="eval-cell"><div class="${classes}">${escapeHtml(value)}</div><span class="eval-output">${output ? `↓ ${escapeHtml(output)}` : "·"}</span></div>${index < items.length - 1 ? "<span class='eval-arrow'>→</span>" : ""}`;
  }).join("")}</div></div>`;
}

function renderFoldVisual() {
  const items = response?.inputItems?.length ? response.inputItems : example.preview;
  const active = response?.activeIndex ?? -1;
  const accumulator = response?.accumulatorText || "0";
  if (!items.length) return `<div class="eval-empty">Waiting for a list value…</div>`;
  const current = active >= 0 ? items[active] : "";
  return `<div class="eval-visual"><div class="eval-operation">List.foldl · accumulator + current item</div><div class="eval-acc-row"><span class="eval-acc-label">ACCUMULATOR</span><span class="eval-box accumulator">${escapeHtml(accumulator)}</span>${current ? `<span class="eval-acc-arrow">+</span><span class="eval-box active">${escapeHtml(current)}</span>` : response?.done ? `<span class="eval-acc-arrow">=</span><span class="eval-box accumulator">${escapeHtml(response.expressionText)}</span>` : ""}</div><div class="eval-list-row">${items.map((value, index) => `<div class="eval-cell"><div class="eval-box ${index === active ? "active" : index < active || response?.done ? "done" : ""}">${escapeHtml(value)}</div><span class="eval-output">item ${index + 1}</span></div>${index < items.length - 1 ? "<span class='eval-arrow'>→</span>" : ""}`).join("")}</div></div>`;
}

function inspectLogic(source) {
  const rows = [];
  const declarations = [...source.matchAll(/^\s*(def|theorem|example|inductive|structure|abbrev|opaque|class)\s+([\w'.]+)/gm)];
  const steps = [];
  if (declarations.length) steps.push(...declarations.map((match) => ({ label: match[1], text: match[2] })));
  if (/\b#eval\b/.test(source)) steps.push({ label: "run", text: "Evaluate result" });
  if (/\bList\.map\b|\.map\b/.test(source)) rows.push(["List.map", "Applies a function to each list element; the input and mapped result stay in corresponding positions."]);
  if (/\bList\.foldl\b/.test(source)) rows.push(["List.foldl", "Carries an accumulator from left to right, combining it with one element at a time."]);
  if (/\bList\.foldr\b/.test(source)) rows.push(["List.foldr", "Combines elements from right to left into one result."]);
  if (/\bList\.filter\b/.test(source)) rows.push(["List.filter", "Tests each element and keeps the ones whose predicate is true."]);
  if (/\bif\b/.test(source)) rows.push(["condition", "Chooses one branch when the condition is true and another when it is false."]);
  if (/\bmatch\b[\s\S]*\bwith\b|^\s*\|/m.test(source)) rows.push(["pattern match", "Selects a branch from the value's shape or constructor."]);
  if (/\bfun\b/.test(source)) rows.push(["function", "Defines a function; its parameters are bound when it is applied."]);
  if (/\blet\b/.test(source)) rows.push(["let binding", "Gives a value a local name for the rest of its scope."]);
  if (/\bIO\b|\bio!\b|\bIO\./.test(source)) rows.push(["effects", "The program mentions Lean's input/output operations."]);
  if (/\btheorem\b|\bby\b/.test(source)) rows.push(["proof", "Contains a theorem or tactic-style proof; Lean checks the proof term."]);
  const recursive = declarations.some(([, , name]) => source.slice(source.indexOf(name) + name.length).includes(name));
  if (recursive) rows.push(["recursion", "A definition appears to refer to itself; repeated calls can reduce the input toward a base case."]);
  if (steps.length === 0) steps.push({ label: "source", text: "Lean program" });
  return { steps, rows };
}

function renderLeanView() {
  const analysis = inspectLogic(activeSource);
  const output = executionMode === "lean-loading"
    ? "Waiting for the Lean 4 runtime to finish loading…"
    : response?.error || response?.stderr || response?.stdout || "Lean accepted the program; it produced no printed output.";
  const featureRows = analysis.rows.length
    ? analysis.rows.map(([label, explanation]) => `<div class="generated-badge" title="${escapeHtml(explanation)}">${escapeHtml(label)}</div>`).join("")
    : `<div class="generated-badge">Lean program</div>`;
  const flow = analysis.steps.map((step, index) => `${index ? `<span class="generated-arrow">→</span>` : ""}<span class="generated-node">${escapeHtml(step.label)}<br>${escapeHtml(step.text)}</span>`).join("");
  const explanations = analysis.rows.length
    ? analysis.rows.map(([label, explanation]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(explanation)}</div>`).join("")
    : "No common list or control-flow construct was recognized, so this view shows the Lean run and a declaration outline.";
  return `<div class="generated-view"><div class="generated-title">Generated code overview</div><div class="generated-badges">${featureRows}</div><div class="generated-flow">${flow}</div><div class="generated-explanation"><strong>How to read this:</strong> ${explanations}<br>This overview is inferred from visible syntax; Lean 4 supplies the actual compile/run result below.</div><pre class="lean-output ${response?.error ? "error" : ""}">${escapeHtml(output)}</pre></div>`;
}

function renderVisual() {
  if (["lean", "lean-loading", "lean-unavailable"].includes(executionMode)) {
    $("visualStage").innerHTML = renderLeanView();
  } else if (example.kind === "map") {
    $("visualStage").innerHTML = renderMapVisual();
  } else if (example.kind === "fold") {
    $("visualStage").innerHTML = renderFoldVisual();
  } else {
    const value = response?.expressionText || "?";
    $("visualStage").innerHTML = `<div class="eval-visual"><div class="eval-operation">Current value</div><div class="eval-scalar">${escapeHtml(value)}</div></div>`;
  }
  $("visualCaption").textContent = executionMode.startsWith("lean")
    ? "Generated overview uses syntax cues; output comes from Lean 4."
    : response?.note || (engineError || "One reduction at a time");
  $("stepDots").innerHTML = Array.from({ length: 5 }, (_, index) => `<i class="step-dot ${index < (response?.stepCount || 0) % 6 ? "done" : ""}"></i>`).join("");
}

function moveSceneToState() {
  const cameraElement = $("worldCamera");
  if (!cameraElement) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const anchor = sceneAnchors[example.id] || sceneAnchors.custom;
  const itemCount = Math.max(1, response?.inputItems?.length || example.preview?.length || 3);
  const steps = response?.stepCount || 0;
  const activeIndex = response?.activeIndex >= 0 ? response.activeIndex : (steps ? steps - 1 : (itemCount - 1) / 2);
  const current = Math.max(0, Math.min(itemCount - 1, activeIndex));
  const across = current - (itemCount - 1) / 2;
  const gap = Math.min(76, width * 0.085);
  const focusX = width * anchor.x + across * gap;
  const focusY = height * anchor.y + Math.sin(current * 1.25) * Math.min(18, height * 0.025);
  // Each reduction moves the camera to the active value. The same point is drawn
  // by the canvas path, so the light and island remain in one coherent world.
  sceneCamera.targetZoom = response?.done ? 1.12 : Math.min(1.48, 1.08 + steps * 0.075);
  sceneCamera.targetX = (width / 2 - focusX) * sceneCamera.targetZoom;
  sceneCamera.targetY = (height / 2 - focusY) * sceneCamera.targetZoom;
  if (!motionEnabled) {
    sceneCamera.x = sceneCamera.targetX;
    sceneCamera.y = sceneCamera.targetY;
    sceneCamera.zoom = sceneCamera.targetZoom;
    cameraElement.style.transform = `translate3d(${sceneCamera.x}px, ${sceneCamera.y}px, 0) scale(${sceneCamera.zoom})`;
  }
}

function runtimeTag() {
  if (executionMode === "lean") return "LEAN 4 · ACTUAL";
  if (executionMode === "lean-loading") return "LEAN 4 · LOADING";
  if (executionMode === "lean-unavailable") return "LEAN 4 · UNAVAILABLE";
  if (executionMode === "checking") return "CHECKING CODE";
  return engine ? "STEP SUBSET" : "LOADING";
}

function render() {
  renderSamples();
  $("worldScene").querySelectorAll("[data-island]").forEach((island) => {
    island.classList.toggle("is-active-island", island.dataset.island === example.id);
  });
  $("islandName").textContent = examples.find((item) => item.id === example.id)?.place.toUpperCase() || "OPEN SKY";
  moveSceneToState();
  $("proofTitle").textContent = example.title;
  $("proofDescription").textContent = example.description;
  $("fileName").textContent = example.file;
  $("parserStatus").textContent = runtimeTag();
  $("modeBadge").textContent = executionMode.startsWith("lean") ? "ACTUAL LEAN 4" : "TEACHING SUBSET";
  $("stepCounter").textContent = executionMode === "lean" || executionMode === "lean-unavailable"
    ? "Lean 4 run"
    : `Reduction ${response?.stepCount || 0}`;
  $("progressFill").style.width = response?.done ? "100%" : `${Math.min(88, 6 + (response?.stepCount || 0) * 7)}%`;
  $("progressPercent").textContent = executionMode.startsWith("lean")
    ? executionMode === "lean-loading" ? "Starting Lean 4" : executionMode === "lean-unavailable" ? "Lean unavailable" : "Actual Lean 4 result"
    : response?.done ? "Normal form reached" : response?.stepCount ? "Stepping through expression" : "Ready to reduce";
  $("nextLabel").textContent = response?.done ? "Complete" : response?.stepCount ? "Next reduction" : "Reduce once";
  const subsetCanStep = executionMode === "subset" && engine && response && !response.done && !response.error;
  $("nextButton").disabled = !subsetCanStep;
  $("previousButton").disabled = executionMode !== "subset" || history.length === 0;
  $("resetButton").disabled = !engine || executionMode === "lean-loading";
  $("runButton").disabled = !engine || executionMode === "lean-loading";
  $("sourceEditor").disabled = executionMode === "lean-loading";
  $("codeStatus").textContent = response?.error
    ? response.error
    : executionMode === "lean" ? "Executed by the Lean 4 WebAssembly runtime"
    : executionMode === "lean-loading" ? "Loading actual Lean 4 runtime…"
    : engine ? (response?.done ? "Evaluation complete" : "Lean subset interpreter · ready")
    : engineError || "Loading interpreter…";
  const expression = response?.mode === "lean"
    ? (response.error ? "Lean 4 reported an error" : response.stdout || "Lean 4 accepted this program")
    : response?.expressionText || activeSource;
  $("goalText").innerHTML = highlightExpression(expression);
  $("goalState").textContent = response?.error ? "Error" : executionMode === "lean" ? "Lean 4" : response?.done ? "Complete" : response?.stepCount ? "Reducing" : "Ready";
  $("goalState").classList.toggle("error", Boolean(response?.error));
  $("goalState").classList.toggle("solved", Boolean(response?.done && !response?.error));
  if (executionMode === "lean") $("runtimeMessage").textContent = "Ran by actual Lean 4 · view generated from syntax cues";
  else if (executionMode === "lean-unavailable") $("runtimeMessage").textContent = "Lean 4 could not start · check network access and COOP/COEP server headers";
  else if (executionMode === "subset") $("runtimeMessage").textContent = "Supported code steps locally · unsupported Lean runs in Lean 4";
  else if (executionMode !== "lean-loading") $("runtimeMessage").textContent = engineError || "Edit the code, then run it.";
  renderCode();
  renderVisual();
  worldExperience?.setState({
    lessonId: examples.some((item) => item.id === example.id) ? example.id : "custom",
    stepCount: response?.stepCount || 0,
    activeIndex: response?.activeIndex ?? -1,
    inputItems: response?.inputItems || example.preview || [],
    outputItems: response?.outputItems || [],
    accumulatorText: response?.accumulatorText || "",
    expressionText: response?.expressionText || activeSource,
    done: Boolean(response?.done),
    error: Boolean(response?.error),
    mode: executionMode,
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function highlightExpression(text) {
  const token = /#[\w.]+|[A-Za-z_][\w']*(?:\.[A-Za-z_][\w']*)*|-?\d+|=>|:=|\*|\+|=|[()[\],;]/g;
  let html = "", offset = 0, match;
  while ((match = token.exec(String(text)))) {
    html += escapeHtml(String(text).slice(offset, match.index));
    const value = match[0];
    const kind = /^#/.test(value) ? "directive"
      : /^(?:fun|let|in|if|then|else|match|with|by|do)$/.test(value) ? "keyword"
        : /^-?\d+$/.test(value) ? "number"
          : /^(?:List|Nat|Int|Bool|String|Array)(?:\.|$)/.test(value) ? "namespace"
            : /^[A-Za-z_]/.test(value) ? "identifier" : "operator";
    html += `<span class="expr-${kind}">${escapeHtml(value)}</span>`;
    offset = token.lastIndex;
  }
  return html + escapeHtml(String(text).slice(offset));
}

let toneContext;
function playStepTone(frequency = 523, duration = 0.12) {
  if (!stepSoundsEnabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  toneContext ||= new AudioContextClass();
  if (toneContext.state === "suspended") toneContext.resume();
  const now = toneContext.currentTime;
  const noteDuration = Math.max(duration, 0.24);
  for (const [partial, volume] of [[1, 0.024], [2, 0.004]]) {
    const oscillator = toneContext.createOscillator();
    const gain = toneContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * partial, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * partial * 1.018, now + noteDuration * 0.7);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + noteDuration);
    oscillator.connect(gain).connect(toneContext.destination);
    oscillator.start(now);
    oscillator.stop(now + noteDuration + 0.03);
  }
}

function setToggleState(button, enabled, onLabel, offLabel, onAria, offAria) {
  button.setAttribute("aria-pressed", String(enabled));
  button.setAttribute("aria-label", enabled ? offAria : onAria);
  button.querySelector(".toggle-label").textContent = enabled ? onLabel : offLabel;
  button.classList.toggle("is-active", enabled);
}

const ambientMusic = $("ambientMusic");
let musicFadeId = 0;
function fadeAmbientMusic(targetVolume, pauseWhenQuiet = false) {
  cancelAnimationFrame(musicFadeId);
  const startVolume = ambientMusic.volume;
  const startedAt = performance.now();
  const duration = 750;
  const fade = (now) => {
    const amount = Math.min(1, (now - startedAt) / duration);
    const eased = amount * amount * (3 - 2 * amount);
    ambientMusic.volume = startVolume + (targetVolume - startVolume) * eased;
    if (amount < 1) musicFadeId = requestAnimationFrame(fade);
    else if (pauseWhenQuiet) ambientMusic.pause();
  };
  musicFadeId = requestAnimationFrame(fade);
}
$("musicToggle").addEventListener("click", async () => {
  const enabled = $("musicToggle").getAttribute("aria-pressed") !== "true";
  if (enabled) {
    ambientMusic.volume = 0;
    try {
      await ambientMusic.play();
      fadeAmbientMusic(0.52);
      setToggleState($("musicToggle"), true, "Music on", "Music off", "Turn ambient music on", "Turn ambient music off");
    } catch {
      setToggleState($("musicToggle"), false, "Music on", "Music off", "Turn ambient music on", "Turn ambient music off");
      $("musicToggle").querySelector(".toggle-label").textContent = "Music unavailable";
    }
  } else {
    fadeAmbientMusic(0, true);
    setToggleState($("musicToggle"), false, "Music on", "Music off", "Turn ambient music on", "Turn ambient music off");
  }
});

$("soundToggle").addEventListener("click", () => {
  stepSoundsEnabled = !stepSoundsEnabled;
  setToggleState($("soundToggle"), stepSoundsEnabled, "Sound on", "Sound off", "Turn step sounds on", "Turn step sounds off");
});

$("themeToggle").addEventListener("click", () => {
  dayTheme = !dayTheme;
  document.body.dataset.theme = dayTheme ? "day" : "dusk";
  $("worldScene").querySelectorAll('img[src*="_dusk"], img[src*="_day"]').forEach((image) => {
    image.src = image.src.replace(/_(dusk|day)\.webp$/, `_${dayTheme ? "day" : "dusk"}.webp`);
  });
  setToggleState($("themeToggle"), dayTheme, "Daylight", "Starlight", "Switch to daylight", "Switch to starlight");
  worldExperience?.setTheme(dayTheme);
});

function applyMotionState() {
  document.body.dataset.motion = motionEnabled ? "on" : "off";
  setToggleState($("motionToggle"), motionEnabled, "Motion on", "Motion off", "Turn ambient motion on", "Turn ambient motion off");
  moveSceneToState();
  worldExperience?.setMotion(motionEnabled);
}

$("motionToggle").addEventListener("click", () => {
  motionEnabled = !motionEnabled;
  applyMotionState();
});
applyMotionState();

function startWorldMotion() {
  const canvas = $("worldParticles");
  const context = canvas.getContext("2d");
  if (!context) return;
  const atlas = new Image();
  atlas.src = "assets/floating-world/webp/particles/particle_atlas.webp";
  const layers = [...document.querySelectorAll(".world-layer")];
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let guidePosition = 0;
  let particles = [];
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.dataset.ratio = String(ratio);
    particles = Array.from({ length: 56 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: (8 + Math.random() * 21) * ratio,
      frame: [3, 4, 5, 6, 7][Math.floor(Math.random() * 5)],
      speed: (0.08 + Math.random() * 0.2) * ratio,
      alpha: 0.22 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
    }));
  };
  resize();
  window.addEventListener("resize", () => { resize(); moveSceneToState(); }, { passive: true });
  window.addEventListener("pointermove", (event) => {
    targetX = (event.clientX / window.innerWidth - 0.5) * 2;
    targetY = (event.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  atlas.onload = () => {
    const frame = (time) => {
      if (document.getElementById("worldScene")?.classList.contains("world-3d-ready")) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const ratio = Number(canvas.dataset.ratio || 1);
      const cameraElement = $("worldCamera");
      context.clearRect(0, 0, canvas.width, canvas.height);
      currentX += (targetX - currentX) * 0.035;
      currentY += (targetY - currentY) * 0.035;
      if (motionEnabled) {
        sceneCamera.x += (sceneCamera.targetX - sceneCamera.x) * 0.045;
        sceneCamera.y += (sceneCamera.targetY - sceneCamera.y) * 0.045;
        sceneCamera.zoom += (sceneCamera.targetZoom - sceneCamera.zoom) * 0.035;
      } else {
        sceneCamera.x = sceneCamera.targetX;
        sceneCamera.y = sceneCamera.targetY;
        sceneCamera.zoom = sceneCamera.targetZoom;
      }
      cameraElement.style.transform = `translate3d(${sceneCamera.x}px, ${sceneCamera.y}px, 0) scale(${sceneCamera.zoom})`;
      if (motionEnabled) {
        layers.forEach((layer) => {
          const depth = Number(layer.dataset.depth || 0);
          layer.style.transform = `translate3d(${-currentX * depth * 580}px, ${-currentY * depth * 580}px, 0)`;
        });
      } else {
        layers.forEach((layer) => { layer.style.transform = "translate3d(0, 0, 0)"; });
      }
      for (const particle of particles) {
        if (motionEnabled) {
          particle.y -= particle.speed * 2.2;
          particle.x += Math.sin(time / 1600 + particle.phase) * 0.28 * ratio;
          if (particle.y < -particle.size) particle.y = canvas.height + particle.size;
        }
        context.globalAlpha = particle.alpha * (motionEnabled ? 0.65 + 0.35 * Math.sin(time / 760 + particle.phase) : 0.6);
        context.drawImage(atlas, particle.frame * 128, 0, 128, 128,
          particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      }

      const values = executionMode.startsWith("lean")
        ? []
        : response?.inputItems?.length ? response.inputItems : example.preview;
      if (values?.length) {
        const width = canvas.width / ratio;
        const height = canvas.height / ratio;
        const anchor = sceneAnchors[example.id] || sceneAnchors.custom;
        const { x: anchorX, y: anchorY } = anchor;
        const gap = Math.min(76, width * 0.085);
        const points = values.map((value, index) => ({
          x: width * anchorX + (index - (values.length - 1) / 2) * gap,
          y: height * anchorY + Math.sin(index * 1.25) * Math.min(18, height * 0.025),
          value: String(value),
        }));
        const requestedTarget = response?.activeIndex >= 0
          ? response.activeIndex
          : Math.max(0, (response?.stepCount || 0) - 1);
        const activeTarget = Math.min(points.length - 1, requestedTarget);
        guidePosition += ((response?.error ? 0 : activeTarget) - guidePosition) * (motionEnabled ? 0.055 : 1);

        context.save();
        context.lineWidth = 2 * ratio;
        context.setLineDash([5 * ratio, 8 * ratio]);
        context.strokeStyle = "rgba(255, 232, 174, .42)";
        context.shadowColor = "rgba(255, 224, 151, .8)";
        context.shadowBlur = 12 * ratio;
        context.beginPath();
        points.forEach((point, index) => index ? context.lineTo(point.x * ratio, point.y * ratio) : context.moveTo(point.x * ratio, point.y * ratio));
        context.stroke();
        context.setLineDash([]);
        points.forEach((point, index) => {
          const px = point.x * ratio;
          const py = point.y * ratio;
          const done = index < (response?.outputItems?.length || 0);
          context.beginPath();
          context.arc(px, py, 5 * ratio, 0, Math.PI * 2);
          context.fillStyle = done ? "rgba(255, 239, 193, .9)" : "rgba(211, 216, 245, .44)";
          context.fill();
          context.font = `500 ${11 * ratio}px 'DM Mono', monospace`;
          context.textAlign = "center";
          context.fillStyle = "rgba(255, 250, 235, .94)";
          context.shadowBlur = 7 * ratio;
          context.fillText(point.value, px, py - 14 * ratio);
          const output = response?.outputItems?.[index];
          if (output !== undefined && output !== "") {
            context.fillStyle = "rgba(255, 232, 174, .9)";
            context.fillText(String(output), px, py + 21 * ratio);
          }
        });
        const lower = Math.floor(guidePosition);
        const upper = Math.min(points.length - 1, lower + 1);
        const blend = guidePosition - lower;
        const guideX = (points[lower].x + (points[upper].x - points[lower].x) * blend) * ratio;
        const guideY = (points[lower].y + (points[upper].y - points[lower].y) * blend) * ratio;
        const glow = context.createRadialGradient(guideX, guideY, 2 * ratio, guideX, guideY, 35 * ratio);
        glow.addColorStop(0, "rgba(255, 255, 235, .98)");
        glow.addColorStop(0.18, "rgba(255, 226, 154, .82)");
        glow.addColorStop(1, "rgba(255, 201, 116, 0)");
        context.globalAlpha = 0.85 + 0.15 * Math.sin(time / 430);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(guideX, guideY, 35 * ratio, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.restore();
      } else if (response) {
        const width = canvas.width / ratio;
        const height = canvas.height / ratio;
        const anchor = sceneAnchors[example.id] || sceneAnchors.custom;
        const textX = width * anchor.x;
        const textY = height * anchor.y;
        const title = response?.error ? "The path needs another look" : executionMode.startsWith("lean")
          ? (response.stdout || response.output || "Lean accepted the program")
          : (response.expressionText || activeSource);
        const text = String(title).replace(/\s+/g, " ").trim();
        const roomToEdge = Math.max(130, 2 * Math.min(textX, width - textX) - 32);
        const maxWidth = Math.min(width * 0.5, roomToEdge, 520);
        context.save();
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = `500 ${15 * ratio}px 'DM Mono', monospace`;
        context.shadowColor = "rgba(255, 224, 151, .72)";
        context.shadowBlur = 17 * ratio;
        context.fillStyle = response?.error ? "rgba(255, 205, 192, .95)" : "rgba(255, 250, 235, .96)";
        let line = "";
        let lineIndex = 0;
        for (const word of text.split(" ")) {
          const candidate = line ? `${line} ${word}` : word;
          if (context.measureText(candidate).width > maxWidth * ratio && line) {
            context.fillText(line, textX * ratio, (textY + lineIndex * 23) * ratio);
            line = word;
            lineIndex += 1;
          } else line = candidate;
        }
        if (line) context.fillText(line, textX * ratio, (textY + lineIndex * 23) * ratio);
        context.restore();
      }
      context.globalAlpha = 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
}

startWorldMotion();

$("sourceEditor").value = activeSource;
$("runButton").addEventListener("click", runProgram);
$("nextButton").addEventListener("click", advance);
$("previousButton").addEventListener("click", rewind);
$("resetButton").addEventListener("click", reset);
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (event.key === "ArrowRight") { event.preventDefault(); advance(); }
  if (event.key === "ArrowLeft") { event.preventDefault(); rewind(); }
  if (event.key.toLowerCase() === "r") reset();
});

render();
worldExperience = createWorldExperience({ canvas: $("worldThree"), labels: $("worldLabels") });
worldExperience?.setTheme(dayTheme);
worldExperience?.setMotion(motionEnabled);
worldExperience?.setState({
  lessonId: example.id, stepCount: 0, activeIndex: -1, inputItems: example.preview,
  outputItems: [], accumulatorText: "", expressionText: example.source, done: false, error: false, mode: "subset",
});

const mapToggle = $("mapToggle");
const constellationMap = $("constellationMap");
function setMapOpen(open) {
  const isOpen = Boolean(open);
  constellationMap.hidden = !isOpen;
  mapToggle.setAttribute("aria-expanded", String(isOpen));
  mapToggle.setAttribute("aria-label", isOpen ? "Close constellation map" : "Open constellation map");
  mapToggle.classList.toggle("is-active", isOpen);
  worldExperience?.setOverview(isOpen);
}
mapToggle.addEventListener("click", () => setMapOpen(constellationMap.hidden));
$("mapClose").addEventListener("click", () => setMapOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !constellationMap.hidden) setMapOpen(false);
});
document.querySelectorAll(".map-star").forEach((star) => {
  star.addEventListener("click", () => {
    const id = star.dataset.island;
    if (!examples.some((item) => item.id === id)) return;
    setMapOpen(false);
    selectExample(id);
  });
});

let pointerDrag = null;
const dragBlockSelector = "button,a,input,textarea,select,summary,[contenteditable='true'],.constellation-map";
window.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0 || event.target.closest(dragBlockSelector)) return;
  pointerDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  document.body.classList.add("is-looking");
  event.preventDefault();
}, { passive: false });
window.addEventListener("pointermove", (event) => {
  if (pointerDrag?.id === event.pointerId) {
    const dx = event.clientX - pointerDrag.x, dy = event.clientY - pointerDrag.y;
    worldExperience?.rotateView(dx, dy);
    pointerDrag.x = event.clientX; pointerDrag.y = event.clientY;
  }
}, { passive: true });
const stopLooking = (event) => {
  if (pointerDrag?.id !== event.pointerId) return;
  pointerDrag = null;
  document.body.classList.remove("is-looking");
};
window.addEventListener("pointerup", stopLooking, { passive: true });
window.addEventListener("pointercancel", stopLooking, { passive: true });
