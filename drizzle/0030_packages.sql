-- Packaging (SPEC §4.5): the assessment as a record another system replays.
--
-- Insert-only and replayable, which is the same rule the answers live under
-- and for the same reason. A package is a claim about a moment — these
-- answers, attested by these people, judged against this edition of the
-- policy library. Editing one in place would rewrite a claim somebody made,
-- and re-exporting after a correction is a NEW claim, not a correction of
-- the old one. So a re-export inserts; nothing is overwritten.
--
-- The payload is stored whole rather than reassembled on read. A record
-- that recomputed itself would answer "what does this assessment say now",
-- and the question a replayable export exists to answer is "what did it say
-- when it was signed".

create table packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  packaged_by text not null references people(id),
  packaged_at timestamptz not null default now(),
  -- The whole assembled record, as it was handed over.
  payload jsonb not null,
  -- Denormalised out of the payload so a listing does not parse JSON to
  -- show a count. Derived at write time, never edited after.
  answer_count integer not null,
  finding_count integer not null
);

create index packages_by_project on packages (project_id, packaged_at desc);

-- The same trigger the answers carry, for the same reason.
create or replace function packages_are_insert_only() returns trigger as $$
begin
  raise exception
    'packages are insert-only (SPEC 4.5): re-export creates a new record instead of changing %',
    old.id;
end;
$$ language plpgsql;

create trigger packages_no_update
  before update or delete on packages
  for each row execute function packages_are_insert_only();

-- A package with no answers is not a package. This cannot be reached
-- through the product — the gate refuses long before — but the table is
-- the thing that has to be true, not the screen.
alter table packages add constraint packages_have_answers
  check (answer_count > 0);
