-- ═══════════════════════════════════════════════════════════════
-- المرحلة ٩ — اختبارات ثبات الحفظ
-- ═══════════════════════════════════════════════════════════════
--
-- ⚠️ لا جدول جديد: quran_recitation_session يكفي — الاختبار جلسةُ
--    تسميعٍ يختار غراسُ مقطعَها، لا نظامٌ ثانٍ. عمودٌ واحد يميّز
--    نوع الجلسة، وdefault يجعل كل السجلات القديمة «تسميعًا» كما
--    كانت — backward-compatible حرفًا.
--
-- (mode القائم شيء آخر: train/test يحكم التلميح لا نوعَ الجلسة.)

alter table public.quran_recitation_session
  add column if not exists session_type text not null default 'recitation'
  check (session_type in ('recitation','stability'));

-- «آخر اختبار ثبات لمقطع» يُسأل عنه كثيرًا — فهرس جزئي صغير
create index if not exists quran_recitation_stability_idx
  on public.quran_recitation_session (user_id, surah, created_at desc)
  where session_type = 'stability';
