/**
 * Every control one assessment requires, in one shape (G-87).
 *
 * The defect this exists to close: a single controls screen showed the same
 * assessment's controls in three unrelated presentations — a "covered by your
 * platforms" list, a stack of tall question cards, and a bullet list of things
 * recorded for a reviewer. Each computed its own idea of what state a control
 * was in, so nothing could see the whole set and nothing guaranteed the three
 * agreed. This is the single definition they now share.
 *
 * Six states, and the two that were previously invisible are the point. A
 * control answered Partial or No is already a **gap** — a finding a reviewer
 * will act on — and today that reads identically to one answered Yes until
 * submission. A control whose platform attestation has **lapsed** silently
 * became a question again, with nothing on screen saying why.
 *
 * Pure: the caller fetches, this decides. Nothing is stored, so a register
 * read twice from the same answers is the same register (NFR-3).
 */
import { familyName, familyOrder } from "./attestation";
import { provisionOf, type Provision } from "./control-provision";
import { type Covered, type Inheritance, inheritedAlready } from "./inheritance";
import { CONTROLS, controlName, type AccumulatedControl } from "./severity";
import { objectivesFor, isTier3Value, type Tier3Answer } from "./tier3";

/**
 * What is true of a control right now.
 *
 * Ordered by how much attention each deserves, because that ordering is a
 * fact about the states rather than a rendering choice, and two screens
 * sorting it differently is how two screens start disagreeing.
 */
export const REGISTER_STATES = [
  "gap",
  "lapsed",
  "to-answer",
  "no-question",
  "answered",
  "inherited",
] as const;
export type RegisterState = (typeof REGISTER_STATES)[number];

/** What each state is called on screen. Never the slug. */
export const STATE_LABEL: Record<RegisterState, string> = {
  gap: "Gap",
  lapsed: "Attestation lapsed",
  "to-answer": "To answer",
  "no-question": "No question yet",
  answered: "Answered",
  inherited: "Inherited",
};

export type RegisterRow = {
  /** The owner's code — for the record and the anchor, never the screen. */
  objective: string;
  /** What a person reads. */
  name: string;
  family: string;
  familyName: string;
  /** Where the question lives, or null when the pilot asks nothing about it. */
  questionId: string | null;
  provision: Provision | null;
  state: RegisterState;
  /** The answer word where a person or a platform gave one. */
  answer: Tier3Answer | null;
  /** The platform that provides it, when it is inherited or has lapsed. */
  provider: { name: string; owner: string; attestedOn: string } | null;
  /** Why this assessment requires it, in the words the severity rules used. */
  because: string[];
  /** A person's own note, where they left one. */
  note: string;
};

export type RegisterGroup = {
  family: string;
  name: string;
  rows: RegisterRow[];
};

export type Register = {
  groups: RegisterGroup[];
  rows: RegisterRow[];
  counts: Record<RegisterState, number>;
  /** Controls a person still has to act on — the only progress worth showing. */
  owed: number;
  total: number;
};

type Stored = Record<string, { value: unknown }>;

/**
 * Build the register for one assessment.
 *
 * `owed` deliberately counts only what this person can still do something
 * about (§24.9). A control with no question is required and recorded, but
 * nobody can answer it here, so counting it as outstanding would show a
 * total somebody can never drive to zero.
 */
export function registerFor(input: {
  /** What the severity answers accumulated, with their reasons. */
  owed: AccumulatedControl[];
  stored: Stored;
  inheritance: Inheritance;
}): Register {
  const { stored, inheritance } = input;
  const asked = new Map(
    objectivesFor(input.owed.map((c) => c.objective)).map((o) => [o.id, o]),
  );
  const coveredBy = new Map(inheritance.covered.map((c) => [c.objective, c]));
  // A lapsed platform covers nothing, so its controls never reach `covered`.
  // They are still worth marking: a question that came back with no reason
  // reads as a malfunction (§24.5).
  const lapsedProvider = lapsedProviders(inheritance);

  const because = new Map<string, string[]>();
  for (const control of input.owed) {
    const list = because.get(control.objective) ?? [];
    for (const reason of control.because) {
      if (!list.includes(reason)) list.push(reason);
    }
    because.set(control.objective, list);
  }

  const rows: RegisterRow[] = [];
  for (const control of dedupe(input.owed)) {
    const objective = asked.get(control);
    const questionId = objective?.questionId ?? null;
    const value = questionId ? stored[questionId]?.value : undefined;
    const held = isTier3Value(value) ? value : null;
    const covered = coveredBy.get(control) ?? null;

    rows.push({
      objective: control,
      name: objective?.name ?? controlName(control),
      family: familyOf(control, objective?.family),
      familyName: familyName(familyOf(control, objective?.family)),
      questionId,
      provision: provisionOf(control)?.provision ?? null,
      state: stateOf({ questionId, held, covered, lapsed: lapsedProvider.has(control) }),
      answer: held?.answer ?? null,
      provider: providerOf(covered, lapsedProvider.get(control) ?? null),
      because: because.get(control) ?? [],
      note: held?.note ?? "",
    });
  }

  return assemble(rows);
}

