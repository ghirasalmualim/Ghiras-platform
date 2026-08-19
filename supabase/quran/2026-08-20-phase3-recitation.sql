-- Phase 3 - Smart recitation (tasmee)
--
-- WHAT THIS ADDS
--   1. quran_recitation_session : one row per finished recitation attempt.
--   2. Four new event kinds the future garden will read.
--
-- WHAT THIS DOES NOT ADD
--   No audio. Not a path, not a blob, not a reference. The child's voice is
--   captured in memory, sent to the provider, turned into a result, and
--   dropped. There is deliberately no column here that could ever hold it.
--
--   No tajweed score. No pronunciation score. Memorization only.
--   Those are a separate stage with a separate verified model.
--
-- WHY STORE THE SESSION AT ALL
--   The spaced-review engine needs to know which ayah was weak and when.
--   Everything stored here is a *result*, never a recording.
--
-- SAFE TO RUN TWICE.

-- ── 1. Sessions ────────────────────────────────────────────
create table if not exists public.quran_recitation_session (
  id                bigserial   primary key,
  user_id           uuid        not null references auth.users(id) on delete cascade,

  surah             smallint    not null check (surah between 1 and 114),
  from_ayah         smallint    not null check (from_ayah >= 1),
  to_ayah           smallint    not null check (to_ayah >= from_ayah),

  -- 'train' allows hints, 'test' does not.
  mode              text        not null check (mode in ('train','test')),

  -- Ghiras levels, never a 0-100 score shown to a child.
  -- 'unjudged' means we refused to judge: bad audio, cut recording, silence.
  level             text        not null
                      check (level in ('excellent','very_good','needs_light',
                                       'needs_review','unjudged')),

  -- Internal 0..1 used by the review engine only. Never displayed.
  internal_score    real,

  -- Confirmed errors only. UNCERTAIN is counted separately and never
  -- held against the student.
  confirmed_errors  smallint    not null default 0,
  uncertain_count   smallint    not null default 0,
  coverage          real,

  help_used         boolean     not null default false,
  chunk_count       smallint    not null default 1,
  audio_seconds     real,

  -- Ayahs that need reinforcement, e.g. [{"ayah":2,"atTransition":true}].
  -- Confirmed errors only: an uncertain position is never sent to review,
  -- otherwise a weak microphone would create homework the child never earned.
  weak_spots        jsonb       not null default '[]'::jsonb,

  created_at        timestamptz not null default now()
);

create index if not exists quran_recitation_user_idx
  on public.quran_recitation_session (user_id, created_at desc);

create index if not exists quran_recitation_segment_idx
  on public.quran_recitation_session (user_id, surah, from_ayah, to_ayah);

-- ── 2. New event kinds ─────────────────────────────────────
-- The garden is a later stage. We record its history now so that when it
-- is built it finds a real past instead of an empty page.
alter table public.quran_event drop constraint if exists quran_event_kind_check;

alter table public.quran_event add constraint quran_event_kind_check
  check (kind in (
    'daily_task_done','reviewed_on_time','segment_mastered',
    'streak_days','returned_after_break','review_without_hint',
    'recitation_completed','recitation_without_help',
    'weak_spot_improved','review_completed'
  ));

-- ── 3. Row level security ──────────────────────────────────
-- Same rule as the rest of the section: a student sees her own rows only.
alter table public.quran_recitation_session enable row level security;

drop policy if exists "quran recitation own" on public.quran_recitation_session;

create policy "quran recitation own"
  on public.quran_recitation_session
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
