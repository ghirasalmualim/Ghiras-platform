import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { isStillValid, TOOL_COLS } from '@/lib/entitlements';
import AddToMySpace from '@/components/AddToMySpace';
import {
  TOOL_REGISTRY,
  parseSubjectKey,
  subjectPath,
  type WsItemType,
} from '@/lib/workspace-items';

export const dynamic = 'force-dynamic';

/**
 * مساحتي — لوحة اختصاراتٍ منسّقةٌ من المعلّم (المرحلة أ الجديدة).
 * تعرض فقط العناصر التي اختار المعلّم إضافتها (workspace_items). ليست
 * مصدر صلاحية: حالة كلّ عنصرٍ تُشتقّ حيًّا من profiles، والنقر يمرّ ببوّابة
 * المصدر القائمة. الإزالة تحذف الاختصار فقط. لا service-role.
 */

type Row = {
  id: string;
  item_type: WsItemType;
  item_key: string;
  label_cache: string | null;
  context_cache: string | null;
  created_at: string;
};

type Card = {
  key: string;
  type: WsItemType;
  itemKey: string;
  emoji: string;
  name: string;
  context: string | null;
  tone: 'available' | 'free' | 'expired';
  actionHref: string;
  actionLabel: string;
  external: boolean;
};

const TONE: Record<Card['tone'], string> = {
  free: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  available: 'bg-sage/10 text-sage-dark border-sage/30',
  expired: 'bg-amber-50 text-amber-700 border-amber-200',
};
const TONE_LABEL: Record<Card['tone'], string> = {
  free: 'مجاني',
  available: 'متاح',
  expired: 'انتهى الاشتراك',
};

export default async function WorkspacePage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/workspace');

  const { data: profile } = await supabase
    .from('profiles')
    .select(['full_name', 'role', 'status', 'sub_end', ...TOOL_COLS].join(', '))
    .eq('id', user.id)
    .maybeSingle();

  const p = (profile ?? {}) as Record<string, unknown>;
  const isAdmin = p.role === 'admin';
  const name = (p.full_name as string) || 'معلمتنا';
  const status = p.status as string | undefined;
  const subEnd = (p.sub_end as string | null) ?? null;
  const subjectsAllowed =
    isAdmin || (status === 'active' && (subEnd === null || isStillValid(subEnd)));

  const { data: itemsData } = await supabase
    .from('workspace_items')
    .select('id, item_type, item_key, label_cache, context_cache, created_at')
    .eq('teacher_user_id', user.id)
    .order('created_at', { ascending: false });

  const rows = (itemsData ?? []) as Row[];

  const cards: Card[] = [];
  for (const r of rows) {
    if (r.item_type === 'tool') {
      const def = TOOL_REGISTRY[r.item_key];
      if (!def) continue; // اختصارٌ لأداةٍ غير معروفة → يُتجاهل بأمان
      let tone: Card['tone'];
      let accessible: boolean;
      if (isAdmin || def.col === null) {
        tone = def.col === null ? 'free' : 'available';
        accessible = true;
      } else if (isStillValid((p[def.col] as string | null) ?? null)) {
        tone = 'available';
        accessible = true;
      } else {
        tone = 'expired';
        accessible = false;
      }
      cards.push({
        key: r.id,
        type: 'tool',
        itemKey: r.item_key,
        emoji: def.emoji,
        name: r.label_cache || def.name,
        context: r.context_cache,
        tone,
        actionHref: accessible ? def.href : (def.locked ?? def.href),
        actionLabel: accessible ? 'فتح' : 'تجديد الاشتراك',
        external: Boolean(def.external) && accessible,
      });
    } else {
      // subject: الحالة تقريبيّةٌ على مستوى الاشتراك؛ النقر يمرّ ببوّابة
      // صفحة المادة التي تفرض can_access_subject الحقيقية (دفاعٌ في العمق).
      const path = subjectPath(r.item_key);
      if (!path) continue;
      const parsed = parseSubjectKey(r.item_key)!;
      cards.push({
        key: r.id,
        type: 'subject',
        itemKey: r.item_key,
        emoji: '📚',
        name: r.label_cache || 'مادة دراسية',
        context: r.context_cache || `${parsed.stage} · ${parsed.grade}`,
        tone: subjectsAllowed ? 'available' : 'expired',
        actionHref: path, // صفحة المادة نفسها هي سلوك القفل القائم
        actionLabel: subjectsAllowed ? 'فتح' : 'تجديد الاشتراك',
        external: false,
      });
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-cream px-4 py-6 md:px-8 md:py-10">
      <nav className="max-w-5xl mx-auto flex items-center gap-2 text-sm mb-6">
        <span className="px-3 py-1.5 rounded-full bg-sage text-white font-bold">مساحتي</span>
        <Link href="/workspace/work" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">أعمالي</Link>
        <Link href="/account" className="px-3 py-1.5 rounded-full bg-white text-sage-dark border border-sage/30 hover:border-sage transition">حسابي</Link>
      </nav>

      <header className="max-w-5xl mx-auto mb-7">
        <h1 className="text-2xl md:text-3xl font-extrabold text-sage-dark">مرحبًا، {name} 🌿</h1>
        <p className="text-gray-500 mt-1 text-sm md:text-base">اختصاراتك التي اخترتِها في مكانٍ واحد.</p>
      </header>

      {cards.length === 0 ? (
        <section className="max-w-5xl mx-auto">
          <div className="card-3d bg-white p-8 rounded-2xl text-center">
            <span className="text-4xl">🌱</span>
            <p className="text-gray-600 mt-3 font-bold">مساحتك فارغة حتى الآن.</p>
            <p className="text-gray-500 mt-1 text-sm">
              أضيفي أدواتك وموادّك من صفحاتها بزرّ «أضف إلى مساحتي» لتظهر هنا.
            </p>
            <Link href="/" className="inline-block mt-4 text-sage-dark font-bold hover:text-sage-deep">تصفّح غراس ←</Link>
          </div>
        </section>
      ) : (
        <section className="max-w-5xl mx-auto flex flex-wrap justify-center gap-4">
          {cards.map((c) => (
            <div key={c.key} className="card-3d bg-white p-5 rounded-2xl flex flex-col gap-3 w-full sm:w-[330px] min-h-[168px]">
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl leading-none">{c.emoji}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${TONE[c.tone]}`}>{TONE_LABEL[c.tone]}</span>
              </div>
              <div>
                <h2 className="font-bold text-sage-dark leading-snug">{c.name}</h2>
                {c.context && <p className="text-gray-400 text-sm mt-0.5">{c.context}</p>}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-ink/5">
                {c.external ? (
                  <a href={c.actionHref} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-bold text-sage-dark hover:text-sage-deep whitespace-nowrap">{c.actionLabel} ←</a>
                ) : (
                  <Link href={c.actionHref}
                    className={`text-sm font-bold whitespace-nowrap ${c.tone === 'expired' ? 'text-amber-700 hover:text-amber-800' : 'text-sage-dark hover:text-sage-deep'}`}>{c.actionLabel} ←</Link>
                )}
                <AddToMySpace itemType={c.type} itemKey={c.itemKey} label={c.name} initialPinned className="!py-1" />
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
