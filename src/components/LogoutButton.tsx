'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** زر تسجيل الخروج */
export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="text-sm font-bold text-ink/55 hover:text-red-700 border border-ink/15 hover:border-red-300 rounded-xl px-4 py-2 transition-colors"
    >
      تسجيل الخروج
    </button>
  );
}
