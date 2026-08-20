'use client';

import type { GrowthStage, PlantTypeKey } from '../types';

/**
 * رسم النبتة — SVG أصليّ بالكامل، حرفًا بحرف من عندنا.
 *
 * ⚠️ **ولا صورة من الإنترنت ولا أصلٌ مجهول الترخيص.** هذا شرطٌ صريح،
 * وهو أسلمُ تقنيًا أيضًا: الرسم المتّجه يكبر على أي شاشة بلا تشويش،
 * ويتلوّن من متغيّرات هوية غراس نفسها، ولا يزن كيلوبايتًا واحدًا من
 * الشبكة.
 *
 * ═══ لماذا رسمٌ واحدٌ بمعاملات لا سبعة رسوم ═══
 * لو رسمنا سبع صور لكل نبتة لصار النمو **قفزًا** بين صور، ولاحتجنا
 * خمسًا وثلاثين صورة. وهنا النبتة تكبر **متّصلةً**: كل قطرة ترفع
 * الساق قليلًا وتفتح ورقة — فيرى الطفل أثر سقيته فورًا، ولا ينتظر
 * مرحلةً كاملة ليرى شيئًا يتحرّك.
 *
 * ⚠️ ويُحترم `prefers-reduced-motion`: من أطفأ الحركة رأى النبتة في
 * موضعها الصحيح بلا انتقال — لا شاشةً ساكنة ولا حركةً مفروضة.
 */

const GROUND = 104;

export default function Plant({
  type,
  stage,
  progress,
  className = '',
}: {
  type: PlantTypeKey;
  stage: GrowthStage;
  /** ٠..١ داخل المرحلة. */
  progress: number;
  className?: string;
}) {
  // مقياسٌ متّصل ٠..٦ — هو ما يقود كل شيء في هذا الرسم
  const t = Math.max(0, Math.min(6, stage + (stage >= 6 ? 0 : progress)));

  const isTree = type === 'tree';
  const stemH = t < 0.6 ? 0 : 6 + t * (isTree ? 11 : 13);
  const top = GROUND - stemH;
  const stemW = isTree ? 2 + t * 0.9 : 1.4 + t * 0.35;

  /** أزواج الأوراق تظهر واحدًا بعد واحد مع النمو. */
  const leaves = [0, 1, 2].filter((i) => t > 1.4 + i * 0.95);
  const bloom = Math.max(0, Math.min(1, (t - 4.6) / 1.4));

  return (
    <svg
      viewBox="0 0 100 120"
      className={`plant ${className}`}
      role="img"
      aria-label={`نبتة في مرحلة النمو ${stage}`}
    >
      {/* التربة */}
      <ellipse cx="50" cy={GROUND + 4} rx="34" ry="8" fill="#8d6e4e" opacity="0.28" />
      <ellipse cx="50" cy={GROUND + 1} rx="28" ry="6" fill="#7a5c3e" opacity="0.55" />

      {/* البذرة قبل أن تشقّ التربة */}
      {t < 0.6 && (
        <ellipse cx="50" cy={GROUND - 2} rx="4.6" ry="3.4" fill="#8a6b45" />
      )}

      {stemH > 0 && (
        <>
          {/* الساق */}
          <path
            d={`M50 ${GROUND} Q ${50 - 3 - t} ${GROUND - stemH / 2} 50 ${top}`}
            stroke="var(--q-accent)"
            strokeWidth={stemW}
            strokeLinecap="round"
            fill="none"
          />

          {/* الأوراق — يمينًا ويسارًا بالتناوب */}
          {leaves.map((i) => {
            const y = GROUND - stemH * (0.32 + i * 0.22);
            const size = 7 + t * 1.5 - i * 1.2;
            const dir = i % 2 === 0 ? 1 : -1;
            return (
              <path
                key={i}
                d={`M50 ${y} q ${dir * size} ${-size * 0.75} ${dir * size * 1.5} 0 q ${-dir * size * 0.55} ${size * 0.7} ${-dir * size * 1.5} 0 z`}
                fill="var(--q-accent)"
                opacity={0.82}
              />
            );
          })}

          {/* التاج أو الزهرة */}
          {bloom > 0 && (
            <g
              transform={`translate(50 ${top}) scale(${bloom})`}
              style={{ transformOrigin: 'center' }}
            >
              <Bloom type={type} />
            </g>
          )}
        </>
      )}
    </svg>
  );
}

/**
 * ⚠️ الشكل النهائي وحده يختلف بين البذور — لا الكلفة ولا السرعة.
 * الاختيار جماليّ محض، ولو جعلنا الشجرة أبطأ لانقلب إلى حسبة.
 */
function Bloom({ type }: { type: PlantTypeKey }) {
  switch (type) {
    case 'sunflower':
      return (
        <>
          {Array.from({ length: 12 }, (_, i) => (
            <ellipse
              key={i}
              cx="0"
              cy="-11"
              rx="3.4"
              ry="8.5"
              fill="var(--q-gold)"
              transform={`rotate(${i * 30})`}
            />
          ))}
          <circle cx="0" cy="0" r="6.4" fill="#6b4b2a" />
        </>
      );

    case 'tulip':
      return (
        <>
          <path d="M-9 2 Q -9 -13 0 -16 Q 9 -13 9 2 Q 0 7 -9 2 z" fill="#c4607a" />
          <path d="M-9 2 Q -5 -9 0 -11 Q 5 -9 9 2 Q 0 6 -9 2 z" fill="#d97f94" opacity="0.75" />
        </>
      );

    case 'rose':
      return (
        <>
          <circle cx="0" cy="-3" r="11" fill="#c4607a" />
          <circle cx="0" cy="-3" r="7.5" fill="#d17f95" />
          <circle cx="0" cy="-3" r="4.4" fill="#e0a0b1" />
          <circle cx="0" cy="-3" r="1.9" fill="#f0c6d1" />
        </>
      );

    case 'herb':
      // خضراء دائمة — تمامها في أوراقها لا في زهرة
      return (
        <>
          <path d="M0 2 q -9 -7 -13 -14 q 9 1 13 9 z" fill="var(--q-accent)" opacity="0.9" />
          <path d="M0 2 q 9 -7 13 -14 q -9 1 -13 9 z" fill="var(--q-accent)" opacity="0.9" />
          <path d="M0 0 q -3 -10 0 -17 q 3 7 0 17 z" fill="var(--q-accent)" />
        </>
      );

    case 'tree':
      return (
        <>
          <circle cx="-9" cy="-2" r="12" fill="#3f6b53" />
          <circle cx="9" cy="-3" r="11" fill="#4e7a63" />
          <circle cx="0" cy="-12" r="12.5" fill="#578a6f" />
          <circle cx="0" cy="-4" r="10" fill="#4e7a63" />
        </>
      );
  }
}
