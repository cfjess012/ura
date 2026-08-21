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

## EU AI Act — Regulation (EU) 2024/1689 (verified against the AI Act Explorer, artificialintelligenceact.eu, which mirrors the official EUR-Lex text)

**Q: Does the scheduling tool decide or recommend who gets which shifts or tasks based on individual behaviour, personal traits, or performance data — or does it monitor and evaluate how employees work? (This is the gating question: a yes makes the system high-risk under the AI Act.)**

- *Why:* Determines whether the deployment is a high-risk AI system at all — Annex III point 4(b) covers AI used 'to allocate tasks based on individual behaviour or personal traits or characteristics or to monitor and evaluate the performance and behaviour of persons' in work relationships, which triggers every deployer obligation below.
- *Cite:* EU AI Act, Annex III point 4(b) (read with Art. 6(2))
- *Low vs High:* Low: pure logistics (availability, headcount, legal rest rules) with no individual profiling, or the vendor documents a valid Art. 6(3) narrow-task derogation. High: allocation or evaluation driven by individual behaviour/performance scoring — full high-risk classification and Art. 26 duties attach.

**Q: Before the tool goes live, have you told the affected employees and their worker representatives (e.g. works council, union) that they will be subject to this AI system?**

- *Why:* Article 26(7) makes advance workplace notification an explicit, standalone legal duty for employers deploying high-risk AI on workers — one of the most commonly missed obligations.
- *Cite:* EU AI Act, Art. 26(7)
- *Low vs High:* Low: written notification delivered and worker representatives informed before putting into service, per applicable EU/national consultation rules. High: system already scheduling staff who were never told — a direct statutory breach, in force since 2 Aug 2026.

**Q: Who in your organisation is assigned to oversee the tool's scheduling decisions, do they have the training and authority to do it, and can they actually override, disregard, or stop an AI-generated schedule before it takes effect?**

- *Why:* Deployers must assign human oversight to competent, trained, authorised people (Art. 26(2)), and the system must let that person 'disregard, override or reverse the output' and 'intervene... or interrupt the system' (Art. 14(4)(d)-(e)) — automation bias over unfair schedules is the core harm here.
- *Cite:* EU AI Act, Art. 26(1)-(2) and Art. 14(4)(a)-(e)
- *Low vs High:* Low: named, trained oversight owner reviews and can veto schedules before publication. High: schedules auto-publish to employees with no human review path or no one empowered to reverse them.

**Q: Has the vendor given you the system's 'instructions for use' — covering its intended purpose, capabilities and limitations, accuracy, known risks to fundamental rights, how to interpret its outputs, and the built-in oversight measures — and are you actually operating within them?**

- *Why:* Article 13(3) obliges the provider to supply this package, and Article 26(1) obliges you to use the system in accordance with it; a vendor that cannot produce it is itself likely non-compliant, which is a supply-chain red flag.
- *Cite:* EU AI Act, Art. 13(3) and Art. 26(1)
- *Low vs High:* Low: full Art. 13 documentation received, reviewed, and reflected in your operating procedures. High: no documentation beyond marketing material, or the tool is being used outside its stated intended purpose (which can also make YOU the provider — see Art. 25 question).

**Q: For the employee data your company feeds into the tool (availability, roles, performance history, absence records), have you checked it is relevant to scheduling and sufficiently representative of your workforce — and that you are not loading confidential HR data the tool doesn't need?**

- *Why:* Article 26(4) puts input-data quality on the deployer wherever the deployer controls the inputs: 'ensure that input data is relevant and sufficiently representative in view of the intended purpose' — bad or excessive inputs are how scheduling AI discriminates.
- *Cite:* EU AI Act, Art. 26(4)
- *Low vs High:* Low: a curated, documented set of scheduling-relevant fields. High: bulk-feeding full HR records, health/absence detail, or data skewed against part-time or protected groups — compounding AI Act breach with GDPR minimisation failure.

**Q: Do you monitor how the tool performs in operation, and is there a defined route to report problems to the vendor, notify the market surveillance authority of serious risks or incidents, and suspend use of the system if something goes wrong?**

- *Why:* Article 26(5) requires deployers to monitor operation per the instructions for use, inform the provider/distributor and the relevant market surveillance authority 'without undue delay' when the system presents a risk, suspend use, and report serious incidents.
- *Cite:* EU AI Act, Art. 26(5)
- *Low vs High:* Low: named owner monitors outcomes (e.g. fairness of shift distribution), with a documented escalation and kill-switch procedure. High: no monitoring and no way to pause the system — every incident becomes an unreported, uncontained one.

**Q: Are the logs the system automatically generates kept under your control for at least six months, so you can reconstruct why a given employee got (or lost) a shift?**

- *Why:* Article 26(6) requires deployers to keep automatically generated logs, to the extent under their control, 'for a period appropriate to the intended purpose... of at least six months' — in SaaS this must usually be secured contractually with the vendor.
- *Cite:* EU AI Act, Art. 26(6)
- *Low vs High:* Low: log retention ≥6 months guaranteed in the vendor contract with deployer access on demand. High: vendor retains logs briefly or not at all and the contract is silent — you cannot evidence compliance or answer an employee dispute.

