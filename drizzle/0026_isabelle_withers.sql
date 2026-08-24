-- A fourth requester in the directory.
--
-- `d.` like every other directory entry, and `signs_in = false` here,
-- because an integration test enforces exactly that: a `d.` person cannot
-- sign in on the strength of a migration alone. Who appears at the pilot
-- front door is decided at seed time, the same way Alison Grant and Grace
-- Whitfield appear — by owning work (G-46, and scripts/seed-demo.mjs).
insert into people (id, name, role, title, email, signs_in) values
  ('d.withers', 'Isabelle Withers', 'requester', 'Head of Claims Operations',
   'isabelle.withers@stelly.com', false)
on conflict (id) do update
  set name = excluded.name,
      title = excluded.title,
      email = excluded.email;
