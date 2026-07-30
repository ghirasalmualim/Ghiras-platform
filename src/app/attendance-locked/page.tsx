import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة «سجل الحضور الذكي — خاص بالمشتركات».
 * تظهر لمن ليس لديها اشتراك حضور سارٍ.
 */
export const dynamic = 'force-dynamic';

export default function AttendanceLockedPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-10 text-center">
      <Link href="/" aria-label="العودة للرئيسية" className="animate-float-in">
        <Logo size={84} />
      </Link>

      <div
        className="card-3d w-full max-w-md p-10 mt-6 animate-float-in"
        style={{ animationDelay: '0.1s' }}
      >
        <span aria-hidden="true" className="text-5xl">
          📋
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-ink">
          سجل الحضور الذكي — خاص بالمشتركات
        </h1>
        <p className="mt-3 text-ink/60 leading-relaxed">
          سجّلي الحضور والغياب بضغطة، وتقارير ونسب لكل طالبة، وبياناتك محفوظة
          سحابيًا لا تضيع أبدًا.
          <br />
          فعّلي اشتراكك للبدء.
        </p>

        <div className="mt-6 rounded-2xl border border-sage/25 bg-sage-light/40 p-4">
          <div className="text-lg font-extrabold text-sage-deep">الاشتراك</div>
          <div className="text-2xl font-black text-sage-dark mt-1">٨ د.ك / ٦ أشهر</div>
          <div className="text-sm text-ink/55 mt-1">يشمل سجلّين، وكل سجل ١٠ صور لرفع الكشوف</div>
        </div>

        <p className="mt-5 text-sm text-ink/50 leading-relaxed">
          لتفعيل اشتراكك تواصلي مع إدارة غراس المعلم.
          <br />
          والدفع الإلكتروني المباشر قريبًا 🌱
        </p>

        <Link
          href="/"
          className="mt-7 inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
        >
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
