-- ============================================================
-- Quran section — Phase 1: the tables that actually change
--
-- The Quran text itself is NOT here. It lives in the repository as
-- src/features/quran/corpus/quran-uthmani.txt, verified by SHA-256 on
-- every boot. This file holds only what genuinely varies per user or
-- per school year: learner progress and curriculum lessons.
--
-- Safe to run more than once.
--
-- Comments in English on purpose: Arabic text after "--" breaks text
-- direction inside the Supabase SQL editor.
-- ============================================================

-- Note: reciters are NOT a table. Like the Quran text itself, they are
-- reference data that no user edits, so they live in the repository at
-- src/features/quran/engine/reciters.ts where every change to an audio
-- source or its licence goes through a dated, reviewable commit.
-- A row in a table can change with no such trace.

-- ── 1. Last reading position ────────────────────────────────
-- One row per learner. Lets her resume where she stopped.
create table if not exists public.quran_last_position (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  surah      smallint    not null check (surah between 1 and 114),
  ayah       smallint    not null check (ayah > 0),
  updated_at timestamptz not null default now()
);

-- ── 2. Segment progress ─────────────────────────────────────
-- A segment is one surah plus an ayah range: the unit of memorisation.
-- hide_level is how far she has progressed in the hidden-text drill
-- (0 = full text visible).
--
-- Note what is NOT here: no audio, no transcript, no recording of any
-- kind. When smart recitation arrives, audio is analysed and discarded
-- immediately; only results are ever stored.
create table if not exists public.quran_segment_progress (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  surah      smallint    not null check (surah between 1 and 114),
  from_ayah  smallint    not null check (from_ayah > 0),
  to_ayah    smallint    not null check (to_ayah > 0),
  status     text        not null default 'new'
               check (status in ('new','learning','memorized')),
  hide_level smallint    not null default 0 check (hide_level between 0 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, surah, from_ayah, to_ayah),
  check (to_ayah >= from_ayah)
);

create index if not exists quran_segment_progress_user_idx
  on public.quran_segment_progress (user_id, updated_at desc);

-- ── 3. Curriculum lessons ───────────────────────────────────
-- Deliberately EMPTY. The syllabus belongs to the Ministry of
-- Education; guessing at it would be worse than leaving it blank.
-- Rows are entered by an admin through the editor at /admin/quran.
create table if not exists public.quran_curriculum_lesson (
  id          uuid        primary key default gen_random_uuid(),
  stage_slug  text        not null,
  grade_slug  text        not null,
  term        smallint    not null check (term in (1,2)),
  title       text        not null,
  surah       smallint    not null check (surah between 1 and 114),
  from_ayah   smallint    not null check (from_ayah > 0),
  to_ayah     smallint    not null check (to_ayah > 0),
  requirement text        not null default 'memorize'
                check (requirement in ('read','memorize','review')),
  sort_order  smallint    not null default 0,
  is_visible  boolean     not null default true,
  created_at  timestamptz not null default now(),
  check (to_ayah >= from_ayah)
);

create index if not exists quran_curriculum_lesson_grade_idx
  on public.quran_curriculum_lesson (grade_slug, term, sort_order);

-- ── 4. Row level security ───────────────────────────────────
alter table public.quran_last_position      enable row level security;
alter table public.quran_segment_progress   enable row level security;
alter table public.quran_curriculum_lesson  enable row level security;

drop policy if exists "quran position own"        on public.quran_last_position;
drop policy if exists "quran progress own"        on public.quran_segment_progress;
drop policy if exists "quran lesson read"         on public.quran_curriculum_lesson;
drop policy if exists "quran lesson admin write"  on public.quran_curriculum_lesson;

-- Progress: each learner sees and writes her own rows only. `using` and
-- `with check` both matter — the first stops reading someone else's
-- progress, the second stops writing a row under someone else's id.
create policy "quran position own"
  on public.quran_last_position for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "quran progress own"
  on public.quran_segment_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lessons: visible ones readable by all (guests included); only admins
-- may write. public.is_admin() already exists in this database and is
-- the same guard the rest of the platform uses.
create policy "quran lesson read"
  on public.quran_curriculum_lesson for select using (is_visible or public.is_admin());

create policy "quran lesson admin write"
  on public.quran_curriculum_lesson for all
  using (public.is_admin()) with check (public.is_admin());

