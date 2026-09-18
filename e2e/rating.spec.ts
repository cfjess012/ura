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

  // Nothing severe answered yet, but intake already said the data is
  // confidential — so the reading is a floor, and it says it is one (G-81).
  await page.goto(`${base}/assess/objectives`);
  const chip = page.locator(".rating-summary").first();
  await expect(chip).toContainText("Inherent");
  await expect(chip).toContainText("Medium");
  await expect(chip).toContainText("so far");

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
  await expect(chip).not.toContainText("High");
  // Back to the floor intake set, still labelled as one.
  await expect(chip).toContainText("Medium");
  await expect(chip).toContainText("so far");
});

test("an assessment nobody has answered has no band, rather than a low one", async ({
  page,
}) => {
  // The defect this covers reached a reviewer's queue: a submitted record
  // with nothing answered read "Low", because the scale had no way to say
  // nobody had assessed it (G-81). Intake here is complete and deliberately
  // sets no floor — no AI, no third party, public data — so the only reason
  // there is no band is that nobody has assessed it.
  const base = await startAssessment(page, `Unrated ${Date.now()}`);
  await page.goto(`${base}/intake/description`);
  await page
    .getByLabel("Project Description")
    .fill("A process change we have recorded but not yet assessed.");
  await page.getByLabel("Does this use AI or machine learning?").selectOption("No");
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
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();
  await page.getByRole("radio", { name: /Public/ }).check();
  await page.getByRole("button", { name: /Continue to the risk areas/ }).click();
  await expect(page).toHaveURL(/\/assess\//);

  await page.goto(`${base}/assess/objectives`);
  const chip = page.locator(".rating-summary").first();
  await expect(chip).toContainText("Not yet rated");
  await expect(chip).not.toContainText("Low");
  await chip.click();
  await expect(page.locator(".rating-reasons").first()).toContainText(
    "nothing that could rate this has been answered yet",
  );
});