**Q: Have you run a data protection impact assessment (DPIA) for this tool using the vendor's Article 13 information, and will employees be told when the system was involved in a decision that affects them?**

- *Why:* Article 26(9) directs deployers to use the Art. 13 information to fulfil their GDPR Art. 35 DPIA duty, and Art. 26(11) requires deployers of Annex III systems making or assisting decisions about natural persons to inform those persons — with a right to explanation of individual decisions under Art. 86.
- *Cite:* EU AI Act, Art. 26(9), Art. 26(11) (and Art. 86)
- *Low vs High:* Low: DPIA completed pre-deployment and a standing notice-plus-explanation process for affected employees. High: confidential employee data processed with no DPIA and employees unaware AI shaped their schedules, pay-relevant hours, or task assignments.

**Q: Are you using the tool strictly off-the-shelf under the vendor's brand and intended purpose — or are you rebranding it, substantially modifying it, or repurposing it (e.g. extending scheduling outputs into performance evaluation or disciplinary decisions)?**

- *Why:* Article 25(1) converts a deployer into the PROVIDER — inheriting the full Art. 16 provider compliance burden (conformity assessment, CE marking, registration) — if it puts its name/trademark on the system, substantially modifies it, or modifies its intended purpose such that it becomes high-risk.
- *Cite:* EU AI Act, Art. 25(1)(a)-(c)
- *Low vs High:* Low: unmodified SaaS used exactly per the vendor's documented intended purpose. High: white-labelling, custom model tuning, or feeding scheduling scores into promotion/termination decisions — you silently assume provider-grade obligations you are not resourced to meet.

**Q: Has the vendor disclosed which third-party foundation model (GPAI) is embedded in the tool, and if the product includes an employee-facing chat assistant or any emotion/fatigue-detection feature, are employees clearly told they are interacting with AI or subject to that detection?**

- *Why:* The GPAI supply chain (Chapter V, in force since 2 Aug 2025) means the vendor should be able to pass through model-level information; Art. 50(1) requires disclosure of AI interaction to users, and Art. 50(3) obliges DEPLOYERS of emotion recognition to inform exposed persons — with workplace emotion inference outright prohibited under Art. 5(1)(f).
- *Cite:* EU AI Act, Art. 50(1), Art. 50(3), Chapter V (Arts. 51-56); Art. 5(1)(f) for workplace emotion inference
- *Low vs High:* Low: vendor names the embedded model and its documentation trail; any chat UI self-identifies as AI; no emotion/biometric features. High: opaque model supply chain, undisclosed chatbot, or any 'fatigue/mood detection' on workers — the latter crosses from high-risk into the Act's prohibited-practice territory (in force since Feb 2025).

**Researcher notes:** TIMELINE (verified, as of Aug 2026): prohibitions (Art. 5) and AI-literacy duty (Art. 4 — binds deployers too: staff using the tool need 'a sufficient level of AI literacy') apply since 2 Feb 2025; GPAI model obligations (Chapter V) since 2 Aug 2025; the Annex III high-risk regime including ALL Article 26 deployer obligations since 2 Aug 2026 — i.e. currently in force for this scenario. Art. 6(1) product-embedded high-risk follows 2 Aug 2027. GRANDFATHERING CAVEAT (Art. 111(2)): high-risk systems placed on the market before 2 Aug 2026 fall under the Act only once they undergo 'significant changes in their designs' — but continuously-updated SaaS makes this shelter fragile, and public-authority deployments must comply by 2 Aug 2030 regardless. APPLICABILITY CAVEATS: (1) the Act reaches non-EU deployers when the system's output is used in the EU (Art. 2(1)(c)) — scope question worth asking early; (2) Art. 27 fundamental-rights impact assessment applies only to public bodies and private providers of public services, so most private employers escape it — the DPIA (Art. 26(9)) does the equivalent work; (3) vendors sometimes claim the Art. 6(3) derogation ('narrow procedural task') to dodge high-risk status — ask for their documented assessment rather than accepting the claim, since Annex III 4(b) profiling-based allocation cannot use the derogation (Art. 6(3) final subparagraph: profiling is always high-risk). COMMON MISTAKE: assuming 'we only buy it, the vendor handles the AI Act' — Arts. 26 and 50 bind the deployer directly, and Art. 25 can convert the buyer into the provider. Penalties for deployer-obligation breaches reach EUR 15M or 3% of worldwide turnover (Art. 99(4)); prohibited-practice breaches (e.g. workplace emotion inference) reach EUR 35M or 7% (Art. 99(3)). All citations verified 21 Aug 2026 against artificialintelligenceact.eu (AI Act Explorer mirroring Regulation (EU) 2024/1689).

## ISO/IEC 42001:2023 (AI management systems, Annex A controls) + ISO/IEC 23894:2023 (AI — Guidance on risk management)

**Q: What decisions about employees does this tool make or influence — shift assignment, hours, overtime, time-off approval — and could an employee be materially worse off (pay, hours, legal entitlements) if it gets one wrong?**

