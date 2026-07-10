/**
 * شعار «غراس المعلم» الرسمي — شجرة تنمو من كتاب مفتوح.
 * الملف: /public/logo.png (بخلفية شفافة، جاهز لكل المقاسات)
 */
export default function Logo({ size = 88 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="شعار غراس المعلم"
      width={size}
      height={size}
      className="inline-block select-none"
      draggable={false}
    />
  );
}
