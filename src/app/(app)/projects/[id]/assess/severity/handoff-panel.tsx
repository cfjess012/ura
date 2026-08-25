"use client";

/**
 * "Leave this to us" — hand a question over, and the conversation that
 * settles it (S4.7).
 *
 * The requester is never blocked: one click and they carry on. What they
 * hand over is a question, not an answer — the record says the question
 * moved, which is what actually happened.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  handOffQuestion,
  replyToHandoff,
  resolveHandoff,
} from "@/app/handoff-actions";
import { errorRef, isFailure } from "@/lib/errors";
import { initialsOf, saidAt, thread, timeAgo, type Reply } from "@/lib/handoff";

/**
 * Every other error surface in this product renders its reference; the
 * hand-off panel produced one and threw it away, so a person reporting a
 * failure had nothing to correlate (§25.2, verifier F4).
 */
const withRef = (message: string, ref?: string) =>
  ref ? `${message} Reference ${ref}.` : message;

/**
 * A transport failure — the request never reached the server. Says what
 * happened, what is safe, and what to do (§25).
 */
function transportFailure(where: string, cause: unknown): string {
  console.error(`${where} transport`, cause);
  return `The server couldn't be reached, so nothing was recorded. What you wrote is still here. Reference ${errorRef()}. Try again in a moment.`;
}

export type Recipient = {
  id: string;
  label: string;
  kind: "person" | "domain";
};

export type HandoffView = {
  id: string;
  toLabel: string;
  note: string;
  askedByName: string;
  askedByRole: string;
  createdAt: string;
  resolvedAt: string | null;
  /**
   * True once the question has an answer. The obligation is derived from
   * this (FR-36), so the thread must read from it too — the bell cleared
   * itself while this panel still said "open 1m" and still offered "Mark
   * resolved", so the two halves of one feature disagreed on screen
   * (verifier finding 7).
   */
  answered: boolean;
  resolvedByName: string | null;
  mayResolve: boolean;
  replies: (Omit<Reply, "createdAt"> & { createdAt: string })[];
};

