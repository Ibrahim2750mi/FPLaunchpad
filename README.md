# Proof Player

A browser prototype for the Functional Programming Track's Proof Player idea. It steps through three short, Lean-inspired examples and updates a visualization at each step. The examples are teaching scripts; this prototype does not parse or execute Lean files.

## Run it

Install the project dependencies and build the PureScript engine, then serve the folder over HTTP:

```sh
npm install
npm run build
npm run serve
```

Open `http://localhost:8001`. Without the build step, the page still opens as a visual preview, but the graph proof uses its JavaScript fallback instead of the PureScript engine.

## Project milestones

1. **Interactive shell and proof samples** — workspace layout, step controls, keyboard navigation, and graph/list/goal visualizations. (Complete.)
2. **PureScript proof engine** — typed graph proof steps and pure state transitions are in `src/ProofPlayer.purs`; the graph sample uses them through the generated module. (Core connected and build verified.)
3. **More PureScript proof models** — move the list and goal samples into typed state transitions, then add useful feedback for invalid steps.
4. **Polish and accessibility** — verify responsive behavior, keyboard and screen-reader flows, and refine examples and explanatory copy.

The initial supported examples are intentionally constrained. The project should describe itself as Lean-inspired until it can read and validate actual Lean input.
