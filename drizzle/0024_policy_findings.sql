-- §22.1 · a policy breach is a FINDING, not a new concept.
--
-- The prior platform arrived at this the hard way: it first called this a
-- "policy conflict", gave it its own table and its own free-text
-- resolution, and then renamed it — because what it actually is, is a true
-- answer breaching a requirement, and that resolves through the same four
-- governed dispositions as everything else (G-59, G-67).
--
-- So this adds a third kind to the findings we already have, plus the
-- citation needed to show both quotes side by side: the clause, and what
-- the person wrote. A finding that cannot show its authority is an
-- assertion.
alter table findings drop constraint findings_kind;
alter table findings add constraint findings_kind
  check (kind in ('gap', 'enhancement', 'non-compliance'));

alter table findings
  add column policy_ref text,
  add column clause_id text,
  add column clause_text text,
  add column expected text;

-- The citation is present exactly when the finding is a breach. A gap with
-- a policy reference would claim an authority it does not have; a breach
-- without one could not show the clause it breaches.
alter table findings add constraint findings_citation_with_breach
  check (
    (kind = 'non-compliance') = (
      policy_ref is not null
      and clause_id is not null
      and clause_text is not null
      and expected is not null
    )
  );
