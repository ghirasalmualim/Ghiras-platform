import SubscribeButton from '@/components/SubscribeButton';
import { PRODUCTS, fmtKwd } from '@/lib/pricing';

/**
 * كرتُ إعلانِ «باقة المعلم» — أعلى الرئيسية.
 *
 * ⚠️ الهديّةُ (رصيدُ لعبةٍ واحدة) لا تُذكَرُ هنا عمدًا: هي مفاجأةٌ تظهرُ بعد
 *    الدفع في «مساحتي» — هكذا أرادتها صاحبةُ المنصّة.
 *
 * ⚠️ «القيمةُ منفردةً» تُحسَبُ من الأسعارِ الحيّةِ لا تُكتَبُ رقمًا، كي لا
 *    يكذبَ الكرتُ لو تغيّرَ سعرُ أداةٍ يومًا.
 */

/** أرقامٌ هنديةٌ للعرض — بقيّةُ الرئيسيةِ وصفحاتُ القفلِ تكتبُ «٢ د.ك» لا «2 د.ك». */
const ar = (s: string) => s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const kwd = (n: number) => ar(fmtKwd(n));

const ITEMS = [
  { id: 'gharas_bank', emoji: '🌱' },
  { id: 'attendance', emoji: '🗓️' },
  { id: 'gradebook', emoji: '📊' },
  { id: 'agenda', emoji: '🌿' },
] as const;

export default function TeacherPackCard() {
  const pack = PRODUCTS.teacher_pack;
  if (!pack || pack.kind !== 'bundle') return null;

  const single = ITEMS.reduce((sum, it) => sum + (PRODUCTS[it.id]?.priceKwd ?? 0), 0)
    + (PRODUCTS.studio_1?.priceKwd ?? 0) * pack.lessonCredits;
  const saving = single - pack.priceKwd;

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="card-3d relative overflow-hidden border-2 border-gold/60 bg-gradient-to-b from-gold-light/50 to-white p-6 text-right">
        {saving > 0 && (
          <span className="mb-2 inline-block rounded-full bg-gold px-3 py-1 text-[11px] font-extrabold text-white">
            وفّر {kwd(saving)}
          </span>
        )}

        <h2 className="text-2xl font-black text-sage-deep">✨ {pack.label}</h2>
        <p className="mt-1 text-sm font-bold text-ink/55">أدواتك اليومية كلها في اشتراك واحد</p>

        <ul className="mt-4 space-y-2">
          {ITEMS.map((it) => (
            <li key={it.id} className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
              <span aria-hidden className="text-lg">{it.emoji}</span>
              {PRODUCTS[it.id]?.label}
            </li>
          ))}
          <li className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
            <span aria-hidden className="text-lg">🎬</span>
            حصة من استوديو الحصة الذكية
          </li>
        </ul>
        <p className="mt-2 text-xs font-bold text-ink/45">الأدوات الأربع لمدة {ar(String(pack.months))} أشهر</p>

        <div className="mt-5 flex items-baseline gap-3">
          <span className="text-3xl font-black text-gold-dark">{kwd(pack.priceKwd)}</span>
          {saving > 0 && (
            <span className="text-base font-bold text-ink/40 line-through">{kwd(single)}</span>
          )}
        </div>

        <div className="text-center">
          <SubscribeButton
            productId="teacher_pack"
            label="اشترك في الباقة"
            hidePrice
            hint="تُفعَّل الأدوات فور تأكيد الدفع"
          />
        </div>
      </div>
    </div>
  );
}
