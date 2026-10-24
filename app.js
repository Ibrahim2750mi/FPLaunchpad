const proofs = [
  {
    id: "graph", file: "reach_destination.lean", title: "Reach the destination",
    description: "A graph grows one connection at a time.", kind: "graph",
    goal: "Prove that a path connects <b>A</b> to <b>D</b>.",
    start: "The starting state",
    lines: [
      { code: "theorem reach_destination : Path A D := by", caption: "We begin with the path goal." },
      { code: "  have h₁ : Edge A B := edge_ab", op: "edge", edge: ["A", "B"], caption: "First, establish the connection from A to B." },
      { code: "  have h₂ : Edge B C := edge_bc", op: "edge", edge: ["B", "C"], caption: "Then connect B to C." },
      { code: "  have h₃ : Edge C D := edge_cd", op: "edge", edge: ["C", "D"], caption: "One more edge reaches the final stretch." },
      { code: "  exact Path.trans (Path.trans h₁ h₂) h₃", op: "solve", caption: "Compose the edges. A path from A to D is complete." },
    ],
  },
  {
    id: "list", file: "sort_a_list.lean", title: "Put the list in order",
    description: "Watch each swap move an element into place.", kind: "list",
    goal: "Show that <b>[3, 1, 2]</b> is sorted by repeated swaps.", start: "The original list",
    lines: [
      { code: "theorem sort_example : Sorts [3, 1, 2] [1, 2, 3] := by", caption: "Our goal is to transform the list into sorted order." },
      { code: "  apply Swap.first", op: "swap", at: 0, caption: "Swap the first out-of-order pair." },
      { code: "  apply Swap.second", op: "swap", at: 1, caption: "Move 3 past 2." },
      { code: "  exact Swap.refl", op: "solve", caption: "The list is sorted. The goal is solved." },
    ],
  },
  {
    id: "goal", file: "simplify_goal.lean", title: "Shrink the goal",
    description: "Follow a statement simplify into its conclusion.", kind: "goal",
    goal: "Prove that <b>n + 0 = n</b> for every natural number n.", start: "The original goal",
    lines: [
      { code: "theorem add_zero (n : Nat) : n + 0 = n := by", caption: "We need to show that adding zero leaves n unchanged." },
      { code: "  induction n with", op: "goal", text: "Base case: 0 + 0 = 0", caption: "Induction splits the goal into a base case and a successor case." },
      { code: "  | zero => rfl", op: "goal", text: "Successor case: k + 1 + 0 = k + 1", caption: "The base case is immediate; now consider the successor." },
      { code: "  | succ k ih => simpa [Nat.add_succ, ih]", op: "solve", caption: "Use the induction hypothesis. Both cases are done." },
    ],
  },
];

const $ = (id) => document.getElementById(id);
let proof = proofs[0];
let step = 0;
let toastTimer;
let proofCore = null;
let proofCoreError = null;

// The page remains a static preview before dependencies are installed.
// After `npm run build`, graph playback is driven by the PureScript module.
import("./dist/proof-core.js").then((core) => {
  proofCore = core;
  render();
}).catch(() => {
  proofCoreError = "PureScript bundle is missing; run npm install, then npm run build.";
  render();
});

function renderSamples() {
  $("sampleList").innerHTML = proofs.map((p) => `
    <div class="sample-item ${p.id === proof.id ? "active" : ""}" role="button" tabindex="0" data-id="${p.id}">
      <span class="sample-icon">${p.kind === "graph" ? "⌘" : p.kind === "list" ? "☷" : "◇"}</span>${p.file}
    </div>`).join("");
  $("sampleList").querySelectorAll(".sample-item").forEach((item) => {
    const select = () => selectProof(item.dataset.id);
    item.addEventListener("click", select);
    item.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
  });
}

