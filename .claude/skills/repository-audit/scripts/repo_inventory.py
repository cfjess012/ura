#!/usr/bin/env python3
"""Inventory a repository for the repository-audit skill.

Fast, dependency-free, read-only. Everything it reports is a fact about the
tree; nothing here is a judgement. The audit turns these into findings.

    python3 repo_inventory.py /path/to/repo [--json audit/inventory.json]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

# Directories that are never source. Kept explicit so the report can say what
# was skipped rather than quietly excluding half the tree.
SKIP_DIRS = {
    ".git", "node_modules", ".next", ".nuxt", "dist", "build", "out",
    "target", "vendor", "__pycache__", ".venv", "venv", ".tox", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", "coverage", ".turbo", ".svelte-kit",
    ".gradle", ".idea", ".vscode", "Pods", ".terraform", ".serverless",
}

LANGS = {
    ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript",
    ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".py": "Python", ".go": "Go", ".rs": "Rust", ".rb": "Ruby",
    ".java": "Java", ".kt": "Kotlin", ".swift": "Swift", ".cs": "C#",
    ".php": "PHP", ".c": "C", ".h": "C/C++ header", ".cc": "C++",
    ".cpp": "C++", ".sql": "SQL", ".sh": "Shell", ".bash": "Shell",
    ".css": "CSS", ".scss": "SCSS", ".html": "HTML", ".md": "Markdown",
    ".json": "JSON", ".yml": "YAML", ".yaml": "YAML", ".toml": "TOML",
}

MANIFESTS = [
    "package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock",
    "bun.lockb", "pyproject.toml", "requirements.txt", "poetry.lock",
    "uv.lock", "Pipfile", "Pipfile.lock", "go.mod", "go.sum", "Cargo.toml",
    "Cargo.lock", "Gemfile", "Gemfile.lock", "pom.xml", "build.gradle",
    "build.gradle.kts", "composer.json", "composer.lock",
]

LOCKFILES = {
    "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb",
    "poetry.lock", "uv.lock", "Pipfile.lock", "Cargo.lock", "Gemfile.lock",
    "go.sum", "composer.lock",
}

SPEC_PAT = re.compile(
    r"^(spec|specification|requirements?|prd|design|architecture|rfc)",
    re.I,
)

CONTAINER_PAT = re.compile(
    r"^(dockerfile|docker-compose|compose)|\.(tf|tfvars)$|^(serverless|"
    r"template)\.(yml|yaml)$|^(cloudformation|infra)",
    re.I,
)

TEST_PAT = re.compile(r"(^|/)(tests?|__tests__|spec|e2e|integration)(/|$)|"
                      r"\.(test|spec)\.[jt]sx?$|^test_.*\.py$|_test\.(py|go)$")

AGENT_FILES = {
    "claude.md", "agents.md", "agent.md", ".cursorrules", "copilot-instructions.md",
    "gemini.md", ".windsurfrules", "conventions.md",
}

# Deliberately conservative: high-entropy strings alone produce noise. These
# are shapes that are almost never anything else.
SECRET_PAT = re.compile(
    r"(sk-ant-api[0-9]{2}-[A-Za-z0-9_\-]{20,}"
    r"|sk-[A-Za-z0-9]{32,}"
    r"|gh[pousr]_[A-Za-z0-9]{30,}"
    r"|AKIA[0-9A-Z]{16}"
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----"
    r"|xox[baprs]-[A-Za-z0-9-]{10,}"
    r"|AIza[0-9A-Za-z_\-]{35})"
)

# An assignment to something named like a credential, with a value that is not
# obviously a placeholder.
ASSIGN_PAT = re.compile(
    r"""(?i)\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY)"""
    r"""[A-Z0-9_]*)\s*[:=]\s*["']([^"'\n]{8,})["']"""
)
PLACEHOLDER = re.compile(
    r"(?i)^(x{3,}|your[-_ ]|<|\$\{|placeholder|changeme|example|todo|test|"
    r"dummy|fake|redacted|\.\.\.|sk-\.\.\.|\*+$)"
)

TODO_PAT = re.compile(r"\b(TODO|FIXME|HACK|XXX|BUG)\b")
ENV_DECL_PAT = re.compile(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*=", re.M)
ENV_USE_PAT = re.compile(
    r"process\.env\.([A-Z][A-Z0-9_]{2,})"
    r"|process\.env\[[\"']([A-Z][A-Z0-9_]{2,})[\"']\]"
    r"|os\.environ(?:\.get)?[\[(][\"']([A-Z][A-Z0-9_]{2,})[\"']"
    r"|os\.getenv\([\"']([A-Z][A-Z0-9_]{2,})[\"']"
)
COMMENT_CODE_PAT = re.compile(
    r"^\s*(?://|#)\s*(?:if|for|while|return|import|from|const|let|var|def|"
    r"class|function|async|await|public|private)\b"
)

BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
    ".tar", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".mov", ".mp3",
    ".wasm", ".so", ".dylib", ".dll", ".class", ".jar", ".lockb", ".db",
    ".sqlite", ".sqlite3", ".pyc", ".node",
}

LARGE_FILE_BYTES = 100 * 1024
LARGE_SOURCE_LINES = 500


def tracked_files(root: Path) -> list[Path] | None:
    """Prefer git's own view — it already knows what is ignored."""
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z"],
            capture_output=True, timeout=30, check=True,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    names = [n for n in out.decode("utf-8", "replace").split("\0") if n]
    return [root / n for n in names] or None


