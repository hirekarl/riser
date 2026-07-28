# Playwright

Official docs: https://playwright.dev/docs/test-webserver, https://playwright.dev/docs/mock

## Syntax / Usage Cheatsheet

- `webServer` config in `playwright.config.ts` starts a local dev/preview server before the test run: `webServer: { command: 'npm run start', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, timeout: 120 * 1000 }`.
- `url` is polled until it returns a 2xx–403 status, signaling the server is ready — pick a route that responds quickly, not one that depends on a cold-start DB migration.
- `reuseExistingServer: !process.env.CI` is the standard pattern: locally, reuse whatever dev server is already running; in CI, always start fresh (and error instead if a stray one is already listening).
- Pair `webServer.url` with `use: { baseURL: 'http://localhost:3000' }` so tests can use relative `page.goto('/')` paths.
- Mock/intercept a network call with `page.route(urlPattern, handler)`: fully replace the response with `route.fulfill({ json: [...] })`, no real network call made.
- Modify a real response instead of replacing it: `const response = await route.fetch(); const json = await response.json(); /* mutate json */ await route.fulfill({ response, json })` — makes the real API call, patches the result.
- URL patterns for `page.route` support glob syntax: `'*/**/api/v1/fruits'` matches that path suffix regardless of host/port, handy for mocking against whatever port the dev server happens to be on.

## Project-Specific Gotchas

- **This repo has Playwright configured in `frontend/playwright.config.ts`.** `frontend/package.json` includes `@playwright/test` and `@axe-core/playwright`. E2E tests live in `frontend/e2e/`. `playwright.config.ts` sets `baseURL: "http://localhost:4173"` and uses `webServer` with `command: "npm run preview -- --port 4173"`.
- Route interception for mocked API e2e tests is the natural fit for this backend/frontend split: mocking `**/api/**` lets frontend e2e specs run without a live Django server/DB, which is valuable for fast CI feedback separate from full-stack integration tests — but be deliberate about which specs are "frontend-only, API-mocked" vs. "true e2e against the real Django backend," since mixing the two styles in one spec file makes failures hard to triage.
- `reuseExistingServer: !process.env.CI` assumes a `CI` env var is set in the CI environment — GitHub Actions sets `CI=true` automatically, so this pattern works out of the box there, but double-check any local `.env` doesn't accidentally also set `CI=true` (some tooling does), which would silently disable the "reuse local dev server" behavior during local test runs.
- `webServer.timeout` defaults to 60000ms (60s) — a cold Django dev server that also has to run pending migrations on boot can exceed that; raise `timeout` explicitly rather than letting the default silently flake the whole e2e suite on a cold cache/CI runner.
- **`webServer.command` is `npm run preview`, not `npm run dev`** — this serves a static, pre-built `dist/` bundle, not live source. Combined with `reuseExistingServer: !process.env.CI`, a locally-running preview server from a previous `test:e2e` invocation gets silently reused for the _next_ run too, even after source changes — `npm run test:e2e` can report a clean pass while testing stale code with a real regression already in the working tree. Confirmed directly (2026-07-27): a genuine e2e-breaking bug (a `getByLabel` locator made ambiguous by a new form field) passed cleanly against a stale `dist/`, then failed immediately once `dist/` was rebuilt. Before trusting a local `npm run test:e2e` "all passed" result on a branch with recent frontend changes, run `rm -rf dist && npm run build && npm run test:e2e` to force a true rebuild — or just always do this before treating a green e2e run as real signal. CI is unaffected (`CI=true` disables server reuse there), so this only bites local verification.

## Minimal Example

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: [
    {
      command: "npm --prefix frontend run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "uv run --project backend manage.py runserver",
      url: "http://localhost:8000/api/health/",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  use: { baseURL: "http://localhost:5173" },
});
```

## References

- https://playwright.dev/docs/test-webserver
- https://playwright.dev/docs/mock