- *Why:* Anchors the whole assessment in the standard's impact-on-individuals lens: scheduling directly touches income and working conditions, so errors are consequential, not cosmetic.
- *Cite:* ISO/IEC 42001:2023 Annex A.5.4 (Assessing AI system impact on individuals or groups), with A.5.2 (AI system impact assessment process); ISO/IEC 23894:2023 Clause 6.4.2 (Risk identification)
- *Low vs High:* Low: the tool only suggests schedules and no output affects pay or contractual hours without human sign-off. High: it auto-publishes schedules that determine income, overtime, or statutory rest, with no per-decision review.

**Q: Before a schedule takes effect, can a named manager review, change, or reject what the AI produced — and is overriding it easy enough that people will actually do it?**

- *Why:* Captures the level-of-automation risk and automation bias: oversight that exists on paper but is never exercised is not a control.
- *Cite:* ISO/IEC 42001:2023 Annex A.9.2 (Processes for responsible use of AI systems) and A.9.3 (Objectives for responsible use); ISO/IEC 23894:2023 Annex B risk source 'level of automation'
- *Low vs High:* Low: a human approves every published schedule and override is one click with no penalty. High: fully automated publishing, overrides are buried, discouraged, or reversed by the system.

**Q: Exactly what employee data does the vendor receive (names, availability, health-related accommodations, absence reasons?), where is it stored, how long is it kept, and is the vendor or its AI model provider allowed to use it to train or improve models?**

- *Why:* Confidential employee data flowing into a vendor's AI stack — and possibly onward to a foundation-model provider — is the largest privacy exposure in a buy-not-build deployment.
- *Cite:* ISO/IEC 42001:2023 Annex A.7.2 (Data for development and enhancement of AI system) and A.7.3 (Acquisition of data), applied through A.10.3 (Suppliers); ISO/IEC 23894:2023 Annex A objective 'privacy'
- *Low vs High:* Low: minimal fields, defined retention, contract explicitly bars training on our data, no onward flow to the model provider. High: sensitive or health-adjacent data reaches a third-party foundation model, training use is permitted or the vendor cannot say.

**Q: Which third-party AI models or services are embedded inside the vendor's product, and does our contract spell out who is responsible for what — vendor, model provider, or us — when the AI causes a problem?**

- *Why:* The deployer sits at the end of an AI supply chain; the standard's core third-party demand is that no accountability gap exists between the parties when something goes wrong.
- *Cite:* ISO/IEC 42001:2023 Annex A.10.3 (Suppliers) and A.10.2 (Allocating responsibilities)
- *Low vs High:* Low: vendor discloses its AI supply chain and the contract allocates responsibilities including incident handling and model changes. High: vendor won't name the embedded model, no AI-specific contract clauses, responsibilities unallocated.

**Q: Has the vendor given us evidence that schedules do not systematically disadvantage particular groups (part-timers, carers, employees with accommodations, night-shift-protected staff), and can we see the outcome data to check this ourselves?**

- *Why:* Scheduling models trained on historical patterns can quietly encode unfair shift distribution; fairness is a named objective and data quality/representativeness is its named cause.
- *Cite:* ISO/IEC 42001:2023 Annex A.7.4 (Quality of data for AI systems); ISO/IEC 23894:2023 Annex A objective 'fairness' and Annex B risk sources related to machine learning (training data bias)
- *Low vs High:* Low: vendor shares bias-testing results and the tool exposes outcome data we can monitor by group. High: no fairness testing exists and we cannot extract the data needed to detect skewed outcomes.

**Q: Will employees be told that AI shapes their schedules, and has the vendor supplied enough documentation — what the system can and cannot do, its known failure modes, how to query a decision — for us to operate it responsibly and explain it?**

- *Why:* Transparency to the people affected and adequate user-facing documentation are explicit controls; a black box the deployer cannot explain fails both.
- *Cite:* ISO/IEC 42001:2023 Annex A.8.2 (System documentation and information for users) and A.8.5 (Information for interested parties); ISO/IEC 23894:2023 Annex B risk source 'lack of transparency and explainability'
- *Low vs High:* Low: employees are informed, vendor documentation covers capabilities, limits, and failure modes, and a human-readable explanation of any schedule is available. High: employees don't know AI is involved and neither we nor the vendor can explain a given output.

**Q: Will the tool be used only for scheduling, or could its outputs drift into other decisions — performance ratings, disciplinary action, headcount — without anyone reassessing the risk?**

- *Why:* Scope creep is a named control: a system assessed as low-risk for rostering becomes high-risk the day its outputs feed employment decisions it was never assessed for.
- *Cite:* ISO/IEC 42001:2023 Annex A.9.4 (Intended use of the AI system)
- *Low vs High:* Low: use is contractually and procedurally limited to scheduling, and any new use triggers a fresh impact assessment. High: attendance/availability scores already flow into performance or disciplinary processes with no reassessment gate.

**Q: After go-live, what will we monitor to know the tool still works — error rates, employee complaints, manager override frequency — and who owns watching it?**

