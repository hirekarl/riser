# Vitest

Official docs: https://vitest.dev/config/, https://vitest.dev/guide/coverage

## Syntax / Usage Cheatsheet

- Two valid config locations: a `test` block inside `vite.config.ts` (add `/// <reference types="vitest/config" />` at the top for types), or a separate `vitest.config.ts` — if both exist, the standalone `vitest.config.ts` takes priority and fully overrides (not merges with) the `test` block in `vite.config.ts`.
- `import { defineConfig } from 'vitest/config'` (not `'vite'`) when writing a standalone `vitest.config.ts`, to get the `test` key typed correctly.
- Common `test` keys: `environment` (`"node"` default, `"jsdom"` for DOM/React component tests), `globals` (expose `describe`/`it`/`expect` without importing them), `setupFiles`, `globalSetup`, `testTimeout`, `hookTimeout`, `retry`, `reporters`.
- Enable coverage: `test: { coverage: { enabled: true, provider: 'v8' } }` or via CLI `vitest run --coverage`.
- Coverage provider choice: `v8` (default, native V8 coverage, faster, lower memory — as of v3.2.0 uses AST-based remapping for Istanbul-level accuracy) vs `istanbul` (pre-instruments source, works on any JS runtime, useful if V8-specific coverage quirks appear).
- Coverage thresholds go under `test.coverage.thresholds`, with keys `lines`, `functions`, `branches`, `statements` — per-file thresholds are configured separately from the global ones in the same `thresholds` object.
- Run tests: `vitest` (watch mode by default in dev), `vitest run` (single pass, CI mode).

## Project-Specific Gotchas

- **This repo has Vitest configured in `frontend/vite.config.ts`.** `frontend/package.json` includes `vitest`, `@testing-library/react`, `jsdom`, `@vitest/coverage-v8`, and `vitest-axe`. `vite.config.ts` includes `/// <reference types="vitest/config" />`, `environment: "jsdom"`, `setupFiles: "./src/test/setup.ts"`, and strict 90% coverage thresholds (`lines: 90, functions: 90, branches: 90, statements: 90`).
- React 19 component tests need `environment: "jsdom"` (or `"happy-dom"`) — the Vitest default (`"node"`) has no `document`/`window`, so any test importing a component will fail with unhelpful `ReferenceError: document is not defined` errors until `environment` is set.
- `frontend/tsconfig.app.json` sets `"types": ["vite/client"]` only — adding Vitest's `globals: true` option requires also adding `"vitest/globals"` to that `types` array (or importing `describe`/`it`/`expect` explicitly per-file), or TypeScript won't recognize the globals in test files even though they work at runtime.
- Coverage thresholds, once added, should be scoped to `src/` and exclude generated/config files (`vite.config.ts`, `*.d.ts`) via `coverage.exclude` — otherwise a repo-wide threshold average gets diluted by files that were never meant to be tested.

## Minimal Example

```ts
// vite.config.ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
```

## References

- https://vitest.dev/config/
- https://vitest.dev/guide/coverage
