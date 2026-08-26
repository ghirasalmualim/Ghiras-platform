# مراجعة `api/game-access` — قراءةٌ فقط

> ⚠️ **لم يُعدَّل شيء.**

---

## CURRENT BEHAVIOR

**المدخل:** `GET /api/game-access?g=<gameId>` — **معرّف اللعبة وحده**.
لا يستقبل `subject_id` إطلاقًا.

**ومن أين يأتي `subject_id`:** من القاعدة — `games.subject_id`.

```sql
subject_id uuid not null references public.subjects(id) on delete cascade
```

⚠️ **وهذا يُسقط أحد افتراضاتي:** العمود `uuid NOT NULL` من القاعدة
مباشرةً — **لا بذرةَ ولا احتياطيّ هنا**. فلا سبيل لأن يكون نصًّا ولا
فارغًا، **و`22P02` لا يقع في هذا المسار.**

**فالعطب هنا من نوعٍ آخر — وهو في وجهٍ أسوأ.**

### ستّة طرقٍ للفشل، ومخرجٌ واحد صامت

| السطر | الحالة | ما يقع |
|---|---|---|
| 43 | لا `g` | `home()` |
| 60 | اللعبة غير موجودة / مخفية / بلا رابط | `home()` |
| 60 | **فشل قراءة `games` تقنيًّا** (`data` مُهمَل الخطأ) | `home()` |
| 70 | **فشل قراءة `profiles`** | `home()` |
| 70 | موقوف · منتهٍ | `home()` |
| 76 | **خطأ في الدالّة** أو رفضٌ حقيقي | `home()` |

```ts
function home(req: NextRequest) {
  return NextResponse.redirect(new URL('/', req.url));
}
```

---

## CONFIRMED BUG

### ① الخطأ يُبتلع في ثلاثة مواضع

```ts
const { data: game } = await supabase.from('games')…      // 55 — بلا error
const { data: profile } = await supabase.from('profiles')… // 63 — بلا error
const { data: ok } = await supabase.rpc('can_access_subject', …); // 73 — بلا error
if (ok !== true) return home(req);                         // 76
```

**نعم — خطأ الدالّة يتحوّل إلى منع.** `error` ⇒ `ok = null` ⇒
`null !== true` ⇒ `home()`. **وهو النمط نفسه الذي أصلحناه في صفحة
المادة، وما زال حيًّا هنا وفي الإنتاج.**

### ② ولا رسالةَ واحدة — ولا حتى خاطئة

**لا توجد رسالةٌ تجمع الحالات، لأنه لا توجد رسالةٌ أصلًا.**

⚠️ **وهذا أسوأ من رسالةٍ مضلّلة:** في صفحة المادة كان يُقال «ليس لديك
صلاحية» — كذبٌ، لكنه خبر. **وهنا صمتٌ تام.**

### ③ وأثره على المستخدم أقسى ممّا يبدو

```ts
window.open(`/api/game-access?g=…`, '_blank', 'noopener,noreferrer');
```

**تُفتح تبويبةٌ جديدة، فتعرض الصفحة الرئيسية.** تضغط المشتركة «شغّل
اللعبة»، فينفتح لها تبويبٌ فيه **صفحة غراس الرئيسية** — بلا كلمة.

⚠️ **ولا سبيل لها أن تعرف: أهو عطبٌ؟ أم اشتراكٌ انتهى؟ أم لعبةٌ
حُذفت؟** — والنتيجة اتصالٌ بك.

### ④ خطأٌ غير ملتقَط يُخرج 500

```ts
const sig = await hmac(`t|${slug}|${exp}`);   // 90 — بلا try
```
و`hmac` ترمي إن غاب `GAME_GATE_SECRET` (سطر 25). **فيرى المستخدم
صفحة خطأٍ خام في تبويبٍ جديد.**

### ⑤ `W4` — مُثبت

```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('status, sub_end')          // ← لا `role` أصلًا
  .eq('id', user.id)
  .single();
…
if (!profile || profile.status !== 'active' || Boolean(expired)) return home(req);  // 70
```

⚠️ **`role` غير مقروءٍ إطلاقًا، فلا سبيل للاستثناء.** والأدمِن
باشتراكٍ منقضٍ **يُردّ من هنا قبل أن تُستدعى الدالّة** — مع أن الدالّة
نفسها تستثنيه في فرع `pr.role = 'admin'`. **فالحارس الخارجي أقسى من
الداخلي.**

**مُثبت ولا يُصلَح في هذه الدفعة.**

