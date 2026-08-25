/**
 * S8 · Review, attest, and settle (FR-16, FR-17, FR-18, NFR-10).
 *
 * Authority is the point of this slice, so most of what is checked here is
 * a refusal: the wrong assessor, the wrong moment, the person accepting
 * their own risk. A screen that merely hides those would pass a happy-path
 * test and fail the requirement.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  answerRemainingGates,
  becomePerson,
  scenarioIntake,
  startAssessment,
} from "./helpers";

/** An assessment submitted with one control answered No — one open finding. */
async function submitted(page: Page, name: string): Promise<string> {
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
  const card = page.locator(".q3").first();
  await card
    .locator("> .q3-answers")
    .getByRole("radio", { name: "No" })
    .click();
  await card
    .locator("> .q3-note textarea")
    .fill("No recertification process exists today.");
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  await page.goto(`${base}/submit`);
  await page.locator(".gaps .confirm input").check();
  await page.locator(".declare .confirm input").check();
  await page.getByRole("button", { name: /Declare and submit/ }).click();
  await expect(
    page.getByRole("heading", { name: "With a reviewer" }),
  ).toBeVisible();
  return base;
}

test("a draft cannot be attested — there is nothing settled to sign", async ({
  page,
}) => {
  const base = await startAssessment(page, `Unsubmitted ${Date.now()}`);
  await scenarioIntake(page, base);
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);
  await expect(page.getByText(/nothing to review/i)).toBeVisible();
});

test("an assessor signs only their own risk area, and the refusal says so (FR-17)", async ({
  page,
}) => {
  const base = await submitted(page, `Authority ${Date.now()}`);

  // Privacy does not own identity and access management.
  await becomePerson(page, "Stella Blau");
  await page.goto(`${base}/review`);
  await expect(
    page.getByRole("heading", { name: /Another area/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Approve and continue/ }),
  ).toHaveCount(0);

  // Security does.
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);
  await expect(
    page.getByRole("button", { name: /^Approve and continue/ }),
  ).toBeVisible();
});

test("signing drains the queue, and the signature is named on the item (FR-16)", async ({
  page,
}) => {
  const base = await submitted(page, `Signing ${Date.now()}`);
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);
  const before = (await page.locator(".nextline").textContent()) ?? "";
  // Approving is a deliberate act: the tick and the sentence are the act,
  // and the button stays disabled until both are there. A signature with
  // nothing beside it records that somebody clicked, not what they decided.
  await page.getByRole("checkbox", { name: /I attest this answer/ }).check();
  await page
    .getByLabel(/why are you approving it/i)
    .fill("Checked against the vendor's SOC 2 and the answer holds.");
  await page.getByRole("button", { name: /^Approve and continue/ }).click();
  await expect(page.locator(".nextline")).not.toHaveText(before);

  // Attestation is insert-only: the signed item reads as signed, by name.
  await page.goto(`${base}/review`);
  await page.keyboard.press("j");
  await expect(page.getByText(/Diego Marquez/).first()).toBeVisible();
});

test("the keyboard loop moves and signs without a mouse (NFR-10)", async ({
  page,
}) => {
  const base = await submitted(page, `Keyboard ${Date.now()}`);
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);

  const rail = page.locator(".review-item");
  await expect(rail).toHaveCount(4);
  // textContent, not innerText: the heading is uppercased by CSS, and
  // toHaveText compares the text as written.
  const first = (await page.locator(".q3-name").textContent()) ?? "";
  // Clicking the queue is also what proves the island is listening — a
  // keystroke sent before hydration goes nowhere, which is a property of
  // the test, not of the loop.
  await rail.nth(1).click();
  const second = (await page.locator(".q3-name").textContent()) ?? "";
  expect(second).not.toBe(first);

  await page.keyboard.press("k");
  await expect(page.locator(".q3-name")).toHaveText(first);
  await page.keyboard.press("j");
  await expect(page.locator(".q3-name")).toHaveText(second);

  // a / c / n choose the act without reaching for the mouse.
  await page.keyboard.press("n");
  await expect(
    page.getByRole("radio", { name: "Not applicable" }),
  ).toHaveAttribute("aria-checked", "true");

  // And it must never steal a keystroke from someone typing a reason.
  await page.locator("#attest-note").fill("j k a n");
  await expect(page.locator("#attest-note")).toHaveValue("j k a n");
  await expect(page.locator(".q3-name")).toHaveText(second);
});

