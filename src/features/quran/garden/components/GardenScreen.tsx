'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Plant from './Plant';
import GardenScene from './GardenScene';
import {
  DROP_LABELS,
  PLANT_TYPES,
  REWARD_LABELS,
  type PlantTypeKey,
  type RewardKey,
} from '../types';
import type { GardenPlantView, GardenState } from '../state';
import { SPOTS } from './GardenScene';

/**
 * «حديقتي» — رحلة المستخدم مع القرآن، مرئيّةً.
 *
 * ═══ لماذا لا يُزرع له شيء تلقائيًا ═══
 * أول ما يدخل لا يجد شجرةً جاهزة. يختار بذرته بيده، ويختار موضعها،
 * ويضغط «ازرع». والفرق ليس تجميلًا: ما نزرعه نحن له، وما يزرعه هو
 * له. والحديقة إن لم تكن حديقته لم يرجع إليها.
 *
 * ═══ ما لا يظهر هنا أبدًا ═══
 * ⚠️ لا «٤ من ٦» ولا شريط تقدّم ولا نسبة. يرى نبتته أكبر مما كانت،
 * وهذا كل ما يحتاج. والرقم يحوّل النمو إلى عدّاد.
 *
 * ⚠️ ولا اسم طفلٍ آخر ولا ترتيب ولا مقارنة. تجربةٌ شخصية تمامًا.
 *
 * ⚠️ ولا عقاب على الغياب: لا ذبول ولا «أهملت حديقتك». من غاب شهرًا
 * وجد نبتته كما تركها، ووجد ترحيبًا لا عتابًا.
 */

type Phase = 'loading' | 'welcome' | 'seed' | 'slot' | 'planting' | 'garden' | 'celebrate';

/** زمن نزول القطرة — تُقاس منه بقيّةُ الانتظار لا يُضاف إليها. */
const POUR_MS = 500;

/**
 * أهو نهارٌ أم ليل؟ من ساعة الجهاز.
 *
 * ⚠️ من ساعته هو لا من ساعتنا: من يفتح حديقته ليلًا يجدها ليلًا أينما
 * كان. ولا نسأل عن موقعه ولا نخزّن منه شيئًا — الساعة عنده وكفى.
 */
function isNight(): boolean {
  const h = new Date().getHours();
  return h < 6 || h >= 18;
}
/** زمن نزول البذرة في التربة. */
const SOW_MS = 1100;

type WaterResult = {
  state: GardenState;
  completed: boolean;
  firstEver: boolean;
  unlocked: string[];
};