def walk_files(root: Path) -> list[Path]:
    found: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            found.append(Path(dirpath) / name)
    return found


def read_text(path: Path) -> str | None:
    if path.suffix.lower() in BINARY_EXT:
        return None
    try:
        if path.stat().st_size > 2 * 1024 * 1024:
            return None
        return path.read_text("utf-8", errors="replace")
    except OSError:
        return None


def inventory(root: Path) -> dict:
    root = root.resolve()
    files = tracked_files(root)
    source = "git ls-files" if files else "filesystem walk"
    if files is None:
        files = walk_files(root)
    files = [f for f in files if f.is_file()
             and not any(p in SKIP_DIRS for p in f.relative_to(root).parts[:-1])]

    rel = lambda p: str(p.relative_to(root))  # noqa: E731

    langs: Counter[str] = Counter()
    lang_files: Counter[str] = Counter()
    todos: list[dict] = []
    commented: Counter[str] = Counter()
    large: list[dict] = []
    secrets: list[dict] = []
    env_used: dict[str, list[str]] = defaultdict(list)
    tests: list[str] = []
    skills: list[str] = []
    agent_docs: list[str] = []
    specs: list[str] = []
    manifests: list[str] = []
    containers: list[str] = []
    ci: list[str] = []
    total_lines = 0

    for path in sorted(files):
        r = rel(path)
        name = path.name
        low = name.lower()

        if name in MANIFESTS:
            manifests.append(r)
        if SPEC_PAT.match(low) and path.suffix.lower() in {".md", ".txt", ".rst"}:
            specs.append(r)
        if low == "skill.md":
            skills.append(r)
        if low in AGENT_FILES:
            agent_docs.append(r)
        if CONTAINER_PAT.search(low):
            containers.append(r)
        if r.startswith((".github/workflows/", ".gitlab-ci", ".circleci/")) or \
                low in {"azure-pipelines.yml", "jenkinsfile", ".travis.yml", "buildspec.yml"}:
            ci.append(r)
        if TEST_PAT.search(r):
            tests.append(r)

        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size > LARGE_FILE_BYTES and name not in LOCKFILES:
            large.append({"path": r, "bytes": size})

        text = read_text(path)
        if text is None:
            continue
        lines = text.count("\n") + 1
        lang = LANGS.get(path.suffix.lower())
        if lang:
            langs[lang] += lines
            lang_files[lang] += 1
            total_lines += lines
            if lines > LARGE_SOURCE_LINES and lang not in {"JSON", "Markdown", "YAML"}:
                large.append({"path": r, "lines": lines})

        n_comment_code = 0
        for i, line in enumerate(text.splitlines(), 1):
            if TODO_PAT.search(line):
                todos.append({"path": r, "line": i, "text": line.strip()[:160]})
            if COMMENT_CODE_PAT.match(line):
                n_comment_code += 1
        if n_comment_code >= 3:
            commented[r] = n_comment_code

        for m in SECRET_PAT.finditer(text):
            secrets.append({"path": r, "kind": "pattern",
                            "match": m.group(0)[:12] + "…"})
        for m in ASSIGN_PAT.finditer(text):
            if not PLACEHOLDER.match(m.group(2)):
                secrets.append({"path": r, "kind": "assignment",
                                "match": m.group(1)})

        for m in ENV_USE_PAT.finditer(text):
            var = next(g for g in m.groups() if g)
            if r not in env_used[var]:
                env_used[var].append(r)

    env_declared: dict[str, list[str]] = defaultdict(list)
    for candidate in (".env.example", ".env.sample", ".env.template", ".env.dist"):
        p = root / candidate
        if p.exists():
            text = read_text(p) or ""
            for m in ENV_DECL_PAT.finditer(text):
                env_declared[m.group(1)].append(candidate)

    committed_artifacts = [
        rel(p) for p in files
        if any(part in {"dist", "build", "out", ".next", "coverage"}
               for part in p.relative_to(root).parts)
    ]

    essential = {
        name: any(f.name.lower() == name for f in files)
        for name in ("readme.md", "license", "contributing.md", ".gitignore",
                     ".env.example")
    }

    return {
        "root": str(root),
        "file_source": source,
        "file_count": len(files),
        "total_source_lines": total_lines,
        "languages": [
            {"language": k, "lines": v, "files": lang_files[k]}
            for k, v in langs.most_common()
        ],
        "manifests": manifests,
        "lockfiles": [m for m in manifests if Path(m).name in LOCKFILES],
        "spec_candidates": specs,
        "skills": skills,
        "agent_instruction_files": agent_docs,
        "tests": {"count": len(tests), "paths": tests[:200]},
        "ci": ci,
        "container_and_infra": containers,
        "env": {
            "declared_not_used": sorted(set(env_declared) - set(env_used)),
            "used_not_declared": sorted(set(env_used) - set(env_declared)),
            "used": {k: v for k, v in sorted(env_used.items())},
        },
        "todos": {"count": len(todos), "items": todos[:200]},
        "commented_out_hotspots": [
            {"path": k, "lines": v} for k, v in commented.most_common(30)
        ],
        "large_files": sorted(
            large, key=lambda d: d.get("bytes", 0) + d.get("lines", 0) * 80,
            reverse=True)[:40],
        "possible_secrets": secrets[:100],
        "committed_build_artifacts": committed_artifacts[:100],
        "essential_files": essential,
    }