- *Why:* Deployment is not the end of the risk: operation-and-monitoring is its own control, and drift or silent degradation in a vendor model only shows up if someone is looking.
- *Cite:* ISO/IEC 42001:2023 Annex A.6.2.6 (AI system operation and monitoring); ISO/IEC 23894:2023 Clause 6.6 (Monitoring and review) and Annex C (risk management mapped across the AI system life cycle)
- *Low vs High:* Low: named owner, defined indicators (overrides, complaints, scheduling errors), and a review cadence. High: nobody is assigned and the first signal of a problem would be a grievance or a regulator.

**Q: If the AI causes a problem — a broken schedule, a data leak, biased outcomes — how do employees report it, and how quickly is the vendor contractually required to tell us about incidents on their side (including changes or failures in the embedded model)?**

- *Why:* The standard requires both an intake channel for affected people and a pre-planned incident communication path; with a vendor in the middle, notification speed must be contractual, not goodwill.
- *Cite:* ISO/IEC 42001:2023 Annex A.8.3 (External reporting) and A.8.4 (Communication of incidents), with A.10.3 (Suppliers) for the contractual notification duty
- *Low vs High:* Low: a visible reporting channel for employees plus contractual vendor incident-notification SLAs covering the embedded model. High: no reporting route and no obligation on the vendor to disclose AI incidents or model swaps.

**Researcher notes:** VERIFICATION: ISO/IEC 23894:2023 was verified against the official iTeh preview PDF of the standard itself (table of contents and Clauses 1-4): Scope explicitly covers organizations that "deploy or use" AI; Clause 6.4.2 Risk identification, 6.6 Monitoring and review; Annex A (informative) Objectives, Annex B (informative) Risk sources, Annex C (informative) Risk management and AI system life cycle are confirmed section titles. The Annex B risk-source names (level of automation; lack of transparency and explainability; risk sources related to machine learning) and Annex A objectives (fairness, privacy, etc.) were confirmed via secondary summaries, not the paywalled full text. ISO/IEC 42001:2023 Annex A control IDs and titles were cross-checked against two independent listings (mindsetcyber.com.au and isms.online) that agree exactly on every ID cited above (A.5.2/A.5.4, A.6.2.6, A.7.2-A.7.4, A.8.2-A.8.5, A.9.2-A.9.4, A.10.2-A.10.3); full control text is paywalled, so requirement wordings are paraphrases, not verbatim quotes. APPLICABILITY: 42001 Annex A is a catalogue selected via a Statement of Applicability driven by the organization's own risk and impact assessment (Clause 6.1) — a deployer applies these controls to its USE of AI even when it builds nothing; note also Annex B of 42001 (not cited above) carries the implementation guidance for each Annex A control. COMMON MISTAKES: (1) confusing 42001 main-clause numbers with Annex A ids — cite "Annex A.5.4", not "Clause 5.4"; (2) treating a vendor's ISO 42001 certificate as discharging the deployer's duties — A.5 impact assessment and A.9 responsible-use controls sit with the deploying organization; (3) 23894's annexes are informative, so cite them as guidance taxonomies, not requirements. CROSS-REFERENCE: workforce scheduling is an employment-context use case, which the EU AI Act (Annex III) treats as high-risk — worth flagging in the platform even though it is outside these two ISO sources. Sources: https://cdn.standards.iteh.ai/samples/77304/cb803ee4e9624430a5db177459158b24/ISO-IEC-23894-2023.pdf (official preview), https://mindsetcyber.com.au/iso-42001-controls-list/, https://www.isms.online/iso-42001/annex-a-controls/, https://techne.ai/insights/iso-iec-23894-reference/, https://www.iso.org/standard/77304.html

## NIST AI Risk Management Framework 1.0 (NIST AI 100-1, Jan 2023) + NIST Generative AI Profile (NIST AI 600-1, July 2024) — verified verbatim against the official PDFs at nvlpubs.nist.gov

