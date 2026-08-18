import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { getStages, getGrades } from '@/lib/supabase/data';
import { getSurahs } from '@/features/quran/data/corpus';
import QuranCurriculumEditor from '@/features/quran/components/QuranCurriculumEditor';

/**
 * محرر منهج القرآن — لدور admin فقط.
 *
 * نفس حارس `/admin`: التحقق يجري على الخادم قبل أن يُرسل شيء، وقاعدة
 * البيانات تتحقق مرة أخرى بسياسة `public.is_admin()`. حارسان لا واحد،
 * لأن إخفاء زر في الواجهة ليس حماية.
 */

export const dynamic = 'force-dynamic';

export default async function AdminQuranPage() {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/quran');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') redirect('/');

  const stages = await getStages();
  const grades = (
    await Promise.all(
      stages.map(async (s) =>
        (await getGrades(s.id)).map((g) => ({
          slug: g.slug,
          name: g.name,
          stageSlug: s.slug,
          stageName: s.name,
        }))
      )
    )
  ).flat();

  const surahs = getSurahs().map((s) => ({
    number: s.number,
    name_ar: s.name_ar,
    ayah_count: s.ayah_count,
  }));

  return <QuranCurriculumEditor grades={grades} surahs={surahs} />;
}
