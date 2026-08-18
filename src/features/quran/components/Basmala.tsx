import { toArabic } from './ResumeCard';

/**
 * البسملة في سطرها المستقل عند بداية السورة.
 *
 * مكوّن عرض خالص: يستقبل النص كما ورد في المصحف ولا يُنشئ نصًا قرآنيًا
 * ولا يعيد تشكيله. من يستدعيه يمرّر ما فصلته `engine/basmala.ts`.
 *
 * `ayahNumber` لا يُمرَّر إلا في **الفاتحة**، حيث البسملة آية بعدّ حفص
 * ورقمها ١ حقّها، وهكذا تُرسم في المصحف المطبوع. وفي سائر السور تُترك
 * بلا رقم: هي افتتاحية لا آية معدودة، وإلحاق رقم بها يوهم الطالبة بغير
 * الصحيح ويسرق رقم الآية الأولى من صاحبها.
 */
export default function Basmala({
  text,
  ayahNumber = null,
}: {
  text: string;
  ayahNumber?: number | null;
}) {
  return (
    <div className="basmala" dir="rtl" lang="ar">
      {text}
      {ayahNumber !== null ? (
        <span className="ayah-no" aria-label={`آية ${ayahNumber}`}>
          {toArabic(ayahNumber)}
        </span>
      ) : null}
    </div>
  );
}
