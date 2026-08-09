import Link from 'next/link';
import Logo from '@/components/Logo';

export const metadata = {
  title: 'ألعاب ومعلومات — غراس المعلم',
  description: 'ألعاب تعليمية جاهزة ومعلومات مفيدة، مفتوحة للجميع مجانًا.',
};

/**
 * ═══════════════════════════════════════════════════════════════
 *  محتوى خانة «ألعاب ومعلومات»
 *  كل عنصر: عنوان + وصف/معلومة + رابط اللعبة + شارة اختيارية.
 *  لإضافة لعبة: انسخي سطرًا وعبّئيه. الروابط تفتح من نطاق الألعاب.
 * ═══════════════════════════════════════════════════════════════
 */
const GAMES_BASE = 'https://games.ghiras-edu.com';

type Item = {
  title: string;
  info: string;
  href: string; // رابط اللعبة (كامل أو مسار داخل نطاق الألعاب)
  badge?: string;
  tone?: 'sage' | 'gold';
};

const ITEMS: Item[] = [
  { title: 'مدينة الحكمة 🏰', info: 'المدينة فقدت سحرها… تجوّل فيها، أعِد إليها الحياة، وابنِ أساسك خطوة بخطوة.', href: '/gi/wisdom-city.html', badge: 'تأسيس الأطفال 🧒', tone: 'gold' },
  { title: 'سلّم التحدي 🪜', info: 'اصعدوا درجةً درجة — كل إجابة صحيحة ترفعكم، ولا شيء يُخصم أبدًا.', href: '/gi/challenge-ladder.html', badge: 'وقت غراس', tone: 'sage' },
  { title: 'المحقق 🕵️', info: 'أربع شهادات وأدلّة تتكشّف — من يصل إلى الحقيقة بأقلّ دليل؟', href: '/gi/detective.html', badge: 'وقت غراس', tone: 'gold' },
  { title: 'غرفة الهروب 🔓', info: 'أربعة ألغاز… وباب واحد لا يُفتح إلا بالرمز الصحيح.', href: '/gi/escape-room.html', badge: 'وقت غراس', tone: 'sage' },
  { title: 'تحدّي ٥ ثوانٍ ⏱️', info: 'ثلاث إجابات… خمس ثوانٍ… وضغط لا يرحم!', href: '/gi/five-second-rule.html', badge: 'وقت غراس', tone: 'gold' },
  { title: 'ذاكرة البرق ⚡', info: 'شاهدوا بسرعة… ثم تذكّروا بدقّة!', href: '/gi/flash-memory.html', badge: 'وقت غراس', tone: 'sage' },
  { title: 'شفرة غراس 🔐', info: 'خمسة تحدّيات، كل حلٍّ يكشف حرفًا — من يقرأ الكلمة السرّية أولًا؟', href: '/gi/ghiras-cipher.html', badge: 'وقت غراس', tone: 'gold' },
  { title: 'خمّن الصورة 🖼️', info: 'تبدأ ظلًّا… ومن يعرفها مبكرًا يربح أكثر!', href: '/gi/guess-the-picture.html', badge: 'وقت غراس', tone: 'sage' },
  { title: 'الصندوق الغامض 🎁', info: 'اختر صندوقًا… ولا أحد يعرف ما بداخله!', href: '/gi/mystery-box.html', badge: 'وقت غراس', tone: 'gold' },
  { title: 'فرقِعها! 🎈', info: 'اختاروا بالونًا… وشوفوا وش يطلع منه!', href: '/gi/pop-it.html', badge: 'وقت غراس', tone: 'sage' },
  { title: 'اختر مخاطرتك 🎲', info: 'كلما ارتفعت النقاط… اشتدّ التحدّي. فهل تجازفون؟', href: '/gi/risk-board.html', badge: 'وقت غراس', tone: 'gold' },
  { title: 'اكتشف المختلف 🔍', info: 'عنصرٌ واحد يختلف عن الباقي… من يجده أولًا؟', href: '/gi/spot-the-odd.html', badge: 'وقت غراس', tone: 'sage' },
  { title: 'جزيرة المفاجآت 🏝️', info: 'ستة أماكن… وكل مكان يخبّئ مفاجأة!', href: '/gi/surprise-island.html', badge: 'وقت غراس', tone: 'gold' },
  { title: 'تحدّي الدول والعواصم 🌍', info: 'هل تعرف العالم من أعلامه وعواصمه؟', href: '/gi/world-challenge.html', badge: 'وقت غراس', tone: 'sage' },
];

