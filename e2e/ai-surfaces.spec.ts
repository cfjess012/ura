/**
 * The AI surfaces, with **no agent connected** — which is how the E2E suite
 * runs, and the state that matters most.
 *
 * §7 requires that an unshipped capability stays unreachable and the
 * product never implies it runs. §22.1 requires the intake assistant to
 * fail open. Both are properties of the degraded path, so the degraded path
 * is where they have to be tested.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  answerRemainingGates,
  scenarioIntake,
  startAssessment,
} from "./helpers";

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
  const card = page.locator(".q3").first();
  await card
    .locator("> .q3-answers")
    .getByRole("radio", { name: "No" })
    .click();
  await card
    .locator("> .q3-note textarea")
    .fill("Not in place — the vendor handles it.");
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
  await page.goto(`${base}/submit`);
  await page.locator(".gaps .confirm input").check();
  await page.locator(".declare .confirm input").check();
  await page.getByRole("button", { name: /Declare and submit/ }).click();
  await expect(
    page.getByRole("heading", { name: "With a reviewer" }),
  ).toBeVisible();
  return base;
}

test("the handoff report is complete with no agent at all", async ({
  page,
}) => {
  const base = await submitted(page, `Report ${Date.now()}`);
  await page.goto(`${base}/report`);

  // Everything derived is there.
  await expect(page.locator(".report-head h1")).toBeVisible();
  await expect(page.locator(".report-standing")).toContainText(
    /controls answered/,
  );
  await expect(page.locator(".report-table tbody tr").first()).toBeVisible();
  await expect(page.locator(".report-finding").first()).toBeVisible();

  // And the assistant's half is simply absent — not a placeholder, not an
  // apology, and above all not a shimmer that never resolves.
  await expect(page.locator(".report-summary")).toHaveCount(0);
  await expect(page.locator(".report-pending")).toHaveCount(0);
  await expect(page.locator(".report-scenario")).toHaveCount(0);
});

test("the report names what nobody answered rather than counting it done", async ({
  page,
}) => {
  const base = await submitted(page, `Unanswered ${Date.now()}`);
  await page.goto(`${base}/report`);
  const unanswered = page.locator(".report-unanswered");
  if (await unanswered.count()) {
    await expect(unanswered).toContainText(/Not answered/);
  }
  // Whatever the count, it is stated rather than implied.
  await expect(page.locator(".report-standing")).toContainText(
    /\d+ of \d+ controls answered/,
  );
});

test("the report shows a policy breach with the clause it breaches", async ({
  page,
}) => {
  const base = await submitted(page, `Report breach ${Date.now()}`);
  await page.goto(`${base}/report`);
  await expect(page.getByText("Breaches policy").first()).toBeVisible();
  await expect(page.locator(".report-clause").first()).toContainText(/shall/);
});

test("the intake floor catches a bare name with no model", async ({ page }) => {
  // Deterministic by design: it costs nothing and is never wrong in an
  // interesting way, so it must work with no agent.
  const base = await startAssessment(page, `Floor ${Date.now()}`);
  await page.goto(`${base}/intake/description`);
  await page.getByLabel("Activity / Use-Case Description").fill("Salesforce");
  await page.getByRole("button", { name: /How does this read/ }).click();
  await expect(page.locator(".rubric-ask")).toContainText(/too thin/i);
});

test("the intake assistant fails open — it never blocks the way forward", async ({
  page,
}) => {
  // With no agent there is nothing to score, and the answer is "carry on".
  // A quality assistant that blocks has become a gate.
  const base = await startAssessment(page, `Fail open ${Date.now()}`);
  await page.goto(`${base}/intake/description`);
  await page
    .getByLabel("Activity / Use-Case Description")
    .fill(
      "A claims triage assistant from Sable Analytics that reads an incoming claim and proposes which handling queue it belongs in.",
    );
  await page.getByRole("button", { name: /How does this read/ }).click();
  await expect(page.locator(".rubric-good")).toBeVisible();
  await expect(page.getByRole("button", { name: /Next:/ })).toBeEnabled();
});
