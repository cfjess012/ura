/**
 * Opening an assessment (N4). The `(app)` boundary above this one is
 * already resolved by the time a person clicks a row, so it never
 * re-suspends — meaning the commonest wait in the product had no feedback
 * at all. This boundary sits on the route that actually changes.
 */
export default function Loading() {
  return (
    <main>
      <p className="loading-note" role="status">
        Opening the assessment&hellip;
      </p>
      <div className="card skeleton-card" aria-hidden="true">
        <span className="skeleton skeleton-line w-40" />
        <span className="skeleton skeleton-line w-80" />
        <span className="skeleton skeleton-line w-60" />
      </div>
    </main>
  );
}
