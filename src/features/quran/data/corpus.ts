/**
 * قراءة نص المصحف من قاعدة البيانات — المرحلة ٠.
 *
 * ⚠️ هذا الملف للقراءة فقط، ولا يحتوي — ولا يجوز أن يحتوي — أي دالة
 * تكتب في جداول القرآن. الكتابة الوحيدة المسموحة تأتي من سكربت
 * الاستيراد بمفتاح service_role، وقاعدة البيانات نفسها تمنع غير ذلك:
 * لا سياسة كتابة لأي دور، وصلاحيات الكتابة منزوعة عن anon و authenticated.
 *
 * لا يوجد بديل احتياطي (fallback) هنا خلافًا لـ src/lib/supabase/data.ts.
 * هناك، سقوط القاعدة يعني عرض قائمة مواد قديمة — أمر محتمل. وهنا يعني
 * عرض نص قرآني من مصدر غير موثّق، وهذا لا يُحتمل. فإن تعذّرت القراءة
 * نُرجع فراغًا وتُظهر الواجهة خطأً صريحًا.
 */

import { createClient } from "@supabase/supabase-js";
import type { Ayah, CorpusMeta, QuranWord, Surah } from "../types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function client() {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

/** فهرس السور الـ١١٤ مرتّبًا بترتيب المصحف. */
export async function getSurahs(): Promise<Surah[]> {
  const sb = client();
  if (!sb) return [];
  const { data, error } = await sb
    .from("quran_surah")
    .select("*")
    .order("number");
  if (error) return [];
  return (data ?? []) as Surah[];
}

export async function getSurah(number: number): Promise<Surah | null> {
  const sb = client();
  if (!sb) return null;
  const { data, error } = await sb
    .from("quran_surah")
    .select("*")
    .eq("number", number)
    .maybeSingle();
  if (error) return null;
  return (data as Surah) ?? null;
}

/** آيات سورة كاملة مرتّبة. المدى اختياري لعرض مقطع محدد. */
export async function getAyahs(
  surah: number,
  from?: number,
  to?: number
): Promise<Ayah[]> {
  const sb = client();
  if (!sb) return [];
  let q = sb.from("quran_ayah").select("*").eq("surah", surah);
  if (from !== undefined) q = q.gte("ayah", from);
  if (to !== undefined) q = q.lte("ayah", to);
  const { data, error } = await q.order("ayah");
  if (error) return [];
  return (data ?? []) as Ayah[];
}

/**
 * كلمات مقطع من آيات، مرتّبة بالسورة ثم الآية ثم الموضع.
 * الترتيب مقصود ولا يجوز لأي مستهلك أن يخلطه.
 */
export async function getWords(
  surah: number,
  from: number,
  to: number
): Promise<QuranWord[]> {
  const sb = client();
  if (!sb) return [];
  const { data, error } = await sb
    .from("quran_word")
    .select("*")
    .eq("surah", surah)
    .gte("ayah", from)
    .lte("ayah", to)
    .order("ayah")
    .order("position");
  if (error) return [];
  return (data ?? []) as QuranWord[];
}

/**
 * سجل النص المعتمد حاليًا: مصدره وترخيصه وبصمته ومن راجعه.
 * تعرضه صفحة «مصدر النص» ليطّلع عليه أي معلم أو ولي أمر.
 */
export async function getCurrentCorpusMeta(): Promise<CorpusMeta | null> {
  const sb = client();
  if (!sb) return null;
  const { data, error } = await sb
    .from("quran_corpus_meta")
    .select("*")
    .eq("is_current", true)
    .maybeSingle();
  if (error) return null;
  return (data as CorpusMeta) ?? null;
}
