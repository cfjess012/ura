# Front Door AI Risk Advisor (`ura`) — engineering audit

2026-08-26 · commit `a5f226d` · run with `.claude/skills/repository-audit`

---

## 1. Executive summary

**Verdict: structurally strong, production-blocked on one thing.** This is an
unusually well-disciplined codebase — strict types with almost no escape
hatches, invariants enforced in the schema rather than in UI code, pure logic
genuinely separated from executors, and a governance log that records why
decisions were made. The gate chain is real and it passes: **740 unit + 51
integration + 72 agent tests green in this session**. Most audits of a
codebase this size find correctness problems. This one does not.

What it finds instead is a gap between **what the specification says is
enforced and what is actually enforced**, and one hard production blocker.

**The five that matter:**

1. **There is no authentication** (F-01, Critical). The identity cookie is
   unsigned and `httpOnly: false`. Anyone can become any persona, including
   the administrator. Every downstream authority check is correct and keys off
   an identity nobody proved. Acknowledged in §12 and scheduled for Phase 3 —
   which is fine for a sandbox and is the single thing standing between the
   deploy and production.
2. **14 high-severity dependency advisories** (F-02, High), most requiring
   Next ≥ 15.5.x — which conflicts with the deliberate, measured 15.3 pin
   (G-58). A real trade-off, not an oversight, but it needs a decision.
3. **CI never runs the end-to-end suite** (F-03, High). The tier that proves
   journeys work runs only on a developer's laptop.
4. **No linter and no formatter exist anywhere** (F-04, High) under a spec
   that opens with a clean-code charter.
5. **§11 asserts mechanical enforcement that does not exist** (F-05, Medium).
   "File budgets enforced mechanically (≤400 / hard 800)" and "an
   unused-export gate keeps it dead" are written in the present tense; neither
   gate exists, and `assistant.css` is **4,772 lines — six times the stated
   hard ceiling**.

**Requirement tally (69 in the §20 register):**

| Status | Count | |
|---|---:|---|
| Verified | **44** | slice DONE and exercised by a tier that ran green in this session |
| Implemented, not verified here | **13** | code traces to it; no test or record I could execute names it |
| Partial | **8** | S4.5 reference data, FR-21, and NFR-6 (see F-05) |
| Missing | **4** | FR-26, FR-27, FR-34, NFR-20 — slices not built, matching §17 |

*Method, stated because it changes how much the numbers are worth:* derived by
script (`audit/tally.txt`) from slice status plus whether any test, e2e spec or
UAT record names the requirement ID. **Two hand corrections were needed after
checking the machine's output** — S6's status string "DONE · FR-21 partial"
filed FR-12 and FR-13 as partial when only FR-21 is, and NFR-6 was filed
Verified because a UAT record names it, when its two stated gates do not
actually exist. A record naming a requirement is not the requirement being
enforced.

**Dead code:** 2 confirmed (~77 lines), 1 owner question, 23 tool candidates
disproved by hand.
**Skills files:** 13 of 13 pass the mechanical checks. One carries an expiring
notice (F-08).

---

## 2. What was audited

- **Repository:** `~/Desktop/ura`, branch `main`, commit `a5f226d`, clean tree.
- **Size:** 335 tracked files, 71,466 lines. TypeScript 39,496 · CSS 8,930 ·
  Markdown 7,890 · JavaScript 3,305 · SQL 1,032.
- **Full review:** `src/`, `test/`, `e2e/`, `.claude/`, `SPEC.md`,
  `CLAUDE.md`, `package.json`, CI, `deploy/`, `scripts/hooks/`.
- **Sampled:** `agent/` (its own workspace — tests run, source read at the
  seam boundary only), `drizzle/` (30 migrations — applied by the integration
  suite, not read individually), `src/data/` (instrument seed data, ~3,400
  lines of JSON, structure checked not content).
- **Out of scope:** the shelved `~/Desktop/riskassess` parts-shelf repo.

---

## 3. Requirements traceability

The register in §20 carries 69 requirements. Full matrix in
`audit/traceability.txt`; the summary and the one real finding:

**Verified by execution.** The whole S1–S9 journey is exercised end to end by
the Playwright suite and the integration invariants: intake with conditional
reveals, gates closing categories, path derivation, severity with derived
bands, control accumulation, Tier-3 with required notes, submission with named
gaps and a declaration, attestation with server-side authority, four
dispositions with four-eyes and expiry, and packaging to a replayable export.

**Correctly absent.** FR-26, FR-27 and NFR-20 have no code and no tests. This
matches §17 — S3.5 is "SPEC'd, not built". Consistency, not a defect.

**The finding (F-07):** 27 of 69 requirements are not cited by ID in any test.
**This is a tagging gap, not a coverage gap** — I checked eight of the worst by
hand and every one had real, untagged coverage:

| Requirement | Cited by ID | Actually covered by |
|---|---|---|
| FR-38 reviewer rubric ordering | no | `test/unit/queue-view.test.ts` |
| FR-25 three roles | no | `e2e/personas.spec.ts` + 21 others |
| FR-24 agent inventory page | no | `test/unit/agent-map.test.ts` |
| FR-44 assistant proposes on screen | no | `test/unit/whats-on-screen.test.ts` |
| NFR-14 pure logic separated | no | `test/unit/architecture.test.ts` §26.1 |
| NFR-16 config read in one place | no | `test/unit/architecture.test.ts` §26.3 |

The cost is not risk today — it is that the register cannot be checked
mechanically, so a requirement that *does* lose its coverage will go unnoticed.

---

## 4. Spec audit

`SPEC.md` is the canonical spec and the repo treats it as such (§0 Build
Rules, and three tests assert code against it). Two other spec-shaped
documents exist — `deploy/architecture.md` and `docs/spec-delta-reference-data.md`
— and both are scoped addenda, not rivals. **No consolidation needed.**

This spec is leaner than its 132 KB suggests: §13 (governance log) and the
§20 register are append-only by design, and `test/unit/docs.test.ts` already
excludes them from its length guard for exactly that reason. **One bloat
finding only:**

| Type | Where | Evidence |
|---|---|---|
| **Contradiction** | §11 vs §20 | §11: "File budgets enforced **mechanically** (components ≤ 400 lines; hard ceiling 800)" and "an unused-export gate keeps it dead" — present tense, asserted as fact. §20 NFR-6: "Every slice; **gate on from S10**" — future tense. S10 is not started. Neither gate exists, and `src/app/styles/assistant.css` is 4,772 lines. |

Everything else in §11 is enforced by a real test:
"no parallel implementations" → `architecture.test.ts` §3.3;
"comments state constraints" → observed throughout;
"anything derivable from data is generated" → `agent-map.test.ts`.

---

## 5. Engineering practices

| Category | Rating | Basis |
|---|---|---|
| Correctness | **Strong** | Zero empty catches across `src/` and `agent/src/`. Failures are typed values (`src/lib/errors.ts`), not exceptions. Invariants are schema CHECKs and triggers, not application code — proven when the database refused a `DELETE` during this audit. |
| Types | **Strong** | `strict: true`. In 39k lines of TypeScript: **0** `@ts-ignore`, **5** `: any`, 29 `as unknown as`, 85 non-null assertions. `pnpm typecheck` clean. |
| Security | **Weak** | F-01 auth. F-02 advisories. Cookie has no `secure` flag. Positives: no secrets tracked (`.env` untracked; `git log -S` over the full history finds none), object-level authorization via `openProject`, no raw SQL string building, parameterized queries throughout. |
| Testing | **Adequate** | 740 unit + 51 integration + 72 agent + 73 e2e — all executed in this session, all green (`audit/e2e.log`: `73 passed (8.0m)`). Tiers separable. Tests assert rendered DOM (NFR-7). Held back from Strong only by F-03. Notably: this repo has repeatedly *found and fixed* tests that could not fail — the failure mode most codebases never look for. |
| Configuration | **Strong** | One config module, enforced by a test that greps for `process.env` outside it. `.env.example` complete: zero declared-but-unused, and the "used but undeclared" list is entirely agent-service and test-fixture variables. |
| Observability | **Adequate** | `/healthz` and `/readyz` exist and were verified against a dead database (per `deploy/READINESS.md`). Errors carry a user-visible reference tied to a log. OpenTelemetry in the agent service. No metrics on the web tier. |
| Dependencies | **Weak** | 32 advisories, 14 high (F-02). Lockfiles committed for both workspaces. Runtime pinned (`packageManager`, engines). |
| Style | **Weak** | F-04: no linter, no formatter, no `lint` script. F-05: budgets breached, nothing measuring. |
| Documentation | **Strong** | Every `pnpm` command in README and CLAUDE.md exists. **Every file path named in CLAUDE.md resolves.** Comments state constraints and cite the defect that caused them. |
| CI/CD | **Weak** | F-03: no e2e, no lint. CI runs typecheck + unit + integration + agent tests on both workspaces. Deploy is scripted and documented but has never been run. |
| Performance | **Not verified** | NFR-4 (single-digit-millisecond recompute) is scheduled for re-proof at S10 and was not measured here. |
| AI / LLM | **Adequate** | Model access confined to one seam, asserted by `agent-seam.test.ts`. Prompts are versioned files. 72 agent tests pass against fabricated replies. Absent-not-apologetic degradation verified by `ai-surfaces.spec.ts`. **Grounding of verbatim quotes was not re-verified against sources in this audit.** |

