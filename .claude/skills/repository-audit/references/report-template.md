# Report template

Copy this structure exactly. Write to `./audit/<YYYY-MM-DD>-repo-audit.md`
and the findings table to `./audit/<YYYY-MM-DD>-findings.csv`.

---

## Severity scale

| Severity | Means | Examples |
|---|---|---|
| **Critical** | Exploitable, data-losing, or actively wrong in production | Secret committed; auth bypass; a requirement the spec calls mandatory is absent; migration that drops data |
| **High** | Will cause an incident or block a release | No tests on the money path; unpinned dependency with a known CVE; a stated requirement that fails when executed |
| **Medium** | Real cost, not yet an incident | Missing type coverage on a boundary; duplicated logic with drift; a gate that cannot fail |
| **Low** | Tidiness and consistency | Naming drift; stale comment; a doc line that is out of date |
| **Info** | Worth knowing, no action implied | A convention the team may not have chosen deliberately |

## Category rating scale

Rate each best-practice category on four points, and back the rating with the
findings underneath it:

- **Strong** — meets or exceeds convention; nothing found worth fixing
- **Adequate** — works; specific gaps listed, none urgent
- **Weak** — gaps that will cost soon; named and prioritized
- **Absent** — the practice is not present at all

## Traceability statuses

Use exactly these five. The distinction between the first two is the whole
point of the audit — do not blur it.

| Status | Means |
|---|---|
| **Verified** | Executed in this session and observed to work. Command and output recorded. |
| **Implemented, not verified here** | Code exists and traces to the requirement, but it could not be executed. **The blocker is named.** |
| **Partial** | Some acceptance criteria met, others not. Say which. |
| **Missing** | No code implements it. |
| **Untestable as written** | The requirement states no observable behavior, so no evidence could settle it. This is a spec finding, not a code finding. |

## Spec bloat rubric

Every call needs evidence — quote the text, name the section. Do not propose
cutting a constraint the spec marks as mandated; raise it as an owner question.

| Bloat type | Test | Evidence required |
|---|---|---|
| **Duplication** | The same behavior is required in two places | Quote both, with sections |
| **Unfalsifiable** | No acceptance criterion, and none can be inferred | Quote it; say what evidence would settle it |
| **Contradiction** | Two requirements cannot both hold | Quote both; describe the case that breaks |
| **Solutioning** | Prescribes an implementation, not a behavior | Quote it; name the behavior underneath |
| **Orphan** | Nothing implements it and nothing plans to | Requirement ID + the search that found nothing |
| **Speculative** | Explicitly for a future phase | Quote the phase marker; recommend moving, not deleting |
| **Restatement** | A section that only re-summarizes another | Both sections; propose which survives |

---

# Audit report structure

```
# <Repository> — engineering audit
<date> · commit <sha> · audited by <who>

## 1. Executive summary
Verdict (one paragraph). The 3–5 things that matter most, ranked.
Requirement tally: N verified · N implemented-not-verified · N partial ·
  N missing · N untestable (of N total).
Dead code: N confirmed, N suspected.
Skills files: pass / N errors.
An executive reader stops here.

## 2. What was audited
Scope, commit, environment, what got full review vs sampling, and what was
deliberately out of scope.

## 3. Requirements traceability matrix
| ID | Requirement (short) | Section | Code | Tests | Status | Evidence |

## 4. Spec audit
Bloat table. Consolidation candidates. Owner questions.

## 5. Engineering practices
One subsection per category with its rating and its findings.

## 6. Dead code
Confirmed dead (proof of no reference). Suspected dead (tool + why unconfirmed).

## 7. Skills and agent instruction files
Validator output. Qualitative findings. Stale instructions.

## 8. Repository structure
Current tree (2 levels). Recommended tree, if changes are warranted.

## 9. Findings
Full table; also written to findings.csv.

## 10. Remediation plan
Ordered by severity and dependency, NOT by discovery order.
Grouped: Now / Next / Later, each with effort.

## 11. Not verified in this audit
Everything not executed, and why. Silence about gaps reads as coverage.

## 12. Questions for the owner
```

## Finding format

Every finding carries all eight fields:

```
### F-012 · High · Security
**Location:** src/app/actions.ts:631
**Evidence:** `ura_person` is set with `httpOnly: false` and no signature
  (line 666). Set in devtools → session becomes that persona; observed in
  this session.
**Why it matters:** Every server-side authority check downstream is correct
  and keys off an identity nobody proved.
**Fix:** Signed session cookie, or SSO at the edge.
**Effort:** M (1–3 days)
```

Effort scale: **S** under a day · **M** 1–3 days · **L** a week or more ·
**XL** needs its own plan.

## findings.csv columns

`id,severity,category,location,summary,evidence,why_it_matters,fix,effort,status`
