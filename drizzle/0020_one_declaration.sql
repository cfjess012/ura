-- One submission, one declaration. Three simultaneous posts of the same
-- valid payload all succeeded: the UPDATE was guarded by `submitted_at is
-- null` but nothing checked whether it had actually changed a row, so the
-- declaration and its findings inserted regardless — and the submitted view
-- listed one Tier-3 "No" as three identical findings, against §19's
-- "exactly one control-gap finding".
--
-- The guard belongs here rather than in the action: a uniqueness rule
-- enforced by application code is a race waiting for a second process.
create unique index declarations_one_per_project on declarations (project_id);
