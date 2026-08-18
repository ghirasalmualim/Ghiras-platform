-- ============================================================
-- Quran section — Phase 2: practice, mastery and spaced review
--
-- Four tables. Each stores the minimum that is actually used, and
-- nothing else.
--
-- What is NOT here, and never will be: audio, recordings, transcripts,
-- or anything derived from a child's voice. When smart recitation
-- arrives, audio is analysed and discarded in the same request; only a
-- result is ever written.
--
-- Nor is there any ranking or comparison between learners. There is no
-- leaderboard column because there is no leaderboard.
--
-- Safe to run more than once.
--
-- Comments in English on purpose: Arabic text after "--" breaks text
-- direction inside the Supabase SQL editor.
-- ============================================================

-- ── 1. Practice attempts ────────────────────────────────────
-- One row per completed exercise. This is the raw record the mastery
-- model reads; everything else is derived from it.
--
-- `duration_ms` is nullable and used only when we need to understand a
-- pattern. Time is NEVER a measure of difficulty and never affects
-- mastery, scheduling, or what the learner is shown.
create table if not exists public.quran_activity_attempt (
  id          bigserial   primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  surah       smallint    not null check (surah between 1 and 114),
  from_ayah   smallint    not null check (from_ayah > 0),
  to_ayah     smallint    not null check (to_ayah > 0),
  ayah        smallint    not null check (ayah > 0),
  activity    text        not null
                check (activity in ('missing_word','complete_ayah','next_ayah','listen_identify')),
  first_try   boolean     not null,
  attempts    smallint    not null default 1 check (attempts between 1 and 20),
  hint_level  smallint    not null default 0 check (hint_level between 0 and 3),
  duration_ms integer,
  created_at  timestamptz not null default now(),
  check (to_ayah >= from_ayah)
);

create index if not exists quran_attempt_user_segment_idx
  on public.quran_activity_attempt (user_id, surah, from_ayah, to_ayah, created_at desc);

-- ── 2. Review state per segment ─────────────────────────────
-- The Leitner box, when it is next due, and how many DIFFERENT days
-- the learner has succeeded on. Distinct days matter: six correct
-- answers in one sitting prove short-term recall, not memorisation.
create table if not exists public.quran_review_state (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  surah            smallint    not null check (surah between 1 and 114),
  from_ayah        smallint    not null check (from_ayah > 0),
  to_ayah          smallint    not null check (to_ayah > 0),
  box              smallint    not null default 0 check (box between 0 and 5),
  distinct_days    smallint    not null default 0 check (distinct_days >= 0),
  last_reviewed_on date,
  due_on           date        not null,
  updated_at       timestamptz not null default now(),
  primary key (user_id, surah, from_ayah, to_ayah),
  check (to_ayah >= from_ayah)
);

create index if not exists quran_review_due_idx
  on public.quran_review_state (user_id, due_on);

-- ── 3. Memorisation goals ───────────────────────────────────
-- The goal only: segment plus target date. The day-by-day plan is
-- computed on demand, never stored — a stored plan goes stale the day
-- the learner misses, and would need a job to rebuild it. Computing it
-- from (what is left, days remaining, what is mastered) makes missing a
-- day redistribute itself with no intervention.
--
-- `lesson_id` links a curriculum lesson to its goal. The general
-- section leaves it null. Same table, same planner, one engine.
create table if not exists public.quran_goal (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  surah       smallint    not null check (surah between 1 and 114),
  from_ayah   smallint    not null check (from_ayah > 0),
  to_ayah     smallint    not null check (to_ayah > 0),
  target_date date        not null,
  source      text        not null default 'personal'
                check (source in ('personal','curriculum')),
  lesson_id   uuid        references public.quran_curriculum_lesson(id) on delete set null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  check (to_ayah >= from_ayah)
);

create index if not exists quran_goal_user_active_idx
  on public.quran_goal (user_id, is_active, target_date);

-- ── 4. Events ───────────────────────────────────────────────
-- Small, append-only log of things worth celebrating later. Phase 2
-- writes them; nothing reads them yet.
--
-- It exists now so that the garden in a later phase can be built by
-- reading this log, instead of re-deriving progress from scratch or —
-- worse — growing a second progress system beside this one.
create table if not exists public.quran_event (
  id         bigserial   primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  kind       text        not null
               check (kind in (
                 'daily_task_done','reviewed_on_time','segment_mastered',
                 'streak_days','returned_after_break','review_without_hint'
               )),
  surah      smallint,
  from_ayah  smallint,
  to_ayah    smallint,
  created_at timestamptz not null default now()
);

create index if not exists quran_event_user_idx
  on public.quran_event (user_id, created_at desc);

-- ── 5. Row level security ───────────────────────────────────
alter table public.quran_activity_attempt enable row level security;
alter table public.quran_review_state     enable row level security;
alter table public.quran_goal             enable row level security;
alter table public.quran_event            enable row level security;

drop policy if exists "quran attempt own" on public.quran_activity_attempt;
drop policy if exists "quran review own"  on public.quran_review_state;
drop policy if exists "quran goal own"    on public.quran_goal;
drop policy if exists "quran event own"   on public.quran_event;

-- Each learner reads and writes her own rows only. `using` stops
-- reading someone else's; `with check` stops writing under someone
-- else's id. Both are needed.
create policy "quran attempt own" on public.quran_activity_attempt for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "quran review own" on public.quran_review_state for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "quran goal own" on public.quran_goal for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "quran event own" on public.quran_event for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
