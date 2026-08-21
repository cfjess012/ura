import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage();
p.setDefaultTimeout(10000);
await p.goto("http://localhost:3100/");
await p.waitForLoadState("networkidle");
console.log("URL:", p.url());
console.log("TITLE:", await p.title());
console.log("--- TEXT ---");
console.log((await p.locator("body").innerText()).slice(0, 3000));
console.log("--- CONTROLS ---");
for (const el of await p.locator("button, a, input, select, textarea").all()) {
  console.log(await el.evaluate(n => n.tagName), "|", (await el.getAttribute("aria-label")) || (await el.innerText().catch(()=>"")).replace(/\n/g," ").slice(0,60), "|", await el.getAttribute("href") || "");
}
await p.screenshot({ path: "/tmp/v-home.png", fullPage: true });
await b.close();