**Q: What exactly will this tool decide or recommend about employees, who will use it, and is that intended purpose written down? (e.g. does it draft schedules for manager review, or does it directly set shifts and hours that affect people's pay?)**

- *Why:* An undocumented or drifting purpose is the root risk: every other control is scoped to intended use, and scheduling decisions directly affect workers' income and lives.
- *Cite:* NIST AI RMF MAP 1.1 (intended purposes, users, and deployment settings documented); NIST AI 600-1 action MP-1.1-002 (document expected and acceptable context of use, including potential negative impacts to individuals and groups)
- *Low vs High:* Low: narrow, documented advisory use — the tool proposes drafts a manager approves. High: broad or undocumented scope where the tool autonomously assigns shifts, hours, or pay-affecting work across the workforce.

**Q: Do you know what AI components sit inside the vendor's product — including any third-party foundation model it embeds — and has your procurement due diligence specifically covered those embedded AI technologies (privacy, security, IP, bias)?**

- *Why:* Non-transparent integration of upstream third-party components is a named GenAI risk (Value Chain and Component Integration); a deployer that can't see the model stack can't assess it.
- *Cite:* NIST AI RMF GOVERN 6.1 and MAP 4.1 (mapping risks of third-party software/data components); NIST AI 600-1 action GV-6.1-009 (update acquisition/procurement due diligence to 'address solutions that may rely on embedded GAI technologies') and risk §2.12 Value Chain and Component Integration
- *Low vs High:* Low: vendor discloses the embedded model/provider and your vendor-assessment process evaluated it. High: opaque stack — vendor won't say what model is used or where inference runs, and AI was never covered in vendor review.

**Q: Does the contract or SLA with the vendor spell out who owns your employee data, whether the vendor or its model provider may use it to train models, security requirements, and your right to evaluate the vendor's AI processes?**

- *Why:* Without contractual terms, confidential employee data can lawfully flow into third-party model training and you have no lever to inspect or stop it.
- *Cite:* NIST AI 600-1 actions GV-6.1-004 (contracts/SLAs specifying content ownership, usage rights, quality standards, security requirements) and GV-6.1-006 (contract clauses allowing evaluation of third-party GAI processes), under AI RMF GOVERN 6.1
- *Low vs High:* Low: contract explicitly prohibits training on your data, mandates security standards, and grants audit/evaluation rights. High: contract is silent on AI and data use, or permits vendor reuse of employee data.

**Q: What confidential employee data does the tool actually take in (availability, health-related accommodations, contact details, performance data?), is it limited to what scheduling needs, and has the vendor shown that this data can't leak through model outputs or be retained in prompts?**

- *Why:* The GenAI profile flags model leakage, memorization, and inference of sensitive personal data as core privacy risks; employee data in prompts to an embedded third-party model is exactly this exposure path.
- *Cite:* NIST AI RMF MEASURE 2.10 (privacy risk examined and documented); NIST AI 600-1 §2.4 Data Privacy (models 'may leak, generate, or correctly infer sensitive information'), actions MP-4.1-001 (monitor AI-generated content for PII/sensitive-data exposure) and MP-4.1-005 (data collection/retention policies addressing PII leakage)
- *Low vs High:* Low: minimized data set, no special-category data, vendor attests prompts/records are not retained or used for training. High: full HR records flow to a third-party model with unknown retention, or health/accommodation data enters prompts.

**Q: Has anyone — the vendor or you — measured whether the tool's schedule assignments come out differently across demographic groups (who gets desirable shifts, total hours, weekend/night work), and are those results documented?**

- *Why:* Scheduling is an allocation of hours and therefore pay; unmeasured systemic bias here produces allocative harm to protected groups, and the profile explicitly calls for fairness metrics on business-process outcomes that rely on AI.
- *Cite:* NIST AI RMF MEASURE 2.11 (fairness and bias evaluated, results documented); NIST AI 600-1 action MS-2.11-002 (measure performance across demographic groups, 'addressing both quality of service and any allocation of services and resources', applying metrics such as demographic parity/equalized odds to the business outcome)
- *Low vs High:* Low: vendor provides fairness test results for comparable use and you periodically check hour/shift allocation across groups. High: no fairness measurement anywhere, in a tool allocating pay-relevant hours.

**Q: Who reviews AI-generated schedules before they take effect, do those people have the authority, training, and time to change them, and is that oversight process written down?**

- *Why:* Human oversight is the main compensating control a deployer owns; oversight that exists only on paper (rubber-stamping) leaves automated errors flowing straight to workers.
- *Cite:* NIST AI RMF MAP 3.5 (processes for human oversight defined, assessed, documented) and MAP 2.2 (documentation of how output is utilized and overseen by humans); NIST AI 600-1 GOVERN 3.2 / action GV-3.2-003 (define acceptable use and human-AI configurations for decision-making tasks)
- *Low vs High:* Low: documented review step where a trained manager approves and can freely amend every schedule. High: schedules auto-publish, or reviewers lack time/authority so approval is a formality.

**Q: Has the vendor given you evidence the tool actually works for an organization like yours — model or system cards, accuracy/performance results, and documented limitations of where it doesn't generalize?**

- *Why:* A deployer must demand validity evidence in its own context rather than trusting marketing; reviewing transparency artifacts is the profile's named control for third-party models.
- *Cite:* NIST AI RMF MEASURE 2.5 (system demonstrated valid and reliable; limitations of generalizability documented); NIST AI 600-1 action MG-3.1-005 (review transparency artifacts, e.g. system cards and model cards, for third-party models)
- *Low vs High:* Low: vendor supplies performance evidence in comparable workforce contexts plus documented limitations. High: no artifacts at all — capability claims cannot be checked against any documentation.

**Q: If the vendor's AI fails, degrades, or has an incident (outage, bad outputs, data breach), what is your fallback — can you still produce legal, workable schedules, and is the vendor contractually obliged to tell you about incidents?**

- *Why:* Scheduling is operationally critical; total dependence on a third-party AI with no contingency turns a vendor incident into an immediate workforce and compliance failure.
- *Cite:* NIST AI RMF GOVERN 6.2 (contingency processes for failures/incidents in third-party data or AI systems deemed high-risk); NIST AI 600-1 actions GV-6.2-003 (incident response plans rehearsed with third parties) and GV-6.2-006 (fallback technologies acknowledged and planned)
- *Low vs High:* Low: manual fallback process exists and incident notification duties are in the contract. High: no fallback, no notification clause, and the org can no longer schedule without the tool.

**Q: Can employees see when scheduling decisions were AI-driven, report problems with their schedules, and appeal an outcome — and does that feedback actually reach whoever evaluates the tool?**

- *Why:* Affected workers are the impact surface; without a feedback and appeal channel, systematic errors and unfair assignments stay invisible to the assessment process.
- *Cite:* NIST AI RMF MEASURE 3.3 (feedback processes for end users and impacted communities to report problems and appeal system outcomes, integrated into evaluation); NIST AI 600-1 action GV-3.2-004 (user feedback mechanisms including mechanisms for recourse)
- *Low vs High:* Low: visible appeal route with human re-decision and feedback feeding evaluation metrics. High: no channel — workers can't contest an AI-set schedule and complaints never reach the risk owner.

**Q: How will you monitor this vendor tool over time — and will you be told, and will you re-assess risk, when the vendor updates or swaps the underlying model?**

- *Why:* SaaS vendors change embedded models silently; the profile requires re-assessing risk when third-party models change or are applied to contexts not covered by initial testing.
- *Cite:* NIST AI RMF MANAGE 3.1 (risks from third-party resources regularly monitored, controls applied and documented) and MEASURE 2.4 (behavior monitored in production); NIST AI 600-1 action MG-3.1-003 (re-assess risks for third-party models deployed for use cases not evaluated in initial testing)
- *Low vs High:* Low: contractual change-notification plus a scheduled re-review cadence and production monitoring. High: no notification of model changes and no monitoring — the assessed system silently becomes a different one.

**Researcher notes:** All subcategory text and action IDs verified verbatim against the official PDFs: NIST AI 100-1 (AI RMF 1.0, Table 2 MAP pp. 25-27, Table 3 MEASURE pp. 28-30, Table 1 GOVERN 6 p. 24) and NIST AI 600-1 (GenAI Profile, risk descriptions §2.4 and §2.12, action tables §3), both downloaded from nvlpubs.nist.gov — not from memory or secondary summaries. Citation convention: the RMF core uses subcategory IDs like 'MAP 1.1' / 'MEASURE 2.11' / 'GOVERN 6.1'; the GenAI Profile keys its suggested actions to the same subcategories with IDs like 'GV-6.1-009', 'MP-4.1-001', 'MS-2.11-002', 'MG-3.1-003'. Applicability: the RMF is voluntary and role-based — the deploying company is an 'AI Deployment' actor with its own MAP/MEASURE/MANAGE obligations; the most common mistake is assuming the vendor's compliance discharges the deployer's duties (the RMF explicitly does not work that way — e.g. MEASURE 2.11 and MAP 3.5 are the deployer's to satisfy in its own context). The GenAI Profile applies because the vendor likely embeds a foundation model; even if the scheduling core is predictive rather than generative, the RMF core applies to all AI and the profile's Value Chain / Data Privacy actions (GV-6.1-009 explicitly covers 'solutions that may rely on embedded GAI technologies') are written for exactly this buy-not-build pattern. Severity gradients are not native to NIST (unlike the EU AI Act's risk tiers) — the gradients above are derived from each subcategory's own language (e.g. MAP 5.1 'likelihood and magnitude of each identified impact', GOVERN 6.2's 'deemed to be high-risk' qualifier) plus the employment context: scheduling allocates hours and therefore pay, which pushes fairness (MEASURE 2.11) and human oversight (MAP 3.5) toward the high end whenever output directly affects worker income without review. GV-6.1-005's 'use-case based supplier risk assessment framework' is the profile's closest analogue to this platform's own purpose and could anchor the module framing.

## OWASP Top 10 for LLM Applications 2025 (verified from the canonical OWASP GitHub 2_0_vulns markdown mirroring genai.owasp.org); secondarily FS-ISAC Generative AI Vendor Risk Assessment Guide, Feb 2024 (full PDF extracted) and Microsoft Responsible AI Impact Assessment Template, June 2022 (full PDF extracted)

**Q: Will our employees' data (schedules, availability, HR attributes, anything typed into the tool) ever be used to train or improve the vendor's AI or the underlying foundation model — and do we have a written opt-out plus clear retention and deletion terms for prompts, outputs, and logs?**

- *Why:* Confidential employee data absorbed into a model or retained in vendor logs can never be reliably recalled and may resurface to other customers.
- *Cite:* OWASP LLM02:2025 Sensitive Information Disclosure (mitigations: sanitization 'to prevent user data from entering the training model'; Terms of Use 'allowing users to opt out of having their data included in the training model'); FS-ISAC GenAI Vendor Risk Assessment Guide, vendor questionnaire categories 2 'Data privacy, retention, and deletion' and 3 'Model training, validation, and maintenance'
- *Low vs High:* Low: contractual no-training commitment covering the foundation-model operator too, with defined retention limits and deletion on exit. High: silence, default opt-in, or a vague 'to improve our services' clause; no stated retention period for prompts/logs.

**Q: Which foundation model(s) does the product actually run on, who operates them (the vendor or a fourth party), what do that operator's terms say about our data, and will the vendor notify us before swapping models or providers?**

- *Why:* The deployer's real data exposure and behaviour risk sits with an embedded Nth-party model whose terms and versions can change without the buyer noticing.
- *Cite:* OWASP LLM03:2025 Supply Chain (risks: 'unclear T&Cs and data privacy policies' of model operators; mitigations: 'carefully vet data sources and suppliers, including T&Cs and their privacy policies', maintain an SBOM/inventory, monitor suppliers for changes in terms); FS-ISAC guide, vendor questionnaire category 6 'Nth party risk/usage' — its Level 1 baseline already includes 'identifying the foundational model'
- *Low vs High:* Low: named model and operator, flowed-down data terms, contractual change notification. High: undisclosed or freely swappable models, or the vendor cannot say what the model operator does with submitted data.

**Q: Does the AI read content that other people control — uploaded documents, shift-swap notes, emails, calendar invites, web pages — and what has the vendor done (input segregation, filtering, adversarial testing) to stop hidden instructions in that content from steering the AI's behaviour?**

- *Why:* Indirect prompt injection lets anyone who can plant text the model later reads hijack outputs or exfiltrate the employee data in context.
- *Cite:* OWASP LLM01:2025 Prompt Injection (indirect injection: 'an LLM accepts input from external sources, such as websites or files'; in RAG 'a user's query returns the modified content, the malicious instructions alter the LLM's output'; mitigations: segregate and 'clearly denote untrusted content', privilege control, adversarial testing)
- *Low vs High:* Low: model only sees structured scheduling fields from trusted systems. High: retrieval over free-text or user-uploaded content, especially combined with any tool/action access — that pairing is OWASP's worst case.

**Q: Is our data kept in its own access-controlled store, or does the AI's retrieval index (vector database) share infrastructure with the vendor's other customers — and how does the vendor prevent one customer's, or one employee's, data from surfacing in someone else's answers?**

- *Why:* Multi-tenant RAG stores can leak one tenant's confidential records into another tenant's AI responses.
- *Cite:* OWASP LLM08:2025 Vector and Embedding Weaknesses ('in multi-tenant environments where multiple classes of users or applications share the same vector database, there's a risk of context leakage between users or queries'; mitigations: 'permission-aware vector and embedding stores', 'strict logical and access partitioning of datasets')
- *Low vs High:* Low: per-tenant physical or strongly partitioned stores with permission-aware retrieval that also respects intra-company roles (managers vs. employees). High: shared index with only application-layer filtering, or retrieval that ignores the querying user's permissions.

**Q: Exactly which categories of employee data does the tool send to the AI model, and is that the minimum needed for scheduling — or does it include HR file content such as health accommodations, leave reasons, or protected characteristics?**

- *Why:* Every extra field passed into prompts is a field that can be disclosed in an output, a log, or a breach.
- *Cite:* OWASP LLM02:2025 Sensitive Information Disclosure (PII/health/confidential business data exposure; mitigations: input sanitization, least-privilege access, restricting model access to data sources); FS-ISAC guide, Assessment Model Step 2 risk domain 3 'use of confidential data'
- *Low vs High:* Low: minimised, pseudonymised scheduling fields only. High: full HR records including health or protected-class data flowing into prompts — this alone pushes the FS-ISAC risk analysis toward its highest due-diligence level.

**Q: Can the AI take actions on its own — publish rosters, approve shift swaps, message staff, or write into our HR/payroll systems — or does it only draft proposals that a named human approves? What system permissions does it hold?**

- *Why:* An AI with write access and autonomy can act on a hallucination or an injected instruction and directly alter people's working hours and pay.
- *Cite:* OWASP LLM06:2025 Excessive Agency (excessive functionality, permissions, and autonomy; mitigations: 'limit the extensions that LLM agents are allowed to call to only the minimum necessary', least privilege on downstream systems, 'human-in-the-loop control to require a human to approve high-impact' actions)
- *Low vs High:* Low: recommendation-only, human publishes; any integration credentials are read-only. High: autonomous writes to scheduling/HR systems, broad credentials, no approval gate on high-impact actions.

**Q: How will our managers check AI-generated schedules and answers before employees are affected — and does the product clearly label AI-generated content and state its limitations so users know not to treat it as authoritative?**

- *Why:* Overreliance on plausible-but-wrong outputs (missed legal rest breaks, misstated policies) turns a model error into an operational and legal incident.
- *Cite:* OWASP LLM09:2025 Misinformation ('overreliance occurs when users place excessive trust in LLM-generated content, failing to verify its accuracy'; mitigations: 'implement human oversight and fact-checking processes, especially for critical or sensitive information', clearly communicate risks and limitations, label AI-generated content)
- *Low vs High:* Low: mandatory human review step, labelled AI output, accuracy monitored against ground truth (e.g. labour-rule compliance checks). High: outputs auto-published or presented as authoritative answers to policy questions with no verification workflow.

**Q: Do the tool's outputs change anyone's pay, hours, or terms of employment — and if so, who are decisions made about, who reviews them, and how have we checked the AI doesn't systematically disadvantage particular groups (part-timers, carers, night-shift staff, a protected class)?**

- *Why:* Workforce scheduling squarely hits the 'consequential impact on life opportunities' sensitive-use trigger: it sets the terms on which employment is provided.
- *Cite:* Microsoft Responsible AI Impact Assessment Template §3.6 Sensitive Uses ('the use or misuse of the AI system could affect an individual's ... employment ... or the terms on which they are provided') and §2.3 Goal T1 System intelligibility for decision making ('Who will use the outputs of the system to make decisions? Who will decisions be made about?'); fairness prompts in §2.4
- *Low vs High:* Low: AI proposes, an accountable manager decides, allocation outcomes are periodically audited across groups. High: automated shift/hour allocation directly determines earnings with no review or fairness monitoring — a sensitive use demanding the strictest oversight.

**Q: Who in our organisation owns this system after go-live — responsible for operating, overseeing, and controlling it — and what is the plan when it fails or is misused (wrong rosters published, an employee tricks it, the vendor has an outage)?**

- *Why:* Deployer-side accountability gaps, not vendor flaws, are the most common reason AI incidents go unhandled; failure and misuse must be planned before deployment.
- *Cite:* Microsoft Responsible AI Impact Assessment Template §2.3 Goal A5 Human oversight and control ('Who is responsible for troubleshooting, managing, operating, overseeing, and controlling the system during and after deployment?') with §3.4 potential impact of failure and §3.5 potential impact of misuse; FS-ISAC guide, Assessment Model Step 2 risk domain 4 'business resiliency'
- *Low vs High:* Low: named accountable owner, documented failure/misuse playbook, fallback manual scheduling process. High: no assigned oversight role and no continuity plan if the AI misfires or the vendor is unavailable.

**Researcher notes:** VERIFICATION: OWASP entries were verified against the canonical repo files (raw.githubusercontent.com/OWASP/www-project-top-10-for-large-language-model-applications/main/2_0_vulns/ — LLM01_PromptInjection.md, LLM02_SensitiveInformationDisclosure.md, LLM03_SupplyChain.md, LLM06_ExcessiveAgency.md, LLM08_VectorAndEmbeddingWeaknesses.md, LLM09_Misinformation.md); genai.owasp.org itself returns 403 to automated fetches. The FS-ISAC Generative AI Vendor Risk Assessment Guide (fsisac.com/hubfs/Knowledge/AI/FSISAC_GenerativeAI-VendorEvaluation&QualitativeRiskAssessment.pdf, Feb 2024, TLP WHITE) and the Microsoft RAI Impact Assessment Template (msblogs.thesourcemediaassets.com/sites/5/2022/06/Microsoft-RAI-Impact-Assessment-Template.pdf, June 2022) were both downloaded and text-extracted in full.

CITATION CAVEAT (FS-ISAC): the white paper defines the assessment model — five risk domains (use case; business integration; use of confidential data; business resiliency; potential for exposure) and seven vendor-questionnaire categories — but the individual question text lives in the companion Excel workbook (FS-ISAC member resource), so FS-ISAC citations here are to named categories/domains, not question numbers.

BUILT-IN SEVERITY GRADIENT worth adopting platform-wide: FS-ISAC's three due-diligence levels map cleanly to this scenario — Level 1 'primarily for R&D or educational purposes'; Level 2 for orgs that 'integrate GenAI outputs with business processes, utilize confidential company data in prompts, or have moderate potential for regulatory scrutiny'; Level 3 for 'customer-facing content, integrating with critical business processes, and ... high potential for regulatory risk'. The assessed scenario (confidential employee data in prompts + business-process integration) is at minimum Level 2 and reaches Level 3 wherever scheduling is a critical process or outputs affect pay — the recommended plan follows the HIGHEST-scored domain, a useful aggregation rule for the platform.

APPLICABILITY CAVEATS: (1) The Microsoft template is written for system builders; questions 8-9 adapt its prompts to the deployer seat — legitimate per its own Goal T2, which asks who 'deploys systems that integrate with this system'. (2) OWASP LLM entries are technical vulnerability guidance; the questions above translate them into what a buyer can actually ask a vendor — evidence to request includes pen-test/red-team summaries (LLM01), tenancy architecture docs (LLM08), and an AI/model SBOM (LLM03).

COMMON MISTAKES this question set guards against: assessing only the SaaS vendor while ignoring the embedded foundation-model operator's T&Cs (the classic Nth-party blind spot, LLM03); accepting a verbal 'we don't train on your data' without contract language or without it flowing down to the model operator; conflating training with retention — prompt/output logs are a disclosure risk even when no training occurs (LLM02); and treating 'it's only scheduling' as low-stakes when shift allocation determines earnings, which triggers Microsoft's sensitive-use tier and typically higher scrutiny under employment/works-council rules.

Sources: OWASP repo raw files as listed above; https://www.fsisac.com/hubfs/Knowledge/AI/FSISAC_GenerativeAI-VendorEvaluation&QualitativeRiskAssessment.pdf; https://www.fsisac.com/knowledge/ai-risk; https://msblogs.thesourcemediaassets.com/sites/5/2022/06/Microsoft-RAI-Impact-Assessment-Template.pdf; https://blogs.microsoft.com/wp-content/uploads/prod/sites/5/2022/06/Microsoft-RAI-Impact-Assessment-Guide.pdf

