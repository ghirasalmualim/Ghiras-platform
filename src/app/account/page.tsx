import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import ChangePassword from '@/components/ChangePassword';
import LogoutButton from '@/components/LogoutButton';
import {
  isStillValid,
  listEntitlements,
  hasAnyEntitlement,
  hasActiveEntitlement,
  fmtDate,
} from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

/**
 * «حسابي» — مركز الحساب.
 *
 * ⚠️ **مكوّن خادم لا عميل.** الصفحة ليست مخزَّنة مؤقتًا، فتُقرأ الجلسة
 * والملف على الخادم قبل أول رسم — فلا وميضَ مصادقةٍ ولا لحظةَ يرى فيها
 * صاحبُ الحساب نفسه زائرًا. والجزء الوحيد الذي يكتب — تغيير كلمة
 * المرور — مكوّن عميلٍ مستقلّ.
 *
 * ⚠️ **وعرضٌ فقط.** لا تعديل ذاتيّ لهاتفٍ ولا بريدٍ ولا اسمِ مستخدم —
 * ولا سياسةَ `UPDATE` على `profiles` لغير الأدمِن أصلًا، فأيُّ محاولة
 * تُحجب صامتة. والسماحُ بذلك يحتاج سياسةً بأعمدة محدَّدة، وإلا فُتح
 * معها `role` و`sub_end`.
 *
 * ⚠️ **والصلاحيات تُعرض مع الاشتراك.** `sub_end` سارٍ لا يعني وصولًا:
 * `can_access_subject` تشترط صفَّ صلاحيةٍ أيضًا. فمن يُقال له «اشتراكك
 * ساري» وهو محجوبٌ فعلًا يعيش عين ما عاشته أسماء — شاشةٌ تقول غير ما يقع.
 */

