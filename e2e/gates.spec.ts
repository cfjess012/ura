/**
 * S2 done-when (SPEC §17): "Gate answers persist; No closes its category."
 * Rendered-DOM only (NFR-7). Also proves FR-22: intake pre-answers gates
 * visibly, with a reason, and remains changeable.
 */
import { expect, test } from "@playwright/test";

const NAME = `S2 gates ${Date.now()}`;

test("intake pre-answers gates; answers persist; No closes a category", async ({
  page,
  context,
}) => {
  // Intake, with the two answers that pre-fill gates.
  await page.goto("/projects");
  await page.getByLabel("Start a new assessment").fill(NAME);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await page.getByLabel("Business Purpose or Objective").fill("Shorten scheduling effort.");
  await page.getByLabel("Activity / Use-Case Description").fill("Vendor scheduling tool.");
  await page.getByLabel("Does this use AI or machine learning?").selectOption("Yes");
  await page.getByLabel("What does the AI do?").fill("Drafts shifts for a supervisor to approve.");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();

  await page.getByLabel("Business Owner").fill("P. Sharma");
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Brand new");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();

  await page.getByLabel("Responsible Business Unit").fill("Workforce Ops");
  await page.getByLabel("Third-Party / Vendor Name(s)").fill("Cadenza Inc");
  await page
    .getByLabel("Has this vendor been onboarded through Procurement (Coupa)?")
    .selectOption("Yes");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();

  await page.getByRole("checkbox", { name: "Confidential" }).check();

  // Leaving the last section saves and hands off to the risk areas.
  await page.getByRole("button", { name: /Continue to the risk areas/ }).click();
  await expect(page.getByRole("heading", { name: "Third-Party & Supply Chain" })).toBeVisible();

  // FR-22: pre-answered from intake, with its reason, and changeable.
  await expect(page.getByText("Answered from your intake")).toBeVisible();
  await expect(page.getByText("you named a vendor at intake")).toBeVisible();
  await expect(page.getByRole("button", { name: /Yes, it applies/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Confirming moves to the next area.
  await page.getByRole("button", { name: /Yes, it applies/ }).click();
  await expect(page.getByRole("heading", { name: "Solution Architecture" })).toBeVisible();

  // FR-3: No closes the category — the rail says so.
  await page.getByRole("button", { name: /No, it doesn't/ }).click();
  await expect(page.getByRole("heading", { name: "AI & Model Risk" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Systems & apps/ }).getByText("Not applicable"),
  ).toBeVisible();

  // The AI gate is pre-answered from intake too.
  await expect(page.getByText("this uses AI or machine learning")).toBeVisible();

  // Answers persist across a cold reload (insert-only, read back newest).
  const url = page.url();
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto(url);
  await expect(
    fresh.getByRole("link", { name: /Systems & apps/ }).getByText("Not applicable"),
  ).toBeVisible();
  await expect(fresh.getByRole("link", { name: /Third party/ }).getByText("Applies")).toBeVisible();

  // Walking to the end lands on an honest "still being built" state (§24.7).
  await fresh.goto(url.replace(/assess\/.*$/, "assess/complete"));
  await expect(fresh.getByRole("heading", { name: /Coming next/ })).toBeVisible();
  await expect(fresh.getByText("Solution Architecture")).toBeVisible();
});
