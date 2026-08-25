"use client";

/**
 * The bell (S4.7) — mirrored from the prior platform's, which the owner
 * asked for exactly: a bell in the app bar, a corner count, and a panel in
 * two sections.
 *
 * The two sections are two different things, and the design says so:
 *
 * NEEDS YOU is derived from state. It cannot be dismissed and there is no
 * "clear" beside it, because there is nothing to clear — it disappears when
 * the work is done. The footnote says that out loud.
 *
 * NOTIFICATIONS is news. It is clearable, and clearing is one watermark
 * rather than a row per person per event.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { clearNews } from "@/app/handoff-actions";
import { timeAgo } from "@/lib/handoff";
import type { StandingItem } from "@/lib/review-standing";

export type Obligation = {
  handoffId: string;
  projectId: string;
  projectName: string;
  questionLabel: string;
  askedByName: string;
  openFor: string;
  /** Where the question actually lives (skill: alert-destination). */
  href: string;
};

export type NewsItem = {
  replyId: string;
  handoffId: string;
  projectId: string;
  projectName: string;
  questionLabel: string;
  authorName: string;
  createdAt: string;
  href: string;
};

/** A submitted assessment waiting on this reviewer, and what it raised. */
export type ToReview = {
  projectId: string;
  projectName: string;
  requesterName: string;
  submittedAt: string;
  standing: StandingItem[];
};

export function AlertBell({
  obligations,
  news,
  toReview = [],
}: {
  obligations: Obligation[];
  news: NewsItem[];
  toReview?: ToReview[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [cleared, setCleared] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const shown = cleared ? [] : news;
  const count = obligations.length + shown.length + toReview.length;

  React.useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // The destination comes with the alert, computed from what it points at.
  // Building it here is how the first version ended up sending everyone to
  // the project root, where the intake guard redirected them to a form.
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="bell"
        aria-expanded={open}
        aria-label={
          count === 0
            ? "Alerts — nothing waiting"
            : `Alerts — ${obligations.length + toReview.length} needing action, ${shown.length} unread`
        }
        onClick={() => setOpen((was) => !was)}
      >
        <span aria-hidden="true" className="bell-glyph">
          🔔
        </span>
        {count > 0 && (
          <span className="bell-badge" aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Alerts">
          {(obligations.length > 0 || toReview.length > 0) && (
            <div className="bell-obligations">
              <p className="bell-section">Needs you</p>
              {/* A submission is not a message somebody sent — it is an
                  assessment that now needs signing off. It says what it
                  raised, so the reviewer knows what they are opening, and
                  each line goes to that thing rather than to the project. */}
              {toReview.map((item) => (
                <div className="bell-review" key={item.projectId}>
                  <button
                    type="button"
                    className="bell-row bell-row-obligation"
                    onClick={() => go(`/projects/${item.projectId}/report`)}
                  >
                    <span className="bell-icon warn" aria-hidden="true">
                      !
                    </span>
                    <span className="bell-text">
                      <strong>{item.projectName}</strong>
                      <span className="bell-meta">
                        submitted by {item.requesterName} ·{" "}
                        {timeAgo(new Date(item.submittedAt), new Date())}
                      </span>
                    </span>
                  </button>
                  <ul className="bell-standing">
                    {item.standing.map((thing) => (
                      <li key={thing.kind}>
                        <button
                          type="button"
                          className={`chip chip-${thing.kind}`}
                          onClick={() => go(thing.href)}
                        >
                          {thing.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {obligations.map((item) => (
                <button
                  type="button"
                  key={item.handoffId}
                  className="bell-row bell-row-obligation"
                  onClick={() => go(item.href)}
                >
                  <span className="bell-icon warn" aria-hidden="true">
                    !
                  </span>
                  <span className="bell-text">
                    <strong>{item.questionLabel}</strong>
                    <span className="bell-meta">
                      {item.projectName} · from {item.askedByName} · open{" "}
                      {item.openFor}
                    </span>
                  </span>
                </button>
              ))}
              <p className="bell-note">
                These clear themselves when the work is done — they can&rsquo;t
                be dismissed.
              </p>
            </div>
          )}

          <div className="bell-news">
            <div className="bell-section-row">
              <p className="bell-section">Notifications</p>
              {shown.length > 0 && (
                <button
                  type="button"
                  className="bell-clear"
                  onClick={() => {
                    setCleared(true);
                    void clearNews();
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
            {shown.length === 0 ? (
              <p className="bell-empty">
                Nothing yet — replies on questions you handed over land here.
              </p>
            ) : (
              shown.map((item) => (
                <button
                  type="button"
                  key={item.replyId}
                  className="bell-row"
                  onClick={() => go(item.href)}
                >
                  <span className="bell-icon" aria-hidden="true">
                    ▤
                  </span>
                  <span className="bell-text">
                    <span>
                      <strong>{item.authorName}</strong> replied on{" "}
                      <strong>{item.questionLabel}</strong>
                    </span>
                    <span className="bell-meta">
                      {timeAgo(new Date(item.createdAt), new Date())}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
