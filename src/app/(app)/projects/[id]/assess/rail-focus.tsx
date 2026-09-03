"use client";

import * as React from "react";

/**
 * Keeps the current step in view inside the rail.
 *
 * The rail scrolls in its own box when the stage is taller than the
 * window, and the step a person is on can start life below that box's
 * fold — which reads as the rail not knowing where they are. This scrolls
 * the rail, and only the rail: the page is left exactly where the browser
 * put it, and nothing takes focus. One nudge on arrival, never again.
 */
export function RailFocus() {
  React.useEffect(() => {
    const rail = document.querySelector<HTMLElement>("aside.rail");
    const current = rail?.querySelector<HTMLElement>(".rail-section.current");
    if (!rail || !current) return;
    const top = current.offsetTop - rail.offsetTop;
    const bottom = top + current.offsetHeight;
    if (top < rail.scrollTop || bottom > rail.scrollTop + rail.clientHeight) {
      rail.scrollTop = Math.max(0, top - 8);
    }
  }, []);
  return null;
}
