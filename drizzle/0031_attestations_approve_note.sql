-- S13 · An approval owes a note too.
--
-- The owner's call of 2026-08-25: "approved" with nothing beside it records
-- that somebody clicked, not what they concluded. attestationProblem() has
-- enforced it since; the database did not, and every other rule in this
-- table is a CHECK on the stated principle that a rule enforced only by
-- application code is a rule somebody can forget (S13 audit, defect c).
--
-- NOT VALID: approvals recorded before the owner's call may carry an empty
-- note, and they are evidence — rewriting them to satisfy a newer rule
-- would be the edit the insert-only triggers exist to refuse. New rows are
-- held to it from here on; the old ones stay as they were written.
alter table attestations
  add constraint attestations_approve_explained
  check (act <> 'approve' or length(btrim(note)) > 0) not valid;
