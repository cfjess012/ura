-- Instrument change 2026-08-21 (audit finding C-2, G-35).
--
-- Intake asked for vendor NAMES and inferred third-party involvement from
-- the field being filled in. Absence proved nothing — the condition engine
-- is positive-evidence only by design — so the Third-Party risk area could
-- only ever be opened, never closed, and "none" typed into the name box
-- opened it on a false positive.
--
-- Asking the fact directly lets intake close a whole risk area.

alter table projects add column third_party_involved text not null default '';
