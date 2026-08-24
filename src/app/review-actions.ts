"use server";

/**
 * The reviewer's two acts: signing a control answer, and settling a
 * finding (S8, §4.2, §4.3).
 *
 * Split out of `actions.ts` at S8 because that file passed the NFR-6 hard
 * cap. Executors only, like everything else in this layer (§26.1): read the
 * request, derive what the rules need from the record rather than from the
 * request, call pure logic, call the store.
 *
 * The one rule worth restating here, because it is the one that was got
 * wrong: **authority is never read from the caller's payload.** Which risk
 * area may sign a control is derived from the question being signed.
 */
import { revalidatePath } from "next/cache";
import { currentPerson } from "@/lib/current-person";
import { failure, type Result } from "@/lib/errors";
import { attestationProblem, attestationRefusal } from "@/lib/attestation";
import { type DispositionKind, dispositionProblem } from "@/lib/disposition";
import { intakeValuesFrom } from "@/lib/intake-values";
import { canAttest, NotPermitted } from "@/lib/people";
import { openProject } from "@/lib/project-access";
import {
  answerStore,
  peopleStore,
  reviewStore,
  submissionStore,
} from "@/lib/repo";
import { accumulatedFor } from "@/lib/severity";
import {
  TIER3_ANSWERS,
  objectiveForQuestion,
  objectivesFor,
  type Tier3Answer,
} from "@/lib/tier3";

/**
 * A reviewer signs off one control answer (S8, FR-16, FR-17).
 *
 * Authority is checked here and nowhere else that matters: a Risk Assessor
 * attests under their own profile, for the risk area accountable for that
 * control family. §19 requires that a forged client request fails, so the
 * screen is a convenience and this is the rule.
 */
export async function attestAnswer(
  projectId: string,
  input: {
    questionId: string;
    act: "approve" | "correct" | "not-applicable";
    correctedAnswer: string | null;
    note: string;
  },
): Promise<Result<{ attested: true }>> {
  try {
    const person = await currentPerson();
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "attestAnswer",
        new Error("not permitted"),
        "That assessment isn't yours to review.",
        { retryable: false, expected: true },
      );
    }
    // Nothing is attested before it is submitted: attesting a draft would
    // sign off answers the person can still change (§4.1).
    if (access.project.submittedAt === null) {
      return failure(
        "attestAnswer",
        new Error("not submitted"),
        "This assessment hasn't been submitted yet, so there is nothing to attest. Its answers can still change.",
        { retryable: false, expected: true },
      );
    }
    // The question being signed is the fact; which risk area owns it is
    // derived from that, here. Taking the objective from the request let a
    // caller name an area they belong to and sign a control in one they do
    // not — authority decided by the client is not authority.
    const objective = objectiveForQuestion(input.questionId);
    if (!objective) {
      return failure(
        "attestAnswer",
        new Error("unknown question"),
        "That isn't a control question in this instrument, so there is nothing to attest.",
        { retryable: false, expected: true },
      );
    }
    // And it must be a control this assessment actually requires: a question
    // nobody was asked cannot be signed off (G-42).
    const stored = await answerStore().current(projectId);
    const requiredHere = objectivesFor(
      accumulatedFor(
        stored,
        intakeValuesFrom(access.project as unknown as Record<string, unknown>),
      ).map((candidate) => candidate.objective),
    );
    if (!requiredHere.some((candidate) => candidate.id === objective.id)) {
      return failure(
        "attestAnswer",
        new Error("not required here"),
        "This assessment doesn't require that control, so there is nothing to attest.",
        { retryable: false, expected: true },
      );
    }
    const refusal = attestationRefusal(person, objective.id);
    if (refusal) {
      return failure(
        "attestAnswer",
        new NotPermitted("attest", person.role),
        refusal,
        {
          retryable: false,
          expected: true,
        },
      );
    }
    // §4.2: an attested answer is correctable only by an explicit
    // correct-and-re-attest act — never silently re-waivable. Without this,
    // an approved answer could be quietly turned into an N-A afterwards.
    const already = (await reviewStore().attestationsFor(projectId)).find(
      (row) => row.questionId === input.questionId,
    );
    if (already && input.act !== "correct") {
      return failure(
        "attestAnswer",
        new Error("already attested"),
        "This answer has already been signed. Changing it takes an explicit correct-and-re-attest — it cannot be quietly re-waived.",
        { retryable: false, expected: true },
      );
    }
    const problem = attestationProblem(
      input.act,
      input.correctedAnswer,
      input.note,
    );
    if (problem) {
      return failure("attestAnswer", new Error(problem), problem, {
        retryable: false,
        expected: true,
      });
    }
    // A correction replaces the person's answer, so it has to be an answer.
    if (
      input.correctedAnswer !== null &&
      !TIER3_ANSWERS.includes(input.correctedAnswer as Tier3Answer)
    ) {
      return failure(
        "attestAnswer",
        new Error("not an answer"),
        "A correction has to be one of the four answers.",
        { retryable: false, expected: true },
      );
    }

    await reviewStore().attest({
      projectId,
      questionId: input.questionId,
      person: person.id,
      domain: person.riskDomain,
      act: input.act,
      correctedAnswer: input.correctedAnswer,
      note: input.note,
    });
    revalidatePath(`/projects/${projectId}/review`);
    return { ok: true as const, attested: true as const };
  } catch (error) {
    return failure(
      "attestAnswer",
      error,
      "That wasn't recorded. Nothing was signed — try again in a moment.",
    );
  }
}

