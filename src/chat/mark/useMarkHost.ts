/**
 * useMarkHost — markHost lifecycle hook (React side).
 * Creates the host on first render; the ref callback handles attach/detach; update(props)
 * runs after every render (the host diffs per field via Object.is and skips unchanged fields).
 */
import { useCallback, useEffect, useRef } from "react";
import type { MarkHost, MarkHostProps } from "./types";
import { createMarkHost } from "./markHost";
import type { MarkRenderer } from "./markHost";

export interface UseMarkHostResult {
  /** Ref callback to attach to the host element (outer container). */
  setRef: (el: HTMLElement | null) => void;
  /** Imperative handle (poke/gaze/blink/look/restart/setExpression/...). */
  host: MarkHost;
}

/** @param renderer Only read when the host is first created; a different value on later renders is ignored. */
export function useMarkHost(props: MarkHostProps, renderer?: MarkRenderer): UseMarkHostResult {
  const hostRef = useRef<MarkHost | null>(null);
  if (hostRef.current === null) hostRef.current = createMarkHost(props, renderer);
  const host = hostRef.current;
  const detachRef = useRef<(() => void) | null>(null);

  const setRef = useCallback(
    (el: HTMLElement | null) => {
      detachRef.current?.();
      detachRef.current = null;
      if (el != null) detachRef.current = host.attach(el);
    },
    [host],
  );

  useEffect(() => {
    host.update(props);
  });

  useEffect(
    () => () => {
      detachRef.current?.();
      detachRef.current = null;
    },
    [],
  );

  return { setRef, host };
}
