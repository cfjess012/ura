/**
 * Roles and authority (SPEC §2, S2.5). Pure — these rules are the same in a
 * Lambda, and they do not move when the sign-in mechanism changes.
 */
import { describe, expect, it } from "vitest";
import {
  canAdminister,
  canAnswer,
  canAttest,
  isRole,
  NotPermitted,
  ROLES,
  ROLE_LABEL,
  ROLE_SUMMARY,
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
