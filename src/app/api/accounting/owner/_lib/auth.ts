/**
 * غراس للمحاسبة — Stage 11: بوابة مسارات المالكة — fail-closed.
 *
 * الهوية من جلسة الكوكيز حصرًا؛ العضوية والدور يثبتهما الخادم بمفتاح
 * الخدمة قبل أي قراءة؛ بلا شركة/دور محاسبي: 401/403 — لا واجهة
 * «فارغة» تمرّر بيانات. الجداول المهنية لا تصل المتصفح: الإسقاط
 * عبر DTO المالكة فقط.
 */
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ServiceDb } from '@/lib/accounting/exceptions/adapters';
import { roleOf } from '@/lib/accounting/owner/queries';

export function svc(): ServiceDb {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // خادم فقط
    { auth: { persistSession: false } }
  ) as unknown as ServiceDb;
}

export const OWNER_VIEW_ROLES = ['BUSINESS_OWNER', 'ACCOUNTANT', 'FINANCE_MANAGER', 'AUDITOR'];

export interface OwnerGate {
  userId: string;
  role: string;
  baseCurrency: string;
  db: ServiceDb;
  userClient: ReturnType<typeof createServerSupabase>;
}

export type GateResult =
  | { ok: true; gate: OwnerGate }
  | { ok: false; status: number; error: string };

export async function ownerGate(companyId: string | null): Promise<GateResult> {
  const userClient = createServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return { ok: false, status: 401, error: 'authentication required' };
  if (!companyId) return { ok: false, status: 400, error: 'company_id is required' };
  const db = svc();
  const role = await roleOf(db, companyId, auth.user.id);
  if (!OWNER_VIEW_ROLES.includes(role)) {
    return { ok: false, status: 403, error: 'no accounting role in this company' };
  }
  const company = await db.from('acc_companies')
    .select('base_currency').eq('id', companyId);
  const baseCurrency: string = company.data?.[0]?.base_currency;
  if (!baseCurrency) return { ok: false, status: 404, error: 'unknown company' };
  return { ok: true, gate: { userId: auth.user.id, role, baseCurrency, db, userClient } };
}
