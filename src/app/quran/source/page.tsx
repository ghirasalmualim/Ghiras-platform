import Link from 'next/link';
import { getManifest } from '@/features/quran/data/corpus';
import { activeReciters } from '@/features/quran/engine/reciters';

/**
 * مصدر النص — إسناد Tanzil.
 *
 * ترخيص CC BY 3.0 يبيح لنا استعمال النص بشرطين: ذكر المصدر برابط
 * واضح، وعدم تعديل النص. الإخلال بأيهما يُسقط حقنا في الاستعمال، فهذه
 * الصفحة شرط إطلاق لا تحسين.
 *
 * ⚠️ كل رقم هنا يُقرأ من `corpus/manifest.json` الذي يجاور ملف النص في
 * نفس المجلد ونفس الالتزام. لا نكتب بيانات المصدر بأيدينا في هذه
 * الصفحة، لئلا يبقى الإسناد يصف نسخة بينما المعروض نسخة أخرى.
 */

export const revalidate = 3600;

export default function SourcePage() {
  const m = getManifest();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <nav className="mb-6">
        <Link
          href="/quran"
          className="tap inline-flex items-center gap-2 text-sm font-bold text-[var(--q-mute)] transition hover:text-[var(--q-accent)]"
        >
          <span aria-hidden>→</span> القرآن الكريم
        </Link>
      </nav>

      <h1 className="mb-2 font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
        مصدر النص
      </h1>
      <p className="mb-8 text-[0.9rem] leading-relaxed text-[var(--q-mute)]">
        النص القرآني في هذه المنصة مأخوذ من مصدر موثّق، ولا يُعدَّل، ولا
        يُولَّد بأي وسيلة آلية.
      </p>

      <section className="mb-6 rounded-[1.5rem] border border-[var(--q-line)] bg-white p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Row label="المصدر">
            <a
              href={m.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[var(--q-accent)] underline underline-offset-4"
            >
              {m.source_name}
            </a>
          </Row>
          <Row label="الطبعة">{m.edition}</Row>
          <Row label="الرواية">حفص عن عاصم</Row>
          <Row label="الترخيص">
            <a
              href={m.licence_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[var(--q-accent)] underline underline-offset-4"
            >
              {m.licence}
            </a>
          </Row>
          <Row label="عدد السور">{m.surah_count}</Row>
          <Row label="عدد الآيات">{m.ayah_count.toLocaleString('ar-EG')}</Row>
          <Row label="عدد الكلمات">{m.word_count.toLocaleString('ar-EG')}</Row>
          <Row label="تاريخ الإدراج">{m.imported_at}</Row>
        </dl>

        <div className="mt-6 border-t border-[var(--q-line)] pt-5">
          <p className="mb-1.5 text-[0.78rem] font-bold text-[var(--q-mute)]">
            بصمة النص (SHA-256)
          </p>
          <p
            dir="ltr"
            className="break-all rounded-xl bg-[#f6f8f6] px-3 py-2.5 text-left font-mono text-[0.72rem] leading-relaxed text-[var(--q-ink)]"
          >
            {m.text_sha256}
          </p>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--q-mute)]">
            تُحسب هذه البصمة على ملف النص عند كل تشغيل. لو تغيّر فيه حرف
            واحد لاختلفت البصمة وتوقّف القسم بدل أن يعرض نصًا غير موثّق.
          </p>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--q-line)] bg-white p-6">
        <h2 className="mb-4 font-[family-name:var(--font-cairo)] text-lg font-extrabold text-[var(--q-ink)]">
          التلاوة
        </h2>
        {activeReciters().map((r) => (
          <div key={r.id}>
            <p className="text-[0.98rem] font-bold text-[var(--q-ink)]">
              {r.name_ar}
              {r.style ? ` — ${r.style}` : ''}
            </p>
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-[var(--q-mute)]">
              {r.licence}
            </p>
            <a
              href="https://alquran.cloud/terms-and-conditions"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[0.8rem] font-bold text-[var(--q-accent)] underline underline-offset-4"
            >
              شروط استخدام المصدر الصوتي
            </a>
          </div>
        ))}
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-0.5 text-[0.76rem] font-bold text-[var(--q-mute)]">
        {label}
      </dt>
      <dd className="text-[0.92rem] text-[var(--q-ink)]">{children}</dd>
    </div>
  );
}
