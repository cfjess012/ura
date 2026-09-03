/**
 * S? — packaging: the assessment as a record another system can replay.
 *
 * SPEC §4.5 sets three conditions and they are the whole design: every
 * visible question attested, zero open findings, zero open conflicts. Not
 * because packaging is a reward for tidiness, but because the export is a
 * *claim* — it says a named person checked each of these answers — and an
 * export assembled over an unattested answer would make that claim on
 * somebody's behalf without their signature.
 *
 * So the gate is not a courtesy and the reasons are named individually. A
 * screen that says "not ready" without saying what is missing is a locked
 * door, and this product does not have those (FR-14 is the same instinct
 * one stage earlier).
 *
 * What goes in is also spec'd: every attested value including explicit N-A
 * strings, plus the coverage of what was asked and why. The coverage is the
 * part people forget — a record of answers alone cannot tell a downstream
 * reader what was *not* asked, and "we never asked" is different from "they
 * said no".
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import { findingIsOpen, findingStanding, type FindingKind } from "./submission";
import { gateStates } from "./instrument";
import { asksNothingFurther } from "./severity";
import { OBJECTIVES } from "./tier3";
import { labelOf, type ReferenceAnswer } from "./reference";
import type { Rating } from "./rating-of";
import { CROSSWALK_VERSION, obligationsFor } from "./crosswalk";
import { RATING } from "./rating";
import type { FindingRow } from "./repo-review";
import policies from "@/data/reference/policies.json";

/** Why an assessment cannot be packaged yet, in a person's words. */
export type Blocker = {
  kind: "unattested" | "open-finding" | "not-submitted";
  /** What to tell them. */
  says: string;
  /** How many things of this kind — 0 where the count adds nothing. */
  count: number;
  /**
   * Which ones, by the text a person recognises (§19 requires the refusal
   * name questions by text). A count says how much is left; only the names
   * say what, and "4 control answers" sends somebody back to a queue to
   * work out which four.
   */
  names: string[];
  /** Where they go to clear it. Relative to the project. */
  href: string;
};

/** One attested answer, as the payload carries it. */
export type PackagedAnswer = {
  questionId: string;
  /** The objective's own id, so a downstream reader is not parsing ours. */
  objective: string;
  label: string;
  /**
   * What was attested. An N-A is the string "N-A" rather than an omission:
   * §4.5 is explicit, and a missing key reads as "never asked" when it
   * means "asked, and does not apply here".
   */
  value: string;
  /** The reviewer's own words at the moment of signing. */
  note: string;
  attestedBy: string;
  attestedAt: string;
  /** approve | correct | not-applicable — the act, not just the outcome. */
  act: string;
  /**
   * The external obligations this control helps satisfy, frozen with the
   * edition each reference came from. An auditor reading the export a year
   * later needs to know which version of a framework the mapping was made
   * against, and a screen-only crosswalk records nothing.
   */
  frameworks: Array<{
    framework: string;
    edition: string;
    ref: string;
    heading: string;
    relationship: string;
    because: string;
  }>;
};

/** What was asked of this assessment, and why it was asked. */
export type Coverage = {
  area: string;
  standing: "applies" | "closed" | "recorded";
  because: string;
};

/** A finding and how it was settled. Unsettled ones block the package. */
export type PackagedFinding = {
  objective: string;
  objectiveName: string;
  kind: FindingKind;
  note: string;
  /** Present exactly when the finding cited a clause. */
  clause?: { reference: string; clauseId: string; version: string; text: string };
  settlement: {
    kind: string;
    /**
     * Where it stands at packaging — settled, or a remediation whose date
     * has passed. A raw due date lets a reader compute this; the word means
     * nobody has to (S13 verifier F2).
     */
    standing: "settled" | "overdue";
    note: string;
    resolvedBy: string;
    resolvedAt: string;
    /** Remediation only. */
    owner?: string;
    due?: string;
    /** Risk acceptance only — four eyes, and when it lapses. */
    acceptedBy?: string;
    expiresAt?: string;
  };
};

