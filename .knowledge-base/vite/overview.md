# Vite

Official docs: https://vite.dev/config/, https://vite.dev/guide/env-and-mode.html

## Syntax / Usage Cheatsheet

- Base config: `import { defineConfig } from 'vite'; export default defineConfig({ plugins: [react()] })` — `defineConfig` gives TS intellisense with no JSDoc needed.
- `defineConfig` also accepts a function receiving `{ command, mode, isSsrBuild, isPreview }` for conditional config, and can be async: `defineConfig(async ({ command, mode }) => ({ ... }))`.
- `command` is `"serve"` during `vite`/`vite dev` and `"build"` during `vite build` — use it to branch dev-only vs prod-only plugins/settings.
- Env files load in priority order: `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`; mode-specific beats generic, `.local` files are git-ignored by Vite's default `.gitignore` templates.
- Only vars prefixed `VITE_` are exposed to client code via `import.meta.env.VITE_*` — anything unprefixed stays server/build-only, preventing accidental secret leakage into the bundle.
- `import.meta.env` also includes built-ins: `MODE`, `BASE_URL`, `DEV`, `PROD`, `SSR`.
- Env vars are NOT auto-injected into `process.env` while `vite.config.ts` itself is executing — call `loadEnv(mode, process.cwd(), '')` explicitly inside the config function if the config itself needs a `.env` value (e.g. to set `server.port`).
- Mode is independent from `NODE_ENV` — override with `--mode staging` on either `vite dev` or `vite build`; don't conflate the two when debugging "why is this env var missing."
- Vitest's `test` config block can live inside the same `vite.config.ts` (with `/// <reference types="vitest/config" />` at the top) or in a separate `vitest.config.ts`, which takes priority over the Vite config if both exist.

## Project-Specific Gotchas

- `frontend/vite.config.ts` in this repo currently only registers `@vitejs/plugin-react()` — no `resolve.alias`, no `test` block yet. When Vitest is added, decide up front: extend this same file (adding `/// <reference types="vitest/config" />` plus a `test: {}` block) vs. a sibling `vitest.config.ts` — mixing partial config in both is a common source of "why isn't my test config applying" confusion.
- This project uses `vite@^8.1.1` and `@vitejs/plugin-react@^6.0.3` — Vite major-version bumps have historically changed default `esbuild`/Rollup target output and dropped older Node engine support; check the engines field before assuming a CI Node version still works after any Vite major bump.
- No `VITE_`-prefixed env vars currently exist in the repo config that was inspected — when backend API base URLs or feature flags are introduced client-side, they must be prefixed `VITE_` or `import.meta.env` will return `undefined` silently (no build error).
- `npm run build` runs `tsc -b && vite build` — a passing `vite dev` session does not guarantee `vite build` succeeds, since `tsc` type-checks are not part of Vite's dev server pipeline.

## Minimal Example

```ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: { port: Number(env.VITE_DEV_PORT) || 5173 },
  };
});
```

## References

- https://vite.dev/config/
- https://vite.dev/guide/env-and-mode.html
