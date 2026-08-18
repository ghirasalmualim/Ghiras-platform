'use client';

import { useState } from 'react';
import type { Ayah } from '../types';
import { hiddenIndices, type HideLevel } from '../engine/hide';
import { toArabic } from './ResumeCard';

/**
 * عرض الآيات — العنصر البصري الأساسي في القسم.
 *
 * ⚠️ النص يُعرض من `text_uthmani` كما ورد، حرفًا بحرف. لا تُحذف منه
 * علامة ولا يُعاد تشكيله لأجل العرض. كل ما نفعله هنا تقطيعه بالمسافات
 * لنستطيع إخفاء كلمة دون المساس بالباقي.
 *
 * ⚠️ الإخفاء إخفاءٌ فقط: الكلمة تبقى في الشجرة وفي موضعها، ويُغيَّر
 * لونها لا محلّها. فلا يُعاد ترتيب شيء، ولا تُقطَّع الآية إلى بطاقات.
 */
export default function AyahView({
  ayahs,
  hideLevel = 0,
  activeAyah = null,
  onAyahClick,
}: {
  ayahs: Ayah[];
  hideLevel?: HideLevel;
  /** الآية التي تُتلى الآن، لتُظلَّل أثناء الاستماع. */
  activeAyah?: number | null;
  onAyahClick?: (ayah: number) => void;
}) {
  // الكلمات المكشوفة مؤقتًا باللمس — سند لحظي، يزول عند تغيّر المستوى
  const [peeked, setPeeked] = useState<Set<string>>(new Set());

  const peek = (key: string) =>
    setPeeked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="ayat" dir="rtl" lang="ar">
      {ayahs.map((a) => {
        const words = a.text_uthmani.split(/\s+/).filter(Boolean);
        // البذرة رقم الآية: فيثبت الإخفاء عبر إعادة الرسم ولا يرتجف النص
        const hidden = hiddenIndices(words.length, hideLevel, a.ayah);
        const isActive = activeAyah === a.ayah;

        return (
          <span
            key={a.ayah}
            className={isActive ? 'ayah-active' : undefined}
            onClick={onAyahClick ? () => onAyahClick(a.ayah) : undefined}
            role={onAyahClick ? 'button' : undefined}
            tabIndex={onAyahClick ? 0 : undefined}
            onKeyDown={
              onAyahClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onAyahClick(a.ayah);
                    }
                  }
                : undefined
            }
            aria-label={onAyahClick ? `الآية ${a.ayah}` : undefined}
          >
            {words.map((w, i) => {
              const key = `${a.ayah}:${i}`;
              const isHidden = hidden.has(i);
              const isPeeked = peeked.has(key);

              if (!isHidden)
                return <span key={key}>{w}{i < words.length - 1 ? ' ' : ''}</span>;

              return (
                <span key={key}>
                  <span
                    className={`hidden-word${isPeeked ? ' peek' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      peek(key);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        peek(key);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    // القارئ الصوتي يسمع «كلمة مخفية» لا فراغًا مبهمًا،
                    // ولا يسمع الكلمة نفسها فيُفسد التمرين.
                    aria-label={isPeeked ? w : 'كلمة مخفية، اضغط لكشفها'}
                  >
                    {w}
                  </span>
                  {i < words.length - 1 ? ' ' : ''}
                </span>
              );
            })}
            <span className="ayah-no" aria-label={`آية ${a.ayah}`}>
              {toArabic(a.ayah)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
