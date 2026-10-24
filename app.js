const examples = [
  {
    id: "map", file: "map_values.lean", title: "Map each value",
    description: "Watch a function transform each list item in turn.", kind: "map", preview: ["1", "2", "3"],
    source: "#eval let xs := [1, 2, 3]; let double := fun x => x * 2; List.map double xs",
  },
  {
    id: "fold", file: "fold_a_list.lean", title: "Fold a list",
    description: "Follow the accumulator as it combines each item.", kind: "fold", preview: ["1", "2", "3"],
    source: "#eval List.foldl (fun acc x => acc + x) 0 [1, 2, 3]",
  },
  {
    id: "let", file: "let_and_numbers.lean", title: "Reduce a let expression",
    description: "Substitute names, then reduce the arithmetic.", kind: "scalar", preview: [],
    source: "#eval let x := 4; let y := x + 1; y * 2",
  },
  {
    id: "function", file: "define_a_function.lean", title: "Call a function",
    description: "Unfold a definition and reduce its function body.", kind: "scalar", preview: [],
    source: "def square := fun x => x * x\n#eval square 4",
  },
];

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
    <div class="sample-item ${item.id === example.id ? "active" : ""}" role="button" tabindex="0" data-id="${item.id}">
      <span class="sample-icon">${item.kind === "map" ? "↗" : item.kind === "fold" ? "Σ" : item.kind === "let" ? "λ" : "ƒ"}</span>${item.file}
    </div>`).join("");
  $("sampleList").querySelectorAll(".sample-item").forEach((item) => {
    item.addEventListener("click", () => selectExample(item.dataset.id));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectExample(item.dataset.id);
      }
    });
  });
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

function runtimeTag() {
  if (executionMode === "lean") return "LEAN 4 · ACTUAL";
  if (executionMode === "lean-loading") return "LEAN 4 · LOADING";
  if (executionMode === "lean-unavailable") return "LEAN 4 · UNAVAILABLE";
  if (executionMode === "checking") return "CHECKING CODE";
  return engine ? "STEP SUBSET" : "LOADING";
}

function render() {
  renderSamples();
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
  $("goalText").textContent = response?.mode === "lean"
    ? (response.error ? "Lean 4 reported an error" : response.stdout || "Lean 4 accepted this program")
    : response?.expressionText || activeSource;
  $("goalState").textContent = response?.error ? "Error" : executionMode === "lean" ? "Lean 4" : response?.done ? "Complete" : response?.stepCount ? "Reducing" : "Ready";
  $("goalState").classList.toggle("error", Boolean(response?.error));
  $("goalState").classList.toggle("solved", Boolean(response?.done && !response?.error));
  if (executionMode === "lean") $("runtimeMessage").textContent = "Ran by actual Lean 4 · view generated from syntax cues";
  else if (executionMode === "lean-unavailable") $("runtimeMessage").textContent = "Lean 4 could not start · check network access and COOP/COEP server headers";
  else if (executionMode === "subset") $("runtimeMessage").textContent = "Supported code steps locally · unsupported Lean runs in Lean 4";
  else if (executionMode !== "lean-loading") $("runtimeMessage").textContent = engineError || "Edit the code, then run it.";
  renderCode();
  renderVisual();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

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
