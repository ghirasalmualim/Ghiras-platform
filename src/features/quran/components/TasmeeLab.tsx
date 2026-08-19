'use client';

import { useRef, useState } from 'react';
import type { Ayah } from '../types';
import {
  alignRecitation,
  buildExpected,
  tokensFromText,
  type AlignmentResult,
} from '../engine/alignment';
import { Recorder, CaptureFailure, type CaptureResult } from '../capture/recorder';

/**
 * مختبر التسميع — أداة قياس، ليست شاشة للطالبات.
 *
 * ⚠️ عمدًا غير مصقولة: تعرض الأرقام الخام كما هي — ردّ المزوّد،
 * والكلمات بعد المهايئ، وحكم المحرّك. غرضها أن نرى ما يجري لا أن
 * يستعملها أحد. وشاشة «سمّع لي» الحقيقية تُبنى في خطوة مستقلة بعد
 * أن نعرف إن كان المزوّد يصلح أصلًا.
 *
 * ═══ وضعان ═══
 * **نصّ** — نكتب ما «سمعه» المزوّد فنقيس المحرّك وحده. يعمل بلا
 *   مفتاح ولا إنترنت ولا فاتورة، ومنه نتحقق من كل قواعد الحكم.
 * **صوت** — تسجيل حقيقي يمرّ بالمزوّد. يحتاج مفتاحًا في بيئة الخادم.
 *
 * ⚠️ الصوت لا يُحفظ: يُسجَّل في الذاكرة، يُرسل، تُعرض النتيجة، ثم
 * يُفلَت. ولا يُرسل معه اسم ولا معرّف.
 */

const LOW_RMS = 0.01;
const CLIPPING_PEAK = 0.99;

