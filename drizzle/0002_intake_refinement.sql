-- S1 refinement (slice review round 1): the intake set Jesse optimised.
-- Adds AI capture, initiative type, objective launch date, procurement
-- status; removes self-reported priority, lifecycle stage, and the two
-- deep-dive compliance blocks now asked at Tier 1/2 instead.
alter table projects
  add column uses_ai text not null default '',
  add column ai_use_case text not null default '',
  add column initiative_type text not null default '',
  add column prior_assessment_ref text not null default '',
  add column target_go_live date,
  add column coupa_onboarded text not null default '';

alter table projects
  drop column priority,
  drop column lifecycle_stage,
  drop column vendor_not_in_coupa,
  drop column compliance_areas,
  drop column pii_types;
