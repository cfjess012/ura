/**
 * Roles and authority (SPEC §2, S2.5). Pure — these rules are the same in a
 * Lambda, and they do not move when the sign-in mechanism changes.
 */
import { describe, expect, it } from "vitest";
import {
  canAdminister,
  canAnswer,
  canAttest,
  canStartAssessment,
  isRole,
  seesEveryAssessment,
  NotPermitted,
  ROLES,
  ROLE_LABEL,
  mayOpenAssessment,
  ROLE_SUMMARY,
  type Role,
} from "../../src/lib/people";

describe("authority is decided by role, not by screen", () => {
  it("only a Risk Assessor or administrator may attest (§5.5)", () => {
    expect(canAttest("assessor")).toBe(true);
    expect(canAttest("admin")).toBe(true);
    expect(canAttest("requester")).toBe(false);
  });

  it("only an administrator sees administration surfaces", () => {
    expect(canAdminister("admin")).toBe(true);
    expect(canAdminister("assessor")).toBe(false);
    expect(canAdminister("requester")).toBe(false);
  });

  it("a requester may answer their own assessment", () => {
    expect(canAnswer("requester")).toBe(true);
  });

  it("rejects a role that is not one of the three", () => {
    expect(isRole("assessor")).toBe(true);
    expect(isRole("auditor")).toBe(false);
  });
});

describe("roles are legible to the people holding them (§24.6)", () => {
  it("every role has a human label and a one-sentence summary", () => {
    for (const role of ROLES) {
      expect(ROLE_LABEL[role], role).toBeTruthy();
      expect(ROLE_LABEL[role], role).not.toBe(role); // not the identifier
      expect(ROLE_SUMMARY[role].length, role).toBeGreaterThan(30);
    }
  });

  it("a refusal names the role and the action in plain words", () => {
    const error = new NotPermitted("attest an answer", "requester");
    expect(error.message).toBe("Requester may not attest an answer");
  });
});

describe("what each role may see and start (§2, F2)", () => {
  it("shows a requester their own work and everyone else the whole queue", () => {
    expect(seesEveryAssessment("requester")).toBe(false);
    expect(seesEveryAssessment("assessor")).toBe(true);
    expect(seesEveryAssessment("admin")).toBe(true);
  });

  it("does not let a Risk Assessor start an assessment they would then review", () => {
    expect(canStartAssessment("requester")).toBe(true);
    expect(canStartAssessment("assessor")).toBe(false);
    expect(canStartAssessment("admin")).toBe(true);
  });

  it("gives every role at least one thing a different role cannot do", () => {
    const powers = (role: Role) =>
      [canAttest(role), canAdminister(role), canStartAssessment(role), seesEveryAssessment(role)]
        .map((allowed) => (allowed ? "1" : "0"))
        .join("");
    // F2: the Risk Assessor's permissions were identical to a requester's,
    // which made the role a label rather than a role.
    const distinct = new Set(ROLES.map(powers));
    expect(distinct.size).toBe(ROLES.length);
  });
});

describe("opening one particular assessment (§2, N1)", () => {
  it("lets a requester open their own and nobody else's", () => {
    expect(mayOpenAssessment("requester", "p.requester", "p.requester")).toBe(true);
    expect(mayOpenAssessment("requester", "p.requester", "p.admin")).toBe(false);
  });

  it("lets a Risk Assessor and an administrator open any of them", () => {
    expect(mayOpenAssessment("assessor", "p.assessor", "p.requester")).toBe(true);
    expect(mayOpenAssessment("admin", "p.admin", "p.requester")).toBe(true);
  });

  it("closes an assessment with no recorded owner to a requester", () => {
    // Pre-attribution pilot rows belong to nobody. Inventing an owner would
    // be worse than leaving them closed.
    expect(mayOpenAssessment("requester", "p.requester", null)).toBe(false);
    expect(mayOpenAssessment("assessor", "p.assessor", null)).toBe(true);
  });

  it("agrees with the listing rule — the list and the object cannot disagree", () => {
    // N1 was exactly this disagreement: the list filtered, the URL did not.
    for (const role of ROLES) {
      expect(mayOpenAssessment(role, "someone", "someone-else")).toBe(
        seesEveryAssessment(role),
      );
    }
  });
});
