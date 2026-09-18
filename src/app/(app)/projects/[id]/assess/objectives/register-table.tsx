"use client";

import * as React from "react";
import {
  STATE_LABEL,
  type Register,
  type RegisterRow,
} from "@/lib/control-register";

/**
 * Every control this activity requires, in one table (G-87).
 *
 * It replaces three presentations of the same set — a "covered by your
 * platforms" list, a stack of tall question cards, and a bullet list recorded
 * for a reviewer — that between them made the whole set impossible to see.
 *
 * Presentational on purpose: it holds no answers and saves nothing. The row
 * a person opens is handed back to the form, which owns the state and the
 * one save path. Every row opens, including the ones nobody can answer,
 * because "why is this here and why can I not act on it" is a question the
 * screen should answer rather than leave to a guess.
 */

/** What a person reads in the provision column, never the slug. */
const PROVISION_LABEL: Record<string, string> = {
  common: "Common",
  hybrid: "Hybrid",
  "system-specific": "Yours",
};

/** Why that word, in one line, for the column's own explanation. */
export const PROVISION_HELP =
  "Common controls are run centrally, so a platform can answer them for you. Hybrid is part central, part yours. Yours means only the people doing this activity can answer it.";

export function RegisterTable({
  register,
  openId,
  onOpen,
}: {
  register: Register;
  /** The control whose drawer is open, so the row can say so. */
  openId: string | null;
  onOpen: (row: RegisterRow) => void;
}) {
  return (
    <div className="register">
      {register.groups.map((group) => (
        <section className="register-group" key={group.family}>
          <h3 className="register-family">
            {group.name}
            <span className="register-family-count">
              {countLine(group.rows)}
            </span>
          </h3>
          <ul className="register-rows">
            {group.rows.map((row) => (
              <li key={row.objective}>
                <button
                  type="button"
                  className="register-row"
                  data-state={row.state}
                  data-open={row.objective === openId}
                  aria-expanded={row.objective === openId}
                  onClick={() => onOpen(row)}
                >
                  <span className="register-name">{row.name}</span>
                  <span className="register-provision">
                    {row.provision ? PROVISION_LABEL[row.provision] : "—"}
                  </span>
                  {row.provider && (
                    <span className="register-provider">
                      {row.state === "lapsed" ? "was " : "via "}
                      {row.provider.name}
                    </span>
                  )}
                  {/* The state is the word. The tint only follows it (§23). */}
                  <span className="register-state">
                    {STATE_LABEL[row.state]}
                    {row.answer && row.state !== "inherited" && (
                      <span className="register-answer"> · {row.answer}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** How a family stands, in the fewest words that are still true. */
function countLine(rows: RegisterRow[]): string {
  const done = rows.filter(
    (r) => r.state === "inherited" || r.state === "answered",
  ).length;
  const gaps = rows.filter((r) => r.state === "gap").length;
  if (gaps > 0) return `${gaps} gap${gaps === 1 ? "" : "s"} of ${rows.length}`;
  if (done === rows.length) return `all ${rows.length} settled`;
  return `${done} of ${rows.length} settled`;
}
