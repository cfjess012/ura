/**
 * §22.1 · policy in the product, and §7 · nothing unbuilt is reachable.
 *
 * The E2E suite runs with no agent connected, which is exactly the state
 * most of this must be correct in: the deterministic half of the policy
 * feature works with no model at all, and the assistant must be absent
 * rather than present-and-apologetic.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  answerRemainingGates,
  scenarioIntake,
  startAssessment,
} from "./helpers";

/** An assessment far enough in that control questions are being asked. */
async function atControls(page: Page, name: string): Promise<string> {
  const base = await startAssessment(page, name);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page
    .getByRole("checkbox", {
      name: /Logical access to enterprise environments/,
    })
    .check();
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
  return base;
}

test("with no agent connected the assistant is absent, not apologetic (§7)", async ({
  page,
}) => {
  // A widget explaining it cannot help is worse than no widget: it implies
  // a capability that does not run.
  // On a screen we know renders, so the assertion is about the assistant
  // and not about where a half-finished intake happens to redirect.
  await atControls(page, `No agent ${Date.now()}`);
  await expect(page.locator(".q3").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Talk it through/ }),
  ).toHaveCount(0);
  await expect(page.locator(".assistant")).toHaveCount(0);
});

test("a control question says which clause requires it, in the policy's own words", async ({
  page,
}) => {
  await atControls(page, `Authority ${Date.now()}`);
  const why = page.locator(".why-asked").first();
  await expect(why).toBeVisible();
  // Collapsed by default — an authority is worth having and is not worth
  // pushing the question down the page.
  await expect(why.locator(".why-asked-quote")).toBeHidden();
  await why.click();
  await expect(why.locator(".why-asked-quote")).toBeVisible();
  // Quoted verbatim, and cited by reference and version.
  await expect(why).toContainText(/shall be/);
  await expect(why).toContainText(/IAM-STD-004/);
  await expect(why).toContainText(/version/);
});

test("the authority never blocks an answer — it explains what follows", async ({
  page,
}) => {
  await atControls(page, `Not blocking ${Date.now()}`);
  await page.locator(".why-asked").first().click();
  await expect(page.locator(".why-asked").first()).toContainText(
    /is not blocked/i,
  );
  // And the question is still answerable, which is the point.
  const card = page.locator(".q3").first();
  await card
    .locator("> .q3-answers")
    .getByRole("radio", { name: "No" })
    .click();
  await card
    .locator("> .q3-note textarea")
    .fill("No gateway in front of it today.");
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
});

test("a policy-governed No reaches the reviewer as a breach with both quotes", async ({
  page,
}) => {
  const base = await atControls(page, `Breach ${Date.now()}`);
  const card = page.locator(".q3").first();
  await card
    .locator("> .q3-answers")
    .getByRole("radio", { name: "No" })
    .click();
  await card
    .locator("> .q3-note textarea")
    .fill("Not in place — we rely on the vendor.");
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  await page.goto(`${base}/submit`);
  await page.locator(".gaps .confirm input").check();
  await page.locator(".declare .confirm input").check();
  await page.getByRole("button", { name: /Declare and submit/ }).click();
  await expect(
    page.getByRole("heading", { name: "With a reviewer" }),
  ).toBeVisible();

  await page.goto(`${base}/review`);
  // Labelled in words, never by colour alone.
  await expect(page.getByText("Breaches policy").first()).toBeVisible();
  const breach = page.locator(".breach").first();
  await expect(breach).toBeVisible();
  // Both sides: the clause, and what the person actually wrote.
  await expect(breach.locator(".breach-quote")).toContainText(/shall/);
  await expect(page.locator(".summary-list")).toContainText(
    "we rely on the vendor",
  );
  await expect(breach).toContainText(/expects/);
});
