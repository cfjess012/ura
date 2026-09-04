/**
 * G-83 — assess the platform once, inherit it everywhere.
 *
 * Ten of the fifteen control questions a requester faced were about the
 * enterprise estate: is multi-factor authentication enforced, is privileged
 * access separated. Nobody's project decides those, so people guessed or
 * stopped. These drive the way out of that, in the browser, on rendered DOM
 * only (NFR-7).
 */
import { expect, test } from "@playwright/test";
import {
  answerRemainingGates,
  scenarioIntake,
  startAssessment,
} from "./helpers";

/** Reach the controls screen with severity answered high enough to owe some. */
async function toControls(page: import("@playwright/test").Page, base: string) {
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page
    .getByRole("checkbox", { name: /Logical access to enterprise environments/ })
    .check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();
  await page
    .getByRole("navigation", { name: "Severity areas" })
    .getByRole("link", { name: /Third-Party/ })
    .click();
  await page
    .locator(".q2", { hasText: "Level of Provider Access" })
    .getByRole("radio", { name: /High/ })
    .click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
  await page.goto(`/projects/${projectId(page)}/assess/objectives`);
}

/** The id is in the URL the assessment is being answered at. */
function projectId(page: import("@playwright/test").Page): string {
  return new URL(page.url()).pathname.split("/")[2]!;
}

test("choosing a platform answers its controls, naming who attested (G-83)", async ({
  page,
}) => {
  const base = await startAssessment(page, `Platforms ${Date.now()}`);
  await toControls(page, base);

  const panel = page.locator(".platform-panel");
  await expect(
    panel.getByRole("heading", { name: /What does this activity run on/ }),
  ).toBeVisible();
  // Nothing is inherited until somebody says where the activity runs.
  await expect(panel.locator(".platform-status")).toContainText(
    "Nothing chosen yet",
  );
  await expect(panel.locator(".covered-list li")).toHaveCount(0);
  const question = page.locator(".q3", { hasText: "Privileged Access Management" });
  await expect(question).toBeVisible();

  await panel
    .locator(".platform", { hasText: "Microsoft Entra ID" })
    .getByRole("checkbox")
    .check();
  await expect(panel.locator(".platform-status")).toContainText(
    "Running on Microsoft Entra ID",
  );

  // Coverage arrives with its provenance, and never as a bare Yes: an answer
  // that appeared from nowhere is indistinguishable from one invented.
  const covered = panel.locator(".covered-list li", {
    hasText: "Privileged Access Management",
  });
  await expect(covered).toBeVisible();
  await expect(covered).toContainText("Microsoft Entra ID");
  await expect(covered).toContainText(/attested on \d{4}-\d{2}-\d{2}/);
  await expect(covered).toContainText("Offered");
  // Still only an offer: the question stays until a person accepts it, or
  // the control would be neither asked nor answered.
  await expect(question).toBeVisible();

  await panel.getByRole("button", { name: /this activity sits on those/ }).click();
  await expect(panel.locator(".platform-status")).toContainText("recorded");
  // Now it has left the questions the person has to answer.
  await expect(question).toHaveCount(0);
  await expect(panel).toContainText("Recorded against this assessment");
  // And no internal identifier reached the screen on the way (NFR-9).
  await expect(panel).not.toContainText(/T[0-9]-[A-Z]{2,5}-[0-9]/);
  await expect(panel).not.toContainText(/PL_[A-Z]/);
});

test("a lapsed attestation covers nothing, and says so (G-83)", async ({
  page,
}) => {
  const base = await startAssessment(page, `Lapsed ${Date.now()}`);
  await toControls(page, base);
  const panel = page.locator(".platform-panel");

  // Okta's attestation ran out in August. Inheritance that outlives its
  // evidence is exactly how a control failure gets laundered.
  const okta = panel.locator(".platform", { hasText: "Okta" });
  await expect(okta).toContainText("Attestation lapsed");
  await okta.getByRole("checkbox").check();

  await expect(panel.locator(".platform-note-lapsed")).toContainText(
    "cover nothing",
  );
  await expect(panel.locator(".platform-note-lapsed")).toContainText(
    /lapsed on \d{4}-\d{2}-\d{2}/,
  );
  await expect(panel.locator(".covered-list li")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: /sits on those platforms/ }),
  ).toHaveCount(0);
});

test("a platform not cleared for this activity's data is named (G-83)", async ({
  page,
}) => {
  const base = await startAssessment(page, `Clearance ${Date.now()}`);
  // scenarioIntake sets Confidential data; GitHub Copilot is cleared to
  // Internal, so the gap is arithmetic rather than judgement.
  await toControls(page, base);
  const panel = page.locator(".platform-panel");

  await panel
    .locator(".platform", { hasText: "GitHub Copilot" })
    .getByRole("checkbox")
    .check();
  const warning = panel.locator(".platform-note-mismatch");
  await expect(warning).toContainText("cleared up to Internal");
  await expect(warning).toContainText("Confidential");
  // Named, never blocked — the reviewer decides, not the form.
  await expect(warning).toContainText("Nothing is blocked");
});

test("the search narrows the list without reordering it (G-83)", async ({
  page,
}) => {
  const base = await startAssessment(page, `Search ${Date.now()}`);
  await toControls(page, base);
  const panel = page.locator(".platform-panel");
  const all = await panel.locator(".platform").count();
  expect(all).toBeGreaterThan(5);

  await panel.getByRole("searchbox", { name: /Find a platform/ }).fill("snow");
  await expect(panel.locator(".platform")).toHaveCount(1);
  await expect(panel.locator(".platform")).toContainText("Snowflake");

  await panel.getByRole("searchbox", { name: /Find a platform/ }).fill("zzzz");
  await expect(panel.locator(".platform")).toHaveCount(0);
  await expect(panel.locator(".platform-none")).toContainText("Clear the box");
});
