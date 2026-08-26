# Skill and agent-instruction file standards

`scripts/validate_skills.py` covers the mechanical rules. This file is the
judgement half — read every `SKILL.md` and apply it.

## Mechanical rules (the validator enforces these)

- Frontmatter present, opened and closed with `---`.
- Keys limited to `name`, `description`, and the optional `license`,
  `allowed-tools`, `metadata`, `compatible-runtimes`, `version`. Anything
  else is rejected by the loader — a skill carrying an extra key is silently
  not what its author thinks it is.
- `name`: kebab-case, ≤64 chars, **identical to its folder name**.
- `description`: ≤1024 chars, no angle brackets.
- Body under ~500 lines; longer belongs in `references/`.
- Every `references/`, `scripts/` or `assets/` path named in the body exists.
- Bundled Python compiles.

## Judgement checks

### The description is the whole retrieval mechanism

A skill is loaded on its description alone. It must say **what it does** and
**when to use it**, in the words the user will actually type.

- ✅ "Build, wire and guard a capability in the agent service… Use when
  adding, changing or reviewing anything the agent does."
- ❌ "Helper for agent work." — names no moment; will never be surfaced.

Test it: read only the description and ask "would I know to load this from a
user saying *'can you look over my repo'*?" If the answer needs the body,
the description is wrong.

### The body is imperative, and says why

Instructions, not description of instructions. And every rule earns its place
by explaining the cost of ignoring it — a rule with no reason gets
rationalized away the first time it is inconvenient.

- ✅ "Never upgrade it to Verified on the strength of reading the code."
- ❌ "It is generally advisable to run tests where possible."

### Scope does not overlap

Two skills that could both fire on the same request will fire
unpredictably. Where scopes touch, one must say which to read first.
→ Read every description; list any pair that a single user sentence would
match. That is a finding.

### Nothing is stale

The highest-value check, because **an agent will follow a stale instruction**
where a human would notice and ask.

- Every command in the body: run it.
- Every path: check it exists.
- Every claim about the repo ("the store lives in `src/lib/repo.ts`"): verify.
- Every reference to a process, phase or date: is it still current? A skill
  carrying an expired notice is a finding.

### It is not a copy of the spec

Law belongs in the spec; procedure belongs in the skill. A skill that
restates requirements will drift from them. Prefer a citation to a copy.

## Agent instruction files

`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `copilot-instructions.md`.

- **Every command works.** Run each one verbatim. A wrong build command in
  `CLAUDE.md` costs every future session.
- **Every path exists.**
- **Every routed skill exists** — and every skill on disk is routed to from
  somewhere. A procedure nobody is told to load is a procedure that does not
  run; a route to a deleted skill is silent.
- **It routes rather than explains.** These files are always resident, so
  length is a real cost. Detail belongs in a skill.
- **It does not contradict the repo.** Stated conventions vs actual code:
  check three.
- **No secrets, no credentials.**

## Reporting

Give the validator output verbatim, then the judgement findings by file. Rate
the set Strong / Adequate / Weak / Absent like any other category. If the repo
has no skills or agent instruction files at all, say so — it is a gap worth
naming, not an absence of findings.
