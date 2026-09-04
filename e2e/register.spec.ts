/**
 * G-87 — the control register, driven as a person meets it.
 *
 * The screen showed the same assessment's controls three unrelated ways, so
 * nobody could see the whole set. These drive the one table that replaced
 * them, and the two states it made visible: a gap, and an inherited answer.
 */
import { expect, test } from "@playwright/test";
import {
  answerRemainingGates,
  openControl,
  scenarioIntake,
  startAssessment,
} from "./helpers";

async function atRegister(page: import("@playwright/test").Page, base: string) {
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
  await page.goto(`${base}/assess/objectives`);
}

test("every required control is on one list, grouped and named (G-87)", async ({
  page,
}) => {
  const base = await startAssessment(page, `Register ${Date.now()}`);
  await atRegister(page, base);

  const rows = page.locator(".register-row");
  expect(await rows.count()).toBeGreaterThan(3);
  // Families are named, never coded — no acronym battery reaches the screen.
  const families = await page.locator(".register-family").allInnerTexts();
  expect(families.length).toBeGreaterThan(1);
  for (const family of families) expect(family).not.toMatch(/\b(IAM|SDLC|TPR|NB)\b/);
  await expect(page.locator(".register")).not.toContainText(/T[0-9]-[A-Z]{2,5}-[0-9]/);

  // The count at the bottom is what is left for this person, not a total
  // including work nobody here can do (§24.9).
  await expect(page.locator(".savebar .missing")).toContainText(
    /\d+ controls — /,
  );
});

test("the drawer opens beside the list and the list does not move", async ({
  page,
}) => {
  const base = await startAssessment(page, `Drawer ${Date.now()}`);
  await atRegister(page, base);

  await expect(page.locator(".drawer-empty")).toContainText(
    "Pick a control to answer it",
  );
  const names = await page.locator(".register-name").allInnerTexts();

  const card = await openControl(page, 0);
  await expect(card.locator("> .q3-answers")).toBeVisible();
  await expect(page.locator('.register-row[data-open="true"]')).toHaveCount(1);

  // Answering must not reorder the list under the cursor.
  await card.locator("> .q3-answers").getByRole("radio", { name: "Yes" }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
  expect(await page.locator(".register-name").allInnerTexts()).toEqual(names);
});

test("a Partial or a No reads as a gap the moment it is given", async ({
  page,
}) => {
  const base = await startAssessment(page, `Gap ${Date.now()}`);
  await atRegister(page, base);

  const card = await openControl(page, 0);
  await card.locator("> .q3-answers").getByRole("radio", { name: "No" }).click();
  await card.locator("> .q3-note textarea").fill("Nothing in place today.");
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  // Previously this read identically to a Yes until submission.
  await expect(
    page.locator('.register-row[data-state="gap"]'),
  ).toHaveCount(1);
  await expect(page.locator('.register-row[data-state="gap"]')).toContainText("Gap");
});

test("escape closes the drawer and hands focus back to the row", async ({
  page,
}) => {
  const base = await startAssessment(page, `Keyboard ${Date.now()}`);
  await atRegister(page, base);

  const row = page.locator(".register-row").first();
  await row.click();
  await expect(page.locator(".drawer")).toBeVisible();
  await page.locator(".drawer").getByRole("button", { name: /^Close/ }).focus();
  await page.keyboard.press("Escape");

  await expect(page.locator(".drawer")).toHaveCount(0);
  // Focus never stranded after a panel closes (§23).
  await expect(row).toBeFocused();
});

test("a control the pilot cannot ask about says so, rather than going missing", async ({
  page,
}) => {
  const base = await startAssessment(page, `Boundary ${Date.now()}`);
  await atRegister(page, base);

  const recorded = page
    .locator(".register-row")
    .filter({ hasText: "No question yet" })
    .first();
  await expect(recorded).toBeVisible();
  await recorded.click();
  const drawer = page.locator(".drawer");
  await expect(drawer).toContainText("no question for this one yet");
  await expect(drawer).toContainText("Nothing is missing from your side");
  // No answer controls, because there is nothing here to answer.
  await expect(drawer.locator(".q3-answers")).toHaveCount(0);
});

test("answering a control raises no React error in the console", async ({
  page,
}) => {
  // A save fired from inside a state updater — which runs during render —
  // asked the router to redraw mid-render, and React refused: "cannot update
  // a component while rendering a different component". It typechecked, every
  // assertion passed, and it only appeared in the console. So the console is
  // what this watches.
  const shouted: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") shouted.push(message.text());
  });
  page.on("pageerror", (error) => shouted.push(String(error)));

  const base = await startAssessment(page, `Console ${Date.now()}`);
  await atRegister(page, base);

  const card = await openControl(page, 0);
  await card.locator("> .q3-answers").getByRole("radio", { name: "Yes" }).click();
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");
  await card.locator("> .q3-answers").getByRole("radio", { name: "No" }).click();
  await card.locator("> .q3-note textarea").fill("Nothing in place.");
  await expect(page.locator(".savebar [role=status]")).toHaveText("Saved");

  const react = shouted.filter(
    (line) =>
      /Cannot update a component/i.test(line) ||
      /setState/i.test(line) ||
      /Maximum update depth/i.test(line),
  );
  expect(react, `React complained: ${react.join(" | ")}`).toEqual([]);
});
