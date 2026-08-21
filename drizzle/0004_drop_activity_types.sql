-- G-20: intake's job is the identity record, not routing. Tier 1's gates
-- ask what changes, one at a time and specifically; asking a coarse version
-- of it at the front door was a worse question at a worse moment.
alter table projects drop column activity_types;
