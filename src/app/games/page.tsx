import Link from 'next/link';
import Logo from '@/components/Logo';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * «ألعاب غراس التفاعلية» — صفحة اختيار اللعبة.
 * كل الألعاب تشترك في نفس رصيد الألعاب. المعاينة مجانية،
 * والخصم يتم عند تشغيل لعبة داخل كل مولّد.
 */

const GAMES = [
  {
    href: '/multiplication',
    tag: 'كورس مستقل · ٣ د.ك',
    emoji: '✖️',
    title: 'جدول الضرب التفاعلي',
    desc: 'كورس كامل لإتقان جدول الضرب: استكشاف بصري، تدريب ذكي بالتكرار المتباعد، سباق ومواجهة، وخريطة إتقان. منتج مستقل بسعره الخاص.',
  },
  {
    href: '/clock',
    tag: 'مستقل · ٣ د.ك / ٦ أشهر',
    emoji: '🕐',
    title: 'الساعة التفاعلية',
    desc: 'كورس كامل لتعلّم قراءة الساعة: اسحب العقارب بإصبعك، وقراءة الوقت مكتوبًا بالعربية، «كم الساعة؟» و«اضبط الوقت» وسباق — بخمسة مستويات وأوسمة. منتج مستقل بسعره الخاص.',
  },
  {
    href: '/balloons',
    tag: 'مسابقات',
    emoji: '🎈',
    title: 'صيد البالون',
    desc: 'صوّب بالمقلاع على البالون الصحيح! الذكاء يبني الأسئلة من درسك، وكل إجابة صحيحة تفرقع بالونًا — حماس حركي للصف كله.',
  },
  {
    href: '/millionaire',
    tag: 'مسابقات',
    emoji: '🏆',
    title: 'من سيربح المليون',
    desc: 'صوّر درسك، والذكاء يبني لك مسابقة تصاعدية حتى المليون — ١٠ أسئلة جاهزة للصف.',
  },
  {
    href: '/snake',
    tag: 'لعبة حركة',
    emoji: '🎲',
    title: 'السلم والثعبان',
    desc: 'لوحة تفاعلية حتى ٥ فرق، كل فريق يختار رمزه — يجاوبون صح ليتقدّموا ويوصلون للنهاية.',
  },
  {
    href: '/xo',
    tag: 'ذكاء وتحدّي',
    emoji: '⭕',
    title: 'إكس أو',
    desc: 'فريقان ❌ و ⭕ — كل خانة تحتاج إجابة صحيحة، وأول من يجمع ثلاثة على خط يفوز.',
  },
  {
    href: '/sinjim',
    tag: 'مسابقة فرق',
    emoji: '🧠',
    title: 'سين جيم',
    desc: 'لوحة فئات ونقاط (١٥ سؤالاً) — فريقان يتنافسان، والأعلى نقاطًا يفوز.',
  },
];

export default async function GamesPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/games');

  return (
    <main className="min-h-dvh flex flex-col">
      {/* شريط علوي: رجوع للمنصة */}
      <header className="w-full flex items-center justify-start px-5 pt-5">
        <Link
          href="/"
          className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold text-sm px-5 py-2.5 transition-all"
        >
          ← رجوع لمنصة غراس
        </Link>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-5 pt-10 pb-14 text-center">
        <div className="animate-float-in">
          <Logo size={88} />
        </div>
        <h1
          className="animate-float-in mt-5 text-3xl sm:text-4xl font-black text-sage-deep tracking-tight"
          style={{ animationDelay: '0.1s' }}
        >
          ألعاب غراس التفاعلية
        </h1>
        <div
          className="gold-thread w-40 mx-auto mt-4 animate-float-in"
          style={{ animationDelay: '0.2s' }}
          aria-hidden="true"
        />
        <p
          className="animate-float-in mt-4 max-w-md text-lg text-ink/70 leading-relaxed"
          style={{ animationDelay: '0.25s' }}
        >
          اختر اللعبة، صوّر درسك، والذكاء يبنيها لك
          <br />
          كل الألعاب تشترك في نفس رصيدك — والمعاينة مجانية
        </p>

        {/* بطاقات الألعاب */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 w-full max-w-2xl">
          {GAMES.map((g, i) => (
            <Link
              key={g.href}
              href={g.href}
              className="card-3d group relative overflow-hidden p-8 text-right animate-float-in"
              style={{ animationDelay: `${0.35 + i * 0.12}s` }}
            >
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1.5 bg-gold"
              />
              <div
                aria-hidden="true"
                className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full blur-2xl opacity-25 transition-opacity group-hover:opacity-40 bg-gold"
              />
              <div className="flex items-center justify-between">
                <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-gold-light text-gold-dark">
                  {g.tag}
                </span>
                <span className="text-3xl" aria-hidden="true">{g.emoji}</span>
              </div>
              <h2 className="mt-4 text-2xl font-extrabold text-ink">
                {g.title}
              </h2>
              <p className="mt-1.5 text-ink/60 leading-relaxed">{g.desc}</p>
              <span className="mt-6 inline-flex items-center gap-2 font-bold text-gold-dark">
                افتح المولّد
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:-translate-x-1"
                >
                  ←
                </span>
              </span>
            </Link>
          ))}
        </div>

        <p
          className="animate-float-in mt-10 text-sm text-ink/45"
          style={{ animationDelay: '0.6s' }}
        >
          والمزيد من الألعاب قريبًا 🌱
        </p>
      </section>
    </main>
  );
}
