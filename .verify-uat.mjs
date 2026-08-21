import { chromium } from "@playwright/test";
const B = "http://localhost:3100";
const SHOT = "/tmp/ura-verify";
const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => log("!! PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") log("!! CONSOLE ERROR:", m.text()); });

async function txt(sel) { return (await page.locator(sel).first().innerText()).replace(/\s+/g, " ").trim(); }

// ---------- 1. Home ----------
await page.goto(B);
await page.screenshot({ path: `${SHOT}/01-home.png`, fullPage: true });
log("== HOME h1:", await txt("h1"));

// ---------- 2. Create project ----------
const NAME = "Verifier Run " + Date.now();
await page.fill("#new-project", NAME);
await page.click('button:has-text("Start assessment")');
await page.waitForURL(/\/projects\//);
const projectUrl = page.url();
const projectId = projectUrl.split("/projects/")[1];
log("== PROJECT:", projectId);
await page.screenshot({ path: `${SHOT}/02-intake-empty.png`, fullPage: true });
log("== HEADER nextline:", await txt(".nextline"));

// ---------- 3. NEGATIVE: empty intake pre-fills nothing ----------
await page.goto(`${B}/projects/${projectId}/assess/third-party`);
log("== EMPTY INTAKE / third-party gate ----");
log("   prefill nodes:", await page.locator(".prefill").count());
log("   rail states:", (await page.locator(".rail-state").allInnerTexts()).map(s=>s.trim()).join("|"));
log("   header:", await txt(".nextline"));
await page.screenshot({ path: `${SHOT}/03-gate-no-prefill.png`, fullPage: true });

// ---------- 4. Fill intake: I'm not sure about AI, vendor named, Confidential ----------
await page.goto(projectUrl);
await page.fill("#businessPurpose", "Replace manual shift planning with a scheduling service.");
await page.fill("#projectDescription", "A hosted scheduling tool used by store managers to build weekly rotas.");
await page.selectOption("#usesAi", "I'm not sure");
await page.waitForTimeout(200);
const noteVisible = await page.locator(".note, [class*=note]").count();
log("== AI 'I'm not sure' note count:", noteVisible);
const bodyText = (await page.locator("main").innerText()).replace(/\s+/g," ");
log("== reassurance present:", bodyText.includes("A Risk Assessor will confirm whether AI is involved"));
await page.screenshot({ path: `${SHOT}/04-intake-unsure.png`, fullPage: true });

await page.fill("#businessOwner", "Dana Whitfield");
await page.selectOption("#initiativeType", "Brand new");
await page.fill("#businessUnit", "Retail Operations");
await page.fill("#vendorNames", "Cadenza Inc");
await page.waitForTimeout(150);
// data classification multi
await page.getByLabel("Confidential", { exact: true }).check().catch(async () => {
  await page.locator('input[type=checkbox][value="Confidential"]').check();
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${SHOT}/05-intake-filled.png`, fullPage: true });
// save
const saveBtn = page.locator('form button[type="submit"]').last();
log("== save button text:", (await saveBtn.innerText()).trim());
await saveBtn.click();
await page.waitForTimeout(1200);
log("== after save, status text:", (await page.locator("main").innerText()).replace(/\s+/g," ").slice(0,0) || "(see below)");
const afterSave = (await page.locator("main").innerText()).replace(/\s+/g," ");
log("== 'Saved' visible:", /Saved|saved/.test(afterSave));
await page.screenshot({ path: `${SHOT}/06-intake-saved.png`, fullPage: true });

// ---------- 5. Gates: pre-fill visible with reason ----------
await page.goto(`${B}/projects/${projectId}/assess/third-party`);
log("\n== GATE third-party ==");
log("   eyebrow:", await txt(".eyebrow"));
log("   question:", await txt(".gate-question"));
log("   help:", await txt(".gate-help"));
log("   prefill:", (await page.locator(".prefill").count()) ? await txt(".prefill") : "(none)");
log("   choices:", (await page.locator(".gate-choice").allInnerTexts()).map(s=>s.replace(/\s+/g," ").trim()).join(" || "));
log("   aria-pressed:", await page.locator(".gate-choice").evaluateAll(ns => ns.map(n => n.getAttribute("aria-pressed"))));
log("   rail:", (await page.locator(".rail-item").allInnerTexts()).map(s=>s.replace(/\s+/g," ").trim()).join(" | "));
log("   header:", await txt(".nextline"));
await page.screenshot({ path: `${SHOT}/07-gate-prefilled.png`, fullPage: true });

// ---------- 6. NEGATIVE: 'I'm not sure' must NOT prefill the AI gate ----------
await page.goto(`${B}/projects/${projectId}/assess/ai`);
log("\n== GATE ai (intake said 'I'm not sure') ==");
log("   prefill nodes:", await page.locator(".prefill").count());
log("   aria-pressed:", await page.locator(".gate-choice").evaluateAll(ns => ns.map(n => n.getAttribute("aria-pressed"))));
await page.screenshot({ path: `${SHOT}/08-gate-ai-not-prefilled.png`, fullPage: true });

// ---------- 7. data-privacy prefilled ----------
await page.goto(`${B}/projects/${projectId}/assess/data-privacy`);
log("\n== GATE data-privacy ==");
log("   prefill:", (await page.locator(".prefill").count()) ? await txt(".prefill") : "(none)");

// ---------- 8. Person supersedes pre-fill: answer NO on third-party ----------
await page.goto(`${B}/projects/${projectId}/assess/third-party`);
await page.locator('.gate-choice:has-text("No, it doesn")').click();
await page.waitForURL(/assess\/solution-architecture/, { timeout: 5000 });
log("\n== after answering No, landed on:", page.url());
await page.goto(`${B}/projects/${projectId}/assess/third-party`);
log("   third-party prefill nodes now:", await page.locator(".prefill").count());
log("   aria-pressed now:", await page.locator(".gate-choice").evaluateAll(ns => ns.map(n => n.getAttribute("aria-pressed"))));
log("   rail item 1:", (await page.locator(".rail-item").first().innerText()).replace(/\s+/g," ").trim());
await page.screenshot({ path: `${SHOT}/09-gate-person-supersedes.png`, fullPage: true });

await ctx.storageState({ path: "/tmp/ura-verify/state.json" });
console.log("PROJECT_ID=" + projectId);
await browser.close();
