/**
 * FR-48 · the process map. Admin-only by role on the server, two journeys,
 * every stop a real button that opens a reading.
 */
import { expect, test } from "@playwright/test";
import { becomePerson } from "./helpers";

test("the map is refused by role, then opens for an administrator with both journeys", async ({
  page,
}) => {
  // The server refuses by role, not by hiding a link.
  await page.goto("/admin/model");
  await expect(
    page.getByRole("heading", { name: "This page is for administrators." }),
  ).toBeVisible();

  await page.goto("/projects");
  await becomePerson(page, "Tom Holland");
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(
    page.getByRole("heading", { name: "How an assessment moves." }),
  ).toBeVisible();

  // The requester's journey first, with its stops as buttons in order.
  const stops = page.getByRole("button", { name: /^Stop \d+ of \d+:/ });
  const requesterStops = await stops.count();
  expect(requesterStops).toBeGreaterThan(4);
  await expect(page.getByRole("button", { name: /Stop 1 of/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Opening a stop reads it out: what they see, the logic, what it leaves.
  await page.getByRole("button", { name: /Declare and hand over/ }).click();
  const reading = page.locator(".model-detail");
  await expect(reading.getByRole("heading", { name: "Declare and hand over" })).toBeVisible();
  await expect(reading).toContainText("What they see");
  await expect(reading).toContainText("The logic");
  await expect(reading).toContainText("The declaration");

  // A number on the map is the instrument's number, not prose.
  await expect(page.getByRole("button", { name: /Which risk areas apply/ })).toContainText(/\d+ areas/);

  // The other journey is a different set of stops, and it ends the same way.
  await page.getByRole("button", { name: "As the risk assessor" }).click();
  await expect(page.getByRole("button", { name: /Your queue/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Where the pilot stops/ })).toBeVisible();
  expect(await stops.count()).not.toBe(requesterStops);

  // The flat view is the same list without the transform — nothing is lost.
  await page.getByRole("button", { name: "Flat" }).click();
  await expect(page.getByRole("button", { name: /Settle each finding/ })).toBeVisible();
});
