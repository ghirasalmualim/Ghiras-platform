# FINAL EXACT DIFF — `22P02`

> ⚠️ **لم يُطبَّق.** الرصد `[SUBJECT_AUTH]` باقٍ ومُكيَّف على النموذج الجديد.

---

## FINAL FILES TO CHANGE

| # | الملف | النوع |
|---|---|---|
| 1 | `src/lib/supabase/data.ts` | تعديل — الجذر |
| 2 | `src/app/stage/[stageSlug]/[gradeSlug]/[subjectSlug]/page.tsx` | تعديل |
| 3 | `src/app/stage/error.tsx` | **جديد** |
| 4 | `supabase/staging-seed.sql` | **جديد — لا يُشغَّل الآن** |

**ولا يُمسّ:** `api/game-access` · `types.ts` · `middleware.ts` · عملاء Supabase · الإنتاج

---

## FINAL EXACT DIFF

### ① `src/lib/supabase/data.ts`

**BEFORE** — رأس الملف
```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);
```

**AFTER**
```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

/**
 * خطأٌ تقنيّ في قراءة الهيكل — **يُرفع ولا يُداوى ببيانات**.
 *
 * ⚠️ كان الإخفاق يُقابَل ببذرةٍ مخترعة، فيرى المستخدم محتوًى لا وجود
 * له، ومعرّفاته نصوصٌ لا UUID — فتردّ `can_access_subject` بخطأ
 * `22P02`، فيُقال لمشتركةٍ صلاحيتُها سليمة «ليس لديك صلاحية».
 * **عطبٌ تقنيّ تحوّل إلى تهمةٍ على المستخدم.**
 */
export class ContentUnavailableError extends Error {
  constructor(public readonly code: string | null) {
    super('CONTENT_UNAVAILABLE');
    this.name = 'ContentUnavailableError';
  }
}

/**
 * ⚠️ البذرة للتطوير المحلي وحده.
 *
 * معرّفاتها نصوص (`grade-1-math`)، ووصولها إلى قرارِ وصولٍ يكسره حتمًا.
 * و`NODE_ENV` يساوي `production` في كل نشرٍ على Vercel — بما فيه
 * المعاينات — **فالبذرة لا تصل مستخدمًا أبدًا.**
 */
const ALLOW_SEED = process.env.NODE_ENV !== 'production';
```

**BEFORE** — الدوال الثلاث
```ts
export async function getStages(): Promise<Stage[]> {
  const sb = client();
  if (!sb) return SEED_STAGES;
  const { data, error } = await sb
    .from('stages').select('*').eq('is_visible', true).order('sort_order');
  if (error || !data?.length) return SEED_STAGES;
  return data as Stage[];
}
```

**AFTER**
```ts
export async function getStages(): Promise<Stage[]> {
  const sb = client();
  if (!sb) {
    if (!ALLOW_SEED) throw new ContentUnavailableError('NO_SUPABASE_CONFIG');
    return SEED_STAGES;
  }
  const { data, error } = await sb
    .from('stages').select('*').eq('is_visible', true).order('sort_order');
  // ⚠️ عطبٌ تقنيّ — يُرفع ولا يُخفى
  if (error) throw new ContentUnavailableError(error.code ?? null);
  // ⚠️ وصفرُ صفوفٍ ليس عطبًا: محتوًى غير مُهيّأ، لا فشلَ قاعدة
  return (data ?? []) as Stage[];
}
```

**و`getGrades` و`getSubjects` بالنمط نفسه حرفيًّا** — البذرة عند `!sb`
وحدها ومحصورةً بالتطوير، ورفعُ الخطأ، و`return (data ?? [])`.

---

### ② `src/app/stage/[…]/[subjectSlug]/page.tsx`

**BEFORE**
```ts
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, status, sub_end, role')
    .eq('id', user.id)
    .single();
  const expired =
    profile?.sub_end &&
    new Date(profile.sub_end) < new Date(new Date().toDateString());
  const blocked =
    !profile || profile.status !== 'active' || Boolean(expired);
  let canAccess = false;
  let rpcCalled = false;
  let rpcErrorCode: string | null = null;
  let rpcResult: boolean | null = null;
  if (!blocked) {
    rpcCalled = true;
    const { data, error } = await supabase.rpc('can_access_subject', {
      p_subject: subject.id,
    });
    rpcErrorCode = (error as { code?: string } | null)?.code ?? null;
    rpcResult = data === null || data === undefined ? null : data === true;
    canAccess = data === true;
  }
```

