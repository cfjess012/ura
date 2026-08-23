/**
 * S4.7 · Hand-offs (FR-36) — the journey, end to end, in a browser.
 *
 * This file exists because the independent verifier found the feature had
 * NO end-to-end coverage at all: every claim about it rested on unit tests
 * and a driven session nobody had recorded (G-56). Three of its defects —
 * the obligation that did not derive, the cross-project write, the silent
 * transport failure — were invisible to 23 green specs.
 *
 * Each test walks the product the way a person does: flag as the requester,
 * pick it up as the assessor, and prove the obligation behaves like a
 * derivation rather than a message.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  answerRemainingGates,
  becomePerson,
  scenarioIntake,
  startAssessment,
} from "./helpers";

/**
 * An assessment walked as far as the severity questions, ready to flag.
 *
 * Returns its NAME as well as its path: the E2E database is not reset
 * between tests, so the bell legitimately shows every obligation raised by
 * every earlier journey. A test must pick out its own row by the assessment
 * it created, exactly as a person would read the row's second line.
 */
async function assessmentAtSeverity(page: Page, name: string): Promise<string> {
  const base = await startAssessment(page, name);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page.getByRole("checkbox", { name: /Logical access to enterprise environments/ }).check();
  await page.getByRole("button", { name: /Next: how severe/ }).click();
  await page
    .getByRole("navigation", { name: "Severity areas" })
    .getByRole("link", { name: /Third-Party/ })
    .click();
  return base;
}

/** Flag the provider-access question and hand it to a risk domain. */
async function handOver(page: Page, domain: RegExp, note: string) {
  const question = page.locator(".q2", { hasText: "Level of Provider Access" });
  await question.getByRole("button", { name: /leave this to us/i }).click();
  await question.getByRole("combobox").selectOption({ label: (await domainLabel(page, domain)) });
  await question.getByRole("textbox").fill(note);
  await question.getByRole("button", { name: /Hand it over/ }).click();
  await expect(question.getByText(/WITH .*·/i)).toBeVisible();
}

/** This test's own obligation row, by the assessment it names. */
function obligationFor(page: Page, assessment: string) {
  return page.locator("button.bell-row-obligation", { hasText: assessment });
}

async function domainLabel(page: Page, domain: RegExp): Promise<string> {
  const options = await page.locator("option").allInnerTexts();
  const found = options.find((o) => domain.test(o));
  expect(found, `no recipient matching ${domain}`).toBeTruthy();
  return found!;
}

test("a requester hands a question over and carries on (FR-36)", async ({ page }) => {
  await becomePerson(page, "Priya Sharma");
  const name = `Handoff ${Date.now()}`;
  await assessmentAtSeverity(page, name);

  const question = page.locator(".q2", { hasText: "Level of Provider Access" });
  await expect(question.getByRole("button", { name: /leave this to us/i })).toBeVisible();
  await handOver(page, /Third-Party/, "I don't know what access they get.");

  // The rest of the assessment is still answerable — flagging blocks nothing.
  const other = page.locator(".q2", { hasText: "Access Persistence" });
  await expect(other.getByRole("radio", { name: /Low/ })).toBeEnabled();
});

test("the obligation reaches the domain's assessor, and cannot be dismissed", async ({ page }) => {
  await becomePerson(page, "Priya Sharma");
  const name = `Obligation ${Date.now()}`;
  await assessmentAtSeverity(page, name);
  await handOver(page, /Third-Party/, "Need someone who knows their access model.");

  // Samuel owns Third-Party; the bell states the count in words, not colour.
  await becomePerson(page, "Samuel Okonkwo");
  const bell = page.getByRole("button", { name: /^Alerts/ });
  await expect(bell).toHaveAttribute("aria-label", /[1-9]\d* needing action/);
  await bell.click();
  await expect(page.getByText(/clear themselves when the work is done/i)).toBeVisible();
  // There is nothing to clear, so no control offers to.
  const needsYou = page.locator(".alerts-obligations");
  await expect(needsYou.getByRole("button", { name: /clear/i })).toHaveCount(0);
});

test("an assessor for another domain is not shown it (scoped, not global)", async ({ page }) => {
  await becomePerson(page, "Priya Sharma");
  const name = `Scope ${Date.now()}`;
  await assessmentAtSeverity(page, name);
  await handOver(page, /Third-Party/, "Third-party access question.");

  // The prior platform showed every reviewer every other team's counts.
  await becomePerson(page, "Stella Blau"); // Privacy Office
  await expect(page.getByRole("button", { name: /^Alerts/ })).toHaveAttribute(
    "aria-label",
    /nothing waiting/i,
  );
});

test("the alert lands ON the question, and the thread reads in order", async ({ page }) => {
  await becomePerson(page, "Priya Sharma");
  const name = `Thread ${Date.now()}`;
  await assessmentAtSeverity(page, name);
  await handOver(page, /Third-Party/, "What level of access do they actually get?");

  await becomePerson(page, "Samuel Okonkwo");
  await page.getByRole("button", { name: /^Alerts/ }).click();
  await obligationFor(page, name).click();

  // Not the project, not the section — the question itself.
  await expect(page).toHaveURL(/focus=/);
  const question = page.locator(".q2", { hasText: "Level of Provider Access" });
  await expect(question).toBeVisible();
  await expect(question.getByText("What level of access do they actually get?")).toBeVisible();

  await question.getByRole("textbox").fill("Admin access to production, per their contract.");
  await question.getByRole("button", { name: "Post this reply" }).click();
  await expect(question.getByText("Admin access to production, per their contract.")).toBeVisible();
  // Attributed, with a role, so a reader knows who is speaking.
  await expect(question.getByText("Samuel Okonkwo").first()).toBeVisible();
});

test("resolving is refused while the question has no answer", async ({ page }) => {
  await becomePerson(page, "Priya Sharma");
  const name = `Refuse ${Date.now()}`;
  await assessmentAtSeverity(page, name);
  await handOver(page, /Third-Party/, "Cannot answer this one.");

  await becomePerson(page, "Samuel Okonkwo");
  await page.getByRole("button", { name: /^Alerts/ }).click();
  await obligationFor(page, name).click();
  const question = page.locator(".q2", { hasText: "Level of Provider Access" });
  await question.getByRole("button", { name: /Mark resolved/ }).click();
  await expect(
    question.getByText("The question still has no answer. Answer it, and then this closes."),
  ).toBeVisible();
});

test("answering the question clears the obligation by itself (FR-36, the derived class)", async ({
  page,
}) => {
  await becomePerson(page, "Priya Sharma");
  const name = `Derived ${Date.now()}`;
  await assessmentAtSeverity(page, name);
  await handOver(page, /Third-Party/, "Please settle this one.");

  await becomePerson(page, "Samuel Okonkwo");
  const bell = page.getByRole("button", { name: /^Alerts/ });
  await expect(bell).toHaveAttribute("aria-label", /[1-9]\d* needing action/);

  await bell.click();
  await obligationFor(page, name).click();
  const question = page.locator(".q2", { hasText: "Level of Provider Access" });
  // Doing the work — nothing is clicked on the alert itself.
  await question.getByRole("radio", { name: /High/ }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  // The obligation was never a message, so there is nothing to clean up:
  // this row is simply not there any more. Asserted against THIS
  // assessment, because the shared E2E database still holds every earlier
  // journey's open work — which is itself the point: nothing was cleared,
  // and nothing else moved.
  await page.goto("/projects");
  await page.getByRole("button", { name: /^Alerts/ }).click();
  await expect(obligationFor(page, name)).toHaveCount(0);
});