export function HandoffPanel({
  projectId,
  questionId,
  recipients,
  existing,
  onHanded,
}: {
  projectId: string;
  questionId: string;
  recipients: Recipient[];
  existing: HandoffView | null;
  /** Called once it has moved to somebody else, so the answer can go. */
  onHanded?: () => void;
}) {
  const router = useRouter();
  const [asking, setAsking] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const noteRef = React.useRef<HTMLTextAreaElement>(null);
  /** The @ list, or null when nobody is naming anybody. */
  const [mentions, setMentions] = React.useState<Recipient[] | null>(null);
  /** Which of them is highlighted, for the keyboard. */
  const [at, setAt] = React.useState(0);
  /** Where the @ started, so choosing replaces what was typed after it. */
  const [from, setFrom] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (existing) return <Thread projectId={projectId} handoff={existing} />;

  /**
   * Naming somebody with an @, the way every other tool does it.
   *
   * The dropdown above still works and is still the record of who this goes
   * to — this writes their name into the note AND sets that dropdown, so
   * the sentence a person types and the routing the platform does cannot
   * disagree. Typing "@Samuel" and leaving the recipient unset was the
   * obvious way to send a question nowhere.
   */
  function openMentions(field: HTMLTextAreaElement) {
    const upTo = field.value.slice(0, field.selectionStart ?? 0);
    // The @ has to start a word, or every email address opens a list.
    const found = /(?:^|\s)@([\p{L}\p{N}'’ -]{0,40})$/u.exec(upTo);
    if (!found) {
      setMentions(null);
      return;
    }
    const typed = (found[1] ?? "").trim().toLowerCase();
    const matching = recipients.filter((r) =>
      typed === "" ? true : r.label.toLowerCase().includes(typed),
    );
    setFrom(upTo.length - (found[1] ?? "").length - 1);
    setAt(0);
    setMentions(matching.slice(0, 6));
  }

  function pick(option: Recipient) {
    const field = noteRef.current;
    if (!field) return;
    const before = note.slice(0, from);
    const after = note.slice(field.selectionStart ?? note.length);
    const written = `${before}@${option.label} ${after}`;
    setNote(written);
    // The whole point: naming them routes it to them.
    setTo(`${option.kind}:${option.id}`);
    setMentions(null);
    window.requestAnimationFrame(() => {
      const caret = before.length + option.label.length + 2;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  }

  async function hand() {
    const picked = recipients.find((r) => `${r.kind}:${r.id}` === to);
    if (!picked) {
      setError("Pick who should look at this, and we'll pass it on.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await handOffQuestion(projectId, {
        questionId,
        toPersonId: picked.kind === "person" ? picked.id : null,
        toDomain: picked.kind === "domain" ? picked.id : null,
        note,
      });
      if (isFailure(result)) setError(withRef(result.message, result.ref));
      else {
        // Before the refresh: the answer has to go with it, and a refresh
        // would remount this panel first.
        onHanded?.();
        router.refresh();
      }
    } catch (cause) {
      setError(transportFailure("handOffQuestion", cause));
    } finally {
      // In `finally`, always. Without it a transport failure left the
      // control disabled for good and the panel dead until reload — silent,
      // and §24.4 says every failure has a cause and a next step (F3).
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <button
        type="button"
        className="handoff-open"
        onClick={() => setAsking(true)}
      >
        I don&rsquo;t know — leave this to us
      </button>
    );
  }

  return (
    <div className="handoff-ask">
      <label className="field" htmlFor={`${questionId}-to`}>
        Who should look at this?
      </label>
      <select
        id={`${questionId}-to`}
        value={to}
        onChange={(event) => setTo(event.target.value)}
      >
        <option value="">Choose a person or a risk area…</option>
        <optgroup label="Risk areas">
          {recipients
            .filter((r) => r.kind === "domain")
            .map((r) => (
              <option key={r.id} value={`domain:${r.id}`}>
                {r.label}
              </option>
            ))}
        </optgroup>
        <optgroup label="People">
          {recipients
            .filter((r) => r.kind === "person")
            .map((r) => (
              <option key={r.id} value={`person:${r.id}`}>
                {r.label}
              </option>
            ))}
        </optgroup>
      </select>

      <label className="field" htmlFor={`${questionId}-note`}>
        Anything you can tell them?
      </label>
      <div className="mention-field">
        <textarea
          id={`${questionId}-note`}
          ref={noteRef}
          rows={2}
          value={note}
          placeholder="Optional — type @ to name someone, or just say what you know."
          onChange={(event) => {
            setNote(event.target.value);
            openMentions(event.target);
          }}
          onKeyDown={(event) => {
            if (mentions === null) return;
            if (event.key === "ArrowDown") {
              setAt((n) => Math.min(n + 1, mentions.length - 1));
            } else if (event.key === "ArrowUp") {
              setAt((n) => Math.max(n - 1, 0));
            } else if (event.key === "Enter" || event.key === "Tab") {
              const picked = mentions[at];
              if (picked) pick(picked);
            } else if (event.key === "Escape") {
              setMentions(null);
            } else {
              return;
            }
            // Only once we know we handled it: Enter in a note is a
            // newline every other time, and stealing it would be worse
            // than not offering the list at all.
            event.preventDefault();
          }}
          onBlur={() => {
            // A click on the list is a blur first, so let it land.
            window.setTimeout(() => setMentions(null), 150);
          }}
        />
        {mentions !== null && mentions.length > 0 && (
          <ul className="mentions" role="listbox">
            {mentions.map((option, n) => (
              <li key={`${option.kind}:${option.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={n === at}
                  className={n === at ? "mention current" : "mention"}
                  onMouseDown={(event) => {
                    // mousedown, not click: the blur above would close the
                    // list before a click ever landed.
                    event.preventDefault();
                    pick(option);
                  }}
                >
                  <span className="mention-name">{option.label}</span>
                  <span className="mention-kind">
                    {option.kind === "domain" ? "risk area" : "assessor"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="handoff-actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void hand()}
        >
          {busy ? "Handing over…" : "Hand it over"}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setAsking(false)}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="handoff-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

function Thread({
  projectId,
  handoff,
}: {
  projectId: string;
  handoff: HandoffView;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const now = new Date();
  const nodes = thread(
    handoff.replies.map((r) => ({ ...r, createdAt: new Date(r.createdAt) })),
  );

  async function post() {
    if (body.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const result = await replyToHandoff(projectId, {
        handoffId: handoff.id,
        parentId: replyingTo,
        body,
      });
      if (isFailure(result)) setError(withRef(result.message, result.ref));
      else {
        // What they wrote is cleared only once it is safely posted.
        setBody("");
        setReplyingTo(null);
        router.refresh();
      }
    } catch (cause) {
      setError(transportFailure("replyToHandoff", cause));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const result = await resolveHandoff(projectId, handoff.id);
      if (isFailure(result)) setError(withRef(result.message, result.ref));
      else router.refresh();
    } catch (cause) {
      setError(transportFailure("resolveHandoff", cause));
    } finally {
      setBusy(false);
    }
  }

  const open = handoff.resolvedAt === null;
  // Three states, not two: waiting on someone, answered (so nobody is
  // waiting any more, even though the record is still open), and closed.
  const waiting = open && !handoff.answered;

  return (
    <div
      className={`handoff-thread${open ? "" : " settled"}${waiting ? "" : " done"}`}
    >
      <p className="handoff-status">
        <span className="handoff-tag">
          {!open ? "Settled by" : waiting ? "With" : "Answered — was with"}
        </span>{" "}
        <strong>
          {open ? handoff.toLabel : (handoff.resolvedByName ?? "a reviewer")}
        </strong>
        <span className="handoff-meta">
          {" · "}
          {!open
            ? timeAgo(new Date(handoff.resolvedAt!), now)
            : waiting
              ? `open ${timeAgo(new Date(handoff.createdAt), now).replace(" ago", "")}`
              : "nothing is waiting on them now"}
        </span>
      </p>

      <Post
        name={handoff.askedByName}
        role={handoff.askedByRole}
        at={new Date(handoff.createdAt)}
        body={handoff.note || "Handed this over without a note."}
        actions={null}
      />

      {nodes.map((node) => (
        <ReplyNode
          key={node.id}
          node={node}
          depth={0}
          now={now}
          open={open}
          onReply={setReplyingTo}
        />
      ))}

      {open && (
        <div className="handoff-reply">
          {replyingTo && (
            <p className="handoff-replying">
              Replying to a comment above.{" "}
              <button
                type="button"
                className="linkish"
                onClick={() => setReplyingTo(null)}
              >
                Reply to the whole thread instead
              </button>
            </p>
          )}
          <div className="handoff-composer">
            <input
              type="text"
              value={body}
              placeholder="Add to the conversation…"
              aria-label="Add to the conversation"
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void post();
                }
              }}
            />
            <button
              type="button"
              className="handoff-send"
              disabled={busy || body.trim() === ""}
              aria-label="Post this reply"
              onClick={() => void post()}
            >
              <span aria-hidden="true">➤</span>
            </button>
          </div>
          {handoff.mayResolve && (
            <button
              type="button"
              className="linkish handoff-resolve"
              disabled={busy}
              onClick={() => void close()}
            >
              Mark resolved
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="handoff-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

function ReplyNode({
  node,
  depth,
  now,
  open,
  onReply,
}: {
  node: ReturnType<typeof thread>[number];
  depth: number;
  now: Date;
  open: boolean;
  onReply: (id: string) => void;
}) {
  // Capped so a conversation cannot become a staircase; deeper replies keep
  // their parent's indent and still read in order.
  const indent = Math.min(depth, 4);
  return (
    <>
      <div style={{ marginLeft: `${indent * 1.6}rem` }}>
        <Post
          name={node.authorName}
          role={node.authorRole}
          at={node.createdAt}
          body={node.body}
          actions={
            open ? (
              <button
                type="button"
                className="linkish"
                onClick={() => onReply(node.id)}
              >
                Reply
              </button>
            ) : null
          }
        />
      </div>
      {node.children.map((child) => (
        <ReplyNode
          key={child.id}
          node={child}
          depth={depth + 1}
          now={now}
          open={open}
          onReply={onReply}
        />
      ))}
    </>
  );
}

/** One thing somebody said — avatar, who they are, when, and the words. */
function Post({
  name,
  role,
  at,
  body,
  actions,
}: {
  name: string;
  role: string;
  at: Date;
  body: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="handoff-post">
      <span className="handoff-avatar" aria-hidden="true">
        {initialsOf(name)}
      </span>
      <div className="handoff-said">
        <p className="handoff-head">
          <span className="handoff-who">{name}</span>
          <span className="handoff-role">{ROLE_PILL[role] ?? role}</span>
          <span className="handoff-when">{saidAt(at)}</span>
          {actions}
        </p>
        <p className="handoff-body">{body}</p>
      </div>
    </div>
  );
}

const ROLE_PILL: Record<string, string> = {
  requester: "Requester",
  assessor: "Risk Assessor",
  admin: "Administrator",
};