**AFTER**
```ts
  /**
   * ⚠️ `maybeSingle()` لا `single()`.
   *
   * `single()` يرمي خطأً (`PGRST116`) حين لا يجد صفًّا، فيختلط **غيابُ
   * الملف** بـ**تعثُّرِ القراءة** في قناةٍ واحدة. و`maybeSingle()` يفصلهما
   * فصلًا نظيفًا: خطأٌ ⇒ عطب، و`null` بلا خطأ ⇒ غياب.
   */
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, status, sub_end, role')
    .eq('id', user.id)
    .maybeSingle();

  const expired =
    profile?.sub_end &&
    new Date(profile.sub_end) < new Date(new Date().toDateString());

  /**
   * ⚠️ **حالةٌ واحدة لكل سبب — و«ليس لديك صلاحية» واحدةٌ منها فقط.**
   *
   * كان `blocked` يبتلع أربعة أسبابٍ ثم يُخرجها كلها باسم واحد، فيُتَّهم
   * حسابٌ سليم بسبب تعثُّرِ قراءة. **والاتهام لا يقع الآن إلا حين تقول
   * الدالّة `false` صراحةً وبلا خطأ.**
   */
  type AuthState =
    | 'ALLOWED'
    | 'ACCESS_DENIED'
    | 'PROFILE_ERROR'
    | 'PROFILE_MISSING'
    | 'STATUS_SUSPENDED'
    | 'SUBSCRIPTION_EXPIRED'
    | 'AUTHORIZATION_ERROR'
    | 'CONTENT_MISCONFIGURED';

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let authState: AuthState;
  let faultCode: string | null = null;
  let rpcCalled = false;
  let rpcErrorCode: string | null = null;
  let rpcResult: boolean | null = null;

  if (profileError) {
    authState = 'PROFILE_ERROR';
    faultCode = (profileError as { code?: string }).code ?? null;
  } else if (!profile) {
    authState = 'PROFILE_MISSING';
  } else if (profile.status === 'suspended') {
    authState = 'STATUS_SUSPENDED';
  } else if (profile.status === 'expired' || Boolean(expired)) {
    authState = 'SUBSCRIPTION_EXPIRED';
  } else if (!UUID_RE.test(subject.id)) {
    // ⚠️ معرّفٌ مصدرُه القاعدة وليس UUID ⇒ عطبٌ عندنا، لا نقصٌ في المحتوى
    authState = 'CONTENT_MISCONFIGURED';
  } else {
    rpcCalled = true;
    const { data, error } = await supabase.rpc('can_access_subject', {
      p_subject: subject.id,
    });
    if (error) {
      // ⚠️ خطأٌ ليس رفضًا — ولا يجوز أن يُترجَم إلى «ممنوع»
      authState = 'AUTHORIZATION_ERROR';
      rpcErrorCode = (error as { code?: string }).code ?? null;
      faultCode = rpcErrorCode;
    } else {
      rpcResult = data === true;
      authState = data === true ? 'ALLOWED' : 'ACCESS_DENIED';
    }
  }

  const canAccess = authState === 'ALLOWED';
  const isTechnicalFault =
    authState === 'PROFILE_ERROR' ||
    authState === 'AUTHORIZATION_ERROR' ||
    authState === 'CONTENT_MISCONFIGURED';

  /**
   * ⚠️ الأعطاب تُسجَّل على الخادم — **ولا يرى المستخدم رمز قاعدةٍ أبدًا.**
   * الرمز يُفشي بنية القاعدة ولا يُفيد المشتركة في شيء.
   */
  if (isTechnicalFault || authState === 'PROFILE_MISSING') {
    console.error('[SUBJECT_AUTH_FAULT]', authState, faultCode ?? '-');
  }
```

**والرصد المؤقّت** — يبقى بأسمائه، مضافًا إليه `AUTH_STATE`:

