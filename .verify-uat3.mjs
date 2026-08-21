import { chromium } from "@playwright/test";
const B = "http://localhost:3100";
const SHOT = "/tmp/ura-verify";
const PID = process.argv[2];
const log = (...a) => console.log(...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${B}/projects/${PID}/assess/complete`);
log("== COMPLETE full text ==");
log((await page.locator("main").innerText()).replace(/\n{2,}/g,"\n").trim());
await page.screenshot({ path: `${SHOT}/11-complete.png`, fullPage: true });

await page.goto(`${B}/projects/${PID}/assess/ai`);
log("\n== 'No' category (ai) revisited ==");
log("   aria-pressed:", await page.locator(".gate-choice").evaluateAll(ns=>ns.map(n=>n.getAttribute("aria-pressed"))));
log("   rail state for AI:", (await page.locator(".rail-item").nth(2).innerText()).replace(/\s+/g," ").trim());
log("   next link label:", (await page.locator(".gate-nav a").last().innerText()).trim());
await page.screenshot({ path: `${SHOT}/12-gate-closed.png`, fullPage: true });

// ---------- D. SKIP LINK / landmark ----------
await page.goto(`${B}/projects/${PID}/assess/ai`);
const landmarks = await page.evaluate(() => ({
  main: document.querySelectorAll("main").length,
  nav: document.querySelectorAll("nav").length,
  h1: [...document.querySelectorAll("h1")].map(h=>h.textContent.trim()),
  skip: [...document.querySelectorAll("a")].filter(a=>/skip/i.test(a.textContent)).length,
}));
log("\n== landmarks:", JSON.stringify(landmarks));

// ---------- E. UNNAMED CONTROLS AUDIT across surfaces ----------
for (const [label, url] of [["home", B], ["intake", `${B}/projects/${PID}`], ["gate", `${B}/projects/${PID}/assess/data-privacy`], ["complete", `${B}/projects/${PID}/assess/complete`]]) {
  await page.goto(url);
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, a, input, select, textarea")) {
      if (el.closest("nextjs-portal")) continue;
      let name = el.getAttribute("aria-label") || "";
      if (!name && el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) name = l.textContent||""; }
      if (!name) { const l = el.closest("label"); if (l) name = l.textContent||""; }
      if (!name) name = el.textContent || "";
      if (!name.trim() && el.tagName === "INPUT") name = el.getAttribute("placeholder")||"";
      if (!name.trim()) out.push(`${el.tagName.toLowerCase()}[type=${el.getAttribute("type")||"-"}] class="${el.className}" id="${el.id}"`);
    }
    return out;
  });
  log(`   ${label}: unnamed controls =`, bad.length ? bad : "none");
}

// ---------- F. STATE BY COLOUR ALONE (gate rail + choices) ----------
await page.goto(`${B}/projects/${PID}/assess/data-privacy`);
const railTextual = await page.locator(".rail-item").evaluateAll(ns => ns.map(n => ({
  name: n.querySelector(".rail-name")?.textContent?.trim(),
  state: n.querySelector(".rail-state")?.textContent?.trim() || "(empty)",
})));
log("\n== rail textual states:", JSON.stringify(railTextual));
const chosen = await page.locator(".gate-choice").evaluateAll(ns => ns.map(n => ({
  text: n.textContent.replace(/\s+/g," ").trim().slice(0,30),
  ariaPressed: n.getAttribute("aria-pressed"),
  bg: getComputedStyle(n).backgroundColor,
  border: getComputedStyle(n).borderColor,
})));
log("== gate choice states:", JSON.stringify(chosen, null, 1));

// ---------- G. INTERNAL IDENTIFIERS ON SCREEN ----------
for (const [label, url] of [["home", B], ["intake", `${B}/projects/${PID}`], ["gate", `${B}/projects/${PID}/assess/data-privacy`], ["complete", `${B}/projects/${PID}/assess/complete`]]) {
  await page.goto(url);
  const t = await page.locator("main").innerText();
  const hits = t.match(/gate\.[a-z_]+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|tier1-gates|instrument_version|NFR-\d|FR-\d/g);
  log(`   ${label}: identifier leaks =`, hits ? [...new Set(hits)] : "none");
}

// ---------- H. RESPONSIVE laptop viewport / horizontal scroll ----------
for (const w of [1440, 1280, 1024]) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto(`${B}/projects/${PID}/assess/data-privacy`);
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  log(`   ${w}px: scrollWidth=${overflow.sw} clientWidth=${overflow.cw} horizontalScroll=${overflow.sw > overflow.cw+1}`);
  await page.screenshot({ path: `${SHOT}/13-gate-${w}.png`, fullPage: true });
}
await browser.close();
