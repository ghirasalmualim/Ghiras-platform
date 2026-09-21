'use client';

import { useEffect, useState } from 'react';
import { PRODUCTS } from '@/lib/pricing';

/**
 * رسالةُ ما بعد الدفع في «مساحتي».
 *
 * كان مسارُ الرجوعِ من MyFatoorah يوجّهُ إلى /workspace?pay=ok ولا صفحةَ تقرأُ
 * العلامة — فمن تدفعُ لا ترى كلمةً واحدة. هنا تُقرأ: نجاحٌ باسمِ المنتج،
 * أو إخفاق، ولـ«باقة المعلم» هديّتُها المفاجئة.
 *
 * `p` قادمٌ من الرابطِ فلا يُوثَقُ به للتخويل — يُستعمَلُ للعرضِ وحدَه، وأيُّ
 * قيمةٍ غيرِ معروفةٍ تسقطُ إلى رسالةِ نجاحٍ عامّة. التفعيلُ نفسُه جرى في الخادم.
 */
export default function PaymentResult({ pay, product }: { pay?: string; product?: string }) {
  const [open, setOpen] = useState(pay === 'ok' || pay === 'fail');

  // نزعُ العلامةِ من الرابط كي لا تعودَ الرسالةُ عند التحديثِ أو المشاركة
  useEffect(() => {
    if (!pay) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('pay');
      u.searchParams.delete('p');
      window.history.replaceState(null, '', u.pathname + (u.search || ''));
    } catch {}
  }, [pay]);

  if (!open) return null;

  if (pay === 'fail') {
    return (
      <div className="mx-auto mb-6 max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
        {/* ⚠️ لا نَعِدُ بأنّ «شيئًا لم يُخصم»: الخادمُ يعيدُ fail أيضًا حين يُدفَعُ
            المبلغُ ويتعذّرُ التفعيل (ويُعيدُ الطلبَ للمراجعةِ اليدوية) — فالمبلغُ
            هناك مخصومٌ فعلًا، والوعدُ بخلافِه كذب. */}
        <p className="font-extrabold text-red-700">لم يكتمل الدفع أو التفعيل</p>
        <p className="mt-1 text-sm text-red-700/80">
          إذا انخصم المبلغ من حسابك، تواصل معنا ونفعّل لك اشتراكك فورًا — طلبك محفوظ عندنا.
        </p>
        <a href="/support" className="mt-3 inline-block rounded-xl bg-red-600 px-5 py-2 text-sm font-extrabold text-white">
          💬 تواصل معنا
        </a>
        <button onClick={() => setOpen(false)} className="ms-3 mt-3 text-sm font-bold text-red-700/70 underline">
          إغلاق
        </button>
      </div>
    );
  }

  const known = product ? PRODUCTS[product] : undefined;
  const isPack = product === 'teacher_pack';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5" onClick={() => setOpen(false)}>
      <div
        className="card-3d w-full max-w-sm bg-white p-7 text-center"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="text-5xl" aria-hidden>{isPack ? '🎉' : '✅'}</div>
        <h2 className="mt-3 text-xl font-black text-sage-deep">تم الدفع بنجاح</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          {known ? <>فُعِّل لك: <b>{known.label}</b></> : 'فُعِّل اشتراكك'}
        </p>

        {isPack && (
          <div className="mt-5 rounded-2xl border-2 border-gold/60 bg-gold-light/50 p-4">
            <div className="text-3xl" aria-hidden>🎁</div>
            <p className="mt-1 text-lg font-black text-gold-dark">مبروك!</p>
            <p className="mt-1 text-sm font-bold leading-relaxed text-ink/75">
              حصلتم على هدية: رصيد ١ لألعاب غراس التفاعلية
            </p>
          </div>
        )}

        <button
          onClick={() => setOpen(false)}
          className="mt-6 w-full rounded-xl bg-sage py-3 font-extrabold text-white shadow-soft transition hover:bg-sage-dark"
        >
          تمام
        </button>
      </div>
    </div>
  );
}