export default function GardenScreen() {
  const [state, setState] = useState<GardenState | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [seed, setSeed] = useState<PlantTypeKey | null>(null);
  /**
   * ⚠️ المكان المختار يعيش هنا لا داخل شاشة الاختيار.
   *
   * كشفته التجربة: تعثّر الطلب فرجعنا إلى الشاشة، فأُعيد بناؤها
   * وضاع اختياره — فيُطالَب باختيار المكان من جديد بسبب خللٍ ليس
   * منه. وما اختاره المستخدم لا يُمحى لأن الشبكة تعثّرت.
   */
  const [slot, setSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /**
   * ⚠️ لا يكفي أن نقول «يحتاج تسجيل دخول».
   *
   * كشفته صاحبة المنصة أول ما فتحتها: قرأت الجملة ولم تجد بابًا،
   * فسألت «شلون وما حاط لي تسجيل دخول؟». ورسالةٌ تصف عائقًا ولا
   * تدلّ على مخرجه تترك القارئ أسوأ مما كان — فالزرّ جزء من
   * الرسالة لا زينةٌ بعدها.
   */
  const [signedOut, setSignedOut] = useState(false);
  const [pouring, setPouring] = useState(false);
  const [celebration, setCelebration] = useState<WaterResult | null>(null);
  /** ⚠️ يُحسب بعد التركيب لا قبله — الخادم لا يعرف ساعة الجهاز. */
  const [night, setNight] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quran/garden');
      if (!res.ok) {
        setSignedOut(res.status === 401);
        setNote(res.status === 401 ? null : 'ما قدرنا نوصل لحديقتك — جرّب مرة ثانية.');
        setPhase('welcome');
        return;
      }
      setSignedOut(false);
      const s = (await res.json()) as GardenState;
      setState(s);
      setPhase(s.started ? 'garden' : 'welcome');
    } catch {
      setNote('ما قدرنا نوصل لحديقتك — جرّب مرة ثانية.');
      setPhase('welcome');
    }
  }, []);

  useEffect(() => {
    setNight(isNight());
    void load();
  }, [load]);

  async function plant() {
    if (!seed || slot === null || busy) return;
    setBusy(true);
    setNote(null);
    setPhase('planting');
    const startedAt = Date.now();
    try {
      const res = await fetch('/api/quran/garden/plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: seed, slot }),
      });
      const body = await res.json();
      if (!res.ok) {
        // ⚠️ «ما انزرعت» تُقال لمن حاول وفشل، لا لمن لم يدخل أصلًا
        setNote(
          res.status === 401
            ? 'التسميع والحديقة يحتاجان تسجيل دخول 🌿 والقراءة والاستماع مفتوحة للجميع.'
            : (body.message ?? 'ما انزرعت — جرّب مرة ثانية.')
        );
        setPhase('slot');
        return;
      }
      // ⚠️ وكذلك الزراعة: الحركة تجري مع الطلب لا بعده
      const left = SOW_MS - (Date.now() - startedAt);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      setState(body as GardenState);
      setPhase('garden');
    } catch {
      setNote('انقطع الاتصال — جرّب مرة ثانية.');
      setPhase('slot');
    } finally {
      setBusy(false);
    }
  }

  async function water() {
    if (busy || !state?.held.length) return;
    setBusy(true);
    setNote(null);
    setPouring(true);
    const startedAt = Date.now();
    try {
      const res = await fetch('/api/quran/garden/water', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setNote(
          res.status === 401
            ? 'انتهت جلستك — سجّل دخولك من جديد 🌿'
            : body.error === 'NO_WATER'
              ? 'ما عندك قطرات الحين. أكمل تسميعًا وترجع لك قطرة 🌿'
              : 'ما انسقت — جرّب مرة ثانية.'
        );
        return;
      }
      const result = (await res.json()) as WaterResult;
      /**
       * ⚠️ القطرة تنزل **أثناء** الطلب لا بعده.
       *
       * كان الانتظار يُضاف إلى زمن الشبكة فيتراكمان، فتثقل السقية
       * الواحدة ويشكو المستعمل من بطء. والآن يبدأ النزول مع الضغطة،
       * وإن سبق الردُّ الحركةَ انتظرناها وحدها لا الاثنتين.
       */
      const left = POUR_MS - (Date.now() - startedAt);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      setState(result.state);
      if (result.completed) {
        setCelebration(result);
        setPhase('celebrate');
      } else if (result.unlocked.length) {
        setNote(`✨ صار عندك ${REWARD_LABELS[result.unlocked[0] as keyof typeof REWARD_LABELS]}`);
      }
    } catch {
      setNote('انقطع الاتصال — جرّب مرة ثانية.');
    } finally {
      setPouring(false);
      setBusy(false);
    }
  }

  // ═══════════════════ العرض ═══════════════════

  if (phase === 'loading')
    return <div className="g-card p-10 text-center text-[var(--q-mute)]">لحظة…</div>;

  return (
    <div className="flex flex-col gap-5">
      {note && (
        <p className="rounded-2xl border border-[var(--q-line)] bg-[var(--q-accent-soft)] p-4 text-center text-[0.9rem] text-[var(--q-ink)]">
          {note}
        </p>
      )}

      {phase === 'welcome' && (
        <Welcome onStart={() => setPhase('seed')} started={state?.started} signedOut={signedOut} />
      )}

      {phase === 'seed' && (
        <SeedChoice
          chosen={seed}
          onChoose={(k) => {
            setSeed(k);
            setPhase('slot');
          }}
        />
      )}

      {phase === 'slot' && seed && (
        <SlotChoice
          picked={slot}
          onPick={setSlot}
          planted={[...(state?.completed ?? []), ...(state?.current ? [state.current] : [])]}
          rewards={state?.rewards ?? []}
          night={night}
          onBack={() => setPhase('seed')}
          onPlant={() => void plant()}
          busy={busy}
        />
      )}

      {phase === 'planting' && seed && (
        <div className="g-card flex flex-col items-center gap-3 p-10">
          <div className="g-sowing w-40">
            <Plant type={seed} stage={0} progress={0} />
          </div>
          <p className="text-[0.95rem] font-bold text-[var(--q-ink)]">نزرعها…</p>
        </div>
      )}

      {phase === 'garden' && state && (
        <Garden
          state={state}
          night={night}
          pouring={pouring}
          busy={busy}
          onWater={() => void water()}
          onNew={() => setPhase('seed')}
        />
      )}

      {phase === 'celebrate' && celebration && (
        <Celebrate
          first={celebration.firstEver}
          plant={celebration.state.completed[celebration.state.completed.length - 1] ?? null}
          unlocked={celebration.unlocked}
          onNext={() => {
            setSeed(null);
            setCelebration(null);
            setPhase('seed');
          }}
        />
      )}
    </div>
  );
}

