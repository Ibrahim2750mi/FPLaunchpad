# Lean Stepper

A browser teaching tool that steps through a Lean-style subset and runs other code with Lean 4. In subset mode, each reduction advances one step; list mapping lights the input being transformed, and a left fold shows the current item and accumulator.

Programs in the stepper subset are reduced one step at a time. When code falls outside that subset, the app runs it with Lean 4 compiled to WebAssembly and tags the result as **ACTUAL LEAN 4**. For that fallback, the viewer generates a syntax-based overview and explains the constructs it recognized; that overview is not a Lean evaluation trace.

## Run locally

```sh
npm install
npm run build
npm run serve
```

Open `http://localhost:8001`.

## Supported syntax

- Natural number literals and lists, such as `[1, 2, 3]`
- `let name := value; body`
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
