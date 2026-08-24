-- Phase 2 · documents a requester supplies, and the answers drafted from them.
--
-- Two decisions worth stating, because both are boundaries.
--
-- 1. **Text only, never the original bytes.** §3.6 leaves the attachment
--    retention posture open and it blocks S4.6. Storing extracted text
--    scoped to one assessment is narrower than storing files: there is no
--    binary store, no download path, and nothing to leak that the person
--    did not already type into the record. The retention decision still
--    gates real documents; the pilot is synthetic.
--
-- 2. **A drafted answer is an unconfirmed answer, not a separate thing.**
--    The answers table already carries `source` and `confirmed`, and
--    already refuses an unconfirmed answer from a person. Adding a third
--    source rather than a second mechanism means the ledger, the summary
--    and the export keep working with no new concept — and insert-only
--    means accepting a draft leaves the draft on the record.

create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  -- What the person called it. Shown as the source of a quote, so it must
  -- read as a document a human would recognise (§24.2).
  name text not null,
  -- The extracted text. This is what quotes are checked against, so it is
  -- the evidence — the file it came from is not kept.
  body text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  constraint documents_name_present check (length(btrim(name)) > 0),
  constraint documents_body_present check (length(btrim(body)) > 0)
);

create index documents_by_project on documents (project_id, uploaded_at desc);

create trigger documents_no_update before update on documents
  for each row execute function evidence_is_insert_only();
create trigger documents_no_delete before delete on documents
  for each row execute function evidence_is_insert_only();

-- A drafted answer carries the passage it came from. Without that it is a
-- guess wearing an answer's clothes.
alter table answers
  add column basis text,
  add column source_quote text,
  add column source_ref text;

alter table answers drop constraint answers_source_known;
alter table answers add constraint answers_source_known
  check (source in ('person', 'intake', 'drafted'));

-- A draft is never confirmed on arrival. Confirming it is a person's act,
-- and that act writes a new row.
alter table answers add constraint answers_draft_unconfirmed
  check (source <> 'drafted' or confirmed = false);

-- Never-guess, in the schema (§7). A drafted answer either points at the
-- passage it came from, or it abstained and carries nothing.
alter table answers add constraint answers_draft_grounded
  check (
    source <> 'drafted'
    or (
      basis in ('stated', 'inferred')
      and source_quote is not null and length(btrim(source_quote)) > 0
      and source_ref is not null and length(btrim(source_ref)) > 0
    )
  );

-- Evidence only rides with a draft. A person's own answer is grounded in
-- the fact that they gave it.
alter table answers add constraint answers_evidence_is_for_drafts
  check (
    source = 'drafted'
    or (basis is null and source_quote is null and source_ref is null)
  );
