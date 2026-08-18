'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * تسجيل النشاط الفعلي — «آخر مرة استخدمت فيها المعلمة المنصة».
 *
 * الحقل last_active كان يُحدَّث عند تسجيل الدخول فقط، فمن يبقى مسجَّلاً
 * ويستخدم المنصة يوميًا يظهر كأنه غير نشط منذ أسابيع.
 *
 * الخنق بساعة على مستويين حتى لا نُثقل القاعدة:
 *   ١) هنا: لا نُرسل الطلب أصلًا إن مرّ أقل من ساعة على آخر إرسال في هذا
 *      المتصفح — يوفّر حتى المكالمة الشبكية.
 *   ٢) في القاعدة: touch_activity لا تكتب إلا إذا كان last_active أقدم من
 *      ساعة — الضمان الحقيقي، فلا يمكن إغراق الجدول مهما تكرّر النداء.
 *
 * جدول profiles يُقرأ في كل فحص صلاحية، فتضخّمه بكتابات متكرّرة كان
 * سيُبطئ المنصة كلها — ولهذا الخنق ضروري لا تحسين.
 */

const KEY = 'ghiras_activity_ping';
const HOUR = 60 * 60 * 1000;

export default function ActivityPing() {
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const last = Number(localStorage.getItem(KEY) || 0);
        if (Date.now() - last < HOUR) return;

        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !alive) return;

        await supabase.rpc('touch_activity');
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        // زائرة غير مسجّلة، أو تخزين محلي محجوب، أو انقطاع شبكة —
        // تسجيل النشاط إحصائي بحت ولا يجوز أن يعطّل أي شيء للمعلمة.
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return null;
}
