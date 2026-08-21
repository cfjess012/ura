import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
const B = "http://localhost:3100";
const SHOT = "/tmp/ura-verify";
const log = (...a) => console.log(...a);
const psql = (sql) => execSync(`PGPASSWORD=ura /opt/homebrew/opt/postgresql@16/bin/psql -U ura -h localhost -d ura -At -c ${JSON.stringify(sql)}`).toString().trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// SERVER-SIDE FAILURE: project vanishes while the form is open
await page.goto(B);
await page.fill("#new-project", "Vanishing Project " + Date.now());
await page.click('button:has-text("Start assessment")');
await page.waitForURL(/\/projects\//);
const id = page.url().split("/projects/")[1];
await page.fill("#businessPurpose", "SENTINEL work in progress");
await page.fill("#projectDescription", "SENTINEL description");
await page.fill("#businessOwner", "Dana Whitfield");
psql(`delete from projects where id = '${id}'`);
log("deleted project row:", id);
await page.locator('form button[type="submit"]').last().click();
await page.waitForTimeout(2500);
const statusText = (await page.locator(".savebar [role='status']").innerText()).replace(/\s+/g," ").trim();
log("== permanent-failure message:", statusText);
log("== button label:", (await page.locator('form button[type="submit"]').last().innerText()).trim());
log("== button disabled:", await page.locator('form button[type="submit"]').last().isDisabled());
log("== input preserved:", await page.inputValue("#businessPurpose"));
const refMatch = statusText.match(/Reference ([A-Z0-9]{4,8})/);
log("== reference on screen:", refMatch ? refMatch[1] : "(none)");
await page.screenshot({ path: `${SHOT}/19-permanent-failure.png`, fullPage: true });
if (refMatch) {
  try { log("== server log line:", execSync(`grep -n "${refMatch[1]}" /tmp/ura-dev.log | head -3`).toString().trim() || "(NOT FOUND)"); }
  catch { log("== server log line: (NOT FOUND in /tmp/ura-dev.log)"); }
}
// press Try again -> does it help?
await page.locator('form button[type="submit"]').last().click();
await page.waitForTimeout(2000);
log("== after pressing 'Try again':", (await page.locator(".savebar [role='status']").innerText()).replace(/\s+/g," ").trim());

// 404 surface for a missing project
const resp = await page.goto(`${B}/projects/${id}`, { waitUntil: "domcontentloaded" });
log("\n== missing project page status:", resp.status());
log("== missing project page text:", (await page.locator("body").innerText()).replace(/\s+/g," ").trim().slice(0,300));
await page.screenshot({ path: `${SHOT}/20-missing-project.png`, fullPage: true });

// Unknown category slug
const resp2 = await page.goto(`${B}/projects/5cb05cbb-d0b4-4968-b59e-7ee6a2e96b34/assess/not-a-category`, { waitUntil: "domcontentloaded" });
log("\n== unknown category status:", resp2.status());
log("== unknown category text:", (await page.locator("body").innerText()).replace(/\s+/g," ").trim().slice(0,200));

await browser.close();
