# React 19

Official docs: https://react.dev/blog/2024/12/05/react-19, https://react.dev/reference/react/hooks

## Syntax / Usage Cheatsheet

- Core hooks: `useState`, `useEffect`, `useContext`, `useRef`, `useMemo`, `useCallback`, `useReducer` — standard signatures, e.g. `const [value, setValue] = useState(initial)`, `useEffect(() => {...}, [deps])`.
- `ref` is now a normal prop — no `forwardRef` needed: `function MyInput({ placeholder, ref }) { return <input placeholder={placeholder} ref={ref} /> }`.
- Ref callbacks can return a cleanup function, same shape as `useEffect` cleanup: `<input ref={(el) => { /* setup */; return () => { /* cleanup */ } }} />`.
- `use()` reads a promise or context during render and can be called conditionally (unlike other hooks): `const comments = use(commentsPromise)` (suspends), or `const theme = use(ThemeContext)`.
- Context provider shorthand: render `<MyContext value={...}>` directly instead of `<MyContext.Provider value={...}>`.
- Actions pattern for async mutations: wrap in `useTransition`'s `startTransition(async () => { ... })` to get automatic pending state.
- `useActionState(actionFn, initialState)` returns `[state, formAction, isPending]` — wire `formAction` straight to `<form action={formAction}>`.
- `useFormStatus()` (from `react-dom`) reads the enclosing `<form>`'s pending state without prop drilling — must be called from a component nested inside the `<form>`.
- `useOptimistic(currentValue)` shows an optimistic UI update before the async request resolves.
- Metadata tags (`<title>`, `<meta>`, `<link>`) can be rendered from any component; React hoists them to `<head>` automatically.

## Project-Specific Gotchas

- This repo is on `react@^19.2.7` / `react-dom@^19.2.7` — verify any third-party component library still supports the prop-as-ref pattern; libraries still calling `forwardRef` internally continue to work, but libraries that special-cased `ref` extraction from props may need updates.
- `use()` can only be called during render, not inside event handlers or effects — reach for `useEffect` + state, or `useActionState`, for anything triggered by user interaction.
- The frontend currently ships no test runner config for React components in `frontend/package.json` (no Vitest/Testing Library devDependency yet) — when adding component tests, confirm the `jsdom` environment and `@testing-library/react` version target React 19 explicitly (older RTL major versions assume `forwardRef`-shaped internals and can warn on prop-based refs).
- `frontend/tsconfig.app.json` sets `"jsx": "react-jsx"` (automatic runtime) — do not add manual `import React from 'react'` for JSX-only files; it's unnecessary and `noUnusedLocals: true` in that tsconfig will flag it as an error, not just a lint warning.
- Metadata/resource-preload APIs (`prefetchDNS`, `preload`, `preinit`) are dedup'd automatically by React across renders — calling them in a loop or list-rendered component is safe and intentional, not a bug to "fix."

## Minimal Example

```tsx
import { useActionState } from "react";

function InspectionForm({ elevatorId }: { elevatorId: string }) {
  const [error, submitAction, isPending] = useActionState(
    async (_prevState: string | null, formData: FormData) => {
      const result = await fetch(`/api/elevators/${elevatorId}/inspections/`, {
        method: "POST",
        body: formData,
      });
      if (!result.ok) return "Failed to submit inspection";
      return null;
    },
    null,
  );

  return (
    <form action={submitAction}>
      <input type="date" name="inspection_date" />
      <button disabled={isPending}>Submit</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

## References

- https://react.dev/blog/2024/12/05/react-19
- https://react.dev/reference/react/hooks
