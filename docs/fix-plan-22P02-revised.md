# خطة `22P02` — النسخة المصحَّحة

> ⚠️ **لم يُطبَّق شيء.**

---

## REVISED STATE MODEL

**ثمانِ حالاتٍ صريحة — و«ليس لديك صلاحية» واحدةٌ منها فقط.**

| الحالة | متى | ما يراه المستخدم | يُسجَّل بخطأ؟ |
|---|---|---|---|
| `ALLOWED` | الدالّة ردّت `true` | المحتوى | — |
| `ACCESS_DENIED` | **الدالّة ردّت `false` — لا غير** | 🔒 «ليس لديك صلاحية» | لا |
| `PROFILE_ERROR` | فشلت قراءة الملف تقنيًّا | ⚠️ «خللٌ تقنيّ — أعيدي المحاولة» | ✅ نعم |
| `PROFILE_MISSING` | لا صفَّ للملف (`PGRST116`) | 📄 «حسابك يحتاج تهيئة — تواصلي معنا» | ✅ نعم |
| `STATUS_SUSPENDED` | `status = 'suspended'` | ⛔ «الحساب موقوف» | لا |
| `SUBSCRIPTION_EXPIRED` | `status='expired'` أو التاريخ مضى | 🗓️ «انتهى اشتراكك — جدّديه» | لا |
| `AUTHORIZATION_ERROR` | الدالّة رمت خطأً | ⚠️ «تعذّر التحقق — أعيدي المحاولة» | ✅ نعم |
| `CONTENT_MISCONFIGURED` | معرّف ليس UUID | ⚠️ «خللٌ تقنيّ — أعيدي المحاولة» | ✅ نعم |

### ⚠️ تصحيح ②: `blocked` تفكَّك ولا تُترجَم جملةً

**كان سطرٌ واحد يبتلع أربع حالات:**
```ts
const blocked = !profile || profile.status !== 'active' || Boolean(expired);
```
**فيصير فشلُ قراءةٍ تقنيّ «ليس لديك صلاحية».** وهذا ممنوع الآن.

⚠️ **ودقّةٌ في `.single()`:** صفرُ صفوفٍ يرجع **خطأً** رمزه `PGRST116`
لا `data: null` هادئًا. **فالتمييز بين «مفقود» و«تعثّر» يقوم على الرمز
نفسه**، وإلا اختلطت الحالتان من جديد:
```ts
const profileMissing =
  profileError?.code === 'PGRST116' || (!profileError && !profile);
```

### ⚠️ تصحيح ⑤: المعرّف الفاسد عطبٌ لا حكم

`CONTENT_MISCONFIGURED` **يُسجَّل خطأً على الخادم** ويُعرض كخللٍ تقنيّ.
**ولا يُقال للمستخدم «المحتوى غير مُهيّأ»** — لأن مصدر المعرّف قاعدةُ
البيانات، **فبطلانُه يعني أن شيئًا في نظامنا معطوب، لا أن المحتوى
ناقص.**

### ⚠️ تصحيح ③: لا رموز قاعدةٍ في الواجهة

```
الخادم  →  console.error('[SUBJECT_AUTH_FAULT]', state, code)
الواجهة →  «خللٌ تقنيّ عندنا — أعيدي المحاولة»        ← بلا رمز
```

⚠️ **وأسحب ما اقترحتُه سابقًا** — كتبت `(رمز: {authErrorCode})` في
الواجهة، **وهو إفشاءٌ لبنية القاعدة بلا فائدةٍ للمشتركة.**

---

## ERROR BOUNDARY LOCATION

# `src/app/stage/error.tsx`

**ولماذا هنا:** أضيقُ مقطعٍ يغطّي صفحات المحتوى الثلاث معًا —
`/stage/[stage]` و`/stage/[stage]/[grade]` و`/stage/[…]/[subject]` —
**وهي وحدها التي تقرأ الهيكل من `data.ts`.**

