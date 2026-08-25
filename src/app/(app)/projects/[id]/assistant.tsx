"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { askAgent, type AgentTurn } from "@/app/agent-actions";
import { draftFromFile } from "@/app/document-actions";
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
  const [said, setSaid] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Closed on arrival, always. A window that opens itself over somebody's
  // work is the thing everyone hates about these.
  const [open, setOpen] = React.useState(false);
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
      className="assistant"
      aria-label="Assistant"
      role="dialog"
      aria-modal="false"
    >
      <div className="assistant-head">
        <p className="assistant-title">Talk it through</p>
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
            {turn.speaker === "agent" && consulted.length > 0 ? (
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
          📄 Read a document
        </label>
        <span className="help">
          It proposes; you accept. Nothing it reads becomes your answer on its
          own.
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
