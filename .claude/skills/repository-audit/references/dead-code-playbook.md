# Dead-code playbook

Two lists reach the report: **confirmed dead** (you proved nothing references
it) and **suspected dead** (a tool flagged it; you could not confirm). Never
merge them. A wrong "dead" call costs more credibility than ten right ones.

## Tools by language

Run them, capture output, then verify by hand. None is authoritative alone.

| Language | Tools |
|---|---|
| TypeScript / JavaScript | `npx knip`, `npx ts-prune`, `npx depcheck`, `npx madge --circular` |
| Python | `vulture . --min-confidence 80`, `ruff check --select F401,F841`, `deptry .` |
| Go | `go vet ./...`, `staticcheck ./...`, `deadcode ./...` |
| Rust | `cargo +nightly udeps`, `cargo clippy -- -W dead_code` |
| Any | `git log -S<symbol>` to see whether it was ever used |

If a tool cannot be installed, say so in "Not verified" rather than skipping
the category silently.

## The false-positive traps

Check **every** candidate against this list before it reaches the report.
Each one has produced a wrong finding in a real audit.

1. **Framework-convention entry points.** Next.js `app/**/page.tsx`,
   `layout.tsx`, `route.ts`, `middleware.ts`; Django `urls.py` views;
   Rails controllers; Lambda handlers. Nothing imports them; the framework
   finds them by path. **Not dead.**
2. **Dynamic imports and string lookups.** `import(path)`,
   `require(name)`, `getattr(module, name)`, registry objects keyed by
   string, `React.lazy`. → grep for the bare symbol name in string literals.
3. **`package.json` `exports`, `bin`, `main`, `types`.** A published entry
   point has no internal caller by design.
4. **Test fixtures, factories, and seeds** referenced only from test config
   or a CLI script.
5. **Migrations.** Old migrations are never referenced and must never be
   deleted.
6. **Type-only exports** consumed by `import type` — some tools miss these.
7. **Re-exports through a barrel** (`index.ts`) — the tool may flag the
   source while the barrel is what is imported.
8. **Config-driven code** switched on by a value in a YAML/JSON file rather
   than by an import.
9. **Feature-flagged code** that is off today and intended for a named
   future phase. → Ask the owner rather than recommending deletion.
10. **Scripts invoked from CI, Docker, Makefile or package scripts.** → grep
    the filename across `.github/`, `Dockerfile`, `Makefile`,
    `package.json`.

## What the tools miss — check these by hand

- **Environment variables** declared in `.env.example` and never read, or
  read and never declared. (The inventory script reports both.)
- **Prompts, templates and assets** with no reference.
- **Database columns and tables** nothing selects. → grep each column name.
- **Orphan migrations** describing tables that no longer exist in the schema.
- **Feature flags never turned on.** → grep the flag name for a `true`.
- **Commented-out blocks.** (Inventory reports hotspots.) These are always
  deletable — git remembers.
- **Dead branches in live code**: conditions that cannot be true, `enum`
  cases never constructed, error codes never raised.
- **Unused CSS classes** — for a repo with hand-written CSS, cross-reference
  class names in stylesheets against `className` in source.
- **Dependencies in the manifest with no import.**
- **Exported functions used only by their own tests.** Real, and worth
  reporting — but as "used only by tests", not as dead.

## Confirming a candidate

For each one, run and record:

```bash
rg -n --hidden -g '!node_modules' '\bSYMBOL\b' .   # every mention
rg -n "['\"]SYMBOL['\"]" .                          # string-based lookup
git log -S'SYMBOL' --oneline | head                 # was it ever used?
```

Confirmed dead means: the only hits are the definition itself and its own
tests, no string lookup exists, no framework convention applies, and it is
not an exported entry point.

## Reporting

Give a count and a size ("41 exports, ~1,900 lines"), then group by
directory. Recommend deletion in one commit per group so a revert is cheap.
For suspected-dead, say precisely what stopped you confirming.
