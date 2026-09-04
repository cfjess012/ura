/**
 * The requester's list says where each assessment stands (§24.3, §24.9).
 *
 * It exists because that list carried no state at all: nine drafts, nine
 * rows reading "edited today", nothing saying which was one field from done
 * and which was empty. Rendered-DOM assertions only (NFR-7).
 */
import { expect, test } from "@playwright/test";
import {
  answerRemainingGates,
  completeIntake,
  scenarioIntake,
  startAssessment,
} from "./helpers";

test("a fresh draft says which step it is on and which section owes answers", async ({
  page,
}) => {
  const name = `Standing intake ${Date.now()}`;
  await startAssessment(page, name);
  await page.goto("/projects");

  const row = page.locator(".queue-row", { hasText: name });
  await expect(row).toBeVisible();
  // The step, in the same four words the project header uses.
  await expect(row).toContainText("Step 1 of 4 · Tell us about it");
  // Named, not counted: a total alone hides which screen to open.
  await expect(row).toContainText(/answers? needed/);
  await expect(row).toContainText("Description");
  // And it is filed under the group that says whose move it is.
  await expect(
    page.locator(".queue-group", { hasText: name }).locator(".queue-title"),
  ).toContainText("Needs you");
});

test("finishing intake moves the row to the risk areas, with no fraction", async ({
  page,
}) => {
  const name = `Standing assess ${Date.now()}`;
  const base = await startAssessment(page, name);
  await completeIntake(page, base);
  await page.goto("/projects");

  const row = page.locator(".queue-row", { hasText: name });
  await expect(row).toContainText("Step 2 of 4 · Assess");
  await expect(row).toContainText(/risk areas? still to answer/);
  // Answering a gate Yes OPENS questions, so a meter here would fall as a
  // person works — a claim the numbers do not support.
  await expect(row.locator(".meter")).toHaveCount(0);
});

test("a submitted assessment leaves the requester's own group", async ({
  page,
}) => {
  const name = `Standing sent ${Date.now()}`;
  const base = await startAssessment(page, name);
  await completeIntake(page, base);
  await page.goto(`${base}/submit`);
  // The gaps this intake leaves are acknowledged, then declared — the same
  // two ticks a person gives, in the same order.
  const gaps = page.locator(".gaps .confirm input");
  if (await gaps.count()) await gaps.check();
  await page.locator(".declare .confirm input").check();
  await page.getByRole("button", { name: /Declare and submit/ }).click();
  await expect(
    page.getByRole("heading", { name: "With a reviewer" }),
  ).toBeVisible();

  await page.goto("/projects");
  const group = page.locator(".queue-group", { hasText: name });
  await expect(group.locator(".queue-title")).toContainText("With a reviewer");
  // It is read-only to them now, so it must never read as theirs to move.
  await expect(group.locator(".queue-title")).not.toContainText("Needs you");
  await expect(
    page.locator(".queue-row", { hasText: name }),
  ).toContainText("Step 3 of 4 · Review & attest");
});

test("the standing page is one screen with one thing to do (G-91)", async ({
  page,
}) => {
  // It was 1,067 words, 45 bullets and three scrolls at the moment a person
  // wants to finish — an owner recorded themselves scrolling it.
  const base = await startAssessment(page, `Standing ${Date.now()}`);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page.goto(`${base}/assess/complete`);

  await expect(page.locator(".standing-row")).toHaveCount(4);
  // Exactly one thing carries a button's weight (§24.2).
  await expect(page.locator(".btn-lead")).toHaveCount(1);
  const next = await page.locator(".btn-lead").innerText();
  expect(next).toMatch(/^(Answer|Narrow down|Read them)/);

  // Nothing was deleted — it moved behind disclosure, closed on arrival.
  const blocks = page.locator(".standing-detail-block");
  expect(await blocks.count()).toBeGreaterThan(1);
  await expect(page.locator(".standing-detail-block[open]")).toHaveCount(0);
  const shut = await page.evaluate(() => document.body.scrollHeight);

  await blocks.first().locator("summary").click();
  await expect(page.locator(".standing-detail-block[open]")).toHaveCount(1);
  expect(await page.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(shut);

  // And no internal identifier reached the screen (NFR-9).
  await expect(page.locator("main")).not.toContainText(/T[0-9]-[A-Z]{2,5}-[0-9]/);
});

test("the standing and the rail never state the same count two ways", async ({
  page,
}) => {
  // "5 answered" in the rail meant five areas; "19 rated" on the page meant
  // nineteen questions. Side by side they read as a contradiction.
  const base = await startAssessment(page, `Units ${Date.now()}`);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page.goto(`${base}/assess/complete`);

  const severity = page.locator(".standing-row", { hasText: "How severe" });
  const detail = await severity.innerText();
  if (!/Nothing here needs rating/.test(detail)) {
    expect(detail).toMatch(/question/);
  }
  await expect(page.locator(".rail")).toContainText(/areas? rated|after this/);
});

test("the rail and the page share one denominator for the risk areas", async ({
  page,
}) => {
  // The rail counted the ten areas a person is ASKED; the page counted all
  // eleven that exist. "10 answered" beside "8 of 11 apply" is two true
  // numbers with no unit between them (G-91).
  const base = await startAssessment(page, `Denominator ${Date.now()}`);
  await scenarioIntake(page, base);
  await answerRemainingGates(page, base);
  await page.goto(`${base}/assess/complete`);

  const railAreas = await page
    .locator(".rail")
    .innerText()
    .then((t) => t.match(/(\d+) areas decided|all (\d+) areas decided/));
  expect(railAreas, "the rail must name its unit").not.toBeNull();
  const railTotal = Number(railAreas![1] ?? railAreas![2]);

  const row = await page
    .locator(".standing-row", { hasText: "Risk areas" })
    .innerText();
  const pageTotal = Number(row.match(/of (\d+) apply/)![1]);
  expect(railTotal).toBe(pageTotal);
});
