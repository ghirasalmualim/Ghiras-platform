# بيئة اختبار المصادقة — النسخة المصحَّحة

> ⚠️ **لم يُنشأ شيء.** تصميمٌ فقط.
> **وخمسُ نقاطٍ صحّحتِها، إحداها كانت ستُسقط جلسات كل المشتركات.**

---

## FINAL STAGING ARCHITECTURE

```
مشروع Supabase ثانٍ (ghiras-staging) — auth فارغة، بيانات صفر
        ▲
        │ مخطّط + صلاحيات + سياسات (بلا صفِّ بيانٍ واحد)
        │
مشروع الإنتاج ── قراءةٌ فقط ──► استخراج ──► الإصدار (git) ──► تركيب
```

- **الإنتاج يُقرأ ولا يُكتب** في كل أطوار البناء
- **متغيّر واحد يحكم نطاق الكوكي** في الثلاثة (متصفح · خادم · وسيط)
- **ما يُستخرج يدخل الإصدار** — فتنتهي مشكلة الـ١١ دالّة المجهولة

### ⚠️ تصحيح النقطة ①

`client.ts` يعمل في **المتصفح**، و**`COOKIE_DOMAIN` لا يصل إليه**.

**أثبتُّه على الحزم المُقدَّمة فعلًا:** قيمة `NEXT_PUBLIC_SUPABASE_URL`
**مُضمَّنةٌ حرفيًّا** في `page.js` و`layout.js`، و`process` نفسه غير
موجودٍ في المتصفح. **فغيرُ `NEXT_PUBLIC_` لا يصل.**

⚠️ **ولو نُفِّذ اقتراحي لكانت النتيجة:** `undefined` بصمت ⇒ **بلا نطاق**
⇒ كوكي الإنتاج تصير **محصورةً بالمضيف** ⇒ **التظليل الذي اخترعتُه
يصير حقيقةً على كل جهاز، وتسقط جلسات الجميع دفعةً واحدة.**

**والصواب: `NEXT_PUBLIC_COOKIE_DOMAIN`** — **متغيّرٌ واحد تقرأه الثلاثة**
(والخادم يقرأ `NEXT_PUBLIC_` بلا مانع)، فيستحيل الاختلاف بينها:

```ts
...(process.env.NEXT_PUBLIC_COOKIE_DOMAIN
      ? { domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN }
      : {})
```

⚠️ **ويُضمَّن وقت البناء لا وقت التشغيل** — فتغييره يوجب إعادة بناء،
**ويجب ضبطه في Vercel قبل أول نشرٍ بعد التغيير.**

---

## EXACT EXTRACTION METHOD

⚠️ **لا `pg_dump` ولا Supabase CLI مثبَّتان على الجهاز** — والأول خطوة.

```bash
brew install supabase/tap/supabase
```

```bash
supabase link --project-ref <PROD_REF>
```

**① المخطّط العام — بلا بيانات وبالصلاحيات:**
```bash
supabase db dump --db-url "$PROD_DB_URL" -f staging/01-public.sql
```

**② الأدوار والصلاحيات:**
```bash
supabase db dump --db-url "$PROD_DB_URL" --role-only -f staging/02-roles.sql
```

**③ سكيما `auth` — للاستخراج والفرز اليدوي لا للتركيب كما هي:**
```bash
supabase db dump --db-url "$PROD_DB_URL" --schema auth -f staging/03-auth-raw.sql
```

⚠️ **ولا يُركَّب `03` كما هو.** يُفرز منه **مشغّلُنا ودالّتُه فقط**،
ويُترك كلُّ ما تديره Supabase — فتركيبُه فوق `auth` مُدارة يُفسدها.

**④ التركيب في البيئة الجديدة:**
```bash
psql "$STAGING_DB_URL" -f staging/01-public.sql
psql "$STAGING_DB_URL" -f staging/02-roles.sql
psql "$STAGING_DB_URL" -f staging/04-auth-ours.sql
```

⚠️ **ولا `--no-privileges` إطلاقًا** — كان خطأً في خطّتي: الصلاحيات
**جزءُ ما نختبره** لا زينةً حوله.

