# Engineering best-practices checklist

Work the categories in order. For each item: **what good looks like**, then
**how to check it**. Prefer a tool over an opinion — capture the command and
its output, because a rating with no command behind it is an opinion.

Rate each category Strong / Adequate / Weak / Absent (see
`report-template.md`) and list the findings that justify the rating.

---

## 1. Correctness

- **Errors are values, not surprises.** Expected failures return typed
  results; only genuinely exceptional things throw. → Grep `catch` blocks:
  any that swallow silently (`catch {}`, `catch (e) { }`) is a finding.
- **No empty catch, no bare `except:`.** → `grep -rn "catch\s*{\s*}"`,
  `grep -rn "except:"`.
- **Boundaries validate input.** Route handlers, actions, queue consumers and
  webhooks parse before they trust. → Read three of each; note which parse.
- **Concurrency and races.** Read-modify-write on shared rows, missing
  transactions across two writes that must both land. → Search for
  sequential `await` writes that should be one transaction.
- **Time and timezones.** Dates stored with zone; no naive `new Date()`
  comparisons across boundaries.
- **Money never floats.** → `grep` for float arithmetic on currency fields.

## 2. Types

- Strict mode on (`"strict": true`, `mypy --strict`, or equivalent). →
  Read `tsconfig.json` / `pyproject.toml`.
- Escape hatches counted, not assumed absent. → `grep -c "\bany\b"`,
  `@ts-ignore`, `# type: ignore`, `as unknown as`. A rising count is the
  finding, not the absolute number.
- Public boundaries typed even when internals are loose.
- **Run it:** `npx tsc --noEmit` / `mypy .`. Record the exact count.

## 3. Security

- **No secrets in the tree.** → inventory script's screen, plus
  `git log -p --all -S<pattern>` for history, plus a real scanner
  (`gitleaks detect`, `trufflehog`) if installable.
- **Authentication is real.** Sessions signed, cookies `httpOnly` +
  `secure` + `sameSite`, tokens verified server-side. **A cookie a user can
  set by hand is not authentication.** → Read the session module.
- **Authorization checked server-side on the object**, not only on the
  listing. → Pick one protected resource and try to reach it by direct id.
- Injection: parameterized queries, no string-built SQL, no `eval`,
  no `dangerouslySetInnerHTML` on user input. → grep each.
- Dependency CVEs. → `npm audit --production`, `pip-audit`, `cargo audit`.
- Transport and headers: HTTPS assumed, CSP/HSTS where a browser is served.
- PII: what is stored, where it flows, whether it can be deleted. In an
  insert-only design, **say plainly that deletion is impossible** if it is.

## 4. Testing

- Tests exist and **run in this session**. → Run them. Record pass/fail counts.
- Tiers separable: unit / integration / end-to-end runnable independently.
- Tests assert behavior, not implementation. → Read five: do they assert on
  rendered output and return values, or on internal call counts?
- **Tests that cannot fail.** The highest-value check in this whole document:
  look for `expect(x).toBeDefined()` on things always defined, conditional
  assertions (`if (await x.count()) expect(...)`), snapshot-only tests, and
  tests that assert a value the same code computed. → Try breaking the
  implementation and confirm a test goes red.
- Coverage where it matters (auth, money, data) — not a global percentage.
- Fixtures and factories rather than copy-pasted setup.
- Flakiness: is any test retried or skipped? → grep `.skip`, `.only`,
  `retries`.

## 5. Configuration

- One config module; the rest of the code never reads the environment. →
  `grep -rn "process.env\|os.environ" src | grep -v config`.
- Validated at the boundary, failing loudly at startup rather than at
  first use.
- `.env.example` complete and current. → Compare with the inventory script's
  declared-vs-used lists.
- No environment-specific branching scattered through business logic.

## 6. Observability

- Structured logs with a correlation id; errors carry a reference the user
  is shown and the log can be found by.
- Health endpoints that do not depend on the database (`/healthz` liveness,
  `/readyz` readiness). → `curl` both against a stopped database.
- Metrics or traces on the paths that matter; OpenTelemetry if claimed.
- **No secrets, tokens or PII in log lines.** → grep log calls for
  interpolated request objects.

## 7. Dependencies

- Lockfile present, committed, and consistent with the manifest. →
  `npm ci --dry-run` / `pnpm install --frozen-lockfile`.
- Runtime versions pinned (engines, `.nvmrc`, `packageManager`, Docker base
  tag not `latest`).
- Direct dependencies actually used. → `depcheck` / `deptry`.
- Nothing unmaintained on a critical path.

## 8. Style and structure

- Formatter and linter configured **and enforced in CI**, not just present. →
  Run them in check mode; read the CI file.
- Naming consistent within a layer.
- Functions and files within the project's own stated budget, if it has one.
- Duplication: the same rule implemented twice is the defect that matters —
  **a shared predicate is only shared if every caller calls it.** → For each
  "one rule" claim in the docs, grep for callers and for reimplementations.

## 9. Documentation

- README says what it is, how to run it, how to test it — **and the commands
  work.** → Run them verbatim.
- Comments explain **why**, not what.
- Architecture decisions recorded somewhere durable.
- No doc that contradicts the code. → Spot-check every command in every doc.

## 10. CI/CD

- CI exists and runs the same gates a developer runs.
- The pipeline can actually fail — check a recent red run exists, or make one.
- Build is reproducible; artifacts are not committed.
- Deployment is scripted and documented, with a rollback path.

## 11. Performance

- No N+1 queries on list pages. → Read the list endpoint; count queries.
- Indexes on the columns actually filtered and joined.
- Payload sizes bounded; pagination present and honest about truncation.
- Any performance claim in the docs has a measurement behind it.

## 12. AI and LLM features

Apply only if the repo calls a model.

- **Model access is confined** behind one seam, not scattered.
- Prompts are versioned files, not inline literals that drift.
- Outputs are validated before they reach a person or a record.
- **Grounding is verified, not asserted.** If a feature claims verbatim
  quotes, take one output and check the quote against the source by hand.
- Failure is graceful: with no model connected, the product is complete and
  says so, rather than apologising or hanging.
- Cost and latency bounded; retries capped; timeouts set.
- Evals exist and **run**. → Run them; report the numbers, not the intent.
- Nothing a model produced is recorded as a person's answer without an
  explicit human act.
