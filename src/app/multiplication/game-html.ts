// اللعبة مضمّنة كنص محمي — تُقدَّم فقط للمشتركات عبر /multiplication (route.ts)
/* eslint-disable */
export const MULT_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>غراس · جدول الضرب التفاعلي</title>
<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#1e3a52; --muted:#7b96ab; --line:#ecdcc6;
  --brand:#ef8b3c; --brand-l:#ffab4d; --brand-d:#c9600f;
  --teal:#159c9c; --green:#2fa060; --red:#e0574f; --purple:#8e6bd1; --gold:#e3a119;
  --cell: clamp(28px, min(7.2vw, 5.8vh), 58px);
  --gap: clamp(2px,.45vw,4px);
  --r: 18px;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{height:100%}
body{
  min-height:100%;
  font-family:'Baloo Bhaijaan 2','Tajawal',system-ui,sans-serif;
  background:radial-gradient(140% 110% at 50% 0%,#fff7ea 0%,#ffeacd 42%,#ffdfd4 100%);
  background-attachment:fixed;
  color:var(--ink);
  display:flex;flex-direction:column;align-items:center;
  padding:clamp(8px,1.5vh,16px);gap:clamp(8px,1.4vh,14px);
}
button{font:inherit;cursor:pointer;border:none;background:none;color:inherit}

/* ═══════ الرأس ═══════ */
header{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}
.brandline{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center}
.brand{font-weight:800;font-size:clamp(16px,2.4vw,24px)}
.brand span{color:var(--brand)}
.tabs{display:flex;background:#fff;border-radius:999px;padding:4px;gap:2px;
  box-shadow:0 4px 16px rgba(160,110,60,.16);flex-wrap:wrap;justify-content:center}
.tab{font-weight:700;color:var(--muted);padding:7px 15px;border-radius:999px;
  font-size:clamp(12px,1.8vw,16px);transition:.2s;white-space:nowrap}
.tab.on{background:linear-gradient(180deg,var(--brand-l),var(--brand));color:#fff;
  box-shadow:0 3px 10px rgba(239,139,60,.42)}
.tools{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.chip{border:1.5px solid var(--line);background:#fffdf8;border-radius:999px;font-weight:700;
  padding:5px 13px;font-size:clamp(11px,1.6vw,14px);transition:.16s;white-space:nowrap}
.chip:hover{border-color:var(--brand);color:var(--brand-d)}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.chip.sm{padding:4px 11px;font-size:clamp(11px,1.5vw,13px)}

/* ═══════ العروض ═══════ */
.view{display:none;flex-direction:column;align-items:center;gap:clamp(8px,1.4vh,14px);width:100%;flex:1}
.view.on{display:flex}
#v-practice,#v-race,#v-duel{justify-content:center}
.card{background:#fff;border-radius:var(--r);box-shadow:0 8px 26px rgba(160,110,60,.16)}

/* ═══════ لوحة المعادلة ═══════ */
#panel{display:flex;align-items:center;gap:clamp(10px,2vw,26px);
  padding:clamp(8px,1.2vh,14px) clamp(14px,3vw,28px);
  min-height:clamp(54px,8.5vh,88px);width:min(100%,880px);justify-content:center}
#eq{font-size:clamp(19px,4.2vw,38px);font-weight:800;white-space:nowrap}
#eq b{color:var(--brand)} #eq i{font-style:normal;color:var(--teal)}
#eq u{text-decoration:none;background:linear-gradient(180deg,transparent 62%,#ffe0a8 62%)}
#hint{font-size:clamp(11px,1.8vw,15px);color:var(--muted);font-weight:600;line-height:1.5}
#dots{display:grid;gap:clamp(2px,.4vw,4px);align-content:center}
#dots i{width:clamp(4px,.8vw,7px);height:clamp(4px,.8vw,7px);border-radius:50%;
  background:var(--teal);opacity:.85;animation:pin .3s backwards}
@keyframes pin{from{transform:scale(0);opacity:0}}

/* ═══════ الشبكة ═══════ */
/* ═══════ أين الناتج ═══════ */
#fpanel{display:flex;align-items:center;justify-content:space-between;gap:clamp(10px,3vw,30px);
  padding:clamp(10px,1.6vh,16px) clamp(16px,3vw,30px);width:min(100%,880px);flex-wrap:wrap}
