import { chromium } from "@playwright/test";
const B = "http://localhost:3100";
const SHOT = "/tmp/ura-verify";
const log = (...a) => console.log(...a);
const browser = await chromium.launch();

// ================= S1 REGRESSION: create → fill → CLOSE BROWSER → reopen =================
let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let page = await ctx.newPage();
await page.goto(B);
const NAME = "S1 Regression " + Date.now();
await page.fill("#new-project", NAME);
await page.click('button:has-text("Start assessment")');
await page.waitForURL(/\/projects\//);
const id = page.url().split("/projects/")[1];
log("S1 project:", id);

const filled = {
  businessPurpose: "Consolidate three rota tools into one.",
  projectDescription: "A vendor SaaS product managers use to plan weekly shifts.",
  businessOwner: "Dana Whitfield",
  businessUnit: "Retail Operations",
  vendorNames: "Cadenza Inc",
  technicalOwner: "Priya Raman",
};
for (const [k,v] of Object.entries(filled)) await page.fill("#"+k, v);
await page.selectOption("#usesAi", "Yes");
await page.waitForTimeout(150);
log("conditional 'What does the AI do?' revealed:", await page.locator("#aiUseCase").count() === 1);
log("  reveal note:", (await page.locator("main").innerText()).includes("Shown because you told us this uses AI or machine learning"));
await page.fill("#aiUseCase", "It suggests a rota; a manager approves before publishing.");
await page.selectOption("#initiativeType", "A vendor renewal");
await page.waitForTimeout(150);
log("conditional 'Which assessment...' revealed:", await page.locator("#priorAssessmentRef").count() === 1);
await page.fill("#priorAssessmentRef", "RA-2024-118");
log("conditional 'Other Business Units' revealed:", await page.locator("#otherUnits").count() === 1);
await page.fill("#otherUnits", "Finance");
log("conditional 'Coupa' revealed:", await page.locator("#coupaOnboarded").count() === 1);
await page.selectOption("#coupaOnboarded", "I'm not sure");
await page.waitForTimeout(150);
log("  coupa reassurance shown:", (await page.locator("main").innerText()).includes("a reviewer confirms this with Procurement"));
await page.locator('input[type=checkbox]').filter({ hasText: "" }).nth(0);
await page.getByRole("checkbox", { name: "Restricted" }).check();
await page.waitForTimeout(200);
log("conditional 'Data Elements' revealed:", (await page.locator("main").innerText()).includes("Data Elements"));
await page.getByRole("checkbox", { name: "Customer personal information" }).check();
await page.fill("#targetGoLive", "2026-11-02");
await page.screenshot({ path: `${SHOT}/16-s1-filled.png`, fullPage: true });
await page.locator('form button[type="submit"]').last().click();
await page.waitForTimeout(1500);
log("save status:", (await page.locator(".savebar [role='status']").innerText()).trim());
log("missing meter:", (await page.locator(".missing").innerText()).trim());

// CLOSE the browser context entirely (new context = fresh browser session)
await ctx.close();
ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
page = await ctx.newPage();
await page.goto(B);
log("\n-- reopened; project in list:", (await page.locator(".list-row").allInnerTexts()).some(t=>t.includes(NAME)));
await page.goto(`${B}/projects/${id}`);
const vals = {};
for (const k of Object.keys(filled)) vals[k] = await page.inputValue("#"+k);
vals.usesAi = await page.inputValue("#usesAi");
vals.aiUseCase = await page.inputValue("#aiUseCase");
vals.initiativeType = await page.inputValue("#initiativeType");
vals.priorAssessmentRef = await page.inputValue("#priorAssessmentRef");
vals.otherUnits = await page.inputValue("#otherUnits");
vals.coupaOnboarded = await page.inputValue("#coupaOnboarded");
vals.targetGoLive = await page.inputValue("#targetGoLive");
vals.dataClassification = await page.getByRole("checkbox", { name: "Restricted" }).isChecked();
vals.dataElements = await page.getByRole("checkbox", { name: "Customer personal information" }).isChecked();
log("-- restored values:", JSON.stringify(vals, null, 1));
log("-- conditionals still revealed after reopen:", await page.locator("#aiUseCase").count()===1, await page.locator("#priorAssessmentRef").count()===1, await page.locator("#coupaOnboarded").count()===1);
log("-- header:", (await page.locator(".nextline").innerText()).replace(/\s+/g," ").trim());
await page.screenshot({ path: `${SHOT}/17-s1-reopened.png`, fullPage: true });

// S2 on top of S1 data: vendor renewal + AI Yes + Restricted → three prefilled gates
await page.goto(`${B}/projects/${id}/assess/third-party`);
log("\n-- third-party prefill:", (await page.locator(".prefill").innerText()).replace(/\s+/g," ").trim());
await page.goto(`${B}/projects/${id}/assess/ai`);
log("-- ai prefill:", (await page.locator(".prefill").count()) ? (await page.locator(".prefill").innerText()).replace(/\s+/g," ").trim() : "(none)");
await page.goto(`${B}/projects/${id}/assess/data-privacy`);
log("-- data-privacy prefill:", (await page.locator(".prefill").count()) ? (await page.locator(".prefill").innerText()).replace(/\s+/g," ").trim() : "(none)");
log("-- rail:", (await page.locator(".rail-item").allInnerTexts()).map(s=>s.replace(/\s+/g," ").trim()).join(" | "));
log("-- header:", (await page.locator(".nextline").innerText()).replace(/\s+/g," ").trim());
await page.screenshot({ path: `${SHOT}/18-s2-three-prefills.png`, fullPage: true });
console.log("S1_ID="+id);
await browser.close();
