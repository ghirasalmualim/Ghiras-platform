import Link from 'next/link';
import { getManifest, getSurahs } from '@/features/quran/data/corpus';
import ResumeCard from '@/features/quran/components/ResumeCard';
import DailyTaskCard from '@/features/quran/components/DailyTaskCard';
import { KahfFriday, MulkNight } from '@/features/quran/components/QuranCalls';
import SourceLine from '@/features/quran/components/SourceLine';

/**
 * بوابة قسم القرآن — أول شاشة.
 *
 * عنصران فقط. أي زيادة هنا تُضعف الاختيار بدل أن تُثريه: الطفل الذي
 * يفتح القسم يحتاج أن يعرف من أول نظرة إلى أين يذهب.
 *
 * القراءة والاستماع مفتوحان للزائر بلا حساب — لا نضع بابًا قبل المصحف.
 */

export const revalidate = 3600;

export default function QuranGate() {
  const manifest = getManifest();
  const surahNames = getSurahs().map((s) => s.name_ar);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:pt-12">
      <nav className="mb-8">
        <Link
          href="/"
          className="tap inline-flex items-center gap-2 text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> غراس
        </Link>
      </nav>

      <header className="mb-10 text-center">
        <p className="mb-3 text-4xl" aria-hidden>
          🌿
        </p>
        <h1 className="font-[family-name:var(--font-cairo)] text-3xl font-extrabold text-[var(--q-ink)] sm:text-4xl">
          القرآن الكريم
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[0.95rem] leading-relaxed text-[var(--q-mute)]">
          اقرأ واستمع واحفظ، على مهلك
        </p>
      </header>

      {/* دعوتا الوقت — الكهف يوم الجمعة إلى مغربها، والملك كل ليلة.
          ⚠️ وموضعهما قبل كل شيء عن قصد: في وقتهما هما المقصد، وفي
          غيره غيرُ موجودتين أصلًا. ولا تزاحمان «عنصرين فقط» لأنهما
          ضيفُ وقتٍ لا ساكنٌ دائم.
          ⚠️ ولا تجتمعان: الكهف ينطفئ بالمغرب، والملك يبدأ الثامنة. */}
      <KahfFriday />
      <MulkNight />

      {/* مهمة اليوم — للمسجَّلة فقط، وتختفي تمامًا إن لم يكن عليها شيء */}
      <DailyTaskCard surahNames={surahNames} />

      <ResumeCard surahNames={surahNames} />

      <div className="grid gap-4 sm:grid-cols-2">
        <GateCard
          href="/quran/curriculum"
          emoji="📚"
          title="منهجي الدراسي"
          desc="احفظ وراجع القرآن المقرر في منهجك الدراسي"
        />
        <GateCard
          href="/quran/browse"
          emoji="🌿"
          title="القرآن الكريم"
          desc="اقرأ واحفظ وراجع من سور القرآن الكريم"
        />
      </div>

      {/* رحلتي — المرآة: أين أنا من القرآن كله. قبل المراجعة لأنها
          الجواب الأول لمن يفتح: «وين وصلت؟» */}
      <Link
        href="/quran/journey"
        className="tap mt-4 flex items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-4 transition hover:border-[#cfe0d5]"
      >
        <span>
          <span className="block font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">
            📖 رحلتي مع القرآن
          </span>
          <span className="mt-0.5 block text-[0.8rem] text-[var(--q-mute)]">
            هدفك وتقدمك وسورك — في مكان واحد
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xl text-[var(--q-accent)]">
          ←
        </span>
      </Link>

      {/* مراجعة اليوم — مدخل هادئ، والصفحة نفسها تتكفّل بحال الزائرة */}
      <Link
        href="/quran/review"
        className="tap mt-4 flex items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-4 transition hover:border-[#cfe0d5]"
      >
        <span>
          <span className="block font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">
            🔄 مراجعة اليوم
          </span>
          <span className="mt-0.5 block text-[0.8rem] text-[var(--q-mute)]">
            ما يحتاج تثبيتًا اليوم فقط
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xl text-[var(--q-accent)]">
          ←
        </span>
      </Link>

      {/* اختبار الثبات — دعوةٌ لا بوابة: لا يُقفل خلفه شيء */}
      <Link
        href="/quran/stability"
        className="tap mt-3 flex items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-4 transition hover:border-[#cfe0d5]"
      >
        <span>
          <span className="block font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">
            🧠 اختبر ثبات حفظك
          </span>
          <span className="mt-0.5 block text-[0.8rem] text-[var(--q-mute)]">
            غراس يختار لك مقطعًا من محفوظك
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xl text-[var(--q-accent)]">
          ←
        </span>
      </Link>

      {/* حديقتي — أثر الرحلة لا بابٌ إلى عمل.
          ⚠️ وموضعها بعد المراجعة عمدًا: الحديقة نتيجةُ ما يُعمل هناك،
          فلو تصدّرت الصفحة لصارت هي المقصد وصار الحفظ وسيلةً إليها. */}
      <Link
        href="/quran/garden"
        className="tap mt-3 flex items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--q-line)] bg-white px-5 py-4 transition hover:border-[#cfe0d5]"
      >
        <span>
          <span className="block font-[family-name:var(--font-cairo)] text-[1rem] font-extrabold text-[var(--q-ink)]">
            🌿 حديقتي
          </span>
          <span className="mt-0.5 block text-[0.8rem] text-[var(--q-mute)]">
            رحلتي مع القرآن — تنمو مع كل حفظٍ ومراجعة
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xl text-[var(--q-accent)]">
          ←
        </span>
      </Link>

      {/* الإسناد — واجب ترخيصي، وموضعه هنا هادئ وقابل للوصول */}
      {/* إسناد Tanzil — شرط CC BY، من المانيفست عبر مكوّنٍ واحد مشترك */}
      <SourceLine className="mt-12" />
    </main>
  );
}

function GateCard({
  href,
  emoji,
  title,
  desc,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-[1.5rem] border border-[var(--q-line)] bg-white p-7 text-center shadow-[0_2px_10px_rgba(47,59,51,0.05)] transition hover:-translate-y-0.5 hover:border-[#cfe0d5] hover:shadow-[0_10px_28px_rgba(47,59,51,0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--q-accent)]"
    >
      <span className="mb-3 text-4xl" aria-hidden>
        {emoji}
      </span>
      <span className="font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
        {title}
      </span>
      <span className="mt-2 text-[0.88rem] leading-relaxed text-[var(--q-mute)]">
        {desc}
      </span>
    </Link>
  );
}
