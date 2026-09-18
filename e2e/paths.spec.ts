/**
 * S3 done-when: paths light with reasons, and changing an upstream answer
 * re-derives everything downstream. Rendered DOM only (NFR-7).
 */
import { expect, test } from "@playwright/test";
import {
  answerRemainingGates,
  completeIntake,
  startAssessment,
} from "./helpers";

/**
 * Open the risk-area record on the standing page.
 *
 * The map, the parts and their provenance used to sit on the face of that
 * screen, which is part of why it ran to 1,067 words (G-91). They are one
 * click away now; the rules they carry are unchanged, so these journeys make
 * the click a person would.
 */
async function openAreas(page: import("@playwright/test").Page) {
  await page
    .locator(".standing-detail-block", { hasText: "Which risk areas apply" })
    .locator("summary")
    .click();
}

test("open areas narrow down; the engine adds paths and says why", async ({
  page,
}) => {
  const base = await startAssessment(page, `Paths ${Date.now()}`);
  // AI + personal information + a vendor: the demo scenario in miniature.
  await page.goto(`${base}/intake/description`);
  await page
    .getByLabel("Project Description")
    .fill("AI drafts shift rosters. Shorten scheduling effort.");
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
  await page.getByLabel(/Procurement \(Coupa\)/).selectOption("Yes");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();
  await page.getByRole("radio", { name: /Confidential/ }).check();
  await page
    .getByRole("button", { name: /Continue to the risk areas/ })
    .click();

  // Answer through the gates; the last one hands off to the paths screen.
  await expect(
    page.getByRole("heading", { name: "Third-Party & Supply Chain" }),
  ).toBeVisible();
  await answerRemainingGates(page, base);

  // A path nobody was asked about, with its reason on screen.
  await expect(page.getByText(/Supplier Concentration/)).toBeVisible();
  await expect(page.getByText(/every supplier gets this one/)).toBeVisible();

  // Choose personal information — the cross-domain path appears because the
  // AI gate is also open. Two areas combining, nobody connected them.
  await page
    .getByRole("checkbox", { name: /Personal information is involved/ })
    .check();
  await page
    .getByRole("checkbox", {
      name: /Logical access to enterprise environments/,
    })
    .check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();

  // The summary lists what will be asked, chosen and derived alike. The
  // journey now runs on into severity, so ask for the summary directly.
  await page.goto(`${base}/assess/complete`);
  await openAreas(page);
  await expect(page.getByText("The parts in play")).toBeVisible();
  await expect(page.getByText(/Personal Information in AI/)).toBeVisible();
  // A derived path still says what derived it (§24.5).
  await expect(
    page.getByText(/personal information is involved and that this uses AI/),
  ).toBeVisible();
});

test("changing an upstream answer re-derives the paths — nothing is stored", async ({
  page,
}) => {
  const base = await startAssessment(page, `Rederive ${Date.now()}`);
  await completeIntake(page, base);

  await answerRemainingGates(page, base);
  // completeIntake says No to AI, so the AI area is closed and never appears.
  await expect(page.getByText("Which AI usage patterns apply?")).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: /Personal information is involved/ })
    .check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();
  await page.goto(`${base}/assess/complete`);
  await openAreas(page);
  await expect(page.getByText(/Personal Information in AI/)).toHaveCount(0);

  // Now go back to intake and say the activity DOES use AI.
  await page.goto(`${base}/intake/description`);
  await page
    .getByLabel("Does this use AI or machine learning?")
    .selectOption("Yes");
  await page
    .getByLabel("What does the AI do?")
    .fill("Drafts shifts for a supervisor to approve.");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();
  await expect(page.getByRole("heading", { name: "Ownership" })).toBeVisible();

  // The AI area re-opened and the cross-domain path lit itself — with no
  // migration, because nothing derived was ever written down.
  await page.goto(`${base}/assess/paths`);
  await expect(page.getByText("Which AI usage patterns apply?")).toBeVisible();
  await expect(page.getByText(/Personal Information in AI/)).toBeVisible();
});

