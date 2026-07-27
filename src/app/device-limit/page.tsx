import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة «تجاوز حدّ الأجهزة» — تظهر عند محاولة فتح السجل من جهاز ثالث.
 */
export const dynamic = 'force-dynamic';

export default function DeviceLimitPage() {
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
          📱
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-ink">
          الحساب مفتوح على جهازين
        </h1>
        <p className="mt-3 text-ink/60 leading-relaxed">
          يُسمح باستخدام سجل الدرجات على جهازين فقط لكل حساب.
          <br />
          لتغيير أحد الجهازين، يرجى التواصل مع إدارة غراس المعلم.
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
