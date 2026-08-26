/**
 * S9 · Package & export (FR-19, FR-20; NFR-1 jointly with S2).
 *
 * A package claims that a named person checked each answer, so most of
 * what matters here is a refusal — and the refusal has to name what is
 * missing, because a screen that says "not ready" without saying what is
 * outstanding is a locked door.
 *
 * The happy path is driven the whole way, intake to a recorded package.
 * A packageable assessment cannot be conjured: it is earned by answering,
 * submitting, settling every finding and signing every required control,
 * which is exactly what §17 means by "full-journey E2E green".
 */
import { expect, test, type Page } from "@playwright/test";
import {
  answerRemainingGates,
  becomePerson,
  scenarioIntake,
  startAssessment,
} from "./helpers";

/**
 * Submitted, with four required controls — one answered No, so there is a
 * real policy breach to settle. Every control carries an answer, because
 * an unanswered one is nothing for a reviewer to sign.
 */
async function submitted(page: Page, name: string): Promise<string> {
  const base = await startAssessment(page, name);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page
    .getByRole("checkbox", {
      name: /Logical access to enterprise environments/,
    })
    .check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();
  await page
    .getByRole("navigation", { name: "Severity areas" })
    .getByRole("link", { name: /Third-Party/ })
    .click();
  await page
    .locator(".q2", { hasText: "Level of Provider Access" })
    .getByText(/Privileged \/ admin access/)
    .first()
    .click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  await page.goto(`${base}/assess/objectives`);
  const breach = page.locator(".q3").nth(0);
  await breach.locator("> .q3-answers").getByRole("radio", { name: "No" }).click();
  await breach
    .locator("> .q3-note textarea")
    .fill("No recertification process exists today.");
  for (let i = 1; i < 4; i++) {
    await page
      .locator(".q3")
      .nth(i)
      .locator("> .q3-answers")
      .getByRole("radio", { name: "Yes" })
      .click();
    await page.waitForTimeout(300);
  }
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  await page.goto(`${base}/submit`);
  const gaps = page.locator(".gaps .confirm input");
  if (await gaps.count()) await gaps.check();
  await page.locator(".declare .confirm input").check();
  await page.getByRole("button", { name: /Declare and submit/ }).click();
  await expect(
    page.getByRole("heading", { name: "With a reviewer" }),
  ).toBeVisible();
  return base;
}

/** Settle the breach and sign all four — what the gate actually demands. */
async function clearTheQueue(page: Page, base: string): Promise<void> {
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);

  await page.getByRole("button", { name: /Settle this finding/ }).click();
  // The disposition chooser is a radiogroup of buttons, not buttons.
  await page.getByRole("radio", { name: /Somebody is fixing it/ }).click();
  await page
    .locator("textarea[id^=note-]")
    .fill("Recertification is on the roadmap; the owner has the date.");
  await page.locator("select[id^=owner-]").selectOption({ index: 1 });
  await page.locator("input[id^=due-]").fill("2027-06-30");
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByRole("button", { name: "Record it" })).toHaveCount(0);

  // The last one is signed Not applicable, so the payload has to carry the
  // explicit "N-A" string §4.5 demands rather than a blank.
  for (let signed = 0; signed < 4; signed += 1) {
    const act = signed === 3 ? "Not applicable" : "Approve";
    await page.goto(`${base}/review`);
    await page.getByRole("radio", { name: act, exact: true }).first().click();
    const tick = page.getByRole("checkbox", { name: /I attest this answer/ });
    if (await tick.count()) await tick.check();
    await page
      .locator("#attest-note")
      .fill(
        act === "Approve"
          ? "Checked against the vendor's SOC 2 and the answer holds."
          : "No enterprise remote access path exists for this vendor.",
      );
    await page
      .getByRole("button", { name: new RegExp(`^${act} and continue`) })
      .click();
    await page.waitForTimeout(800);
  }
}

test("packaging names what is outstanding, by question, not by count (FR-19)", async ({
  page,
}) => {
  const base = await submitted(page, `Package gate ${Date.now()}`);
  await page.goto(`${base}/package`);

  await expect(
    page.getByRole("heading", { name: "Not ready yet." }),
  ).toBeVisible();
  // §19: the refusal names questions by text. A count tells somebody how
  // much is left and sends them back to the queue to work out which.
  const outstanding = page.locator(".owed-blocked");
  await expect(outstanding).toContainText("Multi-Factor Authentication");
  await expect(outstanding).toContainText("Access Review & Recertification");
  await expect(outstanding).toContainText("have not been attested");
  await expect(outstanding).toContainText("still open");
  // And a way to go and clear it, on every blocker.
  await expect(
    outstanding.getByRole("link", { name: /review queue/ }),
  ).toHaveCount(2);
});

test("an assessment nobody has submitted cannot be packaged, and says why", async ({
  page,
}) => {
  // Reached by URL, not by a link — the gate is not the button.
  const base = await startAssessment(page, `Package draft ${Date.now()}`);
  await page.goto(`${base}/package`);
  await expect(
    page.getByRole("heading", { name: "Not ready yet." }),
  ).toBeVisible();
  await expect(page.locator(".owed-blocked")).toContainText(
    "has not been submitted yet",
  );
  // §24.8: a stage nobody has reached reads as upcoming, never as done.
  await expect(page.locator("li.step").nth(3)).toHaveClass(/upcoming/);
});

test("the full journey ends in a record another system can replay (FR-20)", async ({
  page,
}) => {
  const base = await submitted(page, `Package journey ${Date.now()}`);
  await clearTheQueue(page, base);

  await page.goto(`${base}/package`);
  await expect(
    page.getByRole("heading", { name: "Ready to package." }),
  ).toBeVisible();
  await expect(page.locator("li.step").nth(3)).toHaveClass(/current/);

  await page.locator("details.ledger summary").click();
  const payload = JSON.parse(await page.locator("pre.payload").innerText());

  // Every attested value, and an N-A is the string — never an omission,
  // because a missing key reads as "never asked".
  const na = payload.answers.filter((a: { value: string }) => a.value === "N-A");
  expect(na.length).toBeGreaterThan(0);
  expect(na[0].note).not.toBe("");
  for (const answer of payload.answers) {
    expect(answer.value).not.toBe("");
    expect(answer.attestedBy).not.toBe("");
  }
  // Coverage: what was asked and why, including what was ruled out.
  expect(payload.coverage.length).toBeGreaterThan(0);
  // Provenance names the editions the answers pinned, not a hardcoded one.
  expect(payload.provenance.instrumentVersions.length).toBeGreaterThan(0);
  for (const edition of payload.provenance.instrumentVersions) {
    expect(edition.slug).toBeTruthy();
    expect(edition.version).toBeTruthy();
  }
  // Every finding is settled, or the gate would not have opened.
  for (const finding of payload.findings) {
    expect(finding.settlement.kind).not.toBe("");
    expect(finding.settlement.resolvedBy).not.toBe("");
  }

  await page.getByRole("button", { name: "Record this package" }).click();
  await expect(page.locator(".card", { hasText: "Already packaged" })).toBeVisible();
  await expect(
    page.locator(".card", { hasText: "Already packaged" }).locator("li"),
  ).toHaveCount(1);

  // Re-export adds a record rather than replacing one: each package is a
  // claim about a different moment (NFR-1).
  await page.getByRole("button", { name: "Record this package" }).click();
  await expect(
    page.locator(".card", { hasText: "Already packaged" }).locator("li"),
  ).toHaveCount(2);
});
