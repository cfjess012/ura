"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { askAgent, type AgentTurn } from "@/app/agent-actions";
import { describeFromFile, draftFromFile } from "@/app/document-actions";
import { applyIntakeFix } from "@/app/actions";
import { blocksOf, type Block, type Span } from "@/lib/reply-format";
import { sectionKeyOwning } from "@/lib/intake";
import { holdRewrite } from "@/lib/pending-rewrite";
import { Marked } from "./marked";
import { isFailure } from "@/lib/errors";

/**
 * The thought partner (SPEC §22.1) — a dialogue window in the corner, the
 * shape people already know from every support chat they have used.
 *
 * It helps a person think; it does not fill in their form. Nothing it says
 * is an answer — answers are drafted from the person's own words and
 * checked against them, and every click stays theirs.
 *
 * Rendered only when an agent is actually connected. With none, this
 * component is not on the page at all rather than sitting there explaining
 * its own absence (§7, §24.8).
 */
/**
 * The mark that says "this is the model".
 *
 * The same four-point spark the AI check button carries, because they are
 * the same claim: a person who has met one of these should recognise the
 * other without being told. It replaced a question mark, which said
 * "help" — a different and much older promise, and the one thing this
 * panel is not.
 *
 * Three points rather than one, sized down in sequence, so it reads as a
 * mark rather than a star at any size.
 */
/**
 * What it is doing, while it does it.
 *
 * Three steps, and each one genuinely runs on every turn in this order:
 * the assessment is read, the policy lookup runs, the model is asked. So
 * naming them claims nothing that does not happen — which matters, because
 * a progress display is exactly the place a product starts describing work
 * it is not doing.
 *
 * What it will not do is pretend to know which step it is on. The turn is
 * one server call with no way to report back mid-flight, so the steps are
 * paced by elapsed time and the current one is marked as under way rather
 * than finished. The elapsed count is real. The receipt underneath the
 * reply, once it lands, is the part that is actually checkable.
 */
/** How narrow the panel may get before it stops being usable. */
const NARROWEST = 320;
/** And how wide before it stops being a panel and becomes the page. */
const WIDEST = 900;
/** The gaps the panel keeps from the edges, matching the stylesheet. */
const RIGHT_GAP = 24;
const BOTTOM_GAP = 24;
/** Height bounds. Below the first it cannot show a turn; above, it is the page. */
const SHORTEST = 260;
const TALLEST = 900;
/** What it is before anybody has dragged it — matches the stylesheet. */
const DEFAULT_HEIGHT = 544;
/** What it is before anybody has dragged it — matches the stylesheet. */
const DEFAULT_WIDTH = 384;
/** One arrow press. Big enough to be worth pressing, small enough to aim. */
const STEP = 48;

export type Drafted = {
  description: string;
  placeholders: string[];
  from: string;
  fields: Array<{ field: string; label: string; value: string; quote: string }>;
  documentName: string;
};

/**
 * Everything the document turned up, and where each of it goes.
 *
 * The first version drafted the description, said so in a sentence, and
 * stopped — so a document that settled four things produced one, and
 * whatever else it had found was invisible. Somebody who has just handed
 * over a spec wants to see what came of it, all of it, and be walked to
 * each piece.
 *
 * **Nothing here is applied until it is chosen, and each is chosen
 * separately.** The count at the top is what is left, so the panel empties
 * as they work rather than looking the same when they are done. A tick is
 * the receipt for the one they just did.
 */
