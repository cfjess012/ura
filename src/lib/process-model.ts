/**
 * The assessment as a map a person can walk (FR-48).
 *
 * Every stop is what one screen does, said in plain words: what the person
 * sees, the rules that decide what happens, and what — if anything — it
 * leaves behind. Two lenses, because two people walk it: the requester who
 * describes the activity and signs for the answers, and the risk assessor
 * who signs each answer and settles what it raised.
 *
 * **Every number here is computed from the instrument, never typed.** A
 * map that said "eleven risk areas" in prose would be wrong the day a
 * twelfth was added and nobody would know (G-75, the demo-truth rule). The
 * sentences are the product's own claims about itself and are held to the
 * same standard as a screen: each one describes a thing that runs.
 *
 * Pure: data in, stops out. No framework, no store, no environment.
 */
import { DISPOSITION_KINDS, DISPOSITION_LABEL } from "./disposition";
import {
  askableCategories,
  CATEGORIES,
  type Category,
} from "./instrument";
import { INTAKE_SECTIONS } from "./intake";
import { asksNothingFurther, SEVERITY_QUESTIONS } from "./severity";
import { OBJECTIVES, TIER3_ANSWERS } from "./tier3";

export type Lens = "requester" | "assessor";

/** Something the process leaves behind — a record somebody else can open. */
export type Artifact = {
  name: string;
  /** Where it lives and who can see it. */
  kept: string;
};

export type Stop = {
  id: string;
  /** The stage in the four-stage journey the header shows. */
  stage: 1 | 2 | 3 | 4;
  stageName: string;
  title: string;
  /** What the person sees, in one or two sentences. */
  sees: string;
  /** The rules that decide what happens here. */
  logic: string[];
  produces: Artifact[];
  /** Which screen, in plain words. */
  where: string;
  /** A real count from the instrument, where one belongs on the tile. */
  count?: string;
};

export type ProcessModel = {
  lens: Lens;
  stops: Stop[];
  /** The rules that hold everywhere, so they are not repeated per stop. */
  everywhere: string[];
};

const STAGE_NAMES: Record<Stop["stage"], string> = {
  1: "Tell us about it",
  2: "Assess",
  3: "Review & attest",
  4: "Package",
};

