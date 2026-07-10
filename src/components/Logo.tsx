/**
 * شعار «غراس المعلم» — غرسة تنمو داخل حلقة ذهبية.
 * رسم SVG مدمج حتى لا يعتمد على ملفات خارجية ويظل حاداً على كل الشاشات.
 */
export default function Logo({ size = 88 }: { size?: number }) {
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 96 96" width={size} height={size} fill="none">
        {/* الحلقة الذهبية */}
        <circle cx="48" cy="48" r="44" stroke="#C9A84C" strokeWidth="2.5" opacity="0.9" />
        <circle cx="48" cy="48" r="38" fill="#FFFFFF" opacity="0.75" />
        {/* التربة */}
        <path d="M28 66 Q48 74 68 66 L68 70 Q48 78 28 70 Z" fill="#C9A84C" opacity="0.85" />
        {/* الغرسة */}
        <g className="animate-leaf-sway" style={{ transformOrigin: '48px 66px' }}>
          <path d="M48 66 C48 54 48 46 48 38" stroke="#5C7F60" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M48 50 C40 48 34 42 33 34 C41 35 47 41 48 50 Z" fill="#7A9E7E" />
          <path d="M48 44 C56 42 62 36 63 28 C55 29 49 35 48 44 Z" fill="#5C7F60" />
          <path d="M48 38 C46 32 46 27 48 22 C50 27 50 32 48 38 Z" fill="#9CBF9E" />
        </g>
      </svg>
    </div>
  );
}
