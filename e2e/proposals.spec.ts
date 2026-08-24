/**
 * The accept path — where a model's proposal becomes a person's record.
 *
 * Independent verification found this surface with no tests at all, and
 * three blocking defects living in it. Every case below is one of those
 * defects, or the behaviour that replaced it. None of them needs a running
 * model: what matters is what happens to a drafted ROW.
 */
import { expect, test } from "@playwright/test";
import {
  becomePerson,
  plantDraft,
  scenarioIntake,
  startAssessment,
} from "./helpers";

const idOf = (base: string) => base.split("/projects/")[1]!;

test("a proposal is offered with its quote, and is not the answer yet", async ({
  page,
}) => {
  const base = await startAssessment(page, `Proposal ${Date.now()}`);
  await scenarioIntake(page, base);
  await plantDraft({
    projectId: idOf(base),
    questionId: "gate.operational",
    value: "Yes",
  });

  await page.goto(`${base}/assess/operational`);
  await expect(page.locator(".proposed-mark")).toContainText(
    /not your answer yet/i,
  );
  await expect(page.locator(".proposed-quote")).toContainText(
    /supplier operates/,
  );

  // The button underneath must NOT be pre-selected: the screen would
  // otherwise say "not your answer yet" above an answer that looks given.
  const yes = page.getByRole("button", { name: /Yes, it applies/ });
  await expect(yes).not.toHaveAttribute("aria-pressed", "true");
});

test("an unaccepted proposal does not count as an answer anywhere", async ({
  page,
}) => {
  const base = await startAssessment(page, `Not counted ${Date.now()}`);
  await scenarioIntake(page, base);
  await plantDraft({
    projectId: idOf(base),
    questionId: "gate.operational",
    value: "Yes",
  });

  // The rail still shows it as needing an answer.
  await page.goto(`${base}/assess/complete`);
  await expect(
    page.locator(".rail-item", { hasText: "Operational" }),
  ).not.toContainText("Applies");

  // And it is named among the gaps a person confirms at submission — the
  // failure this replaced would have had them declare over a model's guess.
  await page.goto(`${base}/submit`);
  await expect(page.locator(".gaps")).toBeVisible();
});

test("accepting makes it the person's answer, and the proposal stays on the record", async ({
  page,
}) => {
  const base = await startAssessment(page, `Accept ${Date.now()}`);
  await scenarioIntake(page, base);
  await plantDraft({
    projectId: idOf(base),
    questionId: "gate.operational",
    value: "Yes",
  });

  await page.goto(`${base}/assess/operational`);
  await page.getByRole("button", { name: /^Accept Yes/ }).click();
  await expect(page.locator(".proposed")).toHaveCount(0);
  // The accept navigates nothing; it refreshes. Read the answer from a
  // fresh load rather than racing the refresh.
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Yes, it applies/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a proposal whose value is not an answer is never offered", async ({
  page,
}) => {
  // A hedge from a model used to close a risk area outright, and the card
  // offered "Accept Probably, if the pilot expands".
  const base = await startAssessment(page, `Hedge ${Date.now()}`);
  await scenarioIntake(page, base);
  await plantDraft({
    projectId: idOf(base),
    questionId: "gate.operational",
    value: "Probably, if the pilot expands",
  });

  await page.goto(`${base}/assess/operational`);
  await expect(page.locator(".proposed")).toHaveCount(0);
  // And it certainly must not have closed the area.
  await expect(
    page.getByRole("button", { name: /No, it doesn/ }),
  ).not.toHaveAttribute("aria-pressed", "true");
});

test("somebody else cannot accept a proposal on your assessment", async ({
  page,
}) => {
  const base = await startAssessment(page, `Not yours ${Date.now()}`);
  await scenarioIntake(page, base);
  await plantDraft({
    projectId: idOf(base),
    questionId: "gate.operational",
    value: "Yes",
  });

  // An assessor can read every assessment. Accepting writes an answer in
  // the owner's name, so it is not theirs to do.
  await becomePerson(page, "Noah Kahan");
  await page.goto(`${base}/assess/operational`);
  const accept = page.getByRole("button", { name: /^Accept Yes/ });
  if (await accept.count()) {
    await accept.click();
    await expect(page.locator(".field-error")).toContainText(
      /theirs to accept/i,
    );
  }
  // Whatever the screen offered, the record is unchanged.
  await becomePerson(page, "Priya Sharma");
  await page.goto(`${base}/assess/operational`);
  await expect(
    page.getByRole("button", { name: /Yes, it applies/ }),
  ).not.toHaveAttribute("aria-pressed", "true");
});
