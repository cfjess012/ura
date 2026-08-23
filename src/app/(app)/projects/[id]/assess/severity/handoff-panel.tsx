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
import { handOffQuestion, replyToHandoff, resolveHandoff } from "@/app/actions";
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

export type Recipient = { id: string; label: string; kind: "person" | "domain" };

export type HandoffView = {
  id: string;
  toLabel: string;
  note: string;
  askedByName: string;
  askedByRole: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  mayResolve: boolean;
  replies: (Omit<Reply, "createdAt"> & { createdAt: string })[];
};

export function HandoffPanel({
  projectId,
  questionId,
  recipients,
  existing,
}: {
  projectId: string;
  questionId: string;
  recipients: Recipient[];
  existing: HandoffView | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (existing) return <Thread projectId={projectId} handoff={existing} />;

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
      else router.refresh();
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
      <button type="button" className="handoff-open" onClick={() => setAsking(true)}>
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
      <textarea
        id={`${questionId}-note`}
        rows={2}
        value={note}
        placeholder="Optional — whatever you do know helps them start."
        onChange={(event) => setNote(event.target.value)}
      />

      <div className="handoff-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void hand()}>
          {busy ? "Handing over…" : "Hand it over"}
        </button>
        <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
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

function Thread({ projectId, handoff }: { projectId: string; handoff: HandoffView }) {
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

  return (
    <div className={`handoff-thread${open ? "" : " settled"}`}>
      <p className="handoff-status">
        <span className="handoff-tag">{open ? "With" : "Settled by"}</span>{" "}
        <strong>{open ? handoff.toLabel : (handoff.resolvedByName ?? "a reviewer")}</strong>
        <span className="handoff-meta">
          {" · "}
          {open
            ? `open ${timeAgo(new Date(handoff.createdAt), now).replace(" ago", "")}`
            : timeAgo(new Date(handoff.resolvedAt!), now)}
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
              <button type="button" className="linkish" onClick={() => setReplyingTo(null)}>
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
            <button type="button" className="linkish handoff-resolve" disabled={busy} onClick={() => void close()}>
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
              <button type="button" className="linkish" onClick={() => onReply(node.id)}>
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