// ── الترحيب ────────────────────────────────────────────────

function Welcome({
  onStart,
  started,
  signedOut,
}: {
  onStart: () => void;
  started?: boolean;
  signedOut?: boolean;
}) {
  return (
    <div className="g-card flex flex-col items-center gap-4 p-8 text-center">
      <div className="w-28 opacity-70">
        <Plant type="herb" stage={2} progress={0.5} />
      </div>
      <h2 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
        {started ? 'نوّرت حديقتك 🌿' : 'ابدأ رحلتك 🌱'}
      </h2>
      <p className="max-w-sm text-[0.92rem] leading-relaxed text-[var(--q-mute)]">
        كل حفظٍ ومراجعة خطوة تنمو معها حديقتك 🌿
      </p>

      {signedOut ? (
        <>
          <Link
            href="/login?next=/quran/garden"
            className="tap mt-2 rounded-2xl bg-[var(--q-accent)] px-8 py-3.5 text-base font-extrabold text-white"
          >
            سجّل دخولك
          </Link>
          {/* ⚠️ ويُقال ما يبقى مفتوحًا بلا حساب، فلا يُفهم الباب سورًا */}
          <p className="text-[0.8rem] text-[var(--q-mute)]">
            القراءة والاستماع مفتوحة للجميع بدون حساب
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="tap mt-2 rounded-2xl bg-[var(--q-accent)] px-8 py-3.5 text-base font-extrabold text-white"
        >
          اختر بذرتك
        </button>
      )}
    </div>
  );
}

// ── اختيار البذرة ──────────────────────────────────────────

function SeedChoice({
  chosen,
  onChoose,
}: {
  chosen: PlantTypeKey | null;
  onChoose: (k: PlantTypeKey) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
          اختر بذرتك
        </h2>
        {/* ⚠️ يُقال صراحةً: لا بذرة أفضل من بذرة. وسكوتُنا يجعله يبحث عن الأفضل. */}
        <p className="mt-1 text-[0.84rem] text-[var(--q-mute)]">
          كلها تنمو بنفس الطريقة — اختر اللي يعجبك
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PLANT_TYPES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChoose(p.key)}
            className={`tap g-card flex flex-col items-center gap-1 p-4 transition-transform active:scale-[0.97] ${
              chosen === p.key ? 'ring-2 ring-[var(--q-accent)]' : ''
            }`}
          >
            <div className="w-20">
              <Plant type={p.key} stage={6} progress={1} />
            </div>
            <span className="text-[0.9rem] font-extrabold text-[var(--q-ink)]">{p.nameAr}</span>
            <span className="text-[0.74rem] text-[var(--q-mute)]">{p.hintAr}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── اختيار المكان ──────────────────────────────────────────

function SlotChoice({
  picked,
  onPick,
  planted,
  rewards,
  night,
  onBack,
  onPlant,
  busy,
}: {
  picked: number | null;
  onPick: (slot: number) => void;
  planted: GardenPlantView[];
  rewards: RewardKey[];
  night: boolean;
  onBack: () => void;
  onPlant: () => void;
  busy: boolean;
}) {
  const full = planted.length >= SPOTS.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="font-[family-name:var(--font-cairo)] text-xl font-extrabold text-[var(--q-ink)]">
          وين تحب تزرع بذرتك؟
        </h2>
        <button
          type="button"
          onClick={onBack}
          className="tap mt-1 text-[0.82rem] font-bold text-[var(--q-mute)] underline"
        >
          أو غيّر البذرة
        </button>
      </div>

      {/* ⚠️ يختار موضعه في الحديقة نفسها لا في جدولٍ بجانبها */}
      <div className="g-card overflow-hidden">
        <GardenScene
          plants={planted}
          rewards={rewards}
          night={night}
          mode="pick"
          picked={picked}
          onPick={onPick}
        />
      </div>

      {full && (
        <p className="text-center text-[0.85rem] text-[var(--q-mute)]">
          امتلأت حديقتك بالنباتات — وهذا إنجاز بحد ذاته 🌿
        </p>
      )}

      <button
        type="button"
        disabled={picked === null || busy}
        onClick={onPlant}
        className="tap rounded-2xl bg-[var(--q-accent)] px-6 py-4 text-base font-extrabold text-white disabled:opacity-40"
      >
        🌱 ازرع بذرتي
      </button>
    </div>
  );
}