/**
 * A reviewer settles a finding, one of exactly four ways (S8, FR-18, §4.3).
 *
 * The same authority rule as attestation, for the same reason: settling a
 * gap in someone else's risk area is signing under a profile that isn't
 * yours. And the same shape — the screen refuses first because that is
 * kinder, this refuses because that is what makes it true, and the CHECK
 * constraints in migration 0021 refuse last because a rule worth having is
 * a rule no code path can miss.
 */
export async function disposeFinding(
  projectId: string,
  input: {
    findingId: string;
    kind: DispositionKind;
    note: string;
    remediationOwner: string | null;
    remediationDue: string | null;
    acceptedBy: string | null;
    expiresAt: string | null;
  },
): Promise<Result<{ settled: true }>> {
  try {
    const person = await currentPerson();
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "disposeFinding",
        new Error("not permitted"),
        "That assessment isn't yours to review.",
        { retryable: false, expected: true },
      );
    }
    // The finding must belong to this assessment. Without this, a finding id
    // from anywhere could be settled by anyone with access to any project.
    const findings = await submissionStore().findingsFor(projectId);
    const finding = findings.find((row) => row.id === input.findingId);
    if (!finding) {
      return failure(
        "disposeFinding",
        new Error("no such finding"),
        "That finding isn't part of this assessment.",
        { retryable: false, expected: true },
      );
    }
    // Authority comes from the finding's own question, never from the
    // request — the same hole as attestation, and the same fix.
    const objective = objectiveForQuestion(finding.questionId);
    const refusal = objective
      ? attestationRefusal(person, objective.id)
      : "That finding isn't about a control in this instrument.";
    if (refusal) {
      return failure(
        "disposeFinding",
        new NotPermitted("settle a finding", person.role),
        refusal,
        { retryable: false, expected: true },
      );
    }
    // Who may accept a risk: a real person with the authority to attest, and
    // never the one settling it. A name typed into the request is not a
    // second pair of eyes, and a string comparison is not four-eyes.
    const everyone = await peopleStore().list();
    const problem = dispositionProblem(input, {
      resolvedBy: person.id,
      acceptors: everyone
        .filter(
          (someone) => canAttest(someone.role) && someone.id !== person.id,
        )
        .map((someone) => someone.id),
      people: everyone.map((someone) => someone.id),
    });
    if (problem) {
      return failure("disposeFinding", new Error(problem), problem, {
        retryable: false,
        expected: true,
      });
    }

    await reviewStore().dispose({
      findingId: input.findingId,
      kind: input.kind,
      resolvedBy: person.id,
      note: input.note,
      remediationOwner: input.remediationOwner,
      remediationDue: input.remediationDue
        ? new Date(input.remediationDue)
        : null,
      acceptedBy: input.acceptedBy,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    revalidatePath(`/projects/${projectId}/review`);
    return { ok: true as const, settled: true as const };
  } catch (error) {
    return failure(
      "disposeFinding",
      error,
      "That wasn't recorded. The finding is still open — try again in a moment.",
    );
  }
}