---

## 6. Dead code

Tooling: `knip@5` (unconfigured), plus manual confirmation per the playbook.
**23 of knip's 25 flagged files were disproved by hand** — worth stating,
because acting on the raw output would have deleted a working service.

**Confirmed dead** (nothing references it; checked for dynamic imports, string
lookups, framework conventions, and `git log -S`):

| Item | Size | Evidence |
|---|---|---|
| `src/app/person-switcher.tsx` | 61 lines | Zero importers. `git log -S PersonSwitcher` shows it was replaced by the app bar at `db6aa04` and never deleted. |
| `switchPerson` in `src/app/actions.ts:634` | 8 lines | Its only caller was the above. A dead server action. |
| `.repro.mjs` | 16 lines | Tracked since `6b25e6e`, referenced nowhere. `.gitignore` covers `.verify-*`, `.diag*` and `.chip-*` but not `.repro*`. |

**Owner question, not dead:** `src/lib/attachments.ts` is unreferenced, but
S4.6 is blocked on §3.6 (attachment retention, unwritten). Retained for a
blocked slice — confirm before removing.

**Disproved false positives**, each checked: `agent/src/*` and `agent/test/*`
(separate workspace with its own entry point and 72 passing tests);
`scripts/hooks/*.mjs` (wired in `.claude/settings.json`); `scripts/lib/*`
(4 references). knip's flat list of ~60 "unused" exported types is an artifact
of running it unconfigured against `import type` — **not reportable**. If you
want a standing gate, it needs a `knip.json` first.

---

## 7. Skills and agent instruction files

`validate_skills.py` — **13 of 13 pass.** Names match folders, frontmatter
keys are legal, descriptions carry a "Use when" clause, bundled paths resolve.

`CLAUDE.md` — verified line by line against the repo. Every `pnpm` command
exists; every file path resolves; every routed skill exists and every skill on
disk is routed to (this is enforced by `docs.test.ts`, in both directions,
after that test was found to be a tautology and repaired). It is a router, not
a manual: 94 lines against its own 105 budget.

**One finding (F-08):** `.claude/skills/verify/SKILL.md` opens with a
DEMO PUSH banner instructing every session to suspend the gate chain — and it
expires **today**. The governance entry behind it (G-70) carries the same
date. An expired instruction that tells an agent to skip testing is the most
expensive kind of stale.

---

## 8. Repository structure

Clean, conventional, and matching what the spec implies.

```
src/lib/     pure rules — no framework, no driver, no env
src/app/     Next App Router; server actions at the top level
src/data/    the instrument as versioned seed data
test/unit    test/integration    e2e/          three separable tiers
drizzle/     30 plain-SQL migrations
agent/       the agent service — its own workspace, image and tests
.claude/     skills, agents, hooks
uat/ audits/ demo/ deploy/ docs/               records and runbooks
```

**Verified:** no database driver import anywhere under `src/app` — business
logic genuinely does not live in the UI layer. Lockfiles present for both
workspaces. No build artifacts committed. Tests separated consistently.

**Minor (F-10):** no `LICENSE`, no `CONTRIBUTING.md`.

**Over the stated budget** (nothing measures this — see F-05):
`assistant.css` 4,772 · `assistant.tsx` 1,126 · `section-form.tsx` 1,119 ·
`assess.css` 939 · `review.css` 735 · `actions.ts` 668 · `review-queue.tsx` 667.

---

## 9. Findings

| ID | Sev | Category | Location | Summary | Effort |
|---|---|---|---|---|---|
| F-01 | Critical | Security | `src/lib/current-person.ts:24`, `src/app/actions.ts:642,666` | Identity cookie unsigned and `httpOnly: false` — anyone can assume any persona, including admin | M |
| F-02 | High | Dependencies | `package.json` | 32 advisories, 14 high; most need Next ≥15.5.x, conflicting with the measured G-58 pin at 15.3 | M |
| F-03 | High | CI/CD | `.github/workflows/ci.yml` | CI never runs the e2e suite; the tier that proves journeys runs only locally | S |
| F-04 | High | Style | repo root | No linter, no formatter, no `lint` script anywhere | S |
| F-05 | Medium | Spec | `SPEC.md` §11 vs §20 | §11 asserts mechanical file-budget and unused-export gates in the present tense; neither exists; `assistant.css` is 6× the stated cap | M |
| F-06 | Medium | Dead code | `src/app/person-switcher.tsx`, `src/app/actions.ts:634` | Orphaned at `db6aa04`, never deleted — contradicts §11 | S |
| F-07 | Medium | Traceability | `SPEC.md` §20 | 27 of 69 requirements cited by no test; coverage exists but the register cannot be checked mechanically | M |
| F-08 | Medium | Documentation | `.claude/skills/verify/SKILL.md:6` | DEMO PUSH banner telling sessions to skip the gate chain expires today | S |
| F-09 | Low | Dead code | `.repro.mjs` | Tracked throwaway, referenced nowhere; `.gitignore` misses the `.repro*` pattern | S |
| F-10 | Low | Structure | repo root | No `LICENSE`, no `CONTRIBUTING.md` | S |
| F-11 | Info | Dead code | `src/lib/attachments.ts` | Unreferenced; S4.6 is blocked on §3.6 — confirm it is deliberately retained | — |

