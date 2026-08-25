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
  await page
    .getByLabel("Project Description")
    .fill("Vendor scheduling tool. Shorten scheduling effort.");
  await page
    .getByLabel("Does this use AI or machine learning?")
    .selectOption("Yes");
  await page
    .getByLabel("What does the AI do?")
    .fill("Drafts shifts for a supervisor to approve.");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();

  await page.getByLabel("Business Owner").selectOption("d.chen");
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Brand new");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();

  await page.getByLabel("Responsible Business Unit").selectOption("BU_OPS");
  await page
    .getByLabel("Does anything about this involve a company outside ours?")
    .selectOption("Yes");
  await page.locator('input[name="vendorNames"][value="V_SNOWFLAKE"]').check();
  await page
    .getByLabel("Has this vendor been onboarded through Procurement (Coupa)?")
    .selectOption("Yes");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();

  await page.getByRole("radio", { name: /Confidential/ }).check();

  // Leaving the last section saves and hands off to the risk areas.
  await page
    .getByRole("button", { name: /Continue to the risk areas/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Third-Party & Supply Chain" }),
  ).toBeVisible();

  // FR-22: pre-answered from intake, with its reason, and changeable.
  await expect(page.getByText("Answered from your intake")).toBeVisible();
  await expect(
    page.getByText("you told us a company outside ours is involved"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Yes, it applies/ }),
  ).toHaveAttribute("aria-pressed", "true");

  // Confirming moves to the next area.
  await page.getByRole("button", { name: /Yes, it applies/ }).click();
  await expect(
    page.getByRole("heading", { name: "Solution Architecture" }),
  ).toBeVisible();

  // FR-3: No closes the category — the rail says so.
  await page.getByRole("button", { name: /No, it doesn't/ }).click();
  await expect(
    page.getByRole("heading", { name: "AI & Model Risk" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: /Systems & apps/ })
      .getByText("Not applicable"),
  ).toBeVisible();

  // The AI gate is pre-answered from intake too.
  await expect(
    page.getByText("this uses AI or machine learning"),
  ).toBeVisible();

  // Answers persist across a cold reload (insert-only, read back newest).
  const url = page.url();
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto(url);
  await expect(
    fresh
      .getByRole("link", { name: /Systems & apps/ })
      .getByText("Not applicable"),
  ).toBeVisible();
  await expect(
    fresh.getByRole("link", { name: /Third party/ }).getByText("Applies"),
  ).toBeVisible();

  // Walking to the end lands on an honest "still being built" state (§24.7).
  await fresh.goto(url.replace(/assess\/.*$/, "assess/complete"));
  await expect(
    fresh.getByRole("heading", { name: /What happens after you submit/ }),
  ).toBeVisible();
  await expect(fresh.getByText("Solution Architecture")).toBeVisible();
});

test("intake can CLOSE risk areas, and an area that applies to everyone is never asked", async ({
  page,
}) => {
  // The audit's worst case: a process change with no technology, no vendor,
  // no AI. It used to arrive at Tier 1 with nothing pre-answered and all
  // eleven questions to work through (audits/instrument-2026-08-21.md, C-1).
  await page.goto("/projects");
  await page
    .getByLabel("Start a new assessment")
    .fill(`Plain process ${Date.now()}`);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await page
    .getByLabel("Project Description")
    .fill("Reorder approval steps. Fewer handoffs in month-end close.");
  await page
    .getByLabel("Does this use AI or machine learning?")
    .selectOption("No");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();

  await page.getByLabel("Business Owner").selectOption("d.chen");
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Brand new");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();

  await page.getByLabel("Responsible Business Unit").selectOption("BU_OPS");
  await page
    .getByLabel("Does anything about this involve a company outside ours?")
    .selectOption("No");
  // Saying No removes the follow-up entirely rather than leaving a blank box.
  await expect(page.getByLabel("Which companies?")).toBeHidden();
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();

  await page.getByRole("radio", { name: /Public/ }).check();
  await page
    .getByRole("button", { name: /Continue to the risk areas/ })
    .click();

  // Two areas arrive already closed, each saying why.
  await expect(
    page.getByRole("heading", { name: "Third-Party & Supply Chain" }),
  ).toBeVisible();
  await expect(
    page.getByText("you told us this is built and run entirely in-house"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /No, it doesn't/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const rail = page.getByRole("navigation", { name: "Risk areas" });
  await expect(rail.getByRole("link", { name: /Third party/ })).toContainText(
    "Not applicable",
  );
  await expect(rail.getByRole("link", { name: /AI/ })).toContainText(
    "Not applicable",
  );

  // Governance applies to everyone, so it is stated rather than asked (C-8).
  // Governance is stated, not asked. The rail says so in the words the
  // screen now uses — it stopped being a numbered step somebody could click
  // into and became a standing fact about every assessment.
  await expect(rail.getByRole("link", { name: /Governance/ })).toContainText(
    "Governance applies to every assessment",
  );
  await rail.getByRole("link", { name: /Governance/ }).click();
  await expect(page.getByText("Nothing to answer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Yes, it applies/ }),
  ).toHaveCount(0);
});
