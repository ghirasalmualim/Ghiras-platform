'use client';

import { useId } from 'react';
import { PlantBody } from './Plant';
import type { GardenPlantView } from '../state';
import type { RewardKey } from '../types';

/**
 * مشهد الحديقة — ساحةٌ خضراء لا شبكةُ مربّعات.
 *
 * ⚠️ كانت الحديقة اثني عشر مربّعًا في جدول، فقالت صاحبة المنصة إنها
 * تخيّلتها «ساحة خضراء واسعة كأنها حديقة حقيقية… وبالنهار شمس وغيوم
 * وبالليل قمر هادئ». وكانت محقّة: الجدول يعرض ما تملك، والمشهد يجعلك
 * تملكه. والفرق بينهما هو الفرق بين قائمةِ نباتٍ وحديقةٍ تُزار.
 *
 * ⚠️ ولا صورة ولا أصل خارجي — كل ما ترينه هنا مرسومٌ متّجهًا من عندنا،
 * ويتلوّن من متغيّرات هوية غراس.
 *
 * ═══ العمق ═══
 * المواضع ليست مصفوفةً منتظمة: الأمامية أكبر وأوطأ، والخلفية أصغر
 * وأعلى. فتُقرأ العين الساحةَ عمقًا لا سطحًا، وتبدو الحديقة مكانًا
 * لا رسمًا.
 */

/** مواضع الزرع — اثنا عشر، موزّعة كما تُوزَّع في أرضٍ حقيقية. */
export const SPOTS: readonly { x: number; y: number; s: number }[] = [
  { x: 62, y: 168, s: 0.6 },
  { x: 148, y: 162, s: 0.58 },
  { x: 236, y: 167, s: 0.6 },
  { x: 328, y: 163, s: 0.58 },
  { x: 42, y: 202, s: 0.78 },
  { x: 132, y: 207, s: 0.8 },
  { x: 224, y: 204, s: 0.79 },
  { x: 312, y: 209, s: 0.81 },
  { x: 74, y: 243, s: 1 },
  { x: 172, y: 248, s: 1.02 },
  { x: 262, y: 245, s: 1 },
  { x: 352, y: 240, s: 0.98 },
] as const;

export type SceneMode = 'view' | 'pick';

