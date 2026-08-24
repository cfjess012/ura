-- §22.5 · a finding cites the policy version in force when it was raised.
--
-- Without this a later revision silently rewrites history: the clause text
-- is pinned, but nothing says which edition it came from, so "this breached
-- IAM-STD-004" cannot be checked against the standard as it stood.
-- Verification caught the column missing while the breach already carried
-- the value.
alter table findings add column policy_version text;

-- Existing breaches predate the column and the table is insert-only, so the
-- trigger has to stand down for exactly this statement. A migration is
-- schema history and may do that; application code may not, which is why
-- the repo exports no update function for this table.
--
-- 'unrecorded' rather than a guessed version number: the honest value is
-- that nobody wrote it down at the time, and inventing 4.2 here would put a
-- fact in the record that was never established.
alter table findings disable trigger findings_no_update;
update findings set policy_version = 'unrecorded'
  where kind = 'non-compliance' and policy_version is null;
alter table findings enable trigger findings_no_update;

alter table findings drop constraint findings_citation_with_breach;
alter table findings add constraint findings_citation_with_breach
  check (
    (kind = 'non-compliance') = (
      policy_ref is not null
      and policy_version is not null
      and clause_id is not null
      and clause_text is not null
      and expected is not null
    )
  );
