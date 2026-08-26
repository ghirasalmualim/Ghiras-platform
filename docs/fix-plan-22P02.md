# خطة إصلاح `22P02` — تصميمٌ فقط

> ⚠️ **لم يُطبَّق شيء.** والرصد `[SUBJECT_AUTH]` باقٍ حتى نُعيد الاختبار.

---

## FILES AFFECTED

| الملف | التغيير |
|---|---|
| `src/lib/supabase/data.ts` | **الجذر** — إسقاط البذرة عند الخطأ، وحصرها بالتطوير |
| `src/app/stage/[…]/[subjectSlug]/page.tsx` | فصل الحالات الأربع، وحارس المعرّف |
| `src/app/error.tsx` | **جديد** — حدُّ خطأٍ قابل لإعادة المحاولة (لا يوجد أيٌّ منه الآن) |
| `supabase/staging-seed.sql` | **جديد** — بذرة اختبارٍ بمعرّفاتٍ حقيقية |

**ولا تُمسّ:** `types.ts` · `middleware.ts` · عملاء Supabase · القاعدة في الإنتاج

### ما وجدتُه في الجرد

**البذرة تُستعمل في ٦ مواضع، كلها في `data.ts`** — ثلاثةٌ منها عند
`!sb` (لا مفاتيح) وثلاثةٌ عند `error || !data?.length`. **والثلاثة
الأخيرة هي العطب.**

**المعرّفات الوهمية تُصنع في `types.ts` في ثلاثة أسطر:**

```ts
{ id: 'primary', … }              // السطر 51
id: `grade-${i + 1}`,             // السطر 60
id: `${g.slug}-${s.slug}`,        // السطر 88   ← الذي رمى 22P02
```

**و`can_access_subject` تُستدعى من موضعين:**
- `src/app/stage/[…]/[subjectSlug]/page.tsx:116`
- `src/app/api/game-access/route.ts:73` ⚠️ **ويهمل الخطأ كذلك** (`const { data: ok }`)

⚠️ **والثاني لم نره يفشل بعد لأنه معطَّل محليًّا** (لا `GAME_GATE_SECRET`)
— **لكنه يحمل العطب نفسه حرفيًّا، ويعمل في الإنتاج.**

---

## ROOT CAUSE FIX

**العلّة ليست في الدالّة ولا في الصلاحيات. العلّة أن الكود يُخفي
فشلًا تقنيًّا خلف بياناتٍ مخترعة، ثم يبني عليها قرار وصول.**

### الحالات الأربع

| | الحالة | السلوك المطلوب |
|---|---|---|
| **A** | القراءة نجحت والمادة موجودة | `subject.id` هو **UUID القاعدة** — يُمرَّر كما هو |
| **B** | القراءة نجحت وصفر مواد | `[]` ⇒ `notFound()` أو «المحتوى غير مُهيّأ». **ولا تُستدعى الدالّة** |
| **C** | القراءة **أخفقت تقنيًّا** | **لا بذرة ولا «ممنوع»** — خطأٌ تقنيّ قابل لإعادة المحاولة |
| **D** | الدالّة ردّت `false` | **هنا وحدها** تُعرض «ليس لديك صلاحية» |

⚠️ **والمفتاح: `error` و`!data?.length` كانا في شرطٍ واحد — وهما نقيضان.**
الأول عطبٌ في النظام، والثاني حقيقةٌ عن المحتوى. **وجمعُهما هو الخطأ.**

### ضمان أن `p_subject` لا يكون إلا UUID حقيقيًّا — طبقتان

**① المنبع:** البذرة لا تصل الإنتاج أبدًا (`ALLOW_SEED` محصورٌ بالتطوير)،
والخطأ يُرفع ولا يُداوى ببيانات.

**② المصبّ:** حارسٌ قبل الاستدعاء — فلو تسرّب معرّفٌ فاسد بأي طريق،
**يُصنَّف `CONTENT_NOT_CONFIGURED` ولا يُرمى إلى القاعدة.**