function resolve(href: string) {
  return href.startsWith('http') || href.startsWith('/') ? href : `${GAMES_BASE}/${href}`;
}

export default function GamesInfoPage() {
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
          ألعاب ومعلومات 🎮📚
        </h1>
        <div
          className="gold-thread w-36 mx-auto mt-4 animate-float-in"
          style={{ animationDelay: '0.2s' }}
          aria-hidden="true"
        />
        <p
          className="animate-float-in mt-4 max-w-md mx-auto text-base text-ink/70 leading-relaxed"
          style={{ animationDelay: '0.25s' }}
        >
          ألعاب تعليمية جاهزة ومعلومات مفيدة
          <br />
          مفتوحة <span className="font-extrabold text-sage-deep">للجميع مجانًا</span> — بدون اشتراك
        </p>
      </section>

      {/* الشبكة أو حالة «قريبًا» */}
      <section className="flex-1 px-5 pb-14">
        {ITEMS.length === 0 ? (
          <div
            className="animate-float-in mx-auto max-w-md text-center rounded-3xl border border-dashed border-sage/40 bg-sage-light/40 px-8 py-14"
            style={{ animationDelay: '0.3s' }}
          >
            <div className="text-5xl" aria-hidden="true">🌱</div>
            <p className="mt-4 text-lg font-extrabold text-sage-deep">
              المحتوى يُضاف قريبًا
            </p>
            <p className="mt-2 text-ink/60 leading-relaxed">
              هنا ستظهر الألعاب والمعلومات المجانية — تابعينا 💚
            </p>
          </div>
        ) : (
          <div className="mx-auto grid gap-6 sm:grid-cols-2 w-full max-w-3xl">
            {ITEMS.map((item, i) => {
              const isGold = item.tone === 'gold';
              return (
                <a
                  key={i}
                  href={resolve(item.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-3d group relative overflow-hidden p-7 text-right animate-float-in block"
                  style={{ animationDelay: `${0.3 + i * 0.08}s` }}
                >
                  <div
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-1.5 ${isGold ? 'bg-gold' : 'bg-sage'}`}
                  />
                  <div
                    aria-hidden="true"
                    className={`absolute -left-10 -bottom-10 w-36 h-36 rounded-full blur-2xl opacity-25 transition-opacity group-hover:opacity-40 ${isGold ? 'bg-gold' : 'bg-sage'}`}
                  />
                  {item.badge && (
                    <span
                      className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${
                        isGold
                          ? 'bg-gold-light text-gold-dark'
                          : 'bg-sage-light text-sage-deep'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  <h2 className="mt-3 text-xl font-extrabold text-ink">
                    {item.title}
                  </h2>
                  <p className="mt-1.5 text-ink/60 leading-relaxed">{item.info}</p>
                  <span
                    className={`mt-5 inline-flex items-center gap-2 font-bold ${
                      isGold ? 'text-gold-dark' : 'text-sage-dark'
                    }`}
                  >
                    ابدأ اللعب
                    <span
                      aria-hidden="true"
                      className="transition-transform group-hover:-translate-x-1"
                    >
                      ←
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </section>

      <footer className="py-6 text-center text-sm text-ink/45">
        غراس المعلم © ١٤٤٧هـ — جميع الحقوق محفوظة
      </footer>
    </main>
  );
}