def render(inv: dict) -> str:
    L: list[str] = []
    add = L.append
    add(f"# Inventory — {inv['root']}")
    add(f"\n{inv['file_count']} files ({inv['file_source']}), "
        f"{inv['total_source_lines']:,} lines of source.\n")

    add("## Languages\n")
    for row in inv["languages"][:12]:
        add(f"- {row['language']}: {row['lines']:,} lines in {row['files']} files")

    def section(title: str, items, empty="none"):
        add(f"\n## {title}\n")
        if not items:
            add(f"- {empty}")
            return
        for i in items[:25]:
            add(f"- {i}")
        if len(items) > 25:
            add(f"- …and {len(items) - 25} more")

    section("Manifests and lockfiles", inv["manifests"])
    section("Spec candidates", inv["spec_candidates"],
            "NONE FOUND — no spec to audit; ask the owner")
    section("Skills files", inv["skills"])
    section("Agent instruction files", inv["agent_instruction_files"])
    section("CI configuration", inv["ci"], "NONE — no CI is a finding")
    section("Container and infrastructure", inv["container_and_infra"])

    add(f"\n## Tests\n\n- {inv['tests']['count']} test files")
    if not inv["tests"]["count"]:
        add("- NONE FOUND — this is a finding")

    add("\n## Environment variables\n")
    e = inv["env"]
    add(f"- declared in .env.example but never read: "
        f"{', '.join(e['declared_not_used']) or 'none'}")
    add(f"- read in code but never declared: "
        f"{', '.join(e['used_not_declared']) or 'none'}")

    add(f"\n## TODO / FIXME\n\n- {inv['todos']['count']} markers")
    for t in inv["todos"]["items"][:10]:
        add(f"  - {t['path']}:{t['line']} — {t['text']}")

    section("Commented-out code hotspots",
            [f"{h['path']} ({h['lines']} lines)"
             for h in inv["commented_out_hotspots"]])
    section("Large files",
            [f"{f['path']} ({f.get('lines', 0)} lines)" if "lines" in f
             else f"{f['path']} ({f['bytes'] // 1024} KB)"
             for f in inv["large_files"]])
    section("Committed build artifacts", inv["committed_build_artifacts"])

    add("\n## Possible secrets\n")
    if not inv["possible_secrets"]:
        add("- none matched. This is a screen, not a guarantee — "
            "run a real secrets scanner too.")
    else:
        add("- VERIFY EACH BY HAND before reporting; placeholders are common.")
        for s in inv["possible_secrets"][:20]:
            add(f"  - {s['path']} — {s['kind']}: {s['match']}")

    add("\n## Essential files\n")
    for name, present in inv["essential_files"].items():
        add(f"- {name}: {'present' if present else 'MISSING'}")
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("repo", nargs="?", default=".")
    ap.add_argument("--json", metavar="PATH", help="also write raw JSON here")
    args = ap.parse_args()

    root = Path(args.repo)
    if not root.is_dir():
        print(f"not a directory: {root}", file=sys.stderr)
        return 2

    inv = inventory(root)
    print(render(inv))
    if args.json:
        out = Path(args.json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(inv, indent=2) + "\n")
        print(f"\nJSON written to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
