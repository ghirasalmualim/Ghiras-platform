#!/usr/bin/env node
/**
 * Stage 8 — طابور الالتقاط دون اتصال: سلوك محلي كامل (بلا شبكة).
 * يغطي DOC-T-002 (إعادة المحاولة لا تكرّر)، DOC-T-013 (استرداد إعادة
 * التشغيل idempotent)، DOC-T-014 (الفشل مرئي وقابل لإعادة المحاولة)،
 * وعدم عرض غير المتزامن كمخزَّن.
 */
import { OfflineCaptureQueue, InMemoryQueueStorage, mintCaptureId }
  from '../../src/lib/accounting/documents/offline-queue.ts';

let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };

// ناقل مزيف: يسجل الاستدعاءات ويحاكي خادمًا idempotent على capture_id
function fakeTransport({ failTimes = 0 } = {}) {
  const seen = new Map(); let calls = 0; let failures = failTimes;
  return {
    calls: () => calls,
    documents: () => new Set(seen.values()),
    async upload(record) {
      calls++;
      if (failures > 0) { failures--; throw new Error('network down'); }
      // الخادم: نفس capture_id = نفس المستند القانوني (unique idempotent)
      if (!seen.has(record.captureId)) seen.set(record.captureId, 'doc-' + seen.size);
      return { documentId: seen.get(record.captureId), outcome: 'SYNCED' };
    },
  };
}

const page = (n) => ({ pageNo: n, mime: 'image/jpeg', bytes: new Uint8Array([n, n + 1]) });
const captureInput = { companyId: 'co-1', docType: 'RECEIPT', source: 'CAMERA', originalFilename: 'r.jpg', mime: 'image/jpeg', pages: [page(1), page(2)] };

console.log('\n═══ ١ · هوية الالتقاط حتمية وثابتة ═══');
{
  const a = mintCaptureId(), b = mintCaptureId();
  check('mintCaptureId يولّد UUID فريدًا', /^[0-9a-f-]{36}$/.test(a) && a !== b);
  const q = new OfflineCaptureQueue(new InMemoryQueueStorage(), fakeTransport());
  const r = await q.capture(captureInput);
  check('الالتقاط يعمل دون اتصال (LOCAL_PENDING فورًا)', r.state === 'LOCAL_PENDING' && !!r.captureId);
  check('متعدد الصفحات محفوظ بترتيبه', r.pages.length === 2 && r.pages[0].pageNo === 1);
}

console.log('═══ ٢ · DOC-T-002: إعادة المحاولة N مرة = مستند واحد ═══');
{
  const t = fakeTransport();
  const q = new OfflineCaptureQueue(new InMemoryQueueStorage(), t);
  const r = await q.capture(captureInput);
  await q.enqueue(r.captureId);
  await q.flush(); await q.flush(); await q.flush();  // تكرار flush آمن
  check('مزامنة واحدة — flush التالية لا تعيد الرفع', t.calls() === 1);
  check('مستند قانوني واحد فقط', t.documents().size === 1);
  // إعادة enqueue بعد SYNCED لا تفعل شيئًا
  await q.enqueue(r.captureId); await q.flush();
  check('enqueue بعد SYNCED = لا رفع إضافي', t.calls() === 1);
}

console.log('═══ ٣ · DOC-T-013: إعادة تشغيل التطبيق أثناء الرفع ═══');
{
  const storage = new InMemoryQueueStorage();
  const t = fakeTransport({ failTimes: 1 });
  const q = new OfflineCaptureQueue(storage, t);
  const r = await q.capture(captureInput);
  await q.enqueue(r.captureId);
  await q.flush();                       // فشل أول → FAILED_RETRYABLE
  let rec = await storage.get(r.captureId);
  check('الفشل الظاهر = FAILED_RETRYABLE برسالة', rec.state === 'FAILED_RETRYABLE' && /network/.test(rec.lastError));
  // محاكاة انهيار أثناء رفع: علّم UPLOADING ثم «أعد التشغيل»
  rec.state = 'UPLOADING'; await storage.put(rec);
  const q2 = new OfflineCaptureQueue(storage, t);   // تطبيق جديد، نفس المخزن
  const recovered = await q2.recoverOnStartup();
  check('recoverOnStartup يعيد UPLOADING إلى UPLOAD_PENDING', recovered === 1);
  await q2.flush();
  rec = await storage.get(r.captureId);
  check('بعد الاسترداد: SYNCED بهوية قانونية', rec.state === 'SYNCED' && rec.documentId === 'doc-0');
  check('نفس capture_id عبر كل المحاولات = مستند واحد', t.documents().size === 1);
}

console.log('═══ ٤ · DOC-T-014: الفشل مرئي وقابل لإعادة المحاولة ═══');
{
  const t = fakeTransport({ failTimes: 2 });
  const q = new OfflineCaptureQueue(new InMemoryQueueStorage(), t);
  const r = await q.capture(captureInput);
  await q.enqueue(r.captureId);
  const first = await q.flush();
  check('فشل الرفع يُبلَّغ ولا يُخفى', first.failed === 1 && first.synced === 0);
  const pend = await q.pending();
  check('غير المتزامن يظهر ضمن المعلّق — لا يُعرض كمخزَّن', pend.length === 1 && pend[0].state === 'FAILED_RETRYABLE');
  await q.flush();  // فشل ثانٍ
  const third = await q.flush();  // نجاح
  check('إعادة المحاولة تنجح ثالثةً بنفس الهوية', third.synced === 1 && t.documents().size === 1);
  check('بعد المزامنة: لا معلّق', (await q.pending()).length === 0);
}

console.log('═══ ٥ · DOC-T-015 (محلي): المزامنة لا تنشئ مصروفًا ═══');
{
  // العقد بنيوي: الناقل يعيد {documentId} فقط — لا expense في أي حقل
  const storage = new InMemoryQueueStorage();
  const t = fakeTransport();
  const q = new OfflineCaptureQueue(storage, t);
  const r = await q.capture(captureInput);
  await q.enqueue(r.captureId); await q.flush();
  const stored = await storage.get(r.captureId);
  check('سجل المزامنة يحمل documentId فقط — لا أثر مصروف', stored.documentId === 'doc-0' && !('expenseId' in stored));
}

console.log(`\n  طابور الالتقاط: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