export type Package = {
  /** Identity, so a replayed record can be matched to its source. */
  assessment: {
    id: string;
    name: string;
    submittedBy: string;
    submittedAt: string;
    classification: string;
  };
  /** What the instrument asked, and why — the part a bare answer list loses. */
  coverage: Coverage[];
  answers: PackagedAnswer[];
  /**
   * Controls this activity requires that no question was asked about, with
   * the reasons they were required. Coverage is by risk area and answers
   * come from attestations, so without this the boundary the objectives
   * screen declares vanished from the one artefact that outlives the
   * screen (S13 audit, defect d). "We never asked" is a different fact from
   * "they said it is in place".
   */
  controlsRecorded: Array<{ objective: string; name: string; because: string[] }>;
  findings: PackagedFinding[];
  /**
   * The rating at the moment of packaging, frozen — §4.6 permits a grade to
   * be computed at packaging, and a replayable record needs the reading it
   * was exported under, not whichever the rules produce later. Bands with
   * their reasons; never a number.
   */
  rating: {
    inherent: { band: string; because: string[] };
    residual: { band: string; because: string[] };
    exceedsAppetite: Array<{ scope: string; label: string; band: string; max: string; because: string; escalateTo: string }>;
    edition: string;
  };
  /**
   * What produced this. A replay against a different instrument version is
   * a different question, and a reader has to be able to tell.
   */
  provenance: {
    packagedAt: string;
    packagedBy: string;
    /**
     * The editions that asked these questions, read from what each answer
     * pinned — not whichever editions happen to be active at export time.
     * A list, because an assessment answered across an edition boundary
     * used two of the same slug and a map would have to pick one.
     */
    instrumentVersions: Array<{ slug: string; version: string }>;
    /** Which edition of the policy library judged the findings (§22.5). */
    policyVersion: string | null;
  };
};

/**
 * What stands between this assessment and a package.
 *
 * An empty array means it can be packaged. Each blocker names its own count
 * and where to go, because "3 answers still need attesting" is actionable
 * and "not ready" is not.
 */
export function blockers(input: {
  submitted: boolean;
  /** Control questions required by the answers so far, id and text both. */
  required: Array<{ questionId: string; label: string }>;
  /** The ids of those carrying a current attestation. */
  attested: string[];
  /**
   * The findings that are open, named by the objective each is against.
   * A count was enough to refuse and not enough to act on, and deciding
   * *which* findings are open is not this module's judgement to make —
   * `findingIsOpen` owns that, and an expired acceptance is open (§4.3).
   */
  openFindings: string[];
}): Blocker[] {
  const found: Blocker[] = [];

  if (!input.submitted) {
    found.push({
      kind: "not-submitted",
      says: "This has not been submitted yet, so there is nothing signed to package.",
      count: 0,
      names: [],
      href: "/submit",
    });
    // Everything below is a consequence of that, and listing three symptoms
    // of one cause reads as three problems.
    return found;
  }

  const signed = new Set(input.attested);
  const waiting = input.required.filter((q) => !signed.has(q.questionId));
  if (waiting.length > 0) {
    const names = waiting.map((q) => q.label);
    found.push({
      kind: "unattested",
      says: `${waiting.length} control answer${waiting.length === 1 ? " has" : "s have"} not been attested — ${sentenceList(names)}. The package says a named person checked each answer, so it cannot include one nobody signed.`,
      count: waiting.length,
      names,
      href: "/review",
    });
  }

  const open = input.openFindings;
  if (open.length > 0) {
    found.push({
      kind: "open-finding",
      says: `${open.length} finding${open.length === 1 ? " is" : "s are"} still open — ${sentenceList(open)}. A package with an unsettled finding would export a question as though it were an answer.`,
      count: open.length,
      names: open,
      href: "/review",
    });
  }

  return found;
}

/**
 * Names inside a sentence, not a comma-separated dump.
 *
 * Cut past four with a count of the rest: twenty names in one sentence is
 * a wall somebody skips, and the screen lists every one of them underneath
 * regardless — the sentence is there to make the refusal specific, not to
 * be the only place the names appear.
 */
