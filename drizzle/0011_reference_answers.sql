-- S4.5 — reference-backed answers (FR-29, FR-30, NFR-22; G-46, G-47).
--
-- Five intake fields stop being free text and become answers chosen from a
-- versioned list. An answer is a shape, not a string: the entry id, the
-- label as it appeared on screen, and the list version it was chosen from.
-- The label is stored redundantly on purpose — renaming a list entry must
-- not change what a past answer says.
--
-- Existing values were typed free-hand, so they convert to exactly what
-- they always were: off-list values. That is not a lossy migration, it is
-- the honest reading of text somebody typed into a box with no list
-- behind it.

alter table projects
  alter column business_unit drop default,
  alter column business_unit type jsonb using
    (case when coalesce(business_unit, '') = '' then 'null'::jsonb
          else jsonb_build_object('unlisted', business_unit) end),
  alter column business_unit set default 'null'::jsonb;

alter table projects
  alter column business_owner drop default,
  alter column business_owner type jsonb using
    (case when coalesce(business_owner, '') = '' then 'null'::jsonb
          else jsonb_build_object('unlisted', business_owner) end),
  alter column business_owner set default 'null'::jsonb;

alter table projects
  alter column technical_owner drop default,
  alter column technical_owner type jsonb using
    (case when coalesce(technical_owner, '') = '' then 'null'::jsonb
          else jsonb_build_object('unlisted', technical_owner) end),
  alter column technical_owner set default 'null'::jsonb;

-- These two take several answers, so they become arrays. A comma or newline
-- separated string was the only way to give more than one before.
--
-- Done as add-update-rename rather than ALTER ... USING: a USING expression
-- may not contain a subquery, and splitting a string into a list needs one.
alter table projects add column other_units_ref jsonb not null default '[]'::jsonb;
update projects set other_units_ref = coalesce(
  (select jsonb_agg(jsonb_build_object('unlisted', trim(part)))
     from unnest(string_to_array(replace(other_units, E'\n', ','), ',')) as part
    where trim(part) <> ''),
  '[]'::jsonb);
alter table projects drop column other_units;
alter table projects rename column other_units_ref to other_units;

alter table projects add column vendor_names_ref jsonb not null default '[]'::jsonb;
update projects set vendor_names_ref = coalesce(
  (select jsonb_agg(jsonb_build_object('unlisted', trim(part)))
     from unnest(string_to_array(replace(vendor_names, E'\n', ','), ',')) as part
    where trim(part) <> ''),
  '[]'::jsonb);
alter table projects drop column vendor_names;
alter table projects rename column vendor_names_ref to vendor_names;

-- The employee directory (G-46's deliberate exception). People are
-- operational rather than versioned — a real deployment resolves them from
-- an IdP, not a file — so the directory lives here and grows. Only the
-- three personas may sign in; the rest exist to be *chosen* as owners,
-- which is what a directory lookup gives you on day one.
alter table people add column if not exists email text not null default '';
alter table people add column if not exists signs_in boolean not null default false;

update people set signs_in = true, email = case id
  when 'p.requester' then 'priya.sharma@stelly.com'
  when 'p.assessor' then 'noah.kahan@stelly.com'
  when 'p.admin' then 'tom.holland@stelly.com'
  else email end
where id in ('p.requester', 'p.assessor', 'p.admin');

insert into people (id, name, role, title, email, signs_in) values
  ('d.acosta',   'Elena Acosta',    'requester', 'Director, Workforce Operations',  'elena.acosta@stelly.com', false),
  ('d.brennan',  'Marcus Brennan',  'requester', 'Head of Customer Service',        'marcus.brennan@stelly.com', false),
  ('d.chen',     'Wei Chen',        'requester', 'Principal Engineer',              'wei.chen@stelly.com', false),
  ('d.dube',     'Thandiwe Dube',   'requester', 'VP, Data & Analytics',            'thandiwe.dube@stelly.com', false),
  ('d.ferreira', 'Rui Ferreira',    'requester', 'Manager, Supply Chain Systems',   'rui.ferreira@stelly.com', false),
  ('d.grant',    'Alison Grant',    'requester', 'Director, Finance Systems',       'alison.grant@stelly.com', false),
  ('d.haddad',   'Yusuf Haddad',    'requester', 'Enterprise Architect',            'yusuf.haddad@stelly.com', false),
  ('d.imai',     'Kenji Imai',      'requester', 'Head of Product, Scheduling',     'kenji.imai@stelly.com', false),
  ('d.novak',    'Petra Novak',     'requester', 'Director, Human Resources',       'petra.novak@stelly.com', false),
  ('d.osei',     'Kwame Osei',      'requester', 'Manager, Information Security',   'kwame.osei@stelly.com', false),
  ('d.reyes',    'Camila Reyes',    'requester', 'Lead Platform Engineer',          'camila.reyes@stelly.com', false),
  ('d.whitfield','Grace Whitfield', 'requester', 'Senior Counsel, Legal',           'grace.whitfield@stelly.com', false)
on conflict (id) do nothing;
