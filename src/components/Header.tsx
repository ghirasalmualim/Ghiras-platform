import Link from 'next/link';
import Logo from './Logo';

interface Crumb {
  label: string;
  href?: string;
}

/** رأس الصفحات الداخلية: الشعار + مسار التنقل */
export default function Header({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <header className="w-full max-w-5xl mx-auto px-5 pt-6 pb-2">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-3 group"
          aria-label="العودة للصفحة الرئيسية"
        >
          <Logo size={52} />
          <span className="text-xl font-extrabold text-sage-deep group-hover:text-sage-dark transition-colors">
            غراس المعلم
          </span>
        </Link>
      </div>

      <nav aria-label="مسار التنقل" className="mt-4">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink/60">
          <li>
            <Link href="/" className="hover:text-sage-dark transition-colors">
              الرئيسية
            </Link>
          </li>
          {crumbs.map((c, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-gold">‹</span>
              {c.href ? (
                <Link href={c.href} className="hover:text-sage-dark transition-colors">
                  {c.label}
                </Link>
              ) : (
                <span className="font-bold text-sage-deep">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </header>
  );
}
