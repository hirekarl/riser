// vitest-axe (v0.1.0) only ships a `declare global { namespace Vi { ... } }`
// augmentation, which predates Vitest's newer `declare module 'vitest'`
// Assertion typing convention (see @testing-library/jest-dom/vitest for the
// modern pattern). Re-declare it here in the shape Vitest 4 actually expects
// so `expect(...).toHaveNoViolations()` type-checks.
import "vitest";

declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

export {};
