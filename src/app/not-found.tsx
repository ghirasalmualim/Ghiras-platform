import Link from 'next/link';
import Logo from '@/components/Logo';

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
      <Logo size={90} />
      <h1 className="mt-6 text-3xl font-black text-sage-deep">الصفحة غير موجودة</h1>
      <p className="mt-2 text-ink/60">يبدو أن هذا الرابط غير صحيح أو تم نقله</p>
      <Link
        href="/"
        className="mt-8 rounded-xl bg-sage hover:bg-sage-dark text-white font-extrabold px-8 py-3 shadow-soft transition-all"
      >
        العودة للرئيسية
      </Link>
    </main>
  );
}
