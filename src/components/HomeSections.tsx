'use client';

import { useState } from 'react';
import Link from 'next/link';
import AddToMySpace from './AddToMySpace';

/**
 * تقسيمة الرئيسية: كرتان رئيسيان — «ألعاب» و«المعلّم ورئيس القسم».
 * الضغط على أي كرت يفتح لوحته أسفله (والثانية تُغلق).
 * التصميم والألوان مطابقة للملف المرجعي home-preview.html.
 */

type StageLink = { slug: string; name: string };

/**
 * «سجلات رئيس القسم» — تطبيق HTML مكتفٍ بذاته يعيش في private/ خارج public،
 * ولا يُفتح إلا عبر الحارس الذي يتحقق من الدخول والاشتراك ثم يقدّم الملف.
 * رابط عادي (لا next/link) لأن الوجهة مسار API لا صفحة.
 * اجعليها null لإرجاع الخانة إلى وضع «قريبًا».
 */
const HEAD_RECORDS_HREF: string | null = '/api/head-records';

export default function HomeSections({ stages }: { stages: StageLink[] }) {
  const [open, setOpen] = useState<'games' | 'pro' | null>(null);

  const toggle = (which: 'games' | 'pro') =>
    setOpen((cur) => (cur === which ? null : which));

  const primary = stages.find((s) => s.slug === 'primary');
  const middle = stages.find((s) => s.slug === 'middle');

  return (
    <div className="home w-full max-w-3xl mx-auto text-right">
      {/* ── الكرتان ── */}
      <div className="mains">
        <button
          type="button"
          className="main g"
          aria-expanded={open === 'games'}
          aria-controls="panel-games"
          onClick={() => toggle('games')}
        >
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
        </button>

        <button
          type="button"
          className="main p"
          aria-expanded={open === 'pro'}
          aria-controls="panel-pro"
          onClick={() => toggle('pro')}
        >
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
        </button>

        {/* ── الكرت الثالث: القرآن الكريم ──
            رابط مباشر لا زر لوحة: القسم له بوابته الخاصة، وفتح لوحة
            هنا يضيف خطوة بلا فائدة. ومجاني بالكامل. */}
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
      </div>

      {/* ── لوحة الألعاب ── */}
      {open === 'games' && (
        <div className="panel gp animate-float-in" id="panel-games">
          <div className="phead">
            <div className="pdot g" aria-hidden="true">
              🎮
            </div>
            <h3>ألعاب غراس</h3>
          </div>

          <div className="grouplbl">حسب المرحلة</div>
          <div className="row two">
            <Link className="tile" href={`/stage/${primary?.slug ?? 'primary'}`}>
              <span className="em" aria-hidden="true">
                🎒
              </span>
              <span>
                <b>{primary?.name ?? 'المرحلة الابتدائية'}</b>
                <small>مكتبة ألعاب الصفوف الأولى</small>
              </span>
            </Link>
            <Link className="tile" href={`/stage/${middle?.slug ?? 'middle'}`}>
              <span className="em" aria-hidden="true">
                📚
              </span>
              <span>
                <b>{middle?.name ?? 'المرحلة المتوسطة'}</b>
                <small>مكتبة ألعاب المرحلة المتوسطة</small>
              </span>
            </Link>
          </div>

          <div className="grouplbl">ألعاب وتحديات</div>
          <div className="row two">
            <Link className="tile" href="/games">
              <span className="em" aria-hidden="true">
                🕹️
              </span>
              <span>
                <b>ألعاب غراس التفاعلية</b>
                <small>من سيربح المليون · سين جيم · جدول الضرب…</small>
              </span>
            </Link>
            <Link className="tile" href="/games-info">
              <span className="em" aria-hidden="true">
                🧩
              </span>
              <span>
                <b>ألعاب ومعلومات</b>
                <small>ألعاب جاهزة ومعلومات مفيدة — مجانية</small>
              </span>
            </Link>
          </div>

          <div className="row one" style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link className="tile" href="/adventure">
                <span className="em" aria-hidden="true">
                  🚀
                </span>
                <span>
                  <b>مغامرة المجموعات التفاعلية</b>
                  <small>تحدٍّ صفّي تحفيزي للفرق</small>
                </span>
              </Link>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <AddToMySpace itemType="tool" itemKey="adventure" label="مغامرة المجموعات التفاعلية" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── لوحة المعلّم ورئيس القسم ── */}
      {open === 'pro' && (
        <div className="panel pp animate-float-in" id="panel-pro">
          <div className="phead">
            <div className="pdot p" aria-hidden="true">
              👨‍🏫👩‍🏫
            </div>
            <h3>أدوات المعلّم والقسم</h3>
          </div>

          <div className="row one">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <a
                className="tile"
                href="https://studio.ghiras-edu.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="em" aria-hidden="true">
                  🎬
                </span>
                <span>
                  <b>
                    ستوديو الحصة الذكية
                    <span className="tag paid">مستقل · مباشر</span>
                  </b>
                  <small>تجهيز الحصص وتوليد الدرس والصور بالذكاء</small>
                </span>
              </a>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <AddToMySpace itemType="tool" itemKey="studio" label="ستوديو الحصة الذكية" />
              </div>
            </div>
          </div>

          <div className="row one">
            <Link className="tile" href="/gharas-bank">
              <span className="em" aria-hidden="true">
                🌱
              </span>
              <span>
                <b>
                  بنك غراس
                  <span className="tag paid">مستقل · ٨ د.ك / ٦ أشهر</span>
                </b>
                <small>أوراق عمل ووسائل تعليمية جاهزة وقابلة للتخصيص</small>
              </span>
            </Link>
          </div>

          <div className="grouplbl">المتابعة الصفية</div>
          <div className="row two">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link className="tile" href="/attendance">
                <span className="em" aria-hidden="true">
                  🗓️
                </span>
                <span>
                  <b>سجل الحضور الذكي</b>
                  <small>متابعة حضور الطالبات</small>
                </span>
              </Link>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <AddToMySpace itemType="tool" itemKey="attendance" label="سجل الحضور الذكي" />
              </div>
            </div>
            {/* سجل الدرجات أداة خارجية تُفتح عبر مُصدِّر التصاريح — نفس آلية النسخة السابقة */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <a
                className="tile"
                href="/api/tool-access?tool=gradebook"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="em" aria-hidden="true">
                  📊
                </span>
                <span>
                  <b>سجل الدرجات الذكي</b>
                  <small>رصد وتحليل الدرجات سحابيًا</small>
                </span>
              </a>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <AddToMySpace itemType="tool" itemKey="gradebook" label="سجل الدرجات الذكي" />
              </div>
            </div>
          </div>

          <div className="grouplbl">سجلّات القسم</div>
          <div className="row one">
            {HEAD_RECORDS_HREF ? (
              <a className="tile" href={HEAD_RECORDS_HREF}>
                <span className="em" aria-hidden="true">
                  🗂️
                </span>
                <span>
                  <b>سجلات رئيس القسم</b>
                  <small>زيارات · كادر · تقييم · تصدير</small>
                </span>
              </a>
            ) : (
              <div className="tile soon" aria-disabled="true">
                <span className="em" aria-hidden="true">
                  🗂️
                </span>
                <span>
                  <b>
                    سجلات رئيس القسم
                    <span className="tag wip">قريبًا</span>
                  </b>
                  <small>زيارات · كادر · تقييم · تصدير</small>
                </span>
              </div>
            )}
          </div>

        </div>
      )}

      {/* وسم «قريبًا» أُزيل من التوضيح — لم تعد أي خانة تحمله بعد ربط سجلات رئيس القسم */}
      <div className="legend">
        <span>
          <span className="tag paid">مستقل</span> منتج بسعره الخاص
        </span>
      </div>
    </div>
  );
}
