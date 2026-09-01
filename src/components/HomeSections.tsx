import Link from 'next/link';

/**
 * تقسيمة الرئيسية: كرتان رئيسيان — «ألعاب» و«المعلّم ورئيس القسم».
 * كل كرت ينقل لصفحته الخاصة (/games-hub و/teacher) بدل التوسّع أسفله،
 * لتكون الخيارات في صفحة مرتّبة ومستقلة أوضح للمستخدم.
 * التصميم والألوان مطابقة للملف المرجعي home-preview.html.
 */

export default function HomeSections() {
  return (
    <div className="home w-full max-w-3xl mx-auto text-right">
      {/* ── الكرتان الرئيسيان (روابط لصفحات مستقلة) ── */}
      <div className="mains">
        <Link className="main g" href="/games-hub">
          <div>
            <div className="ico">🎮</div>
            <h2>ألعاب</h2>
            <p>متعة تعليمية تفاعلية للطلاب</p>
            <div className="chips">
              <span className="chip">ابتدائي</span>
              <span className="chip">متوسط</span>
              <span className="chip">غراس التفاعلية</span>
              <span className="chip">ألعاب ومعلومات</span>
              <span className="chip">مغامرة المجموعات</span>
            </div>
          </div>
          <div className="arrow" aria-hidden="true">
            ←
          </div>
        </Link>

        <Link className="main p" href="/teacher">
          <div>
            <div className="ico">👨‍🏫👩‍🏫</div>
            <h2>المعلّم ورئيس القسم</h2>
            <p>أدوات مهنية وسجلّات ذكية</p>
            <div className="chips">
              <span className="chip">ستوديو الحصة</span>
              <span className="chip">الحضور</span>
              <span className="chip">الدرجات</span>
              <span className="chip">سجلات القسم</span>
            </div>
          </div>
          <div className="arrow" aria-hidden="true">
            ←
          </div>
        </Link>

        {/* ── الكرت الثالث: القرآن الكريم — رابط مباشر (مجاني) ── */}
        <Link className="main q" href="/quran">
          <div>
            <div className="ico">🌿</div>
            <h2>
              القرآن الكريم
              <span className="tag free">مجاني</span>
            </h2>
            <p>اقرأ واستمع واحفظ، على مهلك</p>
            <div className="chips">
              <span className="chip">منهجي الدراسي</span>
              <span className="chip">قراءة</span>
              <span className="chip">استماع وتكرار</span>
              <span className="chip">حفظ</span>
            </div>
          </div>
          <div className="arrow" aria-hidden="true">
            ←
          </div>
        </Link>

        {/* ── كرت مساحتي — مدخل اللوحة الشخصية للمعلّم (يُوجّه لـ/workspace) ── */}
        <Link className="main ms" href="/workspace">
          <div>
            <div className="ico" aria-hidden="true">
              🗂️
            </div>
            <h2>مساحتي</h2>
            <p>اختصاراتك وأدواتك وموادك في مكان واحد</p>
          </div>
          <div className="arrow" aria-hidden="true">
            ←
          </div>
        </Link>
      </div>

      <div className="legend">
        <span>
          <span className="tag paid">مستقل</span> منتج بسعره الخاص
        </span>
      </div>
    </div>
  );
}
