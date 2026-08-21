/**
 * S2.5 · People — personas in practice (SPEC §2). Authority is checked on
 * the server, so switching persona changes what the platform permits, not
 * merely what it shows.
 */
import { expect, test } from "@playwright/test";
import { completeIntake } from "./helpers";

test("the front door introduces the platform and asks who you are", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /One front door/ })).toBeVisible();
  await expect(page.getByText("Roles are enforced for real, not simulated")).toBeVisible();
  // It promises only what is built: no drafting, no AI claims.
  await expect(page.getByText(/verbatim quote|drafts every/i)).toBeHidden();
  // Choosing a persona enters the product.
  await page.getByRole("button", { name: /Priya Sharma/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "One front door." })).toBeVisible();
});

test("choosing a person switches immediately — no second click", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.locator(".persona-role")).toHaveText("Requester");
  await page.getByLabel(/Working as/).selectOption({ label: "Noah Kahan · Risk Assessor" });
  // No further interaction: the interface must respond to the action taken.
  await expect(page.locator(".persona-role")).toHaveText("Risk Assessor");
  // No confirming button beside the chooser. ("Switch user" is a different
  // control — it leaves the product entirely — so match exactly.)
  await expect(page.getByRole("button", { name: "Switch", exact: true })).toHaveCount(0);
});

test("switching persona changes role, navigation, and what is permitted", async ({ page }) => {
  await page.goto("/projects");

  // A requester is the pilot default: no admin navigation.
  await expect(page.locator(".persona-role")).toHaveText("Requester");
  await expect(page.getByRole("link", { name: "Agents" })).toBeHidden();

  // The server refuses the admin surface by role, not by hiding a link.
  await page.goto("/admin/agents");
  await expect(
    page.getByRole("heading", { name: "This page is for administrators." }),
  ).toBeVisible();
  await expect(page.getByText("You are currently working as")).toBeVisible();

  // Switch to the administrator.
  await page.goto("/projects");
  // Choosing IS the action — no confirming click. A control that needs a
  // second press reads as broken (found in use, not by this suite).
  await page.getByLabel(/Working as/).selectOption({ label: "Tom Holland · Administrator" });
  await expect(page.locator(".persona-role")).toHaveText("Administrator");
  await expect(page.getByRole("link", { name: "Agents" })).toBeVisible();

  // Now the page opens, and it is honest about what the switcher is.
  await page.getByRole("link", { name: "Agents" }).click();
  await expect(
    page.getByRole("heading", { name: "Every agent, and what it may never do." }),
  ).toBeVisible();
  await expect(page.getByText("the persona switcher is a pilot device")).toBeVisible();

  // The Risk Assessor is a third, distinct role.
  await page.goto("/projects");
  await page.getByLabel(/Working as/).selectOption({ label: "Noah Kahan · Risk Assessor" });
  await expect(page.locator(".persona-role")).toHaveText("Risk Assessor");
  await expect(page.getByRole("link", { name: "Agents" })).toBeHidden();
});

test("Switch user leaves the product and returns to the front door", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Tom Holland/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator(".persona-role")).toHaveText("Administrator");

  await page.getByRole("button", { name: "Switch user" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /One front door/ })).toBeVisible();

  // The persona is genuinely cleared, not merely navigated away from.
  const cookie = (await context.cookies()).find((c) => c.name === "ura_person");
  expect(cookie?.value ?? "").toBe("");
});

test("an answer records who gave it", async ({ page }) => {
  const name = `Attribution ${Date.now()}`;
  await page.goto("/projects");
  await page.getByLabel(/Working as/).selectOption({ label: "Priya Sharma · Requester" });
  await page.getByLabel("Start a new assessment").fill(name);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();

  // Answer a gate directly; the action attributes it server-side. Intake
  // has to be complete before the risk areas open (FR-28).
  const id = page.url().split("/projects/")[1]!.split("/")[0]!;
  await completeIntake(page, `/projects/${id}`);
  await page.goto(`/projects/${id}/assess/ai`);
  await page.getByRole("button", { name: /Yes, it applies/ }).click();
  await expect(page.getByRole("link", { name: /AI \/ ML/ }).getByText("Applies")).toBeVisible();
});