export default function GardenScene({
  plants,
  rewards,
  night,
  mode = 'view',
  picked,
  onPick,
  highlightSlot,
}: {
  plants: GardenPlantView[];
  rewards: RewardKey[];
  night: boolean;
  mode?: SceneMode;
  picked?: number | null;
  onPick?: (slot: number) => void;
  /** النبتة التي تُسقى الآن — تُبرز قليلًا. */
  highlightSlot?: number | null;
}) {
  const bySlot = new Map(plants.map((p) => [p.slot, p]));

  /**
   * ⚠️ معرّفات التدرّجات تُولَّد لكل مشهد على حدة.
   *
   * كانت ثابتة، فلمّا اجتمع مشهدان في صفحة واحدة طغى تعريفُ الأخير
   * على الأول: ظهرت سماءُ الليل نهارًا. ومعرّفات SVG عامة في الصفحة
   * كلها لا محلّية في العنصر — وهذا ممّا يُنسى فيُكتشف بالعين.
   */
  const uid = useId().replace(/:/g, '');
  const sky = `sky-${uid}`;
  const ground = `ground-${uid}`;

  return (
    <svg
      viewBox="0 0 400 270"
      className="garden-scene"
      role="img"
      aria-label="حديقتي"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={night ? '#1c2b46' : '#cfe6f2'} />
          <stop offset="100%" stopColor={night ? '#33405e' : '#eaf3ec'} />
        </linearGradient>
        <linearGradient id={ground} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={night ? '#2f4a3b' : '#8fc0a0'} />
          <stop offset="100%" stopColor={night ? '#22382c' : '#5f9c78'} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="400" height="270" fill={`url(#${sky})`} />

      {night ? <Night /> : <Day />}

      {/* تلال ناعمة — حدٌّ منحنٍ لا خطٌّ مستقيم */}
      <path d="M0 150 Q 70 132 150 146 Q 240 162 310 140 Q 360 126 400 140 L400 270 L0 270 z" fill={`url(#${ground})`} />
      <path
        d="M0 168 Q 90 154 175 168 Q 265 182 400 162 L400 270 L0 270 z"
        fill={night ? '#27402f' : '#6ba985'}
        opacity="0.55"
      />

      {/* الزينة تُرسم قبل النبات لتبقى خلفها ولا تحجبها */}
      <Props rewards={rewards} night={night} />

      {SPOTS.map((spot, i) => {
        const plant = bySlot.get(i);
        const free = !plant;
        const show = mode === 'pick' && free;

        return (
          <g key={i}>
            {plant && (
              <g transform={`translate(${spot.x} ${spot.y}) scale(${spot.s})`}>
                <ellipse cx="0" cy="3" rx="17" ry="5" fill="#000" opacity={night ? 0.18 : 0.1} />
                <g className={highlightSlot === i ? 'g-tended' : undefined}>
                  <PlantBody type={plant.type} stage={plant.stage} progress={plant.progress} />
                </g>
              </g>
            )}

            {show && (
              <g
                transform={`translate(${spot.x} ${spot.y})`}
                className="g-spot"
                role="button"
                tabIndex={0}
                aria-label={`ازرع في الموضع ${i + 1}`}
                onClick={() => onPick?.(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onPick?.(i);
                }}
              >
                {/* ⚠️ دائرة اللمس أوسع من الرسم — الإصبع أعرض من المؤشّر */}
                <circle cx="0" cy="-6" r="22" fill="transparent" />
                <ellipse
                  cx="0"
                  cy="0"
                  rx={15 * spot.s}
                  ry={5 * spot.s}
                  fill={picked === i ? 'var(--q-gold)' : '#ffffff'}
                  opacity={picked === i ? 0.9 : 0.42}
                  stroke={picked === i ? 'var(--q-gold)' : '#ffffff'}
                  strokeWidth="1.5"
                  strokeDasharray={picked === i ? undefined : '3 3'}
                />
                {picked === i && (
                  <path
                    d="M0 -16 q -4 6 0 11 q 4 -5 0 -11 z"
                    fill="var(--q-accent)"
                    opacity="0.9"
                  />
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** نهارٌ هادئ — شمس دافئة وغيمتان. */
function Day() {
  return (
    <>
      <circle cx="332" cy="48" r="20" fill="#f3d27a" />
      <circle cx="332" cy="48" r="30" fill="#f3d27a" opacity="0.22" />
      <Cloud x={70} y={52} s={1} />
      <Cloud x={200} y={36} s={0.72} />
    </>
  );
}

/** ليلٌ ساكن — هلالٌ ونجومٌ ثابتة لا تومض. */
function Night() {
  return (
    <>
      <path d="M330 32 a 20 20 0 1 0 14 34 a 16 16 0 1 1 -14 -34 z" fill="#f0ead6" opacity="0.92" />
      {[
        [60, 40],
        [110, 66],
        [168, 34],
        [232, 58],
        [280, 30],
        [96, 100],
        [200, 96],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} fill="#f0ead6" opacity="0.75" />
      ))}
    </>
  );
}

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity="0.75">
      <ellipse cx="0" cy="0" rx="26" ry="11" fill="#fff" />
      <ellipse cx="-14" cy="4" rx="16" ry="8" fill="#fff" />
      <ellipse cx="15" cy="4" rx="18" ry="9" fill="#fff" />
    </g>
  );
}

/**
 * الزينة — أشياء تُوضع في الأرض لا كلماتٌ في قائمة.
 *
 * ⚠️ كانت تُعرض أسماءً في مربّعات، فسألت صاحبة المنصة: «حجر جميل أو
 * سياج صغير، شلون أستفيد منهم؟ ولا هم مجرّد كلام؟». وكانت محقّة —
 * كانوا كلامًا. ومكافأةٌ لا يُرى أثرها ليست مكافأة.
 */
function Props({ rewards, night }: { rewards: RewardKey[]; night: boolean }) {
  const has = (k: RewardKey) => rewards.indexOf(k) !== -1;

  return (
    <>
      {has('stone') && (
        <g transform="translate(30 236)">
          <ellipse cx="0" cy="4" rx="15" ry="4" fill="#000" opacity="0.12" />
          <path d="M-13 4 q 1 -12 13 -12 q 12 0 13 12 z" fill={night ? '#6b7280' : '#a8a79f'} />
          <path d="M-13 4 q 3 -8 10 -9 q -4 4 -4 9 z" fill="#fff" opacity="0.22" />
        </g>
      )}

      {has('fence') && (
        <g transform="translate(0 150)" opacity="0.9">
          {[8, 34, 60, 86, 112].map((x) => (
            <rect key={x} x={x} y="-16" width="5" height="22" rx="2" fill={night ? '#6a5a45' : '#c9b18d'} />
          ))}
          <rect x="6" y="-11" width="111" height="3.5" rx="1.5" fill={night ? '#6a5a45' : '#c9b18d'} />
          <rect x="6" y="-3" width="111" height="3.5" rx="1.5" fill={night ? '#6a5a45' : '#c9b18d'} />
        </g>
      )}

      {has('bench') && (
        <g transform="translate(352 214)">
          <ellipse cx="0" cy="9" rx="22" ry="4" fill="#000" opacity="0.12" />
          <rect x="-20" y="-4" width="40" height="5" rx="2" fill={night ? '#6a5a45' : '#b98f63'} />
          <rect x="-20" y="-13" width="40" height="4" rx="2" fill={night ? '#6a5a45' : '#b98f63'} />
          <rect x="-17" y="0" width="4" height="9" fill={night ? '#57493a' : '#9d7853'} />
          <rect x="13" y="0" width="4" height="9" fill={night ? '#57493a' : '#9d7853'} />
        </g>
      )}

      {has('lamp') && (
        <g transform="translate(374 178)">
          <rect x="-2" y="-16" width="4" height="34" rx="2" fill={night ? '#4a5568' : '#8a8f98'} />
          <path d="M-8 -16 h16 l-4 -11 h-8 z" fill={night ? '#f3d27a' : '#c3c8cf'} />
          {night && <circle cx="0" cy="-22" r="16" fill="#f3d27a" opacity="0.2" />}
        </g>
      )}

      {has('lantern') && (
        <g transform="translate(24 196)">
          {night && <circle cx="0" cy="-22" r="17" fill="#f3d27a" opacity="0.16" />}
          {/* ⚠️ فانوسٌ معلَّق على عصًا — كان مربّعًا أصفر عائمًا لا يُقرأ */}
          <path d="M0 6 v-26 q 0 -5 6 -5 h6" stroke={night ? '#5d6b7f' : '#8a8f98'} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M12 -25 v4" stroke={night ? '#5d6b7f' : '#8a8f98'} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6 -21 h12 l-1.5 4 h-9 z" fill={night ? '#6a5a45' : '#9aa0a8'} />
          <rect x="7" y="-17" width="10" height="11" rx="2" fill={night ? '#f3d27a' : '#e6e9ec'} opacity={night ? 0.95 : 0.85} />
          <path d="M7 -6 h10 l-1.5 3 h-7 z" fill={night ? '#6a5a45' : '#9aa0a8'} />
        </g>
      )}

      {has('fountain') && (
        <g transform="translate(196 232)">
          <ellipse cx="0" cy="6" rx="30" ry="9" fill={night ? '#2c4a5e' : '#9fc7d8'} />
          <ellipse cx="0" cy="4" rx="24" ry="7" fill={night ? '#3b6a86' : '#c2e0ec'} />
          <rect x="-3" y="-14" width="6" height="18" rx="3" fill={night ? '#55606e' : '#adb5bd'} />
          <ellipse cx="0" cy="-15" rx="9" ry="3" fill={night ? '#3b6a86' : '#c2e0ec'} />
        </g>
      )}

      {/* ⚠️ الفراشة والطائر يتحرّكان — وحركتُهما تتوقّف لمن أطفأ الحركة */}
      {has('butterfly') && (
        <g className="g-flit" transform="translate(120 132)">
          <ellipse cx="-4" cy="0" rx="5" ry="3.4" fill="#d98fa6" transform="rotate(-18)" />
          <ellipse cx="4" cy="0" rx="5" ry="3.4" fill="#e7aec0" transform="rotate(18)" />
          <rect x="-0.7" y="-3" width="1.4" height="6" rx="0.7" fill="#5b4636" />
        </g>
      )}

      {has('bird') && (
        <g className="g-glide" transform="translate(250 104)">
          <path d="M-9 0 q 5 -6 9 0 q 4 -6 9 0" stroke={night ? '#cfd6e4' : '#5b6b73'} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
      )}
    </>
  );
}
