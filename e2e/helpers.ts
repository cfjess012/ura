import { expect, type Page } from "@playwright/test";

/**
 * Answer every required intake field for a project already open at its first
 * section, leaving the browser on the risk areas.
 *
 * It exists because required fields are now enforced (FR-28) and several
 * journeys are about something else entirely — attribution, scoping, save
 * scope — and should not each re-type the same eight answers. Journeys that
 * are *about* intake still walk it field by field.
 */
export async function completeIntake(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/intake/description`);
  await page.getByLabel("Business Purpose or Objective").fill("Shorten scheduling effort.");
  await page.getByLabel("Activity / Use-Case Description").fill("Scheduling tool for shifts.");
  await page.getByLabel("Does this use AI or machine learning?").selectOption("No");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();

  await expect(page.getByRole("heading", { name: "Ownership" })).toBeVisible();
  await page.getByLabel("Business Owner").fill("P. Sharma");
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Brand new");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();

  await expect(page.getByRole("heading", { name: "Categorization" })).toBeVisible();
  await page.getByLabel("Responsible Business Unit").fill("Workforce Ops");
  await page
    .getByLabel("Does anything about this involve a company outside ours?")
    .selectOption("No");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();

  await expect(page.getByRole("heading", { name: "Compliance & Data" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Internal", exact: true }).check();
  await page.getByRole("button", { name: /Continue to the risk areas/ }).click();
  await expect(page).toHaveURL(/\/assess\//);
}

/** Start an assessment and return its base path. */
export async function startAssessment(page: Page, name: string): Promise<string> {
  await page.goto("/projects");
  await page.getByLabel("Start a new assessment").fill(name);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
  return `/projects/${page.url().split("/projects/")[1]!.split("/")[0]!}`;
}