/**
 * Which family a control belongs to.
 *
 * The catalogue covers all 51; a Tier-3 objective exists only for the ones
 * the pilot asks a question about, so it cannot be the source of truth here.
 */
function familyOf(objective: string, fromQuestion: string | undefined): string {
  return CONTROLS[objective]?.family ?? fromQuestion ?? "";
}

/** One control's state, from the only four facts that decide it. */
function stateOf(input: {
  questionId: string | null;
  held: { answer: Tier3Answer; note: string } | null;
  covered: Covered | null;
  lapsed: boolean;
}): RegisterState {
  const { questionId, held, covered, lapsed } = input;
  // Inheritance counts only once its recorded answer IS the inherited one:
  // an offer nobody accepted leaves the control still owed (G-85).
  if (covered && (questionId === null || (held && inheritedAlready(covered, held)))) {
    return "inherited";
  }
  if (held) return held.answer === "Partial" || held.answer === "No" ? "gap" : "answered";
  if (questionId === null) return "no-question";
  return lapsed ? "lapsed" : "to-answer";
}

/** Controls a chosen platform would provide if its attestation still stood. */
function lapsedProviders(
  inheritance: Inheritance,
): Map<string, { name: string; owner: string; attestedOn: string }> {
  const out = new Map<string, { name: string; owner: string; attestedOn: string }>();
  for (const entry of inheritance.lapsed) {
    for (const objective of entry.platform.provides) {
      out.set(objective, {
        name: entry.platform.name,
        owner: entry.platform.owner.name,
        attestedOn: entry.platform.attestation.lastAttested,
      });
    }
  }
  return out;
}

function providerOf(
  covered: Covered | null,
  lapsed: { name: string; owner: string; attestedOn: string } | null,
): RegisterRow["provider"] {
  if (covered) {
    return {
      name: covered.platformName,
      owner: covered.owner,
      attestedOn: covered.attestedOn,
    };
  }
  return lapsed;
}

/** The accumulator collapses duplicates by reason, not by control. */
function dedupe(owed: AccumulatedControl[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const control of owed) {
    if (seen.has(control.objective)) continue;
    seen.add(control.objective);
    out.push(control.objective);
  }
  return out;
}

/** Group by family in the owner's order, and count what each state holds. */
function assemble(rows: RegisterRow[]): Register {
  const counts = Object.fromEntries(
    REGISTER_STATES.map((state) => [state, 0]),
  ) as Record<RegisterState, number>;
  for (const row of rows) counts[row.state]++;

  const byFamily = new Map<string, RegisterRow[]>();
  for (const row of rows) {
    const list = byFamily.get(row.family) ?? [];
    list.push(row);
    byFamily.set(row.family, list);
  }
  const groups = [...byFamily.entries()]
    .map(([family, list]) => ({
      family,
      name: familyName(family),
      // Within a family, what needs doing comes before what is settled.
      rows: [...list].sort(
        (a, b) =>
          REGISTER_STATES.indexOf(a.state) - REGISTER_STATES.indexOf(b.state) ||
          a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => familyOrder(a.family) - familyOrder(b.family));

  return {
    groups,
    rows: groups.flatMap((g) => g.rows),
    counts,
    owed: counts["to-answer"] + counts.lapsed,
    total: rows.length,
  };
}

/** How the register stands, in a sentence a person reads at the top. */
export function registerLine(register: Register): string {
  if (register.total === 0) {
    return "Nothing is required here yet — the severity answers decide what this asks.";
  }
  const parts: string[] = [];
  const say = (n: number, word: string) => {
    if (n > 0) parts.push(`${n} ${word}`);
  };
  say(register.counts.inherited, "covered by your platforms");
  say(register.counts.answered, "answered");
  say(register.counts.gap, register.counts.gap === 1 ? "gap" : "gaps");
  say(register.counts["no-question"], "recorded for a reviewer");
  const owed =
    register.owed === 0
      ? "nothing left to answer"
      : `${register.owed} still to answer`;
  return `${register.total} control${register.total === 1 ? "" : "s"} — ${[...parts, owed].join(", ")}.`;
}
