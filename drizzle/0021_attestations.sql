-- S8 · Attestation and the four dispositions.
--
-- Salvaged shape from the prior platform (G-59): the rules §4.3 states in
-- prose are CHECK constraints here, because a four-eyes rule enforced by
-- application code is a rule somebody can forget. Postgres cannot.

create table attestations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- The Tier-3 question being signed off.
  question_id text not null,
  -- Which risk area's assessor signed it, recorded because authority is a
  -- fact about the person and must be readable later (FR-17).
  attested_by text not null,
  attested_domain text,
  attested_at timestamptz not null default now(),
  -- approve | correct | not-applicable (§4.2)
  act text not null,
  -- The corrected answer, when the act is a correction.
  corrected_answer text,
  -- Required for a correction and for an N-A: a reviewer overriding or
  -- excusing an answer owes their reasoning to whoever reads this next.
  note text not null default '',
  constraint attestations_act check (act in ('approve', 'correct', 'not-applicable')),
  constraint attestations_correction_complete check (
    act <> 'correct' or (corrected_answer is not null and length(btrim(note)) > 0)
  ),
  constraint attestations_na_justified check (
    act <> 'not-applicable' or length(btrim(note)) > 0
  )
);

create index attestations_by_project on attestations (project_id, attested_at);

-- Dispositions resolve findings (§4.3). A finding is never edited; its
-- disposition is a row of its own, so the history of how a gap was settled
-- survives intact.
create table dispositions (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references findings(id) on delete cascade,
  kind text not null,
  resolved_by text not null,
  resolved_at timestamptz not null default now(),
  note text not null default '',
  -- Remediation: somebody owns fixing it, by a date.
  remediation_owner text,
  remediation_due timestamptz,
  -- Risk acceptance: a SECOND named person, and an expiry.
  accepted_by text,
  expires_at timestamptz,
  constraint dispositions_kind check (
    kind in ('answer-corrected', 'not-applicable', 'remediation', 'risk-accepted')
  ),
  -- Remediation needs an owner and a due date, or it is a wish.
  constraint dispositions_remediation_complete check (
    kind <> 'remediation' or (remediation_owner is not null and remediation_due is not null)
  ),
  -- Four-eyes, in the database: a second, named person, an expiry, and
  -- never the same person who resolved it. §19 requires that acceptance by
  -- the resolver themselves is rejected — this is where that is true.
  constraint dispositions_acceptance_four_eyes check (
    kind <> 'risk-accepted'
    or (accepted_by is not null and expires_at is not null and accepted_by <> resolved_by)
  ),
  -- Every disposition except a correction owes an explanation.
  constraint dispositions_explained check (
    kind = 'answer-corrected' or length(btrim(note)) > 0
  )
);

create index dispositions_by_finding on dispositions (finding_id, resolved_at);

-- Evidence, like everything else here (§5.1, NFR-1).
create trigger attestations_no_update before update on attestations
  for each row execute function evidence_is_insert_only();
create trigger attestations_no_delete before delete on attestations
  for each row execute function evidence_is_insert_only();
create trigger dispositions_no_update before update on dispositions
  for each row execute function evidence_is_insert_only();
create trigger dispositions_no_delete before delete on dispositions
  for each row execute function evidence_is_insert_only();
