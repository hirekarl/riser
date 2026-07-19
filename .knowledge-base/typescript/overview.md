# TypeScript

Official docs: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html

## Syntax / Usage Cheatsheet

- Function typing: ``function greet(name: string): string { return `Hello, ${name}` }``; arrow form: `const add = (a: number, b: number): number => a + b`.
- Object/inline types: `function printCoord(pt: { x: number; y: number }) { ... }`; optional props use `?`: `{ first: string; last?: string }`.
- Union types + narrowing: `function printId(id: number | string) { if (typeof id === "string") { id.toUpperCase() } else { id } }`.
- Literal unions for restricted string values: `function align(x: "left" | "right" | "center") {}` — this is the idiomatic way to type prop enums instead of a plain `string`.
- `interface` vs `type`: prefer `interface` for object/component-prop shapes (supports declaration merging/`extends`); prefer `type` for unions, tuples, and mapped/utility-type compositions (`type ID = string | number`).
- Narrowing helpers beyond `typeof`: `Array.isArray(x)`, discriminated unions via a shared literal tag field, and `in` checks.
- Type assertions: `document.getElementById("main") as HTMLCanvasElement`; double-assert through `unknown` only when truly necessary: `expr as unknown as TargetType`.
- Non-null assertion `!` bypasses `strictNullChecks` for a single expression — use sparingly, prefer an explicit null check.
- Utility types for shaping API/props types: `Partial<T>`, `Pick<T, K>`, `Omit<T, K>`, `Record<K, V>` — reach for these instead of hand-duplicating a shape when a type is "T minus/plus a few fields."
- Generics: `function first<T>(arr: T[]): T | undefined { return arr[0] }` — use a generic when a function's return type structurally depends on an input type.

## Project-Specific Gotchas

- `frontend/tsconfig.app.json` sets `"verbatimModuleSyntax": true` — type-only imports must use `import type { Foo } from "./foo"` (or `import { type Foo, bar }`); a plain `import { Foo }` for a type-only symbol is now a hard build error, not just a lint warning, because `tsc` no longer elides it automatically.
- Same config sets `"erasableSyntaxOnly": true` — TypeScript syntax that requires runtime transformation (e.g. `enum`, parameter properties in constructors) is disallowed; use `as const` object literals or union string literals instead of `enum`.
- `"moduleResolution": "bundler"` + `"allowImportingTsExtensions": true` means explicit `.ts`/`.tsx` extensions are permitted in imports and resolved the way Vite resolves them — don't assume Node's `moduleResolution: "node16"` extension rules apply here.
- `"noUnusedLocals": true` and `"noUnusedParameters": true` are both on — an unused destructured prop or unused import fails the build (`npm run build` runs `tsc -b` before `vite build`), not just the linter.
- The build script is `tsc -b && vite build` — type errors block the production build entirely; a change that passes `vite dev`'s fast-refresh (which does not type-check) can still fail `npm run build`.
- `typescript: "~6.0.2"` is pinned with a tilde (patch-only auto-upgrades) — minor version bumps are intentionally manual; check the TypeScript release notes before widening that range.

## Minimal Example

```ts
import type { ElevatorUnit } from "./types";

type ElevatorSummary = Pick<ElevatorUnit, "id" | "serialNumber" | "status">;

function isOverdue(unit: Pick<ElevatorUnit, "nextInspectionDue">): boolean {
  return new Date(unit.nextInspectionDue) < new Date();
}
```

## References

- https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
