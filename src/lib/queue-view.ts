/**
 * The reviewer's queue as a day's work, rather than a list of names.
 *
 * A flat list answers "what exists". Somebody opening this at nine in the
 * morning is asking "what needs me, and what is getting old" — so the
 * assessments are grouped by what is blocking them, ordered worst first,
 * and each carries how long it has been sitting.
 *
 * Everything is derived and everything is scoped to the reader: the counts
 * come from `reviewStanding`, which already filters by the authority that
 * decides who may sign what. A tile showing a number the reader cannot act
 * on is the same defect as an alert that did.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import {
  reviewStanding,
  type ReviewCounts,
  type StandingItem,
} from "./review-standing";
import type { OwnStanding, Turn } from "./progress";

export type QueueEntry = {
  id: string;
  projectName: string;
  businessUnit: string | null;
  startedBy: string | null;
  submittedAt: Date;
  /** How long it has been waiting, in a reviewer's words. */
  aged: string;
  /** Whole days waiting — what the ordering uses, and the tiles count. */
  days: number;
  standing: StandingItem[];
  /** One sentence: what this assessment is waiting for. */
  says: string;
};

/**
 * Why an assessment is in the queue.
 *
 * "Blocked" and "waiting" are genuinely different work: one is a decision
 * only the reviewer can make, the other is a decision they can only ask
 * somebody else for. Splitting them is the difference between a queue you
 * can work top to bottom and one you have to triage yourself every time.
 */
export type QueueGroup = {
  key: "blocked" | "waiting" | "elsewhere" | "clear";
  title: string;
  /** Why these are together, said once rather than per row. */
  because: string;
  entries: QueueEntry[];
};

export type QueueTile = {
  key: "violations" | "attest" | "declared" | "oldest";
  label: string;
  value: number;
  /** The unit, where the number alone would be ambiguous. */
  unit?: string;
  /** Loudest first: a violation is not the same kind of number as a count. */
  tone: "alarm" | "attention" | "plain";
};

function daysBetween(then: Date, now: Date): number {
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** How long something has been waiting, said the way a person would. */
export function agedLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day open";
  return `${days} days open`;
}

/** One sentence naming what this assessment is waiting for. */
function sentenceFor(standing: StandingItem[]): string {
  if (standing.length === 0) {
    return "Every answer is attested and no finding is open.";
  }
  // The reviewer's own work first, then what is owed by somebody else.
  const parts = standing.map((item) => {
    switch (item.kind) {
      case "violation":
        return `${item.count} answer${item.count === 1 ? "" : "s"} contradict${item.count === 1 ? "s" : ""} a policy clause`;
      case "attest":
        return `${item.count} control answer${item.count === 1 ? "" : "s"} need${item.count === 1 ? "s" : ""} your attestation`;
      case "gap":
        return `${item.count} required control${item.count === 1 ? " is" : "s are"} not in place`;
      case "enhancement":
        return `${item.count} control${item.count === 1 ? " is" : "s are"} only partly in place`;
      case "unanswered":
        return `${item.count} question${item.count === 1 ? " was" : "s were"} left unanswered and declared`;
      case "elsewhere":
        return `${item.count} answer${item.count === 1 ? "" : "s"} sit${item.count === 1 ? "s" : ""} with other risk domains`;
    }
  });
  const said = parts.join(", and ");
  return said.charAt(0).toUpperCase() + said.slice(1) + ".";
}

/** Does this need a decision from the reader, or from somebody else? */
function blocking(standing: StandingItem[]): boolean {
  return standing.some(
    (item) =>
      item.kind === "attest" ||
      item.kind === "violation" ||
      item.kind === "gap" ||
      item.kind === "enhancement",
  );
}

export type Submitted = {
  id: string;
  projectName: string;
  businessUnit: string | null;
  startedBy: string | null;
  submittedAt: Date;
  counts: ReviewCounts;
};

/**
 * The queue, grouped and ordered.
 *
 * Ordering inside a group is by age, oldest first: a queue that puts the
 * newest thing on top is how something quietly waits three weeks.
 */
