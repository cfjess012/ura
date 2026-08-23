/**
 * S4 done-when (SPEC §17): "§19 criteria; a Medium/High answer reveals its
 * conditionals; a derived band routes." Rendered DOM only (NFR-7).
 */
import { expect, test } from "@playwright/test";
import { answerRemainingGates, scenarioIntake, startAssessment } from "./helpers";

/** Intake for the demo scenario: AI vendor tool, confidential employee data. */
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
  await expect(owed).not.toContainText("Privileged Access Management");

  await providerAccess.getByRole("radio", { name: /High/ }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
  // The control is named, not coded. This assertion used to read
  // `toContainText("T3-IAM-03")` — the test encoded the very defect NFR-9
  // forbids, so the identifier on screen had a passing test defending it
  // (S4 verification, B1).
  await expect(owed).toContainText("Privileged Access Management");
  await expect(owed).not.toContainText(/T[0-9]-[A-Z]{2,5}-[0-9]/);
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