⚠️ **ولا نكتفي بواحدة:** الأولى تمنع السبب المعروف، والثانية تمنع
كل سببٍ لم نعرفه بعد.

---

## ERROR-STATE DESIGN

```
ALLOWED                 → المحتوى
ACCESS_DENIED           → 🔒 «ليس لديك صلاحية»            (D فقط)
AUTHORIZATION_ERROR     → ⚠️ «تعذّر التحقق — أعيدي المحاولة»  + رمز الخطأ
CONTENT_NOT_CONFIGURED  → 📭 «هذه المادة غير مُهيّأة بعد»
CONTENT_UNAVAILABLE     → error.tsx — «خلل تقني» + زرّ إعادة   (C)
```

⚠️ **وأربعُ رسائل بدل واحدة.** والفرق ليس تجميلًا: **«ليس لديك صلاحية»
تهمةٌ على المشتركة، و«تعذّر التحقق» إقرارٌ بعطبٍ عندنا.** وقد قالت
المنصّة الأولى لمشتركةٍ صلاحيتُها سليمة.

---

## STAGING TEST DATA PLAN

**أقلّ ما يُختبر به المسار الحقيقي: مرحلةٌ وصفٌّ ومادّةٌ واحدة.**

```sql
-- STAGING BRANCH ONLY. Never run on main.
-- Real gen_random_uuid() ids so can_access_subject receives a valid uuid.
-- Slugs must match what the app expects (see src/lib/types.ts).

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
on conflict (grade_id, slug) do update set name = excluded.name
returning id;
```

**ورابط الاختبار بعدها:** `/stage/primary/grade-1/islamic`

⚠️ **`on conflict do update` مقصود** — فتُشغَّل مرارًا بلا تكرار.
⚠️ **ولا تُشغَّل على `main` أبدًا** — هي كتابةٌ لا قراءة.

---

## EXACT PROPOSED DIFF

### ① `src/lib/supabase/data.ts`

**BEFORE**
```ts
export async function getSubjects(gradeId: string): Promise<Subject[]> {
  const sb = client();
  if (!sb) return SEED_SUBJECTS.filter((s) => s.grade_id === gradeId);
  const { data, error } = await sb
    .from('subjects')
    .select('*')
    .eq('grade_id', gradeId)
    .eq('is_visible', true)
    .order('sort_order');
  if (error || !data?.length)
    return SEED_SUBJECTS.filter((s) => s.grade_id === gradeId);
  return data as Subject[];
}
```

**AFTER** (والمثل حرفيًّا في `getStages` و`getGrades`)
```ts
/**
 * خطأٌ تقنيّ في قراءة الهيكل.
 *
 * ⚠️ **يُرفع ولا يُداوى ببيانات.** كان الإخفاق يُقابَل ببذرةٍ مخترعة،
 * فيرى المستخدم محتوًى لا وجود له، ومعرّفاته ليست UUID — فتردّ
 * `can_access_subject` بخطأ `22P02`، فيُقال لمشتركةٍ صلاحيتُها سليمة
 * «ليس لديك صلاحية». **عطبٌ تقنيّ تحوّل إلى تهمة.**
 */
export class ContentUnavailableError extends Error {
  constructor(public readonly code: string | null) {
    super('CONTENT_UNAVAILABLE');
    this.name = 'ContentUnavailableError';
  }
}

/**
 * ⚠️ البذرة للتطوير المحلي وحده — ولا تصل الإنتاج ولا المعاينات.
 * معرّفاتها نصوصٌ (`grade-1-math`) لا UUID، فوصولها إلى قرار وصولٍ
 * يكسره حتمًا.
 */
const ALLOW_SEED = process.env.NODE_ENV !== 'production';

export async function getSubjects(gradeId: string): Promise<Subject[]> {
  const sb = client();
  if (!sb) {
    if (!ALLOW_SEED) throw new ContentUnavailableError('NO_SUPABASE_CONFIG');
    return SEED_SUBJECTS.filter((s) => s.grade_id === gradeId);
  }
  const { data, error } = await sb
    .from('subjects')
    .select('*')
    .eq('grade_id', gradeId)
    .eq('is_visible', true)
    .order('sort_order');
  // ⚠️ عطبٌ تقنيّ — يُرفع
  if (error) throw new ContentUnavailableError(error.code ?? null);
  // ⚠️ وصفرُ صفوفٍ ليس عطبًا: محتوًى غير مُهيّأ، لا فشلَ قاعدة
  return (data ?? []) as Subject[];
}
```

