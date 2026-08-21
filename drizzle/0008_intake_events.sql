-- F5 (independent verification of S2.5): gate answers recorded who gave
-- them, but intake did not. Intake writes update a mutable project row, so
-- the previous value simply vanished — "who changed the data classification,
-- and from what?" had no answer anywhere in the system. NFR-19 claimed
-- attribution across the assessment; this is the half that was missing.
--
-- The row is the record, not the projects table: insert-only, same rule as
-- answers (NFR-1). The projects row stays as the fast current-value read.

create table intake_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  field_id text not null,
  -- jsonb, not text: a multi-select's previous value is a list, and
  -- flattening it to a string would lose which options were removed.
  previous_value jsonb,
  value jsonb,
  -- NULL where no person was attached to the write (a migration, an import).
  -- Fabricating an author would be worse than admitting the gap.
  changed_by text references people(id),
  created_at timestamptz not null default now()
);

create index intake_events_by_project on intake_events (project_id, created_at desc);

create or replace function intake_events_are_insert_only() returns trigger as $$
begin
  raise exception 'intake events are insert-only (SPEC NFR-1): record a new change instead of rewriting %', old.id;
end;
$$ language plpgsql;

create trigger intake_events_no_update before update on intake_events
  for each row execute function intake_events_are_insert_only();
create trigger intake_events_no_delete before delete on intake_events
  for each row execute function intake_events_are_insert_only();
