/**
 * §4.3 · the four dispositions. Each rule here is also a CHECK constraint
 * (migration 0021); these tests pin the half a person meets first.
 */
import { describe, expect, it } from "vitest";
import {
  DISPOSITION_KINDS,
  DISPOSITION_LABEL,
  DISPOSITION_MEANING,
  dispositionProblem,
  dispositionSummary,
  reopenedBecause,
} from "@/lib/disposition";

const blank = {
  note: "",
  remediationOwner: null,
  remediationDue: null,
  acceptedBy: null,
  expiresAt: null,
};

/** The pilot directory, as ids — who exists at all. */
const everyone = [
  "n.kahan",
  "t.holland",
  "s.okonkwo",
  "p.sharma",
  "d.whitfield",
];
const eligible = ["t.holland", "s.okonkwo"];

const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const gone = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

describe("the four ways, and only four", () => {
  it("names exactly the four §4.3 dispositions", () => {
    expect([...DISPOSITION_KINDS]).toEqual([
      "answer-corrected",
      "not-applicable",
      "remediation",
      "risk-accepted",
    ]);
  });

  it("gives every one of them human words and a stated consequence", () => {
    for (const kind of DISPOSITION_KINDS) {
      expect(DISPOSITION_LABEL[kind].length).toBeGreaterThan(8);
      expect(DISPOSITION_MEANING[kind].length).toBeGreaterThan(20);
      // Never the stored token on screen (§24.2).
      expect(DISPOSITION_LABEL[kind]).not.toContain(kind);
    }
  });

  it("refuses a kind that isn't one of them", () => {
    expect(
      dispositionProblem(
        { ...blank, kind: "closed" as never, note: "done" },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/one of the four/i);
  });
});

describe("everything but a correction owes an explanation", () => {
  it("refuses a wordless not-applicable", () => {
    expect(
      dispositionProblem(
        { ...blank, kind: "not-applicable" },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/why/i);
  });

  it("lets a correction stand without a note — the corrected answer is the note", () => {
    expect(
      dispositionProblem(
        { ...blank, kind: "answer-corrected" },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toBeNull();
  });

  it("treats whitespace as no explanation at all", () => {
    expect(
      dispositionProblem(
        { ...blank, kind: "not-applicable", note: "   " },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/why/i);
  });
});

describe("remediation is a plan or it is nothing", () => {
  it("needs an owner", () => {
    expect(
      dispositionProblem(
        {
          ...blank,
          kind: "remediation",
          note: "we will fix it",
          remediationDue: soon,
        },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/owner/i);
  });

  it("needs a date", () => {
    expect(
      dispositionProblem(
        {
          ...blank,
          kind: "remediation",
          note: "we will fix it",
          remediationOwner: "d.whitfield",
        },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/date/i);
  });

  it("refuses a due date already past", () => {
    expect(
      dispositionProblem(
        {
          ...blank,
          kind: "remediation",
          note: "we will fix it",
          remediationOwner: "d.whitfield",
          remediationDue: gone,
        },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/past/i);
  });

  it("refuses an owner who is not a person in the directory (FR-29)", () => {
    // "<b>Ops team</b>" was stored as an owner once. An owner is chosen.
    expect(
      dispositionProblem(
        {
          ...blank,
          kind: "remediation",
          note: "we will fix it",
          remediationOwner: "Ops team",
          remediationDue: soon,
        },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/from the list/i);
  });

  it("accepts an owner and a future date", () => {
    expect(
      dispositionProblem(
        {
          ...blank,
          kind: "remediation",
          note: "MFA rollout is scheduled",
          remediationOwner: "d.whitfield",
          remediationDue: soon,
        },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toBeNull();
  });
});

describe("risk acceptance takes four eyes and an expiry", () => {
  const accepted = {
    ...blank,
    kind: "risk-accepted" as const,
    note: "compensating control in place",
    acceptedBy: "t.holland",
    expiresAt: soon,
  };

  it("needs a second person", () => {
    expect(
      dispositionProblem(
        { ...accepted, acceptedBy: null },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/second/i);
  });

  it("refuses the resolver accepting their own risk", () => {
    expect(
      dispositionProblem(
        { ...accepted, acceptedBy: "n.kahan" },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/your own risk/i);
  });

  it("refuses it however the name is spaced", () => {
    expect(
      dispositionProblem(
        { ...accepted, acceptedBy: " n.kahan " },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/your own risk/i);
  });

  it("refuses it however the name is cased — the case was the way around it", () => {
    expect(
      dispositionProblem(
        { ...accepted, acceptedBy: "N.KAHAN" },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/your own risk/i);
  });

  it("refuses a name that is not somebody who can sign off risk here", () => {
    // Arbitrary text passed as a "second person" once. It is not one.
    expect(
      dispositionProblem(
        { ...accepted, acceptedBy: "The Board" },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/from the list/i);
    // And a real person who cannot attest is not one either.
    expect(
      dispositionProblem(
        { ...accepted, acceptedBy: "p.sharma" },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/from the list/i);
  });

  it("needs an expiry", () => {
    expect(
      dispositionProblem(
        { ...accepted, expiresAt: null },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/expires/i);
  });

  it("refuses an expiry already gone", () => {
    expect(
      dispositionProblem(
        { ...accepted, expiresAt: gone },
        { resolvedBy: "n.kahan", acceptors: eligible, people: everyone },
      ),
    ).toMatch(/expired/i);
  });

  it("accepts a second person and a future expiry", () => {
    expect(
      dispositionProblem(accepted, {
        resolvedBy: "n.kahan",
        acceptors: eligible,
        people: everyone,
      }),
    ).toBeNull();
  });
});

describe("what a settled finding reads as", () => {
  it("shows the day that was picked, not the day before it", () => {
    // "2027-06-30" parses to UTC midnight; formatted in a timezone behind
    // UTC it printed 29 June. A record that shows a different date from the
    // one a person chose is wrong even when the instant is right.
    expect(
      dispositionSummary({
        kind: "risk-accepted",
        resolvedBy: "n.kahan",
        acceptedBy: "Tom Holland",
        expiresAt: new Date("2027-06-30"),
      }),
    ).toContain(
      new Date("2027-06-30T00:00:00Z").toLocaleDateString(undefined, {
        timeZone: "UTC",
      }),
    );
  });

  it("names the owner and the date for a remediation", () => {
    expect(
      dispositionSummary({
        kind: "remediation",
        resolvedBy: "Noah Kahan",
        remediationOwner: "Dana Whitfield",
        remediationDue: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toBe(
      `Dana Whitfield is fixing it by ${new Date("2026-11-01T00:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC" })}`,
    );
  });

  it("names the second person for an acceptance, not the resolver", () => {
    expect(
      dispositionSummary({
        kind: "risk-accepted",
        resolvedBy: "Noah Kahan",
        acceptedBy: "Tom Holland",
        expiresAt: new Date("2026-12-31T00:00:00Z"),
      }),
    ).toBe(
      `Accepted by Tom Holland until ${new Date("2026-12-31T00:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC" })}`,
    );
  });
});

describe("an expired acceptance says why it came back", () => {
  const now = new Date("2026-08-23T00:00:00Z");

  it("explains a reopened finding", () => {
    expect(
      reopenedBecause(
        { kind: "risk-accepted", expiresAt: new Date("2026-06-01T00:00:00Z") },
        now,
      ),
    ).toMatch(
      new RegExp(
        `expired on ${new Date("2026-06-01T00:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC" })}`,
      ),
    );
  });

  it("says nothing about one still in force", () => {
    expect(
      reopenedBecause(
        { kind: "risk-accepted", expiresAt: new Date("2027-01-01T00:00:00Z") },
        now,
      ),
    ).toBeNull();
  });

  it("says nothing about the other three kinds, which never expire", () => {
    expect(
      reopenedBecause({ kind: "remediation", expiresAt: null }, now),
    ).toBeNull();
    expect(reopenedBecause(null, now)).toBeNull();
  });
});
