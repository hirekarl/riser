/**
 * Thin, swappable logging wrapper. Every "log something" call in the app
 * should go through here rather than calling `console.*` directly, so a
 * future remote-logging integration (e.g. Sentry, LogRocket) only needs to
 * change these two functions' bodies, not every call site.
 */

export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[Riser] ${message}`, error, context ?? {});
}

export function logWarn(message: string, context?: Record<string, unknown>): void {
  console.warn(`[Riser] ${message}`, context ?? {});
}
