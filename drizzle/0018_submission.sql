-- S7 · Submission, the declaration, and findings.
--
-- Submission is a one-way fact (§4.1): a timestamp and a person, never a
-- status column somebody can set back. "Draft" and "In review" are read
-- from whether that timestamp exists, so there is no second place for the
-- stage to be wrong.

alter table projects
  add column submitted_at timestamptz,
  add column submitted_by text;

-- The submitter's declaration (FR-37, G-52). Distinct from the assessor's
-- attestation, which arrives at S8 against a different table and a
-- different authority rule.
--
-- `shown` records the answers the person was looking at when they declared
-- them accurate — the label AND the value, as displayed. A declaration that
-- only said "they confirmed" would be worthless six months later when the
-- answers have moved on; this way a reviewer can see whether the record
-- still matches what was declared.
create table declarations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  declared_by text not null,
  declared_at timestamptz not null default now(),
  -- [{ questionId, label, value }] as displayed at the moment of signing.
  shown jsonb not null,
  -- The gaps named and accepted at the same moment (FR-14), if any.
  gaps jsonb not null default '[]'::jsonb
);

create index declarations_by_project on declarations (project_id, declared_at desc);

-- Findings are synthesised from Tier-3 answers at submission (FR-15) and
-- kept, because a finding is evidence: it carries the note the person wrote
-- and it is what a reviewer disposes at S8. Insert-only like every other
-- evidence table; a disposition at S8 is a new row against the finding,
-- never an edit of it.
create table findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- The Tier-3 question that produced it.
  question_id text not null,
  -- The control objective it is about, and its name as displayed.
  objective text not null,
  objective_name text not null,
  -- 'gap' from a No, 'enhancement' from a Partial (§4.3).
  kind text not null,
  -- What the person wrote. A finding without it is not actionable.
  note text not null,
  raised_at timestamptz not null default now(),
  raised_by text not null,
  constraint findings_kind check (kind in ('gap', 'enhancement')),
  constraint findings_note_present check (length(btrim(note)) > 0)
);

create index findings_by_project on findings (project_id, raised_at);

-- Evidence is insert-only (§5.1, NFR-1). Same shape as answers and
-- hand-offs: the trigger is the enforcement, never the repository.
create or replace function evidence_is_insert_only() returns trigger as $$
begin
  raise exception '% is insert-only: record a new row instead', tg_table_name;
end;
$$ language plpgsql;

create trigger declarations_no_update before update on declarations
  for each row execute function evidence_is_insert_only();
create trigger declarations_no_delete before delete on declarations
  for each row execute function evidence_is_insert_only();
create trigger findings_no_update before update on findings
  for each row execute function evidence_is_insert_only();
create trigger findings_no_delete before delete on findings
  for each row execute function evidence_is_insert_only();
