/**
 * غراس للمحاسبة — Stage 8: طابور الالتقاط دون اتصال.
 *
 * العقد الملزم: تصوير إيصال (متعدد الصفحات) بلا اتصال → يُحفظ محليًا
 * بهوية التقاط حتمية (capture_id يولَّد مرة عند الالتقاط ويبقى عبر
 * إعادة المحاولة وإعادة تشغيل التطبيق) → عند عودة الاتصال يُرفع؛
 * إعادة المحاولة N مرة = مستند واحد قانوني (الخادم idempotent على
 * (company, capture_id)). التقاط غير SYNCED لا يُعرض أبدًا كمخزَّن
 * نهائيًا، والرفع لا يُنشئ مصروفًا آليًا.
 *
 * المخزن قابل للحقن: IndexedDB في المتصفح، وذاكرة في الاختبارات —
 * لا service worker (لا بنية قائمة له في التطبيق ولا يتطلبه العقد).
 */

export type CaptureState =
  | 'LOCAL_PENDING'      // مُلتقط محليًا، لم يُجدول للرفع بعد
  | 'UPLOAD_PENDING'     // بانتظار اتصال/دور
  | 'UPLOADING'          // جارٍ — تعود UPLOAD_PENDING عند إقلاع جديد
  | 'UPLOADED'           // الخادم استلم الصفحات، بانتظار الإقفال
  | 'SYNCED'             // الخادم أقفل وأعاد الهوية القانونية
  | 'FAILED_RETRYABLE';  // فشل ظاهر قابل لإعادة المحاولة

export interface CapturePage {
  pageNo: number;
  mime: string;
  /** بايتات الصفحة (Blob في المتصفح؛ Uint8Array في الاختبارات) */
  bytes: Uint8Array;
}

export interface CaptureRecord {
  captureId: string;
  companyId: string;
  docType: string;
  source: 'CAMERA' | 'FILE_UPLOAD';
  originalFilename: string | null;
  mime: string;
  pages: CapturePage[];
  state: CaptureState;
  /** الهوية القانونية من الخادم — تصير معلومة عند SYNCED فقط */
  documentId: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: number;
}

/** مخزن قابل للحقن — IndexedDB فعليًا، ذاكرة في الاختبارات */
export interface QueueStorage {
  get(captureId: string): Promise<CaptureRecord | undefined>;
  put(record: CaptureRecord): Promise<void>;
  all(): Promise<CaptureRecord[]>;
  delete(captureId: string): Promise<void>;
}

/** ناقل الرفع — يستدعي مسار الخادم؛ قابل للحقن في الاختبارات */
export interface UploadTransport {
  upload(record: CaptureRecord): Promise<{ documentId: string; outcome: string }>;
}

export function mintCaptureId(): string {
  // UUID يولَّد مرة واحدة عند الالتقاط ويُخزَّن مع السجل — لا يتجدد أبدًا
  return globalThis.crypto.randomUUID();
}

export class OfflineCaptureQueue {
  private readonly storage: QueueStorage;
  private readonly transport: UploadTransport;

  // بلا parameter properties — بنية قابلة للتجريد (Node type stripping)
  constructor(storage: QueueStorage, transport: UploadTransport) {
    this.storage = storage;
    this.transport = transport;
  }

  /** التقاط جديد — يُحفظ محليًا فورًا (يعمل دون اتصال) */
  async capture(input: Omit<CaptureRecord, 'captureId' | 'state' | 'documentId' | 'attempts' | 'lastError' | 'createdAt'>): Promise<CaptureRecord> {
    const record: CaptureRecord = {
      ...input,
      captureId: mintCaptureId(),
      state: 'LOCAL_PENDING',
      documentId: null,
      attempts: 0,
      lastError: null,
      createdAt: Date.now(),
    };
    await this.storage.put(record);
    return record;
  }

  /** جدولة الرفع (عند علم العميل بعودة الاتصال أو بطلب المستخدم) */
  async enqueue(captureId: string): Promise<void> {
    const r = await this.mustGet(captureId);
    if (r.state === 'SYNCED') return; // منجز — لا شيء يُعاد
    r.state = 'UPLOAD_PENDING';
    await this.storage.put(r);
  }

  /**
   * استرداد بعد إعادة تشغيل التطبيق: أي سجل عالق UPLOADING يعود
   * UPLOAD_PENDING ويُعاد بنفس capture_id — لا مستند ثانٍ أبدًا.
   */
  async recoverOnStartup(): Promise<number> {
    const all = await this.storage.all();
    let recovered = 0;
    for (const r of all) {
      if (r.state === 'UPLOADING') {
        r.state = 'UPLOAD_PENDING';
        await this.storage.put(r);
        recovered++;
      }
    }
    return recovered;
  }

  /** محاولة رفع كل المعلّق — آمنة للتكرار */
  async flush(): Promise<{ synced: number; failed: number }> {
    const all = await this.storage.all();
    let synced = 0, failed = 0;
    for (const r of all) {
      if (r.state !== 'UPLOAD_PENDING' && r.state !== 'FAILED_RETRYABLE') continue;
      r.state = 'UPLOADING';
      r.attempts += 1;
      await this.storage.put(r);
      try {
        const res = await this.transport.upload(r);
        r.documentId = res.documentId;
        r.state = 'SYNCED';
        r.lastError = null;
        await this.storage.put(r);
        synced++;
      } catch (e) {
        // فشل مرئي وقابل لإعادة المحاولة — لا يُعرض كمخزَّن أبدًا
        r.state = 'FAILED_RETRYABLE';
        r.lastError = e instanceof Error ? e.message : String(e);
        await this.storage.put(r);
        failed++;
      }
    }
    return { synced, failed };
  }

  /** ما يعرضه الواجهة: غير SYNCED = «بانتظار المزامنة»، لا «محفوظ» */
  async pending(): Promise<CaptureRecord[]> {
    const all = await this.storage.all();
    return all.filter((r) => r.state !== 'SYNCED');
  }

  private async mustGet(captureId: string): Promise<CaptureRecord> {
    const r = await this.storage.get(captureId);
    if (!r) throw new Error(`لا سجل التقاط بالمعرف ${captureId}`);
    return r;
  }
}

/** مخزن ذاكرة للاختبارات ولبيئات لا IndexedDB فيها */
export class InMemoryQueueStorage implements QueueStorage {
  private map = new Map<string, CaptureRecord>();
  async get(id: string) { return this.map.get(id); }
  async put(r: CaptureRecord) { this.map.set(r.captureId, structuredClone(r)); }
  async all() { return [...this.map.values()].map((r) => structuredClone(r)); }
  async delete(id: string) { this.map.delete(id); }
}

/** مخزن IndexedDB للمتصفح — أدنى تنفيذ كافٍ (لا service worker) */
export class IndexedDbQueueStorage implements QueueStorage {
  private dbp: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('acc-capture-queue', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('captures', { keyPath: 'captureId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }

  private tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return this.db().then((db) => new Promise<T>((resolve, reject) => {
      const store = db.transaction('captures', mode).objectStore('captures');
      const req = run(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  get(id: string) { return this.tx('readonly', (s) => s.get(id)) as Promise<CaptureRecord | undefined>; }
  put(r: CaptureRecord) { return this.tx('readwrite', (s) => s.put(r)).then(() => undefined); }
  all() { return this.tx('readonly', (s) => s.getAll()) as Promise<CaptureRecord[]>; }
  delete(id: string) { return this.tx('readwrite', (s) => s.delete(id)).then(() => undefined); }
}
