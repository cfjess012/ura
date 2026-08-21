import { chromium } from "@playwright/test";
const B = "http://localhost:3100";
const SHOT = "/tmp/ura-verify";
const PID = process.argv[2];
const log = (...a) => console.log(...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// ---------- ERROR PATH: gate answer while offline ----------
await page.goto(`${B}/projects/${PID}/assess/jurisdiction`);
const before = await page.locator(".gate-choice").evaluateAll(ns=>ns.map(n=>n.getAttribute("aria-pressed")));
log("== before offline, aria-pressed:", before);
await ctx.setOffline(true);
await page.locator('.gate-choice:has-text("Yes, it applies")').click();
await page.waitForTimeout(4000);
const liveRegion = await page.locator('[role="status"]').last();
log("== live region role/aria:", await liveRegion.evaluate(n => `${n.getAttribute("role")} aria-live=${n.getAttribute("aria-live")}`));
log("== error text on screen:", (await liveRegion.innerText()).replace(/\s+/g," ").trim() || "(EMPTY)");
log("== aria-pressed after failure:", await page.locator(".gate-choice").evaluateAll(ns=>ns.map(n=>n.getAttribute("aria-pressed"))));
log("== buttons disabled after failure:", await page.locator(".gate-choice").evaluateAll(ns=>ns.map(n=>n.disabled)));
log("== url still:", page.url());
const full = (await page.locator("main").innerText()).replace(/\s+/g," ");
log("== internals leaked (sql/stack/driver):", /at \w+ \(|Error:|ECONNREFUSED|postgres|drizzle|select |insert into/i.test(full));
await page.screenshot({ path: `${SHOT}/14-gate-offline-error.png`, fullPage: true });
await ctx.setOffline(false);
// retry works?
await page.locator('.gate-choice:has-text("Yes, it applies")').click();
await page.waitForTimeout(2500);
log("== after going online + retry, url:", page.url());

// ---------- ERROR PATH: intake save while offline (input preserved?) ----------
await page.goto(`${B}/projects/${PID}`);
await page.fill("#businessPurpose", "TYPED-BUT-NOT-SAVED sentinel value");
await ctx.setOffline(true);
await page.locator('form button[type="submit"]').last().click();
await page.waitForTimeout(4000);
const bar = page.locator(".savebar [role='status']");
log("\n== intake offline error:", (await bar.innerText()).replace(/\s+/g," ").trim() || "(EMPTY)");
log("== input preserved:", await page.inputValue("#businessPurpose"));
log("== button label now:", (await page.locator('form button[type="submit"]').last().innerText()).trim());
await page.screenshot({ path: `${SHOT}/15-intake-offline-error.png`, fullPage: true });
await ctx.setOffline(false);

// ---------- TIMING: silent window after a gate click ----------
await page.goto(`${B}/projects/${PID}/assess/people-capacity`);
const t0 = Date.now();
await page.locator('.gate-choice:has-text("No, it doesn")').click();
let sawSaving = false, savingGone = null, navDone = null;
const startUrl = page.url();
while (Date.now() - t0 < 15000) {
  const st = await page.evaluate(() => {
    const b = document.querySelector(".gate-choice");
    return { label: b?.textContent?.slice(0,20) || "", url: location.pathname };
  }).catch(()=>({label:"",url:""}));
  if (/Saving/.test(st.label)) sawSaving = true;
  if (sawSaving && savingGone === null && !/Saving/.test(st.label)) savingGone = Date.now()-t0;
  if (st.url && !startUrl.endsWith(st.url)) { navDone = Date.now()-t0; break; }
  await page.waitForTimeout(50);
}
log("\n== gate click timing: saw 'Saving…' =", sawSaving, "| saving cleared at", savingGone, "ms | navigation at", navDone, "ms");
log("   silent window (idle button, page unchanged) =", (savingGone!==null && navDone!==null) ? (navDone - savingGone) + "ms" : "n/a");

await browser.close();