```ts
  console.log(
    '[SUBJECT_AUTH]',
    JSON.stringify({
      USER_PRESENT: Boolean(user),
      PROFILE_QUERY_ERROR: Boolean(profileError),
      PROFILE_QUERY_ERROR_CODE:
        (profileError as { code?: string } | null)?.code ?? null,
      PROFILE_FOUND: Boolean(profile),
      PROFILE_STATUS_ACTIVE: profile?.status === 'active',
      SUBSCRIPTION_VALID: Boolean(profile?.sub_end) && !expired,
      ROLE_ADMIN: profile?.role === 'admin',
      SUBJECT_ID_IS_UUID: UUID_RE.test(subject.id),
      CAN_ACCESS_RPC_CALLED: rpcCalled,
      CAN_ACCESS_RPC_ERROR: Boolean(rpcErrorCode),
      CAN_ACCESS_RPC_ERROR_CODE: rpcErrorCode,
      CAN_ACCESS_RPC_RESULT: rpcResult,
      AUTH_STATE: authState,
      FINAL_CAN_ACCESS: canAccess,
    })
  );
```

#### العرض

**BEFORE**
```tsx
        {/* ── لا يملك صلاحية ── */}
        {!canAccess && (
          <div className="card-3d mt-10 p-10 text-center animate-float-in" …>
            <span aria-hidden="true" className="text-5xl">🔒</span>
            <h2 …>ليس لديك صلاحية للوصول إلى هذا المحتوى</h2>
            <p …>اشتراكك الحالي لا يشمل هذه المادة.<br/>للاشتراك أو الترقية…</p>
            {freeUrl && ( … 🎁 جرّب النسخة المجانية … )}
```

**AFTER** — البطاقة نفسها، ومحتواها يتبع الحالة
```tsx
        {/* ── تعذّر الوصول — والسبب يُقال كما هو ── */}
        {!canAccess && (
          <div className="card-3d mt-10 p-10 text-center animate-float-in" …>
            <span aria-hidden="true" className="text-5xl">
              {authState === 'ACCESS_DENIED' ? '🔒'
                : authState === 'STATUS_SUSPENDED' ? '⛔'
                : authState === 'SUBSCRIPTION_EXPIRED' ? '🗓️'
                : authState === 'PROFILE_MISSING' ? '📄'
                : '⚠️'}
            </span>

            <h2 className="mt-4 text-xl font-extrabold text-ink">
              {authState === 'ACCESS_DENIED'
                ? 'ليس لديك صلاحية للوصول إلى هذا المحتوى'
                : authState === 'STATUS_SUSPENDED'
                ? 'هذا الحساب موقوف'
                : authState === 'SUBSCRIPTION_EXPIRED'
                ? 'انتهى اشتراكك'
                : authState === 'PROFILE_MISSING'
                ? 'حسابك يحتاج تهيئة'
                : 'تعذّر التحقق الآن'}
            </h2>

            <p className="mt-2 text-ink/60 leading-relaxed">
              {authState === 'ACCESS_DENIED'
                ? 'اشتراكك الحالي لا يشمل هذه المادة. للاشتراك أو الترقية، يرجى التواصل مع إدارة غراس المعلم.'
                : authState === 'STATUS_SUSPENDED'
                ? 'يرجى التواصل مع إدارة غراس المعلم.'
                : authState === 'SUBSCRIPTION_EXPIRED'
                ? 'جدّدي اشتراكك للمتابعة — ومحتواك محفوظ كما هو.'
                : authState === 'PROFILE_MISSING'
                ? 'تواصلي معنا وسنُتمّها لك.'
                : 'خللٌ تقنيّ عندنا — لا علاقة له بحسابك ولا باشتراكك.'}
            </p>

            {/* ⚠️ زرُّ إعادةٍ للأعطاب التقنية وحدها — رابطٌ لا زرّ عميل */}
            {isTechnicalFault && (
              <a href={path} className="mt-6 inline-block rounded-xl bg-sage px-8 py-3 font-extrabold text-white">
                إعادة المحاولة
              </a>
            )}

            {/* ⚠️ التجربة المجانية للرفض الحقيقي وحده: عرضُها عند عطبٍ
                عندنا استغلالٌ لخللٍ نحن سببه */}
            {authState === 'ACCESS_DENIED' && freeUrl && ( … كما هو … )}
```

⚠️ **ولا رمزَ قاعدةٍ في أيٍّ من الرسائل الخمس.**

---

### ③ `src/app/stage/error.tsx` — جديد

```tsx
'use client';

/**
 * حدُّ خطأٍ لصفحات المحتوى وحدها (`/stage/**`).
 *
 * ⚠️ **ولا يُوضع في الجذر:** عندئذٍ يصير كل خطأ في غراس — القرآن،
 * الحديقة، اللوحة — «تعذّر تحميل المحتوى». وهو عين العطب الذي نُصلحه:
 * رسالةٌ واحدة لأعطابٍ لا يجمعها شيء.
 *
 * ⚠️ ولا يُعرض `error.message` ولا `digest`: قد يحملان بنية القاعدة.
 */
