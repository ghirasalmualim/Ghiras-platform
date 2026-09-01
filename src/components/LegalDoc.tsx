import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * قالب مشترك للصفحات القانونية (الخصوصية / الشروط) — بهوية غراس البصرية.
 * المحتوى يُمرَّر كبنية منظَّمة ليبقى التصميم موحّدًا وسهل التحديث.
 */
export type Block = { lead?: string; p?: string; ul?: string[] };
export type Section = { h: string; body: Block[] };

function Blocks({ body }: { body: Block[] }) {
  return (
    <>
      {body.map((b, i) => {
        if (b.ul) {
          return (
            <ul key={i} className="mt-2 space-y-2 pr-1">
              {b.ul.map((li) => (
                <li key={li} className="flex items-start gap-2 text-ink/75 leading-relaxed">
                  <span className="mt-1 text-sage shrink-0" aria-hidden="true">•</span>
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mt-2 text-ink/75 leading-[1.9]">
            {b.lead && <b className="text-ink font-extrabold">{b.lead} </b>}
            {b.p}
          </p>
        );
      })}
    </>
  );
}

export default function LegalDoc({
  title,
  updated,
  intro,
  sections,
  footNote,
}: {
  title: string;
  updated: string;
  intro: Block[];
  sections: Section[];
  footNote?: string;
}) {
  return (
    <main dir="rtl" className="min-h-dvh bg-cream px-5 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="text-center animate-float-in">
          <Link href="/" aria-label="العودة للرئيسية" className="inline-block">
            <Logo size={72} />
          </Link>
        </div>

        <article
          className="card-3d mt-6 p-7 md:p-11 animate-float-in text-right"
          style={{ animationDelay: '0.1s' }}
        >
          <h1 className="text-2xl md:text-3xl font-black text-sage-deep">{title}</h1>
          <p className="mt-2 text-sm font-bold text-ink/45">آخر تحديث: {updated}</p>
          <div className="gold-thread w-24 mt-4" aria-hidden="true" />

          <div className="mt-5">
            <Blocks body={intro} />
          </div>

          <div className="mt-8 space-y-8">
            {sections.map((s) => (
              <section key={s.h}>
                <h2 className="text-lg md:text-xl font-extrabold text-sage-dark border-r-4 border-sage/40 pr-3">
                  {s.h}
                </h2>
                <div className="mt-1.5">
                  <Blocks body={s.body} />
                </div>
              </section>
            ))}
          </div>

          {footNote && (
            <p className="mt-9 pt-5 border-t border-ink/10 text-center text-sm text-ink/50 italic">
              {footNote}
            </p>
          )}
        </article>

        <div className="mt-6 text-center animate-float-in" style={{ animationDelay: '0.2s' }}>
          <Link href="/" className="text-sm font-bold text-ink/55 hover:text-sage-dark transition-colors">
            ← العودة للرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
