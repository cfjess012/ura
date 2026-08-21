/**
 * S1 done-when, verbatim from SPEC §17: "Create a project, complete intake,
 * close the browser, reopen: everything is there." Rendered-DOM assertions
 * only (NFR-7).
 */
import { expect, test } from "@playwright/test";

const NAME = `S1 proof ${Date.now()}`;

test("create → fill (conditionals reveal) → reopen → everything is there", async ({
  page,
  context,
}) => {
  // Create.
  await page.goto("/");
  await page.getByLabel("Project name").fill(NAME);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();

  // Description.
  await page
    .getByLabel("Business Purpose or Objective")
    .fill("Optimise shift scheduling.");
  await page
    .getByLabel("Activity / Use-Case Description")
    .fill("AI-assisted workforce scheduling with a SaaS vendor.");
  await page
    .getByLabel("Technology / Non-Technology")
    .selectOption("Technology");

  // Ownership.
  await page.getByLabel("Business Owner").fill("P. Sharma");

  // Categorization — conditional reveals.
  await expect(page.getByLabel("Other Business Units Involved")).toBeHidden();
  await page.getByLabel("Responsible Business Unit").fill("Workforce Ops");
  await expect(page.getByLabel("Other Business Units Involved")).toBeVisible();
  await expect(
    page.getByText("Shown because a responsible business unit was entered."),
  ).toBeVisible();
  await page.getByLabel("Priority").selectOption("High");
  await page.getByLabel("Lifecycle Stage").selectOption("POC");
  await expect(page.getByLabel("Third Parties Not in Coupa")).toBeHidden();
  await page.getByLabel("Third-Party / Vendor Name(s)").fill("Cadenza Inc");
  await expect(page.getByLabel("Third Parties Not in Coupa")).toBeVisible();

  // Compliance & Data — includesAny reveal.
  await expect(page.getByText("PII Type Details")).toBeHidden();
  await page.getByRole("checkbox", { name: "Confidential" }).check();
  await expect(page.getByText("PII Type Details")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Employee personal information" })
    .check();
  await page
    .getByRole("checkbox", { name: "Name, address, phone, email" })
    .check();

  // Completeness meter reflects reality.
  await expect(page.getByText("All required fields answered.")).toBeVisible();

  // Save — assert the dedicated status region, not loose page text (a
  // substring match on "saved" collided with the page's "Last saved …"
  // line and let the test close the page mid-save).
  await page.getByRole("button", { name: "Save intake" }).click();
  await expect(page.getByRole("status")).toHaveText("All changes stored");

  // "Close the browser, reopen" — a brand-new page, cold load.
  const url = page.url();
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto(url);
  await expect(fresh.getByRole("heading", { name: NAME })).toBeVisible();
  await expect(fresh.getByLabel("Business Purpose or Objective")).toHaveValue(
    "Optimise shift scheduling.",
  );
  await expect(fresh.getByLabel("Responsible Business Unit")).toHaveValue(
    "Workforce Ops",
  );
  await expect(fresh.getByLabel("Third-Party / Vendor Name(s)")).toHaveValue(
    "Cadenza Inc",
  );
  await expect(fresh.getByLabel("Third Parties Not in Coupa")).toBeVisible();
  await expect(
    fresh.getByRole("checkbox", { name: "Confidential" }),
  ).toBeChecked();
  await expect(
    fresh.getByRole("checkbox", { name: "Employee personal information" }),
  ).toBeChecked();

  // And the list shows it.
  await fresh.goto("/");
  await expect(fresh.getByRole("link", { name: NAME })).toBeVisible();
});
