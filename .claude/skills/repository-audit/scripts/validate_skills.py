#!/usr/bin/env python3
"""Validate every SKILL.md in a repository (repository-audit, Phase 6).

Mechanical checks only — frontmatter shape, name/folder agreement, description
length, bundled paths that do not exist, scripts that do not compile. The
judgement calls live in references/skill-file-standards.md.

    python3 validate_skills.py /path/to/repo

Exit code 0 when nothing is wrong, 1 when any ERROR was reported.
"""
from __future__ import annotations

import argparse
import os
import py_compile
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SKIP_DIRS = {
    ".git", "node_modules", ".next", "dist", "build", "out", "__pycache__",
    ".venv", "venv", "target", "vendor", ".turbo",
    # Agent worktrees are throwaway copies of the repo. Walking them reported
    # every skill twice and called each a name collision — the exact
    # false-positive class this skill tells you to rule out before flagging.
    "worktrees",
}

# The published frontmatter contract. Anything outside this is rejected by the
# loader, so a skill carrying an extra key is silently not what its author
# thinks it is.
ALLOWED_KEYS = {
    "name", "description", "license", "allowed-tools", "metadata",
    "compatible-runtimes", "version",
}
REQUIRED_KEYS = {"name", "description"}

NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MAX_NAME = 64
MAX_DESCRIPTION = 1024
MAX_BODY_LINES = 500
BUNDLE_RE = re.compile(r"(?<![\w/.-])((?:references|scripts|assets)/[\w./-]+)")
WHEN_RE = re.compile(r"\bUse (when|whenever|before|after|for|this)\b", re.I)


class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str]] = []

    def add(self, level: str, where: str, message: str) -> None:
        self.rows.append((level, where, message))

    def errors(self) -> int:
        return sum(1 for level, _, _ in self.rows if level == "ERROR")

    def warnings(self) -> int:
        return sum(1 for level, _, _ in self.rows if level == "WARN")


def find_skills(root: Path) -> list[Path]:
    """Prefer git's view. It already knows what is ignored, which keeps
    generated and throwaway copies of the tree out of the results."""
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z", "--", "*SKILL.md"],
            capture_output=True, timeout=30, check=True,
        ).stdout.decode("utf-8", "replace")
        names = [n for n in out.split("\0") if n.endswith("SKILL.md")]
        if names:
            return sorted(root / n for n in names)
    except (OSError, subprocess.SubprocessError):
        pass

    found: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name == "SKILL.md":
                found.append(Path(dirpath) / name)
    return sorted(found)


def parse_frontmatter(text: str) -> tuple[dict[str, str] | None, str, str | None]:
    """Return (fields, body, error). Deliberately a line parser, not YAML:
    a skill's frontmatter is flat, and requiring PyYAML would make this
    script fail on the machines that most need it."""
    if not text.startswith("---\n"):
        return None, text, "no frontmatter — the file must start with '---'"
    end = text.find("\n---", 3)
    if end == -1:
        return None, text, "frontmatter is never closed with '---'"
    block = text[4:end]
    body = text[end + 4:].lstrip("\n")

    fields: dict[str, str] = {}
    key = None
    for raw in block.splitlines():
        if not raw.strip():
            continue
        if raw[0] not in " \t" and ":" in raw:
            key, _, value = raw.partition(":")
            key = key.strip()
            fields[key] = value.strip()
        elif key:  # folded continuation
            fields[key] = (fields[key] + " " + raw.strip()).strip()
    return fields, body, None


