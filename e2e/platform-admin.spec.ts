/**
 * G-83 — the assessed platforms, read by an administrator.
 *
 * Read-only on purpose: an attestation is a named person putting their name
 * to a control, and this pilot signs people in with a switcher. These drive
 * what the screens say, and that they say what they cannot do.
 */
import { expect, test } from "@playwright/test";
import { becomePerson } from "./helpers";

test("the roster puts lapsed attestations first and counts what they took with them", async ({
  page,
}) => {
  await becomePerson(page, "Tom Holland");
  await page.goto("/admin/platforms");

  await expect(
    page.getByRole("heading", { name: /assessed once/ }),
  ).toBeVisible();
  const rows = page.locator(".platform-table tbody tr");
  expect(await rows.count()).toBeGreaterThan(10);

  // What needs attention is what a person meets first.
  await expect(rows.first()).toHaveAttribute("data-stale", "true");
  await expect(rows.first().getByText("Lapsed")).toBeVisible();

  // The banner counts assessments, not red rows: an owner needs to know what
  // became unsupported, not how many dates passed.
  const banner = page.locator(".platform-note-lapsed");
  await expect(banner).toContainText(/attestations? (has|have) run out/);
  await expect(banner).toContainText(/assessment|nothing has become unsupported/);

  // Nothing here pretends anyone can attest.
  await expect(page.locator("main")).toContainText("Nobody can attest here yet");
  // And no internal identifier reaches the screen (NFR-9).
  await expect(page.locator(".platform-table")).not.toContainText(/PL_[A-Z]/);
  await expect(page.locator(".platform-table")).not.toContainText(
    /T[0-9]-[A-Z]{2,5}-[0-9]/,
  );
});

test("a platform's record names its owner, its ceiling and what leans on it", async ({
  page,
}) => {
  await becomePerson(page, "Tom Holland");
  await page.goto("/admin/platforms/PL_ENTRA");

  await expect(
    page.getByRole("heading", { name: "Microsoft Entra ID", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("In force.");
  await expect(page.locator("main")).toContainText("Cleared up to Restricted.");

  // Controls are named, never coded, and each carries what it satisfies.
  const provides = page.locator(".covered-list li");
  expect(await provides.count()).toBeGreaterThan(0);
  await expect(provides.first()).toContainText("NIST Cybersecurity Framework");
  await expect(page.locator("main")).not.toContainText(/T[0-9]-[A-Z]{2,5}-[0-9]/);

  // The blast radius: what an owner would take with them.
  await expect(
    page.getByRole("heading", { name: /What is leaning on it/ }),
  ).toBeVisible();
});

test("a lapsed platform says none of its controls is counting", async ({
  page,
}) => {
  await becomePerson(page, "Tom Holland");
  await page.goto("/admin/platforms/PL_OKTA");

  await expect(page.locator("main")).toContainText("Lapsed.");
  await expect(page.locator("main")).toContainText(
    /lapsed on \d{4}-\d{2}-\d{2}, so what it provides no longer counts/,
  );
  const provides = page.locator(".covered-list li");
  expect(await provides.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await provides.count()); i++) {
    await expect(provides.nth(i)).toContainText("Not counting");
  }
  await expect(page.locator("main")).toContainText("None of these is counting");
});

test("a requester is told this page is not theirs, not shown an empty one", async ({
  page,
}) => {
  await becomePerson(page, "Priya Sharma");
  await page.goto("/admin/platforms");
  await expect(
    page.getByRole("heading", { name: /for administrators/ }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("Priya Sharma");
  await expect(page.locator(".platform-table")).toHaveCount(0);
});