function Tracker({
  projectId,
  draft,
  settled,
  setSettled,
  onDone,
  onTakeDescription,
}: {
  projectId: string;
  draft: Drafted;
  /**
   * Which of them have been dealt with.
   *
   * Held by the panel's owner rather than here, because closing the chat
   * unmounts this component — and a tracker that forgets what you already
   * took, the moment you collapse it to look at the field it just filled,
   * is a tracker that undoes its own work.
   */
  settled: Record<string, "done" | "failed">;
  setSettled: React.Dispatch<
    React.SetStateAction<Record<string, "done" | "failed">>
  >;
  onDone: () => void;
  onTakeDescription: () => void;
}) {
  const [saving, setSaving] = React.useState<string | null>(null);
  const router = useRouter();

  /**
   * Walk them to the section that owns a field. Which section that is comes
   * from the instrument, never from a list kept here.
   */
  const goTo = (fieldId: string) => {
    const owner = sectionKeyOwning(fieldId);
    if (owner) router.push(`/projects/${projectId}/intake/${owner}`);
  };
  const left =
    (settled.description ? 0 : 1) +
    draft.fields.filter((f) => !settled[f.field]).length;

  return (
    <div className="tracker">
      <p className="tracker-head">
        <span className="tracker-count">{left}</span>
        {left === 1 ? "thing" : "things"} I found in {draft.documentName}
      </p>

      {/* Gone once taken, not turned into a receipt. The count above says
          how many are left and the field itself now holds the text — a tick
          sitting where the work used to be is one more thing to read past
          on the way to what still needs doing. */}
      {!settled.description && (
        <div className="tracker-item">
          <p className="tracker-what">Project Description</p>
          <>
            <p className="tracker-body">
              <Marked text={draft.description} />
            </p>
            {draft.placeholders.length > 0 && (
              <p className="help">
                {draft.placeholders.length}{" "}
                {draft.placeholders.length === 1 ? "part" : "parts"} in brackets
                — {draft.documentName} did not say, and I will not invent it.
              </p>
            )}
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setSettled((was) => ({ ...was, description: "done" }));
                onTakeDescription();
              }}
            >
              Use this — take me to it
            </button>
          </>
        </div>
      )}

      {draft.fields.map((proposal) => {
        const state = settled[proposal.field];
        if (state === "done") return null;
        return (
          <div className="tracker-item" key={proposal.field}>
            <p className="tracker-what">{proposal.label.replace(/\?$/, "")}</p>
            <>
              <p className="tracker-body">
                It proposes <strong>{proposal.value}</strong>, from this:
              </p>
              <blockquote className="tracker-quote">
                {proposal.quote}
              </blockquote>
              <button
                type="button"
                className="btn btn-small"
                disabled={saving === proposal.field}
                onClick={async () => {
                  setSaving(proposal.field);
                  try {
                    const outcome = await applyIntakeFix(
                      projectId,
                      proposal.field,
                      proposal.value,
                    );
                    const landed = !isFailure(outcome);
                    setSettled((was) => ({
                      ...was,
                      [proposal.field]: landed ? "done" : "failed",
                    }));
                    // And take them to it. Setting an answer somewhere
                    // they cannot see is the thing this panel exists to
                    // stop — they are going to attest to it, so they
                    // should be looking at it.
                    if (landed) goTo(proposal.field);
                  } catch (cause) {
                    console.error("applyIntakeFix", cause);
                    setSettled((was) => ({
                      ...was,
                      [proposal.field]: "failed",
                    }));
                  } finally {
                    setSaving(null);
                  }
                }}
              >
                {saving === proposal.field
                  ? "Setting…"
                  : `Set it to “${proposal.value}”`}
              </button>
              {state === "failed" && (
                <p className="help">
                  That didn’t save — the answer is unchanged, and you can set it
                  on its own section.
                </p>
              )}
            </>
          </div>
        );
      })}

      {left === 0 ? (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            onDone();
            // Back to the top of the intake, so they read the whole thing
            // through with what the document contributed already in place.
            router.push(`/projects/${projectId}/intake/description`);
          }}
        >
          That is everything &mdash; take me through it
        </button>
      ) : (
        <button
          type="button"
          className="link-button tracker-dismiss"
          onClick={onDone}
        >
          Not now
        </button>
      )}
    </div>
  );
}

export type Clause = {
  policy: string;
  reference: string;
  version: string;
  clauseId: string;
  heading: string;
  text: string;
};

/**
 * A reply with its citations made openable.
 *
 * The assistant names a clause in its own sentence, and until now that was
 * a string somebody had to take on trust. It is the one part of a reply
 * carrying real authority, so it is the part that most needs to be
 * checkable: the citation becomes a control, and opening it shows the
 * clause in the standard's own words.
 *
 * **Only clauses the lookup actually returned are made openable.** An id
 * the model produced from nowhere stays plain text, because turning that
 * into a link would dress an invention up as a source.
 */
