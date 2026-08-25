"use server";

/**
 * Reading a document into an assessment (FR-40, G-66).
 *
 * Split from `agent-actions.ts` when that file reached NFR-6's 800-line
 * ceiling. The seam is the natural one: everything here is about turning a
 * file somebody has into proposals they can accept, and none of it is
 * about the conversation.
 *
 * The rule the whole file serves: **it proposes, they accept.** A drafted
 * answer is an unconfirmed answer carrying the passage it came from, and it
 * counts as an answer nowhere until somebody writes one in their own name.
 */
import { revalidatePath } from "next/cache";
import { agentTransport } from "@/lib/agent";
import { quoteAppearsVerbatim } from "@/lib/agent-contract";
import { currentPerson } from "@/lib/current-person";
import { documentStore } from "@/lib/documents";
import { failure, isFailure, type Result } from "@/lib/errors";
import { extractText } from "@/lib/extract";
import { gateStates } from "@/lib/instrument";
import { intakeValuesFrom } from "@/lib/intake-values";
import { INTAKE_SECTIONS } from "@/lib/intake";
import { canAnswer, NotPermitted } from "@/lib/people";
import { editableProject, openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo";
import { assessmentContext } from "./assessment-context";

/**
 * How much text the pilot will take from one document, and the most it will
 * accept at all.
 *
 * Truncating silently meant a quote from beyond the cut could never be
 * found, and the person was never told which part had been read. A 2.6 MB
 * file of noise was accepted and stored as evidence.
 */
const MAX_DOCUMENT_CHARS = 60_000;
const MAX_UPLOAD_CHARS = 400_000;

/**
 * Read a document the requester supplied and propose answers from it.
 *
 * Every proposal is **unconfirmed** and carries the passage it came from.
 * It is not their answer until they say so — that is the whole point, and
 * the schema enforces it: a drafted row cannot arrive confirmed, and it
 * cannot exist without its quote (migration 0023).
 *
 * The quote is re-checked here, against the document as stored, even though
 * the agent already checked it. The two checks are not redundant: the
 * agent's protects the wire, this one protects the record, and only one of
 * them is on this side of the deployment boundary.
 */
/**
 * The same thing, from a file rather than from text already read.
 *
 * The browser cannot read a PDF or a .docx, so the bytes travel here and
 * the extraction happens on this side. Every failure is a sentence the
 * person can act on — an unreadable file must never arrive as empty text,
 * because the drafting engine would abstain on everything and that would be
 * reported as the document having said nothing.
 */
export async function draftFromFile(
  projectId: string,
  form: FormData,
): Promise<
  Result<{
    proposed: number;
    abstained: number;
    document: string;
    truncated: boolean;
  }>
> {
  const file = form.get("file");
  if (!(file instanceof File)) {
    return failure(
      "draftFromFile",
      new Error("no file"),
      "Nothing arrived to read. Try attaching it again.",
      { retryable: true, expected: true },
    );
  }
  const read = await extractText(
    file.name,
    file.type,
    await file.arrayBuffer(),
  );
  if (!read.ok) {
    return failure("draftFromFile", new Error("unreadable"), read.why, {
      retryable: false,
      expected: true,
    });
  }
  return draftFromDocument(projectId, { name: file.name, body: read.text });
}

/**
 * Draft the activity description from a file they gave us (FR-46).
 *
 * The other upload path proposes Yes/No answers to risk-area questions. This
 * one writes the field the whole assessment routes on, which is the thing
 * somebody with a vendor overview open in another window was retyping by
 * hand.
 *
 * It does **not** save. The draft comes back to the screen, they read it,
 * and taking it puts the text in the field for them to edit and attest to —
 * the same road a suggested rewrite travels, and for the same reason: a
 * description is theirs to sign, so it cannot arrive already written in
 * their name.
 */
export async function describeFromFile(
  projectId: string,
  form: FormData,
): Promise<
  Result<{
    description: string;
    placeholders: string[];
    from: string;
    fields: Array<{
      field: string;
      label: string;
      value: string;
      quote: string;
    }>;
    documentName: string;
  }>
> {
  try {
    const file = form.get("file");
    if (!(file instanceof File)) {
      return failure(
        "describeFromFile",
        new Error("no file"),
        "Nothing arrived to read. Try attaching it again.",
        { retryable: true, expected: true },
      );
    }
    const person = await currentPerson();
    const allowed = await editableProject(projectId, "describeFromFile");
    if (isFailure(allowed)) return allowed;
    const access = await openProject(projectId);
    if (!access.ok || access.project.createdBy !== person.id) {
      return failure(
        "describeFromFile",
        new NotPermitted("draft a description", person.role),
        "A description is signed by the person whose assessment it is, so drafting one is theirs to ask for.",
        { retryable: false, expected: true },
      );
    }
    if (!canAnswer(person.role)) {
      return failure(
        "describeFromFile",
        new NotPermitted("draft a description", person.role),
        "This role does not answer assessment questions, so there is nothing to draft.",
        { retryable: false, expected: true },
      );
    }

    const read = await extractText(
      file.name,
      file.type,
      await file.arrayBuffer(),
    );
    if (!read.ok) {
      return failure("describeFromFile", new Error("unreadable"), read.why, {
        retryable: false,
        expected: true,
      });
    }

    const transport = agentTransport();
    if (!transport.available) {
      return failure(
        "describeFromFile",
        new Error("no agent"),
        "No assistant is connected, so nothing was drafted. You can still write it yourself.",
        { retryable: false, expected: true },
      );
    }

    const values = intakeValuesFrom(
      access.project as unknown as Record<string, unknown>,
    );
    const drafted = await transport.describeIntake({
      label: "Project Description",
      existing:
        typeof values.projectDescription === "string"
          ? values.projectDescription
          : "",
      document: read.text.slice(0, MAX_DOCUMENT_CHARS),
      documentName: file.name,
      fields: intakeFieldsWithOptions(),
    });

    if (!("description" in drafted)) {
      return failure(
        "describeFromFile",
        new Error(drafted.why),
        drafted.why === "refused"
          ? `I read ${file.name}, but I could not turn it into a description worth showing you. It may not say much about the activity itself.`
          : `I could not draft one just then — that is about me, not your document. Worth trying again.`,
        { retryable: drafted.why === "unavailable", expected: true },
      );
    }

    return {
      ok: true as const,
      description: drafted.description,
      placeholders: drafted.placeholders,
      from: drafted.from,
      fields: drafted.fields,
      documentName: file.name,
    };
  } catch (error) {
    return failure(
      "describeFromFile",
      error,
      "I couldn't read that just then. Nothing was changed.",
    );
  }
}

export async function draftFromDocument(
  projectId: string,
  document: { name: string; body: string },
): Promise<
  Result<{
    proposed: number;
    abstained: number;
    document: string;
    truncated: boolean;
  }>
> {
  try {
    const person = await currentPerson();
    // editableProject, not openProject: a submitted assessment is closed to
    // everyone, and reading a document into one would put a proposal behind
    // a declaration somebody has already signed.
    const allowed = await editableProject(projectId, "draftFromDocument");
    if (isFailure(allowed)) return allowed;
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "draftFromDocument",
        new Error("not permitted"),
        "That assessment isn't yours to work on.",
        { retryable: false, expected: true },
      );
    }
    // The requester's act, and the record says so — so it must be theirs.
    // canAnswer alone let an assessor record a Tier-1 answer on somebody
    // else's assessment, indistinguishable from the owner's own.
    if (access.project.createdBy !== person.id) {
      return failure(
        "draftFromDocument",
        new NotPermitted("draft answers", person.role),
        "Reading a document into an assessment proposes answers in the owner's name, so it is theirs to do.",
        { retryable: false, expected: true },
      );
    }
    if (!canAnswer(person.role)) {
      return failure(
        "draftFromDocument",
        new NotPermitted("draft answers", person.role),
        "Reading a document into an assessment is the requester's act — the answers proposed would be theirs to confirm.",
        { retryable: false, expected: true },
      );
    }
    const whole = document.body.trim();
    if (whole.length > MAX_UPLOAD_CHARS) {
      return failure(
        "draftFromDocument",
        new Error("too large"),
        `That file is too large to read — about ${Math.round(whole.length / 1000)},000 characters, and the limit is ${MAX_UPLOAD_CHARS / 1000},000. Try the section that covers security and data.`,
        { retryable: false, expected: true },
      );
    }
    const body = whole.slice(0, MAX_DOCUMENT_CHARS);
    const truncated = whole.length > MAX_DOCUMENT_CHARS;
    if (body === "") {
      return failure(
        "draftFromDocument",
        new Error("empty"),
        "That file had no readable text in it, so there was nothing to read.",
        { retryable: false, expected: true },
      );
    }

    const transport = agentTransport();
    if (!transport.available) {
      return failure(
        "draftFromDocument",
        new Error("no agent"),
        "No assistant is connected, so nothing was read. You can still answer the questions yourself.",
        { retryable: false, expected: true },
      );
    }

    const stored = await documentStore().add({
      projectId,
      name: document.name.trim() || "the document you added",
      body,
      uploadedBy: person.id,
    });

    // Only the risk-area questions nobody has answered. A draft must never
    // overwrite something a person already decided.
    const answers = await answerStore().current(projectId);
    const values = intakeValuesFrom(
      access.project as unknown as Record<string, unknown>,
    );
    const open = gateStates(answers, values).filter(
      (state) => state.answer === null,
    );
    // The questions we actually asked about. Answers are insert-only and
    // the newest row wins, so a draft for an already-answered gate would
    // arrive on top of a person's own answer and show as a proposal over a
    // decision they had already made.
    const openQuestionIds = new Set(
      open.map((state) => state.category.questionId),
    );

    if (open.length === 0) {
      return {
        ok: true as const,
        proposed: 0,
        abstained: 0,
        document: stored.name,
        truncated,
      };
    }

    const assessment = await assessmentContext(
      projectId,
      access.project as unknown as Record<string, unknown>,
    );
    const versionId = await answerStore().activeVersionId("tier1-gates");

    const drafts: Array<{
      projectId: string;
      questionId: string;
      value: string | string[];
      basis: string;
      sourceQuote: string;
      sourceRef: string;
      instrumentVersionId: string;
    }> = [];
    let abstained = 0;

    let failed: string | null = null;
    for await (const event of transport.run({
      task: "draft",
      projectId,
      conversationId: `${projectId}:${person.id}`,
      questionIds: open.map((state) => state.category.questionId),
      questions: open.map((state) => ({
        questionId: state.category.questionId,
        question: `${state.category.text} (risk area: ${state.category.name})`,
        answerShape: 'one of: "Yes", "No"',
        assessment,
        sources: [{ id: stored.name, text: body }],
      })),
    })) {
      // An error is the whole answer, not something to skip past. Dropping
      // these reported "Every question was already answered" when the
      // service was simply unreachable — two false statements in one line.
      if (event.type === "error") {
        failed = event.message;
        continue;
      }
      if (event.type !== "draft") continue;
      const answer = event.answer;
      if (answer.basis === "not_stated" || answer.value === null) {
        abstained += 1;
        continue;
      }
      // The record's own check. The agent already did this; this one is on
      // the side of the boundary that owns the consequence.
      if (!answer.quote || !quoteAppearsVerbatim(answer.quote, body)) {
        abstained += 1;
        continue;
      }
      // It must be one of the questions we actually asked about — not
      // merely a real question. Answers are insert-only and the newest row
      // wins, so a draft for an already-answered gate would arrive on top
      // of a person's own answer and show as a proposal over a decision
      // they had already made.
      if (!openQuestionIds.has(answer.questionId)) {
        abstained += 1;
        continue;
      }
      // The value must be an answer this question actually offers. Nothing
      // checked it before, and gateStates coerces anything that is not
      // "Yes" to "No" — so a hedge like "Probably, if the pilot expands"
      // closed an entire risk area. A non-answer must never produce a
      // negative answer with consequences (§3.2.1, positive evidence only).
      if (answer.value !== "Yes" && answer.value !== "No") {
        abstained += 1;
        continue;
      }
      drafts.push({
        projectId,
        questionId: answer.questionId,
        value: answer.value,
        basis: answer.basis,
        sourceQuote: answer.quote,
        sourceRef: stored.name,
        instrumentVersionId: versionId,
      });
    }

    if (failed && drafts.length === 0) {
      return failure("draftFromDocument", new Error(failed), failed, {
        retryable: true,
        expected: true,
      });
    }

    await answerStore().recordDrafts(drafts);
    revalidatePath(`/projects/${projectId}`);
    return {
      ok: true as const,
      proposed: drafts.length,
      abstained,
      document: stored.name,
      // Said out loud: a quote from past the cut could never be found, and
      // silence about that reads as "I read all of it".
      truncated,
    };
  } catch (error) {
    return failure(
      "draftFromDocument",
      error,
      "That document could not be read just then. Nothing was proposed and nothing was changed.",
    );
  }
}

/**
 * The intake fields a document may settle: those offering a fixed set of
 * answers.
 *
 * Free text is excluded on purpose. A wrong sentence needs a person reading
 * it; a wrong pick has exactly one right alternative and can be checked
 * against the instrument, which is what makes proposing it safe at all.
 */
function intakeFieldsWithOptions(): Array<{
  id: string;
  label: string;
  options: string[];
}> {
  const fields: Array<{ id: string; label: string; options: string[] }> = [];
  for (const section of INTAKE_SECTIONS) {
    for (const field of section.fields) {
      if (field.options && field.options.length > 0) {
        fields.push({
          id: field.id,
          label: field.label,
          options: field.options,
        });
      }
    }
  }
  return fields;
}
