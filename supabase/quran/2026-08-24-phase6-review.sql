-- ═══════════════════════════════════════════════════════════════
-- المرحلة ٦ — المراجعة الذكية للحفظ
-- ═══════════════════════════════════════════════════════════════
--
-- جزءان:
--   ١) quran_memory_spot — مواضع التثبيت على مستوى الآية، تُغذّى
--      من التسميع المحكوم خادميًا وحده.
--   ٢) client_key على جلسة التسميع — يجعل «إنهاء الجلسة» idempotent:
--      إعادة إرسال نفس الجلسة لا تضاعف عقوبةً ولا تغيّر جدولًا مرتين.
--
-- ⚠️ التوافق الخلفي: كل شيء هنا إضافة — لا تعديل عمود قائم ولا حذف.
--    السجلات القديمة بلا client_key تبقى صالحة (العمود يقبل null)،
--    وجدول المواضع يبدأ فارغًا ويمتلئ من الجلسات القادمة وحدها.

-- ── ١. مواضع التثبيت ────────────────────────────────────────────
-- صفٌّ لكل (مستخدم × سورة × آية) رُصد فيها خطأ مؤكَّد.
-- العدّادات كلها «أيام مختلفة» لا مرّات — عشر جلسات في يوم = يوم،
-- كما في quran_review_state.distinct_days سواءً بسواء.
create table if not exists public.quran_memory_spot (
  user_id            uuid        not null references auth.users(id) on delete cascade,
  surah              smallint    not null check (surah between 1 and 114),
  ayah               smallint    not null check (ayah > 0),
  -- أيام مختلفة تأكّد فيها خطأ في هذه الآية
  confirm_days       smallint    not null default 0 check (confirm_days >= 0),
  -- أيام مختلفة قُرئت نظيفةً منذ آخر تعثّر (يُصفَّر عند كل تعثّر جديد)
  clear_days         smallint    not null default 0 check (clear_days >= 0),
  -- أيام مختلفة كان التعثّر فيها في أول الآية — في الانتقال إليها
  transition_days    smallint    not null default 0 check (transition_days >= 0),
  last_confirmed_on  date,
  last_cleared_on    date,
  last_transition_on date,
  first_seen_on      date        not null,
  updated_at         timestamptz not null default now(),
  primary key (user_id, surah, ayah)
);

-- قائمة «مواضع اليوم» تُقرأ لكل مستخدم — فهرسها هو مفتاحها الأساسي.

-- ── ٢. مفتاح idempotency لجلسة التسميع ──────────────────────────
-- المتصفح يولّد مفتاحًا لكل جلسة ويعيده نفسه لو أعاد الإرسال.
-- الفهرس الفريد الجزئي يجعل التكرار يُرفض في القاعدة نفسها لا في
-- الكود وحده — والسجلات القديمة (null) خارج الفهرس فلا تتصادم.
alter table public.quran_recitation_session
  add column if not exists client_key text
  check (client_key is null or char_length(client_key) between 8 and 64);

create unique index if not exists quran_recitation_client_key_uniq
  on public.quran_recitation_session (user_id, client_key)
  where client_key is not null;

-- ── ٣. أمن الصفوف ────────────────────────────────────────────────
-- نفس عهد الحديقة حرفًا: القراءة للمالك، والكتابة **لا سياسة لها
-- أصلًا** — فلا يكتب فيها إلا الخادم بمفتاح الخدمة بعد أن يحكم
-- بنفسه. لو كتبها المتصفح لاستطاعت وحدة التطوير أن تخترع تعثّرًا
-- أو تمحو تاريخًا في سطر واحد.
alter table public.quran_memory_spot enable row level security;

drop policy if exists "memory spot read own" on public.quran_memory_spot;
create policy "memory spot read own"
  on public.quran_memory_spot for select
  using (auth.uid() = user_id);
