'use client';
/**
 * غراس للمحاسبة — Stage 11: مستشاري — القسم الخامس تفرضه بنية
 * المالكة الملزمة، وحالته صادقة: **غير متاح قبل Stage 13**.
 * لا صندوق دردشة يتظاهر بالاستقبال، لا أجوبة زائفة، لا «يجهز الآن»
 * موحيةً بخدمة تعمل — PENDING_STAGE_13.
 */
import { t } from '../owner-client';

export default function MustashariPage() {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center" data-advisor-unavailable>
      <svg viewBox="0 0 24 24" className="mb-4 h-14 w-14 text-sage/60" fill="none"
           stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a7 7 0 00-7 7c0 2.5 1.3 4.3 3 5.6V19h8v-3.4c1.7-1.3 3-3.1 3-5.6a7 7 0 00-7-7zM10 22h4" />
      </svg>
      <h1 className="font-cairo text-xl font-extrabold text-ink">{t('SECTION_ADVISOR')}</h1>
      <p className="mt-2 text-sm font-semibold text-ink/70">{t('ADVISOR_UNAVAILABLE')}</p>
      <p className="mt-2 max-w-xs text-xs leading-5 text-ink/50">{t('ADVISOR_HONEST_NOTE')}</p>
    </div>
  );
}
