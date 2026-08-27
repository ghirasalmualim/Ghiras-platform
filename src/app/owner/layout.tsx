'use client';
/**
 * غراس للمحاسبة — Stage 11: صدفة وضع المالكة — خمسة أقسام حرفية
 * (وضعي · فلوسي · فواتيري · مستنداتي · مستشاري)، لا سادس؛ شريط
 * سفلي للجوال أولًا. معزولة عن واجهة المنصة التعليمية.
 * الإنفاذ الفعلي في مسارات الـAPI (fail-closed) — الصدفة بلا بيانات.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { OwnerProvider, t, useOwner } from './owner-client';

const TABS = [
  { href: '/owner', key: 'SECTION_STATUS', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { href: '/owner/flusi', key: 'SECTION_MONEY', icon: 'M12 3v18m-6-5c0 2 2.5 3 6 3s6-1 6-3-2-3-6-3-6-1-6-3 2.5-3 6-3 6 1 6 3' },
  { href: '/owner/fawatiri', key: 'SECTION_INVOICES', icon: 'M7 3h10a1 1 0 011 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 011-1zm2 5h6m-6 4h6' },
  { href: '/owner/mustanadati', key: 'SECTION_DOCS', icon: 'M6 2h8l4 4v16H6zM14 2v4h4M9 12h6m-6 4h6' },
  { href: '/owner/mustashari', key: 'SECTION_ADVISOR', icon: 'M12 3a7 7 0 00-7 7c0 2.5 1.3 4.3 3 5.6V19h8v-3.4c1.7-1.3 3-3.1 3-5.6a7 7 0 00-7-7zM10 22h4' },
] as const;

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading, denied, companies, company, setCompanyId } = useOwner();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="font-cairo text-lg font-extrabold text-sage-deep">{t('APP_TITLE')}</h1>
        {companies.length > 1 && company && (
          <select
            aria-label="الشركة"
            className="rounded-xl border border-sage-light bg-white/70 px-2 py-1 text-sm"
            value={company.id}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {companies.length === 1 && company && (
          <span className="text-sm text-ink/60">{company.name}</span>
        )}
      </header>

      <main className="flex-1 px-4 pb-24">
        {loading && <p className="py-10 text-center text-sm text-ink/50">{t('LOADING')}</p>}
        {!loading && denied && (
          <p className="py-10 text-center text-sm text-ink/60">{t('ERROR_NO_ACCESS')}</p>
        )}
        {!loading && !denied && children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-sage-light/60 bg-cream/95 backdrop-blur"
           aria-label="أقسام المالكة">
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                  active ? 'font-bold text-sage-deep' : 'text-ink/50'}`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"
                     stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={tab.icon} />
                </svg>
                {t(tab.key)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <OwnerProvider>
      <Shell>{children}</Shell>
    </OwnerProvider>
  );
}
