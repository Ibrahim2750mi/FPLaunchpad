const examples = [
  {
    id: "map",
    file: "map_values.lean",
    title: "Map each value",
    description: "Watch a function transform each list item in turn.",
    kind: "map",
    preview: ["1", "2", "3"],
    source: "#eval let xs := [1, 2, 3]; let double := fun x => x * 2; List.map double xs",
  },
  {
    id: "fold",
    file: "fold_a_list.lean",
    title: "Fold a list",
    description: "Follow the accumulator as it combines each item.",
    kind: "fold",
    preview: ["1", "2", "3"],
    source: "#eval List.foldl (fun acc x => acc + x) 0 [1, 2, 3]",
  },
  {
    id: "let",
    file: "let_and_numbers.lean",
    title: "Reduce a let expression",
    description: "Substitute names, then reduce the arithmetic.",
    kind: "scalar",
    preview: [],
    source: "#eval let x := 4; let y := x + 1; y * 2",
  },
  {
    id: "function",
    file: "define_a_function.lean",
    title: "Call a function",
    description: "Unfold a definition and reduce its function body.",
    kind: "scalar",
    preview: [],
    source: "def square := fun x => x * x\n#eval square 4",
  },
];

const $ = (id) => document.getElementById(id);
let example = examples[0];
let engine = null;
let response = null;
let history = [];
let engineError = "";

import("./dist/lean-stepper.js").then((module) => {
  engine = module;
  startExample();
}).catch(() => {
  engineError = "Build the PureScript interpreter to enable evaluation.";
  render();
});

function selectExample(id) {
  const next = examples.find((item) => item.id === id);
  if (!next || next.id === example.id) return;
  example = next;
  startExample();
}

function startExample() {
  history = [];
  response = engine ? engine.startForUi(example.source) : null;
  render();
}

function advance() {
  if (!engine || !response || response.done || response.error) return;
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
  if (!history.length) return;
  response = history.pop();
  render();
}

function reset() { startExample(); }

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
  const source = example.source;
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

function renderVisual() {
  if (example.kind === "map") $("visualStage").innerHTML = renderMapVisual();
  else if (example.kind === "fold") $("visualStage").innerHTML = renderFoldVisual();
  else {
    const value = response?.expressionText || "?";
    $("visualStage").innerHTML = `<div class="eval-visual"><div class="eval-operation">Current value</div><div class="eval-scalar">${escapeHtml(value)}</div></div>`;
  }
  $("visualCaption").textContent = response?.note || (engineError || "One reduction at a time");
  $("stepDots").innerHTML = Array.from({ length: 5 }, (_, index) => `<i class="step-dot ${index < (response?.stepCount || 0) % 6 ? "done" : ""}"></i>`).join("");
}

function render() {
  renderSamples();
  $("proofTitle").textContent = example.title;
  $("proofDescription").textContent = example.description;
  $("fileName").textContent = example.file;
  $("stepCounter").textContent = `Reduction ${response?.stepCount || 0}`;
  $("progressFill").style.width = response?.done ? "100%" : `${Math.min(88, 6 + (response?.stepCount || 0) * 7)}%`;
  $("progressPercent").textContent = response?.done ? "Normal form reached" : response?.stepCount ? "Stepping through expression" : "Ready to reduce";
  $("nextLabel").textContent = response?.done ? "Complete" : response?.stepCount ? "Next reduction" : "Reduce once";
  $("nextButton").disabled = !engine || !response || response.done || Boolean(response.error);
  $("previousButton").disabled = history.length === 0;
  $("resetButton").disabled = !engine;
  $("codeStatus").textContent = response?.error ? response.error : engine ? (response?.done ? "Evaluation complete" : "Lean subset interpreter · ready") : engineError || "Loading interpreter…";
  $("parserStatus").textContent = response?.error ? "ERROR" : engine ? "READY" : "LOADING";
  $("parserStatus").classList.toggle("parser-badge-error", Boolean(response?.error));
  $("goalText").textContent = response?.expressionText || example.source;
  $("goalState").textContent = response?.error ? "Error" : response?.done ? "Complete" : response?.stepCount ? "Reducing" : "Ready";
  $("goalState").classList.toggle("error", Boolean(response?.error));
  $("goalState").classList.toggle("solved", Boolean(response?.done && !response?.error));
  renderCode();
  renderVisual();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

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
