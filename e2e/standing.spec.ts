/**
 * The requester's list says where each assessment stands (§24.3, §24.9).
 *
 * It exists because that list carried no state at all: nine drafts, nine
 * rows reading "edited today", nothing saying which was one field from done
 * and which was empty. Rendered-DOM assertions only (NFR-7).
 */
import { expect, test } from "@playwright/test";
import { completeIntake, startAssessment } from "./helpers";

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