function Cited({
  said,
  clauses,
  onRead,
}: {
  said: string;
  clauses: Clause[];
  onRead: (clause: Clause) => void;
}) {
  return (
    <>
      {blocksOf(said).map((block, at) => (
        <Rendered key={at} block={block} clauses={clauses} onRead={onRead} />
      ))}
    </>
  );
}

/** One block, with any clause it names made openable. */
function Rendered({
  block,
  clauses,
  onRead,
}: {
  block: Block;
  clauses: Clause[];
  onRead: (clause: Clause) => void;
}) {
  const draw = (spans: Span[]) =>
    spans.map((span, at) =>
      span.strong ? (
        <strong key={at}>
          <Linked text={span.text} clauses={clauses} onRead={onRead} />
        </strong>
      ) : (
        <Linked key={at} text={span.text} clauses={clauses} onRead={onRead} />
      ),
    );

  if (block.kind === "heading")
    return <span className="reply-heading">{draw(block.spans)}</span>;
  if (block.kind === "quote")
    return <span className="reply-quote">{draw(block.spans)}</span>;
  if (block.kind === "bullets")
    return (
      <span className="reply-bullets">
        {block.items.map((item, at) => (
          <span className="reply-bullet" key={at}>
            {draw(item)}
          </span>
        ))}
      </span>
    );
  return <span className="reply-para">{draw(block.spans)}</span>;
}

/** A run of text, with clause ids turned into controls. */
function Linked({
  text,
  clauses,
  onRead,
}: {
  text: string;
  clauses: Clause[];
  onRead: (clause: Clause) => void;
}) {
  const said = text;
  const byId = new Map(clauses.map((c) => [c.clauseId, c]));
  // Longest first, so a full clause id is matched before its policy
  // reference, which is a prefix of it.
  const ids = [...byId.keys()].sort((a, b) => b.length - a.length);
  if (ids.length === 0) return <>{said}</>;
  const escaped = ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = said.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return (
    <>
      {parts.map((part, at) => {
        const clause = byId.get(part);
        if (!clause) return <React.Fragment key={at}>{part}</React.Fragment>;
        return (
          <button
            key={at}
            type="button"
            className="cite"
            onClick={() => onRead(clause)}
          >
            {part}
          </button>
        );
      })}
    </>
  );
}

/**
 * One clause, in full, in the standard's own words.
 *
 * A quick look rather than a page: somebody mid-conversation wants to check
 * what was quoted, not to leave and come back. Everything a citation needs
 * to be verifiable is here — the policy, its reference, the version in
 * force, and the clause unabridged.
 */
function ClauseDialog({
  clause,
  onClose,
}: {
  clause: Clause;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="clause-back"
      role="dialog"
      aria-modal="true"
      aria-label={`${clause.policy}, ${clause.clauseId}`}
      onClick={onClose}
    >
      <div className="clause" onClick={(event) => event.stopPropagation()}>
        <div className="clause-top">
          <p className="clause-eyebrow">{clause.policy}</p>
          <button
            type="button"
            className="clause-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <p className="clause-id">
          {clause.clauseId} &middot; version {clause.version}
        </p>
        <h3 className="clause-heading">{clause.heading}</h3>
        <blockquote className="clause-text">{clause.text}</blockquote>
        <p className="help">
          Quoted from {clause.reference} as it stands today. It says what the
          term means &mdash; whether it describes your activity is yours to say.
        </p>
      </div>
    </div>
  );
}

const STEPS = [
  "Reading your assessment",
  "Checking policies and standards",
  "Writing a reply",
];