function renderCode() {
  const rows = [{ code: "-- A tiny proof, made visible", comment: true }, ...proof.lines];
  $("codeBody").innerHTML = rows.map((line, i) => {
    const proofIndex = i - 1;
    const cls = proofIndex === step ? "current" : proofIndex >= 0 && proofIndex < step ? "completed" : "";
    return `<div class="code-line ${cls}" data-line="${i}"><span class="line-number">${String(i + 1).padStart(2, "0")}</span><span class="line-content">${highlight(line.code, line.comment)}</span></div>`;
  }).join("");
  const active = $("codeBody").querySelector(".current");
  if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function highlight(code, comment = false) {
  if (comment) return `<span class="comment">${escapeHtml(code)}</span>`;
  const escaped = escapeHtml(code);
  return escaped.replace(/\b(theorem|have|by|apply|exact|with|induction|simpa)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(Path|Edge|Sorts|Nat)\b/g, '<span class="type">$1</span>')
    .replace(/\b(edge_ab|edge_bc|edge_cd|Path\.trans|Swap\.first|Swap\.second|Swap\.refl|rfl)\b/g, '<span class="fn">$1</span>');
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderGraph() {
  const nodes = { A: [12, 48], B: [37, 24], C: [63, 72], D: [88, 43] };
  const activeEdges = graphEdgesForCurrentStep();
  const visited = new Set(activeEdges.flat());
  const solved = proofCore ? Boolean(currentGraphState()?.solved) : step >= proof.lines.length;
  const edgeMarkup = [["A", "B"], ["B", "C"], ["C", "D"]].map(([a,b]) => {
    const active = activeEdges.some(([x,y]) => x === a && y === b);
    return `<line class="${active ? "active-edge" : ""}" x1="${nodes[a][0]}%" y1="${nodes[a][1]}%" x2="${nodes[b][0]}%" y2="${nodes[b][1]}%"/>`;
  }).join("");
  const nodeMarkup = Object.entries(nodes).map(([name, [x,y]]) => {
    const isCurrent = (step <= 1 && name === "A") || (step === 2 && name === "B") || (step === 3 && name === "C") || (step >= 4 && name === "D");
    return `<div class="graph-node ${visited.has(name) ? "visited" : ""} ${name === "D" ? "destination" : ""} ${isCurrent ? "current-node" : ""}" style="left:${x}%;top:${y}%">${name}<span class="node-label">${name === "D" ? "destination" : `node ${name}`}</span></div>`;
  }).join("");
  return `<div class="graph-view"><svg class="graph-edges" viewBox="0 0 100 100" preserveAspectRatio="none">${edgeMarkup}</svg>${nodeMarkup}</div>${solved ? "<div class='visual-solved'>PATH FOUND</div>" : ""}`;
}

function currentGraphState() {
  if (!proofCore) return null;
  const actionCount = Math.max(0, Math.min(step - 1, proofCore.reachDestination.length));
  let cursor = { index: 0, state: proofCore.initialState };
  for (let i = 0; i < actionCount; i += 1) {
    const result = proofCore.runNextForUi(proofCore.reachDestination)(cursor);
    if (result.error) break;
    cursor = { index: result.index, state: result.state };
  }
  return cursor.state;
}

function graphEdgesForCurrentStep() {
  const state = currentGraphState();
  if (state) return state.edges.map(({ from, to }) => [from, to]);
  return proof.lines.slice(1, step + 1).filter((line) => line.edge).map((line) => line.edge);
}

function renderList() {
  let values = [3, 1, 2];
  const swaps = proof.lines.slice(1, step + 1).filter((line) => line.op === "swap");
  swaps.forEach(({ at }) => { [values[at], values[at + 1]] = [values[at + 1], values[at]]; });
  const solved = step >= proof.lines.length;
  return `<div class="list-view">${values.map((value, i) => `<div class="list-box ${swaps.length && i <= swaps.length ? "sorted" : ""} ${step === 1 && i < 2 || step === 2 && i > 0 ? "focus" : ""}">${value}<span class="list-label">index ${i}</span></div>${i < values.length - 1 ? "<span class='list-arrow'>→</span>" : ""}`).join("")}</div>${solved ? "<div class='visual-solved'>SORTED ✓</div>" : ""}`;
}

function renderGoal() {
  const messages = ["n + 0 = n", "Base case: 0 + 0 = 0", "Successor case: k + 1 + 0 = k + 1"];
  const solved = step >= proof.lines.length;
  const index = Math.min(Math.max(step - 1, 0), messages.length - 1);
  return `<div class="goal-visual"><div class="goal-equation"><span class="dim">⊢ </span><span class="${step ? "highlight" : ""}">${escapeHtml(messages[index])}</span></div>${step > 0 ? `<div class="goal-arrow"></div><div class="goal-result">${solved ? "✓ All cases proved" : escapeHtml(messages[index])}</div>` : ""}</div>`;
}

function renderVisual() {
  const solved = step >= proof.lines.length;
  $("visualStage").innerHTML = proof.kind === "graph" ? renderGraph() : proof.kind === "list" ? renderList() : renderGoal();
  const currentLine = proof.lines[step - 1];
  $("visualCaption").textContent = solved ? "Proof complete" : currentLine?.caption || proof.start;
  $("goalText").innerHTML = proof.goal;
  $("goalState").textContent = solved ? "Proved ✓" : step ? "In progress" : "Not started";
  $("goalState").classList.toggle("solved", solved);
  $("codeStatus").textContent = solved
    ? "All goals accomplished"
    : proof.id === "graph" && !proofCore
      ? (proofCoreError || "Loading PureScript proof engine…")
      : proof.id === "graph"
        ? (step ? "PureScript engine · proof running" : "PureScript engine · ready")
        : (step ? "Proof running · 1 goal remaining" : "Proof ready to run");
  $("stepDots").innerHTML = proof.lines.map((_, i) => `<i class="step-dot ${i < step ? "done" : ""}"></i>`).join("");
}

function render() {
  $("proofTitle").textContent = proof.title;
  $("proofDescription").textContent = proof.description;
  $("fileName").textContent = proof.file;
  $("stepCounter").textContent = `Step ${step}`;
  $("stepTotal").textContent = proof.lines.length;
  const solved = step >= proof.lines.length;
  const percent = Math.round((step / proof.lines.length) * 100);
  $("progressFill").style.width = `${percent}%`;
  $("progressPercent").textContent = solved ? "Proof complete ✳" : step ? `${percent}% complete` : "Ready to begin";
  $("nextLabel").textContent = solved ? "Completed" : step ? "Next step" : "Begin proof";
  $("nextButton").disabled = solved;
  renderSamples(); renderCode(); renderVisual();
}

function selectProof(id) {
  const selected = proofs.find((p) => p.id === id);
  if (!selected || selected.id === proof.id) return;
  proof = selected; step = 0; render();
}
function advance() { if (step < proof.lines.length) { step += 1; render(); } }
function rewind() { if (step > 0) { step -= 1; render(); } }
function reset() { step = 0; render(); }
function showToast(message) {
  const toast = $("toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

$("nextButton").addEventListener("click", advance);
$("resetButton").addEventListener("click", reset);
$("copyLink").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); showToast("Proof player link copied"); }
  catch { showToast("Copy the page address to share this proof player"); }
});
$("addSample").addEventListener("click", () => showToast("More proof samples are coming soon"));
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (event.key === "ArrowRight") { event.preventDefault(); advance(); }
  if (event.key === "ArrowLeft") { event.preventDefault(); rewind(); }
  if (event.key.toLowerCase() === "r") reset();
});
render();
