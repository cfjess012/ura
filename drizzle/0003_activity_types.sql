-- G-19: "Technology / Non-Technology" asked the requester to classify
-- against our taxonomy. Replaced by what they actually recognise — what the
-- activity introduces or changes — from which the classification is derived.
alter table projects
  add column activity_types jsonb not null default '[]';

alter table projects
  drop column tech_non_tech;
