-- S2: the instrument becomes versioned data, and answers become evidence.
--
-- Two invariants are enforced here rather than in application code, because
-- SPEC §5 says the schema is where they live (NFR-1, NFR-11):
--   * answers are insert-only — a correction is a new row, never an edit;
--   * an activated instrument version is immutable — a change is a new
--     version, so a historical assessment always renders as it was asked.

create table instrument_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version text not null,
  content jsonb not null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (slug, version)
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  question_id text not null,
  value jsonb not null,
  -- 'person'  — a human answered it here
  -- 'intake'  — derived from an intake answer (FR-22); `confirmed` records
  --             whether a person has since seen and accepted it
  source text not null,
  confirmed boolean not null default false,
  instrument_version_id uuid not null references instrument_versions(id),
  created_at timestamptz not null default now(),
  constraint answers_source_known check (source in ('person', 'intake')),
  constraint answers_person_is_confirmed check (source <> 'person' or confirmed)
);

create index answers_current on answers (project_id, question_id, created_at desc);

-- Insert-only (NFR-1). The current answer is the newest row.
create or replace function answers_are_insert_only() returns trigger as $$
begin
  raise exception 'answers are insert-only (SPEC NFR-1): record a new answer instead of changing %', old.id;
end;
$$ language plpgsql;

create trigger answers_no_update before update on answers
  for each row execute function answers_are_insert_only();
create trigger answers_no_delete before delete on answers
  for each row execute function answers_are_insert_only();

-- Activated versions are immutable (NFR-11): activation may be set once,
-- and nothing about an activated version may change afterwards.
create or replace function instrument_version_immutable() returns trigger as $$
begin
  if old.activated_at is not null then
    raise exception 'instrument version %/% is activated and immutable (SPEC NFR-11): create a new version', old.slug, old.version;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger instrument_versions_immutable before update on instrument_versions
  for each row execute function instrument_version_immutable();
