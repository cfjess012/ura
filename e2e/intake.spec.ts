/**
 * S1 done-when, verbatim from SPEC §17: "Create a project, complete intake,
 * close the browser, reopen: everything is there." Rendered-DOM assertions
 * only (NFR-7). Covers all three conditional kinds and the honest-uncertainty
 * options added in the S1 review.
 */
import { expect, test } from "@playwright/test";

const NAME = `S1 proof ${Date.now()}`;
const AI_DETAIL =
  "Drafts shift assignments; a supervisor approves before anything is published.";

test("create → fill (conditionals reveal) → reopen → everything is there", async ({
  page,
  context,
}) => {
  // Create.
  await page.goto("/");
  await page.getByLabel("Start a new assessment").fill(NAME);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();

  // Description — equalsAny reveal on the AI question.
  await page
    .getByLabel("Business Purpose or Objective")
    .fill("Optimise shift scheduling.");
  await page
    .getByLabel("Activity / Use-Case Description")
    .fill("AI-assisted workforce scheduling with a SaaS vendor.");
  await page
    .getByLabel("Technology / Non-Technology")
    .selectOption("Technology");
  await expect(page.getByLabel("What does the AI do?")).toBeHidden();
  await page
    .getByLabel("Does this use AI or machine learning?")
    .selectOption("Yes");
  await expect(page.getByLabel("What does the AI do?")).toBeVisible();
  await page.getByLabel("What does the AI do?").fill(AI_DETAIL);

  // Ownership — the prior-work pointer reveals only for updates.
  const priorRef = page.getByLabel(
    "Which assessment or ticket does it build on, if you know?",
  );
  await page.getByLabel("Business Owner").fill("P. Sharma");
  await expect(priorRef).toBeHidden();
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Moving a proof of concept into production");
  await expect(priorRef).toBeVisible();
  await priorRef.fill("RISK-2291");

  // Categorization — hasValue reveals, plus the optional launch date.
  await expect(page.getByLabel("Other Business Units Involved")).toBeHidden();
  await page.getByLabel("Responsible Business Unit").fill("Workforce Ops");
  await expect(page.getByLabel("Other Business Units Involved")).toBeVisible();
  await expect(
    page.getByText("Shown because a responsible business unit was entered."),
  ).toBeVisible();
  await page.getByLabel("Target Go-Live / Launch Date").fill("2026-11-02");
  const coupa = page.getByLabel(
    "Has this vendor been onboarded through Procurement (Coupa)?",
  );
  await expect(coupa).toBeHidden();
  await page.getByLabel("Third-Party / Vendor Name(s)").fill("Cadenza Inc");
  await expect(coupa).toBeVisible();
  await coupa.selectOption("I'm not sure");

  // Compliance & Data — includesAny reveal.
  await expect(page.getByLabel("Data Elements")).toBeHidden();
  await page.getByRole("checkbox", { name: "Confidential" }).check();
  await expect(page.getByLabel("Data Elements")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Employee personal information" })
    .check();

  // Completeness meter reflects reality.
  await expect(page.getByText("All required fields answered.")).toBeVisible();

  // Save — assert the dedicated status region, not loose page text (a
  // substring match on "saved" collided with the page's "Last saved …" line
  // and let the test close the page mid-save).
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
  await expect(
    fresh.getByLabel("Does this use AI or machine learning?"),
  ).toHaveValue("Yes");
  await expect(fresh.getByLabel("What does the AI do?")).toHaveValue(AI_DETAIL);
  await expect(
    fresh.getByLabel(
      "Which assessment or ticket does it build on, if you know?",
    ),
  ).toHaveValue("RISK-2291");
  await expect(fresh.getByLabel("Responsible Business Unit")).toHaveValue(
    "Workforce Ops",
  );
  await expect(fresh.getByLabel("Target Go-Live / Launch Date")).toHaveValue(
    "2026-11-02",
  );
  await expect(fresh.getByLabel("Third-Party / Vendor Name(s)")).toHaveValue(
    "Cadenza Inc",
  );
  await expect(
    fresh.getByLabel(
      "Has this vendor been onboarded through Procurement (Coupa)?",
    ),
  ).toHaveValue("I'm not sure");
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