export default function TasmeeLab({ ayahs, surahName }: { ayahs: Ayah[]; surahName: string }) {
  const expected = buildExpected(ayahs);
  const reference = expected.map((w) => w.uthmani).join(' ');

  const [tab, setTab] = useState<'text' | 'audio'>('text');
  const [typed, setTyped] = useState(reference);
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [server, setServer] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [recording, setRecording] = useState(false);

  const recorder = useRef<Recorder | null>(null);

  function runText() {
    setServer(null);
    setNote(null);
    setResult(alignRecitation(expected, tokensFromText(typed)));
  }

  async function startRec() {
    setNote(null);
    setResult(null);
    setServer(null);
    setCapture(null);
    try {
      const r = new Recorder();
      // ‏.start داخل معالج اللمسة مباشرة — شرط iOS
      await r.start();
      recorder.current = r;
      setRecording(true);
    } catch (e) {
      setNote(captureMessage(e));
    }
  }

  async function stopRec() {
    const r = recorder.current;
    if (!r) return;
    setRecording(false);
    setBusy(true);
    try {
      const cap = await r.stop();
      recorder.current = null;
      setCapture(cap);

      if (cap.durationSec < 1) {
        setNote('التسجيل قصير جدًا — أقل من ثانية.');
        return;
      }
      if (cap.rms < LOW_RMS) {
        setNote(`الصوت ضعيف جدًا (RMS ${cap.rms.toFixed(4)}) — قرّبي الميكروفون.`);
        return;
      }

      const first = expected[0];
      const last = expected[expected.length - 1];
      const res = await fetch(
        `/api/quran/tasmee?surah=${first.surah}&from=${first.ayah}&to=${last.ayah}`,
        { method: 'POST', body: cap.wav, headers: { 'Content-Type': 'application/octet-stream' } }
      );
      const json = await res.json();
      setServer(json);
      if (!res.ok) setNote(`المزوّد لم يستجب: ${json.error ?? res.status}`);
    } catch (e) {
      setNote(captureMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div className="rounded-xl border border-[var(--q-line)] bg-[var(--q-card)] p-4">
        <p className="mb-1 text-[0.8rem] font-bold text-[var(--q-mute)]">النص المتوقَّع</p>
        <p className="font-[family-name:var(--font-amiri)] text-lg leading-loose text-[var(--q-ink)]">
          {reference}
        </p>
        <p className="mt-2 text-[0.75rem] text-[var(--q-mute)]">
          {surahName} · {expected.length} كلمة · من الآية {expected[0].ayah} إلى{' '}
          {expected[expected.length - 1].ayah}
        </p>
      </div>

      <div className="inline-flex w-fit rounded-xl border border-[var(--q-line)] bg-[var(--q-card)] p-1">
        {(['text', 'audio'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setTab(m)}
            className={`tap rounded-lg px-4 py-2 text-[0.84rem] font-bold ${
              tab === m ? 'bg-[var(--q-accent)] text-white' : 'text-[var(--q-mute)]'
            }`}
          >
            {m === 'text' ? 'نصّ (بلا مزوّد)' : 'صوت (يحتاج مفتاحًا)'}
          </button>
        ))}
      </div>

      {tab === 'text' ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            rows={4}
            dir="rtl"
            className="w-full rounded-xl border border-[var(--q-line)] bg-[var(--q-bg)] p-3 font-[family-name:var(--font-amiri)] text-lg leading-loose text-[var(--q-ink)] outline-none focus:border-[var(--q-accent)]"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runText} className="tap rounded-xl bg-[var(--q-accent)] px-5 py-2 text-sm font-bold text-white">
              شغّل المحاذاة
            </button>
            <button type="button" onClick={() => setTyped(reference)} className="tap rounded-xl border border-[var(--q-line)] px-4 py-2 text-sm">
              أعِد النص الصحيح
            </button>
          </div>
          <p className="text-[0.78rem] text-[var(--q-mute)]">
            احذفي كلمة أو بدّليها أو كرّريها أو امسحي آية كاملة — ثم شغّلي وشوفي حكم المحرّك.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={recording ? stopRec : startRec}
            disabled={busy}
            className={`tap rounded-xl px-6 py-4 text-base font-bold text-white disabled:opacity-50 ${
              recording ? 'bg-red-600' : 'bg-[var(--q-accent)]'
            }`}
          >
            {busy ? 'جارٍ التحليل…' : recording ? '⏹ أوقفي التسجيل' : '🎙️ ابدئي التسجيل'}
          </button>
          {capture && (
            <p className="text-[0.78rem] text-[var(--q-mute)]">
              {capture.durationSec.toFixed(1)} ثانية · RMS {capture.rms.toFixed(4)} · أعلى سعة{' '}
              {capture.peak.toFixed(3)}
              {capture.peak >= CLIPPING_PEAK ? ' ⚠️ الصوت مقصوص — ابعدي الميكروفون' : ''} · معدّل
              الجهاز {capture.deviceSampleRate} هرتز
            </p>
          )}
        </div>
      )}

      {note && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[0.85rem] text-amber-900">
          {note}
        </p>
      )}

      {result && <Verdict result={result} />}

      {server !== null && (
        <details open className="rounded-xl border border-[var(--q-line)] bg-[var(--q-card)] p-3">
          <summary className="cursor-pointer text-[0.84rem] font-bold">ردّ الخادم الخام</summary>
          <pre dir="ltr" className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap break-all text-[0.7rem] leading-relaxed">
            {JSON.stringify(server, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function Verdict({ result }: { result: AlignmentResult }) {
  const s = result.summary;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="أخطاء مؤكَّدة" value={s.confirmedErrors} tone={s.confirmedErrors ? 'bad' : 'good'} />
        <Stat label="لم أتأكد" value={s.uncertain} tone="warn" />
        <Stat label="تغطية" value={`${Math.round(s.coverage * 100)}٪`} tone="good" />
        <Stat label="صالحة للحكم" value={result.usable ? 'نعم' : 'لا'} tone={result.usable ? 'good' : 'warn'} />
      </div>

      {!result.usable && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[0.85rem] text-amber-900">
          ⚠️ غير صالحة للحكم ({result.unusableReason}) — لا يُعرض خطأ ولا يُخصم إتقان.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--q-line)]">
        <table className="w-full text-right text-[0.8rem]">
          <thead className="bg-[var(--q-card)]">
            <tr>
              <th className="p-2">التصنيف</th>
              <th className="p-2">المتوقَّع</th>
              <th className="p-2">المسموع</th>
              <th className="p-2">تشابه</th>
              <th className="p-2">ثقة</th>
              <th className="p-2">السبب</th>
            </tr>
          </thead>
          <tbody>
            {result.entries
              .filter((e) => e.kind !== 'MATCH')
              .map((e, i) => (
                <tr key={i} className="border-t border-[var(--q-line)]">
                  <td className="p-2 font-bold">{e.kind}</td>
                  <td className="p-2 font-[family-name:var(--font-amiri)]">
                    {e.expected.map((w) => w.uthmani).join(' ') || '—'}
                  </td>
                  <td className="p-2 font-[family-name:var(--font-amiri)]">
                    {e.heard.map((h) => h.text).join(' ') || '—'}
                  </td>
                  <td className="p-2">{e.similarity !== undefined ? e.similarity.toFixed(2) : '—'}</td>
                  <td className="p-2">{e.confidence !== undefined ? e.confidence.toFixed(2) : '—'}</td>
                  <td className="p-2 text-[var(--q-mute)]">{e.reason ?? '—'}</td>
                </tr>
              ))}
            {result.entries.every((e) => e.kind === 'MATCH') && (
              <tr>
                <td colSpan={6} className="p-3 text-center text-[var(--q-mute)]">
                  ولا ملاحظة — القراءة مطابقة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[0.78rem] text-[var(--q-mute)]">
        مواضع تحتاج تثبيتًا:{' '}
        {result.weakSpots.length
          ? result.weakSpots.map((w) => `${w.surah}:${w.ayah}${w.atTransition ? ' (انتقال)' : ''}`).join('، ')
          : 'لا شيء'}
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: 'good' | 'bad' | 'warn' }) {
  const colors =
    tone === 'bad'
      ? 'border-red-300 bg-red-50 text-red-900'
      : tone === 'warn'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : 'border-[var(--q-line)] bg-[var(--q-card)] text-[var(--q-ink)]';
  return (
    <div className={`rounded-xl border p-3 text-center ${colors}`}>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-[0.72rem]">{label}</p>
    </div>
  );
}

function captureMessage(e: unknown): string {
  if (e instanceof CaptureFailure) {
    switch (e.code) {
      case 'PERMISSION_DENIED':
        return 'إذن الميكروفون مرفوض — اسمحي به من إعدادات المتصفح.';
      case 'NO_MICROPHONE':
        return 'ما لقينا ميكروفونًا على هذا الجهاز.';
      case 'NOT_SUPPORTED':
        return 'هذا المتصفح لا يدعم التقاط الصوت.';
      default:
        return 'انقطع التسجيل.';
    }
  }
  return 'صار خلل غير متوقع — جرّبي مرة ثانية.';
}
