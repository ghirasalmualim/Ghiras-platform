import Link from 'next/link';
import Logo from '@/components/Logo';
import AddToMySpace from '@/components/AddToMySpace';

export const metadata = {
  title: 'المعلّم ورئيس القسم — غراس المعلم',
  description: 'أدوات المعلّم ورئيس القسم: ستوديو الحصة الذكية، بنك غراس، سجل الحضور والدرجات، وسجلّات القسم.',
};

/**
 * صفحة قسم «المعلّم ورئيس القسم» المستقلة.
 * نُقل محتواها من لوحة الأدوات التي كانت تتوسّع أسفل الكرت في الرئيسية،
 * لتصبح صفحة خاصة أنظف وأوضح. الكلاسات (home/panel/tile) عامة في globals.css.
 *
 * «سجلات رئيس القسم» تطبيق مكتفٍ بذاته يُفتح عبر الحارس (مسار API) لا صفحة next.
 * اجعليها null لإرجاع الخانة إلى وضع «قريبًا».
 */
const HEAD_RECORDS_HREF: string | null = '/api/head-records';

export default function TeacherPage() {
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
          المعلّم ورئيس القسم 👨‍🏫👩‍🏫
        </h1>
        <p className="animate-float-in mt-3 text-ink/55" style={{ animationDelay: '0.15s' }}>
          أدوات مهنية وسجلّات ذكية
        </p>
      </section>

      {/* المحتوى */}
      <section className="px-5 pb-12">
        <div className="home w-full max-w-3xl mx-auto text-right">
          <div className="panel pp animate-float-in" style={{ animationDelay: '0.2s' }}>
            <div className="row one">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <a
                  className="tile"
                  href="https://studio.ghiras-edu.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="em" aria-hidden="true">
                    🎬
                  </span>
                  <span>
                    <b>
                      ستوديو الحصة الذكية
                      <span className="tag paid">مستقل · مباشر</span>
                    </b>
                    <small>تجهيز الحصص وتوليد الدرس والصور بالذكاء</small>
                  </span>
                </a>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <AddToMySpace itemType="tool" itemKey="studio" label="ستوديو الحصة الذكية" />
                </div>
              </div>
            </div>

            <div className="row one">
              <Link className="tile" href="/gharas-bank">
                <span className="em" aria-hidden="true">
                  🌱
                </span>
                <span>
                  <b>
                    بنك غراس
                    <span className="tag paid">مستقل · ٨ د.ك / ٦ أشهر</span>
                  </b>
                  <small>أوراق عمل ووسائل تعليمية جاهزة وقابلة للتخصيص</small>
                </span>
              </Link>
            </div>

            <div className="grouplbl">المتابعة الصفية</div>
            <div className="row two">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link className="tile" href="/attendance">
                  <span className="em" aria-hidden="true">
                    🗓️
                  </span>
                  <span>
                    <b>سجل الحضور الذكي</b>
                    <small>متابعة حضور الطالبات</small>
                  </span>
                </Link>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <AddToMySpace itemType="tool" itemKey="attendance" label="سجل الحضور الذكي" />
                </div>
              </div>
              {/* سجل الدرجات أداة خارجية تُفتح عبر مُصدِّر التصاريح */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <a
                  className="tile"
                  href="/api/tool-access?tool=gradebook"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="em" aria-hidden="true">
                    📊
                  </span>
                  <span>
                    <b>سجل الدرجات الذكي</b>
                    <small>رصد وتحليل الدرجات سحابيًا</small>
                  </span>
                </a>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <AddToMySpace itemType="tool" itemKey="gradebook" label="سجل الدرجات الذكي" />
                </div>
              </div>
            </div>

            <div className="grouplbl">سجلّات القسم</div>
            <div className="row one">
              {HEAD_RECORDS_HREF ? (
                <a className="tile" href={HEAD_RECORDS_HREF}>
                  <span className="em" aria-hidden="true">
                    🗂️
                  </span>
                  <span>
                    <b>سجلات رئيس القسم</b>
                    <small>زيارات · كادر · تقييم · تصدير</small>
                  </span>
                </a>
              ) : (
                <div className="tile soon" aria-disabled="true">
                  <span className="em" aria-hidden="true">
                    🗂️
                  </span>
                  <span>
                    <b>
                      سجلات رئيس القسم
                      <span className="tag wip">قريبًا</span>
                    </b>
                    <small>زيارات · كادر · تقييم · تصدير</small>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="legend">
            <span>
              <span className="tag paid">مستقل</span> منتج بسعره الخاص
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
