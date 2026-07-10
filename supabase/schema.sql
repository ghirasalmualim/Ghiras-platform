-- ============================================================
--  منصة غراس المعلم — مخطط قاعدة البيانات الكامل
--  Ghiras Al-Muallim Platform — Database Schema v1.0
--  ينفَّذ مرة واحدة في: Supabase → SQL Editor → New Query
-- ============================================================

-- ─────────────────────────────────────────────
-- 0) تنظيف وقائي — يجعل الملف آمناً لإعادة التشغيل
--    (لا يحذف شيئاً إن لم يكن موجوداً أصلاً)
-- ─────────────────────────────────────────────

drop table if exists public.invoices      cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.coupons       cascade;
drop table if exists public.plans         cascade;
drop table if exists public.game_visits   cascade;
drop table if exists public.login_logs    cascade;
drop table if exists public.permissions   cascade;
drop table if exists public.profiles      cascade;
drop table if exists public.games         cascade;
drop table if exists public.subjects      cascade;
drop table if exists public.grades        cascade;
drop table if exists public.stages        cascade;
drop function if exists public.can_access_subject(uuid);
drop function if exists public.is_admin();
drop type if exists public.payment_status;
drop type if exists public.billing_cycle;
drop type if exists public.scope_type;
drop type if exists public.user_status;
drop type if exists public.user_role;

-- ─────────────────────────────────────────────
-- 1) المحتوى التعليمي: مراحل ← صفوف ← مواد ← ألعاب
-- ─────────────────────────────────────────────

create table public.stages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                -- «المرحلة الابتدائية»
  slug        text not null unique,         -- primary
  sort_order  int  not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.grades (
  id          uuid primary key default gen_random_uuid(),
  stage_id    uuid not null references public.stages(id) on delete cascade,
  name        text not null,                -- «الصف الأول»
  slug        text not null,                -- grade-1
  sort_order  int  not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (stage_id, slug)
);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  grade_id    uuid not null references public.grades(id) on delete cascade,
  name        text not null,                -- «التربية الإسلامية»
  slug        text not null,                -- islamic
  icon        text,                         -- رمز تعبيري أو اسم أيقونة
  color       text,                         -- لون مميز للمادة (hex)
  sort_order  int  not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (grade_id, slug)
);

create table public.games (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  title        text not null,
  description  text,
  cover_url    text,
  game_url     text not null,               -- لا يُرسل للمتصفح إلا بعد التحقق
  category     text,
  accent_color text,
  sort_order   int  not null default 0,
  is_visible   boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 2) المستخدمون والصلاحيات
--    profiles مرتبط بجدول auth.users المدمج في Supabase
-- ─────────────────────────────────────────────

create type public.user_role   as enum ('admin', 'teacher');
create type public.user_status as enum ('active', 'expired', 'suspended');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  username    text not null unique,
  phone       text,
  email       text,
  role        public.user_role   not null default 'teacher',
  status      public.user_status not null default 'active',
  sub_start   date,
  sub_end     date,
  last_active timestamptz,
  created_at  timestamptz not null default now()
);

-- الصلاحيات المرنة: منح وصول لمنصة كاملة / مرحلة / صف / مادة
create type public.scope_type as enum ('all', 'stage', 'grade', 'subject');

create table public.permissions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  scope      public.scope_type not null,
  stage_id   uuid references public.stages(id)   on delete cascade,
  grade_id   uuid references public.grades(id)   on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- كل سطر صلاحية يجب أن يطابق نوعه:
  constraint scope_shape check (
    (scope = 'all'     and stage_id is null and grade_id is null and subject_id is null) or
    (scope = 'stage'   and stage_id is not null and grade_id is null and subject_id is null) or
    (scope = 'grade'   and grade_id is not null and subject_id is null) or
    (scope = 'subject' and subject_id is not null)
  )
);

-- ─────────────────────────────────────────────
-- 3) السجلات والإحصائيات
-- ─────────────────────────────────────────────

create table public.login_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  username   text,
  success    boolean not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.game_visits (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 4) البنية المستقبلية للدفع الإلكتروني (جاهزة، غير مفعّلة)
--    Apple Pay · KNET · Visa/Mastercard · Google Pay
--    تفعيلها لاحقاً = إضافة مزوّد دفع فقط، دون تعديل البنية
-- ─────────────────────────────────────────────

create type public.billing_cycle  as enum ('monthly', 'yearly', 'one_time');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

-- الباقات: مادة واحدة / صف / مرحلة / المنصة كاملة
create table public.plans (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  scope        public.scope_type not null default 'all',
  stage_id     uuid references public.stages(id),
  grade_id     uuid references public.grades(id),
  subject_id   uuid references public.subjects(id),
  price_kwd    numeric(8,3) not null default 0,   -- الدينار الكويتي (3 منازل)
  cycle        public.billing_cycle not null default 'yearly',
  is_active    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  discount_pct  int check (discount_pct between 1 and 100),
  discount_kwd  numeric(8,3),
  max_uses      int,
  used_count    int not null default 0,
  valid_from    date,
  valid_until   date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  plan_id      uuid references public.plans(id),
  coupon_id    uuid references public.coupons(id),
  starts_at    date not null default current_date,
  ends_at      date,
  auto_renew   boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id),
  amount_kwd     numeric(8,3) not null,
  status         public.payment_status not null default 'pending',
  provider       text,                      -- knet / apple_pay / visa / ...
  provider_ref   text,                      -- مرجع العملية لدى مزوّد الدفع
  paid_at        timestamptz,
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 5) دوال مساعدة
-- ─────────────────────────────────────────────

