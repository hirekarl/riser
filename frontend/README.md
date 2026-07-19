# Riser Frontend

Frontend single-page application (SPA) for **Riser** built with React 19, TypeScript, and Vite.

## Available Scripts

In the `frontend/` directory, you can run:

- `npm run dev` — Starts the Vite development server with HMR.
- `npm run build` — Type-checks with `tsc -b` and builds the production bundle into `dist/`.
- `npm run preview` — Serves the built `dist/` directory locally.
- `npm run lint` — Runs ESLint across TypeScript and TSX files.
- `npm run typecheck` — Runs `tsc -b` to verify type correctness.
- `npm run format` — Formats files using Prettier.
- `npm run format:check` — Checks formatting using Prettier.
- `npm run test` — Runs component and unit tests using Vitest (`vitest run`).
- `npm run test:coverage` — Runs Vitest with v8 coverage (enforcing 90% threshold).
- `npm run test:e2e` — Runs end-to-end tests using Playwright (`playwright test`).

## Toolchain & Stack

- **Framework:** React 19 + TypeScript
- **Bundler:** Vite 8
- **Linter & Formatter:** ESLint 9 (flat config in `eslint.config.js`), Prettier
- **Unit & Component Testing:** Vitest, `@testing-library/react`, `jsdom`, `vitest-axe`
- **E2E Testing:** Playwright (`@playwright/test`, `@axe-core/playwright`)
