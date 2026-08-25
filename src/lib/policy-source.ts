/**
 * Where the assistant gets policy from (SPEC §22.5, FR-45).
 *
 * **This is the swap point, and the only module that knows where policy
 * comes from.** Today it returns clauses from the corpus in this repo. In a
 * real deployment that corpus lives in an enterprise policy service — an
 * MCP server, a GRC platform, a document store — and pointing at one is a
 * change to this file and nothing else. The same arrangement
 * `src/lib/agent.ts` has for the model: one module holds the knowledge of
 * how a thing is reached, so the rest of the system never learns.
 *
 * Said plainly because it will be demonstrated: the retrieval below is
 * real, and the corpus behind it is written in this repository rather than
 * supplied by anybody's policy office.
 *
 * **A second reader, not a new owner.** `policy.ts` goes on reading the
 * same file directly for breach detection, the "why am I being asked this"
 * panel, the review queue and the report. G-67 settled that the
 * deterministic pass stands alone: a breach finding must never wait on a
 * lookup, and must never fail because one did.
 *
 * Pure — no framework, no driver, no environment (§26.1).
 */
import { policies, type Policy, type PolicyClause } from "./policy";

/**
 * A clause, as the assistant is allowed to use it.
 *
 * `text` is carried verbatim and is never trimmed, summarised or reflowed
 * on the way through. §22.5: a paraphrased policy is not a policy, and the
 * whole reason a citation is worth anything is that the words are the
 * policy's own.
 */
export type Authority = {
  policy: string;
  reference: string;
  version: string;
  effective: string;
  clauseId: string;
  heading: string;
  text: string;
};

/** Words too common to mean anything when they match. */
const NOISE = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "do",
  "does",
  "did",
  "doing",
  "have",
  "has",
  "had",
  "i",
  "we",
  "you",
  "it",
  "this",
  "that",
  "these",
  "those",
  "what",
  "which",
  "who",
  "whom",
  "how",
  "why",
  "when",
  "where",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "from",
  "by",
  "at",
  "as",
  "about",
  "into",
  "my",
  "our",
  "your",
  "their",
  "its",
  "me",
  "us",
  "them",
  "can",
  "could",
  "should",
  "would",
  "will",
  "shall",
  "may",
  "might",
  "get",
  "got",
  "want",
  "need",
  "there",
  "here",
  "not",
  "no",
  "yes",
  "so",
  "than",
  "then",
  "just",
  "only",
  "also",
]);

/** Words worth matching on, from anything a person typed. */
export function termsIn(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !NOISE.has(word)),
    ),
  ];
}

const HEADING_WORTH = 4;
const NAME_WORTH = 2;
const TEXT_WORTH = 1;
/**
 * A term found in few clauses is worth far more than one found in many.
 *
 * "chatgpt" appears in exactly one clause of twenty-six and tells you
 * precisely which; "data" appears in half of them and tells you nothing.
 * Without this the two counted the same, so a flat floor either dismissed
 * the distinctive term as noise or let the common one drag in whatever it
 * happened to touch. It dismissed "chatgpt" — one body match, under the
 * floor, no citation — while the clause naming the approved register sat
 * right there.
 */
const RARE_AT_MOST = 3;
const RARE_WORTH = 3;
/** Below this a match is a common word landing by accident. */
const FLOOR = 3;

/** How many clauses mention a term at all. Cheap over twenty-six. */
function spread(term: string): number {
  let seen = 0;
  for (const policy of policies()) {
    const name = policy.name.toLowerCase();
    for (const clause of policy.clauses) {
      if (
        clause.heading.toLowerCase().includes(term) ||
        clause.text.toLowerCase().includes(term) ||
        name.includes(term)
      ) {
        seen += 1;
      }
    }
  }
  return seen;
}

/**
 * A definition edges out an obligation on an equal score.
 *
 * They answer different questions — a definition says what a term means, an
 * obligation says what must be done about it — and somebody who has just
 * typed the term is more often asking the first. Enough to separate "Third
 * party" from "Governing third-party access", and nothing more.
 */
const DEFINITION_EDGE = 0.5;

function scoreOf(
  policy: Policy,
  clause: PolicyClause,
  terms: string[],
): number {
  const heading = clause.heading.toLowerCase();
  const body = clause.text.toLowerCase();
  const name = policy.name.toLowerCase();
  let score = 0;
  for (const term of terms) {
    // A heading is what a clause is ABOUT, so a term there is worth more
    // than the same term appearing once in a paragraph that mentions it.
    const where = heading.includes(term)
      ? HEADING_WORTH
      : name.includes(term)
        ? NAME_WORTH
        : body.includes(term)
          ? TEXT_WORTH
          : 0;
    if (where === 0) continue;
    const rare = spread(term) <= RARE_AT_MOST;
    score += where * (rare ? RARE_WORTH : 1);
  }
  if (score > 0 && clause.kind === "definition") score += DEFINITION_EDGE;
  return score;
}

/**
 * The clauses that bear on these terms, best first.
 *
 * **Empty is a normal answer**, not a failure — most turns in a
 * conversation are not about a defined term, and returning something for
 * every question is how a citation stops meaning anything. The floor is
 * there so one common word landing in one paragraph does not dress an
 * unrelated clause up as an authority.
 */
export function findAuthority(terms: string[], limit = 3): Authority[] {
  const wanted = terms.filter((term) => term.length > 2 && !NOISE.has(term));
  if (wanted.length === 0) return [];
  const scored: Array<{ score: number; authority: Authority }> = [];
  for (const policy of policies()) {
    for (const clause of policy.clauses) {
      const score = scoreOf(policy, clause, wanted);
      if (score < FLOOR) continue;
      scored.push({
        score,
        authority: {
          policy: policy.name,
          reference: policy.reference,
          version: policy.version,
          effective: policy.effective,
          clauseId: clause.id,
          heading: clause.heading,
          text: clause.text,
        },
      });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((found) => found.authority);
}