export default function StageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
      <p className="text-5xl" aria-hidden>🌧️</p>
      <h1 className="mt-4 text-xl font-extrabold text-ink">تعذّر تحميل المحتوى</h1>
      <p className="mt-2 text-ink/70 leading-relaxed">
        خللٌ تقنيّ عندنا — لا علاقة له بحسابك ولا باشتراكك.
      </p>
      <button onClick={reset} className="mt-6 rounded-xl bg-sage px-8 py-3 font-extrabold text-white">
        إعادة المحاولة
      </button>
    </main>
  );
}
```

---

### ④ `supabase/staging-seed.sql` — جديد، **لا يُشغَّل الآن**

```sql
-- STAGING BRANCH ONLY. Never run on main.
-- Verified against the branch schema on 2026-08-22:
--   stages.id / grades.id / subjects.id : uuid DEFAULT gen_random_uuid()
--   UNIQUE stages(slug), grades(stage_id, slug), subjects(grade_id, slug)
-- Slugs match src/lib/types.ts so the app resolves the route.
-- Idempotent: safe to run more than once.

with s as (
  insert into public.stages (name, slug, sort_order, is_visible)
  values ('المرحلة الابتدائية', 'primary', 1, true)
  on conflict (slug) do update set name = excluded.name
  returning id
), g as (
  insert into public.grades (stage_id, name, slug, sort_order, is_visible)
  select s.id, 'الصف الأول', 'grade-1', 1, true from s
  on conflict (stage_id, slug) do update set name = excluded.name
  returning id
)
insert into public.subjects (grade_id, name, slug, icon, color, sort_order, is_visible)
select g.id, 'التربية الإسلامية', 'islamic', '🕌', '#7A9E7E', 1, true from g
on conflict (grade_id, slug) do update set name = excluded.name;
```

⚠️ **`do update` لا `do nothing`** — لأن `do nothing` لا يُرجع صفًّا،
فتنكسر السلسلة `with` عند التشغيل الثاني.

---

## EXPECTED TEST AFTER PATCH

| # | الاختبار | المتوقَّع |
|---|---|---|
| 1 | تشغيل البذرة ثم فتح `/stage/primary/grade-1/islamic` | **المحتوى** · `AUTH_STATE: ALLOWED` · `SUBJECT_ID_IS_UUID: true` |
| 2 | `Cmd+R` على الصفحة نفسها | **النتيجة ذاتها** ← الاختبار الحاسم |
| 3 | حذف صفّ الصلاحية ثم تحديث | 🔒 «ليس لديك صلاحية» · `ACCESS_DENIED` |
| 4 | `status = 'suspended'` | ⛔ «الحساب موقوف» |
| 5 | `sub_end = أمس` | 🗓️ «انتهى اشتراكك» |
| 6 | **قبل تشغيل البذرة** | ⚠️ عطبٌ تقنيّ + زرّ إعادة — **لا «ليس لديك صلاحية»** |

⚠️ **والسادس هو إثبات الإصلاح نفسه:** الحالة التي أعطت «ليس لديك
صلاحية» يجب أن تُعطي الآن **إقرارًا بعطبٍ عندنا**.

---

## RISK LEVEL

# MEDIUM

**ولماذا ليس LOW:** `data.ts` تقرؤها **٦ صفحات**، ورفعُ الخطأ يغيّر
سلوكها جميعًا. **وثلاثٌ منها خارج حدّ الخطأ** (`/` · `/admin/quran` ·
`/quran/curriculum`) فستُظهر صفحة Next الافتراضية عند تعثُّر القاعدة.

**ولماذا ليس HIGH:** ولا شرطٍ أمنيّ تراخى — **الحارس صار أضيق لا أوسع**.
والبذرة كانت تصل الإنتاج **بالفعل** عند أي تعثّر، والآن **لا تصله أبدًا**.
والتغيير محصورٌ في مسار قراءة الهيكل وصفحة المادة، ولا يمسّ الدخول ولا
الجلسة ولا الأدوار.

**والتراجع:** `git revert` واحد — **ولا تغييرَ في القاعدة** (البذرة في
فرع الاختبار وحده).

---

# STOP — DO NOT APPLY
