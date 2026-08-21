-- Instrument change 2026-08-21 (audit finding C-3, G-38).
--
-- Data classification was a multi-select whose own help text said "choose
-- the highest classification of any data involved". The words asked for one
-- answer; the control accepted four. Two people describing identical data
-- produced different records — one ticked Restricted, another ticked
-- Internal + Confidential + Restricted — and any later severity that reads
-- "the classification" got a different answer depending on who filled it in.
--
-- It also blocked a close: shutting the privacy area for genuinely public
-- data needs "Public and nothing else", which cannot be said about a list
-- without a negation the condition engine deliberately does not have.
--
-- Existing rows keep their high-water mark, which is what the question was
-- asking for all along.

alter table projects add column data_classification_level text not null default '';

update projects set data_classification_level =
  case
    when data_classification @> '["Restricted"]'   then 'Restricted'
    when data_classification @> '["Confidential"]' then 'Confidential'
    when data_classification @> '["Internal"]'     then 'Internal'
    when data_classification @> '["Public"]'       then 'Public'
    else ''
  end;

alter table projects drop column data_classification;
alter table projects rename column data_classification_level to data_classification;