function sentenceList(names: string[], limit = 4): string {
  const shown = names.slice(0, limit);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")}, and ${rest} more`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * Which findings are open, named by the objective each is against (§4.3).
 *
 * Here, in the pure module, rather than in the action that calls it —
 * because *the action* is exactly where this lived when it was wrong. It
 * counted disposition rows: any settlement at all meant settled. A risk
 * acceptance past its expiry has a row and is open, so the review queue
 * flagged findings the packaging gate was letting through, one assessment
 * and one moment reading two ways.
 *
 * No unit test could reach it there. That is not a coincidence — it is why
 * the defect shipped, and moving it is the fix for the gap as much as for
 * the bug.
 */
export function openFindingNames(
  findings: Array<{ id: string; objectiveName: string }>,
  /** The settlement in force per finding, if there is one. */
  settlements: Map<string, { kind: string; expiresAt: Date | null }>,
  now: Date,
): string[] {
  return findings
    .filter((finding) => findingIsOpen(settlements.get(finding.id) ?? null, now))
    .map((finding) => finding.objectiveName);
}

/**
 * Which instrument editions the answers in the record actually pinned.
 *
 * `answered` arrives newest-first. The latest answer per question is the
 * one in the package — the same rule `current()` uses to decide what an
 * answer *is* — so an answer given under one edition and re-answered under
 * the next names only the second. Naming both would credit an edition
 * whose answer was superseded and is not in the file.
 *
 * Pure and here rather than inside the store, for the reason B-1 taught:
 * logic that no unit test can reach is where the defects live.
 */
export function editionsPinned(
  answered: Array<{ questionId: string; versionId: string }>,
): string[] {
  const seen = new Set<string>();
  const pinned = new Set<string>();
  for (const row of answered) {
    if (seen.has(row.questionId)) continue;
    seen.add(row.questionId);
    pinned.add(row.versionId);
  }
  return [...pinned];
}

/** Can this be packaged? The same rule, said the short way. */
export function canPackage(input: Parameters<typeof blockers>[0]): boolean {
  return blockers(input).length === 0;
}

/**
 * A stable filename for the download.
 *
 * Dated and slugged from the name, so somebody with four of these in a
 * downloads folder can tell them apart without opening them.
 */
export function packageFilename(name: string, at: Date): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "assessment";
  const day = at.toISOString().slice(0, 10);
  return `${slug}-${day}.json`;
}

/** An objective by its question id, for answers outside the required set. */
function objectiveByQuestion(questionId: string) {
  return OBJECTIVES.find((o) => o.questionId === questionId) ?? null;
}

export function nameIn(
  everyone: Array<{ id: string; name: string }>,
  id: string,
): string {
  return everyone.find((p) => p.id === id)?.name ?? id;
}

/** A reference answer renders as the label it was chosen by (NFR-22). */
function shown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(shown).join(", ");
  if (typeof value === "object" && value !== null && "label" in value) {
    return labelOf(value as ReferenceAnswer);
  }
  return String(value);
}

/**
 * The package payload, assembled from what the caller has already fetched.
 *
 * Pure, and here rather than in the action, because a payload nobody can
 * test is a payload nobody has checked: the frozen rating block reached the
 * screen with no test at any tier while this lived inside `"use server"`
 * (S15 delta verification). The executor fetches; this decides.
 */
