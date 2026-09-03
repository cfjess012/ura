/**
 * S15 (FR-50, §19 "Risk rating"): the chip is a band in words with its
 * reasons one click away, it reads only the severity answers the
 * assessment is asking, and the ledger, the chip and the paths screen agree
 * on the same project state. Rendered DOM only (NFR-7).
 *
 * The verifier's finding behind the second half: a person who ticked a part,
 * answered High, then unticked the part was shown "INHERENT High" beside a
 * screen saying no severity answer was given, with no question left to
 * change the answer on (S15-B2).
 */
import { expect, test } from "@playwright/test";
import {
  answerRemainingGates,
  scenarioIntake,
  startAssessment,
} from "./helpers";

const logicalAccess = /Logical access to enterprise environments/;

test("the rating follows the severity answers, and stops reading a part that is unticked", async ({
  page,
}) => {
  const base = await startAssessment(page, `Rating ${Date.now()}`);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);

  // Nothing severe answered yet: the reading is Low, and says why.
  await page.goto(`${base}/assess/objectives`);
  const chip = page.locator(".rating-summary").first();
  await expect(chip).toContainText("Inherent");
  await expect(chip).toContainText("Low");

  // Tick a part, answer High.
  await page.goto(`${base}/assess/paths`);
  await page.getByRole("checkbox", { name: logicalAccess }).check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();
  await expect(page).toHaveURL(/\/assess\/severity/);
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("navigation", { name: "Severity areas" })
    .getByRole("link", { name: /Third-Party/ })
    .click();
  const providerAccess = page.locator(".q2", {
    hasText: "Level of Provider Access",
  });
  await providerAccess.getByRole("radio", { name: /High/ }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  // The controls screen reads it: a word, its reasons in words, no number.
  await page.goto(`${base}/assess/objectives`);
  await expect(chip).toContainText("High");
  await expect(chip).not.toContainText(/\d/);
  await chip.click();
  const reasons = page.locator(".rating-reasons").first();
  await expect(reasons).toContainText("a whole risk area sits at High");
  await expect(reasons).not.toContainText(/sev\.|T[0-9]-[A-Z]{2,5}-[0-9]/);

  // Untick the part. The answer stays on record (insert-only), but the
  // question is no longer asked — so the rating no longer reads it, and
  // the ledger, the chip and the severity screen say the same thing.
  await page.goto(`${base}/assess/paths`);
  await page.getByRole("checkbox", { name: logicalAccess }).uncheck();
  await page.getByRole("button", { name: /Next: how severe/ }).click();
  // Let the save and the redirect finish before touching the new page — a
  // click that lands during the navigation is lost with the page it hit.
  await expect(page).toHaveURL(/\/assess\/severity/);
  await page.waitForLoadState("networkidle");
  // The area may stay lit by other parts; the question this part asked is
  // what must go — and with it, the answer the rating was reading.
  await page
    .getByRole("navigation", { name: "Severity areas" })
    .getByRole("link", { name: /Third-Party/ })
    .click();
  await expect(
    page.getByRole("heading", { name: /Third-Party/, level: 2 }),
  ).toBeVisible();
  await expect(
    page.locator(".q2", { hasText: "Level of Provider Access" }),
  ).toHaveCount(0);
  await page.goto(`${base}/assess/objectives`);
  await expect(chip).toContainText("Low");
  await expect(chip).not.toContainText("High");
});