-- هل المستخدم الحالي مدير؟
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- هل يملك المستخدم الحالي صلاحية على مادة معينة؟
-- (تتحقق من: الحالة فعال + الاشتراك غير منتهٍ + وجود صلاحية مطابقة)
create or replace function public.can_access_subject(p_subject uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.subjects s  on s.id = p_subject
    join public.grades   g  on g.id = s.grade_id
    where pr.id = auth.uid()
      and pr.status = 'active'
      and (pr.sub_end is null or pr.sub_end >= current_date)
      and (
        pr.role = 'admin'
        or exists (
          select 1 from public.permissions p
          where p.user_id = pr.id and (
            p.scope = 'all'
            or (p.scope = 'stage'   and p.stage_id   = g.stage_id)
            or (p.scope = 'grade'   and p.grade_id   = s.grade_id)
            or (p.scope = 'subject' and p.subject_id = s.id)
          )
        )
      )
  );
$$;

-- ─────────────────────────────────────────────
-- 6) أمان الصفوف (Row Level Security)
-- ─────────────────────────────────────────────

alter table public.stages        enable row level security;
alter table public.grades        enable row level security;
alter table public.subjects      enable row level security;
alter table public.games         enable row level security;
alter table public.profiles      enable row level security;
alter table public.permissions   enable row level security;
alter table public.login_logs    enable row level security;
alter table public.game_visits   enable row level security;
alter table public.plans         enable row level security;
alter table public.coupons       enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices      enable row level security;

-- الهيكل (مراحل/صفوف/مواد) مرئي للجميع — لا يحتوي أسراراً
create policy "public read stages"   on public.stages   for select using (is_visible or public.is_admin());
create policy "public read grades"   on public.grades   for select using (is_visible or public.is_admin());
create policy "public read subjects" on public.subjects for select using (is_visible or public.is_admin());

-- الألعاب (وروابطها) لا تُقرأ إلا بصلاحية — هذا جوهر حماية الروابط
create policy "games gated read" on public.games for select
  using (public.is_admin() or (is_visible and public.can_access_subject(subject_id)));

-- المدير يدير كل شيء
create policy "admin all stages"    on public.stages   for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all grades"    on public.grades   for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all subjects"  on public.subjects for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all games"     on public.games    for all using (public.is_admin()) with check (public.is_admin());

-- الملف الشخصي: كل مستخدم يرى ملفه، والمدير يرى الجميع
create policy "own profile read"  on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admin manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "own permissions read" on public.permissions for select using (user_id = auth.uid() or public.is_admin());
create policy "admin manage permissions" on public.permissions for all using (public.is_admin()) with check (public.is_admin());

create policy "admin read logs"   on public.login_logs  for select using (public.is_admin());
create policy "insert own visits" on public.game_visits for insert with check (user_id = auth.uid());
create policy "admin read visits" on public.game_visits for select using (public.is_admin());

create policy "admin manage plans"   on public.plans   for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manage coupons" on public.coupons for all using (public.is_admin()) with check (public.is_admin());
create policy "own subs read"  on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
create policy "admin manage subs" on public.subscriptions for all using (public.is_admin()) with check (public.is_admin());
create policy "own invoices read" on public.invoices for select using (user_id = auth.uid() or public.is_admin());
create policy "admin manage invoices" on public.invoices for all using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────
-- 7) البيانات الأساسية (المراحل والصفوف والمواد)
-- ─────────────────────────────────────────────

insert into public.stages (name, slug, sort_order) values
  ('المرحلة الابتدائية', 'primary', 1),
  ('المرحلة المتوسطة',  'middle',  2);

-- صفوف الابتدائية
insert into public.grades (stage_id, name, slug, sort_order)
select id, g.name, g.slug, g.sort
from public.stages,
lateral (values
  ('الصف الأول',  'grade-1', 1),
  ('الصف الثاني', 'grade-2', 2),
  ('الصف الثالث', 'grade-3', 3),
  ('الصف الرابع', 'grade-4', 4),
  ('الصف الخامس', 'grade-5', 5)
) as g(name, slug, sort)
where stages.slug = 'primary';

-- صفوف المتوسطة
insert into public.grades (stage_id, name, slug, sort_order)
select id, g.name, g.slug, g.sort
from public.stages,
lateral (values
  ('الصف السادس', 'grade-6', 1),
  ('الصف السابع', 'grade-7', 2),
  ('الصف الثامن', 'grade-8', 3),
  ('الصف التاسع', 'grade-9', 4)
) as g(name, slug, sort)
where stages.slug = 'middle';

-- المواد الست لكل صف
insert into public.subjects (grade_id, name, slug, icon, color, sort_order)
select gr.id, s.name, s.slug, s.icon, s.color, s.sort
from public.grades gr,
lateral (values
  ('اللغة العربية',      'arabic',    '📖', '#8E6FB0', 1),
  ('اللغة الإنجليزية',   'english',   '🔤', '#4A90B8', 2),
  ('التربية الإسلامية',  'islamic',   '🕌', '#7A9E7E', 3),
  ('الرياضيات',          'math',      '🔢', '#C9A84C', 4),
  ('العلوم',             'science',   '🔬', '#5BA88F', 5),
  ('الاجتماعيات',        'social',    '🗺️', '#C08552', 6)
) as s(name, slug, icon, color, sort);

-- ============================================================
-- تم! المخطط جاهز. الخطوة التالية: إنشاء حساب المدير (المرحلة 2)
-- ============================================================
