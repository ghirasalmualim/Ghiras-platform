import Link from 'next/link';
import Logo from '@/components/Logo';
import AddToMySpace from '@/components/AddToMySpace';
import { getStages } from '@/lib/supabase/data';

export const metadata = {
  title: 'ألعاب غراس — غراس المعلم',
  description: 'مكتبة ألعاب غراس التعليمية للمرحلتين الابتدائية والمتوسطة، وألعاب وتحديات تفاعلية.',
};

/**
 * صفحة قسم «الألعاب» المستقلة.
 * نُقل محتواها من لوحة الألعاب التي كانت تتوسّع أسفل الكرت في الرئيسية،
 * لتصبح صفحة خاصة أنظف وأوضح. الكلاسات (home/panel/tile) عامة في globals.css.
 */
export default async function GamesHubPage() {
  const stages = await getStages();
  const primary = stages.find((s) => s.slug === 'primary');
  const middle = stages.find((s) => s.slug === 'middle');

  return (
    <main className="min-h-dvh flex flex-col">
      {/* شريط علوي: رجوع للرئيسية */}
      <header className="w-full flex items-center justify-start gap-2.5 px-5 pt-5">
        <Link
          href="/"
          className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold text-sm px-5 py-2.5 transition-all inline-flex items-center gap-2"
        >
          <span aria-hidden="true">→</span>
          الرئيسية
        </Link>
      </header>

      {/* الترويسة */}
      <section className="px-5 pt-10 pb-6 text-center">
        <div className="animate-float-in inline-block">
          <Logo size={78} />
        </div>
        <h1
          className="animate-float-in mt-5 text-3xl sm:text-4xl font-black text-sage-deep tracking-tight"
          style={{ animationDelay: '0.1s' }}
        >
          ألعاب غراس 🎮
        </h1>
        <p className="animate-float-in mt-3 text-ink/55" style={{ animationDelay: '0.15s' }}>
          متعة تعليمية تفاعلية للطلاب
        </p>
      </section>

      {/* المحتوى */}
      <section className="px-5 pb-12">
        <div className="home w-full max-w-3xl mx-auto text-right">
          <div className="panel gp animate-float-in" style={{ animationDelay: '0.2s' }}>
            <div className="grouplbl">حسب المرحلة</div>
            <div className="row two">
              <Link className="tile" href={`/stage/${primary?.slug ?? 'primary'}`}>
                <span className="em" aria-hidden="true">
                  🎒
                </span>
                <span>
                  <b>{primary?.name ?? 'المرحلة الابتدائية'}</b>
                  <small>مكتبة ألعاب الصفوف الأولى</small>
                </span>
              </Link>
              <Link className="tile" href={`/stage/${middle?.slug ?? 'middle'}`}>
                <span className="em" aria-hidden="true">
                  📚
                </span>
                <span>
                  <b>{middle?.name ?? 'المرحلة المتوسطة'}</b>
                  <small>مكتبة ألعاب المرحلة المتوسطة</small>
                </span>
              </Link>
            </div>

            <div className="grouplbl">ألعاب وتحديات</div>
            <div className="row two">
              <Link className="tile" href="/games">
                <span className="em" aria-hidden="true">
                  🕹️
                </span>
                <span>
                  <b>ألعاب غراس التفاعلية</b>
                  <small>من سيربح المليون · سين جيم · جدول الضرب…</small>
                </span>
              </Link>
              <Link className="tile" href="/games-info">
                <span className="em" aria-hidden="true">
                  🧩
                </span>
                <span>
                  <b>ألعاب ومعلومات</b>
                  <small>ألعاب جاهزة ومعلومات مفيدة — مجانية</small>
                </span>
              </Link>
            </div>

            <div className="row one" style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link className="tile" href="/adventure">
                  <span className="em" aria-hidden="true">
                    🚀
                  </span>
                  <span>
                    <b>مغامرة المجموعات التفاعلية</b>
                    <small>تحدٍّ صفّي تحفيزي للفرق</small>
                  </span>
                </Link>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <AddToMySpace itemType="tool" itemKey="adventure" label="مغامرة المجموعات التفاعلية" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
