import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * «مشاركة الملفات» — واجهة رئيسة الشعبة والمعلمة.
 *
 * الأمان: القاعدة هي الحكم (RLS + الدالة head_share_add). هذا المسار يتحقق فقط من
 * تسجيل الدخول؛ كل عملية تُنفَّذ بجلسة المستخدمة، فالقاعدة ترفض أي تجاوز:
 *   - الرفع: سياسة Storage + head_share_files تفرض أن الرافعة معلمةُ المشاركة.
 *   - الإضافة: head_share_add تفرض أن المُنادِية رئيسة شعبة ذات اشتراك سارٍ.
 *   - الإلغاء/الحذف: RLS تفرض ملكية رئيسة الشعبة/طرف المشاركة.
 *
 *   GET  ?as=teacher | ?as=head → { shares:[{ id, ..., files:[{id,title,url,...}] }] }
 *   POST { action:'upload',     shareId, title?, dataUrl, fileName? } → { file }
 *        { action:'deleteFile', fileId }                             → { ok }
 *        { action:'add',        login, label? }                      → { result }
 *        { action:'revoke',     shareId }                            → { ok }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'head-shares';
const SIGN_TTL = 60 * 60; // ساعة
const MAX_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

const uuid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

/** أرقام عربية/فارسية → إنجليزية (نسخة مضمّنة تفاديًا لاستيراد ملف 'use client'). */
const toEnglishDigits = (s: string): string =>
  (s || '').replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });

/**
 * تطبيع مُدخَل رئيسة الشعبة للبحث عن المعلمة: الإيميل كما هو؛ الرقم (الحسابات مبنية
 * على التلفون فـ username = الرقم) يُحوَّل لأرقام إنجليزية ويُنزع مفتاح 965.
 */
function normalizeLogin(raw: string): string {
  const t = (raw || '').trim();
  if (t.includes('@')) return t.toLowerCase();
  const en = toEnglishDigits(t);
  if (/^\+?\d[\d\s-]*$/.test(en)) {
    let d = en.replace(/\D/g, '');
    if (d.length > 8 && d.startsWith('965')) d = d.slice(3);
    return d;
  }
  return t;
}

type FileRow = {
  id: string;
  share_id: string;
  title: string | null;
  storage_path: string;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
};

async function auth() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** يجمع ملفات مجموعة مشاركات ويوقّع روابطها، ويعيدها مجمّعة حسب share_id. */
async function filesByShare(
  supabase: NonNullable<Awaited<ReturnType<typeof auth>>['supabase']>,
  shareIds: string[]
): Promise<Record<string, Array<Omit<FileRow, 'storage_path'> & { url: string | null }>>> {
  const out: Record<string, Array<Omit<FileRow, 'storage_path'> & { url: string | null }>> = {};
  if (!shareIds.length) return out;
  const { data: files } = await supabase
    .from('head_share_files')
    .select('id, share_id, title, storage_path, file_name, mime, size_bytes, created_at')
    .in('share_id', shareIds)
    .order('created_at', { ascending: true });
  const rows = (files || []) as FileRow[];
  const paths = rows.map((r) => r.storage_path).slice(0, 300);
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGN_TTL);
    (signed || []).forEach((d) => {
      if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
    });
  }
  for (const r of rows) {
    (out[r.share_id] ||= []).push({
      id: r.id,
      share_id: r.share_id,
      title: r.title,
      file_name: r.file_name,
      mime: r.mime,
      size_bytes: r.size_bytes,
      created_at: r.created_at,
      url: urls[r.storage_path] || null,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  const as = req.nextUrl.searchParams.get('as') === 'head' ? 'head' : 'teacher';
  const col = as === 'head' ? 'head_id' : 'teacher_id';
  const { data: shares, error } = await supabase
    .from('head_shares')
    .select('id, head_id, teacher_id, teacher_label, head_label, requested, created_at')
    .eq(col, user.id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = shares || [];
  const byShare = await filesByShare(supabase, list.map((s) => s.id as string));
  return NextResponse.json({
    shares: list.map((s) => ({
      id: s.id,
      teacherLabel: s.teacher_label,
      headLabel: s.head_label,
      requested: Array.isArray(s.requested) ? s.requested : [],
      createdAt: s.created_at,
      files: byShare[s.id as string] || [],
    })),
  });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  let body: {
    action?: string;
    shareId?: string;
    title?: string;
    dataUrl?: string;
    fileName?: string;
    fileId?: string;
    login?: string;
    label?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const action = body?.action;

  // ── المعلمة: رفع ملف ──────────────────────────────────────────────
  if (action === 'upload') {
    const shareId = body.shareId || '';
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(body.dataUrl || '');
    if (!shareId || !m) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const mime = m[1].toLowerCase();
    const ext = EXT[mime];
    if (!ext) return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });

    const path = `${shareId}/${uuid()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: row, error: insErr } = await supabase
      .from('head_share_files')
      .insert({
        share_id: shareId,
        title: (body.title || '').trim() || null,
        storage_path: path,
        file_name: (body.fileName || '').slice(0, 200) || null,
        mime,
        size_bytes: buf.length,
        uploaded_by: user.id,
      })
      .select('id, share_id, title, file_name, mime, size_bytes, created_at')
      .single();
    if (insErr) {
      // فشل تسجيل الصف (غالبًا RLS: ليست معلمة هذه المشاركة) — نظّف الكائن المرفوع
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    return NextResponse.json({ file: { ...row, url: signed?.signedUrl || null } });
  }

  // ── حذف ملف (المعلمة أو رئيسة الشعبة) ─────────────────────────────
  if (action === 'deleteFile') {
    const fileId = body.fileId || '';
    if (!fileId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    // نقرأ المسار (RLS يسمح لطرفَي المشاركة)، ثم نحذف الكائن ثم الصف.
    const { data: f } = await supabase.from('head_share_files').select('storage_path').eq('id', fileId).maybeSingle();
    if (f?.storage_path) await supabase.storage.from(BUCKET).remove([f.storage_path as string]);
    const { error: delErr } = await supabase.from('head_share_files').delete().eq('id', fileId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── رئيسة الشعبة: إضافة مشاركة (الدالة تفرض الاشتراك واللقب) ────────
  if (action === 'add') {
    const login = normalizeLogin(body.login || '');
    if (!login) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const { data, error } = await supabase.rpc('head_share_add', { p_login: login, p_label: (body.label || '').trim() });
    if (error) {
      const msg = /forbidden/i.test(error.message) ? 'forbidden' : error.message;
      return NextResponse.json({ error: msg }, { status: msg === 'forbidden' ? 403 : 500 });
    }
    return NextResponse.json({ result: data }); // 'added' | 'not_found' | 'self'
  }

  // ── رئيسة الشعبة: إلغاء مشاركة (حذف كائنات Storage ثم صف المشاركة) ──
  if (action === 'revoke') {
    const shareId = body.shareId || '';
    if (!shareId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    // نجمع مسارات ملفات هذه المشاركة (RLS يقصرها على مشاركات رئيسة الشعبة) ونحذفها من Storage.
    const { data: files } = await supabase.from('head_share_files').select('storage_path').eq('share_id', shareId);
    const paths = (files || []).map((r) => r.storage_path as string).filter(Boolean);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    // حذف صف المشاركة يُسقط صفوف الملفات (cascade). RLS يفرض ملكية رئيسة الشعبة.
    const { error: delErr } = await supabase.from('head_shares').delete().eq('id', shareId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
