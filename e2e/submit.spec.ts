/**
 * S7 · Submit, declare, and the findings it raises (FR-14, FR-15, FR-37).
 *
 * The declaration is the one moment a requester is asked to stand behind
 * the record, so what is on screen at that moment IS the requirement.
 */
import { expect, test, type Page } from "@playwright/test";
import { answerRemainingGates, scenarioIntake, startAssessment } from "./helpers";

/** An assessment with one control answered No, ready to submit. */
async function readyToSubmit(page: Page, name: string): Promise<string> {
  const base = await startAssessment(page, name);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page.getByRole("checkbox", { name: /Logical access to enterprise environments/ }).check();
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
  await card.locator("> .q3-answers").getByRole("radio", { name: "No" }).click();
  await card.locator("> .q3-note textarea").fill("No recertification process exists today.");
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
  return base;
}

test("the declaration shows the answers being declared, not a checkbox alone", async ({ page }) => {
  const base = await readyToSubmit(page, `Declare ${Date.now()}`);
  await page.goto(`${base}/submit`);
  // Every required intake answer, by label and value as displayed.
  const rows = page.locator(".declared > div");
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(9);
  await expect(page.locator(".declared")).toContainText("Business Purpose or Objective");
});

test("gaps are named, and submitting with them takes a second confirmation (FR-14)", async ({
  page,
}) => {
  const base = await readyToSubmit(page, `Gaps ${Date.now()}`);
  await page.goto(`${base}/submit`);

  const gaps = page.locator(".gaps");
  await expect(gaps).toBeVisible();
  // Named in the questions' own words — never just a count.
  await expect(gaps.locator("li").first()).toContainText(/\?$/);

  const submit = page.getByRole("button", { name: /Declare and submit/ });
  await expect(submit).toBeDisabled();
  await page.locator(".declare .confirm input").check();
  await expect(submit, "the declaration alone is not enough while gaps remain").toBeDisabled();
  await gaps.locator(".confirm input").check();
  await expect(submit).toBeEnabled();
});

test("submitting raises a finding carrying its note, and says so first (FR-15)", async ({
  page,
}) => {
  const base = await readyToSubmit(page, `Findings ${Date.now()}`);
  await page.goto(`${base}/submit`);
  // Told before, not discovered after.
  await expect(page.getByText(/raises 1 finding/)).toBeVisible();

  await page.locator(".gaps .confirm input").check();
  await page.locator(".declare .confirm input").check();
  await page.getByRole("button", { name: /Declare and submit/ }).click();

  await expect(page.getByRole("heading", { name: "With a reviewer" })).toBeVisible();
  await expect(page.getByText("No recertification process exists today.")).toBeVisible();
  await expect(page.locator(".owed")).toContainText("Gap");
  // The gaps confirmed at submission are kept, exactly as they were.
  await expect(page.getByText(/Submitted with \d+ unanswered/)).toBeVisible();
});

test("a submitted assessment cannot be edited, and says why", async ({ page }) => {
  // An answer changed after the declaration would make it describe a record
  // that no longer exists. The refusal is server-side.
  const base = await readyToSubmit(page, `Locked ${Date.now()}`);
  await page.goto(`${base}/submit`);
  await page.locator(".gaps .confirm input").check();
  await page.locator(".declare .confirm input").check();
  await page.getByRole("button", { name: /Declare and submit/ }).click();
  await expect(page.getByRole("heading", { name: "With a reviewer" })).toBeVisible();

  await page.goto(`${base}/assess/objectives`);
  const card = page.locator(".q3").first();
  await card.locator("> .q3-answers").getByRole("radio", { name: "Yes" }).click();
  await expect(page.locator(".savebar [role=status]")).toContainText(
    /has been submitted, so nothing was changed/,
  );
});

test("the submitted view names a person, never an identifier (NFR-9)", async ({ page }) => {
  const base = await readyToSubmit(page, `Named ${Date.now()}`);
  await page.goto(`${base}/submit`);
  await page.locator(".gaps .confirm input").check();
  await page.locator(".declare .confirm input").check();
  await page.getByRole("button", { name: /Declare and submit/ }).click();
  await expect(page.getByText(/Declared accurate by Priya Sharma/)).toBeVisible();
});
