# Lean Stepper

A browser teaching tool for a small, Lean-style functional language. It parses a constrained set of Lean-like expressions and advances one reduction at a time. List mapping lights the input being transformed; a left fold shows the current item and accumulator.

This is a teaching subset, not a Lean implementation. It does not type-check Lean, run tactics, or accept arbitrary Lean files.

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

The examples live in `app.js`. The lexer, parser, syntax tree, evaluator, and UI adapter are in `src/LeanSubset/`. Evaluation uses a left-to-right, call-by-value small-step strategy.

## Project stages

1. Lean-subset lexer with source spans.
2. Parser and syntax tree.
3. Small-step evaluation for lets, functions, arithmetic, `List.map`, and `List.foldl`.
4. Browser visualization and step controls.
5. Documentation and cleanup.