### ⑥ وملاحظةٌ صغيرة

```ts
return NextResponse.redirect(new URL('/login', req.url));   // 51
```
**بلا `?next=`** — فمن سجّل دخوله لا يعود إلى لعبته.

---

## CALLER BEHAVIOR

**مستدعٍ واحد:** `src/components/GameLauncher.tsx:18`

```ts
window.open(`/api/game-access?g=${…}`, '_blank', 'noopener,noreferrer');
```

# ⚠️ وهذا يُبطل تصميم JSON الذي طلبتِه

**المسار يُتنقَّل إليه، لا يُجلَب بـ`fetch`.** فأي `JSON` نُرجعه
**يُعرض نصًّا خامًا في تبويب المستخدم:**

```
{"state":"ACCESS_DENIED"}
```

⚠️ **ولا يصلح تغيير المستدعي إلى `fetch` علاجًا:** فتحُ تبويبٍ **بعد
`await`** يحجبه مانع النوافذ المنبثقة في المتصفحات — **فتنكسر اللعبة
لمن يملك الصلاحية.** والتصميم الحالي (تنقّلٌ مباشر) قائمٌ لهذا السبب.

**فالصواب: إعادةُ توجيهٍ إلى صفحةٍ تقول السبب** — وهو **اصطلاح
المشروع نفسه**: عنده سبعُ صفحاتٍ من نمط `*-locked`.

---

## PROPOSED STATE MODEL

| الحالة | متى | الاستجابة | يُسجَّل؟ |
|---|---|---|---|
| `ALLOWED` | الدالّة `true` | **307** → رابط اللعبة الموقّع | — |
| `ACCESS_DENIED` | **الدالّة `false` بلا خطأ — لا غير** | **303** → `/game-unavailable?r=denied` | لا |
| `SUBSCRIPTION_EXPIRED` | `expired` أو `status='expired'` | 303 → `…?r=expired` | لا |
| `STATUS_SUSPENDED` | `status='suspended'` | 303 → `…?r=suspended` | لا |
| `PROFILE_MISSING` | لا صفَّ ملفٍّ | 303 → `…?r=account` | ✅ |
| `GAME_NOT_FOUND` | لا لعبة / مخفية | 303 → `…?r=missing` | لا |
| `PROFILE_ERROR` · `GAME_ERROR` · `AUTHORIZATION_ERROR` | أي خطأ قاعدة | 303 → `…?r=technical` | ✅ |
| `INVALID_SUBJECT_ID` | ليس UUID | 303 → `…?r=technical` | ✅ |
| `NOT_SIGNED_IN` | لا مستخدم | 303 → `/login?next=…` | لا |

⚠️ **ولا رمزَ قاعدةٍ في أي استجابة** — الرموز إلى
`console.error('[GAME_ACCESS_FAULT]', state, code)` وحدها.

### وحارس UUID — نعم، ويُضاف

**ممكنٌ وبسيط.** ⚠️ **وأُصرّح بأنه دفاعٌ عن عمقٍ لا إصلاحُ عطبٍ قائم:**
العمود `uuid NOT NULL`، فبطلانُه اليوم مستحيل. **لكنه يمنع أن يعود
`22P02` من بابٍ لم نتوقّعه — كما عاد في صفحة المادة من باب البذرة.**

---

## EXACT MINIMAL DIFF

**ملفان:** `src/app/api/game-access/route.ts` · `src/app/game-unavailable/page.tsx` (جديد)

### `route.ts`

**BEFORE**
```ts
function home(req: NextRequest) {
  return NextResponse.redirect(new URL('/', req.url));
}
```

