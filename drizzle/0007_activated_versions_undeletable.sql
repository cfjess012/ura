-- F4 (independent verification of S2.5): NFR-11 said an activated instrument
-- version is immutable, but the guard was a BEFORE UPDATE trigger only. A
-- DELETE walked straight past it — and deleting the version an assessment
-- pins is worse than editing it: the historical answers survive with a
-- dangling reference to the questions that were actually asked.
--
-- Immutable now means both verbs.

create or replace function instrument_version_not_deletable() returns trigger as $$
begin
  if old.activated_at is not null then
    raise exception
      'instrument version %/% is activated and cannot be deleted (SPEC NFR-11): assessments pin the version they were asked under',
      old.slug, old.version;
  end if;
  return old;  -- a draft version was never asked; it may go
end;
$$ language plpgsql;

create trigger instrument_versions_no_delete before delete on instrument_versions
  for each row execute function instrument_version_not_deletable();
