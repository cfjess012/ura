/**
 * S4 done-when (SPEC §17): "§19 criteria; a Medium/High answer reveals its
 * conditionals; a derived band routes." Rendered DOM only (NFR-7).
 */
import { expect, test } from "@playwright/test";
import { answerRemainingGates, startAssessment } from "./helpers";

/** Intake for the demo scenario: AI vendor tool, confidential employee data. */
async function scenarioIntake(page: import("@playwright/test").Page, base: string) {
  await page.getByLabel("Business Purpose or Objective").fill("Cut rostering effort.");
  await page.getByLabel("Activity / Use-Case Description").fill("AI drafts weekly shift rosters.");
  await page.getByLabel("Does this use AI or machine learning?").selectOption("Yes");
  await page.getByLabel("What does the AI do?").fill("Proposes shifts a supervisor approves.");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();
  await page.getByLabel("Business Owner").fill("P. Sharma");
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Brand new");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();
  await page.getByLabel("Responsible Business Unit").fill("Workforce Ops");
  await page.getByLabel("Does anything about this involve a company outside ours?").selectOption("Yes");
  await page.getByLabel("Which companies?").fill("Cadenza Inc");
  await page.getByLabel(/Procurement \(Coupa\)/).selectOption("Yes");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();
  await page.getByRole("radio", { name: /Confidential/ }).check();
  await page.getByRole("button", { name: /Continue to the risk areas/ }).click();
  await expect(page).toHaveURL(/\/assess\//);
}

/** Severity is paced one area per screen, so go to the one under test. */
async function severityArea(page: import("@playwright/test").Page, name: RegExp) {
  await page
    .getByRole("navigation", { name: "Severity areas" })
    .getByRole("link", { name })
    .click();
  await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
}

test("a severity answer summons controls and says why (FR-6, §19)", async ({ page }) => {
  const base = await startAssessment(page, `Severity ${Date.now()}`);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);

  await page.getByRole("checkbox", { name: /Logical access to enterprise environments/ }).check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();

  // The rubric anchor is the option, in the owner's own words.
  await severityArea(page, /Third-Party/);
  const providerAccess = page.locator(".q2", { hasText: "Level of Provider Access" });
  await expect(providerAccess).toContainText("Privileged / admin access to production");

  // Low requires little; High pulls in privileged-access management.
  await providerAccess.getByRole("radio", { name: /Low/ }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
  const owed = page.locator(".owed");
  await expect(owed).not.toContainText("T3-IAM-03");

  await providerAccess.getByRole("radio", { name: /High/ }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
  await expect(owed).toContainText("T3-IAM-03");
  // Every control names the answer that pulled it in.
  await expect(owed).toContainText("Level of Provider Access is High");

  // FR-8, severity-fired: the detail question appears only once it is severe.
  await expect(providerAccess.getByText("Which access types apply?")).toBeVisible();
  await expect(providerAccess.getByText(/Shown because you answered High/)).toBeVisible();
});

test("a band the platform can work out is offered, not asked (FR-7)", async ({ page }) => {
  const base = await startAssessment(page, `Derived ${Date.now()}`);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page.getByRole("checkbox", { name: /Handles enterprise data/ }).check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();

  await severityArea(page, /Third-Party/);
  const handled = page.locator(".q2", { hasText: "Data Classification Handled" });
  await expect(handled.getByText("Worked out for you")).toBeVisible();
  await expect(handled).toContainText("the most sensitive data involved is Confidential");
  // Offered, never pre-answered: nothing is selected until a person picks.
  await expect(handled.getByRole("radio", { checked: true })).toHaveCount(0);
});

test("the detail question hides again when severity drops (FR-8)", async ({ page }) => {
  const base = await startAssessment(page, `Conditional ${Date.now()}`);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page.getByRole("checkbox", { name: /Logical access to enterprise environments/ }).check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();

  await severityArea(page, /Third-Party/);
  const q = page.locator(".q2", { hasText: "Level of Provider Access" });
  await q.getByRole("radio", { name: /High/ }).click();
  await expect(q.getByText("Which access types apply?")).toBeVisible();
  await q.getByRole("radio", { name: /Low/ }).click();
  await expect(q.getByText("Which access types apply?")).toBeHidden();
});
