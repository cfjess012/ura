import { Opening } from "./opening";

/**
 * Opening an assessment (N4). The `(app)` boundary above this one is
 * already resolved by the time a person clicks a row, so it never
 * re-suspends — meaning the commonest wait in the product had no feedback
 * at all. This boundary sits on the route that actually changes.
 *
 * The note itself is a client component because a wait that never ends has
 * to say so, and only the browser knows how long it has been (§24.4).
 */
export default function Loading() {
  return (
    <main>
      <Opening />
      <div className="card skeleton-card" aria-hidden="true">
        <span className="skeleton w-40" />
        <span className="skeleton w-80" />
        <span className="skeleton w-60" />
      </div>
    </main>
  );
}