#fq{font-size:clamp(22px,5vw,42px);font-weight:800;white-space:nowrap}
#fq u{text-decoration:none;background:linear-gradient(180deg,transparent 60%,#ffe0a8 60%)}
#fq b{color:var(--brand)} #fq i{font-style:normal;color:var(--teal)}
#fhint{font-size:clamp(11px,1.8vw,15px);color:var(--muted);font-weight:600;margin-top:2px}
.fstats{display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:center}
.c.found{background:#d8f2e2!important;color:#237a4c!important}
.c.good{background:var(--green)!important;color:#fff!important;animation:bump .45s;z-index:3}
.c.bad{background:var(--red)!important;color:#fff!important;animation:shk .4s;z-index:3}

#grid,#heat,#fgrid{display:grid;gap:var(--gap);background:#fff;padding:clamp(6px,1vw,12px);
  border-radius:clamp(12px,2vw,20px);box-shadow:0 14px 40px rgba(160,110,60,.2)}
.c{width:var(--cell);height:var(--cell);border-radius:clamp(5px,.9vw,10px);
  display:flex;align-items:center;justify-content:center;font-weight:700;
  font-size:calc(var(--cell)*.42);transition:transform .13s,background .15s,color .15s,opacity .25s;
  user-select:none;position:relative}
.c.body{cursor:pointer;background:#fdf6ec;color:#a4907a}
.c.head{background:#f4ece0;color:var(--ink);font-weight:800;font-size:calc(var(--cell)*.46)}
.c.corner{background:var(--ink);color:#ffd7a8;font-size:calc(var(--cell)*.5)}
.c.area{background:#ffe9c9;color:#8a6a3e}
.c.axis{background:var(--brand)!important;color:#fff!important;box-shadow:0 3px 9px rgba(239,139,60,.5)}
.c.pick{background:var(--teal)!important;color:#fff!important;transform:scale(1.16);z-index:3;
  box-shadow:0 6px 18px rgba(21,156,156,.5)}
.c.mirror{outline:3px dashed var(--teal);outline-offset:-3px;z-index:2}
.c.pat{background:var(--purple)!important;color:#fff!important;box-shadow:0 3px 10px rgba(142,107,209,.45)}
.c.diag{background:linear-gradient(145deg,#ffd977,#e8a11c)!important;color:#5b3d00!important;
  box-shadow:0 3px 10px rgba(227,161,25,.5)}
body.fold .c.body.up{opacity:.18}
body.hideP .c.body{color:transparent}
body.hideP .c.body.pick,body.hideP .c.body.pat,body.hideP .c.body.diag{color:#fff!important}
/* خريطة الإتقان */
.c.m0{background:#f3ece3;color:#b4a795}
.c.m1{background:#ffd9d2;color:#a44a3c}
.c.m2{background:#ffe7b5;color:#966a12}
.c.m3{background:#e6f0c2;color:#5f7a1e}
.c.m4{background:#c8ecd4;color:#25764a}
.c.m5{background:linear-gradient(145deg,#7bd6a0,#2fa060);color:#fff}

#patRow{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;max-width:min(100%,900px)}
#patNote{font-size:clamp(12px,1.9vw,16px);font-weight:700;color:var(--purple);
  min-height:1.4em;text-align:center;padding:0 10px}

/* ═══════ التدريب ═══════ */
.qcard{width:min(100%,720px);padding:clamp(14px,2.4vh,26px) clamp(14px,3vw,30px);
  display:flex;flex-direction:column;align-items:center;gap:clamp(10px,1.8vh,18px)}
.qtop{display:flex;justify-content:space-between;align-items:center;width:100%;gap:10px;flex-wrap:wrap}
.stat{font-weight:800;font-size:clamp(13px,2vw,18px)}
.stat.s1{color:var(--green)} .stat.s2{color:var(--brand-d)} .stat.s3{color:var(--teal)}
#qtext{font-size:clamp(34px,9vw,76px);font-weight:800;letter-spacing:2px;line-height:1.1}
#qtext b{color:var(--brand)} #qtext i{font-style:normal;color:var(--teal)}
.opts{display:grid;grid-template-columns:repeat(2,1fr);gap:clamp(8px,1.6vw,14px);width:100%}
.opt{background:#fdf6ec;border:2.5px solid #f0e2cd;border-radius:16px;font-weight:800;
  font-size:clamp(24px,5.5vw,42px);padding:clamp(10px,1.8vh,20px);color:var(--ink);
  transition:transform .12s,background .15s,border-color .15s}
.opt:hover:not(:disabled){border-color:var(--brand);transform:translateY(-2px)}
.opt.good{background:var(--green);border-color:var(--green);color:#fff;animation:bump .45s}
.opt.bad{background:var(--red);border-color:var(--red);color:#fff;animation:shk .4s}
.opt:disabled{cursor:default}
@keyframes bump{0%{transform:scale(1)}40%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes shk{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
#combo{font-weight:800;font-size:clamp(14px,2.4vw,20px);color:var(--brand);min-height:1.4em}
#combo.hot{color:var(--red);animation:glow .6s infinite alternate}
@keyframes glow{to{text-shadow:0 0 14px rgba(224,87,79,.6)}}
.bar{width:100%;height:9px;background:#f0e6d8;border-radius:99px;overflow:hidden}
.bar>span{display:block;height:100%;background:linear-gradient(90deg,var(--green),var(--teal));
  border-radius:99px;transition:width .5s cubic-bezier(.2,1,.3,1)}
#focusRow{display:flex;gap:5px;flex-wrap:wrap;justify-content:center}

/* ═══════ السباق ═══════ */
#timer{font-size:clamp(30px,7vw,58px);font-weight:800;color:var(--red)}
#timer.calm{color:var(--teal)}
.big{background:linear-gradient(180deg,var(--brand-l),var(--brand));color:#fff;font-weight:800;
  font-size:clamp(17px,3.4vw,23px);padding:14px 44px;border-radius:999px;
  box-shadow:0 7px 0 var(--brand-d),0 14px 26px rgba(207,95,28,.32);transition:.12s}
.big:active{transform:translateY(4px);box-shadow:0 3px 0 var(--brand-d)}

/* ═══════ المواجهة ═══════ */
#duel{width:min(100%,760px);display:flex;flex-direction:column;gap:10px}
.side{padding:clamp(10px,1.8vh,18px);display:flex;flex-direction:column;align-items:center;gap:10px}
.side.p1{transform:rotate(180deg)}
.side .opts{grid-template-columns:repeat(4,1fr)}
.side .opt{font-size:clamp(20px,4.4vw,34px);padding:clamp(8px,1.4vh,16px)}
.duelmid{display:flex;align-items:center;justify-content:center;gap:clamp(14px,4vw,40px);
  padding:clamp(8px,1.6vh,16px)}
#duelQ{font-size:clamp(20px,4.4vw,34px);font-weight:800;color:var(--muted)}
.dq{font-size:clamp(28px,7vw,52px);font-weight:800;letter-spacing:1px}
.pscore{font-weight:800;font-size:clamp(18px,3.4vw,30px)}
.p1c{color:var(--purple)} .p2c{color:var(--teal)}
.side.win{animation:flashwin .6s 2}
@keyframes flashwin{50%{background:#ddf5e6}}

/* ═══════ التقدّم ═══════ */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;
  width:min(100%,880px)}
.tile{padding:clamp(10px,1.8vh,18px);text-align:center}
.tile b{display:block;font-size:clamp(22px,4.4vw,34px);color:var(--brand-d)}
.tile small{color:var(--muted);font-weight:700;font-size:clamp(11px,1.7vw,14px)}
#badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;width:min(100%,880px)}
.badge{width:clamp(52px,9vw,72px);padding:8px 0;border-radius:14px;text-align:center;
  background:#f4ece0;color:#b9a893;font-weight:800;font-size:clamp(15px,2.8vw,21px);position:relative}
.badge small{display:block;font-size:9px;font-weight:700;opacity:.8}
.badge.b1{background:linear-gradient(145deg,#f3d3a8,#d9a463);color:#5b3a12}
.badge.b2{background:linear-gradient(145deg,#ffe07a,#e3a119);color:#5b3d00;
  box-shadow:0 4px 14px rgba(227,161,25,.5)}
.legend{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;font-size:clamp(11px,1.7vw,14px);
  font-weight:700;color:var(--muted)}
.legend i{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;margin-left:4px}

/* ═══════ حيلة الأصابع ═══════ */
#fingers{width:min(100%,620px);padding:clamp(10px,2vh,18px);display:none;flex-direction:column;
  align-items:center;gap:12px}
#fingers.on{display:flex}
.hands{display:flex;gap:clamp(16px,5vw,54px)}
.hand{display:flex;gap:5px}
.fg{width:clamp(15px,3.2vw,24px);height:clamp(40px,8vw,62px);border-radius:99px;
  background:linear-gradient(180deg,#ffd9b8,#f0b483);transition:.3s;position:relative}
.fg.down{height:clamp(14px,3vw,22px);align-self:flex-end;background:#e3c3a8;opacity:.55}
.fgnum{font-size:clamp(11px,1.8vw,14px);font-weight:800;color:var(--muted);text-align:center}
#fgEq{font-size:clamp(19px,4vw,32px);font-weight:800}
#fgEq u{text-decoration:none;background:linear-gradient(180deg,transparent 62%,#ffe0a8 62%)}

.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%) translateY(180%);
  background:var(--ink);color:#fff;padding:11px 26px;border-radius:999px;font-weight:800;
  font-size:clamp(13px,2.2vw,17px);z-index:99;transition:transform .4s cubic-bezier(.2,1.5,.4,1);
  box-shadow:0 10px 30px rgba(0,0,0,.25)}
.toast.on{transform:translateX(-50%) translateY(0)}
@media (max-width:560px){ #dots{display:none} }
</style>
</head>
<body>

<header>
  <a href="/games" style="display:inline-flex;align-items:center;gap:6px;margin:0 0 8px;color:#5C7F60;background:#F0F5F0;border:1.5px solid #DDE8DD;border-radius:12px;padding:8px 14px;font-weight:800;font-size:13px;text-decoration:none">← الرجوع إلى ألعاب غراس التفاعلية</a>
  <div class="brandline">
    <div class="brand">جدول <span>الضرب</span> التفاعلي</div>
    <div class="tabs">
      <button class="tab on" data-v="explore">🔍 استكشاف</button>
      <button class="tab" data-v="practice">🎯 تدريب</button>
      <button class="tab" data-v="find">🔎 أين الناتج</button>
      <button class="tab" data-v="race">⏱️ سباق</button>
      <button class="tab" data-v="duel">👥 مواجهة</button>
      <button class="tab" data-v="progress">🗺️ تقدّمي</button>
    </div>
  </div>
  <div class="tools">
    <button class="chip on" id="sz10">١٠×١٠</button>
    <button class="chip" id="sz12">١٢×١٢</button>
    <button class="chip on" id="numAr">أرقام عربية</button>
    <button class="chip" id="hideBtn">إخفاء النواتج</button>
    <button class="chip" id="foldBtn">سرّ التبديل</button>
    <button class="chip" id="heatBtn">خريطة الإتقان</button>
    <button class="chip on" id="sndBtn">🔊 الصوت</button>
  </div>
</header>

<!-- ══════ استكشاف ══════ -->
<section class="view on" id="v-explore">
  <div class="card" id="panel">
    <div>
      <div id="eq">اختر أي خانة لتبدأ ✨</div>
      <div id="hint">مرّر أو المس خانة — سيظهر المستطيل الذي يمثّل عملية الضرب</div>
    </div>
    <div id="dots"></div>
  </div>
  <div id="patRow"></div>
  <div id="patNote"></div>
  <div id="grid"></div>
  <div class="card" id="fingers">
    <div id="fgEq">اختر رقمًا من ١ إلى ١٠</div>
    <div class="hands">
      <div class="hand" id="handR"></div>
      <div class="hand" id="handL"></div>
    </div>
    <div id="fgNums" class="fgnum"></div>
  </div>
</section>

<!-- ══════ تدريب ══════ -->
<section class="view" id="v-practice">
  <div id="focusRow"></div>
  <div class="card qcard">
    <div class="qtop">
      <div class="stat s1" id="pScore">النقاط ٠</div>
      <div class="stat s3" id="pMastered">متقن ٠ / ٥٥</div>
      <div class="stat s2" id="pAcc">الدقّة ١٠٠٪</div>
    </div>
    <div class="bar"><span id="pBar" style="width:0%"></span></div>
    <div id="qtext">…</div>
    <div id="combo"></div>
    <div class="opts" id="pOpts"></div>
  </div>
</section>

<!-- ══════ أين الناتج ══════ -->
<section class="view" id="v-find">
  <div class="card" id="fpanel">
    <div style="text-align:center">
      <div id="fq">…</div>
      <div id="fhint">اضغط على الخانة الصحيحة — قد يكون لها أكثر من موضع</div>
    </div>
    <div class="fstats">
      <span class="stat s1" id="fScore">النقاط ٠</span>
      <span class="stat s2" id="fStreak"></span>
    </div>
  </div>
  <div id="fgrid"></div>
</section>

<!-- ══════ سباق ══════ -->
<section class="view" id="v-race">
  <div class="card qcard">
    <div class="qtop">
      <div class="stat s1" id="rScore">الصحيح ٠</div>
      <div class="stat s2" id="rBest">الأفضل ٠</div>
    </div>
    <div id="timer" class="calm">٦٠</div>
    <div id="rBody" style="display:none;width:100%;flex-direction:column;align-items:center;gap:14px">
      <div id="rQ" style="font-size:clamp(32px,8vw,66px);font-weight:800">…</div>
      <div class="opts" id="rOpts"></div>
    </div>
    <button class="big" id="rStart">ابدأ السباق</button>
  </div>
</section>

<!-- ══════ مواجهة ══════ -->
<section class="view" id="v-duel">
  <div id="duel">
    <div class="card side p1" id="side1">
      <div class="dq" id="dq1">اضغط ابدأ</div>
      <div class="opts" id="d1"></div>
    </div>
    <div class="card duelmid">
      <div class="pscore p1c" id="s1">٠</div>
      <div id="duelQ">اضغط ابدأ</div>
      <div class="pscore p2c" id="s2">٠</div>
    </div>
    <div class="card side p2" id="side2">
      <div class="dq" id="dq2">اضغط ابدأ</div>
      <div class="opts" id="d2"></div>
    </div>
    <div style="display:flex;justify-content:center"><button class="big" id="dStart">ابدأ المواجهة</button></div>
  </div>
</section>

<!-- ══════ تقدّمي ══════ -->
<section class="view" id="v-progress">
  <div class="stats">
    <div class="card tile"><b id="tMast">٠</b><small>حقيقة متقنة</small></div>
    <div class="card tile"><b id="tPct">٠٪</b><small>نسبة الإتقان</small></div>
    <div class="card tile"><b id="tAcc">١٠٠٪</b><small>دقّة الإجابات</small></div>
    <div class="card tile"><b id="tStreak">٠</b><small>أطول سلسلة</small></div>
    <div class="card tile"><b id="tRace">٠</b><small>أفضل سباق</small></div>
  </div>
  <div id="badges"></div>
  <div class="legend">
    <span><i style="background:#f3ece3"></i>لم تُجرَّب</span>
    <span><i style="background:#ffd9d2"></i>أخطأت فيها</span>
    <span><i style="background:#ffe7b5"></i>في الطريق</span>
    <span><i style="background:#e6f0c2"></i>شبه متقنة</span>
    <span><i style="background:#c8ecd4"></i>متقنة</span>
    <span><i style="background:#2fa060"></i>راسخة تمامًا</span>
  </div>
  <div id="heat"></div>
  <button class="chip" id="resetBtn" style="margin-top:6px">↺ بداية جديدة</button>
</section>

<div class="toast" id="toast"></div>

<script>
/* ═══════════════════════════════════════════════════════════
   غراس · جدول الضرب — محرك التعلّم
   ═══════════════════════════════════════════════════════════ */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const AR="٠١٢٣٤٥٦٧٨٩";
let arNum=true;
const ar=n=>arNum?String(n).replace(/\\d/g,d=>AR[d]):String(n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;};
const key=(a,b)=>a<=b?a+'x'+b:b+'x'+a;

/* ── التخزين (يعمل محليًا، ويتراجع للذاكرة إن مُنع) ── */
const SK='ghiras-mult-v1';
let mem=null;
const store={
  load(){ try{ return JSON.parse(localStorage.getItem(SK))||null; }catch(e){ return mem; } },
  save(d){ try{ localStorage.setItem(SK,JSON.stringify(d)); }catch(e){ mem=d; } }
};
const DEF={facts:{},seq:0,right:0,wrong:0,best:0,bestStreak:0,score:0};
let D=Object.assign({},DEF,store.load()||{});
D.facts=D.facts||{};
const save=()=>store.save(D);

/* ── نظام لايتنر: الصناديق ٠..٥ ── */
const IVL=[0,2,5,11,22,45];
const getF=k=>D.facts[k]||(D.facts[k]={box:0,seen:0,last:-99});
const boxOf=k=>D.facts[k]?D.facts[k].box:0;
const isSeen=k=>!!D.facts[k];

let N=10, mode='explore';

/* ══════════ الشبكة ══════════ */
const grid=$('#grid');
function build(){
  grid.innerHTML='';
  grid.style.gridTemplateColumns=\`repeat(\${N+1},var(--cell))\`;
  grid.appendChild(cel('×','c corner'));
  for(let c=1;c<=N;c++) grid.appendChild(cel(ar(c),'c head',0,c));
  for(let r=1;r<=N;r++){
    grid.appendChild(cel(ar(r),'c head',r,0));
    for(let c=1;c<=N;c++){
      const e=cel(ar(r*c),'c body'+(r>c?' up':''),r,c);
      e.dataset.v=r*c; grid.appendChild(e);
    }
  }
  buildFind(); paintHeat(); buildHeat(); renderFocus(); renderBadges(); updProgress();
}
function cel(t,cls,r,c){
  const d=document.createElement('div'); d.className=cls; d.textContent=t;
  if(r!==undefined){d.dataset.r=r;d.dataset.c=c;}
  return d;
}
const at=(r,c)=>grid.querySelector(\`.c[data-r="\${r}"][data-c="\${c}"]\`);
const clearM=()=>$$('#grid .c').forEach(e=>e.classList.remove('area','axis','pick','mirror'));

function highlight(r,c){
  clearM();
  for(let i=1;i<=r;i++)for(let j=1;j<=c;j++){
    const e=at(i,j); if(e&&!(i===r&&j===c)) e.classList.add('area');
  }
  for(let j=1;j<=c;j++) at(0,j)?.classList.add('axis');
  for(let i=1;i<=r;i++) at(i,0)?.classList.add('axis');
  at(r,c)?.classList.add('pick');
  if(r!==c) at(c,r)?.classList.add('mirror');
  $('#eq').innerHTML=\`<b>\${ar(r)}</b> × <i>\${ar(c)}</i> = <u>\${ar(r*c)}</u>\`;
  $('#hint').textContent = r!==c
    ? \`مستطيل \${ar(r)}×\${ar(c)} = \${ar(r*c)} مربّعًا — ولاحظ التوأم \${ar(c)}×\${ar(r)} بنفس الناتج!\`
    : \`مربّع كامل: \${ar(r)}×\${ar(r)} = \${ar(r*c)}\`;
  drawDots(r,c);
  $('#panel').animate([{transform:'scale(.975)'},{transform:'scale(1)'}],{duration:200});
}
function drawDots(r,c){
  const d=$('#dots'); d.style.gridTemplateColumns=\`repeat(\${c},auto)\`; d.innerHTML='';
  const f=document.createDocumentFragment();
  for(let i=0;i<r*c;i++){const x=document.createElement('i');x.style.animationDelay=(i*6)+'ms';f.appendChild(x);}
  d.appendChild(f);
}
grid.addEventListener('pointerover',e=>{
  const el=e.target.closest('.c.body'); if(el) highlight(+el.dataset.r,+el.dataset.c);
});
grid.addEventListener('click',e=>{
  const el=e.target.closest('.c.body'); if(el) highlight(+el.dataset.r,+el.dataset.c);
});

/* ══════════ ٨ + ٩: الأنماط والقطر والأصابع ══════════ */
const PATNOTE={
  2:'كل النواتج أعداد زوجية — تنتهي بـ ٠ ٢ ٤ ٦ ٨',
  3:'مجموع أرقام كل ناتج يقبل القسمة على ٣ ✨',
  4:'كل ناتج = ضعف ضعف الرقم — ضاعف مرتين!',
  5:'كل النواتج تنتهي بـ ٠ أو ٥ — بالتناوب',
  6:'نواتج ٦ زوجية دائمًا وتقبل القسمة على ٣ معًا',
  7:'أصعب جدول — لكن نصفه تعرفه من الجداول السابقة!',
  8:'ضاعف ثلاث مرات: ×٢ ثم ×٢ ثم ×٢',
  9:'مجموع رقمَي كل ناتج = ٩ دائمًا · وخانة العشرات تزيد والآحاد تنقص',
  10:'أضف صفرًا فقط — أسهل جدول على الإطلاق',
  11:'كرّر الرقم مرتين حتى ٩×١١',
  12:'١٢ = ١٠ + ٢ — اضرب في ١٠ ثم أضف ضعف الرقم'
};
let activePat=null;
function renderPat(){
  const row=$('#patRow'); row.innerHTML='';
  for(let n=2;n<=N;n++){
    const b=document.createElement('button');
    b.className='chip sm'; b.textContent='مضاعفات '+ar(n);
    b.onclick=()=>togglePat(n,b);
    row.appendChild(b);
  }
  const d=document.createElement('button');
  d.className='chip sm'; d.textContent='✨ القطر السحري';
  d.onclick=()=>toggleDiag(d); row.appendChild(d);
  const f=document.createElement('button');
  f.className='chip sm'; f.textContent='✋ حيلة أصابع ٩';
  f.onclick=()=>{ const on=$('#fingers').classList.toggle('on'); f.classList.toggle('on',on); };
  row.appendChild(f);
}
function clearPat(){
  $$('#grid .c').forEach(e=>e.classList.remove('pat','diag'));
  $$('#patRow .chip').forEach(e=>e.classList.remove('on'));
}
function togglePat(n,btn){
  const was=activePat===n; clearPat(); $('#patNote').textContent='';
  if(was){activePat=null;return;}
  activePat=n; btn.classList.add('on');
  $$('#grid .c.body').forEach(e=>{ if(+e.dataset.v % n===0) e.classList.add('pat'); });
  $('#patNote').textContent=PATNOTE[n]||'';
}
function toggleDiag(btn){
  const was=btn.classList.contains('on'); clearPat(); $('#patNote').textContent='';
  if(was){activePat=null;return;}
  activePat='d'; btn.classList.add('on');
  for(let i=1;i<=N;i++) at(i,i)?.classList.add('diag');
  $('#patNote').textContent='المربّعات الكاملة: ١، ٤، ٩، ١٦، ٢٥… الفرق بينها ٣، ٥، ٧، ٩ (أعداد فردية متتالية!)';
}
/* حيلة أصابع ٩ */
function buildFingers(){
  const R=$('#handR'), L=$('#handL'); R.innerHTML=''; L.innerHTML='';
  for(let i=1;i<=10;i++){
    const f=document.createElement('div'); f.className='fg'; f.dataset.i=i;
    f.onclick=()=>foldFinger(i);
    (i<=5?R:L).appendChild(f);
  }
  $('#fgNums').textContent='اضغط على أي إصبع (من اليمين ١ إلى اليسار ١٠)';
}
function foldFinger(i){
  $$('.fg').forEach(f=>f.classList.toggle('down',+f.dataset.i===i));
  const tens=i-1, ones=10-i;
  $('#fgEq').innerHTML=\`<b style="color:var(--brand)">٩</b> × <i style="color:var(--teal)">\${ar(i)}</i> = <u>\${ar(tens)}\${ar(ones)}</u>\`;
  $('#fgNums').textContent=\`قبل الإصبع المطويّ \${ar(tens)} أصابع (العشرات) وبعده \${ar(ones)} (الآحاد)\`;
  beep(520+i*20,.1);
}

/* ══════════ الصوت ══════════ */
let actx=null, sndOn=true;
function beep(f,dur=.13,type='sine',vol=.16){
  if(!sndOn) return;
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    const o=actx.createOscillator(), g=actx.createGain();
    o.type=type; o.frequency.value=f; o.connect(g); g.connect(actx.destination);
    const t=actx.currentTime;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.012);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.start(t); o.stop(t+dur+.02);
  }catch(e){}
}
const SCALE=[523,587,659,784,880,1046,1175,1318];
const goodSnd=s=>{ const f=SCALE[Math.min(s,SCALE.length-1)]; beep(f,.14); setTimeout(()=>beep(f*1.5,.11,'sine',.09),70); };
const badSnd=()=>{ beep(200,.16,'triangle',.13); setTimeout(()=>beep(150,.2,'triangle',.11),90); };
const winSnd=()=>[0,120,240,400].forEach((d,i)=>setTimeout(()=>beep(SCALE[i*2]||880,.2),d));

/* ══════════ اختيار السؤال (تكرار متباعد) ══════════ */
let focusT=0;
function pool(){
  const p=[];
  for(let a=1;a<=N;a++) for(let b=a;b<=N;b++){
    if(focusT===0 || a===focusT || b===focusT) p.push([a,b]);
  }
  return p;
}
/* اختيار السؤال التالي:
   ١) الحقائق «المستحقّة» للمراجعة أولًا (حسب فترات لايتنر)
   ٢) نُدخل حقيقة جديدة فقط إذا كانت الحقائق قيد التعلّم أقل من ٥ — حتى لا يغرق الطالب
   ٣) إن أُتقن كل شيء → مراجعة الأقدم                                        */
function pickFact(){
  const p=pool(); if(!p.length) return [2,3];
  const rnd=a=>a[(Math.random()*a.length)|0];
  const seen=[], fresh=[];
  for(const pr of p) (D.facts[key(pr[0],pr[1])]?seen:fresh).push(pr);
  const learning=seen.filter(pr=>boxOf(key(pr[0],pr[1]))<3).length;
  const due=seen.filter(pr=>{const f=D.facts[key(pr[0],pr[1])];
    return f.box<5 && (D.seq-f.last)>=IVL[f.box];});

  if(fresh.length && learning<5 && (!due.length || Math.random()<.34)) return rnd(fresh);
  if(due.length){
    due.sort((x,y)=>{
      const fx=D.facts[key(x[0],x[1])], fy=D.facts[key(y[0],y[1])];
      return (fx.box-fy.box) || (fx.last-fy.last);
    });
    return rnd(due.slice(0,Math.min(3,due.length)));
  }
  if(fresh.length) return rnd(fresh);
  seen.sort((x,y)=>D.facts[key(x[0],x[1])].last-D.facts[key(y[0],y[1])].last);
  return rnd(seen.slice(0,Math.min(5,seen.length)));
}
function answerOpts(v,r,c){
  const s=new Set([v]);
  const cand=shuffle([r*(c+1),r*(c-1),(r+1)*c,(r-1)*c,v+r,v-r,v+c,v-c,v+10,v-10,v+1]);
  for(const x of cand){ if(x>0&&!s.has(x)&&s.size<4) s.add(x); }
  let g=1; while(s.size<4){ s.add(v+g); g++; }
  return shuffle([...s]);
}
function record(k,ok){
  const f=getF(k); D.seq++; f.seen++; f.last=D.seq;
  f.box = ok ? Math.min(5,f.box+1) : Math.max(0,f.box-1);
  if(ok) D.right++; else D.wrong++;
  save(); paintHeat(); updProgress();
}

/* ══════════ خريطة الإتقان ══════════ */
let heatOn=false;
/* لون الإتقان: رمادي = لم تُجرَّب · أحمر = أخطأ فيها · ذهبي = في الطريق · أخضر = متقنة */
const MC=['m1','m2','m2','m3','m4','m5'];
const mcls=k=>isSeen(k)?MC[boxOf(k)]:'m0';
function paintHeat(){
  $$('#grid .c.body').forEach(e=>{
    e.classList.remove('m0','m1','m2','m3','m4','m5');
    if(!heatOn) return;
    e.classList.add(mcls(key(+e.dataset.r,+e.dataset.c)));
  });
}
function buildHeat(){
  const h=$('#heat'); h.innerHTML='';
  h.style.gridTemplateColumns=\`repeat(\${N+1},var(--cell))\`;
  h.appendChild(cel('×','c corner'));
  for(let c=1;c<=N;c++) h.appendChild(cel(ar(c),'c head'));
  for(let r=1;r<=N;r++){
    h.appendChild(cel(ar(r),'c head'));
    for(let c=1;c<=N;c++){
      h.appendChild(cel(ar(r*c),'c body '+mcls(key(r,c))));
    }
  }
}
const totalFacts=()=>{let n=0;for(let a=1;a<=N;a++)for(let b=a;b<=N;b++)n++;return n;};
const masteredCount=()=>{let n=0;for(let a=1;a<=N;a++)for(let b=a;b<=N;b++)if(boxOf(key(a,b))>=4)n++;return n;};
/* تقدّم تراكمي ناعم: مجموع الصناديق ÷ الحد الأقصى — يتحرك مع كل إجابة صحيحة */
const progRatio=()=>{let s=0;for(let a=1;a<=N;a++)for(let b=a;b<=N;b++)s+=boxOf(key(a,b));return s/(5*totalFacts());};

/* ══════════ التدريب ══════════ */
let cur=null, streak=0, locked=false;
function renderFocus(){
  const row=$('#focusRow'); row.innerHTML='';
  const add=(t,v)=>{
    const b=document.createElement('button');
    b.className='chip'+(focusT===v?' on':''); b.textContent=t;
    b.onclick=()=>{focusT=v;renderFocus();nextQ();}; row.appendChild(b);
  };
  add('كل الجداول',0);
  for(let n=2;n<=N;n++){
    const tot=N, done=(()=>{let d=0;for(let i=1;i<=N;i++)if(boxOf(key(n,i))>=4)d++;return d;})();
    add('جدول '+ar(n)+(done===tot?' 🏅':done>=tot/2?' ✦':''),n);
  }
}
function nextQ(){
  const [a,b]=pickFact();
  const [r,c]=Math.random()<.5?[a,b]:[b,a];
  cur={r,c,v:r*c,k:key(a,b)}; locked=false;
  $('#qtext').innerHTML=\`<b>\${ar(r)}</b> × <i>\${ar(c)}</i> = ؟\`;
  const box=$('#pOpts'); box.innerHTML='';
  answerOpts(cur.v,r,c).forEach(v=>{
    const b2=document.createElement('button');
    b2.className='opt'; b2.textContent=ar(v);
    b2.onclick=()=>ansP(b2,v); box.appendChild(b2);
  });
  $('#qtext').animate([{transform:'scale(.88)',opacity:.4},{transform:'scale(1)',opacity:1}],
    {duration:300,easing:'cubic-bezier(.2,1.5,.4,1)'});
}
function ansP(btn,v){
  if(locked) return; locked=true;
  const ok=v===cur.v;
  record(cur.k,ok);
  if(ok){
    btn.classList.add('good'); streak++;
    D.bestStreak=Math.max(D.bestStreak,streak);
    const mult=streak>=9?4:streak>=6?3:streak>=3?2:1;
    D.score+=10*mult; save(); goodSnd(streak-1);
    $('#combo').textContent = mult>1?\`🔥 سلسلة \${ar(streak)} — النقاط ×\${ar(mult)}\`:'';
    $('#combo').classList.toggle('hot',mult>=3);
    if(boxOf(cur.k)===5) toast(\`🏅 أتقنتَ \${ar(cur.r)} × \${ar(cur.c)}!\`);
    setTimeout(nextQ,700);
  }else{
    btn.classList.add('bad'); streak=0; badSnd();
    $('#combo').textContent=\`\${ar(cur.r)} × \${ar(cur.c)} = \${ar(cur.v)}\`;
    $('#combo').classList.remove('hot');
    $$('#pOpts .opt').forEach(b=>{ if(b.textContent===ar(cur.v)) b.classList.add('good'); b.disabled=true; });
    setTimeout(nextQ,1600);
  }
  updP();
}
function updP(){
  $('#pScore').textContent='النقاط '+ar(D.score);
  $('#pMastered').textContent=\`متقن \${ar(masteredCount())} / \${ar(totalFacts())}\`;
  const t=D.right+D.wrong;
  $('#pAcc').textContent='الدقّة '+ar(t?Math.round(D.right/t*100):100)+'٪';
  $('#pBar').style.width=(progRatio()*100).toFixed(1)+'%';
}

/* ══════════ أين الناتج؟ ══════════ */
const fgrid=$('#fgrid');
let fCur=null, fScore=0, fStreak=0, fLock=false, fSolved=new Set();
const fat=(r,c)=>fgrid.querySelector(\`.c[data-r="\${r}"][data-c="\${c}"]\`);
function buildFind(){
  fgrid.innerHTML='';
  fgrid.style.gridTemplateColumns=\`repeat(\${N+1},var(--cell))\`;
  fgrid.appendChild(cel('×','c corner'));
  for(let c=1;c<=N;c++) fgrid.appendChild(cel(ar(c),'c head',0,c));
  for(let r=1;r<=N;r++){
    fgrid.appendChild(cel(ar(r),'c head',r,0));
    for(let c=1;c<=N;c++){
      const e=cel(ar(r*c),'c body'+(r>c?' up':''),r,c);
      e.dataset.v=r*c; fgrid.appendChild(e);
    }
  }
  fSolved.clear();
}
/* عند التمرير نضيء رأس الصف والعمود فقط — مساعدة بلا كشف */
fgrid.addEventListener('pointerover',e=>{
  const el=e.target.closest('.c.body'); if(!el) return;
  fgrid.querySelectorAll('.c.axis').forEach(x=>x.classList.remove('axis'));
  fat(0,+el.dataset.c)?.classList.add('axis');
  fat(+el.dataset.r,0)?.classList.add('axis');
});
fgrid.addEventListener('click',e=>{
  const el=e.target.closest('.c.body'); if(el) findAns(el);
});
function findQ(){
  let a,b,g=0;
  do{ [a,b]=pickFact(); g++; } while(fSolved.has(a*b) && g<30);  // لا تسأل عن ناتج مُضاء سلفًا
  if(fSolved.has(a*b)){                                          // وُجدت كل النواتج → جولة جديدة
    fSolved.clear();
    fgrid.querySelectorAll('.found').forEach(x=>x.classList.remove('found'));
    toast('أكملتَ جولة كاملة — نبدأ من جديد ✨');
  }
  fCur={v:a*b,k:key(a,b)}; fLock=false;
  $('#fq').innerHTML=\`أين ناتج <u>\${ar(fCur.v)}</u> ؟\`;
  $('#fhint').textContent='اضغط على الخانة الصحيحة — قد يكون لها أكثر من موضع';
  $('#fpanel').animate([{transform:'scale(.94)',opacity:.5},{transform:'scale(1)',opacity:1}],
    {duration:320,easing:'cubic-bezier(.2,1.5,.4,1)'});
}
function findAns(el){
  if(fLock) return;
  const v=+el.dataset.v, r=+el.dataset.r, c=+el.dataset.c;
  if(v===fCur.v){
    fLock=true; el.classList.add('good');
    record(fCur.k,true); fScore+=10; fStreak++;
    D.bestStreak=Math.max(D.bestStreak,fStreak); D.score+=10; save();
    goodSnd(fStreak-1);
    fSolved.add(v);
    fgrid.querySelectorAll(\`.c.body[data-v="\${v}"]\`).forEach(x=>x.classList.add('found'));
    $('#fq').innerHTML=\`<b>\${ar(r)}</b> × <i>\${ar(c)}</i> = <u>\${ar(v)}</u> ✅\`;
    $('#fhint').textContent = r!==c
      ? \`والتوأم \${ar(c)} × \${ar(r)} له نفس الناتج!\`
      : 'مربّع كامل! ✨';
    updF();
    setTimeout(()=>{ el.classList.remove('good'); findQ(); }, 1050);
  }else{
    el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad');
    record(fCur.k,false); fStreak=0; fScore=Math.max(0,fScore-2); badSnd();
    $('#fhint').textContent=\`هذه الخانة \${ar(r)} × \${ar(c)} = \${ar(v)} — حاول مرة أخرى\`;
    setTimeout(()=>el.classList.remove('bad'),450);
    updF();
  }
}
function updF(){
  $('#fScore').textContent='النقاط '+ar(fScore);
  $('#fStreak').textContent = fStreak>=3 ? \`🔥 سلسلة \${ar(fStreak)}\` : '';
}

/* ══════════ السباق ══════════ */
let rTime=60, rScore=0, rTimer=null, rCur=null, rLock=false;
function raceStart(){
  rTime=60; rScore=0; rLock=false;
  $('#rStart').style.display='none'; $('#rBody').style.display='flex';
  $('#timer').textContent=ar(60); $('#timer').className='calm';
  $('#rScore').textContent='الصحيح ٠';
  raceQ();
  clearInterval(rTimer);
  rTimer=setInterval(()=>{
    rTime--; $('#timer').textContent=ar(rTime);
    if(rTime<=10){ $('#timer').className=''; beep(880,.05,'square',.07); }
    if(rTime<=0) raceEnd();
  },1000);
}
function raceQ(){
  const [a,b]=pickFact(); const [r,c]=Math.random()<.5?[a,b]:[b,a];
  rCur={r,c,v:r*c,k:key(a,b)}; rLock=false;
  $('#rQ').innerHTML=\`<b style="color:var(--brand)">\${ar(r)}</b> × <i style="color:var(--teal)">\${ar(c)}</i>\`;
  const box=$('#rOpts'); box.innerHTML='';
  answerOpts(rCur.v,r,c).forEach(v=>{
    const b2=document.createElement('button'); b2.className='opt'; b2.textContent=ar(v);
    b2.onclick=()=>{
      if(rLock) return; rLock=true;
      const ok=v===rCur.v; record(rCur.k,ok);
      b2.classList.add(ok?'good':'bad');
      if(ok){ rScore++; goodSnd(rScore-1); $('#rScore').textContent='الصحيح '+ar(rScore); }
      else badSnd();
      setTimeout(raceQ,ok?260:620);
    };
    box.appendChild(b2);
  });
}
function raceEnd(){
  clearInterval(rTimer);
  $('#rBody').style.display='none'; $('#rStart').style.display='';
  $('#rStart').textContent='سباق جديد';
  if(rScore>D.best){ D.best=rScore; save(); toast(\`🏆 رقم قياسي جديد: \${ar(rScore)}\`); winSnd(); }
  else toast(\`انتهى الوقت — \${ar(rScore)} إجابة صحيحة\`);
  $('#rBest').textContent='الأفضل '+ar(D.best);
  $('#timer').textContent=ar(rScore); $('#timer').className='calm';
  updProgress();
}

/* ══════════ المواجهة ══════════ */
let dCur=null, dS=[0,0], dLock=false, dOn=false;
function duelStart(){
  dS=[0,0]; dOn=true; $('#s1').textContent='٠'; $('#s2').textContent='٠';
  $('#dStart').textContent='إعادة'; duelQ();
}
function duelQ(){
  const [a,b]=pickFact(); const [r,c]=Math.random()<.5?[a,b]:[b,a];
  dCur={r,c,v:r*c,k:key(a,b)}; dLock=false;
  const q=\`<b style="color:var(--brand)">\${ar(r)}</b> × <i style="color:var(--teal)">\${ar(c)}</i>\`;
  $('#duelQ').innerHTML=\`الفوز عند \${ar(10)}\`;
  $('#dq1').innerHTML=q; $('#dq2').innerHTML=q;
  const opts=answerOpts(dCur.v,r,c);
  [1,2].forEach(p=>{
    const box=$('#d'+p); box.innerHTML='';
    opts.forEach(v=>{
      const b2=document.createElement('button'); b2.className='opt'; b2.textContent=ar(v);
      b2.onclick=()=>duelAns(p,v,b2); box.appendChild(b2);
    });
  });
}
function duelAns(p,v,btn){
  if(dLock||!dOn) return;
  if(v!==dCur.v){ btn.classList.add('bad'); badSnd(); btn.disabled=true; return; }
  dLock=true; btn.classList.add('good'); record(dCur.k,true); goodSnd(dS[p-1]);
  dS[p-1]++; $('#s'+p).textContent=ar(dS[p-1]);
  $('#side'+p).classList.add('win'); setTimeout(()=>$('#side'+p).classList.remove('win'),1200);
  if(dS[p-1]>=10){
    dOn=false; winSnd(); toast(\`🎉 فاز اللاعب \${ar(p)}!\`); $('#dStart').textContent='مواجهة جديدة';
    $('#duelQ').textContent='🎉 '+ar(dS[0])+' — '+ar(dS[1]);
    $('#dq1').textContent=p===1?'🏆 فزت!':'حظًا أوفر'; $('#dq2').textContent=p===2?'🏆 فزت!':'حظًا أوفر';
    return;
  }
  setTimeout(duelQ,600);
}

/* ══════════ التقدّم والأوسمة ══════════ */
function renderBadges(){
  const w=$('#badges'); w.innerHTML='';
  for(let n=2;n<=N;n++){
    let d=0; for(let i=1;i<=N;i++) if(boxOf(key(n,i))>=4) d++;
    const lvl=d===N?2:d>=Math.ceil(N/2)?1:0;
    const b=document.createElement('div');
    b.className='badge b'+lvl;
    b.innerHTML=(lvl===2?'🏅':lvl===1?'✦':'')+ar(n)+\`<small>\${ar(d)}/\${ar(N)}</small>\`;
    w.appendChild(b);
  }
}
function updProgress(){
  const m=masteredCount(), t=totalFacts(), a=D.right+D.wrong;
  $('#tMast').textContent=ar(m);
  $('#tPct').textContent=ar(Math.round(m/t*100))+'٪';
  $('#tAcc').textContent=ar(a?Math.round(D.right/a*100):100)+'٪';
  $('#tStreak').textContent=ar(D.bestStreak);
  $('#tRace').textContent=ar(D.best);
  $('#rBest').textContent='الأفضل '+ar(D.best);
  renderBadges(); buildHeat(); renderFocus(); updP();
}
function toast(t){
  const el=$('#toast'); el.textContent=t; el.classList.add('on');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('on'),2200);
}

/* ══════════ التبويبات والأدوات ══════════ */
$$('.tab').forEach(t=>t.onclick=()=>{
  $$('.tab').forEach(x=>x.classList.remove('on')); t.classList.add('on');
  mode=t.dataset.v;
  $$('.view').forEach(v=>v.classList.remove('on'));
  $('#v-'+mode).classList.add('on');
  if(mode==='practice'){ if(!cur) nextQ(); updP(); }
  if(mode==='find'){ if(!fCur) findQ(); updF(); }
  if(mode==='progress') updProgress();
  if(mode==='race'){ clearInterval(rTimer); $('#rBody').style.display='none';
                     $('#rStart').style.display=''; $('#timer').textContent=ar(60); }
});
$('#sz10').onclick=()=>setSize(10);
$('#sz12').onclick=()=>setSize(12);
function setSize(n){
  N=n; $('#sz10').classList.toggle('on',n===10); $('#sz12').classList.toggle('on',n===12);
  build(); renderPat(); cur=null; fCur=null;
  if(mode==='practice') nextQ(); if(mode==='find') findQ();
}
$('#numAr').onclick=e=>{
  arNum=!arNum; e.target.classList.toggle('on',arNum);
  e.target.textContent=arNum?'أرقام عربية':'أرقام إنجليزية';
  build(); renderPat(); buildFingers(); cur=null; fCur=null;
  if(mode==='practice') nextQ(); if(mode==='find') findQ();
};
$('#hideBtn').onclick=e=>{
  const h=document.body.classList.toggle('hideP');
  e.target.classList.toggle('on',h); e.target.textContent=h?'إظهار النواتج':'إخفاء النواتج';
};
$('#foldBtn').onclick=e=>{
  const f=document.body.classList.toggle('fold'); e.target.classList.toggle('on',f);
  if(f){ const u=N*(N-1)/2, tot=N*N;
    $('#patNote').textContent=\`٧×٦ و ٦×٧ نفس الناتج — فالحقائق \${ar(tot-u)} فقط بدل \${ar(tot)}! نصف الجدول مرآة للنصف الآخر.\`;
  } else $('#patNote').textContent='';
};
$('#heatBtn').onclick=e=>{
  heatOn=!heatOn; e.target.classList.toggle('on',heatOn); paintHeat();
  if(heatOn) toast('الألوان تعكس إتقانك — درّب على الأحمر أولًا');
};
$('#sndBtn').onclick=e=>{
  sndOn=!sndOn; e.target.classList.toggle('on',sndOn);
  e.target.textContent=sndOn?'🔊 الصوت':'🔇 صامت'; if(sndOn) beep(660,.1);
};
$('#rStart').onclick=raceStart;
$('#dStart').onclick=duelStart;
let armed=false;
$('#resetBtn').onclick=e=>{
  if(!armed){                                   // تأكيد بضغطتين بدل نافذة منبثقة
    armed=true; e.target.textContent='⚠️ متأكد؟ اضغط مرة أخرى';
    e.target.classList.add('on');
    setTimeout(()=>{armed=false;e.target.textContent='↺ بداية جديدة';e.target.classList.remove('on');},4000);
    return;
  }
  armed=false; e.target.textContent='↺ بداية جديدة'; e.target.classList.remove('on');
  D=JSON.parse(JSON.stringify(DEF)); D.facts={}; save();
  streak=0; cur=null; fCur=null; fScore=0; fStreak=0; clearPat(); $('#patNote').textContent='';
  build(); nextQ(); findQ(); updF(); updProgress();
  toast('تمّت البداية الجديدة ✨');
};

/* ══════════ تشغيل ══════════ */
build(); renderPat(); buildFingers(); nextQ(); findQ(); updF(); updProgress();
</script>
</body>
</html>
`;