**AFTER**
```ts
/**
 * ⚠️ **لا يُردّ أحدٌ صامتًا إلى الرئيسية.**
 *
 * كانت ستّ حالاتٍ مختلفة تنتهي كلها بتبويبٍ جديد فيه الصفحة الرئيسية
 * بلا كلمة: عطبُ قاعدةٍ، ورفضٌ حقيقي، واشتراكٌ منقضٍ، ولعبةٌ محذوفة.
 * فلا تدري المشتركة أهو خللٌ عندنا أم عندها.
 */
type AccessState =
  | 'ACCESS_DENIED' | 'SUBSCRIPTION_EXPIRED' | 'STATUS_SUSPENDED'
  | 'PROFILE_MISSING' | 'GAME_NOT_FOUND' | 'TECHNICAL';

const REASON: Record<AccessState, string> = {
  ACCESS_DENIED: 'denied',
  SUBSCRIPTION_EXPIRED: 'expired',
  STATUS_SUSPENDED: 'suspended',
  PROFILE_MISSING: 'account',
  GAME_NOT_FOUND: 'missing',
  TECHNICAL: 'technical',
};

function deny(req: NextRequest, state: AccessState, code?: string | null) {
  // ⚠️ الرمز للخادم وحده — لا يُفشى للمستخدم ولا يُفيده
  if (state === 'TECHNICAL' || state === 'PROFILE_MISSING') {
    console.error('[GAME_ACCESS_FAULT]', state, code ?? '-');
  }
  return NextResponse.redirect(
    new URL(`/game-unavailable?r=${REASON[state]}`, req.url),
    303
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

**BEFORE**
```ts
  const { data: game } = await supabase
    .from('games').select('id, game_url, subject_id, is_visible')
    .eq('id', gameId).single();
  if (!game || !game.is_visible || !game.game_url) return home(req);

  const { data: profile } = await supabase
    .from('profiles').select('status, sub_end').eq('id', user.id).single();
  const expired =
    profile?.sub_end && new Date(profile.sub_end) < new Date(new Date().toDateString());
  if (!profile || profile.status !== 'active' || Boolean(expired)) return home(req);

  const { data: ok } = await supabase.rpc('can_access_subject', {
    p_subject: game.subject_id,
  });
  if (ok !== true) return home(req);
```

**AFTER**
```ts
  const { data: game, error: gameError } = await supabase
    .from('games').select('id, game_url, subject_id, is_visible')
    .eq('id', gameId).maybeSingle();
  if (gameError) return deny(req, 'TECHNICAL', (gameError as { code?: string }).code);
  if (!game || !game.is_visible || !game.game_url) return deny(req, 'GAME_NOT_FOUND');

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('status, sub_end').eq('id', user.id).maybeSingle();
  if (profileError)
    return deny(req, 'TECHNICAL', (profileError as { code?: string }).code);
  if (!profile) return deny(req, 'PROFILE_MISSING');

  const expired =
    profile.sub_end && new Date(profile.sub_end) < new Date(new Date().toDateString());
  if (profile.status === 'suspended') return deny(req, 'STATUS_SUSPENDED');
  if (profile.status === 'expired' || Boolean(expired))
    return deny(req, 'SUBSCRIPTION_EXPIRED');   // ⚠️ W4 باقٍ — لا استثناء للأدمِن بعد

  // ⚠️ دفاعٌ عن عمق: العمود uuid NOT NULL، فهذا يحرس ما لم نتوقّعه
  if (!UUID_RE.test(String(game.subject_id)))
    return deny(req, 'TECHNICAL', 'INVALID_SUBJECT_ID');

  const { data: ok, error: rpcError } = await supabase.rpc('can_access_subject', {
    p_subject: game.subject_id,
  });
  // ⚠️ خطأٌ ليس رفضًا
  if (rpcError) return deny(req, 'TECHNICAL', (rpcError as { code?: string }).code);
  if (ok !== true) return deny(req, 'ACCESS_DENIED');
```

**وسطران آخران:**
```ts
// 51 — يعود إلى لعبته بعد الدخول
return NextResponse.redirect(
  new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url)
);

// 90 — الرمز الغائب لا يُخرج صفحة 500 خام
let sig: string;
try { sig = await hmac(`t|${slug}|${exp}`); }
catch { return deny(req, 'TECHNICAL', 'GATE_SECRET_MISSING'); }
```

### `src/app/game-unavailable/page.tsx` — جديد

صفحةٌ على نمط `*-locked` القائم، تقرأ `?r=` وتعرض رسالةً واحدةً
مطابقة، وزرَّ إعادةٍ للحالات التقنية وحدها.

---

## RISK LEVEL

# LOW

**ولا شرطَ أمنيّ تراخى:** كل ما كان يُردّ ما زال يُردّ — **والحارس صار
أضيق** (حارس UUID إضافي، و`ACCESS_DENIED` لا تقع إلا على `false` صريح).

**والتغيير في الاستجابة لا في القرار.** والمخاطرة الوحيدة صفحةٌ جديدة
لا يعتمد عليها شيء.

⚠️ **ولا يُختبر محليًّا اليوم:** `GAME_GATE_SECRET` غير مضبوط — فالمسار
يرمي عند إصدار التوكن. **والاختبار الكامل يحتاج ضبطه في الفرع.**

---

# STOP — DO NOT APPLY
