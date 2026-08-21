/**
 * أوقات الشروق والغروب في الكويت — حسابًا فلكيًا لا تخمينًا.
 *
 * ═══ لماذا حساب ═══
 * ⚠️ **المغرب ليس ساعةً ثابتة.** يتقلّب في الكويت بين ٤:٥٠ عصرًا في
 * أواخر ديسمبر و٦:٥٥ مساءً في أواخر يونيو — فرقُ ساعتين. فلو ثبّتنا
 * رقمًا واحدًا لأخطأنا نصفَ السنة بساعة كاملة، وظلّ زرُّ الكهف بعد
 * مغربها أو غاب قبله.
 *
 * ═══ لماذا الكويت لا موقعُ الجهاز ═══
 * ⚠️ لا نسأل أحدًا عن موقعه ولا نطلب إذنًا. والمنصة كويتية وجمهورها
 * كويتي، فالمواقيت تُحسب لمدينة الكويت وتُقارن بتوقيتها (UTC+3 بلا
 * توقيت صيفي). ومن كان خارجها رأى مواقيتها — وذلك أصدق من أن نُريه
 * مغربًا لا يخصّه ولا يخصّنا.
 *
 * ═══ الطريقة ═══
 * خوارزمية NOAA الشمسية، وهي معيارٌ منشور. ودقّتها دقيقة أو دقيقتان
 * — وهي دقّة كافية لإظهار زرٍّ وإخفائه، ولا تكفي للأذان. ⚠️ **ولا
 * تُستعمل هذه الدالة في مواقيت صلاة أبدًا**، فالمغرب الشرعي حسابُه
 * مذاهبُ ومسائل لا يُختصر في دالة.
 */

/** مدينة الكويت. */
const LAT = 29.3759;
const LON = 47.9774;
/** الكويت UTC+3 ثابتًا — لا توقيت صيفي. */
const TZ_MINUTES = 3 * 60;

/** الزاوية المعتمدة لقرص الشمس عند الأفق مع الانكسار الجوّي. */
const ZENITH = 90.833;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** رقم اليوم في السنة (١ = ١ يناير). */
function dayOfYear(y: number, m: number, d: number): number {
  const start = Date.UTC(y, 0, 1);
  return Math.floor((Date.UTC(y, m, d) - start) / 86400000) + 1;
}

export type SunTimes = {
  /** دقائق من منتصف ليل توقيت الكويت. */
  sunriseMin: number;
  sunsetMin: number;
};

/**
 * شروق الكويت وغروبها ليومٍ ميلادي.
 *
 * @param y سنة · @param m شهر (٠ = يناير) · @param d يوم
 */
export function sunTimesKuwait(y: number, m: number, d: number): SunTimes {
  const n = dayOfYear(y, m, d);
  // الزاوية السنوية عند منتصف النهار تقريبًا
  const g = ((2 * Math.PI) / 365) * (n - 1 + 0.5);

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));

  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  const cosHa =
    Math.cos(rad(ZENITH)) / (Math.cos(rad(LAT)) * Math.cos(decl)) -
    Math.tan(rad(LAT)) * Math.tan(decl);

  // ⚠️ لا يقع في الكويت (لا شمس دائمة ولا ليل دائم)، لكنه يُحرَس
  // لئلا تُرجع الدالة NaN لو استُعملت يومًا لخط عرض قطبي.
  const clamped = Math.max(-1, Math.min(1, cosHa));
  const ha = deg(Math.acos(clamped));

  const sunriseUtc = 720 - 4 * (LON + ha) - eqTime;
  const sunsetUtc = 720 - 4 * (LON - ha) - eqTime;

  return {
    sunriseMin: Math.round(sunriseUtc) + TZ_MINUTES,
    sunsetMin: Math.round(sunsetUtc) + TZ_MINUTES,
  };
}

/** اللحظة الآن بتوقيت الكويت — يومًا في الأسبوع ودقائق من منتصف الليل. */
export function kuwaitNow(at: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  /** ٠ الأحد … ٥ الجمعة. */
  weekday: number;
  minutes: number;
} {
  // ⚠️ يُبنى من UTC لا من حقول الجهاز المحلية: جهازٌ في القاهرة أو
  // لندن يعطي أرقامًا أخرى، والمواقيت هنا كويتية فالمقارنة كويتية.
  const t = new Date(at.getTime() + TZ_MINUTES * 60000);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth(),
    day: t.getUTCDate(),
    weekday: t.getUTCDay(),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

/** الجمعة بتوقيت الكويت، وقبل المغرب. */
export function isFridayBeforeMaghrib(at: Date = new Date()): boolean {
  const now = kuwaitNow(at);
  if (now.weekday !== 5) return false;
  const { sunsetMin } = sunTimesKuwait(now.year, now.month, now.day);
  return now.minutes < sunsetMin;
}

/** ساعة ظهور دعوة الملك — الثامنة مساءً. */
export const MULK_FROM_MIN = 20 * 60;

/**
 * الليل: من الثامنة مساءً حتى الشروق.
 *
 * ⚠️ ويعبر منتصف الليل، فالمقارنة شرطان لا شرط: بعد الثامنة **أو**
 * قبل الشروق. ولو كتبناها مدًى واحدًا (`from < now < to`) لاختفى
 * الزرّ عند منتصف الليل بالضبط — وهو أكثر أوقات قراءتها.
 */
export function isMulkNight(at: Date = new Date()): boolean {
  const now = kuwaitNow(at);
  if (now.minutes >= MULK_FROM_MIN) return true;
  const { sunriseMin } = sunTimesKuwait(now.year, now.month, now.day);
  return now.minutes < sunriseMin;
}
