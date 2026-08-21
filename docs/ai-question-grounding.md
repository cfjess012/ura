---
purpose: Grounding record for the AI-domain assessment questions (S3)
researched: 2026-08-21, four parallel researchers, each verifying against the
  PRIMARY source document (nvlpubs.nist.gov PDFs, EU AI Act text, ISO preview
  PDFs, OWASP canonical GitHub) — not summaries or memory
---

# Where the AI questions come from

The instrument's AI-domain questions were revised against the four canonical
sources below. This file is the receipt: every question the sources say a
deployer should ask, with its exact citation, and how it landed in our
instrument. When someone asks "says who?" in the room, the answer is a line
in this file.

## How the research landed in the instrument

| Instrument item | What changed | Grounding |
|---|---|---|
| `T2-AI-DEC-1` AI-Influenced Decisioning | Kept verbatim; now routes two new controls, and Medium/High in an employment context surfaces the EU high-risk callout | NIST MAP 1.1 · EU AI Act Annex III 4(b) + Art. 26 · ISO 42001 A.5.4 |
| `T2-AI-RET-1` Retention → **Retention & Training Use** | Reworded: training/improvement use by vendor **or its model provider** is now explicit in the question and anchors; routes the contract-clause control | OWASP LLM02:2025 · NIST AI 600-1 GV-6.1-004 · ISO 42001 A.7.2/A.10.3 |
| `T2-AI-RAG-1` RAG breadth | Kept verbatim; grounded | OWASP LLM01/LLM08:2025 · NIST MP-4.1-001 |
| `T2-EC-FB-1` → **Fairness & Bias Measurement** | Reworded from impact ("could decisions affect individuals" — overlapped AI-DEC) to measurement ("have outcomes been checked across groups"); promoted into the AI flow for employment scenarios | NIST MEASURE 2.11 + MS-2.11-002 · ISO 23894 fairness · EU Art. 26(4)-(5) |
| `T2-TPR-4P-1/2` Fourth party | Kept verbatim; framed as the AI supply chain (embedded foundation model) | OWASP LLM03:2025 · NIST GV-6.1-009 + §2.12 · EU Art. 50 + Ch. V |
| `T3-AI-12` **NEW** Worker AI Notification & Appeal | New control: workers and representatives informed before service; appeal channel | EU Art. 26(7) · NIST MEASURE 3.3 |
| `T3-AI-13` **NEW** Vendor AI Documentation | New control: instructions for use / model & system cards obtained and reviewed | EU Art. 13 · NIST MEASURE 2.5 + MG-3.1-005 · ISO A.8.2 |
| `T3-AI-03` Bias & Fairness Evaluation | Named (was a bare id in routing) | NIST MS-2.11-002 |
| `T3-TPR-01` DPA | Renamed to include **AI data-use / no-training clauses** | NIST GV-6.1-004 |
| `T3-LOG-01` Logging | Grounding note added: deployer keeps logs ≥ 6 months | EU Art. 26(6) |
| `T3-GOV-03` Oversight cadence | Grounding note: re-assess on vendor model change | NIST MANAGE 3.1 |

**The fact to know cold:** workforce scheduling AI is HIGH-RISK under EU AI
Act Annex III point 4(b), and the Article 26 deployer obligations have been
**in force since 2 August 2026**. Grandfathering (Art. 111(2)) covers systems
placed on the market earlier only until they change significantly.

**Deliberately not asked of the requester:** deep infosec (encryption modes,
segmentation) — routed as Tier-3 controls answered by the technical owner or
vendor assurance, per the platform's rule that people are never asked what
they cannot know.

---

# The research itself (verbatim from the four researchers)

