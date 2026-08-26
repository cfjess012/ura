#!/usr/bin/env node
/**
 * Walk demo/three-minutes.md against the running app.
 *
 * The run sheet is read aloud to leadership, so every string in it is a
 * claim the product makes (G-56). It has been wrong twice: once naming a
 * button that had been renamed an hour earlier, once quoting a sentence
 * trimmed mid-clause. A unit test cannot check this — the sentences are
 * built from template literals with counts interpolated — so this renders
 * the real pages instead.
 *
 * It rebuilds the demo data first and again at the end, because the walk
 * answers questions as it goes — and a severity question already answered
 * is exactly what makes Beat 3 look like a dead button in the room. Point
 * it at `pnpm demo:prod` or `pnpm dev`.
 */
import pkg from "@playwright/test";
const { chromium } = pkg;
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const reset = (why) => {
  console.log(`  … ${why}`);
  execFileSync("node", ["scripts/reset-dev-db.mjs", "--yes"], { stdio: "ignore" });
  execFileSync("node", ["scripts/seed-demo.mjs"], { stdio: "ignore" });
  // The finished assessment is the only one that reaches stage 4. Left out
  // of the reset, the walk deleted the single thing stage 4 can be shown on
  // and then demoed it as "Not ready yet".
  execFileSync("node", ["scripts/seed-finished.mjs"], { stdio: "ignore" });
};
reset("rebuilding the demo data before the walk");

const b=await chromium.launch();
let failures=0;
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const settle=async()=>{await p.waitForLoadState('networkidle').catch(()=>{});await p.waitForTimeout(500);};
const until=async(re,ms=20000)=>{const t=Date.now();while(Date.now()-t<ms){if(re.test(p.url()))return true;await p.waitForTimeout(120);}return false;};
const ok=(n,c)=>{ if(!c) failures++; console.log(`  ${c?'✓':'✗'} ${n}`); };

// BEAT 1
await p.goto('http://localhost:3100/'); await settle();
await p.getByText('Isabelle Withers').first().click(); await p.waitForURL(/\/projects$/); await settle();
ok('Beat 1 · front door → Isabelle → the list', p.url().endsWith('/projects'));

// BEAT 2
await p.getByRole('link',{name:/Novara scheduling assistant/}).click();
await until(/assess/); await settle();
const base='http://localhost:3100/projects/'+p.url().split('/projects/')[1].split('/')[0];
const t=await p.locator('body').innerText();
ok('Beat 2 · "Yes · from intake" ×4', (t.match(/Yes · from intake/g)||[]).length===4);
ok('Beat 2 · "Yes · from your answers"', t.includes('Yes · from your answers'));
// Read the sentence out of the run sheet itself, so the sheet is the
// reference and this script cannot drift from it independently.
const sheet = readFileSync(new URL("../demo/three-minutes.md", import.meta.url), "utf8");
const quotedCount = (sheet.match(/> \*\*"(\d+ of the \d+ areas[\s\S]+?)"\*\*/) || [])[1]
  ?.replace(/\n> /g, " ")
  .replace(/\s+/g, " ")
  .trim();
ok(`Beat 2 · the counting sentence, verbatim`, Boolean(quotedCount) && t.replace(/\s+/g, " ").includes(quotedCount));
ok('Beat 2 · the fourth-party derivation, verbatim', t.includes('added because you told us this uses AI and involves a company outside ours, so the model provider behind it is a fourth party'));
ok('Beat 2 · stage chip reads Draft', (await p.locator('.pill-status').innerText())==='Draft');

// BEAT 3
await p.getByRole('link',{name:'Answer the severity questions →'}).click();
ok('Beat 3 · "Answer the severity questions →" navigates', await until(/severity/)); await settle();
await p.getByRole('navigation',{name:'Severity areas'}).getByRole('link',{name:/Third-Party/}).click();
ok('Beat 3 · rail → Third-Party', await until(/third-party/)); await settle();
const before=await p.locator('.owed li').count();
await p.locator('.q2',{hasText:'Level of Provider Access'}).getByText(/Privileged \/ admin access/).first().click();
await p.waitForTimeout(1800);
const after=await p.locator('.owed li').count();
ok(`Beat 3 · one answer → six controls (${before} → ${after})`, before===0 && after===6);
ok('Beat 3 · "What these answers require"', (await p.locator('.owed h2').innerText()).toLowerCase().includes('what these answers require'));

