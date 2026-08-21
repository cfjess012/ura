/**
 * S2.5 · People — personas in practice (SPEC §2). Authority is checked on
 * the server, so switching persona changes what the platform permits, not
 * merely what it shows.
 */
import { expect, test } from "@playwright/test";

test("switching persona changes role, navigation, and what is permitted", async ({ page }) => {
  await page.goto("/");

  // A requester is the pilot default: no admin navigation.
  await expect(page.getByText("Requester", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Agents" })).toBeHidden();

  // The server refuses the admin surface by role, not by hiding a link.
  await page.goto("/admin/agents");
  await expect(
    page.getByRole("heading", { name: "This page is for administrators." }),
  ).toBeVisible();
  await expect(page.getByText("You are currently working as")).toBeVisible();

  // Switch to the administrator.
  await page.goto("/");
  await page.getByLabel("Switch person (pilot — not a sign-in)").selectOption({
    label: "Tom Holland · Administrator",
  });
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByText("Administrator", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Agents" })).toBeVisible();

  // Now the page opens, and it is honest about what the switcher is.
  await page.getByRole("link", { name: "Agents" }).click();
  await expect(
    page.getByRole("heading", { name: "Every agent, and what it may never do." }),
  ).toBeVisible();
  await expect(page.getByText("the persona switcher is a pilot device")).toBeVisible();

  // The Risk Assessor is a third, distinct role.
  await page.goto("/");
  await page.getByLabel("Switch person (pilot — not a sign-in)").selectOption({
    label: "Noah Kahan · Risk Assessor",
  });
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByText("Risk Assessor", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Agents" })).toBeHidden();
});

test("an answer records who gave it", async ({ page }) => {
  const name = `Attribution ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Switch person (pilot — not a sign-in)").selectOption({
    label: "Priya Sharma · Requester",
  });
  await page.getByRole("button", { name: "Switch" }).click();
  await page.getByLabel("Start a new assessment").fill(name);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();

  // Answer a gate directly; the action attributes it server-side.
  const id = page.url().split("/projects/")[1]!.split("/")[0]!;
  await page.goto(`/projects/${id}/assess/ai`);
  await page.getByRole("button", { name: /Yes, it applies/ }).click();
  await expect(page.getByRole("link", { name: /AI \/ ML/ }).getByText("Applies")).toBeVisible();
});