Effort: **S** under a day · **M** 1–3 days · **L** a week+ · **XL** own plan.

---

## 10. Remediation plan

Ordered by severity and dependency, not by discovery.

**Now — before anything ships to production**

1. **F-01 authentication.** Signed session cookie at minimum; SSO at the edge
   properly. Nothing else on this list is close in consequence. Until it
   lands, treat any deployment as sandbox-only with synthetic data. **M**
2. **F-02 dependency advisories.** Decide the Next question explicitly:
   re-test 15.5.x against `pnpm demo:prod` and the walk (G-58 measured 3 of 15
   clicks failing; that may be fixed by now), or record the acceptance with an
   expiry the way §4.3 already does for risk acceptances. **M**
3. **F-08 the expired banner.** One-line deletion; it is instructing sessions
   to skip testing right now. **S**

**Next — before the next slice is called done**

4. **F-03 e2e in CI.** The suite already runs headless in 8 minutes and needs
   only a Postgres service and `E2E_DATABASE_URL`. **S**
5. **F-04 linter and formatter.** ESLint with `next/core-web-vitals` plus
   Prettier in check mode, wired into CI alongside typecheck. **S**
6. **F-06 / F-09 delete the dead code.** One commit; git remembers. Add
   `.repro*` to `.gitignore`. **S**
7. **F-05 resolve the contradiction.** Either build the file-budget test — it
   is about fifteen lines, derived from the tree, in the style
   `architecture.test.ts` already uses — or change §11 to future tense and let
   §20's "gate on from S10" stand alone. **Building it is the better trade**:
   the repo's own hard-won rule is that what nobody writes down mechanically
   is invisible to both the suite and the verifier (G-37, G-56, G-60, G-65),
   and there is already a file six times over the cap to prove it. **M**

**Later — with S10**

8. **F-07 traceability.** Adopt a convention that every test naming a
   requirement cites its ID, and add a test asserting every `FR-`/`NFR-` in
   §20 is cited somewhere. That turns the register into something a machine
   can check. **M**
9. **F-10** `LICENSE` and `CONTRIBUTING.md`. **S**
10. **NFR-4** performance re-proof, already scheduled for S10.

---

## 11. Not verified in this audit

Silence about gaps reads as coverage, so:

- **The AWS deployment.** No stack has been created, no image built. Per
  `deploy/READINESS.md` this is known: "ready to deploy, never deployed."
- **Bedrock.** The provider seam is proven against an API-compatible local
  model, which proves the seam and not the model grant.
- **NFR-4 recompute performance.** Not measured. Scheduled for S10.
- **AI grounding.** The gates and the abstention logic are tested against
  fabricated replies (72 tests). I did **not** take a live model output and
  check a verbatim quote against its source document in this session.
- **Colour contrast ratios and screen-reader announcement.** Markup was
  checked (`role`, `aria-*`); nothing was measured with a contrast tool or
  heard with VoiceOver. `uat/S9.md` records the same gap.
- **`drizzle/` migrations individually.** They are applied in order by the
  integration suite on every run, which is stronger evidence than reading
  them, but no migration was read line by line.
- **`src/data/` instrument content.** Structure checked; the 51 control
  objectives and 26 severity questions were not reviewed for correctness —
  that is an instrument review, not an engineering audit.
- **A real secrets scanner.** `gitleaks`/`trufflehog` were not installed. The
  screen used was pattern-based over the working tree plus `git log -S` over
  full history for the one high-signal pattern.
- **`pnpm walk:demo`.** Not run: it drops and rebuilds the development
  database, which would have destroyed the owner's working data.

---

## 12. Questions for the owner

1. **Is `src/lib/attachments.ts` deliberately retained** for S4.6, or should
   it go with the other dead code?
2. **Next 15.3 pin** — is re-testing 15.5.x worth a day, or do you want the
   advisories formally accepted with an expiry?
3. **Does the demo-readiness gate survive** the pivot to production? It is the
   only mechanism in the repo that asks whether a person has actually used a
   feature before it is called done, and it is currently worded for a demo.
4. **When does "production" mean real assessment data?** That date is the
   deadline for F-01, and nothing else on this list depends on it.