// ── الحديقة ────────────────────────────────────────────────

function Garden({
  state,
  night,
  pouring,
  busy,
  onWater,
  onNew,
}: {
  state: GardenState;
  night: boolean;
  pouring: boolean;
  busy: boolean;
  onWater: () => void;
  onNew: () => void;
}) {
  const drops = state.held.length;
  const all = [...state.completed, ...(state.current ? [state.current] : [])];

  return (
    <div className="flex flex-col gap-4">
      {/* المشهد أولًا — هو الحديقة، وما تحته أدواتُ العناية بها */}
      <div className="g-card relative overflow-hidden">
        {pouring && <span className="g-drop" aria-hidden />}
        <GardenScene
          plants={all}
          rewards={state.rewards}
          night={night}
          highlightSlot={state.current?.slot ?? null}
        />
      </div>

      {state.current ? (
        <div className="flex flex-col items-center gap-2">
          {drops > 0 ? (
            <>
              <p className="text-center text-[0.9rem] font-bold text-[var(--q-ink)]">
                {DROP_LABELS[state.held[0].reason]} — عندك قطرة جاهزة 💧
              </p>
              <button
                type="button"
                onClick={onWater}
                disabled={busy}
                className="tap rounded-2xl bg-[var(--q-accent)] px-8 py-3.5 text-base font-extrabold text-white disabled:opacity-40"
              >
                💧 اسقِ نبتتي
              </button>
              {drops > 1 && (
                <p className="text-[0.78rem] text-[var(--q-mute)]">
                  وعندك {drops} قطرات محفوظة
                </p>
              )}
            </>
          ) : (
            /* ⚠️ لا لومَ ولا «أهملت»: نقول ما الخطوة القادمة ونسكت */
            <p className="max-w-xs text-center text-[0.88rem] leading-relaxed text-[var(--q-mute)]">
              نبتتك تنتظر سقيتها. أكمل تسميعًا أو مراجعة وترجع لك قطرة 🌿
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[0.95rem] font-bold text-[var(--q-ink)]">
            ما عندك نبتة تنمو الحين
          </p>
          <button
            type="button"
            onClick={onNew}
            className="tap rounded-2xl bg-[var(--q-accent)] px-7 py-3 text-base font-extrabold text-white"
          >
            🌱 اختر بذرة جديدة
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-[0.82rem] text-[var(--q-mute)]">
        {state.completed.length > 0 && (
          <span>
            {state.completed.length}{' '}
            {state.completed.length === 1 ? 'غرسة اكتملت' : 'غرسات اكتملت'} 🌿
          </span>
        )}
        {/* ⚠️ «أيام اعتنيت» لا سلسلةٌ مهدَّدة بالانهيار */}
        {state.careDays > 0 && (
          <span>
            اعتنيت بحديقتك في {state.careDays} {state.careDays === 1 ? 'يوم' : 'أيام'}
          </span>
        )}
      </div>

      {state.rewards.length > 0 && (
        <p className="text-center text-[0.78rem] text-[var(--q-mute)]">
          {/* ⚠️ تُسمّى ليعرف أين يبحث عنها في حديقته — لا لتقوم مقامها */}
          في حديقتك الآن: {state.rewards.map((r) => REWARD_LABELS[r]).join(' · ')}
        </p>
      )}
    </div>
  );
}

/**
 * لحظة الاكتمال.
 *
 * ⚠️ كانت نصًّا وزرًّا فحسب، فمرّت بلا أن تُرى — لم تذكرها صاحبة
 * المنصة بعد أن مرّت بها. واللحظة التي لا تُذكَر لم تقع.
 *
 * فصارت النبتة نفسها هي البطل: تظهر كبيرةً بحركةٍ هادئة، ثم يأتي
 * النصّ بعدها. ⚠️ ولا تناثرَ ولا أبواقَ ولا وميض — الفرح ههنا سكينةٌ
 * لا صخب، وهي حديقةٌ لا لعبة.
 */
function Celebrate({
  first,
  plant,
  unlocked,
  onNext,
}: {
  first: boolean;
  plant: GardenPlantView | null;
  unlocked: string[];
  onNext: () => void;
}) {
  return (
    <div className="g-card relative overflow-hidden flex flex-col items-center gap-3 p-8 text-center">
      <Confetti />
      {plant && (
        <div className="g-bloom w-40 sm:w-48">
          <Plant type={plant.type} stage={6} progress={1} />
        </div>
      )}

      <h2 className="font-[family-name:var(--font-cairo)] text-2xl font-extrabold text-[var(--q-ink)]">
        {first ? '🌿 أول غرسة اكتملت' : '🌿 اكتملت نبتتك'}
      </h2>
      <p className="max-w-sm text-[0.95rem] leading-relaxed text-[var(--q-ink)]">
        {first
          ? 'هذه بداية حديقتك… وكل خطوة قادمة ستضيف لها شيئًا جديدًا.'
          : 'انتقلت إلى حديقتك، وتبقى فيها.'}
      </p>
      {unlocked.length > 0 && (
        <p className="text-[0.86rem] font-bold text-[var(--q-accent)]">
          ✨ وصار عندك {REWARD_LABELS[unlocked[0] as keyof typeof REWARD_LABELS]}
        </p>
      )}
      <button
        type="button"
        onClick={onNext}
        className="tap mt-3 rounded-2xl bg-[var(--q-accent)] px-8 py-3.5 text-base font-extrabold text-white"
      >
        🌱 اختر بذرتي التالية
      </button>
    </div>
  );
}

/**
 * قصاصات ونجوم — احتفالٌ يُرى ولا يزعج.
 *
 * ⚠️ **حتميّ لا عشوائي**: المواضع والألوان مكتوبة، فالمشهد نفسه في كل
 * اكتمال. والعشوائية هنا لا تضيف بهجةً وتُدخل سلوكًا لا يُختبَر.
 *
 * ⚠️ وينتهي بنفسه في ثانيتين ثم يزول. احتفالٌ يدوم يصير ضجيجًا.
 *
 * ⚠️ ومن أطفأ الحركة لا يرى منه شيئًا — لا قصاصةً واقفة في مكانها.
 */
const CONFETTI = [
  { x: 8,  d: 0,    c: 'var(--q-accent)', r: -18, s: 1 },
  { x: 18, d: 0.14, c: 'var(--q-gold)',   r: 24,  s: 0.8 },
  { x: 27, d: 0.05, c: '#c4607a',         r: -40, s: 1.1 },
  { x: 36, d: 0.22, c: 'var(--q-accent)', r: 12,  s: 0.9 },
  { x: 45, d: 0.09, c: 'var(--q-gold)',   r: -28, s: 1 },
  { x: 55, d: 0.3,  c: '#7fb3d5',         r: 34,  s: 0.85 },
  { x: 64, d: 0.02, c: 'var(--q-accent)', r: -12, s: 1.05 },
  { x: 73, d: 0.19, c: '#c4607a',         r: 40,  s: 0.9 },
  { x: 82, d: 0.11, c: 'var(--q-gold)',   r: -22, s: 1 },
  { x: 91, d: 0.26, c: 'var(--q-accent)', r: 18,  s: 0.8 },
];

const STARS = [
  { x: 14, y: 16, d: 0.25 },
  { x: 32, y: 8,  d: 0.55 },
  { x: 52, y: 20, d: 0.1 },
  { x: 71, y: 10, d: 0.42 },
  { x: 88, y: 22, d: 0.68 },
];

function Confetti() {
  return (
    <span className="g-party" aria-hidden>
      {CONFETTI.map((p, i) => (
        <i
          key={`c${i}`}
          className="g-conf"
          style={
            {
              left: `${p.x}%`,
              background: p.c,
              animationDelay: `${p.d}s`,
              ['--r' as string]: `${p.r}deg`,
              ['--s' as string]: p.s,
            } as React.CSSProperties
          }
        />
      ))}
      {STARS.map((t, i) => (
        <i
          key={`s${i}`}
          className="g-star"
          style={{ left: `${t.x}%`, top: `${t.y}%`, animationDelay: `${t.d}s` }}
        />
      ))}
    </span>
  );
}

export function GardenNav() {
  return (
    <Link href="/quran" className="tap text-sm font-bold text-[var(--q-mute)]">
      <span aria-hidden>→</span> القرآن الكريم
    </Link>
  );
}
