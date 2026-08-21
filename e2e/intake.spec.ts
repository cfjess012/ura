/**
 * S1 done-when (SPEC §17), now section-per-screen (§24.2): create a project,
 * complete intake across its sections, close the browser, reopen — every
 * answer is there. Rendered-DOM assertions only (NFR-7).
 */
import { expect, test } from "@playwright/test";

const NAME = `S1 proof ${Date.now()}`;
const AI_DETAIL = "Drafts shift assignments; a supervisor approves before publishing.";

test("create → fill each section (conditionals reveal) → reopen → everything is there", async ({
  page,
  context,
}) => {
  await page.goto("/projects");
  await page.getByLabel("Start a new assessment").fill(NAME);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();

  // Description — equalsAny reveal on the AI question.
  await page.getByLabel("Business Purpose or Objective").fill("Optimise shift scheduling.");
  await page.getByLabel("Activity / Use-Case Description").fill("Vendor scheduling tool.");
  await expect(page.getByLabel("What does the AI do?")).toBeHidden();
  await page.getByLabel("Does this use AI or machine learning?").selectOption("Yes");
  await expect(page.getByLabel("What does the AI do?")).toBeVisible();
  await page.getByLabel("What does the AI do?").fill(AI_DETAIL);
  await page.getByRole("button", { name: /Next: Ownership/ }).click();

  // Ownership — the prior-work pointer reveals only for updates.
  const priorRef = page.getByLabel("Which assessment or ticket does it build on, if you know?");
  await expect(page.getByRole("heading", { name: "Ownership" })).toBeVisible();
  await page.getByLabel("Business Owner").fill("P. Sharma");
  await expect(priorRef).toBeHidden();
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Moving a proof of concept into production");
  await expect(priorRef).toBeVisible();
  await priorRef.fill("RISK-2291");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();

  // Categorization — hasValue reveals.
  await expect(page.getByLabel("Other Business Units Involved")).toBeHidden();
  await page.getByLabel("Responsible Business Unit").fill("Workforce Ops");
  await expect(page.getByLabel("Other Business Units Involved")).toBeVisible();
  await page.getByLabel("Target Go-Live / Launch Date").fill("2026-11-02");
  const coupa = page.getByLabel("Has this vendor been onboarded through Procurement (Coupa)?");
  await expect(coupa).toBeHidden();
  await page.getByLabel("Third-Party / Vendor Name(s)").fill("Cadenza Inc");
  await expect(coupa).toBeVisible();
  await coupa.selectOption("I'm not sure");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();

  // Compliance & Data — includesAny reveal.
  await expect(page.getByLabel("Data Elements")).toBeHidden();
  await page.getByRole("checkbox", { name: "Confidential" }).check();
  await expect(page.getByLabel("Data Elements")).toBeVisible();
  await page.getByRole("checkbox", { name: "Employee personal information" }).check();
  await expect(page.getByText("Nothing outstanding in this section.")).toBeVisible();

  // Leaving the last section saves and hands off to the risk areas.
  const base = `/projects/${page.url().split("/projects/")[1]!.split("/")[0]}`;
  await page.getByRole("button", { name: /Continue to the risk areas/ }).click();
  await expect(page.getByRole("heading", { name: "Third-Party & Supply Chain" })).toBeVisible();

  // "Close the browser, reopen" — a brand-new page, cold load, per section.
  await page.close();
  const fresh = await context.newPage();

  await fresh.goto(`${base}/intake/description`);
  await expect(fresh.getByLabel("Business Purpose or Objective")).toHaveValue(
    "Optimise shift scheduling.",
  );
  await expect(fresh.getByLabel("What does the AI do?")).toHaveValue(AI_DETAIL);

  await fresh.goto(`${base}/intake/ownership`);
  await expect(
    fresh.getByLabel("Which assessment or ticket does it build on, if you know?"),
  ).toHaveValue("RISK-2291");

  await fresh.goto(`${base}/intake/categorization`);
  await expect(fresh.getByLabel("Responsible Business Unit")).toHaveValue("Workforce Ops");
  await expect(fresh.getByLabel("Target Go-Live / Launch Date")).toHaveValue("2026-11-02");
  await expect(
    fresh.getByLabel("Has this vendor been onboarded through Procurement (Coupa)?"),
  ).toHaveValue("I'm not sure");

  await fresh.goto(`${base}/intake/compliance-data`);
  await expect(fresh.getByRole("checkbox", { name: "Confidential" })).toBeChecked();
  await expect(
    fresh.getByRole("checkbox", { name: "Employee personal information" }),
  ).toBeChecked();

  // The rail reports each section's state, and the list shows the project.
  await expect(fresh.getByRole("link", { name: /Description/ })).toBeVisible();
  await fresh.goto("/projects");
  await expect(fresh.getByRole("link", { name: NAME })).toBeVisible();
});

/**
 * Regression for the data-loss defect independent verification found (G-28):
 * saving one section used to erase every multi-select in the others, and the
 * save reported success. The original journey filled sections strictly
 * forward and never revisited one, so it drove straight past the bug.
 */
test("saving a later section does not erase an earlier section's answers", async ({ page }) => {
  const name = `Scope ${Date.now()}`;
  await page.goto("/projects");
  await page.getByLabel("Start a new assessment").fill(name);
  await page.getByRole("button", { name: "Start assessment" }).click();
  // Wait for the redirect to settle before reading the id out of the URL.
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
  const base = `/projects/${page.url().split("/projects/")[1]!.split("/")[0]!}`;

  // Answer the LAST section first.
  await page.goto(`${base}/intake/compliance-data`);
  await page.getByRole("checkbox", { name: "Confidential" }).check();
  await page.getByRole("checkbox", { name: "Employee personal information" }).check();
  await page.getByRole("button", { name: /Continue to the risk areas/ }).click();
  // Wait for the save to land where it says it will. Navigating away sooner
  // races the write and tests the harness rather than the product.
  await expect(page).toHaveURL(/\/assess\//);
  await page.goto(`${base}/intake/compliance-data`);
  await expect(page.getByRole("checkbox", { name: "Confidential" })).toBeChecked();

  // Now go back and save an EARLIER section.
  await page.goto(`${base}/intake/ownership`);
  await page.getByLabel("Business Owner").fill("P. Sharma");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();
  await expect(page.getByRole("heading", { name: "Categorization" })).toBeVisible();

  // The later section's answers must be untouched.
  await page.goto(`${base}/intake/compliance-data`);
  await expect(page.getByRole("checkbox", { name: "Confidential" })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Employee personal information" }),
  ).toBeChecked();
});
