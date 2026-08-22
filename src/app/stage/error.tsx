'use client';

/**
 * حدُّ خطأٍ لصفحات المحتوى وحدها (`/stage/**`).
 *
 * يلتقط `ContentUnavailableError` التي ترفعها طبقة البيانات حين تتعثّر
 * قراءة الهيكل — بدل أن تُداوى بالتعثّر ببذرةٍ مخترعة.
 *
 * ⚠️ **ولا يُوضع في الجذر:** عندئذٍ يصير كل خطأ في غراس — القرآن،
 * والحديقة، واللوحة، والألعاب — «تعذّر تحميل المحتوى». وهو عين العطب
 * الذي نُصلحه: رسالةٌ واحدة لأعطابٍ لا يجمعها شيء.
 *
 * ⚠️ ولا يُعرض `error.message` ولا `digest`: قد يحملان بنية القاعدة،
 * ولا يُفيدان المشتركة في شيء.
 */
export default function StageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10 text-center">
      <p className="text-5xl" aria-hidden>
        🌧️
      </p>
      <h1 className="mt-4 text-xl font-extrabold text-ink">تعذّر تحميل المحتوى</h1>
      <p className="mt-2 max-w-sm text-ink/70 leading-relaxed">
        خللٌ تقنيّ عندنا — لا علاقة له بحسابك ولا باشتراكك.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-sage px-8 py-3 font-extrabold text-white shadow-soft transition-colors hover:bg-sage-dark"
      >
        إعادة المحاولة
      </button>
    </main>
  );
}