// BEAT 4
await p.goto(base+'/assess/complete'); await settle();
await p.getByRole('link',{name:'Answer the control questions →'}).click();
ok('Beat 4 · "Answer the control questions →" navigates', await until(/objectives/)); await settle();
const card=p.locator('.q3').first();
await card.locator('> .q3-answers').getByRole('radio',{name:'No'}).click(); await p.waitForTimeout(600);
ok('Beat 4 · a No demands the note', (await card.locator('> .q3-note label').innerText())==='What exists today, and what is missing?');
ok('Beat 4 · "Recorded for a reviewer" block', await p.locator('.card',{hasText:'Recorded for a reviewer'}).count()>0);

// BEAT 5
await p.goto(base+'/assess/severity/third-party'); await settle();
const q=p.locator('.q2',{hasText:'Subcontractor Chain Transparency'});
await q.getByRole('button',{name:/leave this to us/i}).click(); await p.waitForTimeout(600);
ok('Beat 5 · flag opens the picker', await q.getByRole('combobox').count()===1);
const opts=await q.locator('option').allInnerTexts();
const tp=opts.find(o=>/Third-Party & Supply Chain/.test(o));
await q.getByRole('combobox').selectOption({label:tp});
await q.getByRole('button',{name:'Hand it over'}).click(); await p.waitForTimeout(1800);
ok('Beat 5 · "Hand it over" records it', (await q.innerText()).includes('WITH') || (await q.innerText()).includes('With'));
await p.goto('http://localhost:3100/'); await settle();
await p.getByText('Samuel Okonkwo').first().click(); await p.waitForURL(/\/projects$/); await settle();
const bell=await p.getByRole('button',{name:/^Alerts/}).getAttribute('aria-label');
ok(`Beat 5 · Samuel's bell (${bell})`, /[1-9]\d* needing action/.test(bell));
await p.getByRole('button',{name:/^Alerts/}).click(); await p.waitForTimeout(600);
ok('Beat 5 · the promise on the band', (await p.locator('body').innerText()).includes("These clear themselves when the work is done — they can’t be dismissed."));

// The run sheet now offers a follow-on: "Sable claims triage is already
// with a reviewer — sign in as Diego Marquez and it opens on his queue."
// A claim the run sheet makes is a claim the product makes (G-56).
await p.goto('http://localhost:3100/'); await settle();
await p.getByText('Diego Marquez').first().click(); await p.waitForURL(/\/projects$/); await settle();
// `.list-row` is the requester's own list; an assessor's queue rows are
// `.queue-row`, and the row states what it needs rather than a status.
// Same drift as the picker name above — the walk was written against a
// page that has since changed, and it is the walk that is wrong.
const sable = p.locator('.queue-row', { hasText: 'Sable claims triage' });
const listed = await sable.innerText();
ok('Follow-on · Sable is on his queue, saying what it needs',
   /control answers need your attestation/.test(listed));
await sable.getByRole('link', { name: 'Attest controls' }).click(); await settle();
ok("Follow-on · it opens on the reviewer's queue", /\/review$/.test(p.url()));
ok('Follow-on · the queue names controls, not codes',
   /Access Review & Recertification/.test(await p.locator('.review-layout').innerText()));
// The queue opens on what needs a person most, which is not necessarily
// the control carrying the finding — so go to that one.
await p.locator('.review-item', { hasText: 'Access Review & Recertification' }).click();
await p.waitForTimeout(500);
ok('Follow-on · a finding is waiting to be settled',
   (await p.getByRole('button', { name: /Settle this finding/ }).count()) > 0);

console.log("\n  page errors:", errs.length ? errs : "none");
await b.close();
reset("rebuilding it again, since the walk answered questions");
if (failures > 0 || errs.length > 0) {
  console.error(`\ndemo/three-minutes.md does not match the product: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nthe run sheet matches the product.");
