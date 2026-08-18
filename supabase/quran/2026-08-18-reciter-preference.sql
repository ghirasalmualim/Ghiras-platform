-- ============================================================
-- Quran section — remember the learner's chosen reciter
--
-- One column, not a new table: the choice is a single small setting,
-- and quran_last_position is already one row per learner holding her
-- state in this section. A settings table for one string would be
-- machinery without purpose.
--
-- OPTIONAL. The section works fully without it: the choice is always
-- stored in the browser first, so it already persists per device. This
-- column only makes it follow the learner between her phone and iPad.
-- Until it exists, the app writes the browser copy and silently skips
-- the database — nothing errors, nothing is lost.
--
-- No new policy needed: "quran position own" already covers every
-- column of this table, so a learner still reads and writes only her
-- own row.
--
-- Safe to run more than once.
--
-- Comments in English on purpose: Arabic text after "--" breaks text
-- direction inside the Supabase SQL editor.
-- ============================================================

alter table public.quran_last_position
  add column if not exists reciter_id text;
