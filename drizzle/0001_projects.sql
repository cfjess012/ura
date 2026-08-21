-- S1: projects with intake as the identity record (SPEC FR-1, FR-2).
create table projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- DESCRIPTION
  project_name text not null,
  business_purpose text not null default '',
  project_description text not null default '',
  tech_non_tech text not null default '',
  -- OWNERSHIP
  business_owner text not null default '',
  technical_owner text not null default '',
  collaborators text not null default '',
  related_assessments text not null default '',
  -- CATEGORIZATION
  business_unit text not null default '',
  other_units text not null default '',
  priority text not null default '',
  lifecycle_stage text not null default '',
  vendor_names text not null default '',
  vendor_not_in_coupa text not null default '',
  -- COMPLIANCE & DATA (multi-selects)
  compliance_areas jsonb not null default '[]',
  data_classification jsonb not null default '[]',
  data_elements jsonb not null default '[]',
  pii_types jsonb not null default '[]',
  constraint project_name_not_blank check (length(trim(project_name)) > 0)
);
