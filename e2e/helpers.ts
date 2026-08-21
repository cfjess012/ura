import { expect, type Page } from "@playwright/test";

/**
 * Answer every required intake field for a project already open at its first
 * section, leaving the browser on the risk areas.
 *
 * It exists because required fields are now enforced (FR-28) and several
 * journeys are about something else entirely — attribution, scoping, save
 * scope — and should not each re-type the same eight answers. Journeys that
 * are *about* intake still walk it field by field.
 */
export async function completeIntake(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/intake/description`);
  await page.getByLabel("Business Purpose or Objective").fill("Shorten scheduling effort.");
  await page.getByLabel("Activity / Use-Case Description").fill("Scheduling tool for shifts.");
  await page.getByLabel("Does this use AI or machine learning?").selectOption("No");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();

  await expect(page.getByRole("heading", { name: "Ownership" })).toBeVisible();
  await page.getByLabel("Business Owner").fill("P. Sharma");
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Brand new");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();

  await expect(page.getByRole("heading", { name: "Categorization" })).toBeVisible();
  await page.getByLabel("Responsible Business Unit").fill("Workforce Ops");
  await page
    .getByLabel("Does anything about this involve a company outside ours?")
    .selectOption("No");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();

  await expect(page.getByRole("heading", { name: "Compliance & Data" })).toBeVisible();
  await page.getByRole("radio", { name: /Internal/ }).check();
  await page.getByRole("button", { name: /Continue to the risk areas/ }).click();
  await expect(page).toHaveURL(/\/assess\//);
}

/** Start an assessment and return its base path. */
export async function startAssessment(page: Page, name: string): Promise<string> {
  await page.goto("/projects");
  await page.getByLabel("Start a new assessment").fill(name);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
  return `/projects/${page.url().split("/projects/")[1]!.split("/")[0]!}`;
}

/**
 * Walk whatever gates are still open, confirming any answer intake already
 * pre-filled rather than overwriting it, and land on the paths screen.
 *
 * Deliberately not "click Yes eleven times": that would flip pre-filled
 * answers and quietly test a different assessment from the one intake set
 * up. Each step waits for the URL to change so the walk never races itself.
 */
export async function answerRemainingGates(page: Page, base: string): Promise<void> {
  // Each step starts from the paths screen, which redirects to the first
  // gate still unanswered. That makes every step independent: no state is
  // carried between iterations, so nothing can race the redirect. Reading
  // the URL mid-redirect and clicking the outgoing document was exactly the
  // flake this replaces.
  for (let step = 0; step < 14; step++) {
    await page.goto(`${base}/assess/paths`);
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/assess/paths")) {
      await expect(page.getByRole("heading", { name: "Narrow it down" })).toBeVisible();
      return;
    }
    const yes = page.getByRole("button", { name: /Yes, it applies/ });
    const no = page.getByRole("button", { name: /No, it doesn't/ });
    await expect(yes).toBeVisible();
    // Confirm whatever intake already established; only decide where
    // nothing is decided. Clicking Yes everywhere would quietly test a
    // different assessment from the one intake set up.
    const pressed =
      (await yes.getAttribute("aria-pressed")) === "true"
        ? yes
        : (await no.getAttribute("aria-pressed")) === "true"
          ? no
          : yes;
    const here = page.url();
    await pressed.click();
    await page.waitForURL((url) => url.href !== here, { timeout: 15000 });
  }
  throw new Error("gates did not finish within 14 steps — is a gate not advancing?");
}
