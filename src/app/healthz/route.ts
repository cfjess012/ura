/**
 * Liveness for the load balancer. Deliberately touches nothing.
 *
 * The front door reads the people directory, so if it were the health
 * check a database that is merely not connected yet would read as "the
 * application is broken": the target never goes healthy, the platform
 * kills and restarts the task, and the logs show a crash loop rather than
 * the one fact that matters. This says only "the process is up"; whether
 * the database is reachable is a different question, answered below.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, service: "ura-web" });
}