test("answering No to everything still reaches the summary (B2)", async ({
  page,
}) => {
  // A dead end: the empty state had no button and no link, and the only way
  // on was to type the URL. Found by independent verification.
  const base = await startAssessment(page, `All no ${Date.now()}`);
  // An intake that closes everything it can: no AI, no third party, public
  // data. completeIntake picks Internal, which keeps privacy open.
  await page.goto(`${base}/intake/description`);
  await page
    .getByLabel("Project Description")
    .fill("A process change, no technology. Reorder approval steps.");
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
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();
  const publicLevel = page.getByRole("radio", { name: /Public/ });
  await publicLevel.check();
  await expect(publicLevel).toBeChecked();
  await page
    .getByRole("button", { name: /Continue to the risk areas/ })
    .click();
  await expect(page).toHaveURL(/\/assess\//);

  // Say No to every gate that can be answered.
  for (let step = 0; step < 14; step++) {
    await page.goto(`${base}/assess/paths`);
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/assess/paths")) break;
    await page.getByRole("button", { name: /No, it doesn't/ }).click();
    await page.waitForLoadState("networkidle");
  }
  await expect(
    page.getByRole("heading", { name: /Why there.s nothing here/ }),
  ).toBeVisible();
  // The header must not tell them to narrow something the page says is not
  // there — the two contradicted each other on the same screen.
  await expect(
    page.getByText(/none of the areas that apply ask a follow-up/),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /See the summary|Continue to how severe/ })
    .click();
  await page.goto(`${base}/assess/complete`);
  // It must not claim they answered something they were never asked: the
  // row says nobody was asked, never that they said "none apply".
  const parts = page.locator(".standing-row", { hasText: "Which parts" });
  await expect(parts).toContainText("None of the open areas asks a follow-up");
  await expect(parts).toContainText("Nothing to do");
  await expect(
    page.getByText(/You told us none of the specific threads apply/),
  ).toHaveCount(0);
  // And there is always a way on — the dead end this test was written for.
  await expect(page.locator(".btn-lead")).toBeVisible();
});

test("one tick records one area, not four (N3)", async ({ page }) => {
  // Ticking one box used to commit a positive "none of these apply" for
  // every other open area — three questions answered on the person's behalf.
  const base = await startAssessment(page, `One tick ${Date.now()}`);
  await completeIntake(page, base);
  await answerRemainingGates(page, base);

  await page
    .getByRole("checkbox", { name: /Personal information is involved/ })
    .check();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  // The other open areas are still outstanding, and the summary says so
  // rather than presenting them as narrowed.
  await page.goto(`${base}/assess/complete`);
  await expect(page.locator("h2.display")).toHaveText("Ready to narrow it down.");
  await expect(page.locator(".btn-lead")).toContainText("Narrow down");
});

test("a gate answered by another gate does not claim to come from intake (N2)", async ({
  page,
}) => {
  const base = await startAssessment(page, `Provenance ${Date.now()}`);
  await page
    .getByLabel("Project Description")
    .fill("Promote a proof of concept. Move the pilot into production.");
  await page
    .getByLabel("Does this use AI or machine learning?")
    .selectOption("No");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();
  await page.getByLabel("Business Owner").selectOption("d.chen");
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Moving a proof of concept into production");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();
  await page.getByLabel("Responsible Business Unit").selectOption("BU_OPS");
  await page
    .getByLabel("Does anything about this involve a company outside ours?")
    .selectOption("No");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();
  await page.getByRole("radio", { name: /Internal/ }).check();
  await page
    .getByRole("button", { name: /Continue to the risk areas/ })
    .click();
  await expect(page).toHaveURL(/\/assess\//);

  // Security is derived from Architecture, which is derived from intake.
  // All three surfaces must name the real source, not just the gate screen.
  await page.goto(`${base}/assess/security-resilience`);
  await expect(page.getByText("Answered from your answers")).toBeVisible();
  const rail = page.getByRole("navigation", { name: "Risk areas" });
  await expect(rail.getByRole("link", { name: /Security/ })).toContainText(
    "from your answers",
  );
  await page.goto(`${base}/assess/complete`);
  await openAreas(page);
  await expect(
    page.getByText(/Security & Resilience.*answered from your answers/),
  ).toBeVisible();
});

test("a tick survives leaving the screen by the rail (S2)", async ({
  page,
}) => {
  const base = await startAssessment(page, `Ticks ${Date.now()}`);
  await completeIntake(page, base);
  await answerRemainingGates(page, base);

  await page
    .getByRole("checkbox", { name: /Personal information is involved/ })
    .check();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  // The rail is the primary navigation on this screen; leaving by it used
  // to discard the tick with no warning and no trace.
  await page
    .getByRole("navigation", { name: "Risk areas" })
    .getByRole("link", { name: /Governance/ })
    .click();
  await expect(page.getByText("Nothing to answer")).toBeVisible();
  await page.goto(`${base}/assess/paths`);
  await expect(
    page.getByRole("checkbox", { name: /Personal information is involved/ }),
  ).toBeChecked();
});
