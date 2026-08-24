/**
 * How far through something a person is — a bar, and always the numbers.
 *
 * Salvaged from the prior platform (G-63), where the lesson was earned at
 * 174 questions: past a certain size "how much is left" stops being
 * answerable by scrolling. Two rules carried over with it. The numeric
 * label is **always** rendered, so the bar reinforces a fact rather than
 * being the only place it exists (§23, never state by shape alone). And it
 * carries progressbar semantics with an explicit `aria-valuetext`, so what
 * a screen reader announces is the sentence, not a percentage.
 *
 * Colour comes only from the existing tokens — a meter is not a reason for
 * a new palette (§11.1).
 */
export function ProgressMeter({
  done,
  total,
  label,
  tone = "light",
}: {
  done: number;
  total: number;
  /** What is being counted, in a person's words: "signed", "answered". */
  label: string;
  /** `dark` for the navy header, where the light tokens would vanish. */
  tone?: "light" | "dark";
}) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const complete = total > 0 && done >= total;
  return (
    <div className={`meter meter-${tone}${complete ? " meter-complete" : ""}`}>
      <div
        className="meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} ${label}`}
      >
        <div className="meter-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="meter-count">
        {done}/{total} {label}
      </span>
    </div>
  );
}
