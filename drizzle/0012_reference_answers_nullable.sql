-- 0011 changed five columns to jsonb with ALTER COLUMN ... TYPE, which
-- carries the old NOT NULL constraint across. For the three single-value
-- fields that is wrong: "nobody has answered this yet" is a real state and
-- has to be storable, and writing SQL NULL failed with a constraint
-- violation the moment a person left an optional owner blank.
--
-- The two list-valued columns keep NOT NULL: an empty list already says
-- "asked, and the answer is none", which is a different fact from unasked
-- and must not collapse into it.
alter table projects alter column business_unit drop not null;
alter table projects alter column business_owner drop not null;
alter table projects alter column technical_owner drop not null;

-- The default was 'null'::jsonb — a JSON null, which reads back as the
-- *value* null rather than as no row value at all. SQL NULL is what the
-- rest of the codebase means by "empty".
alter table projects alter column business_unit set default null;
alter table projects alter column business_owner set default null;
alter table projects alter column technical_owner set default null;
update projects set business_unit = null where business_unit = 'null'::jsonb;
update projects set business_owner = null where business_owner = 'null'::jsonb;
update projects set technical_owner = null where technical_owner = 'null'::jsonb;
