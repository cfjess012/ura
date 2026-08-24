/**
 * Readiness: can this instance actually serve a request that needs data?
 *
 * Separate from /healthz on purpose. A deploy that is up but cannot reach
 * Postgres should say which of those two things is wrong, in one line,
 * rather than leaving somebody reading task logs at the worst moment.
 */
import { peopleStore } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Never echo a connection string, whatever the driver put in the error. */
function safeDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : "unknown";
  return raw
    .replace(/[a-z]+:\/\/[^\s]*@/gi, "[credentials removed]@")
    .slice(0, 200);
}

export async function GET() {
  try {
    const people = await peopleStore().signIns();
    return Response.json({
      ok: true,
      database: "reachable",
      signIns: people.length,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        database: "unreachable",
        // The message, never the connection string.
        detail:
          error instanceof Error ? error.message.slice(0, 200) : "unknown",
      },
      { status: 503 },
    );
  }
}
