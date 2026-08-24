"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  askAgent,
  draftFromDocument,
  type AgentTurn,
} from "@/app/agent-actions";
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
export function Assistant({
  projectId,
  initial,
}: {
  projectId: string;
  initial: AgentTurn[];
}) {
  const router = useRouter();
  const [turns, setTurns] = React.useState<AgentTurn[]>(initial);
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
      const result = await askAgent(projectId, message);
      if (isFailure(result)) {
        setTurns((was) => [...was, { speaker: "agent", said: result.message }]);
      } else {
        setTurns((was) => [...was, { speaker: "agent", said: result.reply }]);
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
  const MAX_FILE_BYTES = 400_000;

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
      const body = await file.text();
      const result = await draftFromDocument(projectId, {
        name: file.name,
        body,
      });
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
        className="assistant-open"
        onClick={() => setOpen(true)}
      >
        Talk it through →
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
            {turn.said}
          </p>
        ))}
        {busy && (
          <p className="assistant-turn assistant-agent assistant-thinking">
            <span className="assistant-who">Assistant</span>
            {/* Three dots rather than the word "Thinking": the shape people
                already read as "it is working", and it does not claim to
                know how long. Screen readers get the sentence instead. */}
            <span className="assistant-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="sr-only">The assistant is writing a reply.</span>
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="assistant-attach">
        <input
          ref={fileRef}
          id="assistant-file"
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
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
