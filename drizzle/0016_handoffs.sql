-- S4.7 — "leave this to us": a question handed to a person or an office,
-- and the conversation that settles it.
--
-- A hand-off is NOT an answer. Recording "I don't know" in `answers` would
-- claim the person answered something; what actually happened is that the
-- question moved to somebody else. So it lives here, and the answer table
-- stays a record of answers.
--
-- Insert-only, like every other piece of evidence: a resolved hand-off
-- stays on the record, because "this was too hard for the requester and a
-- named person settled it" is exactly the kind of fact this platform keeps.
create table handoffs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  question_id text not null,
  -- Exactly one of these. A hand-off goes to a named person OR to an
  -- office; "to nobody" is not a thing that can be recorded.
  to_person_id text references people(id),
  to_domain text,
  note text not null default '',
  asked_by text not null references people(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text references people(id),
  constraint handoff_has_one_recipient check (
    (to_person_id is not null and to_domain is null) or
    (to_person_id is null and to_domain is not null)
  ),
  constraint handoff_resolution_is_attributed check (
    (resolved_at is null and resolved_by is null) or
    (resolved_at is not null and resolved_by is not null)
  ),
  -- One open hand-off per question. Asking twice is the same ask.
  constraint handoff_one_open_per_question unique (project_id, question_id, resolved_at)
);

create index handoffs_open on handoffs (to_domain, to_person_id) where resolved_at is null;
create index handoffs_by_project on handoffs (project_id, created_at);

-- The conversation. Threaded: a reply may answer another reply.
create table handoff_replies (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references handoffs(id) on delete cascade,
  parent_id uuid references handoff_replies(id),
  author_id text not null references people(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index handoff_replies_by_handoff on handoff_replies (handoff_id, created_at);

-- Both tables are insert-only; only a hand-off's resolution may change.
create or replace function handoffs_are_insert_only() returns trigger as $$
begin
  if (new.project_id, new.question_id, new.to_person_id, new.to_domain,
      new.note, new.asked_by, new.created_at)
     is distinct from
     (old.project_id, old.question_id, old.to_person_id, old.to_domain,
      old.note, old.asked_by, old.created_at) then
    raise exception 'a hand-off is insert-only; it may be resolved, never rewritten';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger handoffs_no_rewrite before update on handoffs
  for each row execute function handoffs_are_insert_only();

create or replace function handoff_replies_are_insert_only() returns trigger as $$
begin
  raise exception 'a reply is insert-only; say something new instead of editing';
end;
$$ language plpgsql;

create trigger handoff_replies_no_edit before update on handoff_replies
  for each row execute function handoff_replies_are_insert_only();
create trigger handoff_replies_no_delete before delete on handoff_replies
  for each row execute function handoff_replies_are_insert_only();
