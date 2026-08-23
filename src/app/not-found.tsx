import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found — Front Door AI Risk Advisor" };

/**
 * 404 (SPEC §25, F3). A wrong address is not an error the person caused, so
 * the page says what it looked for and offers the way back — no apology, no
 * blame, no dead end.
 */
export default function NotFound() {
  return (
    <main>
      <p className="eyebrow">Not found</p>
      <h1 className="display">There&rsquo;s nothing at this address</h1>
      <p className="lede">
        The link may be out of date, or the assessment it pointed to may have
        been started by someone else. Nothing has been lost.
      </p>
      <div className="card recover">
        <h2>Where to go</h2>
        <div className="savebar">
          <Link href="/projects" className="btn">
            Go to my assessments
          </Link>
          <Link href="/" className="btn ghost">
            Back to the front door
          </Link>
        </div>
      </div>
    </main>
  );
}
