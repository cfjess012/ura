/**
 * The assessment list (N4). Its own boundary, because the list is a
 * database read and the navigation to it must not look like a dead click.
 */
export default function Loading() {
  return (
    <main>
      <p className="loading-note" role="status">
        Loading your assessments&hellip;
      </p>
      <div className="card skeleton-card" aria-hidden="true">
        <span className="skeleton skeleton-line w-60" />
        <span className="skeleton skeleton-line w-40" />
      </div>
    </main>
  );
}