⚠️ **ولا يُوضع في الجذر** كما اقترحت أولًا: عندئذٍ يصير **كل** خطأ في
غراس — القرآن، الحديقة، اللوحة، الألعاب — «تعذّر تحميل المحتوى». **وهو
عين العطب الذي نُصلحه: رسالةٌ واحدة لأعطابٍ لا يجمعها شيء.**

### ⚠️ وما يبقى خارج الحدّ — أُصرّح به ولا أُخفيه

`getStages()` تُنادى أيضًا من `/` و`/admin/quran` و`/quran/curriculum`.
**فرفعُ الخطأ سيُظهر فيها صفحة Next الافتراضية.** أضيقُ نطاقٍ ثمنُه
هذا. **والقرار قرارك:** نتركها الآن، أم نضيف حدًّا ثانيًا لاحقًا؟

---

## SEED SCHEMA VERIFICATION

⚠️ **لا أستطيع تنفيذه — لا وصول لي للقاعدة. وملفُّنا `schema.sql` لا
يصلح مرجعًا** بعد أن ثبت أن ١١ دالّةً في الإنتاج ليست فيه.

**شغّليه في فرع `ghiras-staging` — قراءةٌ محضة:**

```sql
-- READ ONLY. Verify column types, defaults and unique constraints
-- before writing any seed row.

select  c.table_name, c.column_name, c.data_type, c.column_default
from    information_schema.columns c
where   c.table_schema = 'public'
  and   c.table_name in ('stages','grades','subjects')
  and   c.column_name in ('id','slug','stage_id','grade_id')
order by c.table_name, c.ordinal_position;

select  tc.table_name, tc.constraint_name, tc.constraint_type,
        string_agg(kcu.column_name, ',' order by kcu.ordinal_position) as cols
from    information_schema.table_constraints tc
join    information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.table_schema   = tc.table_schema
where   tc.table_schema = 'public'
  and   tc.table_name in ('stages','grades','subjects')
  and   tc.constraint_type in ('PRIMARY KEY','UNIQUE')
group by tc.table_name, tc.constraint_name, tc.constraint_type
order by tc.table_name;
```

**ولا تُعتمد البذرة حتى يتأكّد الثلاثة:**

| ما يجب أن يظهر | ولماذا |
|---|---|
| `id` من نوع `uuid` وافتراضُه `gen_random_uuid()` | وإلا فالمعرّفات ليست UUID **في القاعدة نفسها**، والعطب أعمق |
| `UNIQUE (slug)` على `stages` | `on conflict (slug)` يحتاج قيدًا مطابقًا |
| `UNIQUE (stage_id, slug)` و`UNIQUE (grade_id, slug)` | وإلا فشل `on conflict` بخطأ ٤٢٧٠٤ |

⚠️ **و`on conflict` لا يقبل أعمدةً بلا قيدٍ مطابق** — فلو اختلف القيد
عمّا افترضتُ، **فشلت البذرة كلّها**، ولا يجوز أن نكتشف ذلك ونحن نُشغّلها.

---

## REVISED EXACT DIFF

### ① `src/lib/supabase/data.ts` — بلا تغيير عن السابق

`ContentUnavailableError` · `ALLOW_SEED` · رفعُ الخطأ · `return (data ?? [])`

### ② `src/app/stage/[…]/[subjectSlug]/page.tsx`

