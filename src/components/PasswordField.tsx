'use client';

import { useId, useState } from 'react';

/**
 * حقل كلمة مرور بزرّ إظهار/إخفاء.
 *
 * ⚠️ **مكوّنٌ واحد لا خمس نسخ.** الحقول خمسة في ثلاث صفحات، ونسخُ منطق
 * العين فيها يجعلها تفترق مع الوقت — وهو ما وقع في نطاق الكوكي حين
 * تكرّر الفحص في ثلاثة ملفات فاختلفت.
 *
 * ⚠️ و`type="button"` إلزاميّ على الزرّ: زرٌّ بلا نوعٍ داخل نموذج يصير
 * زرَّ إرسال، فتُقدَّم كلمة مرورٍ ناقصة عند أول ضغطة على العين.
 *
 * ⚠️ والحالة داخل المكوّن نفسه، فلكل حقلٍ عينُه: كشفُ «الحالية» لا يكشف
 * «الجديدة».
 *
 * ⚠️ ولا تُمسّ القيمة: التبديل يغيّر `type` في العرض وحده — لا `value`
 * ولا `onChange` ولا أي منطق مصادقة. ولا تُطبع في سجلّ، ولا تُحفظ في
 * تخزينٍ محلي، ولا يُرسَل طلبٌ عند الضغط.
 *
 * ⚠️ والحشوة الداخلية بـ`paddingInlineEnd` لا بصنفٍ من Tailwind: الصنف
 * قد يتنازع مع `px-4` القائم بحسب ترتيب التوليد، والنمط السطريّ يحسمه.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  onKeyDown,
  className,
  labelClassName = 'block text-sm font-bold text-ink/80 mb-1.5',
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className: string;
  labelClassName?: string;
}) {
  const [shown, setShown] = useState(false);
  const auto = useId();
  const inputId = id ?? auto;

  return (
    <div>
      <label htmlFor={inputId} className={labelClassName}>
        {label}
      </label>

      {/* dir="ltr" ليطابق اتجاه الحقل، فتقع العين في نهايته لا في بدايته */}
      <div className="relative" dir="ltr">
        <input
          id={inputId}
          type={shown ? 'text' : 'password'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete={autoComplete}
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={className}
          placeholder={placeholder}
          style={{ paddingInlineEnd: '2.75rem' }}
        />

        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          aria-pressed={shown}
          aria-controls={inputId}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink/45 transition-colors hover:text-sage-dark"
        >
          {shown ? (
            /* عينٌ مشطوبة — الكلمة ظاهرة الآن، والضغط يُخفيها */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.7 9.7 0 0112 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.2 6.6C4 8.1 3 10.2 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.8-.9"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            /* عين — الكلمة مخفيّة، والضغط يُظهرها */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 12c0-2.5 4-7 9-7s9 4.5 9 7-4 7-9 7-9-4.5-9-7z"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
