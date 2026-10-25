# Lean Stepper

A browser teaching tool that steps through a Lean-style subset and runs other code with Lean 4. In subset mode, each reduction advances one step; list mapping lights the input being transformed, and a left fold shows the current item and accumulator.

The interface uses four procedural, vertex-coloured 3D island models and an animated guide light. The WebGL scene follows the current reduction through lesson-specific paths; values and outputs appear at their world anchors while the camera flies toward the active island. Adventure mode places those models along a deterministic, expanding route and keeps a forest of smaller, unmarked isles around the journey, so every reduction can travel to a fresh destination without replacing the world. The generated models are CC0 and can be rebuilt with `npm run build:assets`. The supplied illustrated sky and optional ambient track remain as the scene backdrop and music.

The experience opens through `portal-transition.html`, a cinematic portal guide that introduces the teaching interpreter, reduction trace, and live viewer before revealing the world. Its soundtrack control lives on the opening scene; the portal hands playback to the world audio when enabled.

Programs in the stepper subset are reduced one step at a time. When code falls outside that subset, the app runs it with Lean 4 compiled to WebAssembly and tags the result as **ACTUAL LEAN 4**. For that fallback, the viewer generates a syntax-based overview and explains the constructs it recognized; that overview is not a Lean evaluation trace.

## Run locally

```sh
npm install
npm run build
npm run serve
```

Open `http://localhost:8001`.

## Licensing

Project source is licensed under GPL-3.0-only; bundled art, runtime/build dependencies, and externally loaded fonts have separate notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The ambient music and site icon still need verified source/license information before redistribution; see that notice file.

## Supported syntax

- Natural number literals and lists, such as `[1, 2, 3]`
- Indentation-style `let` bindings on separate lines, followed by the body on its own line
- `fun x => body` and top-level `def name := expression`
- Function application and `+`, `-`, `*`
- `#eval expression`
- `List.map function values` and `List.foldl function initial values`

The examples live in `app.js`. The lexer, parser, syntax tree, evaluator, and UI adapter are in `src/LeanSubset/`. Subset evaluation uses a left-to-right, call-by-value small-step strategy.

Lean 4 fallback needs internet access the first time it runs. It downloads a large WebAssembly runtime (around 300 MB according to [lean4.js](https://github.com/timqian/lean4.js)) and caches the files in the browser for later runs. The included local server sends the cross-origin isolation headers required by that runtime; configure the same headers when hosting the app elsewhere.

## Project stages

1. Lean-subset lexer with source spans.
2. Parser and syntax tree.
3. Small-step evaluation for lets, functions, arithmetic, `List.map`, and `List.foldl`.
4. Browser visualization and step controls.
5. Documentation and cleanup.
