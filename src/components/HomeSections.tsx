import Link from 'next/link';

/**
 * تقسيمة الرئيسية: كرتان رئيسيان — «ألعاب» و«المعلّم ورئيس الشعبة» — ثم «مكتبة حصص غراس».
 * كل كرت ينقل لصفحته الخاصة (/games-hub و/teacher) بدل التوسّع أسفله،
 * لتكون الخيارات في صفحة مرتّبة ومستقلة أوضح للمستخدم.
 * التصميم والألوان مطابقة للملف المرجعي home-preview.html.
 */

const LIBRARY = 'https://studio.ghiras-edu.com/templates';

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

        {/* ── مكتبة حصص غراس (2026-10-17): قسمٌ قائمٌ بذاته — دروسٌ جاهزةٌ من المنهج.
            الكرتُ كلُّه رابطٌ للمكتبة، وأزرارُ المراحلِ فوقه تفتحها على مرحلتها مباشرة
            (لا يصحّ رابطٌ داخل رابط، فالرابطُ العامُّ طبقةٌ ممدودةٌ والأزرارُ فوقها). ── */}
        <div className="main lib">
          <a className="stretch" href={LIBRARY} aria-label="مكتبة حصص غراس" />
          <div>
            <div className="ico">📚</div>
            <h2>
              مكتبة حصص غراس
              <span className="tag gold">من ٢ د.ك</span>
            </h2>
            <p>دروس جاهزة من المنهج بالصور والحركة والألعاب — اعرضيها في صفّك مباشرة</p>
            <div className="chips">
              <a className="chip" href={`${LIBRARY}?stage=primary`}>ابتدائي</a>
              <a className="chip" href={`${LIBRARY}?stage=middle`}>متوسط</a>
              <a className="chip" href={`${LIBRARY}?stage=high`}>ثانوي</a>
              <a className="chip" href={`${LIBRARY}?stage=deeni`}>التعليم الديني</a>
            </div>
          </div>
          <div className="arrow" aria-hidden="true">
            ←
          </div>
        </div>

        <Link className="main p" href="/teacher">
          <div>
            <div className="ico">👨‍🏫👩‍🏫</div>
            <h2>المعلّم ورئيس الشعبة</h2>
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
