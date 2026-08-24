import Link from 'next/link';
import { getManifest } from '@/features/quran/data/corpus';

/**
 * سطر إسناد المصدر — إبراز شرط CC BY بلا إزعاج.
 *
 * ⚠️ النص من `corpus/manifest.json` حرفًا — لا صياغة من الذاكرة،
 * فلا ينحرف الإسناد عن النسخة المعروضة فعلًا. والسطر بابٌ إلى
 * `/quran/source` حيث التفاصيل الكاملة (الرابط، الترخيص، البصمة) —
 * لا يُكرَّر نص الترخيص الطويل في كل صفحة.
 *
 * مكوّن خادم: المانيفست ملف مستودعٍ يُقرأ عند البناء.
 */
export default function SourceLine({ className = '' }: { className?: string }) {
  const m = getManifest();
  return (
    <footer className={`text-center ${className}`}>
      <Link
        href="/quran/source"
        className="tap inline-flex items-center text-[0.72rem] leading-loose text-[var(--q-mute)] underline decoration-dotted underline-offset-4 transition hover:text-[var(--q-accent)]"
      >
        النص العثماني من {m.source_name} · {m.licence}
      </Link>
    </footer>
  );
}