/** The counts, from the data. Exported so a test can hold the map to them. */
export function facts() {
  const withParts = CATEGORIES.filter((c) => c.pathQuestion);
  return {
    sections: INTAKE_SECTIONS.length,
    fields: INTAKE_SECTIONS.reduce(
      (sum, s) => sum + s.fields.filter((f) => f.type !== "note").length,
      0,
    ),
    areas: CATEGORIES.length,
    asked: askableCategories().length,
    standing: CATEGORIES.filter((c) => c.alwaysApplies).length,
    // Every area that asks nothing further, the standing one included — the
    // same seven the gate screen names as the pilot’s boundary (FR-35).
    quiet: CATEGORIES.filter((c) => asksNothingFurther(c.key)).length,
    withParts: withParts.length,
    parts: withParts.reduce(
      (sum, c) => sum + (c.pathQuestion?.options.length ?? 0),
      0,
    ),
    severity: SEVERITY_QUESTIONS.length,
    objectives: OBJECTIVES.length,
    withFollowUps: OBJECTIVES.filter((o) => o.children.length > 0).length,
    answers: TIER3_ANSWERS.length,
    dispositions: DISPOSITION_KINDS.length,
  };
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const areaNames = (areas: Category[]) => areas.map((c) => c.short).join(", ");

const stop = (
  stage: Stop["stage"],
  id: string,
  rest: Omit<Stop, "id" | "stage" | "stageName">,
): Stop => ({ id, stage, stageName: STAGE_NAMES[stage], ...rest });

export function processModel(lens: Lens): ProcessModel {
  const f = facts();
  const everywhere = [
    "Only a stated answer counts. A blank, an “I don’t know” and a guess are three different things, and none of them is a No.",
    "Nothing derived is stored. What applies, what is required and what is outstanding are worked out again on every screen from the answers.",
    "Answers are added, never overwritten. A correction sits in front of the old answer; both stay on the record with who gave them.",
    "The assistant proposes; a person decides. Nothing it reads or drafts becomes an answer until somebody accepts it in their own name.",
    "Nothing here blocks. A thin description, a skipped area or a stopped assistant is recorded and carried forward — a reviewer picks it up.",
  ];
  return {
    lens,
    everywhere,
    stops: lens === "requester" ? requester(f) : assessor(f),
  };
}

function requester(f: ReturnType<typeof facts>): Stop[] {
  const withParts = CATEGORIES.filter((c) => c.pathQuestion);
  return [
    stop(1, "intake", {
      title: "Describe the activity once",
      count: plural(f.sections, "section"),
      sees: `${plural(f.sections, "short section")} — ${INTAKE_SECTIONS.map((s) => s.name).join(", ")} — one at a time, each field with a line saying what to write and what to do if it does not apply.`,
      logic: [
        "A question appears only when an earlier answer makes it relevant, and it says why: “Shown because the data is not public.”",
        "An answer given here is reused on every later screen that needs it, shown with its source and still changeable.",
        "A section is complete when its required fields have an answer; the list on the way in says what is still needed.",
      ],
      produces: [
        {
          name: "The identity record",
          kept: "The assessment itself — what every later stage reads from.",
        },
      ],
      where: "The intake, one section at a time",
    }),
    stop(1, "ai-check", {
      title: "The AI check, if they want it",
      sees: "On the last section, “Save & run AI check”. It comes back as a band with five graded criteria, each shown beside what full marks would look like, and an offer to suggest a rewrite.",
      logic: [
        "The whole intake is read as one document against a published rubric, because a description saying “internal tool” beside a list of outside recipients is only wrong when you read both.",
        "Too thin to read and the model is never called — the screen says how many words are missing and links to the field.",
        "Suggestions, never requirements. It cannot block submission, and when the assistant cannot run it says which fault it was and whether trying again could help.",
      ],
      produces: [],
      where: "The last intake section",
    }),
    stop(1, "use-case", {
      title: "The AI use case record, when the activity uses AI",
      sees: "An offer beside the AI answer with a real count of how many of the record’s fields are already answered, and a page assembling the record field by field with where each value came from.",
      logic: [
        "Offered only when intake records that the activity uses AI.",
        "Fields nobody here asks for are named as such, never left blank — a gap nobody wrote down is indistinguishable from an oversight.",
        "Nothing is sent. No destination is connected, so there is no button that pretends; the payload can be downloaded, and the file itself says it was not filed.",
      ],
      produces: [
        {
          name: "Use case record payload",
          kept: "A JSON download, marked “not filed” inside the file.",
        },
      ],
      where: "The record page, offered beside the AI answer",
    }),
    stop(2, "areas", {
      title: "Which risk areas apply",
      count: plural(f.areas, "area"),
      sees: `${plural(f.asked, "area")}, one screen each: Yes, No, or “I don’t know — leave this to us”. ${plural(f.standing, "area")} (${areaNames(CATEGORIES.filter((c) => c.alwaysApplies))}) applies to every assessment and is stated rather than asked.`,
      logic: [
        "Where the intake already settles an area, the answer is filled in with its reason and can still be changed.",
        "“I don’t know” hands the question to a reviewer and is never asked again — a guess is worse for an assessment than an admitted unknown.",
        `${f.quiet} of the ${f.areas} areas ask nothing further in this pilot; each says so on screen rather than letting silence read as completeness.`,
        "A question can be handed to a risk domain or a named person; the record says it moved, not that it was answered.",
      ],
      produces: [
        {
          name: "Handoffs",
          kept: "On the question, with replies; the recipient sees it in their bell.",
        },
      ],
      where: "The risk areas, one screen each",
    }),
    stop(2, "parts", {
      title: "Which parts of those areas",
      count: `${plural(f.withParts, "area")} · ${plural(f.parts, "part")}`,
      sees: `For each open area that has parts (${areaNames(withParts)}), tick what is true. Parts the platform lit from earlier answers carry the reason it lit them.`,
      logic: [
        "What applies is the union of what was ticked and what the evidence lit, and every lit part keeps its reason.",
        "Change a gate or an intake answer and this screen changes with it — nothing here is stored as a result.",
        "All the areas on one screen, deliberately: after answering them one at a time, a person needs to see the shape of what is left.",
      ],
      produces: [],
      where: "Which parts apply, all areas on one screen",
    }),
    stop(2, "severity", {
      title: "How severe each part is",
      count: plural(f.severity, "question", "questions in the instrument"),
      sees: "One screen per area: pick Low, Medium or High, each written as a fact that can be checked rather than a judgement. A ledger beside it shows what each band requires and why.",
      logic: [
        "Severity questions exist only for parts that are lit; a part nobody chose asks nothing.",
        "Where the intake already answers a question, the band is worked out and shown as worked out — never as something the person said.",
        "Each band adds control objectives to what the activity requires, with the reason kept, and the total is recomputed live.",
      ],
      produces: [],
      where: "How severe, one screen per area",
    }),
    stop(2, "controls", {
      title: "Do the controls exist",
      count: `${plural(f.objectives, "objective")} · ${f.withFollowUps} with follow-ups`,
      sees: `Every control the answers require, each with the policy clause requiring it quoted verbatim and the severity answer that brought it here. ${TIER3_ANSWERS.join(" / ")}; follow-ups open on Yes; a note is required on ${TIER3_ANSWERS.filter((a) => a !== "Yes").join(", ")}.`,
      logic: [
        "Which objectives appear is derived from the severity answers on every render; change a band and the list changes.",
        "No raises a gap, Partial raises an enhancement, and an answer that breaches the cited clause raises a non-compliance carrying both quotes.",
        "The same derivation authorises the write on the server, so a request naming a control this assessment does not require is refused.",
      ],
      produces: [],
      where: "Do the controls exist",
    }),
    stop(2, "submit", {
      title: "Declare and hand over",
      sees: "Every answer being declared, in full. Any question left unanswered is named, with a door to it, and must be confirmed. One declaration, then a one-way step.",
      logic: [
        "The declaration records what was shown, and the named gaps go with it exactly as they were.",
        "Findings are raised from the control answers at this moment, each carrying the note the person wrote.",
        "After this the answers are read-only for the requester; a reviewer can correct one, and the correction is recorded as a settlement, not a silent edit.",
      ],
      produces: [
        { name: "The declaration", kept: "On the assessment; a reviewer sees it as signed." },
        { name: "Findings", kept: "One per gap, enhancement or non-compliance; settled in review." },
        { name: "Handoff report", kept: "Derived from the record; the assistant may add a cited summary." },
      ],
      where: "Declare and hand over",
    }),
    stop(3, "waiting", {
      title: "What they see while it is with a reviewer",
      sees: "Their list says “With a reviewer” and how many answers have been signed. The submitted view shows the findings with the clause each cites and the questions they declared unanswered. Replies to anything they handed over arrive in the bell.",
      logic: [
        "Nothing on the assessment can be changed by the requester now; the way to fix an answer is the reviewer’s correction.",
        "Progress is counted in what a person can act on — never a total that includes work they cannot see.",
      ],
      produces: [],
      where: "Their assessment list, and the submitted view",
    }),
    stop(4, "package", {
      title: "Signed and settled",
      sees: "“Signed and settled — ready to package” on their list, and the export the reviewer produced.",
      logic: [
        "Only once every visible question is attested and no finding is open. The screen names each thing still missing rather than saying “not ready”.",
      ],
      produces: [
        {
          name: "The package",
          kept: "A signed, replayable JSON export with every attested value, what was asked and why, and every finding with its settlement.",
        },
      ],
      where: "Package",
    }),
  ];
}

function assessor(f: ReturnType<typeof facts>): Stop[] {
  const ways = DISPOSITION_KINDS.map((k) => DISPOSITION_LABEL[k]);
  return [
    stop(3, "queue", {
      title: "Your queue",
      sees: "Every assessment that needs a decision, oldest first, with four counts above it: policy violations, awaiting your attestation, declared unanswered, longest waiting. Each item has three doors: read the summary, attest controls, settle findings.",
      logic: [
        "“Blocked” means something needs your signature or your settlement; nothing moves on it until then.",
        "The order is age, and nothing else — the band orders and can never gate, skip or hide.",
      ],
      produces: [],
      where: "The queue — the first screen a reviewer sees",
    }),
    stop(3, "summary", {
      title: "Read the summary",
      sees: "The handoff report: the areas that apply, the controls required and why, the findings — derived entirely from the record and complete with no assistant. When one is connected, a summary and two to four risk scenarios, each citing the answers it was read from.",
      logic: [
        "A scenario whose citation is not real is dropped entirely, not shown with a caveat.",
        "Everything derived renders immediately; the assistant’s part streams in afterwards, and nothing waits for it.",
      ],
      produces: [],
      where: "The summary, from the queue",
    }),
    stop(3, "attest", {
      title: "Attest each control answer",
      count: plural(f.objectives, "objective"),
      sees: "One control at a time with the answer and the requester’s note: approve it, correct it to one of the four answers, or mark it not applicable — with the keyboard, the whole way down.",
      logic: [
        "Who may sign is derived from the question, on the server: an assessor signs only the risk domain they hold; an assessor with no domain, or an administrator, may sign any. The requester never can — they declared, which is their part.",
        "A correction must be one of the four answers and is recorded in your name in front of the requester’s answer; theirs stays on the record.",
      ],
      produces: [
        { name: "Attestations", kept: "One per answer: who signed, when, and the act — approve, correct, or not applicable." },
      ],
      where: "The review, control by control",
    }),
    stop(3, "settle", {
      title: "Settle each finding",
      count: plural(f.dispositions, "way", "ways"),
      sees: `Each finding with the clause it breaches, quoted. ${plural(f.dispositions, "way")} to settle it: ${ways.map((w) => `“${w}”`).join("; ")}.`,
      logic: [
        "Accepting a risk needs a second person — never you — and a date it expires. When that date passes the finding reopens on its own and says why.",
        "Remediation needs a named owner and a due date. “Doesn’t apply” needs the sentence saying why.",
        "“The answer was wrong” records why the finding went away; the answer itself is corrected through attestation first.",
      ],
      produces: [
        { name: "Dispositions", kept: "On the finding, with who settled it, when, and the second signature where one was required." },
      ],
      where: "The review, finding by finding",
    }),
    stop(3, "handoffs", {
      title: "Questions handed to you",
      sees: "Questions a requester handed to your risk domain or to you by name, in the bell, each landing on the question itself. Reply, and mark it resolved when the answer is on the record.",
      logic: [
        "These clear themselves when the work is done — they cannot be dismissed, because they derive from the record.",
      ],
      produces: [
        { name: "Replies", kept: "On the handoff; the requester sees them in their bell." },
      ],
      where: "The bell, landing on the question itself",
    }),
    stop(4, "package", {
      title: "Package the assessment",
      sees: "The export, or the named list of what still stands in its way.",
      logic: [
        "Three conditions and they are the whole design: submitted, every visible question attested, no finding open. Each missing one is named.",
        "An N-A is exported as the word, never as an omission — “we never asked” and “they said it does not apply” are different facts.",
      ],
      produces: [
        {
          name: "The package",
          kept: "Signed, replayable JSON: every attested value, the coverage of what was asked and why, every finding with its settlement, and the instrument versions it was assessed under.",
        },
      ],
      where: "Package",
    }),
    stop(4, "boundary", {
      title: "Where the pilot stops",
      count: plural(f.quiet, "area", "areas recorded only"),
      sees: `${plural(f.quiet, "risk area")} are recorded for review and ask nothing further. Attachments are not built. No destination system is connected. Each of these says so on the screen where a person would otherwise infer it works.`,
      logic: [
        "A boundary is declared on screen, never in a document — silence reads as completeness.",
      ],
      produces: [],
      where: "Each screen it applies to",
    }),
  ];
}
