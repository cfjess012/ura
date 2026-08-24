"use client";

import * as React from "react";

/**
 * Types the headline once on arrival. Motion that serves the subject: the
 * sentence assembles the way an assessment does — one piece at a time.
 * Honours prefers-reduced-motion by rendering the finished line.
 */
export function TypedLine({ text }: { text: string }) {
  const [shown, setShown] = React.useState(text);

  React.useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;
    setShown("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setShown(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 42);
    return () => window.clearInterval(timer);
  }, [text]);

  // The animated span is decoration: a screen reader gets the finished
  // sentence once, from the sr-only span, instead of hearing it twice.
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="caret" aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </>
  );
}
