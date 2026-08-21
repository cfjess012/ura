import { chromium } from "@playwright/test";
const B = "http://localhost:3100";
const SHOT = "/tmp/ura-verify";
const PID = process.argv[2];
const log = (...a) => console.log(...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => log("!! PAGEERROR:", e.message));

// ---------- A. KEYBOARD-ONLY: complete a gate with keys only ----------
await page.goto(`${B}/projects/${PID}/assess/solution-architecture`);
log("== KEYBOARD-ONLY on solution-architecture ==");
const seq = [];
for (let i = 0; i < 25; i++) {
  await page.keyboard.press("Tab");
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "(body)";
    const name = el.getAttribute("aria-label") || el.textContent?.replace(/\s+/g," ").trim().slice(0,45) || "(no name)";
    const cs = getComputedStyle(el);
    return `${el.tagName.toLowerCase()}.${(el.className||"").toString().split(" ")[0]} :: "${name}" outline=${cs.outlineWidth}/${cs.outlineStyle}`;
  });
  seq.push(info);
  if (/gate-choice/.test(info) && seq.filter(s=>/gate-choice/.test(s)).length === 1) {
    log("   focus landed on first gate choice at Tab #" + (i+1));
  }
}
log(seq.map((s,i)=>`   ${i+1}. ${s}`).join("\n"));

// focus-visible outline check on a gate choice
await page.goto(`${B}/projects/${PID}/assess/solution-architecture`);
await page.locator(".gate-choice").first().focus();
await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
const ring = await page.locator(".gate-choice").first().evaluate(el => { const cs=getComputedStyle(el); return `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`; });
log("   focus ring on gate choice (programmatic focus):", ring);
await page.screenshot({ path: `${SHOT}/10-focus.png` });

// Now genuinely keyboard-drive: tab to "Yes" and press Enter
await page.goto(`${B}/projects/${PID}/assess/solution-architecture`);
await page.keyboard.press("Tab");
let guard = 0;
while (guard++ < 30) {
  const isChoice = await page.evaluate(() => document.activeElement?.classList?.contains("gate-choice") ?? false);
  if (isChoice) break;
  await page.keyboard.press("Tab");
}
const focusedLabel = await page.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g," ").trim());
log("   keyboard focus reached:", focusedLabel, "(after", guard, "tabs)");
await page.keyboard.press("Enter");
await page.waitForURL(/assess\/ai/, { timeout: 5000 }).then(()=>log("   ENTER answered the gate and advanced to:", page.url()))
  .catch(()=>log("   !! ENTER did not advance; url =", page.url()));

// ---------- B. answer the rest by keyboard/click, mixing Yes and No ----------
const order = ["ai","data-privacy","legal-regulatory","operational","security-resilience","governance","ethics-conduct","people-capacity","jurisdiction"];
const answers = { ai:"No", "data-privacy":"Yes", "legal-regulatory":"No", operational:"Yes", "security-resilience":"Yes", governance:"No", "ethics-conduct":"No", "people-capacity":"No", jurisdiction:"No" };
for (const key of order) {
  await page.goto(`${B}/projects/${PID}/assess/${key}`);
  const sel = answers[key] === "Yes" ? '.gate-choice:has-text("Yes, it applies")' : '.gate-choice:has-text("No, it doesn")';
  await page.locator(sel).click();
  await page.waitForTimeout(500);
}
await page.goto(`${B}/projects/${PID}/assess/complete`);
log("\n== COMPLETE PAGE ==");
log("   h2:", (await page.locator("section h2.display").innerText()).trim());
log("   lede:", (await page.locator(".lede").innerText()).replace(/\s+/g," ").trim());
log("   header:", (await page.locator(".nextline").innerText()).replace(/\s+/g," ").trim());
log("   body:", (await page.locator("main section").innerText()).replace(/\s+/g," ").trim());
await page.screenshot({ path: `${SHOT}/11-complete.png`, fullPage: true });

// ---------- C. No closes the category: does anything remain reachable? ----------
await page.goto(`${B}/projects/${PID}/assess/ai`);
log("\n== 'No' category (ai) revisited ==");
log("   aria-pressed:", await page.locator(".gate-choice").evaluateAll(ns=>ns.map(n=>n.getAttribute("aria-pressed"))));
log("   page text:", (await page.locator("main section").innerText()).replace(/\s+/g," ").trim().slice(0,400));
await page.screenshot({ path: `${SHOT}/12-gate-closed.png`, fullPage: true });

await browser.close();
