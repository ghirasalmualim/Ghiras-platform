import type { Config } from 'tailwindcss';

/**
 * نظام ألوان هوية «غراس المعلم»
 * Sage Green · Sandy Gold · Off White
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: {
          DEFAULT: '#7A9E7E',
          dark: '#5C7F60',
          deep: '#41603F',
          light: '#E8F0E9',
          mist: '#F1F6F1',
        },
        gold: {
          DEFAULT: '#C9A84C',
          dark: '#A8883A',
          light: '#F2E8CF',
        },
        cream: '#FAF8F3',
        ink: '#2F3B33',
      },
      fontFamily: {
        tajawal: ['var(--font-tajawal)', 'Tajawal', 'sans-serif'],
      },
      boxShadow: {
        // ظلال ناعمة ثلاثية الأبعاد (Soft 3D)
        soft: '0 2px 8px rgba(47, 59, 51, 0.06), 0 12px 32px rgba(47, 59, 51, 0.08)',
        lift: '0 4px 12px rgba(47, 59, 51, 0.08), 0 24px 48px rgba(47, 59, 51, 0.12)',
        'gold-glow': '0 0 0 1px rgba(201, 168, 76, 0.35), 0 8px 24px rgba(201, 168, 76, 0.18)',
        inset3d: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -2px 6px rgba(47,59,51,0.05)',
      },
      borderRadius: {
        soft: '1.25rem',
        card: '1.75rem',
      },
      keyframes: {
        'float-in': {
          '0%': { opacity: '0', transform: 'translateY(24px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'leaf-sway': {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
      },
      animation: {
        'float-in': 'float-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'leaf-sway': 'leaf-sway 5s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
