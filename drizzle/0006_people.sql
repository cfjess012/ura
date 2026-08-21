-- S2.5: people and attribution.
--
-- A real role model behind a pilot-grade switcher: authority is decided by
-- the role on the row, server-side (SPEC §2), so the sign-in mechanism can
-- change later without any authority logic moving.
--
-- answered_by is NULLABLE on purpose. Answers are insert-only (NFR-1), so
-- rows written before people existed cannot be attributed after the fact —
-- and fabricating an author would be worse than admitting the gap. They
-- read as "recorded before attribution existed"; every new row carries one.

create table people (
  id text primary key,
  name text not null,
  role text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  constraint people_role_known check (role in ('requester', 'assessor', 'admin'))
);

insert into people (id, name, role, title) values
  ('p.requester', 'Priya Sharma', 'requester', 'Workforce Operations'),
  ('p.assessor',  'Noah Kahan',   'assessor',  'Risk Assurance'),
  ('p.admin',     'Tom Holland',  'admin',     'Risk Platform Administration');

alter table answers add column answered_by text references people(id);
alter table projects add column created_by text references people(id);
