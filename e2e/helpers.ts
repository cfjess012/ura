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
  await page
    .getByLabel("Business Purpose or Objective")
    .fill("Shorten scheduling effort.");
  await page
    .getByLabel("Activity / Use-Case Description")
    .fill("Scheduling tool for shifts.");
  await page
    .getByLabel("Does this use AI or machine learning?")
    .selectOption("No");
  await page.getByRole("button", { name: /Next: Ownership/ }).click();

  await expect(page.getByRole("heading", { name: "Ownership" })).toBeVisible();
  await page.getByLabel("Business Owner").selectOption("d.chen");
  await page
    .getByLabel("Is this a new initiative, or an update to an existing one?")
    .selectOption("Brand new");
  await page.getByRole("button", { name: /Next: Categorization/ }).click();

  await expect(
    page.getByRole("heading", { name: "Categorization" }),
  ).toBeVisible();
  await page.getByLabel("Responsible Business Unit").selectOption("BU_OPS");
  await page
    .getByLabel("Does anything about this involve a company outside ours?")
    .selectOption("No");
  await page.getByRole("button", { name: /Next: Compliance & Data/ }).click();

  await expect(
    page.getByRole("heading", { name: "Compliance & Data" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Internal/ }).check();
  await page
    .getByRole("button", { name: /Continue to the risk areas/ })
    .click();
  await expect(page).toHaveURL(/\/assess\//);
}

/** Start an assessment and return its base path. */
export async function startAssessment(
  page: Page,
  name: string,
): Promise<string> {
  await page.goto("/projects");
  await page.getByLabel("Start a new assessment").fill(name);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(
    page.getByRole("heading", { name: "Description" }),
  ).toBeVisible();
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
export async function answerRemainingGates(
  page: Page,
  base: string,
): Promise<void> {
  // Each step starts from the paths screen, which redirects to the first
  // gate still unanswered. That makes every step independent: no state is
  // carried between iterations, so nothing can race the redirect. Reading
  // the URL mid-redirect and clicking the outgoing document was exactly the
  // flake this replaces.
  for (let step = 0; step < 14; step++) {
    await page.goto(`${base}/assess/paths`);
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/assess/paths")) {
      await expect(
        page.getByRole("heading", { name: "Narrow it down" }),
      ).toBeVisible();
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
    // A Yes on a risk area that asks nothing further deliberately STAYS, so
    // the person can read why the product stops there (FR-35, verifier F10).
    // This helper used to assume every answer navigates; that was the old
    // behaviour, not the intent. Either outcome is correct — what must
    // happen is that the answer is recorded and the loop can move on.
    const stops = page.getByText("Nothing further here");
    await Promise.race([
      page.waitForURL((url) => url.href !== here, { timeout: 15000 }),
      stops.waitFor({ state: "visible", timeout: 15000 }),
    ]);
    if (page.url() === here) {
      // Recorded and explained; the next iteration's redirect moves us on.
      await expect(stops).toBeVisible();
    }
  }
  throw new Error(
    "gates did not finish within 14 steps — is a gate not advancing?",
  );
}

/**
 * Switching is a deliberate act through the front door (owner's call), so
 * every journey that changes persona does it the way a person does.
 *
 * Lifted here from personas.spec.ts because the hand-off journeys need it
 * too, and two copies of "how you become someone else" is exactly the
 * parallel implementation §11 forbids.
 */
export async function becomePerson(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForURL(/\/projects/);
}

/**
 * Intake for an assessment that genuinely reaches Tier 2: AI, an outside
 * company, confidential data — so the third-party and AI areas open and
 * their severity questions exist to be answered or handed over.
 *
 * `completeIntake` deliberately answers No to third parties, which closes
 * that whole area; a journey that needs the severity questions cannot use
 * it. Shared here because the severity and hand-off suites both need this
 * exact scenario, and two copies would drift (§11).
 */
export async function scenarioIntake(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/intake/description`);
  await page
    .getByLabel("Business Purpose or Objective")
    .fill("Cut rostering effort.");
  await page
    .getByLabel("Activity / Use-Case Description")
    .fill("AI drafts weekly shift rosters.");
  await page
    .getByLabel("Does this use AI or machine learning?")
    .selectOption("Yes");
  await page
    .getByLabel("What does the AI do?")
    .fill("Proposes shifts a supervisor approves.");
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
  await expect(page).toHaveURL(/\/assess\//);
}

/**
 * Plant a drafted answer directly, the way the agent would have written
 * one.
 *
 * The accept path is the one place a model's proposal becomes a person's
 * record, and it had no test at all — because testing it appeared to need
 * a running model. It does not: what matters is what happens to a drafted
 * ROW, and a row can be written without one.
 */
export async function plantDraft(input: {
  projectId: string;
  questionId: string;
  value: string;
  quote?: string;
}): Promise<void> {
  const postgres = (await import("postgres")).default;
  // The suite's own database, not the development one — the web server
  // under test is started with E2E_DATABASE_URL (playwright.config.ts).
  const sql = postgres(
    process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL!,
    { max: 1 },
  );
  try {
    const [version] = await sql<{ id: string }[]>`
      select id from instrument_versions
      where slug = 'tier1-gates' and activated_at is not null limit 1`;
    await sql`
      insert into answers
        (project_id, question_id, value, source, confirmed,
         instrument_version_id, basis, source_quote, source_ref)
      values
        (${input.projectId}, ${input.questionId}, ${JSON.stringify(input.value)},
         'drafted', false, ${version!.id}, 'stated',
         ${input.quote ?? "The supplier operates the service on our behalf."},
         'vendor-overview.md')`;
  } finally {
    await sql.end();
  }
}
