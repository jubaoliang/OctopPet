import { type RefObject, useEffect, useLayoutEffect } from "react";

import { tauriApi } from "../lib/tauriApi";
import { hideCurrentWindow, setCurrentWindowSize } from "../lib/tauriWindowApi";

export function useAutoFitWindow(
  rootRef: RefObject<HTMLElement | null>,
  width: number,
  deps: unknown[] = [],
  shownEvent = "settings-shown",
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const fit = () => {
      const height = Math.ceil(root.getBoundingClientRect().height);
      if (height < 120) return;
      void setCurrentWindowSize(width, height);
    };
    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };

    scheduleFit();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleFit);
    observer?.observe(root);

    let disposed = false;
    let unlistenShown: (() => void) | undefined;
    void tauriApi
      .listenWindowShown(shownEvent, scheduleFit)
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenShown = unlisten;
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      unlistenShown?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit layout deps
  }, deps);
}

export function useEscapeHidesWindow() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void hideCurrentWindow();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