**BEFORE**
```ts
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, status, sub_end')
    .eq('id', user.id)
    .single();
  const expired =
    profile?.sub_end &&
    new Date(profile.sub_end) < new Date(new Date().toDateString());
  const blocked =
    !profile || profile.status !== 'active' || Boolean(expired);
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
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, status, sub_end')
    .eq('id', user.id)
    .single();

  const expired =
    profile?.sub_end &&
    new Date(profile.sub_end) < new Date(new Date().toDateString());

  /**
   * ⚠️ **حالةٌ واحدة لكل سبب.**
   *
   * كان `blocked` يبتلع أربعة أسبابٍ ثم يُخرجها جميعًا باسم «ليس لديك
   * صلاحية» — فيُتَّهم حسابٌ سليم بسبب تعثُّرِ قراءة. والاتهام لا يقع
   * الآن إلا حين تقول الدالّة `false` صراحةً.
   *
   * ⚠️ و`.single()` يرجع خطأً رمزه `PGRST116` عند صفر صفوف — فالتمييز
   * بين «مفقود» و«تعثّر» على الرمز لا على `data`.
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

  const profileMissing =
    (profileError as { code?: string } | null)?.code === 'PGRST116' ||
    (!profileError && !profile);

  let authState: AuthState;
  let faultCode: string | null = null;

  if (profileMissing) {
    authState = 'PROFILE_MISSING';
  } else if (profileError) {
    authState = 'PROFILE_ERROR';
    faultCode = (profileError as { code?: string }).code ?? null;
  } else if (profile!.status === 'suspended') {
    authState = 'STATUS_SUSPENDED';
  } else if (profile!.status === 'expired' || Boolean(expired)) {
    authState = 'SUBSCRIPTION_EXPIRED';
  } else if (!UUID_RE.test(subject.id)) {
    // ⚠️ معرّفٌ مصدرُه القاعدة وليس UUID ⇒ عطبٌ عندنا، لا نقصٌ في المحتوى
    authState = 'CONTENT_MISCONFIGURED';
  } else {
    const { data, error } = await supabase.rpc('can_access_subject', {
      p_subject: subject.id,
    });
    if (error) {
      authState = 'AUTHORIZATION_ERROR';
      faultCode = (error as { code?: string }).code ?? null;
    } else {
      authState = data === true ? 'ALLOWED' : 'ACCESS_DENIED';
    }
  }

  const canAccess = authState === 'ALLOWED';

  /**
   * ⚠️ الأعطاب تُسجَّل على الخادم — **ولا يرى المستخدم رمزًا أبدًا.**
   * رمز القاعدة يُفشي بنيتها ولا يُفيد المشتركة في شيء.
   */
  if (
    authState === 'PROFILE_ERROR' ||
    authState === 'PROFILE_MISSING' ||
    authState === 'AUTHORIZATION_ERROR' ||
    authState === 'CONTENT_MISCONFIGURED'
  ) {
    console.error('[SUBJECT_AUTH_FAULT]', authState, faultCode ?? '-');
  }
```

**وفي العرض:**

```tsx
{authState === 'ACCESS_DENIED' && (
  🔒 ليس لديك صلاحية للوصول إلى هذا المحتوى
)}
{authState === 'STATUS_SUSPENDED' && (
  ⛔ هذا الحساب موقوف — تواصلي مع إدارة المنصة
)}
{authState === 'SUBSCRIPTION_EXPIRED' && (
  🗓️ انتهى اشتراكك — جدّديه للمتابعة
)}
{authState === 'PROFILE_MISSING' && (
  📄 حسابك يحتاج تهيئة — تواصلي معنا وسنُتمّها
)}
{(authState === 'PROFILE_ERROR' ||
  authState === 'AUTHORIZATION_ERROR' ||
  authState === 'CONTENT_MISCONFIGURED') && (
  ⚠️ تعذّر التحقق الآن — خللٌ تقنيّ عندنا لا علاقة له بحسابك.
     [ إعادة المحاولة ]
)}
```

⚠️ **ولا رمزَ في أيٍّ منها.**

### ③ `src/app/stage/error.tsx` — جديد (بدل الجذر)

نصُّه كما كان، **ومكانُه `stage/` لا الجذر.**

### ④ `api/game-access/route.ts` — **موثَّقٌ ولا يُمسّ**

⚠️ يحمل العطب نفسه (`const { data: ok }` بلا فحص) **ويعمل في الإنتاج**.
**خطوةٌ مستقلّة بعد نجاح صفحة المادة.**

---

## ⚠️ وشيءٌ لاحظتُه ولا أُصلحه — خارج نطاق هذه الدفعة

`SUBSCRIPTION_EXPIRED` هنا **لا يستثني الأدمِن** — وهو `W4` بعينه،
الموضع الثاني من الثلاثة. **أُبقيه كما هو** التزامًا بضيق النطاق،
**وأُذكّر به حتى لا يضيع.**

---

# STOP — DO NOT APPLY
