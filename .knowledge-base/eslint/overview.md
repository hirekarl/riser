# ESLint

Official docs: https://eslint.org/docs/latest/use/configure/configuration-files

## Syntax / Usage Cheatsheet

- Modern config is "flat config": `eslint.config.js` exports an array of config objects (no `.eslintrc*` cascade): `export default [{ files: ["**/*.js"], rules: { semi: "error" } }]`.
- `defineConfig` helper gives structure/typing: `import { defineConfig } from "eslint/config"; export default defineConfig([{ rules: { semi: "error" } }])`.
- Extend a recommended ruleset: `import js from "@eslint/js"; export default defineConfig([{ files: ["**/*.js"], extends: ["js/recommended"], rules: { "no-unused-vars": "warn" } }])`.
- Register a plugin per config object: `plugins: { example: examplePlugin }, extends: ["example/recommended"]`.
- Language/parser options live under `languageOptions`: `{ ecmaVersion: 2024, sourceType: "module", globals: { MyGlobal: "readonly" } }`.
- Ignore patterns use `globalIgnores([...])` for repo-wide excludes, or a plain `ignores: [...]` key scoped to one config object.
- For React + TypeScript, the typical stack is `typescript-eslint`'s flat config helpers plus `eslint-plugin-react-hooks` for the rules-of-hooks checks.
- Config objects merge left-to-right — later objects in the array override earlier ones for the same `files` glob, same semantics as CSS specificity by declaration order.

## Project-Specific Gotchas

- **This repo uses ESLint 9 flat config (`frontend/eslint.config.js`).** `frontend/package.json`'s `"lint"` script runs `eslint .`, integrating `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks` (`recommended-latest`), and `eslint-plugin-jsx-a11y` (`flatConfigs.recommended`).
- Node globals are explicitly configured for `e2e/**/*.ts`, `playwright.config.ts`, and `vite.config.ts`, while browser globals are set for source code (`**/*.{ts,tsx}`).
- Flat config (`eslint.config.js`) is the only config format for any ESLint version this project would plausibly install; the legacy `.eslintrc.*` cascade format is deprecated and off by default in ESLint 9+.
- `typescript-eslint`'s type-aware rules require `languageOptions.parserOptions.project` (or `projectService: true`) pointing at a real `tsconfig.json` — this repo has three tsconfig files (`tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`); wiring type-aware linting incorrectly against the wrong one is a common setup mistake (Vite's own template splits app vs. node configs specifically so editor tooling picks the right one).
- Flat config `ignores`-only objects must be the sole key in that object (no `files`/`rules` alongside) to act as a global ignore — mixing `ignores` with `rules` in the same object scopes it to just those files instead.

## Minimal Example

```js
// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist/", "node_modules/"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
]);
```

## References

- https://eslint.org/docs/latest/use/configure/configuration-files
