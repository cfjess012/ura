/**
 * S6 · Tier 3 (FR-12, FR-13) — the tier that asks whether the control is
 * actually there. Driven in a browser, because the defects that mattered in
 * this project lived in transitions no unit test can see.
 */
import { expect, test } from "@playwright/test";
import { answerRemainingGates, scenarioIntake, startAssessment } from "./helpers";

/** Walk to Tier 3 with one severity answer, so controls have accumulated. */
async function atObjectives(page: import("@playwright/test").Page, name: string) {
  const base = await startAssessment(page, name);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page.getByRole("checkbox", { name: /Logical access to enterprise environments/ }).check();
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

test("the controls asked about are the ones the answers required", async ({ page }) => {
  await atObjectives(page, `Objectives ${Date.now()}`);
  const cards = page.locator(".q3");
  await expect(cards.first()).toBeVisible();
  // Every card says why it is being asked — the reason travels from
  // accumulation, it is not re-invented here.
  await expect(cards.first().getByText(/Level of Provider Access is High/)).toBeVisible();
});

test("children appear only on Yes, and vanish again (FR-13)", async ({ page }) => {
  await atObjectives(page, `Children ${Date.now()}`);
  const card = page.locator(".q3").first();
  const answers = card.locator("> .q3-answers");

  await expect(card.locator(".q3-child")).toHaveCount(0);
  await answers.getByRole("radio", { name: "Yes" }).click();
  await expect(card.locator(".q3-child").first()).toBeVisible();
  // Not "skipped" — gone (§3.4).
  await answers.getByRole("radio", { name: "Partial" }).click();
  await expect(card.locator(".q3-child")).toHaveCount(0);
});

test("anything but Yes has to be written down, and N-A asks a different question", async ({
  page,
}) => {
  await atObjectives(page, `Notes ${Date.now()}`);
  const card = page.locator(".q3").first();
  const answers = card.locator("> .q3-answers");

  await answers.getByRole("radio", { name: "Yes" }).click();
  await expect(card.locator("> .q3-note")).toHaveCount(0);

  await answers.getByRole("radio", { name: "No" }).click();
  await expect(card.locator("> .q3-note label")).toHaveText(
    "What exists today, and what is missing?",
  );

  await answers.getByRole("radio", { name: "N-A" }).click();
  await expect(card.locator("> .q3-note label")).toHaveText("Why doesn't this apply?");
});

test("submitting without the note is refused, and says which one", async ({ page }) => {
  await atObjectives(page, `Refuse ${Date.now()}`);
  const card = page.locator(".q3").first();
  await card.locator("> .q3-answers").getByRole("radio", { name: "No" }).click();
  await page.getByRole("button", { name: /Save and see where this stands/ }).click();

  await expect(page.locator(".missing.blocked")).toContainText(/note/i);
  // The person is put on the field that needs them, not left to find it.
  await expect(card.locator("> .q3-note textarea")).toBeFocused();
});

test("an answer survives leaving the screen and coming back", async ({ page }) => {
  const base = await atObjectives(page, `Persist ${Date.now()}`);
  const card = page.locator(".q3").first();
  await card.locator("> .q3-answers").getByRole("radio", { name: "No" }).click();
  await card.locator("> .q3-note textarea").fill("Nothing exists for this yet.");
  await page.getByRole("button", { name: /Save and see where this stands/ }).click();
  await page.waitForURL(/\/assess\/complete/);

  await page.goto(`${base}/assess/objectives`);
  const again = page.locator(".q3").first();
  await expect(again.locator("> .q3-answers").getByRole("radio", { name: "No" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(again.locator("> .q3-note textarea")).toHaveValue("Nothing exists for this yet.");
});

test("controls with no questions are declared, never silently dropped", async ({ page }) => {
  await atObjectives(page, `Boundary ${Date.now()}`);
  const recorded = page.locator(".card", { hasText: "Recorded for a reviewer" });
  await expect(recorded).toBeVisible();
  // It says how many, and why they are here — the boundary is stated, not
  // left for someone to notice (G-50's rule, one tier down).
  await expect(recorded).toContainText(/The pilot asks its detailed questions for \d+ of the \d+/);
});

test("an answer is saved when it is given, not when the form is submitted (G-40a)", async ({
  page,
}) => {
  // Every other assess screen autosaves; this one did not, so an answer
  // vanished on navigation with nothing said. That is the exact silent
  // discard G-40a forbids (verifier S6-4).
  const base = await atObjectives(page, `Autosave ${Date.now()}`);
  const card = page.locator(".q3").first();
  await card.locator("> .q3-answers").getByRole("radio", { name: "Yes" }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  // Leave WITHOUT pressing the forward button.
  await page.goto(`${base}/assess/complete`);
  await page.goto(`${base}/assess/objectives`);
  await expect(
    page.locator(".q3").first().locator("> .q3-answers").getByRole("radio", { name: "Yes" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("an answer needing a note is not saved until it has one", async ({ page }) => {
  // Autosaving a bare "No" would record a gap with no explanation — the one
  // thing §3.4 forbids.
  await atObjectives(page, `Halfformed ${Date.now()}`);
  const card = page.locator(".q3").first();
  await card.locator("> .q3-answers").getByRole("radio", { name: "No" }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("");
  await card.locator("> .q3-note textarea").fill("Nothing exists yet.");
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
});
