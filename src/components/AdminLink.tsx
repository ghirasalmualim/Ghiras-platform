'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * زر «لوحة التحكم» — يظهر للأدمِن وحده.
 *
 * الرئيسية مخزَّنة مؤقتًا (revalidate = 300) فنسخة واحدة تُقدَّم للجميع،
 * ولا يمكن إخفاء عنصر حسب المستخدم داخلها. لذلك يفحص هذا المكوّن الهوية
 * في المتصفح بعد التحميل: لا يظهر شيء لغير الأدمِن، ولا يتأثر أداء الصفحة
 * ولا تخزينها المؤقت.
 *
 * الأمان الحقيقي في المسار نفسه: src/app/admin/page.tsx يتحقق من الدور
 * على الخادم ويحوّل غير الأدمِن. هذا الزر اختصار للوصول لا حارس.
 */
export default function AdminLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !alive) return;

        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (alive && data?.role === 'admin') setIsAdmin(true);
      } catch {
        // زائرة غير مسجّلة أو تعذّر الاتصال — لا نعرض شيئًا
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="rounded-xl border border-gold/50 bg-gold-light hover:bg-gold hover:text-white text-gold-dark font-extrabold text-sm px-5 py-2.5 transition-all"
    >
      ⚙️ لوحة التحكم
    </Link>
  );
}