⚠️ **وقبل التحقّق: لا صفوف.**
```bash
grep -icE "^(COPY|INSERT)" staging/01-public.sql   # = 0
```

---

## PRIVILEGES / RLS CAPTURE METHOD

**جردٌ بالقراءة من الإنتاج، ومقارنةٌ بالاختبار — والفرق يُصلَح لا يُفترض.**

```sql
-- P1: RLS enabled/forced
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public'
  and c.relname in ('profiles','login_logs','permissions');

-- P2: every policy, verbatim
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('profiles','login_logs','permissions')
order by tablename, policyname;

-- P3: table privileges
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('profiles','login_logs','permissions')
order by table_name, grantee;

-- P4: function execute privileges + security context
select p.proname, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner,
       coalesce(array_to_string(p.proacl,' | '),'(default)') as acl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('is_admin','can_access_subject','touch_last_active','touch_activity');
```

**ثم تُشغَّل الأربعة نفسها في الاختبار، ويُقارَن الناتج سطرًا بسطر.**

⚠️ **والمقياس: تطابقُ السلوك الأمني، لا وجودُ الأسماء.** بيئةٌ فيها
الجدول بلا سياسته تُعطي «نجاحًا» كاذبًا — **وهو أسوأ من لا اختبار.**

### ⑥ فحصُ ما يدخل الإصدار

**قبل التزام أي دالّة مستخرَجة:**

```bash
grep -inE "eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|service_role|postgres://|postgresql://|password *=|secret|api[_-]?key|bearer " staging/*.sql
```

⚠️ **ووجودُ الدالّة في الإنتاج لا يعني أنها آمنةٌ للالتزام.** أي مفتاحٍ
أو رابط اتصالٍ يظهر ⇒ **تُنقَّح الدالّة أولًا، ولا تُلتزَم كما هي.**

---

## ENVIRONMENT VARIABLES

| المتغيّر | Production | Staging | Local |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | الإنتاج | الاختبار | الاختبار |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | الإنتاج | الاختبار | الاختبار |
| `SUPABASE_SERVICE_ROLE_KEY` | الإنتاج | الاختبار | الاختبار |
| **`NEXT_PUBLIC_COOKIE_DOMAIN`** | `.ghiras-edu.com` | **فارغ** | **فارغ** |
| `GHIRAS_ENV` | `production` | `staging` | `staging` |
| `GAME_GATE_SECRET` | سرّ الإنتاج | سرٌّ آخر | سرٌّ آخر |
| `ANTHROPIC_API_KEY` · `AZURE_SPEECH_*` | حقيقية | **فارغة** | **فارغة** |

⚠️ **حارس الإقلاع:** إن كان `GHIRAS_ENV=staging` والرابط يحوي معرّف
مشروع الإنتاج ⇒ **يرفض التطبيق الإقلاع.** رفضٌ لا تنبيه.

⚠️ **و`.env.staging.local` في `.gitignore`.**

---

## TEST USERS

| # | الرقم | `role` | `status` | `sub_end` | الغرض |
|---|---|---|---|---|---|
| 1 | `10000001` | `teacher` | `active` | +سنة | المسار السليم |
| 2 | `10000002` | `teacher` | `active` | **أمس** | انتهاء الاشتراك |
| 3 | `10000003` | `teacher` | `suspended` | +سنة | الإيقاف بقرار |
| 4 | `10000004` | **`admin`** | `active` | **أمس** ⚠️ | **لغم الأدمِن — يُختبر اليوم لا في ديسمبر** |
| 5 | `10000005` | `teacher` | `active` | `null` | بلا اشتراك |
| 6 | `10000006` | — | — | — | **مستخدم مصادقةٍ بلا ملف** |

⚠️ **أرقامٌ تبدأ بـ`1`** — ثمانيةُ خاناتٍ يقبلها النظام، ولا وجود لها في
الكويت (الحقيقي يبدأ بـ`5` أو `6` أو `9`).

⚠️ **وكلماتها تُولَّد عشوائيًا، وتبقى في `.env.staging.local` وحده** — لا
في محادثةٍ ولا في التزام.

### ④ اختبار الأدمِن — الصيغة المصحَّحة

**الحساب ٤ باشتراكٍ منتهٍ أمس. والمطلوب إثباتُه:**

