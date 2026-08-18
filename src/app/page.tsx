import Link from 'next/link';
import Logo from '@/components/Logo';
import HomeSections from '@/components/HomeSections';
import AdminLink from '@/components/AdminLink';
import { getStages } from '@/lib/supabase/data';

export const revalidate = 300; // تحديث كل 5 دقائق مع تخزين مؤقت للسرعة

export default async function HomePage() {
  const stages = await getStages();

  return (
    <main className="min-h-dvh flex flex-col">
      {/* شريط علوي: دخول / إنشاء حساب */}
      <header className="w-full flex items-center justify-start gap-2.5 px-5 pt-5">
        <Link
          href="/register"
          className="rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold text-sm px-5 py-2.5 shadow-soft transition-all"
        >
          إنشاء حساب
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-sage/40 bg-white hover:border-sage text-sage-deep font-extrabold text-sm px-5 py-2.5 transition-all"
        >
          دخول
        </Link>

        {/* يظهر للأدمِن وحده — يفحص الهوية في المتصفح فلا يكسر التخزين المؤقت */}
        <AdminLink />
      </header>

      <section className="flex-1 flex flex-col items-center px-5 pt-10 pb-10 text-center">
        {/* الشعار والاسم */}
        <div className="animate-float-in">
          <Logo size={92} />
        </div>
        <h1
          className="animate-float-in mt-4 text-4xl sm:text-5xl font-black text-sage-deep tracking-tight"
          style={{ animationDelay: '0.1s' }}
        >
          غراس المعلم
        </h1>
        <div
          className="gold-thread w-40 mx-auto mt-5 animate-float-in"
          style={{ animationDelay: '0.2s' }}
          aria-hidden="true"
        />
        <p
          className="animate-float-in mt-5 max-w-md text-lg text-ink/70 leading-relaxed"
          style={{ animationDelay: '0.25s' }}
        >
          ألعاب تعليمية تفاعلية وأدوات مهنية
          <br />
          للمعلمين والمعلمات — اختر قسمك وابدأ
        </p>

        {/* كرتان رئيسيان: ألعاب · المعلّم ورئيس القسم */}
        <div
          className="w-full mt-10 animate-float-in"
          style={{ animationDelay: '0.35s' }}
        >
          <HomeSections
            stages={stages.map((s) => ({ slug: s.slug, name: s.name }))}
          />
        </div>
      </section>

      <footer className="py-6 text-center text-sm text-ink/45">
        غراس المعلم © ١٤٤٧هـ — جميع الحقوق محفوظة
      </footer>
    </main>
  );
}
