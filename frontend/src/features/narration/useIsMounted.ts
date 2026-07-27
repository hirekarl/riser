import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a stable function that reports whether the calling component is
 * still mounted, so an async event handler (e.g. one that `await`s a fetch
 * triggered from a click, rather than from a `useEffect`) can avoid calling
 * `setState` once the component has gone away.
 *
 * Note: React itself has silently no-op'd a `setState` call on an unmounted
 * component since React 18 — there's no console warning or crash either way
 * (see https://github.com/facebook/react/pull/22114). This guard is about
 * not doing pointless work after unmount, not about avoiding a runtime error.
 */
export function useIsMounted(): () => boolean {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(() => mountedRef.current, []);
}
