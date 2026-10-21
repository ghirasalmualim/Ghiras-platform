import Link from 'next/link';
import Logo from '@/components/Logo';
import SubscribeButton from '@/components/SubscribeButton';

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
          سجّل الحضور والغياب بضغطة، وتقارير ونسب لكل طالبة، وبياناتك محفوظة
          سحابيًا لا تضيع أبدًا.
          <br />
          فعّلي اشتراكك للبدء.
        </p>

        <div className="mt-6 rounded-2xl border border-sage/25 bg-sage-light/40 p-4">
          <div className="text-lg font-extrabold text-sage-deep">اختاري باقتك — ٤ أشهر</div>
          <div className="text-sm text-ink/55 mt-1">كل صف (سجل) معه ١٠ صور لرفع الكشوف، وتقدرين تضيفين صفًّا بـ٤ د.ك متى احتجتِ</div>
        </div>

        <SubscribeButton productId="attendance" label="٤ صفوف" hint="اشتراك ٤ أشهر · ٤ صفوف · تجديد بأي وقت" />
        <SubscribeButton productId="attendance_lite" label="صفّان" hint="اشتراك ٤ أشهر · صفّان · تجديد بأي وقت" />


        <Link
          href="/support"
          className="mt-7 inline-block rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
        >
          💬 تواصل معنا
        </Link>
        <Link
          href="/"
          className="mt-3 block text-ink/55 hover:text-ink font-bold text-sm transition-colors"
        >
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
