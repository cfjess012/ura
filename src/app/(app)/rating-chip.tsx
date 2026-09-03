import type { AppetiteBreach, Rated } from "@/lib/rating";

/**
 * A rating as a person reads it (FR-50): the band as a word, and every
 * reason behind it one click away. Never colour alone, never a number.
 *
 * A native `<details>`: the reasons are the evidence, and a chip that hid
 * them behind hover would make the band a verdict. It renders without
 * JavaScript, which is what a server component and a print stylesheet
 * both want.
 */
export function RatingChip({
  label,
  rated,
  breaches = [],
  compact = false,
}: {
  /** "Inherent", "Residual", or an area's name. */
  label: string;
  rated: Rated;
  /** Where this rating exceeds the stated appetite, if anywhere. */
  breaches?: AppetiteBreach[];
  compact?: boolean;
}) {
  return (
    <details className={`rating${compact ? " rating-compact" : ""}`}>
      <summary className="rating-summary">
        <span className="rating-label">{label}</span>
        <span className={`rating-band rating-${rated.band.toLowerCase()}`}>
          {rated.band}
        </span>
        {breaches.length > 0 && (
          <span className="rating-breach">Exceeds appetite</span>
        )}
        <span className="rating-why" aria-hidden="true">
          why
        </span>
      </summary>
      <div className="rating-reasons">
        <ul>
          {rated.because.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {breaches.map((breach) => (
          <p key={breach.scope} className="rating-breach-line">
            <strong>Exceeds appetite</strong> — {breach.because}. The line is{" "}
            {breach.max}; this is {breach.band}. It goes to{" "}
            {escalation(breach.escalateTo)}.
          </p>
        ))}
        <p className="help">
          Worked out from the answers every time this is opened — nothing here
          is stored, and changing an answer changes it.
        </p>
      </div>
    </details>
  );
}

/** "role:admin" / "domain:<key>" in words. The person, never the key. */
function escalation(to: string): string {
  if (to === "role:admin") return "an administrator";
  if (to.startsWith("domain:")) return "the assessor for that risk area";
  return "a reviewer";
}
