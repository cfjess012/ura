/**
 * The **only** module that reads or writes conversation state (SPEC §6.1).
 *
 * The interface is shaped for an AgentCore Memory swap, which is why it is
 * narrower than the table behind it: append a turn, read the history, and
 * nothing else. No query, no filter, no update — because a memory service
 * offers those things differently or not at all, and an interface shaped
 * around today's SQL would have to be redesigned to move.
 *
 * Insert-only, like every other record of what happened (§5.1): a
 * conversation is not edited into a better version of itself.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export type Speaker = "person" | "agent";

export type Turn = {
  conversationId: string;
  projectId: string;
  speaker: Speaker;
  said: string;
  saidAt: Date;
};

export interface SessionStore {
  /** Record one thing that was said. */
  append(turn: Omit<Turn, "saidAt">): Promise<void>;
  /**
   * The conversation so far, oldest first — the order it happened in, which
   * is the order anything reading it needs.
   */
  history(conversationId: string, limit?: number): Promise<Turn[]>;
}

/** How much of a conversation is worth carrying by default. */
const DEFAULT_WINDOW = 50;

export function postgresSessionStore(): SessionStore {
  const db = getDb();
  return {
    async append(turn) {
      await db.insert(schema.conversationTurns).values({
        conversationId: turn.conversationId,
        projectId: turn.projectId,
        speaker: turn.speaker,
        said: turn.said,
      });
    },
    async history(conversationId, limit = DEFAULT_WINDOW) {
      // Newest first in the query so the limit takes the most recent turns,
      // then reversed so callers read it in the order it was said.
      const rows = await db
        .select()
        .from(schema.conversationTurns)
        .where(eq(schema.conversationTurns.conversationId, conversationId))
        .orderBy(desc(schema.conversationTurns.saidAt))
        .limit(limit);
      return rows
        .map((row) => ({
          conversationId: row.conversationId,
          projectId: row.projectId,
          speaker: row.speaker as Speaker,
          said: row.said,
          saidAt: row.saidAt,
        }))
        .reverse();
    },
  };
}

/** The one way to get at conversation state. */
export function sessionStore(): SessionStore {
  return postgresSessionStore();
}
