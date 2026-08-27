#!/usr/bin/env node
/**
 * Stage 8 — عقود المستندات الساكنة + خريطة DOC-T-001..015 (الشق المحلي).
 * السلوك التشغيلي في test-documents-db.mjs (Staging) وtest-documents-
 * offline.mjs (محلي). يشمل حارس غياب AI البنيوي لمسار المحاسبة.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';

let passed = 0, failed = 0;
const check = (n, c) => { if (c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

const MIG = readFileSync('supabase/2026-08-29-accounting-expenses-documents.sql', 'utf8');
const CODE = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const UPLOAD = readFileSync('src/app/api/accounting/documents/upload/route.ts', 'utf8');
const URLR = readFileSync('src/app/api/accounting/documents/url/route.ts', 'utf8');
const QUEUE = readFileSync('src/lib/accounting/documents/offline-queue.ts', 'utf8');
const VALID = readFileSync('src/lib/accounting/documents/validation.ts', 'utf8');
const HASH = readFileSync('src/lib/accounting/documents/hash.ts', 'utf8');

console.log('\n═══ التخزين: خاص، بلا سياسة عميل، الخادم حصرًا ═══');
check("الدلو acc-documents خاص (public=false)",
  /insert into storage\.buckets[\s\S]*?'acc-documents'[\s\S]*?false/.test(CODE));
check('صفر سياسات storage.objects للعملاء (الغياب = رفض افتراضي)',
  !/create policy[^;]*storage\.objects/i.test(CODE));
check('الرفع عبر service key حصرًا والفاعل من جلسة الكوكيز',
  UPLOAD.includes('SUPABASE_SERVICE_ROLE_KEY') && UPLOAD.includes('auth.getUser()')
  && !UPLOAD.includes('request.headers.get(\'x-company\')'));
check('التنزيل: صف المستند عبر عميل المستخدم (RLS) قبل التوقيع',
  URLR.includes('createServerSupabase') && URLR.indexOf('acc_documents') < URLR.indexOf('createSignedUrl'));
check('روابط موقَّعة قصيرة العمر — لا URL عام',
  /SIGNED_URL_TTL_SECONDS\s*=\s*\d+/.test(URLR) && !/getPublicUrl/.test(URLR + UPLOAD));
check('قائمة MIME بيضاء + تعقيم اسم الملف + حدّ حجم قابل للضبط',
  VALID.includes('ALLOWED_MIME') && VALID.includes('sanitizeFilename')
  && UPLOAD.includes('max_file_bytes') && VALID.includes('DEFAULT_MAX_FILE_BYTES'));

console.log('═══ سلطة البصمة للخادم (CORRECTION 3) ═══');
check('المسار يحسب SHA-256 من البايتات المستلمة — لا بصمة عميل تُمرَّر',
  UPLOAD.includes('sha256Hex(bytes)') && !/form\.get\(['"]sha256/.test(UPLOAD));
check('بصمة الـmanifest تُحسب في القاعدة من بصمات الصفحات المرتبة',
  CODE.includes("string_agg(page_no::text || ':' || content_sha256, '|' order by page_no)")
  && CODE.includes('sha256(convert_to'));
check('تأكيد الصفحة service_role حصرًا (سلطة خادم)',
  /revoke execute on function public\.acc_confirm_document_page[^;]+from public, anon, authenticated/.test(CODE)
  && /grant  execute on function public\.acc_confirm_document_page[^;]+to service_role/.test(CODE));

console.log('═══ الاتساق تخزين/قاعدة (CORRECTION 2) ═══');
check('حجز قبل رفع: register_page يعيد مفتاح كائن حتميًا',
  CODE.includes("v_doc.company_id::text || '/' || p_document::text || '/' || p_page_no::text"));
check('إعادة المحاولة تستأنف الكائن المطابق ولا تكتب فوق المختلف',
  UPLOAD.includes('existingHash !== serverHash') && UPLOAD.includes('upsert: false'));
check('بايتات مختلفة لصفحة مؤكدة = CONFLICT بلا استبدال (نتيجة بنيوية)',
  CODE.includes("'PAGE_BYTES_CONFLICT'") && /upload_state = 'VERIFIED'[\s\S]*?CONFLICT/.test(CODE));
check('الفشل قابل للاسترداد بنفس المفاتيح (retryable في الاستجابة)',
  (UPLOAD.match(/retryable: true/g) || []).length >= 2);
check('لا تنظيف مجدول مدمِّر — الحذف عملية مدقَّقة فقط',
  !/pg_cron|schedule|purge/i.test(CODE));

console.log('═══ مناعة الدليل والحذف (DoD 3) ═══');
check('حقائق FINALIZED مجمّدة (بصمة/صفحات/بايتات/هوية)',
  CODE.includes('finalized document evidence is immutable'));
check('مستند مرتبط لا يُحذف — والفكّ محكوم فيغلق الالتفاف',
  CODE.includes('a linked document cannot be deleted'));
check('رابط قيد POSTED لا يُفكّ أبدًا',
  CODE.includes('evidence linked to a posted journal can never be unlinked'));
check('روابط المصروف تتجمّد من SUBMITTED (CORRECTION 1)',
  CODE.includes("source links freeze at SUBMITTED"));
check('مصروف POSTED: لا فكّ إطلاقًا حتى عبر الاستبدال',
  CODE.includes('evidence linked to a posted expense can never be unlinked'));
check('حجب الحذف المرحَّل مدقَّق دائم (نتيجة بنيوية لا استثناء — درس Stage 7)',
  CODE.includes("'DOCUMENT_DELETE_BLOCKED_POSTED'") && CODE.includes("'BLOCKED_POSTED'"));
check('الاستبدال قبل الترحيل: الجديد أولًا وإثبات بقاء مصدر، والقديم يبقى',
  CODE.includes('acc_replace_expense_source') && CODE.includes('replacement must leave the expense with a valid source')
  && CODE.includes("'DOCUMENT_SUPERSEDED'"));
check('بعد POSTED لا استبدال يعيد كتابة التاريخ',
  CODE.includes('corrections reference new evidence beside the old'));

console.log('═══ التكرار وidempotency ═══');
check('unique (company_id, capture_id) — نفس الالتقاط = مستند واحد',
  CODE.includes('unique (company_id, capture_id)'));
check('CREATED / IDEMPOTENT_DUPLICATE / CONFLICT عقد بنيوي للإنشاء',
  /acc_create_document[\s\S]*?'CREATED'[\s\S]*?'IDEMPOTENT_DUPLICATE'[\s\S]*?'CONFLICT'/.test(CODE));
check('اشتباه تكرار المحتوى (نفس البصمة) علمٌ للمراجعة لا رفض/إسقاط',
  CODE.includes("'DOCUMENT_DUPLICATE_SUSPECTED'") && CODE.includes('duplicate_of_document_id'));
check('اسم الملف ليس دليل تكرار (لا مقارنة عليه)',
  !/original_filename\s*=\s*.*original_filename/.test(CODE));

console.log('═══ متعدد الصفحات ═══');
check('صفحات مرقّمة فريدة + إقفال ذرّي بلا فجوات',
  CODE.includes('unique (document_id, page_no)') && CODE.includes('gapless'));
check('غير المكتمل لا يُقفَل ولا يُربَط (FINALIZED شرط الربط)',
  CODE.includes('only FINALIZED documents may be linked'));

console.log('═══ العزل والأدوار ═══');
check('كل جدول company_id NOT NULL + RLS مفعّلة',
  (CODE.match(/company_id\s+uuid not null references public\.acc_companies\(id\)/g) || []).length >= 6
  && (CODE.match(/enable row level security/g) || []).length >= 7);
check('رابط عابر للشركات مرفوض بنيويًا (trigger يحسم الهدف الفعلي)',
  CODE.includes('cross-company document link is forbidden')
  && CODE.includes('link target does not exist'));
check('READ_ONLY خارج سياسات المستندات (منح صريح لاحق فقط)',
  !/acc_documents_select[\s\S]{0,400}READ_ONLY/.test(CODE));
check('EMPLOYEE ترى ما رفعت فقط (uploaded_by = auth.uid())',
  /acc_documents_select[\s\S]*?uploaded_by = auth\.uid\(\)/.test(CODE));
check('null-safe في كل سياسة (coalesce(acc_role,...))',
  !/using \(public\.acc_role\(/.test(CODE));

console.log('═══ حارس غياب AI البنيوي (Stage 13 لاحقًا) ═══');
{
  // مسار المحاسبة كاملًا: صفر استدعاء نموذج/مزوّد AI — دون المساس
  // بوحدات غراس الأخرى غير المحاسبية (ocr/game-ai قائمة خارج النطاق)
  const walk = (dir) => {
    let out = [];
    for (const e of readdirSync(dir)) {
      const p = dir + '/' + e;
      if (statSync(p).isDirectory()) out = out.concat(walk(p));
      else if (/\.(ts|tsx|mjs|sql)$/.test(e)) out.push(p);
    }
    return out;
  };
  const scope = [
    ...walk('src/lib/accounting'),
    ...walk('src/app/api/accounting'),
    ...walk('src/app/api/myfatoorah'),
    ...readdirSync('supabase').filter((f) => /accounting/.test(f)).map((f) => 'supabase/' + f),
  ];
  const AI = /(openai|anthropic|gemini|claude-3|claude-sonnet|claude-opus|gpt-4|gpt-5|\.chat\.completions|generativeai|tesseract|vision\.googleapis)/i;
  const offenders = scope.filter((f) => AI.test(readFileSync(f, 'utf8')));
  check('صفر تنفيذ AI في مسار المحاسبة كله', offenders.length === 0);
  if (offenders.length) console.error('  offenders:', offenders.join(', '));
  // إثبات نفي: الحارس يلتقط استيرادًا اصطناعيًا
  check('الحارس يكشف استدعاء AI اصطناعيًا (نفي)', AI.test("import OpenAI from 'openai'"));
  check("مصادر الاستخلاص MANUAL/FIXTURE حصرًا (قيد CHECK)",
    CODE.includes("extraction_source in ('MANUAL','FIXTURE')")
    && CODE.includes('AI belongs to Stage 13'));
}

console.log('═══ خريطة DOC-T-001..015 (الشق الساكن/المحلي؛ السلوكي في DB) ═══');
const DOCT = {
  '001': ['عزل مستأجر المستند', () => CODE.includes('acc_documents_select') && CODE.includes("coalesce(public.acc_role(company_id), '')")],
  '002': ['إعادة التقاط لا تكرّر (unique capture_id + طابور idempotent)', () => CODE.includes('unique (company_id, capture_id)') && QUEUE.includes('mintCaptureId')],
  '003': ['ترتيب الصفحات ثابت + إقفال ذرّي', () => CODE.includes('unique (document_id, page_no)') && CODE.includes('order by page_no')],
  '004': ['مستند ↔ مصروف باتجاهين (فهرسان + FK)', () => CODE.includes('acc_doc_links_target_idx') && CODE.includes("target_kind in ('EXPENSE','JOURNAL_ENTRY','INVOICE','PAYMENT')")],
  '005': ['مستند ↔ قيد مرحَّل: سلامة + تجميد', () => CODE.includes('posted journal can never be unlinked')],
  '006': ['حذف غير المرحَّل بسياسة أدوار مدقَّقة', () => /acc_delete_document[\s\S]*?BUSINESS_OWNER[\s\S]*?ACCOUNTANT/.test(CODE) && CODE.includes("'DOCUMENT_DELETED'")],
  '007': ['حذف مرتبط بمرحَّل محجوب', () => CODE.includes("'BLOCKED_POSTED'")],
  '008': ['فكّ-ثم-احذف بعد الترحيل مسدود', () => CODE.includes('can never be unlinked') && CODE.includes('a linked document cannot be deleted')],
  '009': ['رابط عابر للشركات محجوب', () => CODE.includes('cross-company document link is forbidden')],
  '010': ['قراءة ملف عابرة للشركات محجوبة (RLS قبل توقيع)', () => URLR.indexOf('acc_documents') < URLR.indexOf('createSignedUrl')],
  '011': ['تعديل الوصف مدقَّق', () => CODE.includes("'DOCUMENT_METADATA_UPDATED'")],
  '012': ['لا كتابة صامتة فوق الدليل بعد الاعتماد', () => CODE.includes('finalized document evidence is immutable') && UPLOAD.includes('upsert: false')],
  '013': ['استرداد إعادة التشغيل idempotent', () => QUEUE.includes('recoverOnStartup')],
  '014': ['فشل الرفع مرئي وقابل لإعادة المحاولة', () => QUEUE.includes("'FAILED_RETRYABLE'")],
  '015': ['المستند لا ينشئ/يرحّل مصروفًا آليًا', () => !/acc_create_expense/.test(UPLOAD) && !/acc_post_journal/.test(UPLOAD + CODE)],
};
for (const [id, [name, fn]] of Object.entries(DOCT)) check(`DOC-T-${id}: ${name}`, fn());

console.log('═══ الحدود ═══');
check('صفر acc_post_journal في Stage 8 كله (BLK-004)',
  !/acc_post_journal/.test(CODE) && !/acc_post_journal/.test(UPLOAD + URLR + QUEUE + VALID + HASH));
check('لا احتفاظ مدمِّر: retention_years ضبط فقط',
  CODE.includes('retention_years') && !/delete[\s\S]{0,80}retention/i.test(CODE));
check('لا BANK_TRANSACTION/RECONCILIATION في أنواع الروابط (مرحلتا 9/10)',
  !CODE.includes('BANK_TRANSACTION') && !CODE.includes('RECONCILIATION'));

console.log(`\n  عقود المستندات: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