type Perm = {
  scope: string;
  stage_id: string | null;
  grade_id: string | null;
  subject_id: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  active: 'نشط',
  expired: 'منتهي',
  suspended: 'موقوف',
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-3d mt-5 p-6">
      <h2 className="text-lg font-extrabold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Fault({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-dvh px-5 py-10" dir="rtl">
      <div className="mx-auto w-full max-w-lg text-center">
        <p className="text-5xl" aria-hidden>⚠️</p>
        <h1 className="mt-4 text-xl font-black text-sage-deep">{title}</h1>
        <p className="mt-2 leading-relaxed text-ink/70">{body}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <LogoutButton />
          <Link href="/" className="text-sm font-bold text-sage-dark hover:underline">
            الرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function AccountPage() {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      'full_name, username, role, status, sub_start, sub_end, studio_until, gradebook_until, attendance_until, head_records_until, adventure_until, multiplication_until, workshops_until, game_credits, attendance_extra'
    )
    .eq('id', user.id)
    .maybeSingle();

  // ⚠️ خطأُ قراءةٍ لا يُحوّل صاحبَ الحساب زائرًا، ولا يُعرض حسابًا طبيعيًّا
  if (profileError) {
    console.error('[ACCOUNT_FAULT]', 'PROFILE_ERROR', (profileError as { code?: string }).code ?? '-');
    return <Fault title="تعذّر قراءة بيانات الحساب" body="خللٌ تقنيّ عندنا — لا علاقة له بحسابك ولا باشتراكك." />;
  }
  if (!profile) {
    console.error('[ACCOUNT_FAULT]', 'PROFILE_MISSING', '-');
    return <Fault title="حسابك يحتاج تهيئة" body="يمكن التواصل معنا لإتمامها — ولا حاجة لإنشاء حسابٍ جديد." />;
  }

  const status = profile.status as string;
  // ⚠️ رفضُ عرضٍ آمن: الـenum ثلاثٌ اليوم وقد يزيد غدًا، ولا يُعرض المجهول حسابًا سليمًا
  if (status !== 'active' && status !== 'expired' && status !== 'suspended') {
    console.error('[ACCOUNT_FAULT]', 'UNKNOWN_STATUS', '-');
    return <Fault title="تعذّر قراءة حالة الحساب" body="خللٌ تقنيّ عندنا — يمكن التواصل مع إدارة غراس المعلم." />;
  }

  const isAdmin = profile.role === 'admin';

  // صلاحيات المحتوى — سياسة «own permissions read» تتيح للمستخدم صفوفه
  const { data: permRows } = await supabase
    .from('permissions')
    .select('scope, stage_id, grade_id, subject_id')
    .eq('user_id', user.id);
  const perms = (permRows ?? []) as Perm[];

  // ⚠️ لا تُعرض المعرّفات للمستخدم — تُترجَم أسماءً من الكتالوج العام
  const ids = {
    stage: perms.map((p) => p.stage_id).filter(Boolean) as string[],
    grade: perms.map((p) => p.grade_id).filter(Boolean) as string[],
    subject: perms.map((p) => p.subject_id).filter(Boolean) as string[],
  };
  const nameOf: Record<string, string> = {};
  const gradeOfSubject: Record<string, string> = {};
  if (ids.stage.length) {
    const { data } = await supabase.from('stages').select('id, name').in('id', ids.stage);
    for (const s of data ?? []) nameOf[s.id as string] = s.name as string;
  }
  if (ids.grade.length) {
    const { data } = await supabase.from('grades').select('id, name').in('id', ids.grade);
    for (const g of data ?? []) nameOf[g.id as string] = g.name as string;
  }
  if (ids.subject.length) {
    const { data } = await supabase.from('subjects').select('id, name, grade_id').in('id', ids.subject);
    for (const s of data ?? []) {
      nameOf[s.id as string] = s.name as string;
      if (s.grade_id) gradeOfSubject[s.id as string] = s.grade_id as string;
    }
    const gids = Object.values(gradeOfSubject).filter((g) => !nameOf[g]);
    if (gids.length) {
      const { data: gs } = await supabase.from('grades').select('id, name').in('id', gids);
      for (const g of gs ?? []) nameOf[g.id as string] = g.name as string;
    }
  }

  /**
   * ⚠️ **نطاقُ الصلاحية وحده — لا حكمٌ بالوصول.**
   *
   * كانت تُرجع «وصول كامل — كل المواد»، فرأى مشتركٌ صلاحيتُه `all`
   * واشتراكُه فارغ أن وصوله كامل، ثم مُنع عند فتح أول مادة.
   *
   * و`can_access_subject` تشترط **اثنين** لغير الأدمِن: صفَّ صلاحيةٍ
   * **و**`sub_end` ساريًا. فالنطاق نصفُ الشرط، والعرضُ الذي يذكر نصفًا
   * ويسكت عن نصف يكذب — وهو عين ما نقتلعه: شاشةٌ تقول غير ما يقع.
   */
  const scopeLabel = (p: Perm): string => {
    if (p.scope === 'all') return 'كل المواد';
    if (p.scope === 'stage') return `كل ${nameOf[p.stage_id || ''] || 'المرحلة'}`;
    if (p.scope === 'grade') return `${nameOf[p.grade_id || ''] || 'صف'} — كل المواد`;
    if (p.scope === 'subject') {
      const s = nameOf[p.subject_id || ''] || 'مادة';
      const g = nameOf[gradeOfSubject[p.subject_id || ''] || ''];
      return g ? `${s} · ${g}` : s;
    }
    return p.scope;
  };

  /**
   * هل المحتوى المدفوع مفتوحٌ الآن؟ — `sub_end` وحده يحكمه.
   *
   * ⚠️ ولا يُربط به `*_until`: كل أداةٍ مستقلّةٌ بتاريخها، وأداةٌ سارية
   * تبقى سارية ولو كان الاشتراك الأساسي منتهيًا.
   */
  const contentActive = isStillValid((profile.sub_end as string | null) ?? null);

  const ents = listEntitlements(profile as Record<string, unknown>);
  const anyEver = hasAnyEntitlement(profile as Record<string, unknown>);
  const anyActive = hasActiveEntitlement(profile as Record<string, unknown>);
  const credits = (profile.game_credits as number) ?? 0;
  const extra = (profile.attendance_extra as number) ?? 0;

  return (
    <main className="min-h-dvh px-5 py-10" dir="rtl">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/" className="text-sm font-bold text-ink/55 hover:text-sage-deep">
          <span aria-hidden>→</span> الرئيسية
        </Link>
        <h1 className="mt-5 text-2xl font-black text-sage-deep">حسابي</h1>

        <Link
          href="/support"
          className="card-3d mt-5 p-5 flex items-center justify-between hover:border-sage transition-all"
        >
          <span className="font-extrabold text-ink">💬 تواصل معنا</span>
          <span className="text-xs font-bold text-ink/50">أسئلتك ومشاكلك — نرد عليك هنا</span>
        </Link>

        {/* ── معلومات الحساب ── */}
        <Card title="معلومات الحساب">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-ink/55">الاسم</dt>
              <dd className="font-bold text-ink">{profile.full_name || '—'}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/* ⚠️ من `profiles.username` لا من بريد المصادقة الداخلي */}
              <dt className="text-ink/55">رقم المستخدم</dt>
              <dd className="font-bold text-ink" dir="ltr">
                {(profile.username as string) || '—'}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-ink/55">حالة الحساب</dt>
              <dd className="font-bold text-ink">{STATUS_LABEL[status]}</dd>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="rounded-lg bg-gold-light/70 px-2.5 py-1 text-xs font-bold text-gold-dark">
                  وصول الإدارة
                </span>
                <Link
                  href="/admin"
                  className="rounded-xl border border-sage/40 bg-white px-4 py-2 text-sm font-extrabold text-sage-deep transition-colors hover:border-sage"
                >
                  لوحة التحكم
                </Link>
              </div>
            )}
          </dl>
        </Card>

        {status === 'suspended' && (
          <Card title="تنبيه">
            <p className="text-sm leading-relaxed text-ink/70">
              هذا الحساب موقوف — يرجى التواصل مع إدارة غراس المعلم.
            </p>
          </Card>
        )}

        {/* ⚠️ لا يُعرض للأدمِن اشتراكٌ ولا رصيد: وصولُه لا ينقضي ولا يُحدّ */}
        {!isAdmin && status !== 'suspended' && (
          <>
            <Card title="اشتراكاتي">
              {!anyEver ? (
                <p className="text-sm text-ink/60">لا يوجد اشتراك ساري حاليًا</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-3">
                    {ents.map((e) => {
                      const d = fmtDate(e.until);
                      return (
                        <li
                          key={e.key}
                          className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/8 pb-2 last:border-0 last:pb-0"
                        >
                          <span className="font-bold text-ink">{e.name}</span>
                          <span className={`text-sm ${e.active ? 'text-sage-dark' : 'text-ink/45'}`}>
                            {e.active ? (
                              <>
                                ساري حتى <b>{d}</b>
                              </>
                            ) : (
                              <>منتهي — {d}</>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {!anyActive && (
                    <p className="mt-4 text-sm text-ink/60">لا يوجد اشتراك ساري حاليًا</p>
                  )}
                </>
              )}
              {profile.sub_start && (
                <p className="mt-4 text-xs text-ink/45">
                  بداية الاشتراك: {fmtDate(profile.sub_start as string)}
                </p>
              )}
            </Card>

            <Card title="صلاحيات المحتوى">
              {!contentActive ? (
                <>
                  <p className="text-sm leading-relaxed text-ink/70">
                    لا يوجد وصول للمحتوى المدفوع حاليًا
                  </p>
                  {/*
                    ⚠️ يُذكر النطاق معلومةً ثانوية ولا يُسمّى «وصولًا»:
                    الصلاحية مسجّلة، والاشتراك غير سارٍ — فالباب مغلق.

                    و«عند تفعيل الاشتراك» تصف ما سيُفتح لا ما هو مفتوح،
                    فلا يُقرأ السطر وعدًا بوصولٍ قائم.
                  */}
                  {perms.length > 0 && (
                    <p className="mt-3 text-xs text-ink/45">
                      {perms.some((p) => p.scope === 'all')
                        ? 'المواد المشمولة عند تفعيل الاشتراك: جميع المواد'
                        : `المحتوى المشمول عند تفعيل الاشتراك: ${perms
                            .map(scopeLabel)
                            .join(' · ')}`}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-ink/45">
                    يمكن التواصل مع إدارة غراس المعلم لتفعيل الاشتراك.
                  </p>
                </>
              ) : perms.length === 0 ? (
                <p className="text-sm leading-relaxed text-ink/60">
                  لا توجد صلاحيات محتوى مفعّلة حاليًا — يمكن التواصل مع إدارة غراس المعلم.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {perms.map((p, i) => (
                    <li key={i} className="font-bold text-ink">
                      · وصول فعّال — {scopeLabel(p)}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {(credits > 0 || extra > 0) && (
              <Card title="الاستخدام والإضافات">
                <ul className="flex flex-col gap-3 text-sm">
                  {credits > 0 && (
                    <li className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-ink/55">رصيد توليد الألعاب</span>
                      <span className="font-bold text-ink">{credits}</span>
                    </li>
                  )}
                  {extra > 0 && (
                    <li className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-ink/55">سجلات حضور إضافية</span>
                      <span className="font-bold text-ink">{extra}</span>
                    </li>
                  )}
                </ul>
              </Card>
            )}
          </>
        )}

        <ChangePassword username={(profile.username as string) ?? null} />
      </div>
    </main>
  );
}
