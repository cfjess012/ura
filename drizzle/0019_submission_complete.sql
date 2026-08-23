-- Salvaged from the prior platform (G-8: parts-shelf decisions are made at
-- the moment a slice needs the part, never in advance).
--
-- Its 0010_submit_for_review carried a constraint this one had missed: a
-- submission timestamp and a submitter are one fact, so neither may exist
-- without the other. Without it a half-written submission — a stamp with
-- nobody's name on it — is representable, and §4.1 calls submission a fact
-- about a person.
alter table projects add constraint projects_submission_complete check (
  (submitted_at is null) = (submitted_by is null)
);