function Working() {
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    const started = Date.now();
    const tick = setInterval(
      () => setSeconds(Math.round((Date.now() - started) / 1000)),
      500,
    );
    return () => clearInterval(tick);
  }, []);
  // Roughly: the two local steps are quick, the model call is not.
  const at = seconds < 1 ? 0 : seconds < 3 ? 1 : 2;

  return (
    <div className="working" role="status" aria-live="polite">
      <p className="working-head">
        <span className="working-spark" aria-hidden="true">
          <AssistantSpark />
        </span>
        {STEPS[at]}
        <span className="working-elapsed">{seconds}s</span>
      </p>
      <ol className="working-steps">
        {STEPS.map((step, n) => (
          <li
            key={step}
            className={n < at ? "done" : n === at ? "now" : "waiting"}
          >
            <span aria-hidden="true">{n < at ? "\u2713" : "\u00b7"}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * An upload arrow with the product's spark on it.
 *
 * Two jobs in one mark, because the control does two things and neither
 * alone explains it. A page said "document" and not "you are giving us
 * one"; an arrow says the handing over. The spark is what says a model
 * reads it — the same four-point mark the rest of the product uses, so
 * somebody who has met one has met all of them.
 *
 * Two colours: the arrow in brand blue, the spark in the accent green. The
 * spark is a named colour rather than currentColor so it cannot quietly
 * inherit the blue and collapse the pair back into one.
 *
 * An SVG rather than an emoji — an emoji renders differently on every
 * platform and cannot be recoloured at all.
 */
function DocSpark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      focusable="false"
    >
      {/* The tray it goes into. */}
      <path
        d="M3.2 14.6v3.2a2.2 2.2 0 0 0 2.2 2.2h8.4a2.2 2.2 0 0 0 2.2-2.2v-3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {/* And the arrow out of it — upload, not download: the stem rises. */}
      <path
        d="M9.6 15.4V4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M5.9 8.3 9.6 4.6l3.7 3.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The spark, set clear of the arrowhead so neither reads as noise. */}
      <g transform="translate(12.9 0.7) scale(0.52)">
        <path
          className="docspark-spark"
          d="M12 2.5l1.7 4.6 4.6 1.7-4.6 1.7-1.7 4.6-1.7-4.6L5.7 8.8l4.6-1.7L12 2.5z"
        />
      </g>
      {/* A second, smaller one, off-beat. One spark pulsing reads as a
          loading state; two catching the light at different moments reads
          as something thinking. */}
      <g transform="translate(15.6 6.4) scale(0.26)">
        <path
          className="docspark-spark docspark-spark-two"
          d="M12 2.5l1.7 4.6 4.6 1.7-4.6 1.7-1.7 4.6-1.7-4.6L5.7 8.8l4.6-1.7L12 2.5z"
        />
      </g>
    </svg>
  );
}

function AssistantSpark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M10 2.6l1.6 4.3 4.3 1.6-4.3 1.6L10 14.4 8.4 10.1 4.1 8.5l4.3-1.6L10 2.6z"
      />
      <path
        fill="currentColor"
        d="M17.8 12.6l.85 2.25 2.25.85-2.25.85-.85 2.25-.85-2.25-2.25-.85 2.25-.85.85-2.25z"
      />
      <path
        fill="currentColor"
        d="M5.9 16.1l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6z"
      />
    </svg>
  );
}