export function assemblePackage(input: {
  project: {
    id: string;
    projectName: string;
    submittedAt: Date | null;
    submittedBy: string | null;
  };
  intake: Record<string, unknown>;
  stored: Record<string, { value: unknown }>;
  required: Array<{ id: string; questionId: string; name: string }>;
  recorded: Array<{ objective: string; name: string; because: string[] }>;
  rating: Rating;
  latest: Map<
    string,
    {
      act: string;
      note: string;
      attestedBy: string;
      attestedAt: Date;
      correctedAnswer: string | null;
    }
  >;
  findings: FindingRow[];
  /**
   * The settlement in force per finding. A Map rather than the raw rows:
   * dispositions are insert-only and a finding settled twice has two, and
   * keying the array by findingId kept whichever happened to come last —
   * the oldest, since they arrive newest first.
   */
  settlements: Map<
    string,
    {
      findingId: string;
        kind: string;
      note: string;
      resolvedBy: string;
      resolvedAt: Date;
      remediationOwner: string | null;
      remediationDue: Date | null;
      acceptedBy: string | null;
      expiresAt: Date | null;
    }
  >;
  everyone: Array<{ id: string; name: string }>;
  by: string;
  now: Date;
  instrumentVersions: Array<{ slug: string; version: string }>;
}): Package {
  const {
    project,
    intake,
    stored,
    required,
    latest,
    findings,
    settlements,
    everyone,
  } = input;
  const who = (id: string | null) => (id ? nameIn(everyone, id) : "");

  const states = gateStates(stored as never, intake as never);
  const coverage = states.map((s) => ({
    area: s.category.name,
    standing: (!(s.settled || s.answer === "Yes")
      ? "closed"
      : asksNothingFurther(s.category.key)
        ? "recorded"
        : "applies") as "applies" | "closed" | "recorded",
    because:
      s.because ??
      (s.answer === "Yes" ? "it applies to this activity" : "it was ruled out"),
  }));

  /**
   * Every attested value (§4.5), not only the currently-required ones.
   *
   * The gate is about the required set — nothing may be packaged while a
   * required answer is unsigned. What goes IN is a different question, and
   * the spec answers it differently: "every attested value". An assessment
   * whose severity later narrowed can hold a signed answer that is no
   * longer required, and dropping it would publish a finding whose answer
   * is missing from the same file.
   */
  const named = new Map(required.map((o) => [o.questionId, o]));
  const answers = [...latest.entries()]
    .map(([questionId, signed]) => {
      const objective =
        named.get(questionId) ?? objectiveByQuestion(questionId);
      if (!objective) return null;
      const given = stored[questionId]?.value as
        { answer?: string; note?: string } | undefined;
      // The attested value, not the submitted one: a correction replaces
      // what the record says, and an N-A is the string, never an omission.
      const value =
        signed.act === "not-applicable"
          ? "N-A"
          : (signed.correctedAnswer ?? given?.answer ?? "");
      return {
        questionId,
        objective: objective.id,
        label: objective.name,
        value,
        note: signed.note || given?.note || "",
        attestedBy: who(signed.attestedBy),
        attestedAt: signed.attestedAt.toISOString(),
        act: signed.act,
        // The obligation and the edition it was read from, frozen together.
        frameworks: obligationsFor(objective.id).map((o) => ({
          framework: o.frameworkName,
          edition: o.edition,
          ref: o.ref,
          heading: o.heading,
          relationship: o.relationship,
          because: o.because,
        })),
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => a.objective.localeCompare(b.objective));

  const packagedFindings = findings.map((f) => {
    const d = settlements.get(f.id);
    return {
      objective: f.objective,
      objectiveName: f.objectiveName,
      kind: f.kind as Package["findings"][number]["kind"],
      note: f.note,
      // Present exactly when the finding cited a clause — the same
      // invariant the findings table enforces with a CHECK.
      ...(f.citation
        ? {
            clause: {
              reference: f.citation.policyRef,
              clauseId: f.citation.clauseId,
              version: f.citation.policyVersion,
              text: f.citation.clauseText,
            },
          }
        : {}),
      settlement: {
        kind: d?.kind ?? "",
        standing:
          findingStanding(d ?? null, input.now) === "overdue"
            ? ("overdue" as const)
            : ("settled" as const),
        note: d?.note ?? "",
        resolvedBy: who(d?.resolvedBy ?? null),
        resolvedAt: d?.resolvedAt?.toISOString() ?? "",
        ...(d?.remediationOwner ? { owner: who(d.remediationOwner) } : {}),
        ...(d?.remediationDue ? { due: d.remediationDue.toISOString() } : {}),
        ...(d?.acceptedBy ? { acceptedBy: who(d.acceptedBy) } : {}),
        ...(d?.expiresAt ? { expiresAt: d.expiresAt.toISOString() } : {}),
      },
    };
  });

  return {
    assessment: {
      id: project.id,
      name: project.projectName,
      submittedBy: who(project.submittedBy),
      submittedAt: project.submittedAt?.toISOString() ?? "",
      classification: shown(intake.dataClassification),
    },
    coverage,
    answers,
    controlsRecorded: input.recorded.map((c) => ({
      objective: c.objective,
      name: c.name,
      because: c.because,
    })),
    findings: packagedFindings,
    rating: {
      inherent: input.rating.inherent,
      residual: input.rating.residual,
      // The whole breach, including where it was routed — a replayable record
      // has to say who the breach went to, not only that it happened.
      exceedsAppetite: input.rating.breaches.map((b) => ({
        scope: b.scope,
        label: b.label,
        band: b.band,
        max: b.max,
        because: b.because,
        escalateTo: b.escalateTo,
      })),
      edition: input.rating.edition,
    },
    provenance: {
      packagedAt: new Date().toISOString(),
      packagedBy: input.by,
      // Which edition of the instrument asked these questions. A replay
      // against a different one is a different question, and a reader has
      // to be able to tell.
      // What asked these questions, from what the answers pinned. This read
      // the *currently activated* editions, which is the same answer right
      // up until the instrument is re-versioned — and a replayable record
      // that changes its own provenance when the instrument moves is the
      // one thing it must not do. The screen promised what the code did
      // not (§24: copy is a claim).
      // The rating edition belongs with the editions that asked the
      // questions, and the payload names it rather than trusting a caller
      // to remember: a replayer could otherwise not tell which rules
      // produced the frozen bands.
      instrumentVersions: [
        ...input.instrumentVersions.filter(
          (v) => v.slug !== RATING.slug && v.slug !== CROSSWALK_VERSION.split("@")[0],
        ),
        { slug: RATING.slug, version: RATING.version },
        {
          slug: CROSSWALK_VERSION.split("@")[0]!,
          version: CROSSWALK_VERSION.split("@")[1]!,
        },
      ],
      policyVersion:
        (policies as { version?: string }).version ??
        (policies as { policies?: Array<{ version?: string }> }).policies?.[0]
          ?.version ??
        null,
    },
  };
}
