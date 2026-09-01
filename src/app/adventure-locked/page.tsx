import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * صفحة «مغامرة المجموعات التفاعلية — خاص بالمشتركات».
 * تظهر لمن ليس لديها اشتراك مغامرة سارٍ.
 */
export const dynamic = 'force-dynamic';

export default function AdventureLockedPage() {
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
          🚀
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-ink">
          مغامرة المجموعات التفاعلية — خاص بالمشتركات
        </h1>
        <p className="mt-3 text-ink/60 leading-relaxed">
          حوّلي حصصك إلى مغامرة ممتدة: كل مجموعة تتقدّم في رحلتها مع كل مشاركة
          وتعاون وإنجاز، وكل تقدّم يُحفظ سحابيًا ويُستأنف في الحصة القادمة.
          <br />
          فعّلي اشتراكك للبدء.
        </p>

        <div className="mt-6 rounded-2xl border border-sage/25 bg-sage-light/40 p-4 text-right">
          <div className="text-lg font-extrabold text-sage-deep text-center mb-2">تشمل الأداة</div>
          <ul className="text-sm text-ink/70 leading-relaxed space-y-1">
            <li>🎯 مجموعات غير محدودة بأسماء ورموز وأسماء طالبات</li>
            <li>🗺️ مسارات ووجهات مختلفة لكل مرحلة وفئة</li>
            <li>⭐ نقاط بأسباب تربوية (تعاون، هدوء، إبداع…)</li>
            <li>☁️ حفظ تلقائي واستئناف بين الحصص والأجهزة</li>
          </ul>
        </div>

        <p className="mt-5 text-sm text-ink/50 leading-relaxed">
          لتفعيل الاشتراك يرجى التواصل مع إدارة غراس المعلم.
          <br />
          والدفع الإلكتروني المباشر قريبًا 🌱
        </p>

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
