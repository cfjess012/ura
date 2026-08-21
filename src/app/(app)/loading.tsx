/**
 * Shown while a screen in the product is being prepared (SPEC §24.3: a
 * control responds to the action taken). Without it, a slow navigation looks
 * like a click that did nothing.
 */
export default function Loading() {
  return (
    <main>
      <p className="loading-note" role="status">
        Loading&hellip;
      </p>
      <div className="card skeleton-card" aria-hidden="true">
        <span className="skeleton skeleton-line w-40" />
        <span className="skeleton skeleton-line w-80" />
        <span className="skeleton skeleton-line w-60" />
      </div>
    </main>
  );
}
