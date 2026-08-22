-- S4.7 — "Clear all" without a notifications table.
--
-- The prior platform stored one row per recipient per event and then
-- mutated read/cleared flags on them. We do not need the rows: news is
-- derived from the replies themselves, and "cleared" is a single watermark
-- per person. Anything newer than the watermark is news; anything older is
-- not. No fan-out on write, nothing to mark read one by one, and no way for
-- a stored message to disagree with the thing it describes.
alter table people add column if not exists news_cleared_at timestamptz;