def check_skill(path: Path, root: Path, report: Report) -> None:
    where = str(path.relative_to(root))
    folder = path.parent.name
    try:
        text = path.read_text("utf-8")
    except OSError as exc:
        report.add("ERROR", where, f"cannot read: {exc}")
        return

    fields, body, err = parse_frontmatter(text)
    if err or fields is None:
        report.add("ERROR", where, err or "unparseable frontmatter")
        return

    missing = REQUIRED_KEYS - fields.keys()
    if missing:
        report.add("ERROR", where,
                   f"frontmatter missing required key(s): {', '.join(sorted(missing))}")
    unknown = fields.keys() - ALLOWED_KEYS
    if unknown:
        report.add("ERROR", where,
                   f"frontmatter has key(s) the loader rejects: "
                   f"{', '.join(sorted(unknown))}")

    name = fields.get("name", "")
    if name:
        if not NAME_RE.match(name):
            report.add("ERROR", where,
                       f"name '{name}' is not kebab-case (lowercase, digits, hyphens)")
        if len(name) > MAX_NAME:
            report.add("ERROR", where, f"name is {len(name)} chars (max {MAX_NAME})")
        if name != folder:
            report.add("ERROR", where,
                       f"name '{name}' does not match its folder '{folder}'")

    description = fields.get("description", "")
    if description:
        if len(description) > MAX_DESCRIPTION:
            report.add("ERROR", where,
                       f"description is {len(description)} chars "
                       f"(max {MAX_DESCRIPTION})")
        if "<" in description or ">" in description:
            report.add("ERROR", where,
                       "description contains angle brackets, which break the loader")
        if len(description) < 40:
            report.add("WARN", where,
                       f"description is only {len(description)} chars — too short to "
                       "say both what it does and when to use it")
        if not WHEN_RE.search(description):
            report.add("WARN", where,
                       "description never says WHEN to use the skill "
                       "(no 'Use when…' clause) — it will not get surfaced")

    body_lines = body.count("\n") + 1
    if body_lines > MAX_BODY_LINES:
        report.add("WARN", where,
                   f"body is {body_lines} lines (guide: under {MAX_BODY_LINES}) "
                   "— move detail into references/")
    if body_lines < 5:
        report.add("WARN", where, f"body is only {body_lines} lines — is it finished?")

    # Bundled paths named in the body must exist, or the skill sends the agent
    # to a file that is not there.
    for match in sorted({m.group(1) for m in BUNDLE_RE.finditer(body)}):
        target = path.parent / match
        if not target.exists():
            report.add("ERROR", where,
                       f"body references '{match}', which does not exist")

    # Bundled Python must at least compile.
    scripts_dir = path.parent / "scripts"
    if scripts_dir.is_dir():
        for script in sorted(scripts_dir.rglob("*.py")):
            try:
                with tempfile.NamedTemporaryFile(suffix=".pyc", delete=True) as tmp:
                    py_compile.compile(str(script), cfile=tmp.name, doraise=True)
            except py_compile.PyCompileError as exc:
                report.add("ERROR", str(script.relative_to(root)),
                           f"does not compile: {exc.msg.strip().splitlines()[-1]}")
            if not os.access(script, os.X_OK):
                report.add("WARN", str(script.relative_to(root)),
                           "is not executable (chmod +x) — fine if always run "
                           "via `python3`, worth fixing if the body says ./")


def check_duplicate_names(paths: list[Path], root: Path, report: Report) -> None:
    seen: dict[str, str] = {}
    for path in paths:
        folder = path.parent.name
        where = str(path.relative_to(root))
        if folder in seen:
            report.add("ERROR", where,
                       f"another skill already uses the name '{folder}' "
                       f"({seen[folder]}) — one shadows the other")
        else:
            seen[folder] = where


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("repo", nargs="?", default=".")
    args = ap.parse_args()

    root = Path(args.repo).resolve()
    if not root.is_dir():
        print(f"not a directory: {root}", file=sys.stderr)
        return 2

    skills = find_skills(root)
    report = Report()
    print(f"# Skills validation — {root}\n")
    if not skills:
        print("No SKILL.md files found.")
        return 0

    print(f"{len(skills)} skill(s) found.\n")
    check_duplicate_names(skills, root, report)
    for path in skills:
        check_skill(path, root, report)

    if not report.rows:
        for path in skills:
            print(f"  OK    {path.relative_to(root)}")
        print("\nAll skills pass the mechanical checks. The judgement calls "
              "(overlap, staleness, imperative voice) are in "
              "references/skill-file-standards.md.")
        return 0

    by_file: dict[str, list[tuple[str, str]]] = {}
    for level, where, message in report.rows:
        by_file.setdefault(where, []).append((level, message))
    flagged = set(by_file)
    for path in skills:
        rel = str(path.relative_to(root))
        if rel not in flagged:
            print(f"  OK    {rel}")
    for where in sorted(by_file):
        print(f"\n  {where}")
        for level, message in by_file[where]:
            print(f"    {level:5} {message}")

    print(f"\n{report.errors()} error(s), {report.warnings()} warning(s).")
    print("Mechanical checks only — apply references/skill-file-standards.md "
          "for the rest.")
    return 1 if report.errors() else 0


if __name__ == "__main__":
    raise SystemExit(main())