test("a finding is settled one of exactly four ways, with what each commits to (FR-18)", async ({
  page,
}) => {
  const base = await submitted(page, `Settle ${Date.now()}`);
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);
  await page.getByRole("button", { name: /Settle this finding/ }).click();

  const kinds = page.locator(".settle-kind");
  await expect(kinds).toHaveCount(4);
  await expect(kinds.first()).toContainText("corrected");
  // Each says what it commits to before it is chosen, not after.
  await expect(page.locator(".settle-kind-meaning").nth(2)).toContainText(
    /name and a date/,
  );
});

test("remediation without an owner or a date is refused on screen", async ({
  page,
}) => {
  const base = await submitted(page, `Remediation ${Date.now()}`);
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);
  await page.getByRole("button", { name: /Settle this finding/ }).click();
  await page.getByRole("radio", { name: /Somebody is fixing it/ }).click();
  await page
    .locator("textarea[id^=note-]")
    .fill("Recertification is on the roadmap.");
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.locator(".field-error")).toContainText(/owner/i);
  // Refused means nothing was written: the finding is still settleable.
  await expect(page.getByRole("button", { name: "Record it" })).toBeVisible();

  // The owner is chosen from the directory now, not typed (FR-29).
  await page.locator("select[id^=owner-]").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.locator(".field-error")).toContainText(/date/i);
});

test("a person cannot accept their own risk — four-eyes (FR-18)", async ({
  page,
}) => {
  const base = await submitted(page, `Four eyes ${Date.now()}`);
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);
  await page.getByRole("button", { name: /Settle this finding/ }).click();
  await page.getByRole("radio", { name: /risk is accepted/i }).click();

  // The chooser does not offer the person signed in.
  const options = await page
    .locator("select[id^=accepted-] option")
    .allInnerTexts();
  expect(options.some((option) => option.includes("Diego Marquez"))).toBe(
    false,
  );
  // And the rule is stated where the choice is made, not in a manual.
  await expect(page.getByText(/cannot be you/i)).toBeVisible();

  // An acceptance with no expiry is not an acceptance.
  await page.locator("select[id^=accepted-]").selectOption({ index: 1 });
  await page
    .locator("textarea[id^=note-]")
    .fill("Segmentation limits the blast radius.");
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.locator(".field-error")).toContainText(/expires/i);
});

test("a settled finding reads as settled, by whom and until when", async ({
  page,
}) => {
  const base = await submitted(page, `Settled ${Date.now()}`);
  await becomePerson(page, "Diego Marquez");
  await page.goto(`${base}/review`);
  await page.getByRole("button", { name: /Settle this finding/ }).click();
  await page.getByRole("radio", { name: /risk is accepted/i }).click();
  await page.locator("select[id^=accepted-]").selectOption({ index: 1 });
  await page
    .locator("textarea[id^=note-]")
    .fill("Segmentation limits the blast radius.");
  await page.locator("input[id^=expires-]").fill("2027-06-30");
  await page.getByRole("button", { name: "Record it" }).click();

  // The day the person picked, in the format the rest of the card uses.
  const until = new Date("2027-06-30T00:00:00Z").toLocaleDateString(undefined, {
    timeZone: "UTC",
  });
  await expect(page.locator(".summary-list")).toContainText(
    new RegExp(`Accepted by .+ until ${until.replace(/\//g, "\\/")}`),
  );
  // Settled means settled: it is no longer offering to be settled again.
  await expect(
    page.getByRole("button", { name: /Settle this finding/ }),
  ).toHaveCount(0);
});