> **Admin must still access the areas from which admins are supposed to be exempt.**

| الموضع | المتوقَّع اليوم |
|---|---|
| `login/page.tsx` | ✅ **يمرّ** — الاستثناء أُضيف في `76c5e0c` |
| `api/game-access` | ❌ **يُمنع** ← **الخلل يظهر فورًا** |
| `stage/[…]/page.tsx` | ❌ **يُمنع** ← **الخلل يظهر فورًا** |

⚠️ **واختباران يجب أن يفشلا في أول جولة.** ونجاحُهما جميعًا من أول
مرّةٍ **دليلُ خللٍ في الاختبار لا سلامةٍ في النظام.**

---

## TEST ORDER

| # | الاختبار |
|---|---|
| **أ — قبل أي دخول** | |
| 1 | جرد الصلاحيات (`P1`–`P4`) ومطابقتُه بالإنتاج |
| 2 | صفريّة الصفوف في `auth.users` و`profiles` و`login_logs` |
| **ب — المسار السليم** | |
| 3 | تسجيل حسابٍ جديد ⇒ يُنشأ الملف تلقائيًا (يختبر المشغّل) |
| 4 | دخول (1) ⇒ ترحيب ⇒ `login_logs` يزيد صفًّا |
| 5 | تحديث الصفحة ⇒ الجلسة باقية |
| 6 | تنقّل بين الصفحات ⇒ الجلسة باقية |
| 7 | إغلاق المتصفح وفتحه ⇒ الجلسة باقية |
| 8 | خروج ⇒ ثم دخول |
| **ج — الحالات** | |
| 9 | (2) منتهية ⇒ رسالة انتهاء واضحة |
| 10 | (3) موقوفة ⇒ رسالة إيقاف — **مختلفةٌ عن التاسع** |
| 11 | (5) بلا اشتراك ⇒ يدخل، والمدفوع مغلق |
| 12 | (6) بلا ملف ⇒ **رسالةٌ صادقة، ولا خروجٌ تلقائي** |
| 13 | كلمة مرور خاطئة ⇒ رسالةٌ دقيقة |
| 14 | رقمٌ غير موجود |
| **د — لغم الأدمِن** | |
| 15 | (4) دخول ⇒ **يمرّ** |
| 16 | (4) فتح لعبة ⇒ ⚠️ **يجب أن يفشل الآن** |
| 17 | (4) فتح صفحة مادة ⇒ ⚠️ **يجب أن يفشل الآن** |
| **هـ — عزل السجلّ** | |
| 18 | إسقاط سياسة إدراج `login_logs` ⇒ **الدخول يتمّ والترحيب يظهر** |
| 19 | سحب `execute` من `touch_last_active` ⇒ **الدخول يتمّ والترحيب يظهر** |
| 20 | إسقاط الاثنين معًا ⇒ **الدخول يتمّ** — وهذا إثبات الفصل |

### ⑤ تصحيح: لا اختبار شبكةٍ الآن

⚠️ **حُذف «قطع الإنترنت أثناء الدخول».** فالقطعُ يُسقط المصادقة نفسها،
فلا يبقى الاختبار معزولًا — **ولا أدّعي اختبارًا لم يُعزَل.**

**والاختباران ١٨ و١٩ كافيان** لإثبات أن الفشل لا يحبس الدخول. ورفضُ
الشبكة الحقيقي يُختبر لاحقًا **إن عُزل طلب السجلّ وحده** باعتراضٍ
موجَّه — لا بقطعٍ عام.

---

## ⑦ تصحيح الصياغة

⚠️ **«طورٌ واحد يلمس الإنتاج» غير دقيق.** والأدقّ ثلاثةُ أسطر:

1. **بعض الأطوار تقرأ الإنتاج** — لاستخراج المخطّط والصلاحيات والأدلّة.
2. **ولا طورَ قبل النشر يكتب في الإنتاج.**
3. **وتغييرُ الإنتاج الفعلي لا يأتي إلا بعد نجاح الاختبار واختباراته.**

**فالفرق بين قراءةٍ وتغيير، لا بين طورٍ وطور.**

---

# STOP — NO STAGING CREATED YET