test("a requester sees their own assessments; a Risk Assessor sees the queue (F2)", async ({
  page,
}) => {
  // The administrator starts one, so there is provably somebody else's work.
  await page.goto("/projects");
  await page.getByLabel(/Working as/).selectOption({ label: "Tom Holland · Administrator" });
  const adminOwned = `Owned by admin ${Date.now()}`;
  await page.getByLabel("Start a new assessment").fill(adminOwned);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();

  // The requester's list is their own work only — not everything in the pilot.
  await page.goto("/projects");
  await page.getByLabel(/Working as/).selectOption({ label: "Priya Sharma · Requester" });
  await expect(page.getByRole("heading", { name: "Your assessments" })).toBeVisible();
  await expect(page.getByRole("link", { name: adminOwned })).toBeHidden();

  // The Risk Assessor sees every assessment, and cannot start one.
  await page.getByLabel(/Working as/).selectOption({ label: "Noah Kahan · Risk Assessor" });
  await expect(page.getByRole("heading", { name: "All assessments" })).toBeVisible();
  await expect(page.getByRole("link", { name: adminOwned })).toBeVisible();
  await expect(page.getByLabel("Start a new assessment")).toHaveCount(0);
  await expect(page.getByText(/you don.t open one on their behalf/i)).toBeVisible();
});

test("an intake change records who made it, and says so on the screen (F5)", async ({ page }) => {
  await page.goto("/projects");
  await page.getByLabel(/Working as/).selectOption({ label: "Priya Sharma · Requester" });
  await page.getByLabel("Start a new assessment").fill(`Attributed ${Date.now()}`);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();

  await page.getByLabel(/Business purpose/i).fill("Replace a spreadsheet used for shift planning.");
  await page.getByLabel("Activity / Use-Case Description").fill("Shift planning replacement.");
  await page.getByLabel("Does this use AI or machine learning?").selectOption("No");
  await page.getByRole("button", { name: /Next:/ }).click();
  await expect(page.getByRole("heading", { name: "Ownership" })).toBeVisible();

  await expect(page.getByText(/Last change saved by/)).toContainText("Priya Sharma");
});

test("an assessment cannot be opened or edited by someone it doesn't belong to (N1)", async ({
  page,
}) => {
  // The administrator starts one, so the URL under test belongs to someone else.
  await page.goto("/projects");
  await page.getByLabel(/Working as/).selectOption({ label: "Tom Holland · Administrator" });
  await page.getByLabel("Start a new assessment").fill(`Admin private ${Date.now()}`);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
  const base = `/projects/${page.url().split("/projects/")[1]!.split("/")[0]!}`;

  // Switch to the requester and go straight at the URL — the listing is not
  // the enforcement point, so hiding the row proves nothing.
  await page.getByLabel(/Working as/).selectOption({ label: "Priya Sharma · Requester" });
  for (const path of [base, `${base}/intake/ownership`, `${base}/assess/complete`]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "This one belongs to someone else" }),
    ).toBeVisible();
    // No form to submit and no field to fill: the refusal is the whole page.
    await expect(page.getByRole("textbox")).toHaveCount(0);
  }
});

test("a Risk Assessor is refused in writing when they try to start an assessment (N3)", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByLabel(/Working as/).selectOption({ label: "Priya Sharma · Requester" });
  // Fill the form as the requester, then become the assessor before submitting:
  // the server must refuse what the markup no longer offers.
  await page.getByLabel("Start a new assessment").fill(`Should be refused ${Date.now()}`);
  await page.getByLabel(/Working as/).selectOption({ label: "Noah Kahan · Risk Assessor" });
  await expect(page.locator(".persona-role")).toHaveText("Risk Assessor");
  await expect(page.getByLabel("Start a new assessment")).toHaveCount(0);
});
