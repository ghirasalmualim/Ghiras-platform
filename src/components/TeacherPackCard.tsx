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

  // «٥ دنانير» لا «٥ د.ك» في الشارة — كما كتبتها صاحبةُ المنصّة؛ والتمييزُ
  // للعددِ من ٣ إلى ١٠ (جمعُ القلّة)، وما سواه يُكتَبُ بالرمز.
  const savingLabel =
    Number.isInteger(saving) && saving >= 3 && saving <= 10
      ? `${ar(String(saving))} دنانير`
      : kwd(saving);

  // مطويٌّ افتراضيًّا — سطرٌ واحدٌ يفتحُ التفاصيلَ عند الضغط. <details> أصليٌّ:
  // يعملُ بلا JavaScript، ولوحةُ المفاتيحِ وقارئُ الشاشةِ يفهمانه من تلقاءِ نفسيهما.
  return (
    <div className="mx-auto w-full max-w-md">
      <details className="group card-3d overflow-hidden border-2 border-gold/60 bg-gradient-to-b from-gold-light/50 to-white text-right">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-sage-deep">✨ {pack.label}</h2>
            <p className="text-[13px] font-bold text-ink/55">أدواتك كلها في اشتراك واحد</p>
          </div>
          {saving > 0 && (
            <span className="shrink-0 rounded-full bg-gold px-3 py-1 text-[11px] font-extrabold text-white">
              وفّر {savingLabel}
            </span>
          )}
          <span aria-hidden className="shrink-0 text-ink/40 transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>

        <div className="border-t border-gold/30 px-5 pb-5 pt-4">
        <ul className="space-y-2">
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
      </details>
    </div>
  );
}