export function Assistant({
  projectId,
  initial,
}: {
  projectId: string;
  initial: AgentTurn[];
}) {
  const router = useRouter();
  // Where they are. The server derives what is on that screen from the
  // instrument — the path only selects, it never supplies the words.
  const pathname = usePathname();
  const [turns, setTurns] = React.useState<AgentTurn[]>(initial);
  /** Clauses the last reply was built with. A receipt, not a claim. */
  const [consulted, setConsulted] = React.useState<Clause[]>([]);
  /** The clause being read in full, if any. */
  const [reading, setReading] = React.useState<Clause | null>(null);
  /** Which way the pointer is currently dragging, if it is. */
  const [dragging, setDragging] = React.useState<null | "x" | "y" | "xy">(null);
  /**
   * Docked, or floating over the page.
   *
   * Floating is right for a quick question and wrong for everything else:
   * the panel sat on top of the description somebody was reading it about,
   * and no amount of resizing fixes overlap — moving it just covers
   * something else. Docked, it takes a column of its own and the page makes
   * room, so nothing is ever underneath it.
   */
  const [docked, setDocked] = React.useState(false);
  React.useEffect(() => {
    try {
      setDocked(sessionStorage.getItem("ura.assistant-docked") === "yes");
    } catch {
      // Storage disabled; it opens floating, which is the old behaviour.
    }
  }, []);

  /**
   * Whether the panel is opened out.
   *
   * It is a quarter of the screen wide and a suggested description runs to
   * five paragraphs, so the thing somebody has to read before signing it
   * arrived through a letterbox. Kept for the tab, because a person who
   * widened it once wants it wide.
   */
  const [width, setWidth] = React.useState<number | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    try {
      const w = Number(sessionStorage.getItem("ura.assistant-width"));
      if (Number.isFinite(w) && w >= NARROWEST) setWidth(w);
      const h = Number(sessionStorage.getItem("ura.assistant-height"));
      if (Number.isFinite(h) && h >= SHORTEST) setHeight(h);
    } catch {
      // Storage disabled. It opens at the usual size, which is fine.
    }
  }, []);

  /**
   * Drag the left edge to resize.
   *
   * A toggle offered two sizes and somebody reading a five-paragraph
   * suggestion beside a form wants their own. The panel is anchored right,
   * so dragging left makes it wider — width is the distance from the
   * pointer to the right edge.
   *
   * The handle is a real separator with arrow-key support, not a strip that
   * only responds to a mouse: a resize nobody can reach from the keyboard
   * is a resize that excludes people, and it is what let the button go.
   */
  const resize = React.useCallback((to: number) => {
    const capped = Math.max(
      NARROWEST,
      Math.min(to, window.innerWidth - 48, WIDEST),
    );
    setWidth(capped);
    try {
      sessionStorage.setItem("ura.assistant-width", String(capped));
    } catch {
      // It still resizes for this visit.
    }
  }, []);

  /** The same, upwards: the panel sits on the bottom, so it grows up. */
  const restack = React.useCallback((to: number) => {
    const capped = Math.max(
      SHORTEST,
      Math.min(to, window.innerHeight - 48, TALLEST),
    );
    setHeight(capped);
    try {
      sessionStorage.setItem("ura.assistant-height", String(capped));
    } catch {
      // It still resizes for this visit.
    }
  }, []);

  React.useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      if (dragging !== "y")
        resize(window.innerWidth - event.clientX - RIGHT_GAP);
      if (dragging !== "x")
        restack(window.innerHeight - event.clientY - BOTTOM_GAP);
    };
    const stop = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    // Without this, dragging over the page selects text all the way down.
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.userSelect = "";
    };
  }, [dragging, resize, restack]);
  /** A description drafted from a document, waiting to be looked at. */
  const [draft, setDraft] = React.useState<Drafted | null>(null);
  /** What has been taken from the draft. Outlives the panel being closed. */
  const [settled, setSettled] = React.useState<
    Record<string, "done" | "failed">
  >({});
  const [said, setSaid] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Closed on arrival, always. A window that opens itself over somebody's
  // work is the thing everyone hates about these.
  const [open, setOpen] = React.useState(false);

  /**
   * The page makes room by reading one variable. Set from here because the
   * panel is the only thing that knows whether it is docked and how wide it
   * is — and cleared on close, or a closed panel would leave a gutter.
   */
  React.useEffect(() => {
    const root = document.documentElement;
    if (open && docked) {
      root.style.setProperty("--assistant-dock", `${width ?? DEFAULT_WIDTH}px`);
    } else {
      root.style.removeProperty("--assistant-dock");
    }
    return () => {
      root.style.removeProperty("--assistant-dock");
    };
  }, [open, docked, width]);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, open]);

  // Escape closes it, the way every dialogue in the world does.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const message = said.trim();
    if (message === "" || busy) return;
    setBusy(true);
    // Their own words appear immediately; the reply follows. Optimistic
    // only for what they said — never for what the agent might say.
    setTurns((was) => [...was, { speaker: "person", said: message }]);
    setSaid("");
    try {
      setConsulted([]);
      const result = await askAgent(projectId, message, pathname);
      if (isFailure(result)) {
        setTurns((was) => [...was, { speaker: "agent", said: result.message }]);
      } else {
        setTurns((was) => [...was, { speaker: "agent", said: result.reply }]);
        // A receipt of what the lookup actually returned, kept beside the
        // turn it belongs to rather than in the transcript — it describes
        // how the reply was made, not part of what was said.
        setConsulted(result.consulted);
        router.refresh();
      }
    } catch (cause) {
      console.error("askAgent transport", cause);
      setTurns((was) => [
        ...was,
        {
          speaker: "agent",
          said: "I couldn't be reached just then. Everything you have written is saved and the questions work as normal.",
        },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  /** Roughly the server's own ceiling, so the refusal arrives instantly. */
  // Bigger than the old text-only limit, because a PDF carries layout as
  // well as words and a 400 KB ceiling refused ordinary vendor paperwork.
  const MAX_FILE_BYTES = 8_000_000;

  async function readDocument(file: File) {
    if (busy) return;
    if (file.size > MAX_FILE_BYTES) {
      setTurns((was) => [
        ...was,
        { speaker: "person", said: `📄 ${file.name}` },
        {
          speaker: "agent",
          said: `That file is too large for me to read — try the section that covers security and data, rather than the whole thing.`,
        },
      ]);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    setTurns((was) => [...was, { speaker: "person", said: `📄 ${file.name}` }]);
    try {
      // The bytes go to the server, not text read here: a browser cannot
      // read a PDF or a .docx, and vendor paperwork is one or the other.
      const form = new FormData();
      form.set("file", file);

      // On the intake, a document is for writing the description — the
      // field the whole assessment routes on, and the one somebody was
      // otherwise retyping out of the document. On the risk areas it is for
      // proposing answers. Same button, and the screen decides which,
      // because a person carrying a vendor overview means a different thing
      // in each place.
      if (pathname.includes("/intake/")) {
        const drafted = await describeFromFile(projectId, form);
        if (isFailure(drafted)) {
          setTurns((was) => [
            ...was,
            { speaker: "agent", said: drafted.message },
          ]);
        } else {
          setSettled({});
          setDraft(drafted);
          setTurns((was) => [
            ...was,
            {
              speaker: "agent",
              said: `I read ${drafted.documentName} and drafted a description from it. ${
                drafted.placeholders.length === 0
                  ? "Have a look before you take it — it is yours to sign."
                  : `${drafted.placeholders.length} ${drafted.placeholders.length === 1 ? "part is" : "parts are"} marked in brackets: the document did not say, and I will not invent it.`
              }`,
            },
          ]);
        }
        return;
      }

      const result = await draftFromFile(projectId, form);
      // Only claim what actually happened. "Every question was already
      // answered" was said when the service was simply unreachable.
      const partly =
        !isFailure(result) && result.truncated
          ? " I only read the first part of it — it is longer than I can take in one go."
          : "";
      const said = isFailure(result)
        ? result.message
        : result.proposed === 0
          ? result.abstained > 0
            ? `I read ${result.document} and could not answer anything from it — nothing in it said what I would have needed.${partly}`
            : `I read ${result.document}, and there was nothing open for it to answer.${partly}`
          : `I read ${result.document} and proposed ${result.proposed} answer${result.proposed === 1 ? "" : "s"}${result.abstained > 0 ? `, and left ${result.abstained} alone because it did not say` : ""}.${partly} Each one is on the risk areas below with the sentence it came from — none of them counts until you accept it.`;
      setTurns((was) => [...was, { speaker: "agent", said }]);
      router.refresh();
    } catch (cause) {
      console.error("draftFromDocument", cause);
      setTurns((was) => [
        ...was,
        {
          speaker: "agent",
          said: "I could not read that file. Nothing was changed.",
        },
      ]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="assistant-launch"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        <span aria-hidden="true" className="assistant-launch-icon">
          <AssistantSpark />
        </span>
        Talk it through
        {turns.length > 0 && (
          <span className="assistant-launch-count" aria-hidden="true">
            {turns.filter((t) => t.speaker === "agent").length}
          </span>
        )}
      </button>
    );
  }

  return (
    <section
      className={[
        "assistant",
        docked ? "docked" : "",
        dragging ? "dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...(width ? { width: `${width}px` } : {}),
        // maxHeight, not height: the panel should still shrink to its
        // content when there is little in it. Docked, height is not the
        // panel's to choose — it runs banner to floor — and a leftover
        // float height would cut the column short.
        ...(height && !docked ? { maxHeight: `${height}px` } : {}),
      }}
      aria-label="Assistant"
      role="dialog"
      aria-modal="false"
    >
      {/*
        The only handle. There were three — left edge, top edge, corner —
        and two of them were furniture: the corner already does both axes
        with the pointer and all four arrow keys, so the other two added
        chrome around a panel whose whole problem was taking up room.
        Docked, the same handle drags width alone; the other axis is spoken
        for by the banner above and the floor below.
      */}
      <div
        className="assistant-grip-corner"
        role="separator"
        aria-label="Resize the assistant"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(docked ? "x" : "xy");
        }}
        onKeyDown={(event) => {
          const w = width ?? DEFAULT_WIDTH;
          const h = height ?? DEFAULT_HEIGHT;
          if (event.key === "ArrowLeft") resize(w + STEP);
          else if (event.key === "ArrowRight") resize(w - STEP);
          else if (event.key === "ArrowUp" && !docked) restack(h + STEP);
          else if (event.key === "ArrowDown" && !docked) restack(h - STEP);
          else return;
          event.preventDefault();
        }}
      />
      <div className="assistant-head">
        <p className="assistant-title">Talk it through</p>
        <button
          type="button"
          className="assistant-dock"
          aria-pressed={docked}
          title={docked ? "Float over the page" : "Dock beside the page"}
          onClick={() => {
            const next = !docked;
            setDocked(next);
            try {
              sessionStorage.setItem(
                "ura.assistant-docked",
                next ? "yes" : "no",
              );
            } catch {
              // It still docks for this visit.
            }
          }}
        >
          {docked ? "Float" : "Dock"}
        </button>
        <button
          type="button"
          className="assistant-close"
          onClick={() => setOpen(false)}
          aria-label="Close the assistant"
        >
          ×
        </button>
      </div>

      <p className="help assistant-promise">
        It helps you think. It never answers for you — every answer here is
        yours, and nothing is recorded until you write it.
      </p>

      <div className="assistant-turns" role="log" aria-live="polite">
        {turns.length === 0 && (
          <p className="help">
            Ask it what a question means, or describe what you are building and
            see what it asks back.
          </p>
        )}
        {turns.map((turn, i) => (
          <p
            key={`${turn.speaker}-${i}`}
            className={`assistant-turn assistant-${turn.speaker}`}
          >
            <span className="assistant-who">
              {turn.speaker === "person" ? "You" : "Assistant"}
            </span>
            {turn.speaker === "agent" ? (
              <Cited said={turn.said} clauses={consulted} onRead={setReading} />
            ) : (
              turn.said
            )}
            {turn.speaker === "agent" &&
              i === turns.length - 1 &&
              consulted.length > 0 && (
                <span className="assistant-cited">
                  Checked our standards ·{" "}
                  {consulted.length === 1
                    ? "1 clause"
                    : `${consulted.length} clauses`}
                </span>
              )}
          </p>
        ))}
        {draft && (
          <Tracker
            projectId={projectId}
            draft={draft}
            settled={settled}
            setSettled={setSettled}
            onDone={() => setDraft(null)}
            onTakeDescription={() => {
              // Carried, not saved. A description is theirs to sign, so it
              // lands in the field for them to edit and attest to.
              holdRewrite({
                projectId,
                fieldId: "projectDescription",
                text: draft.description,
                placeholders: draft.placeholders,
              });
              // Deliberately NOT closing the panel. Taking the
              // description used to shut it, which took the other things
              // the document turned up with it — the tracker is the point,
              // and the field is on the left while this sits on the right.
              router.push(`/projects/${projectId}/intake/description`);
            }}
          />
        )}
        {busy && <Working />}
        <div ref={endRef} />
        {reading && (
          <ClauseDialog clause={reading} onClose={() => setReading(null)} />
        )}
      </div>

      <div className="assistant-attach">
        <input
          ref={fileRef}
          id="assistant-file"
          type="file"
          accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readDocument(file);
          }}
        />
        <label htmlFor="assistant-file" className="assistant-attach-label">
          <DocSpark />
          Agent Assist Doc
        </label>
        <span className="help">
          A spec, a vendor overview, a contract. It proposes; you accept.
          Nothing it reads becomes your answer on its own.
        </span>
      </div>

      <div className="assistant-compose">
        <label htmlFor="assistant-say" className="sr-only">
          Ask the assistant
        </label>
        <textarea
          id="assistant-say"
          ref={inputRef}
          rows={2}
          value={said}
          disabled={busy}
          placeholder="What does this question mean?"
          onChange={(event) => setSaid(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; shift-enter is a new line. Somebody mid-thought
            // should not have to reach for a button.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={busy || said.trim() === ""}
          onClick={() => void send()}
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </div>
    </section>
  );
}
