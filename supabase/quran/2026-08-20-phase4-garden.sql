-- Phase 4 - My Garden
--
-- WHY THESE TABLES DO NOT LOOK LIKE THE OTHERS
--   Every other table in this section grants the learner "for all" on her own
--   rows. That is right for a preference or an attempt log: the worst case is
--   that she lies to herself about her own practice.
--
--   The garden is different. It is the reward surface. If the browser can
--   write to it, then one line in a developer console grows a full tree, and
--   every plant in the garden stops meaning anything. So these tables grant
--   SELECT only. There is deliberately no insert, update, or delete policy
--   for the learner -- not a restrictive one, none at all.
--
--   Writes happen exclusively in server routes using the service role, after
--   the server itself has judged the recitation. The browser reports nothing;
--   it only reads what the server decided.
--
-- WHY NOT READ quran_event
--   quran_event is written directly from the browser (features/quran/data/
--   practice.ts is a client module, and its policy allows insert). It is fine
--   as a personal activity trail. It is not evidence, and the garden must not
--   grow from it.
--
-- WHAT IS NOT HERE
--   No audio. No pronunciation score. No tajweed. No ranking, no leaderboard,
--   no other learner's name. The garden is a private experience.
--
-- SAFE TO RUN TWICE.

-- ── 1. The garden ──────────────────────────────────────────
create table if not exists public.quran_garden (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ── 2. Plants ──────────────────────────────────────────────
create table if not exists public.quran_garden_plant (
  id            bigserial   primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  plant_type    text        not null
                  check (plant_type in ('sunflower','tulip','rose','herb','tree')),

  -- Where it sits in the garden. Chosen by the learner when planting.
  slot          smallint    not null check (slot >= 0 and slot < 12),

  -- Internal progress. The learner never sees this number, only her plant.
  drops_used    smallint    not null default 0 check (drops_used >= 0),

  planted_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- One growing plant at a time. Finish what you started, then choose again.
-- This is also the answer to "can I switch seeds": no, not until it completes.
-- Documented in docs/quran-status.md.
create unique index if not exists quran_garden_one_growing
  on public.quran_garden_plant (user_id) where completed_at is null;

-- A slot holds one plant forever. Completed plants stay in the garden --
-- that is the whole point of a permanent garden.
create unique index if not exists quran_garden_slot_taken
  on public.quran_garden_plant (user_id, slot);

-- ── 3. Water drops ─────────────────────────────────────────
-- One row per earned drop. used_at null means it is still in her hand.
create table if not exists public.quran_garden_drop (
  id           bigserial   primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,

  reason       text        not null
                 check (reason in ('recitation_completed','recitation_without_help',
                                   'passage_mastered','weak_spot_improved',
                                   'review_completed')),

  -- What produced it, so an award can never be granted twice for one act.
  source_kind  text        not null check (source_kind in ('recitation','review')),
  source_id    bigint,

  -- 'surah:from-to'. Used by the anti-grinding rule below.
  segment_key  text        not null,
  day_key      date        not null default (now() at time zone 'utc')::date,

  earned_at    timestamptz not null default now(),
  used_at      timestamptz,
  plant_id     bigint      references public.quran_garden_plant(id) on delete set null
);

-- THE ANTI-GRINDING RULE.
--   The same passage, on the same day, for the same reason, earns once.
--   Reciting al-Fatiha twenty times before bed is one drop, not twenty.
--   This is what keeps the garden from rewarding volume, which was an
--   explicit requirement: a child memorising short surahs must not feel
--   her progress is worth less than someone reciting long passages.
create unique index if not exists quran_garden_drop_once
  on public.quran_garden_drop (user_id, reason, segment_key, day_key);

create index if not exists quran_garden_drop_held
  on public.quran_garden_drop (user_id, used_at) where used_at is null;

-- ── 4. Cosmetic rewards ────────────────────────────────────
-- Unlocked by fixed, known thresholds. Never random, never bought.
create table if not exists public.quran_garden_reward (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  reward_key   text        not null,
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, reward_key)
);

-- ── 5. Row level security ──────────────────────────────────
-- SELECT only, own rows. No write policy exists on purpose: see the header.
alter table public.quran_garden        enable row level security;
alter table public.quran_garden_plant  enable row level security;
alter table public.quran_garden_drop   enable row level security;
alter table public.quran_garden_reward enable row level security;

drop policy if exists "garden read own"        on public.quran_garden;
drop policy if exists "garden plant read own"  on public.quran_garden_plant;
drop policy if exists "garden drop read own"   on public.quran_garden_drop;
drop policy if exists "garden reward read own" on public.quran_garden_reward;

create policy "garden read own"        on public.quran_garden        for select using (auth.uid() = user_id);
create policy "garden plant read own"  on public.quran_garden_plant  for select using (auth.uid() = user_id);
create policy "garden drop read own"   on public.quran_garden_drop   for select using (auth.uid() = user_id);
create policy "garden reward read own" on public.quran_garden_reward for select using (auth.uid() = user_id);