export function reviewerQueue(
  submitted: Submitted[],
  now: Date,
  mine: (questionId: string) => boolean = () => true,
  minesObjective: (objectiveId: string) => boolean = () => true,
): {
  groups: QueueGroup[];
  tiles: QueueTile[];
  needing: number;
  blocking: number;
} {
  const entries: QueueEntry[] = submitted.map((p) => {
    const standing = reviewStanding(p.id, p.counts, mine, minesObjective);
    const days = daysBetween(p.submittedAt, now);
    return {
      id: p.id,
      projectName: p.projectName,
      businessUnit: p.businessUnit,
      startedBy: p.startedBy,
      submittedAt: p.submittedAt,
      aged: agedLabel(days),
      days,
      standing,
      says: sentenceFor(standing),
    };
  });

  const byAge = (a: QueueEntry, b: QueueEntry) => b.days - a.days;
  const blocked = entries.filter((e) => blocking(e.standing)).sort(byAge);
  const rest = entries.filter(
    (e) => !blocking(e.standing) && e.standing.length > 0,
  );
  // "Another domain has not signed yet" is not "the requester owes us
  // something", and filing it as the latter tells an assessor to chase
  // somebody who is not holding anything up.
  const waiting = rest
    .filter((e) => e.standing.some((i) => i.kind === "unanswered"))
    .sort(byAge);
  const elsewhere = rest
    .filter((e) => !e.standing.some((i) => i.kind === "unanswered"))
    .sort(byAge);
  const clear = entries.filter((e) => e.standing.length === 0).sort(byAge);

  const count = (kind: StandingItem["kind"]) =>
    entries.reduce(
      (total, entry) =>
        total +
        entry.standing
          .filter((item) => item.kind === kind)
          .reduce((n, item) => n + item.count, 0),
      0,
    );

  const oldest = blocked[0]?.days ?? waiting[0]?.days ?? 0;
  const tiles: QueueTile[] = [
    {
      key: "violations",
      label: "Policy violations",
      value: count("violation"),
      tone: "alarm",
    },
    {
      key: "attest",
      label: "Awaiting your attestation",
      value: count("attest"),
      tone: "attention",
    },
    {
      key: "declared",
      label: "Declared unanswered",
      value: count("unanswered"),
      tone: "plain",
    },
    {
      key: "oldest",
      label: "Longest waiting",
      value: oldest,
      unit: oldest === 1 ? "day" : "days",
      tone: "plain",
    },
  ];

  const groups: QueueGroup[] = [
    {
      key: "blocked",
      title: "Blocked, needs your decision",
      because: "Nothing moves on these until you sign or settle them.",
      entries: blocked,
    },
    {
      key: "waiting",
      title: "Waiting on the requester",
      because:
        "Nothing here is yours to decide — read what they declared, or ask them for more.",
      entries: waiting,
    },
    {
      key: "elsewhere",
      title: "With another risk domain",
      because:
        "Nothing here is yours — another domain's assessor signs these. Listed so you can see the whole picture.",
      entries: elsewhere,
    },
    {
      key: "clear",
      title: "Nothing outstanding",
      because: "Attested and settled. Here so they are not simply gone.",
      entries: clear,
    },
  ];

  return {
    groups: groups.filter((g) => g.entries.length > 0),
    tiles,
    // What is actually theirs. Counting another domain's work here is how
    // the headline told an assessor three assessments needed them when
    // none did.
    needing: blocked.length + waiting.length,
    blocking: blocked.length,
  };
}

/** One of the requester's own assessments, as their list shows it. */
export type OwnEntry = {
  id: string;
  projectName: string;
  businessUnit: string | null;
  updatedAt: Date;
  submittedAt: Date | null;
  aged: string;
  days: number;
  /** Where it has got to, and what is outstanding (src/lib/progress.ts). */
  standing: OwnStanding;
};

/**
 * The requester's list, grouped by whose move it is.
 *
 * Not the reviewer's four groups: those split a reviewer's own decisions
 * from somebody else's. A requester has exactly one question — is this
 * mine to move, or am I waiting? — and three answers to it.
 */
export type OwnGroup = {
  key: Turn;
  title: string;
  /** Why these are together, said once rather than per row. */
  because: string;
  entries: OwnEntry[];
};

/** How long this has been where it is, in the words its state deserves. */
function agedFor(turn: Turn, days: number): string {
  if (turn === "you")
    return days === 0
      ? "edited today"
      : `untouched for ${days} day${days === 1 ? "" : "s"}`;
  if (days === 0) return "submitted today";
  if (turn === "reviewer")
    return `with a reviewer ${agedLabel(days).replace(" open", "")}`;
  return `submitted ${days} days ago`;
}

/**
 * The requester's side of the same idea.
 *
 * Their question is not "what needs me" in the reviewer's sense — it is
 * "which of these is mine to move, and which am I waiting on somebody
 * else for". So the list is grouped by whose move it is, and each row
 * carries the step it is on rather than only the day it was last touched.
 *
 * There are no tiles here on purpose. Three numbers above three groups
 * that already count themselves is the repetition §24.6 forbids — and the
 * one fact the tiles carried that the groups do not, how stale the oldest
 * draft is, is said once in the group it belongs to.
 */
export function requesterQueue(
  own: Array<{
    id: string;
    projectName: string;
    businessUnit: string | null;
    updatedAt: Date;
    submittedAt: Date | null;
    standing: OwnStanding;
  }>,
  now: Date,
): { groups: OwnGroup[]; entries: OwnEntry[] } {
  const entries: OwnEntry[] = own.map((p) => {
    const since = p.submittedAt ?? p.updatedAt;
    const days = daysBetween(since, now);
    return {
      id: p.id,
      projectName: p.projectName,
      businessUnit: p.businessUnit,
      updatedAt: p.updatedAt,
      submittedAt: p.submittedAt,
      // Whose move it is decides the words, not merely whether it was
      // submitted: "with a reviewer 6 days" over an assessment that is
      // signed and settled says the one thing that is no longer true.
      aged: agedFor(p.standing.turn, days),
      days,
      standing: p.standing,
    };
  });

  // Oldest first inside a group: a list that puts the newest thing on top
  // is how a draft quietly waits three weeks.
  const byAge = (a: OwnEntry, b: OwnEntry) => b.days - a.days;
  const of = (turn: Turn) =>
    entries.filter((e) => e.standing.turn === turn).sort(byAge);
  const yours = of("you");
  const stalest = yours[0]?.days ?? 0;

  const groups: OwnGroup[] = [
    {
      key: "you",
      title: "Needs you",
      because:
        stalest >= 7
          ? `Nothing moves on these until you finish them — and the oldest has been untouched for ${stalest} days.`
          : "Nothing moves on these until you finish them. Nothing is with a reviewer yet.",
      entries: yours,
    },
    {
      key: "reviewer",
      title: "With a reviewer",
      because:
        "Submitted and read-only. A Risk Assessor signs each answer and settles what they find — there is nothing for you to do unless they ask.",
      entries: of("reviewer"),
    },
    {
      key: "settled",
      title: "Nothing outstanding",
      because:
        "Signed and settled. Here so they are not simply gone from the list.",
      entries: of("settled"),
    },
  ];

  return { entries, groups: groups.filter((g) => g.entries.length > 0) };
}
