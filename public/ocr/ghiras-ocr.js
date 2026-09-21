/* ════════════════════════════════════════════════════════════════════
   GhirasOCR — قراءةُ كشوفِ الأسماءِ داخلَ جهازِ المعلمةِ وحدَه.

   ★ المبدأ الحاكم: صورةُ الكشفِ ونصُّه وأسماءُ الطلبةِ لا تغادرُ المتصفّح.
     لا Anthropic، ولا سيرفرُ غراس، ولا أيُّ طرفٍ ثالث. القراءةُ بـ Tesseract
     (WebAssembly) في عاملٍ خلفيٍّ داخلَ المتصفّح.

   ★ كلُّ ملفّاتِ المكتبةِ واللغةِ مستضافةٌ عندنا (BASE أدناه). إعداداتُ
     Tesseract الافتراضيةُ تجلبُ من cdn.jsdelivr.net — فالمساراتُ الثلاثةُ
     (workerPath / corePath / langPath) مثبّتةٌ صراحةً، ولا يُحمَّلُ شيءٌ من خارج.

   ★ بعد القراءة: تُصفَّرُ اللوحاتُ وتُلغى روابطُ الصورِ المؤقّتة، ولا يُحفَظُ
     شيءٌ من الصورةِ لا في قاعدةٍ ولا في المتصفّح.

   ⚠️ نسختانِ متطابقتانِ من هذا الملف: Ghiras-platform/public/ocr/ (الحضور)
      وghiras-games/gradebook/ocr/ (سجل الدرجات). أيُّ تعديلٍ هنا يُنقَلُ هناك.

   الواجهة:
     GhirasOCR.readNames(file, {onStatus})  → {names, removed}  (صورة أو PDF)
     GhirasOCR.readSheet(file)              → {names, removed}  (xlsx/xls/csv/txt)
     GhirasOCR.cleanNames(lines)            → {names, removed}
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.GhirasOCR) return;

  // مجلّدُ هذا الملفِّ نفسِه — فالنسختانِ تعملانِ بلا إعداد: /ocr/ أو /gradebook/ocr/
  const BASE = (function () {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^/]*$/, '') : '/ocr/';
  })();

  const MAX_SIDE = 2200;       // سقفُ أبعادِ الصورة — ذاكرةُ الآيباد محدودة
  const IDLE_MS = 90000;       // يُغلَقُ القارئُ بعد ٩٠ ثانيةً بلا استعمالٍ لتحريرِ الذاكرة
  const MAX_PDF_PAGES = 8;

  /* ═════════════ سجلُّ التشخيصِ المؤقّت (?diag=1 فقط) ═════════════
     ⚠️ مؤقّت — لمعرفةِ سببِ تعطّلِ القراءةِ على iPad، ويُزالُ بعد التشخيص.
     • لا يعملُ ولا يظهرُ إلا إن كان في الرابطِ ?diag=1 — المعلماتُ لا يرينه.
     • لا يُرسِلُ شيئًا لأيِّ مكان: يُعرَضُ على الشاشةِ ويُنسَخُ يدويًّا فقط.
     • لا يسجّلُ أسماءً ولا نصًّا مستخرَجًا ولا صورةً ولا اسمَ الملف (قد يحملُ اسمَ
       طالبة) — أعدادٌ وأبعادٌ وأزمنةٌ ونصوصُ أخطاءٍ تقنيةٌ فقط.
     • يُحفَظُ في localStorage على الجهازِ نفسِه كي يبقى بعد أن يُعيدَ Safari تحميلَ
       الصفحةِ عند نفادِ الذاكرة — فيُكشَفُ ذلك ويُعرَفُ عند أيِّ مرحلةٍ حدث. */
  const DIAG = (function () {
    try { if (/[?&]diag=1\b/.test(location.search)) { sessionStorage.setItem('ghiras-ocr-diag-on', '1'); return true; }
      return sessionStorage.getItem('ghiras-ocr-diag-on') === '1'; } catch (e) { return false; }
  })();
  const DKEY = 'ghiras-ocr-diag-log', FKEY = 'ghiras-ocr-diag-inflight';
  const t0Page = Date.now();
  let dlines = [], dpanel = null, stageT = 0;
  function dstore() { try { localStorage.setItem(DKEY, JSON.stringify(dlines.slice(-400))); } catch (e) {} }
  function dlog(stage, msg) {
    if (!DIAG) return;
    const t = ((Date.now() - t0Page) / 1000).toFixed(2);
    dlines.push(`[${t}ث] ${stage}${msg != null && msg !== '' ? ' — ' + msg : ''}`);
    dstore(); drender();
  }
  // «المرحلةُ الجارية»: تُكتَبُ قبل كلِّ مرحلةٍ ثقيلةٍ وتُمسَحُ عند النهاية — لو وُجدت عند
  // فتحِ الصفحةِ فقد أُعيدَ تحميلُها في منتصفِ العمل (نفادُ ذاكرةٍ غالبًا)
  function dstage(name) { if (!DIAG) return; stageT = Date.now(); try { localStorage.setItem(FKEY, JSON.stringify({ name, at: Date.now() })); } catch (e) {} dlog('▶ ' + name); }
  function dstageEnd(name, extra) { if (!DIAG) return; dlog('✔ ' + name, `${((Date.now() - stageT) / 1000).toFixed(2)}ث${extra ? ' · ' + extra : ''}`); }
  function dclearInflight() { if (!DIAG) return; try { localStorage.removeItem(FKEY); } catch (e) {} }
  function derr(where, e) {
    if (!DIAG) return;
    const txt = e && (e.stack || e.message) ? `${e.name || 'Error'}: ${e.message || ''}\n${String(e.stack || '').split('\n').slice(0, 6).join('\n')}` : String(e);
    dlog('✗ خطأ في ' + where, txt);
  }
  function drender() {
    if (!dpanel) return;
    dpanel.querySelector('pre').textContent = dlines.join('\n');
    dpanel.querySelector('pre').scrollTop = 1e9;
  }
  function dpanelInit() {
    if (!DIAG || dpanel || !document.body) return;
    dpanel = document.createElement('div');
    dpanel.setAttribute('dir', 'rtl');
    dpanel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483646;background:#1f2a24;color:#e8f0ea;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:12px/1.55 -apple-system,monospace;max-height:38vh;display:flex;flex-direction:column';
    dpanel.innerHTML = '<div style="display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #3a4a40">'
      + '<b style="flex:1">🩺 سجل التشخيص (مؤقت — لا يُرسل شيئًا)</b>'
      + '<button data-c style="background:#7A9E7E;color:#fff;border:0;border-radius:8px;padding:6px 10px;font:inherit;font-weight:700">📋 نسخ سجل التشخيص</button>'
      + '<button data-x style="background:#5a3a3a;color:#fff;border:0;border-radius:8px;padding:6px 10px;font:inherit">🗑️ مسح</button>'
      + '<button data-h style="background:#3a4a40;color:#fff;border:0;border-radius:8px;padding:6px 10px;font:inherit">▾</button></div>'
      + '<pre style="margin:0;padding:8px 10px;overflow:auto;white-space:pre-wrap;direction:ltr;text-align:left;flex:1"></pre>';
    document.body.appendChild(dpanel);
    dpanel.querySelector('[data-c]').onclick = async () => {
      const txt = dlines.join('\n');
      let ok = false;
      try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {}
      if (!ok) { // احتياطٌ لـ Safari القديم: تحديدُ النصِّ ونسخُه
        const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e) {} ta.remove();
      }
      dpanel.querySelector('[data-c]').textContent = ok ? '✅ نُسخ' : '⚠️ انسخيه يدويًا';
      setTimeout(() => { dpanel.querySelector('[data-c]').textContent = '📋 نسخ سجل التشخيص'; }, 2500);
    };
    dpanel.querySelector('[data-x]').onclick = () => { dlines = []; try { localStorage.removeItem(DKEY); localStorage.removeItem(FKEY); } catch (e) {} drender(); };
    dpanel.querySelector('[data-h]').onclick = () => { const p = dpanel.querySelector('pre'); p.style.display = p.style.display === 'none' ? '' : 'none'; };
    drender();
  }
  // دعمُ SIMD كما يكشفُه Tesseract — لمعرفةِ أيِّ نواةٍ سيختار (لا يُرى من داخلِ العامل)
  function wasmFeatures() {
    const ok = (b) => { try { return WebAssembly.validate(new Uint8Array(b)); } catch (e) { return false; } };
    const simd = ok([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);
    const relaxed = ok([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,15,1,13,0,65,1,253,15,65,2,253,15,253,128,2,11]);
    return { wasm: typeof WebAssembly === 'object', simd, relaxed, core: relaxed ? 'relaxedsimd-lstm' : simd ? 'simd-lstm' : 'lstm' };
  }
  if (DIAG) {
    try { dlines = JSON.parse(localStorage.getItem(DKEY) || '[]'); } catch (e) { dlines = []; }
    dlines.push('════════ فتح الصفحة ════════');
    let inflight = null; try { inflight = JSON.parse(localStorage.getItem(FKEY) || 'null'); } catch (e) {}
    if (inflight) {
      dlog('⚠️⚠️ أُعيد تحميل الصفحة أثناء مرحلة: ' + inflight.name, `قبل ${Math.round((Date.now() - inflight.at) / 1000)}ث — الأرجح نفاد ذاكرة الجهاز`);
      dclearInflight();
    }
    const f = wasmFeatures();
    const isIPad = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const pwa = (navigator.standalone === true) || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    dlog('الوحدة', `GhirasOCR ${'2026-09-21.7-diag'} · base=${BASE}`);
    dlog('الجهاز', `${isIPad ? 'iPad' : (/iPhone/.test(navigator.userAgent) ? 'iPhone' : 'غير iOS')} · ${pwa ? 'تطبيق الشاشة الرئيسية (PWA)' : 'متصفّح'} · شاشة ${screen.width}×${screen.height} @${window.devicePixelRatio}x · أنوية ${navigator.hardwareConcurrency || '؟'} · ذاكرة ${navigator.deviceMemory || 'غير متاحة'}`);
    dlog('المتصفّح', navigator.userAgent);
    dlog('القدرات', `WebAssembly=${f.wasm} · SIMD=${f.simd} · RelaxedSIMD=${f.relaxed} ⇒ النواة المتوقَّعة: ${f.core} · Worker=${typeof Worker} · createImageBitmap=${typeof createImageBitmap} · OffscreenCanvas=${typeof OffscreenCanvas} · IndexedDB=${typeof indexedDB}`);
    window.addEventListener('error', (e) => dlog('✗ خطأ عام في الصفحة', `${e.message || ''} @ ${(e.filename || '').split('/').pop()}:${e.lineno || ''}`));
    window.addEventListener('unhandledrejection', (e) => derr('وعد غير ملتقط', e.reason));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dpanelInit); else dpanelInit();
  }

  /* ─────────────── تحميلٌ كسولٌ للمكتبات (مرّةً واحدة) ─────────────── */
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = () => res(); el.onerror = () => { delete loaded[src]; rej(new Error('load ' + src)); };
      document.head.appendChild(el);
    });
    return loaded[src];
  }

  let worker = null, workerReady = null, idleTimer = null, statusCb = null;
  const STATUS_AR = {
    'loading tesseract core': 'تحميل أداة القراءة (أول مرة فقط)…',
    'initializing tesseract': 'تجهيز أداة القراءة…',
    'loading language traineddata': 'تحميل اللغة العربية (أول مرة فقط)…',
    'loaded language traineddata': 'تجهيز اللغة العربية…',
    'initializing api': 'تجهيز أداة القراءة…',
    'initialized api': 'تجهيز أداة القراءة…',
    'recognizing text': 'قراءة الكشف…',
  };
  let dLastStatus = '';
  function report(m) {
    if (DIAG && m && m.status) {
      const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : null;
      if (m.status !== dLastStatus || pct === 100) {
        dlog('  Tesseract', `${m.status}${pct != null ? ' ' + pct + '%' : ''}`);
        dLastStatus = m.status;
      }
    }
    if (!statusCb || !m) return;
    const label = STATUS_AR[m.status] || 'جارٍ العمل…';
    const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : null;
    statusCb(label, pct);
  }

  async function getWorker() {
    clearTimeout(idleTimer);
    if (workerReady) return workerReady;
    workerReady = (async () => {
      dstage('تحميل مكتبة Tesseract');
      await loadScript(BASE + 'tesseract/tesseract.min.js');
      dstageEnd('تحميل مكتبة Tesseract', 'Tesseract=' + typeof window.Tesseract);
      dstage('تشغيل Web Worker + النواة (WASM) + اللغة العربية');
      // oem=1 (LSTM فقط) ⇒ نواةُ lstm الأخفّ، ونموذجُ best_int للعربية
      const w = await window.Tesseract.createWorker('ara', 1, {
        workerPath: BASE + 'tesseract/worker.min.js',
        corePath: BASE + 'core/',
        langPath: BASE + 'lang',
        workerBlobURL: false,   // العاملُ يُحمَّلُ من نطاقِنا مباشرةً لا من رابطٍ مؤقّت
        gzip: true,
        // نموذجُ اللغةِ (لا الصور) يُخزَّنُ في IndexedDB على الجهاز باسمٍ ذي إصدار،
        // فتغييرُ النموذجِ لاحقًا لا يُبقي القديمَ عالقًا
        cachePath: 'ghiras-ocr-ara-bestint-v1',
        logger: report,
      });
      await w.setParameters({ preserve_interword_spaces: '1' });
      dstageEnd('تشغيل Web Worker + النواة (WASM) + اللغة العربية', 'العامل جاهز');
      worker = w;
      return w;
    })().catch((e) => { derr('تشغيل العامل/النواة/اللغة', e); workerReady = null; throw e; });
    return workerReady;
  }
  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      const w = worker; worker = null; workerReady = null;
      try { if (w) await w.terminate(); } catch (e) {}
    }, IDLE_MS);
  }

  /* ─────────────── تحويلُ الملفِّ إلى لوحات (صورة/صفحات PDF) ─────────────── */
  function fitCanvas(src, w, h) {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function imageToCanvas(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      // تفريغُ img.src بعد النجاحِ يُطلِقُ onerror في المتصفّح — العلَمُ يُسكتُه (كان بلا أثر، لكنه يضلّلُ سجلَّ التشخيص)
      let decoded = false;
      img.onload = () => {
        decoded = true;
        try {
          const c = fitCanvas(img, img.naturalWidth, img.naturalHeight);
          dlog('فكّ الصورة ✓', `الأصل ${img.naturalWidth}×${img.naturalHeight} (${(img.naturalWidth * img.naturalHeight / 1e6).toFixed(1)} ميغابكسل) ⇒ ${c.width === img.naturalWidth ? 'بلا تصغير' : 'صُغّرت إلى'} ${c.width}×${c.height}`);
          res(c);
        }
        catch (e) { derr('تصغير الصورة على اللوحة', e); rej(e); }
        finally { URL.revokeObjectURL(url); img.src = ''; }
      };
      img.onerror = () => { if (decoded) return; dlog('✗ فكّ الصورة فشل', 'المتصفّح لم يستطع قراءة الملف كصورة'); URL.revokeObjectURL(url); rej(new Error('image-decode')); };
      img.src = url;
    });
  }

  async function pdfToCanvases(file) {
    const lib = await import(BASE + 'pdf/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = BASE + 'pdf/pdf.worker.min.mjs';
    const data = new Uint8Array(await file.arrayBuffer());
    // لا خطوطَ ولا موارد من خارج: كلُّ شيءٍ من الملفِّ نفسِه
    const task = lib.getDocument({ data, isEvalSupported: false, disableFontFace: false, useSystemFonts: true });
    const doc = await task.promise;
    const out = [];
    const n = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const v1 = page.getViewport({ scale: 1 });
      const scale = Math.min(3, MAX_SIDE / Math.max(v1.width, v1.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      page.cleanup();
      out.push(c);
    }
    // التنظيفُ في pdf.js الحديثِ على «مهمّةِ التحميل» لا على المستند (المستندُ فقدَ destroy)
    await (typeof doc.destroy === 'function' ? doc.destroy() : task.destroy());
    return out;
  }

  /* ─────────────── تجهيزُ الصورةِ للقراءة (داخلَ المتصفّح) ─────────────── */
  /** زاويةُ ميلِ الصورة (بالدرجات): تُجرَّبُ زوايا بين −٤ و+٤ ويُختارُ ما يجعلُ
   *  أسطرَ الجدولِ أفقيةً — أي ما يُعظِّمُ تباينَ مجموعِ البكسلاتِ الداكنةِ لكلِّ صف.
   *  الصورُ الملتقطةُ باليدِ مائلةٌ قليلًا دائمًا، والميلُ أشدُّ ما يُفسدُ قراءةَ الجداول. */
  function skewAngle(gray, W, H) {
    const step = Math.max(1, Math.round(Math.max(W, H) / 700));   // عيّنةٌ مصغّرةٌ للسرعة
    // عتبةُ «الداكن» تتكيّفُ مع الصورة (Otsu، بسقف ١٦٠): الثابتةُ (١١٠) كانت تُسقِطُ خطوطَ
    // الجدولِ المهتزّةِ (~١٣٠) فيُقدَّرُ الميلُ من النصِّ وحدَه — وهو دليلٌ أضعف
    // (قيسَ: ١٫٨° بدل ١٫٥°، فبقيت الخطوطُ مائلةً وفاتَ حذفُها)
    const hist = new Uint32Array(256);
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) hist[gray[y * W + x]]++;
    let tot = 0, sum = 0; for (let i = 0; i < 256; i++) { tot += hist[i]; sum += i * hist[i]; }
    let sB = 0, wB = 0, bestV = -1, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = tot - wB; if (!wF) break;
      sB += t * hist[t];
      const v = wB * wF * ((sB / wB) - ((sum - sB) / wF)) ** 2;
      if (v > bestV) { bestV = v; th = t; }
    }
    th = Math.min(160, th);
    // كلُّ صفٍّ يُعايَن (الأعمدةُ وحدَها مُعايَنةٌ بخطوة): معاينةُ الصفوفِ بخطوةٍ مع سلالٍ
    // بدقّةِ بكسلٍ تجعلُ الزاويةَ صفرًا «قمّةً» مصطنعةً (سلالٌ ممتلئةٌ وأخرى فارغة)
    const pts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x += step) if (gray[y * W + x] < th) pts.push(x, y);
    if (pts.length < 400) return 0;
    const score = (a) => {
      const t = a * Math.PI / 180, s = Math.sin(t), c = Math.cos(t);
      // سلالٌ بدقّةِ بكسلٍ واحد (لا بخطوةِ العيّنة): تُرهِفُ القمّةَ فتدقُّ الزاوية
      const bins = new Float32Array(H + W + 4);
      for (let i = 0; i < pts.length; i += 2) {
        const yy = pts[i + 1] * c - pts[i] * s + W;
        const b = yy | 0; if (b >= 0 && b < bins.length) bins[b]++;
      }
      let m = 0; for (let i = 0; i < bins.length; i++) m += bins[i]; m /= bins.length;
      let v = 0; for (let i = 0; i < bins.length; i++) v += (bins[i] - m) ** 2;
      return v;
    };
    // بحثٌ خشنٌ بربعِ درجة ثم دقيقٌ بـ٠٫٠٥° حولَ الأفضل: ميلٌ متبقٍّ ١/٨ درجةٍ يُزحزحُ
    // الخطَّ ٤ بكسلاتٍ على طولِ الصفحة، فلا يعودُ «متّصلًا» فيفوتُ كشفَ خطوطِ الجدول
    let best = 0, bestVar = -1;
    for (let a = -4; a <= 4.001; a += 0.25) { const v = score(a); if (v > bestVar) { bestVar = v; best = a; } }
    const coarse = best;
    for (let a = coarse - 0.25; a <= coarse + 0.2501; a += 0.05) { const v = score(a); if (v > bestVar) { bestVar = v; best = a; } }
    return Math.round(best * 100) / 100;
  }

  /** تجهيزُ الصورةِ داخلَ المتصفّح:
   *  ١) تكبيرُ القصاصاتِ الضيّقة (Tesseract يقرأُ الحروفَ الكبيرةَ أفضل)
   *  ٢) تقويمُ الميل
   *  ٣) تصحيحُ الإضاءة: كلُّ بكسلٍ يُقسَمُ على إضاءةِ ما حوله — يُزيلُ ظلَّ اليدِ
   *     وتدرّجَ الضوءِ دون أن يُضخِّمَ الضجيج. (مدُّ التباينِ العامُّ جُرِّبَ وأفسدَ
   *     صورَ الجوّال: ضاعفَ البكسلاتِ الداكنةَ من ١٫٩٪ إلى ٥٫٧٪.)
   *  ٤) في القصّ: حذفُ خطوطِ الجدول — حدودُ القصِّ تقعُ غالبًا على خطوطِه، فيقرأُ
   *     القارئُ الخطَّ العموديَّ ألفًا («المطيريا») والأفقيَّ يُربكُ تقسيمَ الأسطر.
   *  والنتيجةُ رماديةٌ لا أبيضُ وأسودُ صافٍ: الثنائيةُ تُضيّعُ النقاط («نورة» ← «تورة»). */
  function prepare(src, rect, stripLines) {
    const r = rect || { x: 0, y: 0, w: src.width, h: src.height };
    const k = Math.max(1, Math.min(3, 1400 / Math.max(r.w, 1)));
    const pad = 24;
    const c = document.createElement('canvas');
    c.width = Math.round(r.w * k) + pad * 2; c.height = Math.round(r.h * k) + pad * 2;
    let g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, r.x, r.y, r.w, r.h, pad, pad, c.width - pad * 2, c.height - pad * 2);
    const W = c.width, H = c.height, N = W * H;
    const lum = (dd) => { const y = new Uint8Array(N); for (let i = 0, j = 0; i < dd.length; i += 4, j++) y[j] = (dd[i] * 299 + dd[i + 1] * 587 + dd[i + 2] * 114) / 1000 | 0; return y; };

    // ٢) تقويمُ الميل
    let im = g.getImageData(0, 0, W, H);
    const ang = skewAngle(lum(im.data), W, H);
    if (Math.abs(ang) >= 0.05) {
      const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      tmp.getContext('2d').drawImage(c, 0, 0);
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.save(); g.translate(W / 2, H / 2); g.rotate(-ang * Math.PI / 180); g.drawImage(tmp, -W / 2, -H / 2); g.restore();
      tmp.width = 0;
      im = g.getImageData(0, 0, W, H);
    }
    const d = im.data, y = lum(d);

    // ٣) تصحيحُ الإضاءة بمتوسّطٍ صندوقيٍّ واسعٍ عبر صورةٍ تكامليّة (سريعٌ مهما كبر النصف القطر)
    const I = new Float64Array((W + 1) * (H + 1));
    for (let q = 0; q < H; q++) { let s = 0; for (let x = 0; x < W; x++) { s += y[q * W + x]; I[(q + 1) * (W + 1) + x + 1] = I[q * (W + 1) + x + 1] + s; } }
    const R = Math.max(15, Math.round(Math.min(W, H) / 25));
    const out = new Uint8Array(N);
    for (let q = 0; q < H; q++) {
      const y0 = Math.max(0, q - R), y1 = Math.min(H, q + R + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
        const bg = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        const v = bg > 1 ? y[q * W + x] * 255 / bg : 255;
        out[q * W + x] = v > 255 ? 255 : v;
      }
    }

    // ٤) حذفُ خطوطِ الجدول بمنحنى القتامة: متوسّطُ قتامةِ كلِّ صفٍّ (وكلِّ عمود)؛ خطُّ
    //    الجدولِ قمّةٌ عاليةٌ حادّة، والنصُّ أخفضُ بكثير. تُبيَّضُ القمّةُ مع «ذيلِها»
    //    — الصورةُ المهتزّةُ تفرشُ الخطَّ الرفيعَ شريطًا رماديًّا عريضًا، والعتبةُ الثابتةُ
    //    كانت تحذفُ قلبَه وتتركُ حوافَّه فيتعثّرُ تقسيمُ الأسطر (قيسَ: ١٠ أسطرٍ من ٢٠).
    const rowBad = new Uint8Array(H), colBad = new Uint8Array(W);
    if (stripLines) {
      // الكشفُ بـ«الاستمرارية» لا بالقتامة: خطُّ الجدولِ متّصلٌ على أغلبِ طوله (٩٠٪+)،
      // وحافّةُ النصِّ المتراصفِ يمينًا متقطّعة (~٣٠–٤٠٪). القتامةُ وحدَها كانت تُفوّتُ
      // الخطَّ المهتزَّ (متوسّطُه ~٨٧) أو تمسحُ بداياتِ الأسماءِ لو خُفِّضت عتبتُها.
      // ٧٥٪: الخطُّ يغطّي ٩٥٪+ من طوله؛ وقاعدةُ الكلماتِ العربيةِ المتّصلةِ في قصاصةِ
      // عمودِ الأسماءِ لا تتجاوزُ ~٦٠٪ (مسافاتٌ بين الكلماتِ وحروفٌ لا تتّصلُ بما بعدها)
      const COV = 0.75;
      const markLines = (cov, mean, bad) => {
        const n = cov.length, sorted = Array.from(mean).sort((u, v) => u - v);
        const base = sorted[n >> 1];                          // وسيطُ القتامة ≈ الخلفيةُ والنص
        for (let i = 0; i < n; i++) {
          if (cov[i] < COV || bad[i]) continue;
          let j = i, peak = 0;
          while (j < n && cov[j] >= COV) { peak = Math.max(peak, mean[j]); j++; }
          const tail = Math.max(base * 1.5, peak * 0.2);      // حوافُّ الشريطِ الرمادي
          let s = i; while (s > 0 && mean[s - 1] > tail) s--;
          let e = j; while (e < n && mean[e] > tail) e++;
          for (let t = Math.max(0, s - 1); t < Math.min(n, e + 1); t++) bad[t] = 1;
          i = e;
        }
      };
      const rMean = new Float32Array(H), cMean = new Float32Array(W), rCov = new Float32Array(H), cCov = new Float32Array(W);
      // «داكنٌ» بتسامحِ بكسلٍ واحد: يكفي أن يكونَ هو أو جارُه داكنًا — يمتصُّ ما يبقى
      // من ميلٍ طفيفٍ بعد التقويمِ فلا ينقسمُ الخطُّ بين عمودَيْ بكسل
      // عتبةُ «الداكن» متكيّفة (Otsu + ٢٠، بين ١٧٥ و٢١٠): الخطوطُ الرفيعةُ الباهتةُ في
      // الصورِ الصغيرةِ المهتزّةِ أفتحُ من ١٧٥ فلا تُكشَفُ أبدًا (قيسَ: صفرُ خطوطٍ من ٢٦)
      const oh = new Uint32Array(256); for (let i = 0; i < N; i++) oh[out[i]]++;
      let os = 0; for (let i = 0; i < 256; i++) os += i * oh[i];
      let oB = 0, oW = 0, oV = -1, oT = 128;
      for (let t = 0; t < 256; t++) {
        oW += oh[t]; if (!oW) continue;
        const oF = N - oW; if (!oF) break;
        oB += t * oh[t];
        const v = oW * oF * ((oB / oW) - ((os - oB) / oF)) ** 2;
        if (v > oV) { oV = v; oT = t; }
      }
      const DK = Math.max(175, Math.min(210, oT + 20));
      for (let q = 0; q < H; q++) {
        const row = q * W, up = q > 0 ? row - W : row, dn = q < H - 1 ? row + W : row;
        for (let x = 0; x < W; x++) {
          const v = 255 - out[row + x];
          rMean[q] += v; cMean[x] += v;
          const xl = x > 0 ? x - 1 : x, xr = x < W - 1 ? x + 1 : x;
          if (out[row + x] < DK || out[row + xl] < DK || out[row + xr] < DK) cCov[x]++;
          if (out[row + x] < DK || out[up + x] < DK || out[dn + x] < DK) rCov[q]++;
        }
      }
      for (let q = 0; q < H; q++) { rMean[q] /= W; rCov[q] /= W; }
      // الخطُّ العموديُّ يمتدُّ بطولِ الجدولِ لا الصفحة — يُقاسُ على المدى الرأسيِّ للمحتوى
      let top = 0, bot = H - 1;
      while (top < H && rMean[top] < 2) top++;
      while (bot > top && rMean[bot] < 2) bot--;
      const span = Math.max(1, bot - top + 1);
      for (let x = 0; x < W; x++) { cMean[x] /= H; cCov[x] /= span; }
      markLines(rCov, rMean, rowBad); markLines(cCov, cMean, colBad);
      c.stripStats = { rows: rowBad.reduce((s, v) => s + v, 0), cols: colBad.reduce((s, v) => s + v, 0), H, W };
      // أعمدةُ الجدولِ = المسافاتُ بين الخطوطِ العمودية — تُستعمَلُ للتظليلِ التلقائي
      c.cols = [];
      let s = -1;
      for (let x = 0; x <= W; x++) {
        const bad = x === W || colBad[x];
        if (!bad && s < 0) s = x;
        if (bad && s >= 0) { c.cols.push([s, x]); s = -1; }
      }
    }
    for (let q = 0; q < H; q++) for (let x = 0; x < W; x++) {
      const j = q * W + x, i = j * 4;
      const v = (rowBad[q] || colBad[x]) ? 255 : out[j];
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(im, 0, 0);
    // التحويلُ العكسيُّ من بكسلِ هذه اللوحةِ إلى بكسلِ الصورةِ الأصلية — لمعرفةِ
    // أيُّ الأسطرِ المقروءةِ تقعُ داخلَ المنطقةِ التي ظلّلتها المعلمة
    const a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    c.toSource = (x, y) => {
      const dx = x - W / 2, dy = y - H / 2;
      const x0 = dx * ca - dy * sa + W / 2, y0 = dx * sa + dy * ca + H / 2;
      return { x: (x0 - pad) / k + r.x, y: (y0 - pad) / k + r.y };
    };
    return c;
  }

  function wipe(c) { if (c) { c.width = 0; c.height = 0; } }

  /* ─────────────── تنظيفُ النصِّ المستخرَج (داخلَ المتصفّح) ─────────────── */
  const HEADER_WORDS = new Set(['م', 'مسلسل', 'الاسم', 'اسم', 'الطالب', 'الطالبة', 'الطلاب', 'الطالبات',
    'الرقم', 'رقم', 'المدني', 'الصف', 'الفصل', 'الشعبة', 'المجموع', 'ملاحظات', 'التوقيع', 'الجنسية',
    'الدرجة', 'الدرجات', 'المادة', 'المدرسة', 'مدرسة', 'العام', 'الدراسي', 'كشف', 'أسماء', 'اسماء',
    'وزارة', 'التربية', 'منطقة', 'التعليمية', 'الحضور', 'الغياب', 'الهاتف', 'القيد', 'تاريخ', 'الميلاد']);
  const TITLE_HINTS = /(كشف|وزارة|مدرسة|المنطقة التعليمية|العام الدراسي|الفصل الدراسي|الصفحة|صفحة)/;
  // كلماتُ عناوينَ لا تَرِدُ في اسمِ طالبٍ أبدًا — تُطابَقُ كلمةً كاملةً لا جزءَ كلمة،
  // فـ«الصفار» اسمُ عائلةٍ يبقى، و«طالبات الصف الرابع» (عنوانٌ قصّه عمودُ الأسماء) يُحذَف
  const TITLE_TOKENS = new Set(['كشف', 'كشوف', 'مدرسة', 'المدرسة', 'وزارة', 'صفحة', 'الصفحة', 'الصف',
    'طالبات', 'طلاب', 'الطالبات', 'الطلاب', 'الفصل', 'الشعبة', 'الدراسي', 'الدراسية', 'التعليمية', 'منطقة', 'المنطقة']);

  function toLatinDigits(s) {
    return s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
            .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }

  /** «أحمدالعلي» ← «أحمد العلي»: قارئُ العربيةِ يُسقِطُ المسافةَ قبل «ال» كثيرًا.
   *  لا يُفصَلُ ما قبلَه «عبد» (عبدالله، عبدالرحمن…) ولا ما يتركُ طرفًا قصيرًا
   *  (العبدالله ← «له» حرفان فيبقى متّصلًا كما يُكتب). */
  function splitAl(tok) {
    if (tok.length < 6) return tok;
    // كلُّ مواضعِ «ال» من الآخر: آخرُها قد يكون داخلَ كلمةٍ («وليدالخالدي» ← «خالدي»)
    for (let i = tok.lastIndexOf('ال'); i >= 3; i = tok.lastIndexOf('ال', i - 1)) {
      if (tok.length - i - 2 < 3) continue;
      const head = tok.slice(0, i);
      if (/عبد$/.test(head)) continue;
      return splitAl(head) + ' ' + tok.slice(i);
    }
    return tok;
  }

  /** ينظّفُ سطرًا واحدًا ⇒ {name|null, digits:bool} */
  function cleanLine(raw) {
    let s = toLatinDigits(String(raw || ''));
    // ★ أيُّ أرقامٍ (ومنها الأرقامُ المدنيةُ ١٢ خانة والهواتف) تُنزَعُ هنا قبل أيِّ عرض —
    //   فلا يظهرُ رقمٌ في قائمةِ الأسماءِ أبدًا، ولا يُحفَظ.
    const digits = /\d/.test(s);
    s = s.replace(/\d+/g, ' ')
         .replace(/[‎‏‪-‮⁦-⁩]/g, '') // علاماتُ الاتجاه
         .replace(/[ـ]/g, '')                                     // تطويل
         .replace(/[ً-ٰٟ]/g, '')                    // تشكيل
         .replace(/[^ء-يa-zA-Z\s]/g, ' ')                // رموزُ الجداولِ وضجيجُ القراءة
         .replace(/\s+/g, ' ').trim();
    if (!s || TITLE_HINTS.test(s)) return { name: null, digits };
    let toks = s.split(' ').filter((t) => t.length > 1)           // حرفٌ منفردٌ ضجيج
                .map(splitAl).join(' ').split(' ');
    if (toks.length && toks.every((t) => HEADER_WORDS.has(t))) return { name: null, digits };
    if (toks.some((t) => TITLE_TOKENS.has(t))) return { name: null, digits };
    while (toks.length > 2 && HEADER_WORDS.has(toks[0])) toks.shift();  // «الاسم فاطمة…»
    const arabicLetters = (toks.join('').match(/[ء-ي]/g) || []).length;
    if (toks.length < 2 || arabicLetters < 4) return { name: null, digits };  // الاسمُ ثنائيٌّ فأكثر
    return { name: toks.join(' '), digits };
  }

  /** للأسطرِ النصيّة (لصق/Excel/CSV): لا ثقةَ ولا مواقع — تنظيفٌ فقط */
  function cleanNames(lines) {
    let removed = 0;
    const names = [];
    for (const raw of lines) {
      if (/\d(?:[\s\-.]*\d){7,}/.test(toLatinDigits(String(raw || '')))) removed++;
      const r = cleanLine(raw);
      if (r.name && names[names.length - 1] !== r.name) names.push(r.name);
    }
    return { names, removed };
  }

  /** لأسطرِ القراءة: تُستعمَلُ ثقةُ كلِّ سطرٍ وموقعُه لعزلِ عمودِ الأسماء.
   *  قيسَ على كشفٍ اصطناعي: أسطرُ الأسماءِ ثقتُها ٨٨–٩٦، وضجيجُ عمودِ الأرقامِ
   *  المدنية (الأرقامُ الهنديةُ يقرؤها نموذجُ العربيةِ حروفًا عشوائية) ثقتُه ٠–٥٦. */
  function pickNames(lines, width, cropped) {
    // القصاصةُ اختارتها المعلمةُ بيدِها فهي عمودُ أسماءٍ أصلًا: عتبةٌ أرخى تُبقي
    // الاسمَ المقروءَ بثقةٍ متوسطةٍ لتصحّحه، بدل أن يسقطَ من القائمة بصمت
    const MIN_CONF = cropped ? 30 : 60;
    let removed = 0;
    const cand = [];
    for (const l of lines) {
      const r = cleanLine(l.text);
      const noisy = l.conf < MIN_CONF;
      if (!r.name || noisy) { if (r.digits || noisy) removed++; continue; }
      cand.push({ name: r.name, x: l.x, w: l.w, conf: l.conf });
    }
    let keep = cand;
    // الصفحةُ كاملة: يُختارُ العمودُ الذي يضمُّ أكثرَ الأسماء، وتُترَكُ الأعمدةُ الأخرى
    // (اسمُ وليِّ الأمر، الملاحظات…). القصاصةُ عمودٌ واحدٌ أصلًا فلا حاجة.
    if (!cropped && cand.length > 3 && width > 0) {
      const bin = Math.max(20, width * 0.06), counts = {};
      cand.forEach((c) => { const k = Math.round(c.x / bin); counts[k] = (counts[k] || 0) + 1; });
      const bestBin = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      const inBin = cand.filter((c) => Math.abs(Math.round(c.x / bin) - bestBin) <= 1).map((c) => c.x).sort((a, b) => a - b);
      const center = inBin[inBin.length >> 1];
      const ws = cand.map((c) => c.w).sort((a, b) => a - b), medW = ws[ws.length >> 1] || 0;
      const tol = Math.max(width * 0.1, medW * 0.75);
      keep = cand.filter((c) => Math.abs(c.x - center) <= tol);
      removed += cand.length - keep.length;
    }
    const names = [];
    let confSum = 0;
    keep.forEach((c) => { if (names[names.length - 1] !== c.name) { names.push(c.name); confSum += c.conf; } });
    return { names, removed, confSum };
  }

  /** قراءةُ صفحةٍ واحدة.
   *  ★ الصفحةُ كاملة: حذفُ خطوطِ الجدولِ + تحليلٌ تلقائيٌّ للتخطيط (psm 3). قيسَ على
   *    كشوفٍ اصطناعية: بلا حذفِ الخطوطِ يقرأُ القارئُ كلَّ صفٍّ سطرًا واحدًا عابرًا
   *    للأعمدة (الاسمُ مخلوطٌ بالرقمِ المدني)، فتنهارُ الدقّةُ في صورِ الجوّال (٠/٢٠)؛
   *    ومع الحذفِ ١٩–٢٠/٢٠.
   *  ★ الجزءُ المحدَّد: «اختيارُ عمودٍ» لا «قصُّ صورة» — قراءةُ القصاصةِ وحدَها كانت
   *    متقلّبة. فتُقرأ الصفحةُ كاملةً وتُؤخذُ الأسطرُ الواقعةُ داخلَ التظليل، وتُقرأُ
   *    القصاصةُ أيضًا احتياطًا، ويُعتمَدُ الأعلى مجموعَ ثقة. */
  async function readPage(page, rect) {
    const w = await getWorker();
    let full = null, crop = null;
    try {
      dstage('تجهيز الصورة (تقويم/إضاءة/خطوط)');
      full = prepare(page, null, true);
      dstageEnd('تجهيز الصورة (تقويم/إضاءة/خطوط)', `لوحة ${full.width}×${full.height} · أعمدة مكتشفة ${(full.cols || []).length}`);
      await w.setParameters({ tessedit_pageseg_mode: '3' });
      dstage('قراءة الصفحة كاملة');
      const linesFull = await recognizeLines(full);
      dstageEnd('قراءة الصفحة كاملة', `أسطر مقروءة: ${linesFull.length}`);
      if (!rect) {
        // الصفحةُ كاملةً بلا تظليل: تحليلُ التخطيطِ وحدَه ينهارُ أحيانًا في الصورِ المهتزّة
        // (قيسَ: ٠/٢٠)، فيُقرأُ أيضًا كلُّ عمودٍ عريضٍ من أعمدةِ الجدولِ وحدَه — «تظليلٌ
        // تلقائي» — ويُعتمَدُ الأعلى مجموعَ ثقة. جدولٌ بلا خطوطٍ عموديةٍ لا أعمدةَ له هنا.
        let best = pickNames(linesFull, full.width, false);
        const cols = (full.cols || []).filter(([x0, x1]) => x1 - x0 >= full.width * 0.12);
        if (cols.length >= 2) {
          dstage(`قراءة الأعمدة منفردة (${Math.min(cols.length, 6)})`);
          await w.setParameters({ tessedit_pageseg_mode: '6' });
          for (const [x0, x1] of cols.slice(0, 6)) {
            const strip = document.createElement('canvas');
            strip.width = x1 - x0; strip.height = full.height;
            strip.getContext('2d').drawImage(full, x0, 0, strip.width, strip.height, 0, 0, strip.width, strip.height);
            try {
              const r = pickNames(await recognizeLines(strip), strip.width, true);
              if (r.confSum > best.confSum) best = { names: r.names, removed: Math.max(best.removed, r.removed), confSum: r.confSum };
            } finally { wipe(strip); }
          }
          dstageEnd(`قراءة الأعمدة منفردة (${Math.min(cols.length, 6)})`);
        }
        dlog('النتيجة', `عدد الأسماء: ${best.names.length} · أسطر أرقام/ضجيج حُذفت: ${best.removed}`);
        return best;
      }

      // (أ) أسطرُ الصفحةِ الكاملةِ الواقعةُ داخلَ التظليل (بهامشٍ ٣٪ لليدِ غيرِ الدقيقة)
      const mx = rect.w * 0.03, my = rect.h * 0.03;
      const inside = linesFull.filter((l) => {
        const p = full.toSource(l.x, l.y);
        return p.x >= rect.x - mx && p.x <= rect.x + rect.w + mx && p.y >= rect.y - my && p.y <= rect.y + rect.h + my;
      });
      const a = pickNames(inside, full.width, true);

      // (ب) القصاصةُ نفسُها — كتلةٌ موحّدة (psm 6): كلُّ صفٍّ سطر
      dstage('قراءة الجزء المظلَّل');
      crop = prepare(page, rect, true);
      await w.setParameters({ tessedit_pageseg_mode: '6' });
      const b = pickNames(await recognizeLines(crop), crop.width, true);
      dstageEnd('قراءة الجزء المظلَّل', `قصاصة ${crop.width}×${crop.height} · أسماء (أ) ${a.names.length} (ب) ${b.names.length}`);

      // الاختيار: إن وجدت إحداهما أسماءً أكثرَ بوضوح (٢٠٪+) فهي الأصحّ — الصورُ القاسيةُ
      // تُسقِطُ من (أ) نصفَ الأسماء (قيسَ: ١٠ مقابل ١٩). وإن تقاربتا قُدِّمت (أ): حدودُ
      // القصاصةِ تقعُ على خطوطِ الجدولِ فيبقى أثرُها ألفًا زائدةً في آخرِ الاسم («الكندريا»)،
      // والصفحةُ الكاملةُ لا يمسُّها ذلك.
      const na = a.names.length, nb = b.names.length;
      const best = nb > na * 1.2 ? b : na > nb * 1.2 ? a : (b.confSum > a.confSum * 1.15 ? b : a);
      return { names: best.names, removed: Math.max(a.removed, b.removed), confSum: best.confSum };
    } finally { wipe(full); wipe(crop); }
  }

  /* ─────────────── نافذةُ القصّ: «ظلّلي عمود الأسماء» ─────────────── */
  const CSS = `
.gocr-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(20,28,24,.72);display:flex;align-items:center;justify-content:center;padding:12px;direction:rtl;font-family:inherit}
.gocr-box{background:#fff;border-radius:18px;max-width:760px;width:100%;max-height:96vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.gocr-hd{padding:14px 16px 8px}.gocr-hd b{display:block;font-size:17px;color:#2E3830}
.gocr-hd small{display:block;margin-top:4px;color:#6F7C72;font-size:13px;line-height:1.6}
.gocr-stage{position:relative;margin:0 12px;background:#F3F1EA;border-radius:12px;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;justify-content:center}
.gocr-stage canvas{display:block;max-width:100%;max-height:58vh;width:auto;height:auto}
.gocr-sel{position:absolute;border:2.5px solid #C9A84C;background:rgba(201,168,76,.18);box-shadow:0 0 0 9999px rgba(0,0,0,.28);display:none;pointer-events:none;border-radius:4px}
.gocr-ft{display:flex;flex-wrap:wrap;gap:8px;padding:12px 12px 14px;align-items:center}
.gocr-bt{border:0;border-radius:12px;padding:12px 16px;font:inherit;font-weight:800;font-size:15px;cursor:pointer}
.gocr-p{background:#5F8163;color:#fff}.gocr-p:disabled{opacity:.45;cursor:default}
.gocr-s{background:#EEF3EE;color:#3E5F42}.gocr-g{background:transparent;color:#8A938C;margin-inline-start:auto}
.gocr-st{padding:0 16px 12px;color:#5F8163;font-size:14px;font-weight:700;min-height:20px}
.gocr-bar{height:6px;background:#EEF3EE;border-radius:9px;margin:6px 16px 0;overflow:hidden;display:none}
.gocr-bar i{display:block;height:100%;width:0;background:#7A9E7E;transition:width .25s}
.gocr-lock{font-size:12px;color:#6F7C72;padding:0 16px 10px}`;
  function ensureCss() {
    if (document.getElementById('gocr-css')) return;
    const st = document.createElement('style'); st.id = 'gocr-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /** تعرضُ اللوحةَ وتُعيد {mode:'crop'|'full'|'skip'|'cancel', rect} */
  function cropDialog(canvas, pageLabel) {
    ensureCss();
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'gocr-ov';
      ov.innerHTML = `<div class="gocr-box" role="dialog" aria-modal="true">
        <div class="gocr-hd"><b>📸 قراءة كشف الأسماء${pageLabel ? ' — ' + pageLabel : ''}</b>
        <small>لأدق قراءة: مرّري إصبعك على <b>عمود الأسماء فقط</b> لتظليله، ثم اضغطي «اقرأ الجزء المحدد».</small></div>
        <div class="gocr-stage"><div class="gocr-sel"></div></div>
        <div class="gocr-lock">🔒 تتم القراءة داخل جهازك — الصورة والأسماء لا تُرسل لأي جهة.</div>
        <div class="gocr-bar"><i></i></div><div class="gocr-st"></div>
        <div class="gocr-ft">
          <button class="gocr-bt gocr-p" data-a="crop" disabled>اقرأ الجزء المحدد</button>
          <button class="gocr-bt gocr-s" data-a="full">اقرأ الصورة كاملة</button>
          ${pageLabel ? '<button class="gocr-bt gocr-s" data-a="skip">تخطَّ هذه الصفحة</button>' : ''}
          <button class="gocr-bt gocr-g" data-a="cancel">إلغاء</button>
        </div></div>`;
      const stage = ov.querySelector('.gocr-stage'), sel = ov.querySelector('.gocr-sel');
      stage.insertBefore(canvas, sel);
      document.body.appendChild(ov);

      let start = null, rect = null;
      const cropBtn = ov.querySelector('[data-a="crop"]');
      const pos = (e) => {
        const b = canvas.getBoundingClientRect();
        return { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)), b };
      };
      const draw = (a, z) => {
        const b = a.b, cb = canvas.getBoundingClientRect(), sb = stage.getBoundingClientRect();
        const x = Math.min(a.x, z.x), y = Math.min(a.y, z.y), w = Math.abs(z.x - a.x), h = Math.abs(z.y - a.y);
        Object.assign(sel.style, { display: 'block', left: (cb.left - sb.left + x) + 'px', top: (cb.top - sb.top + y) + 'px', width: w + 'px', height: h + 'px' });
        const kx = canvas.width / b.width, ky = canvas.height / b.height;
        rect = { x: Math.round(x * kx), y: Math.round(y * ky), w: Math.round(w * kx), h: Math.round(h * ky) };
        cropBtn.disabled = !(w > 18 && h > 18);
      };
      stage.addEventListener('pointerdown', (e) => { start = pos(e); stage.setPointerCapture(e.pointerId); e.preventDefault(); });
      stage.addEventListener('pointermove', (e) => { if (start) draw(start, pos(e)); });
      stage.addEventListener('pointerup', () => { start = null; });
      stage.addEventListener('pointercancel', () => { start = null; });

      const ui = {
        status(t, pct) {
          ov.querySelector('.gocr-st').textContent = t || '';
          const bar = ov.querySelector('.gocr-bar'), fill = bar.querySelector('i');
          if (pct == null) { bar.style.display = 'none'; } else { bar.style.display = 'block'; fill.style.width = pct + '%'; }
        },
        busy(on) { ov.querySelectorAll('button').forEach((b) => { b.disabled = on || (b === cropBtn && !rect); }); },
        close() { ov.remove(); },
      };
      ov.querySelector('.gocr-ft').addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]'); if (!a || a.disabled) return;
        resolve({ mode: a.dataset.a, rect: a.dataset.a === 'crop' ? rect : null, ui });
      });
    });
  }

  /* ─────────────── القراءة ─────────────── */
  /** ⇒ [{text, conf, x, w}] — أسطرٌ بثقتِها وموقعِها الأفقي */
  async function recognizeLines(canvas) {
    const w = await getWorker();
    try {
      const { data } = await w.recognize(canvas, {}, { text: true, blocks: true });
      const out = [];
      (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => {
        out.push({ text: l.text, conf: l.confidence, x: (l.bbox.x0 + l.bbox.x1) / 2, y: (l.bbox.y0 + l.bbox.y1) / 2, w: l.bbox.x1 - l.bbox.x0 });
      })));
      // احتياطٌ لو لم تُرجَع البنية: النصُّ خامًا بثقةٍ كاملة
      if (!out.length && data.text) String(data.text).split(/\r?\n/).forEach((t) => out.push({ text: t, conf: 100, x: 0, y: 0, w: 0 }));
      return out;
    } finally { scheduleIdle(); }
  }

  async function readNames(file, opts) {
    const onStatus = (opts && opts.onStatus) || function () {};
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name || '');
    let pages = [];
    try {
      // نوعُ الملفِّ وحجمُه وامتدادُه فقط — لا اسمُه (قد يحملُ اسمَ طالبة) ولا محتواه
      const ext = ((file.name || '').match(/\.([a-z0-9]{1,5})$/i) || [, '—'])[1].toLowerCase();
      dlog('════ استلام ملف', `النوع ${file.type || '(فارغ)'} · الامتداد .${ext} · الحجم ${(file.size / 1024 / 1024).toFixed(2)} م.ب · PDF=${isPdf}`);
      onStatus('تجهيز الصورة…');
      dstage(isPdf ? 'فكّ ملف PDF' : 'فكّ الصورة');
      pages = isPdf ? await pdfToCanvases(file) : [await imageToCanvas(file)];
      dstageEnd(isPdf ? 'فكّ ملف PDF' : 'فكّ الصورة', `صفحات ${pages.length}`);
      const allLines = [];
      let removed = 0, cancelled = false;
      for (let i = 0; i < pages.length; i++) {
        const label = pages.length > 1 ? `صفحة ${i + 1} من ${pages.length}` : '';
        dclearInflight();   // انتظارُ المعلمةِ في النافذةِ ليس مرحلةً ثقيلة
        dlog('نافذة القص ظهرت');
        const choice = await cropDialog(pages[i], label);
        dlog('اختيار المعلمة', choice.mode === 'crop' && choice.rect ? `تظليل ${choice.rect.w}×${choice.rect.h}` : choice.mode);
        if (choice.mode === 'cancel') { choice.ui.close(); cancelled = true; break; }
        if (choice.mode === 'skip') { choice.ui.close(); continue; }
        choice.ui.busy(true);
        statusCb = (t, p) => { choice.ui.status(t, p); onStatus(t, p); };
        try {
          const res = await readPage(pages[i], choice.mode === 'crop' ? choice.rect : null);
          removed += res.removed;
          allLines.push(...res.names);
        } finally {
          statusCb = null; choice.ui.close();
          scheduleIdle();
        }
      }
      if (cancelled && !allLines.length) { dclearInflight(); return { names: [], removed: 0, cancelled: true }; }
      // إزالةُ التكرارِ المتتالي بين الصفحات
      const names = allLines.filter((n, i) => n !== allLines[i - 1]);
      dclearInflight();
      dlog('════ انتهت القراءة بنجاح', `عدد الأسماء: ${names.length}`);
      return { names, removed, cancelled };
    } catch (e) {
      derr('القراءة', e); dclearInflight();
      throw e;
    } finally {
      pages.forEach(wipe); pages = null;   // لا يبقى من الصورةِ شيءٌ في الذاكرة
    }
  }

  /* ─────────────── Excel / CSV / نص — محليًّا ─────────────── */
  async function readSheet(file) {
    const nm = (file.name || '').toLowerCase();
    let rows = [];
    if (/\.(xlsx|xls|xlsm|ods)$/.test(nm)) {
      await loadScript(BASE + 'xlsx/xlsx.full.min.js');
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    } else {
      const text = await file.text();
      rows = text.split(/\r?\n/).map((l) => l.split(/[,;\t]/));
    }
    // عمودُ الأسماء = العمودُ الذي فيه أكثرُ خلايا نصيّةٍ عربيةٍ من كلمتَيْنِ فأكثر
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    let best = 0, bestScore = -1;
    for (let c = 0; c < width; c++) {
      let score = 0;
      for (const r of rows) {
        const v = String(r[c] == null ? '' : r[c]).trim();
        if (/[ء-ي]/.test(v) && v.split(/\s+/).length >= 2 && !/\d{3,}/.test(toLatinDigits(v))) score++;
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const lines = rows.map((r) => String(r[best] == null ? '' : r[best]));
    return cleanNames(lines);
  }

  // الإصدار: للتحقّقِ من أيِّ نسخةٍ يُشغِّلُها جهازُ المعلمة (الدعمُ الفنيّ واختبارُ الكاش)
  window.GhirasOCR = { readNames, readSheet, cleanNames, base: BASE, version: '2026-09-21.7-diag' };
  // منفذُ اختبارٍ لا يُفعَّلُ إلا إن طلبته صفحةُ الاختبارِ صراحةً قبل التحميل
  if (window.__GHIRAS_OCR_TEST) window.GhirasOCR._t = { prepare, recognizeLines, pickNames, cleanLine, splitAl, getWorker, imageToCanvas, skewAngle, readPage };
})();
