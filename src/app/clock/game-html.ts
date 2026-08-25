// اللعبة مضمّنة كنص محمي — تُقدَّم فقط للمشتركات عبر /clock (route.ts)
/* eslint-disable */
export const CLOCK_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>غراس · الساعة التفاعلية</title>
<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#1e3a52; --muted:#7b96ab; --line:#ecdcc6;
  --brand:#ef8b3c; --brand-l:#ffab4d; --brand-d:#c9600f;
  --teal:#159c9c; --green:#2fa060; --red:#e0574f; --purple:#8e6bd1;
  --r:18px;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{height:100%}
body{min-height:100%;font-family:'Baloo Bhaijaan 2','Tajawal',system-ui,sans-serif;
  background:radial-gradient(140% 110% at 50% 0%,#fff7ea 0%,#ffeacd 42%,#ffdfd4 100%);
  background-attachment:fixed;color:var(--ink);display:flex;flex-direction:column;align-items:center;
  padding:clamp(8px,1.5vh,16px);gap:clamp(8px,1.4vh,14px)}
button{font:inherit;cursor:pointer;border:none;background:none;color:inherit}

header{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}
.brandline{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center}
.brand{font-weight:800;font-size:clamp(16px,2.4vw,24px)}
.brand span{color:var(--brand)}
.tabs{display:flex;background:#fff;border-radius:999px;padding:4px;gap:2px;flex-wrap:wrap;
  justify-content:center;box-shadow:0 4px 16px rgba(160,110,60,.16)}
.tab{font-weight:700;color:var(--muted);padding:7px 15px;border-radius:999px;
  font-size:clamp(12px,1.8vw,16px);transition:.2s;white-space:nowrap}
.tab.on{background:linear-gradient(180deg,var(--brand-l),var(--brand));color:#fff;
  box-shadow:0 3px 10px rgba(239,139,60,.42)}
.tools,.levels{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.chip{border:1.5px solid var(--line);background:#fffdf8;border-radius:999px;font-weight:700;
  padding:5px 13px;font-size:clamp(11px,1.6vw,14px);transition:.16s;white-space:nowrap}
.chip:hover{border-color:var(--brand);color:var(--brand-d)}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.card{background:#fff;border-radius:var(--r);box-shadow:0 8px 26px rgba(160,110,60,.16)}
.view{display:none;flex-direction:column;align-items:center;gap:clamp(8px,1.4vh,14px);width:100%;flex:1}
.view.on{display:flex}

/* ═══ الساعة ═══ */
#clockWrap{width:min(92vw,min(62vh,470px));aspect-ratio:1;position:relative;touch-action:none;
  filter:drop-shadow(0 16px 34px rgba(160,110,60,.28));transition:width .25s}
#clockWrap.sm{width:min(76vw,min(40vh,340px))}   /* أصغر في أوضاع الأسئلة ليظهر مع الخيارات */
svg{width:100%;height:100%;display:block;overflow:visible;
  user-select:none;-webkit-user-select:none}
svg text{user-select:none;-webkit-user-select:none;pointer-events:none}
.hand{cursor:grab} .hand:active{cursor:grabbing}
.hand.drag{filter:drop-shadow(0 0 10px rgba(0,0,0,.22))}
#hourG,#minG{transition:transform .12s cubic-bezier(.3,1,.4,1)}
#hourG.nt,#minG.nt{transition:none}
.tick{stroke:#c9b8a2} .tick5{stroke:var(--ink)}
.numH{fill:var(--ink);font-weight:800}
.numM{fill:var(--teal);font-weight:700;opacity:.9}
.num24{fill:var(--purple);font-weight:700;opacity:.85}

/* ═══ اللوحة الرقمية ═══ */
#read{display:flex;flex-direction:column;align-items:center;gap:4px;
  padding:clamp(8px,1.4vh,14px) clamp(16px,3.5vw,34px);width:min(100%,640px)}
#digital{font-size:clamp(30px,7.5vw,58px);font-weight:800;letter-spacing:1px;
  direction:ltr;unicode-bidi:isolate}
#digital small{font-size:.42em;color:var(--muted);margin-inline-start:.25em}
#words{font-size:clamp(15px,3.2vw,26px);font-weight:700;color:var(--brand-d);text-align:center}
#tip{font-size:clamp(11px,1.8vw,14px);color:var(--muted);font-weight:600;text-align:center}

/* ═══ الأسئلة ═══ */
.qcard{width:min(100%,660px);padding:clamp(12px,2vh,22px) clamp(14px,3vw,26px);
  display:flex;flex-direction:column;align-items:center;gap:clamp(8px,1.5vh,16px)}
.qtop{display:flex;justify-content:space-between;width:100%;gap:10px;flex-wrap:wrap}
.stat{font-weight:800;font-size:clamp(13px,2vw,18px)}
.s1{color:var(--green)} .s2{color:var(--brand-d)} .s3{color:var(--teal)}
#qask{font-size:clamp(17px,3.6vw,28px);font-weight:800;text-align:center;line-height:1.5}
#qask u{text-decoration:none;background:linear-gradient(180deg,transparent 60%,#ffe0a8 60%)}
.opts{display:grid;grid-template-columns:repeat(2,1fr);gap:clamp(8px,1.6vw,14px);width:100%}
.opt{background:#fdf6ec;border:2.5px solid #f0e2cd;border-radius:16px;font-weight:800;
  font-size:clamp(22px,5vw,38px);padding:clamp(9px,1.6vh,18px);color:var(--ink);
  direction:ltr;unicode-bidi:isolate;transition:transform .12s,background .15s,border-color .15s}
.opt:hover:not(:disabled){border-color:var(--brand);transform:translateY(-2px)}
.opt.good{background:var(--green);border-color:var(--green);color:#fff;animation:bump .45s}
.opt.bad{background:var(--red);border-color:var(--red);color:#fff;animation:shk .4s}
@keyframes bump{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes shk{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.big{background:linear-gradient(180deg,var(--brand-l),var(--brand));color:#fff;font-weight:800;
  font-size:clamp(16px,3.2vw,22px);padding:13px 40px;border-radius:999px;
  box-shadow:0 7px 0 var(--brand-d),0 14px 26px rgba(207,95,28,.3);transition:.12s}
.big:active{transform:translateY(4px);box-shadow:0 3px 0 var(--brand-d)}
.big.ok{background:linear-gradient(180deg,#5cc98a,var(--green));box-shadow:0 7px 0 #1e7a48}
#fb{font-weight:800;font-size:clamp(15px,2.8vw,22px);min-height:1.5em;text-align:center}
#combo{font-weight:800;font-size:clamp(13px,2.2vw,18px);color:var(--brand);min-height:1.4em}
#timer{font-size:clamp(26px,6vw,48px);font-weight:800;color:var(--teal)}
#timer.hot{color:var(--red)}
.bar{width:100%;height:9px;background:#f0e6d8;border-radius:99px;overflow:hidden}
.bar>span{display:block;height:100%;border-radius:99px;
  background:linear-gradient(90deg,var(--green),var(--teal));transition:width .5s cubic-bezier(.2,1,.3,1)}

/* ═══ التقدّم ═══ */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;width:min(100%,880px)}
.tile{padding:clamp(10px,1.8vh,18px);text-align:center}
.tile b{display:block;font-size:clamp(22px,4.4vw,34px);color:var(--brand-d)}
.tile small{color:var(--muted);font-weight:700;font-size:clamp(11px,1.7vw,14px)}
#lvlList{width:min(100%,880px);display:flex;flex-direction:column;gap:9px}
.lvl{padding:clamp(9px,1.6vh,15px) clamp(12px,2.5vw,20px);display:flex;align-items:center;
  gap:12px;flex-wrap:wrap}
.lvl b{font-size:clamp(14px,2.3vw,19px);min-width:8.5em}
.lvl .bar{flex:1;min-width:120px}
.lvl span.pc{font-weight:800;color:var(--teal);font-size:clamp(13px,2vw,17px);min-width:3.4em;text-align:left}
.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%) translateY(180%);
  background:var(--ink);color:#fff;padding:11px 26px;border-radius:999px;font-weight:800;
  font-size:clamp(13px,2.2vw,17px);z-index:99;transition:transform .4s cubic-bezier(.2,1.5,.4,1);
  box-shadow:0 10px 30px rgba(0,0,0,.25)}
.toast.on{transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>

<a href="/games" style="position:fixed;top:10px;left:10px;z-index:99;display:flex;align-items:center;gap:6px;background:rgba(30,58,82,.92);color:#fff;font-weight:800;font-size:13px;line-height:1;padding:9px 14px;border-radius:999px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)">← ألعاب غراس</a>
<header>
  <div class="brandline">
    <div class="brand">الساعة <span>التفاعلية</span></div>
    <div class="tabs">
      <button class="tab on" data-v="explore">🕐 استكشاف</button>
      <button class="tab" data-v="read">🔎 كم الساعة؟</button>
      <button class="tab" data-v="set">🎯 اضبط الوقت</button>
      <button class="tab" data-v="race">⏱️ سباق</button>
      <button class="tab" data-v="prog">🗺️ تقدّمي</button>
    </div>
  </div>
  <div class="levels" id="lvlRow"></div>
  <div class="tools">
    <button class="chip on" id="tNum">الأرقام</button>
    <button class="chip" id="tMin">أرقام الدقائق</button>
    <button class="chip" id="t24">نظام ٢٤</button>
    <button class="chip" id="tSec">عقرب الثواني</button>
    <button class="chip" id="tNow">🕒 الوقت الآن</button>
    <button class="chip on" id="tSnd">🔊 الصوت</button>
  </div>
</header>

<!-- ═══ استكشاف ═══ -->
<section class="view on" id="v-explore">
  <div class="card" id="read">
    <div id="digital">…</div>
    <div id="words">…</div>
    <div id="tip">اسحب أيّ عقرب بإصبعك — عقرب الساعات يتحرّك تلقائيًا مع الدقائق تمامًا كالساعة الحقيقية</div>
  </div>
  <div id="clockWrap"></div>
</section>

<!-- ═══ كم الساعة؟ ═══ -->
<section class="view" id="v-read">
  <div class="card qcard">
    <div class="qtop">
      <span class="stat s1" id="rScore">النقاط ٠</span>
      <span class="stat s2" id="rCombo"></span>
      <span class="stat s3" id="rAcc">الدقّة ١٠٠٪</span>
    </div>
    <div id="qask">كم الساعة؟</div>
    <div class="opts" id="rOpts"></div>
    <div id="fb"></div>
  </div>
</section>

<!-- ═══ اضبط الوقت ═══ -->
<section class="view" id="v-set">
  <div class="card qcard">
    <div class="qtop">
      <span class="stat s1" id="sScore">النقاط ٠</span>
      <span class="stat s3" id="sAcc">الدقّة ١٠٠٪</span>
    </div>
    <div id="sAsk">…</div>
    <div id="sFb"></div>
    <button class="big ok" id="sCheck">تحقّق ✓</button>
  </div>
</section>

<!-- ═══ سباق ═══ -->
<section class="view" id="v-race">
  <div class="card qcard">
    <div class="qtop">
      <span class="stat s1" id="cScore">الصحيح ٠</span>
      <span class="stat s2" id="cBest">الأفضل ٠</span>
    </div>
    <div id="timer">٦٠</div>
    <div id="cBody" style="display:none;width:100%;flex-direction:column;align-items:center;gap:12px">
      <div id="cAsk">كم الساعة؟</div>
      <div class="opts" id="cOpts"></div>
    </div>
    <button class="big" id="cStart">ابدأ السباق</button>
  </div>
</section>

<!-- ═══ تقدّمي ═══ -->
<section class="view" id="v-prog">
  <div class="stats">
    <div class="card tile"><b id="pAns">٠</b><small>إجابة صحيحة</small></div>
    <div class="card tile"><b id="pAcc">١٠٠٪</b><small>الدقّة</small></div>
    <div class="card tile"><b id="pStreak">٠</b><small>أطول سلسلة</small></div>
    <div class="card tile"><b id="pBest">٠</b><small>أفضل سباق</small></div>
    <div class="card tile"><b id="pBadge">٠</b><small>أوسمة</small></div>
  </div>
  <div id="lvlList"></div>
  <button class="chip" id="reset">↺ بداية جديدة</button>
</section>

<div class="toast" id="toast"></div>

<script>
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const AR="٠١٢٣٤٥٦٧٨٩";
const ar=n=>String(n).replace(/\\d/g,d=>AR[d]);
const ar2=n=>ar(String(n).padStart(2,'0'));
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;};

/* ═══ التخزين ═══ */
const SK='ghiras-clock-v1'; let mem=null;
const store={load(){try{return JSON.parse(localStorage.getItem(SK))}catch(e){return mem}},
             save(d){try{localStorage.setItem(SK,JSON.stringify(d))}catch(e){mem=d}}};
const DEF={right:0,wrong:0,streak:0,best:0,score:0,lv:{}};
let D=Object.assign({},DEF,store.load()||{}); D.lv=D.lv||{};
const save=()=>store.save(D);

/* ═══ المستويات ═══ */
const LEVELS=[
  {s:60,n:'ساعات كاملة'},{s:30,n:'نصف ساعة'},{s:15,n:'ربع ساعة'},
  {s:5,n:'خمس دقائق'},{s:1,n:'دقيقة بدقيقة'}
];
let step=60;                                  // خطوة التقريب الحالية
const lvOf=s=>D.lv[s]||(D.lv[s]={r:0,w:0});
const GOAL=12;                                 // إجابات صحيحة لنيل الوسام

/* ═══ الحالة ═══ */
let T=190, pm=false;        // T = دقائق منذ ١٢:٠٠ (٠..٧١٩)
let showNum=true, showMin=false, show24=false, showSec=false, live=false, snd=true;
let mode='explore', liveTimer=null;

/* ═══ نطق الوقت بالعربية ═══ */
const HW=['الثانية عشرة','الواحدة','الثانية','الثالثة','الرابعة','الخامسة','السادسة',
          'السابعة','الثامنة','التاسعة','العاشرة','الحادية عشرة'];
function words(t){
  let h=Math.floor(t/60)%12, m=t%60;
  if(m===0) return HW[h]+' تمامًا';
  if(m===15) return HW[h]+' والربع';
  if(m===20) return HW[h]+' والثلث';
  if(m===30) return HW[h]+' والنصف';
  if(m===5)  return HW[h]+' وخمس دقائق';
  if(m===10) return HW[h]+' وعشر دقائق';
  if(m===25) return HW[h]+' والنصف إلا خمس دقائق';
  const nh=HW[(h+1)%12];
  if(m===35) return HW[h]+' والنصف وخمس دقائق';
  if(m===40) return nh+' إلا ثلثًا';
  if(m===45) return nh+' إلا الربع';
  if(m===50) return nh+' إلا عشر دقائق';
  if(m===55) return nh+' إلا خمس دقائق';
  return m<30 ? HW[h]+' و'+ar(m)+' دقيقة' : nh+' إلا '+ar(60-m)+' دقيقة';
}
function digital(t,p){
  let h=Math.floor(t/60)%12, m=t%60;
  if(show24){ let h24=(p?h+12:h)%24; return ar2(h24)+':'+ar2(m); }
  return ar(h===0?12:h)+':'+ar2(m);
}
const ampm=p=>p?'مساءً':'صباحًا';
function setRead(){
  $('#digital').innerHTML=digital(T,pm)+(show24?'':\`<small>&nbsp;\${ampm(pm)}</small>\`);
  $('#words').textContent=words(T)+' '+ampm(pm);
}

/* ═══ رسم وجه الساعة ═══ */
const SZ=400, C=200, R=180;
const pol=(a,r)=>[C+r*Math.sin(a*Math.PI/180), C-r*Math.cos(a*Math.PI/180)];
function face(){
  let s=\`<svg viewBox="0 0 \${SZ} \${SZ}">
  <defs>
    <radialGradient id="fg" cx="38%" cy="32%"><stop offset="0" stop-color="#fffdf8"/>
      <stop offset="1" stop-color="#f7ecdc"/></radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd9a8"/><stop offset="1" stop-color="#e08b3a"/></linearGradient>
  </defs>
  <circle cx="\${C}" cy="\${C}" r="\${R+16}" fill="url(#rim)"/>
  <circle cx="\${C}" cy="\${C}" r="\${R+6}" fill="#fff6e6"/>
  <circle cx="\${C}" cy="\${C}" r="\${R}" fill="url(#fg)"/>\`;
  /* العلامات */
  for(let i=0;i<60;i++){
    const a=i*6, big=i%5===0;
    const [x1,y1]=pol(a,big?R-4:R-3), [x2,y2]=pol(a,big?R-20:R-11);
    s+=\`<line x1="\${x1}" y1="\${y1}" x2="\${x2}" y2="\${y2}" class="tick\${big?'5':''}"
        stroke-width="\${big?4.5:1.8}" stroke-linecap="round"/>\`;
  }
  /* عند إظهار أرقام الدقائق نزيح أرقام الساعات للداخل حتى لا تتزاحم */
  const rH = showMin ? R-64 : R-46;
  const r24 = showMin ? R-94 : R-76;
  /* أرقام الساعات */
  if(showNum) for(let i=1;i<=12;i++){
    const [x,y]=pol(i*30,rH);
    s+=\`<text x="\${x}" y="\${y}" class="numH" font-size="\${showMin?30:34}" text-anchor="middle"
         dominant-baseline="central">\${ar(i)}</text>\`;
  }
  /* أرقام نظام ٢٤ */
  if(show24) for(let i=1;i<=12;i++){
    const [x,y]=pol(i*30,r24); const v=i===12?0:i+12;
    s+=\`<text x="\${x}" y="\${y}" class="num24" font-size="19" text-anchor="middle"
         dominant-baseline="central">\${ar2(v)}</text>\`;
  }
  /* أرقام الدقائق — داخل حلقة العلامات مباشرة */
  if(showMin) for(let i=0;i<12;i++){
    const [x,y]=pol(i*30,R-31); const v=i*5;
    s+=\`<text x="\${x}" y="\${y}" class="numM" font-size="18" text-anchor="middle"
         dominant-baseline="central">\${ar2(v)}</text>\`;
  }
  /* العقارب */
  /* لكل عقرب مساحة لمس عريضة شفافة حتى يسهل على الأطفال إمساكه */
  s+=\`<g id="hourG"><g class="hand" id="hourH">
        <line x1="\${C}" y1="\${C+26}" x2="\${C}" y2="\${C-104}" stroke="transparent" stroke-width="40"/>
        <line x1="\${C}" y1="\${C+22}" x2="\${C}" y2="\${C-98}" stroke="#e07a2f"
              stroke-width="15" stroke-linecap="round"/>
        <circle cx="\${C}" cy="\${C-98}" r="7.5" fill="#e07a2f"/></g></g>
      <g id="minG"><g class="hand" id="minH">
        <line x1="\${C}" y1="\${C+32}" x2="\${C}" y2="\${C-152}" stroke="transparent" stroke-width="34"/>
        <line x1="\${C}" y1="\${C+28}" x2="\${C}" y2="\${C-146}" stroke="#159c9c"
              stroke-width="9.5" stroke-linecap="round"/>
        <circle cx="\${C}" cy="\${C-146}" r="5.5" fill="#159c9c"/></g></g>\`;
  if(showSec) s+=\`<g id="secG"><line x1="\${C}" y1="\${C+34}" x2="\${C}" y2="\${C-158}"
        stroke="#e0574f" stroke-width="2.6" stroke-linecap="round"/></g>\`;
  s+=\`<circle cx="\${C}" cy="\${C}" r="11" fill="#1e3a52"/>
      <circle cx="\${C}" cy="\${C}" r="4.5" fill="#fff6e6"/></svg>\`;
  $('#clockWrap').innerHTML=s;
  bindHands(); render(true);
}
function render(noAnim){
  const hg=$('#hourG'), mg=$('#minG');
  if(!hg) return;
  hg.classList.toggle('nt',!!noAnim); mg.classList.toggle('nt',!!noAnim);
  hg.setAttribute('transform',\`rotate(\${T*0.5} \${C} \${C})\`);
  mg.setAttribute('transform',\`rotate(\${(T%60)*6} \${C} \${C})\`);
  setRead();
}

/* ═══ سحب العقارب ═══ */
let drag=null;
function angleAt(e){
  const r=$('#clockWrap').getBoundingClientRect();
  const t=e.touches?e.touches[0]:e;
  const dx=(t.clientX-r.left)/r.width*SZ-C, dy=(t.clientY-r.top)/r.height*SZ-C;
  return ((Math.atan2(dx,-dy)*180/Math.PI)+360)%360;
}
/* المسافة الزاوية بين زاويتين (٠..١٨٠) */
const adist=(a,b)=>{const d=Math.abs(((a-b)%360+360)%360); return d>180?360-d:d;};
function radiusAt(e){
  const r=$('#clockWrap').getBoundingClientRect();
  const t=e.touches?e.touches[0]:e;
  const dx=(t.clientX-r.left)/r.width*SZ-C, dy=(t.clientY-r.top)/r.height*SZ-C;
  return Math.hypot(dx,dy);
}
/* نختار العقرب الأقرب فعلًا للإصبع — لا الذي فوقه في الرسم */
function bindHands(){
  $('#clockWrap').addEventListener('pointerdown',e=>{
    if(live) return;
    const rp=radiusAt(e); if(rp>158) return;     // خارج مدى العقارب
    const a=angleAt(e), dh=adist(a,T*0.5), dm=adist(a,(T%60)*6);
    /* سماحية بالمسافة لا بالزاوية: قريب من المركز = سماحية أوسع */
    const tol=Math.max(10,Math.min(45,Math.atan2(30,Math.max(rp,20))*180/Math.PI));
    if(Math.min(dh,dm)>tol) return;
    if(rp>106) drag='min';                       // أبعد من طول عقرب الساعات
    else if(dh<dm-2) drag='hour';
    else if(dm<dh-2) drag='min';
    else drag = rp<70 ? 'hour' : 'min';          // متطابقان تقريبًا → القرب من المركز يرجّح الساعات
    $('#'+drag+'H').classList.add('drag');
    e.preventDefault();
  });
}
window.addEventListener('pointermove',e=>{
  if(!drag) return;
  const a=angleAt(e);
  let want = drag==='hour' ? a*2 : (Math.floor(T/60)*60 + a/6);   // بالدقائق
  want = Math.round(want/step)*step;
  let d=want-T; if(d>360)d-=720; if(d<-360)d+=720;                 // أقصر مسار
  let abs=T+d;
  if(abs>=720){pm=!pm} if(abs<0){pm=!pm}                           // عبور منتصف الليل/النهار
  const old=T; T=((abs%720)+720)%720;
  if(T!==old){ render(true); if(step>=15) tick(); }
});
window.addEventListener('pointerup',()=>{
  if(!drag) return;
  $$('.hand').forEach(h=>h.classList.remove('drag')); drag=null; render();
});

/* ═══ الصوت ═══ */
let actx=null;
function beep(f,dur=.12,type='sine',vol=.15){
  if(!snd) return;
  try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    const o=actx.createOscillator(),g=actx.createGain();
    o.type=type;o.frequency.value=f;o.connect(g);g.connect(actx.destination);
    const t=actx.currentTime; g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+.01); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.start(t);o.stop(t+dur+.02);
  }catch(e){}
}
const SC=[523,587,659,784,880,1046,1175,1318];
const tick=()=>beep(1500,.03,'square',.05);
const good=s=>{const f=SC[Math.min(s,SC.length-1)];beep(f,.14);setTimeout(()=>beep(f*1.5,.1,'sine',.08),70)};
const bad=()=>{beep(200,.15,'triangle',.12);setTimeout(()=>beep(150,.19,'triangle',.1),90)};
const win=()=>[0,120,240,400].forEach((d,i)=>setTimeout(()=>beep(SC[i*2]||880,.2),d));

/* ═══ توليد الأوقات ═══ */
const randT=()=>{
  const slots=Math.floor(720/step);
  let t=((Math.random()*slots)|0)*step;
  if(step===60) t=(((Math.random()*12)|0))*60;
  return t;
};
function optsFor(t){
  const s=new Set([t]); let g=0;
  while(s.size<4 && g++<60){
    const d=[step,-step,step*2,-step*2,60,-60,step*3][(Math.random()*7)|0];
    const v=((t+d)%720+720)%720;
    s.add(v);
  }
  while(s.size<4) s.add(((Math.random()*(720/step))|0)*step);
  return shuffle([...s]);
}
function fmt(t){ let h=Math.floor(t/60)%12, m=t%60; return ar(h===0?12:h)+':'+ar2(m); }

/* ═══ تسجيل النتيجة ═══ */
function record(ok){
  const L=lvOf(step);
  if(ok){ D.right++; L.r++; D.streak++; D.bestStreak=Math.max(D.bestStreak||0,D.streak); }
  else  { D.wrong++; L.w++; D.streak=0; }
  save(); updProg();
}
const acc=()=>{const t=D.right+D.wrong; return t?Math.round(D.right/t*100):100;};
const badges=()=>LEVELS.filter(l=>{const L=D.lv[l.s]; return L&&L.r>=GOAL&&L.r/(L.r+L.w)>=.8;}).length;

/* ═══ كم الساعة؟ ═══ */
let rCur=null, rLock=false, rStreak=0, rScore=0;
function readQ(){
  rCur=randT(); rLock=false; T=rCur; pm=false; render(true);
  $('#qask').innerHTML='كم الساعة التي يشير إليها العقربان؟';
  const box=$('#rOpts'); box.innerHTML='';
  optsFor(rCur).forEach(v=>{
    const b=document.createElement('button'); b.className='opt'; b.textContent=fmt(v);
    b.onclick=()=>{
      if(rLock) return; rLock=true;
      const ok=v===rCur; record(ok);
      b.classList.add(ok?'good':'bad');
      if(ok){ rStreak++; rScore+=10*(rStreak>=6?3:rStreak>=3?2:1); good(rStreak-1);
        $('#fb').innerHTML=\`<span style="color:var(--green)">أحسنت! \${words(rCur)}</span>\`; }
      else{ rStreak=0; bad();
        $$('#rOpts .opt').forEach(x=>{if(x.textContent===fmt(rCur))x.classList.add('good');x.disabled=true});
        $('#fb').innerHTML=\`<span style="color:var(--red)">الصحيح: \${words(rCur)}</span>\`; }
      $('#rScore').textContent='النقاط '+ar(rScore);
      $('#rCombo').textContent=rStreak>=3?\`🔥 سلسلة \${ar(rStreak)}\`:'';
      $('#rAcc').textContent='الدقّة '+ar(acc())+'٪';
      setTimeout(readQ, ok?900:1900);
    };
    box.appendChild(b);
  });
  $('#fb').textContent='';
}

/* ═══ اضبط الوقت ═══ */
let sTarget=null, sScore=0, sStreak=0;
function setQ(){
  sTarget=randT();
  T=(sTarget+180+((Math.random()*300)|0))%720; pm=false; render(true);   // ابدأ من وقت مختلف
  $('#sAsk').innerHTML=\`اضبط العقارب على <u>\${words(sTarget)}</u>\`;
  $('#sFb').textContent=''; $('#sCheck').disabled=false;
}
$('#sCheck')?.addEventListener('click',()=>{
  if(sTarget===null) return;
  const ok=T===sTarget; record(ok);
  if(ok){ sStreak++; sScore+=10; good(sStreak-1);
    $('#sFb').innerHTML=\`<span style="color:var(--green)">ممتاز! \${fmt(sTarget)} ✅</span>\`;
    $('#sCheck').disabled=true; setTimeout(setQ,1400);
  }else{
    sStreak=0; sScore=Math.max(0,sScore-2); bad();
    const diff=Math.min(((T-sTarget)%720+720)%720, ((sTarget-T)%720+720)%720);
    $('#sFb').innerHTML=\`<span style="color:var(--red)">قريب! أنت على \${fmt(T)} — \`+
      (diff<=15?'حرّك العقارب قليلًا':'راجع عقرب الساعات أولًا')+\`</span>\`;
  }
  $('#sScore').textContent='النقاط '+ar(sScore);
  $('#sAcc').textContent='الدقّة '+ar(acc())+'٪';
});

/* ═══ السباق ═══ */
let cT=60,cScore=0,cTimer=null,cCur=null,cLock=false;
function raceStart(){
  cT=60;cScore=0; $('#cStart').style.display='none'; $('#cBody').style.display='flex';
  $('#timer').textContent=ar(60); $('#timer').className='';
  $('#cScore').textContent='الصحيح ٠'; raceQ();
  clearInterval(cTimer);
  cTimer=setInterval(()=>{
    cT--; $('#timer').textContent=ar(cT);
    if(cT<=10){ $('#timer').className='hot'; beep(880,.05,'square',.06); }
    if(cT<=0) raceEnd();
  },1000);
}
function raceQ(){
  cCur=randT(); cLock=false; T=cCur; pm=false; render(true);
  const box=$('#cOpts'); box.innerHTML='';
  optsFor(cCur).forEach(v=>{
    const b=document.createElement('button'); b.className='opt'; b.textContent=fmt(v);
    b.onclick=()=>{
      if(cLock)return; cLock=true;
      const ok=v===cCur; record(ok); b.classList.add(ok?'good':'bad');
      if(ok){cScore++;good(cScore-1);$('#cScore').textContent='الصحيح '+ar(cScore);} else bad();
      setTimeout(raceQ, ok?250:700);
    };
    box.appendChild(b);
  });
}
function raceEnd(){
  clearInterval(cTimer); $('#cBody').style.display='none';
  $('#cStart').style.display=''; $('#cStart').textContent='سباق جديد';
  if(cScore>D.best){ D.best=cScore; save(); toast(\`🏆 رقم قياسي: \${ar(cScore)}\`); win(); }
  else toast(\`انتهى الوقت — \${ar(cScore)} صحيحة\`);
  $('#cBest').textContent='الأفضل '+ar(D.best);
  $('#timer').textContent=ar(cScore); $('#timer').className='';
  updProg();
}

/* ═══ التقدّم ═══ */
function updProg(){
  $('#pAns').textContent=ar(D.right);
  $('#pAcc').textContent=ar(acc())+'٪';
  $('#pStreak').textContent=ar(D.bestStreak||0);
  $('#pBest').textContent=ar(D.best);
  $('#pBadge').textContent=ar(badges())+'/'+ar(LEVELS.length);
  $('#cBest').textContent='الأفضل '+ar(D.best);
  const w=$('#lvlList'); w.innerHTML='';
  LEVELS.forEach(l=>{
    const L=D.lv[l.s]||{r:0,w:0}, pc=Math.min(100,Math.round(L.r/GOAL*100));
    const done=L.r>=GOAL&&L.r/(L.r+L.w||1)>=.8;
    const d=document.createElement('div'); d.className='card lvl';
    d.innerHTML=\`<b>\${done?'🏅 ':''}\${l.n}</b>
      <div class="bar"><span style="width:\${pc}%"></span></div>
      <span class="pc">\${ar(L.r)}/\${ar(GOAL)}</span>\`;
    w.appendChild(d);
  });
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');
  clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2300);}

/* ═══ المستويات والأدوات ═══ */
function renderLv(){
  const row=$('#lvlRow'); row.innerHTML='';
  LEVELS.forEach(l=>{
    const b=document.createElement('button');
    b.className='chip'+(step===l.s?' on':''); b.textContent=l.n;
    b.onclick=()=>{ step=l.s; renderLv();
      T=Math.round(T/step)*step%720; render(true);
      if(mode==='read')readQ(); if(mode==='set')setQ(); };
    row.appendChild(b);
  });
}
const tog=(id,fn)=>$(id).onclick=e=>{ const on=fn(); e.target.classList.toggle('on',on); face(); };
tog('#tNum',()=>showNum=!showNum);
tog('#tMin',()=>showMin=!showMin);
tog('#t24',()=>show24=!show24);
tog('#tSec',()=>showSec=!showSec);
$('#tNow').onclick=e=>{
  live=!live; e.target.classList.toggle('on',live);
  clearInterval(liveTimer);
  if(live){ const upd=()=>{ const d=new Date();
      T=(d.getHours()%12)*60+d.getMinutes(); pm=d.getHours()>=12;
      render(true);
      const sg=$('#secG'); if(sg) sg.setAttribute('transform',\`rotate(\${d.getSeconds()*6} \${C} \${C})\`);
    }; upd(); liveTimer=setInterval(upd,1000); toast('الساعة تتبع وقت الجهاز الآن'); }
  else toast('عدنا للوضع اليدوي — اسحب العقارب');
};
$('#tSnd').onclick=e=>{ snd=!snd; e.target.classList.toggle('on',snd);
  e.target.textContent=snd?'🔊 الصوت':'🔇 صامت'; if(snd) beep(660,.1); };

$$('.tab').forEach(t=>t.onclick=()=>{
  $$('.tab').forEach(x=>x.classList.remove('on')); t.classList.add('on');
  mode=t.dataset.v;
  $$('.view').forEach(v=>v.classList.remove('on'));
  $('#v-'+mode).classList.add('on');
  clearInterval(cTimer);
  const cw=$('#clockWrap');
  if(mode==='prog'){ updProg(); }
  else { $('#v-'+mode).appendChild(cw);            // الساعة تنتقل مع التبويب
         cw.classList.toggle('sm', mode!=='explore'); }
  if(mode==='read') readQ();
  if(mode==='set') setQ();
  if(mode==='race'){ $('#cBody').style.display='none'; $('#cStart').style.display='';
                     $('#timer').textContent=ar(60); $('#timer').className=''; }
  if(mode==='explore') render(true);
});
$('#cStart').onclick=raceStart;
let armed=false;
$('#reset').onclick=e=>{
  if(!armed){ armed=true; e.target.textContent='⚠️ متأكد؟ اضغط مرة أخرى'; e.target.classList.add('on');
    setTimeout(()=>{armed=false;e.target.textContent='↺ بداية جديدة';e.target.classList.remove('on')},4000);
    return; }
  armed=false; e.target.textContent='↺ بداية جديدة'; e.target.classList.remove('on');
  D=JSON.parse(JSON.stringify(DEF)); D.lv={}; save();
  rScore=0;sScore=0;rStreak=0;sStreak=0; updProg(); toast('تمّت البداية الجديدة ✨');
};

/* ═══ تشغيل ═══ */
renderLv(); face(); updProg();
</script>
<footer style="padding:6px 0 10px;color:var(--muted);font-weight:700;font-size:clamp(10px,1.6vw,13px);text-align:center">🌱 حقوق الطبع محفوظة لشركة غراس المعلم</footer>
</body>
</html>
`;
