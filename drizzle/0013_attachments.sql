-- S4.5 / FR-34 — documents attached to an assessment.
--
-- Bytes live in Postgres for the pilot and move to S3 at migration; the
-- swap is one store implementation, because nothing outside the store
-- knows where a file is kept (§26.2 — no application filesystem, ever).
--
-- Insert-only, like every other piece of evidence here. A file attached in
-- error is marked removed, never deleted: "this was attached and then
-- withdrawn" is a fact a reviewer may need, and a DELETE would erase it.
create table attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- Which question it answers. Attachments are not a general file dump.
  field_id text not null,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  bytes bytea not null,
  uploaded_by text references people(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by text references people(id),
  -- Withdrawal is recorded or it did not happen.
  constraint attachment_removal_is_attributed
    check ((removed_at is null and removed_by is null)
        or (removed_at is not null and removed_by is not null))
);

create index attachments_by_project on attachments (project_id, field_id, created_at);

-- The row itself is insert-only; only the withdrawal columns may change.
create or replace function attachments_are_insert_only() returns trigger as $$
begin
  if (new.project_id, new.field_id, new.file_name, new.content_type,
      new.size_bytes, new.bytes, new.uploaded_by, new.created_at)
     is distinct from
     (old.project_id, old.field_id, old.file_name, old.content_type,
      old.size_bytes, old.bytes, old.uploaded_by, old.created_at) then
    raise exception 'attachments are insert-only; a file may be withdrawn, never rewritten';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger attachments_no_rewrite
  before update on attachments
  for each row execute function attachments_are_insert_only();

create or replace function attachments_no_delete() returns trigger as $$
begin
  raise exception 'attachments are insert-only; mark it removed instead';
end;
$$ language plpgsql;

create trigger attachments_no_delete
  before delete on attachments
  for each row execute function attachments_no_delete();
