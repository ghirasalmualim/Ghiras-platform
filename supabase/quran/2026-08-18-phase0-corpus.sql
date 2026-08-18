-- ============================================================
-- ⛔️ SUPERSEDED — DO NOT RUN THIS FILE.
--
-- Kept for history only. This file was written and approved in Phase 0
-- but was never executed against any database.
--
-- In Phase 1 the Quran text moved out of Postgres and into the repo as
-- a file (src/features/quran/corpus/), because the text never changes:
-- Git shows any altered word as a red line in review, the published
-- SHA-256 is computed over a file anyone can download and compare, and
-- the attribution travels in the same commit as the text it describes.
-- No table gives those guarantees.
--
-- The live schema is:  supabase/quran/2026-08-19-phase1.sql
-- It holds only what genuinely changes: reciters, learner progress,
-- and curriculum lessons.
--
-- Running this file would create six tables that nothing reads.
-- ============================================================

-- ============================================================
-- Quran section — Phase 0: reference corpus tables
--
-- These tables hold the Quranic text. They are READ-ONLY to the
-- application at runtime: RLS grants SELECT to everyone and grants
-- no INSERT/UPDATE/DELETE to any role. Only the import script,
-- running with the service_role key (which bypasses RLS), may write.
--
-- text_uthmani is the authoritative text. Nothing in the application
-- may alter it. Normalisation for search or recitation comparison
-- must produce a separate value and never overwrite this column.
--
-- Source: Tanzil Quran Text (Uthmani, Version 1.1) — tanzil.net
-- Licence: Creative Commons Attribution 3.0. Changing the text is
-- not permitted by the licence, which matches our own requirement.
--
-- Comments in English on purpose: Arabic text after "--" breaks
-- text direction inside the Supabase SQL editor.
-- ============================================================

-- ── 1. Surah index ──────────────────────────────────────────
create table if not exists public.quran_surah (
  number            smallint primary key check (number between 1 and 114),
  name_ar           text     not null,
  name_translit     text     not null,
  name_en           text     not null,
  ayah_count        smallint not null check (ayah_count > 0),
  revelation_place  text     not null check (revelation_place in ('meccan','medinan')),
  revelation_order  smallint not null
);

-- ── 2. Ayah text ────────────────────────────────────────────
-- text_uthmani  : authoritative, never modified, never normalised in place
-- text_simple   : diacritic-free copy from the same source, for search and
--                 for recitation comparison. A separate column, not a
--                 replacement — both come from Tanzil, neither is derived
--                 by us from the other.
create table if not exists public.quran_ayah (
  surah         smallint not null references public.quran_surah(number),
  ayah          smallint not null check (ayah > 0),
  text_uthmani  text     not null,
  text_simple   text     not null,
  primary key (surah, ayah)
);

create index if not exists quran_ayah_surah_idx on public.quran_ayah (surah);

-- ── 3. Word index ───────────────────────────────────────────
-- Needed by the hidden-text and missing-word activities, and later by
-- recitation alignment. Position is 1-based within the ayah.
-- Words are split from the source text; they are never reordered,
-- and no activity may present them out of their original order.
--
-- Words are split from text_uthmani ONLY, because the two Tanzil
-- editions tokenise differently in 363 of the 6236 ayahs: the Uthmani
-- script writes some particles joined where the simple script separates
-- them (2:21 has يَٰٓأَيُّهَا as one word, يا أيها as two). Aligning them
-- one-to-one would be inventing a correspondence that does not exist.
--
-- text_normalized is DERIVED by our normaliser from text_uthmani, for
-- search and recitation comparison only. It is never authoritative and
-- never written back over text_uthmani.
create table if not exists public.quran_word (
  surah           smallint not null,
  ayah            smallint not null,
  position        smallint not null check (position > 0),
  text_uthmani    text     not null,
  text_normalized text     not null,
  primary key (surah, ayah, position),
  foreign key (surah, ayah) references public.quran_ayah(surah, ayah)
);

-- ── 4. Reciters and audio (structure only in Phase 0) ───────
-- Left empty deliberately. No reciter is adopted before its source,
-- licence and permission to use inside the platform are confirmed.
create table if not exists public.quran_reciter (
  id          text primary key,
  name_ar     text not null,
  style       text,
  base_url    text not null,
  licence     text not null,
  source_note text,
  is_active   boolean not null default false
);

create table if not exists public.quran_audio (
  reciter_id  text     not null references public.quran_reciter(id),
  surah       smallint not null,
  ayah        smallint not null,
  url         text     not null,
  duration_ms integer,
  primary key (reciter_id, surah, ayah),
  foreign key (surah, ayah) references public.quran_ayah(surah, ayah)
);

-- ── 5. Integrity record ─────────────────────────────────────
-- One row per import. Holds the SHA-256 of each source file so that
-- any later drift is detectable, plus who reviewed the text and when.
create table if not exists public.quran_corpus_meta (
  id                  bigserial primary key,
  source_name         text        not null,
  source_url          text        not null,
  edition             text        not null,
  riwayah             text        not null default 'hafs',
  licence             text        not null,
  uthmani_sha256      char(64)    not null,
  simple_sha256       char(64)    not null,
  surah_count         smallint    not null,
  ayah_count          integer     not null,
  word_count          integer     not null,
  imported_at         timestamptz not null default now(),
  reviewed_by         text,
  reviewed_at         timestamptz,
  is_current          boolean     not null default true
);

-- ── 6. Read-only enforcement ────────────────────────────────
-- RLS on, SELECT granted to everyone (the reading section is public),
-- and no write policy exists for any role. The import script uses the
-- service_role key, which bypasses RLS by design.
alter table public.quran_surah       enable row level security;
alter table public.quran_ayah        enable row level security;
alter table public.quran_word        enable row level security;
alter table public.quran_reciter     enable row level security;
alter table public.quran_audio       enable row level security;
alter table public.quran_corpus_meta enable row level security;

drop policy if exists "quran surah read"   on public.quran_surah;
drop policy if exists "quran ayah read"    on public.quran_ayah;
drop policy if exists "quran word read"    on public.quran_word;
drop policy if exists "quran reciter read" on public.quran_reciter;
drop policy if exists "quran audio read"   on public.quran_audio;
drop policy if exists "quran meta read"    on public.quran_corpus_meta;

create policy "quran surah read"   on public.quran_surah       for select using (true);
create policy "quran ayah read"    on public.quran_ayah        for select using (true);
create policy "quran word read"    on public.quran_word        for select using (true);
create policy "quran reciter read" on public.quran_reciter     for select using (is_active);
create policy "quran audio read"   on public.quran_audio       for select using (true);
create policy "quran meta read"    on public.quran_corpus_meta for select using (true);

-- Belt and braces: revoke write privileges from the client roles even
-- if a policy is added by mistake later.
revoke insert, update, delete on public.quran_surah       from anon, authenticated;
revoke insert, update, delete on public.quran_ayah        from anon, authenticated;
revoke insert, update, delete on public.quran_word        from anon, authenticated;
revoke insert, update, delete on public.quran_reciter     from anon, authenticated;
revoke insert, update, delete on public.quran_audio       from anon, authenticated;
revoke insert, update, delete on public.quran_corpus_meta from anon, authenticated;