### ② `src/app/stage/[…]/[subjectSlug]/page.tsx`

**BEFORE**
```ts
  let canAccess = false;
  if (!blocked) {
    const { data } = await supabase.rpc('can_access_subject', {
      p_subject: subject.id,
    });
    canAccess = data === true;
  }
```

**AFTER**
```ts
  /**
   * ⚠️ حارسٌ قبل الاستدعاء: معرّفٌ ليس UUID يُخرج `22P02` من القاعدة،
   * وكان يُترجَم إلى «ليس لديك صلاحية». **خطأٌ في المُدخَل لا يجوز
   * أن يصير حكمًا على المستخدم.**
   */
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  type AuthState =
    | 'ALLOWED'
    | 'ACCESS_DENIED'
    | 'AUTHORIZATION_ERROR'
    | 'CONTENT_NOT_CONFIGURED';

  let authState: AuthState;
  let authErrorCode: string | null = null;

  if (blocked) {
    authState = 'ACCESS_DENIED';
  } else if (!UUID_RE.test(subject.id)) {
    authState = 'CONTENT_NOT_CONFIGURED';
  } else {
    const { data, error } = await supabase.rpc('can_access_subject', {
      p_subject: subject.id,
    });
    if (error) {
      authState = 'AUTHORIZATION_ERROR';
      authErrorCode = (error as { code?: string }).code ?? null;
    } else {
      authState = data === true ? 'ALLOWED' : 'ACCESS_DENIED';
    }
  }
  const canAccess = authState === 'ALLOWED';
```

**وفي العرض** — بدل `{!canAccess && (🔒 …)}` واحدة:

```tsx
{authState === 'ACCESS_DENIED' && ( 🔒 ليس لديك صلاحية للوصول… )}
{authState === 'AUTHORIZATION_ERROR' && (
  ⚠️ تعذّر التحقق من صلاحيتك — حاولي بعد قليل.
     حسابك سليم، والخلل عندنا. (رمز: {authErrorCode ?? '—'})
)}
{authState === 'CONTENT_NOT_CONFIGURED' && ( 📭 هذه المادة غير مُهيّأة بعد )}
```

### ③ `src/app/error.tsx` — جديد

```tsx
'use client';

/**
 * حدُّ الخطأ — يلتقط `ContentUnavailableError` وغيره.
 *
 * ⚠️ ولا يقول «ليس لديك صلاحية» ولا يُلمّح إلى خللٍ في الحساب:
 * هذا عطبٌ عندنا، ويُقال كما هو، ومعه زرُّ إعادة.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
      <p className="text-5xl" aria-hidden>🌧️</p>
      <h1 className="mt-4 text-xl font-extrabold text-ink">
        تعذّر تحميل المحتوى
      </h1>
      <p className="mt-2 text-ink/70">
        خللٌ تقنيّ عندنا — لا علاقة له بحسابك ولا باشتراكك.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-xl bg-sage px-6 py-3 font-extrabold text-white"
      >
        إعادة المحاولة
      </button>
    </main>
  );
}
```

### ④ `src/app/api/game-access/route.ts` — يُقترح ولا يُنفَّذ في هذه الدفعة

⚠️ يحمل العطب نفسه (`const { data: ok }` بلا فحص خطأ) **ويعمل في
الإنتاج**. أفصله في خطوةٍ مستقلّة بعد أن نُثبت الإصلاح هنا — **فلا
نُغيّر مسارين ونحن نختبر واحدًا.**

---

# STOP — DO NOT APPLY
