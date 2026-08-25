#!/usr/bin/env node
/**
 * اختبارات الساعة التفاعلية + صيد البالون.
 *
 * أهم ما يُحرس: الساعة منتج مستقل لا يقرأ sub_end (Model B)، والأدمِن
 * غير محدود، والموقوف ممنوع، وNULL/منتهٍ = قفل. والبالون على الرصيد
 * المشترك: المعاينة بلا خصم، والخصم عند التشغيل وحده، ولا أسئلة
 * تجريبية، ولا HTML خارجي يُنفَّذ، والخلط لا يفصل الصحيح عن خياره.
 */
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) passed++; else { failed++; console.error(`  ❌ ${name}`); } };

console.log("\n═══ ١ · الساعة — route الحارس ═══");
{
  const r = readFileSync("src/app/clock/route.ts", "utf8");
  check("A) الأدمِن يفتح بلا شرط تاريخ", r.includes("isAdmin ||"));
  check("B) الفتح يتطلب clock_until مستقبلية", r.includes("new Date(until) > new Date()"));
  check("C+D) لا until (NULL) أو منتهية → clock-locked", r.includes("!!until") && r.includes("/clock-locked"));
  // ⚠️ تعليق الملف يذكر sub_end شرحًا — يُفحص سطر select لا النص الحر
  check("E) Model B: استعلام الساعة لا يقرأ sub_end", /select\('role, status, clock_until'\)/.test(r.replace(/\s+/g, ' ')) || r.includes("select('role, status, clock_until')"));
  check("F) الموقوف ممنوع ولو ساعته سارية", r.includes("p?.status !== 'suspended'"));
  check("G) السحب (until=NULL عبر admin_set_tool) يقفل — نفس فحص !!until", r.includes("!!until"));
  check("لا رصيد ألعاب في الساعة", !r.includes("game_credits") && !r.includes("game-consume"));
  check("تسجيل الدخول شرط أول", r.indexOf("auth.getUser") < r.indexOf(".from('profiles')"));
}

console.log("═══ ٢ · الساعة — المحتوى المضمّن ═══");
{
  const h = readFileSync("src/app/clock/game-html.ts", "utf8");
  check("خطاب المذكّر: لا «متأكدة/اضغطي»", !h.includes("متأكدة") && !h.includes("اضغطي"));
  check("حقوق الطبع لشركة غراس المعلم", h.includes("حقوق الطبع محفوظة لشركة غراس المعلم"));
  check("زر العودة لألعاب غراس", h.includes('href="/games"'));
  check("المحرك سليم: المستويات الخمسة باقية", h.includes("دقيقة بدقيقة") && h.includes("ساعات كاملة"));
  check("لا AI ولا أسئلة دروس في الساعة", !h.includes("game-ai") && !h.includes("consume"));
}

console.log("═══ ٣ · الساعة — صفحة القفل بلا سعر مخترع ═══");
{
  const l = readFileSync("src/app/clock-locked/page.tsx", "utf8");
  check("نص التفعيل المحايد", l.includes("لتفعيل الساعة التفاعلية، تواصل مع إدارة غراس المعلم"));
  check("لا رقم مالي: لا «د.ك» ولا «دنانير»", !l.includes("د.ك") && !l.includes("دنانير") && !l.includes("دينار"));
}

console.log("═══ ٤ · حسابي ولوحة الأدمِن — الاستحقاق التاسع ═══");
{
  const e = readFileSync("src/lib/entitlements.ts", "utf8");
  const tools = [...e.matchAll(/'(\w+_until)',/g)].map((m) => m[1]);
  check("TOOL_COLS ثمانية أعمدة", tools.length === 8 && tools.includes("clock_until"));
  const names = [...e.matchAll(/^\s{2}(\w+): '/gm)].map((m) => m[1]);
  check("تسعة منتجات مسماة (sub_end + ٨ أدوات)", names.length === 9 && names.includes("clock_until") && names[0] === "sub_end");
  check("الاسم «الساعة التفاعلية»", e.includes("clock_until: 'الساعة التفاعلية'"));
  const a = readFileSync("src/components/AdminPanel.tsx", "utf8");
  check("اللوحة: clock_until في TOOL_COLS", a.includes("'clock_until',"));
  check("اللوحة: أداة clock بالاسم والرمز", a.includes("{ key: 'clock', label: 'الساعة التفاعلية', emoji: '🕐' }"));
  check("المنح عبر admin_set_tool القائمة — لا نظام جديدًا", a.includes("admin_set_tool") && !a.includes("admin_set_clock"));
}

console.log("═══ ٥ · البالون — الرصيد المشترك ═══");
{
  const b = readFileSync("src/app/balloons/page.tsx", "utf8");
  // ⚠️ GAME_JS سطر واحد مهرَّب — يُفحص عدد الاستدعاءات وموضعها لا حدود الدوال
  check("A) المعاينة لا تخصم: استدعاء consumeCredit واحد فقط", (b.match(/await consumeCredit\(\)/g) || []).length === 1);
  check("A) وذلك الاستدعاء داخل openGame وحده", /async function openGame\(\)[\s\S]{0,400}await consumeCredit\(\)/.test(b));
  check("B) الخصم عند التشغيل وحده عبر المسار القائم", b.includes("game-consume") && /async function openGame\(\)[\s\S]{0,400}consumeCredit\(\)/.test(b));
  check("C) الأدمِن بلا خصم", b.includes("if(IS_ADMIN) return {ok:true,unlimited:true}"));
  check("D) صفر رصيد → نافذة الشراء القائمة (402/no_credit)", b.includes("showBuy()"));
  check("لا استحقاق مستقلًا للبالون", !b.includes("balloon_until"));
  check("التوليد عبر game-ai القائم", b.includes("/api/game-ai"));
  check("مكتبة الألعاب بنوعها الخاص", b.includes("TYPE='balloons'"));
}

console.log("═══ ٦ · البالون — أمان السؤال والخلط ═══");
{
  const b = readFileSync("src/app/balloons/page.tsx", "utf8");
  check("E) نص السؤال بـtextContent لا innerHTML", b.includes("getElementById('bqtext').textContent=q.q"));
  check("E) لا innerHTML على عنصر السؤال", !b.includes("getElementById('bqtext').innerHTML"));
  check("H) لا أسئلة تجريبية: لا QUESTIONS ولا demoPlay", !b.includes("const QUESTIONS") && !b.includes("demoPlay"));
  check("F) فيشر–ييتس يخلط كائنات {text,correct} كاملة", b.includes("correct:i===q.correct") && /fshuffle=a=>\{for\(let i=a\.length-1;i>0;i--\)/.test(b));
  check("F) الإصابة تُحكم بوسم الكائن لا بموقعه", b.includes("if(b.correct){"));
  check("المعاينة والقوائم تُهرَّب بـesc", b.includes("esc(q.q)"));
}

console.log("═══ ٧ · G) الصحيح يظهر في المواقع الأربعة — تشغيل فيشر–ييتس فعليًا ═══");
{
  const fshuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const seen = new Set();
  for (let t = 0; t < 400; t++) {
    const q = { options: ["أ", "ب", "ج", "د"], correct: 2 };
    const opts = fshuffle(q.options.map((x, i) => ({ text: x, correct: i === q.correct })));
    const pos = opts.findIndex((o) => o.correct);
    check("تطابق الصحيح مع خياره بعد الخلط", opts[pos].text === "ج");
    seen.add(pos);
    if (seen.size === 4 && t > 40) break;
  }
  check("الصحيح ظهر في A/B/C/D كلها", seen.size === 4);
}

console.log("═══ ٨ · لا ارتداد على القائم ═══");
{
  const m = readFileSync("src/app/multiplication/route.ts", "utf8");
  check("جدول الضرب كما هو: عموده وقفله", m.includes("multiplication_until") && m.includes("/multiplication-locked"));
  const g = readFileSync("src/app/games/page.tsx", "utf8");
  check("بطاقات الألعاب السبع كلها", ["/clock", "/balloons", "/multiplication", "/millionaire", "/snake", "/xo", "/sinjim"].every((h) => g.includes(`href: '${h}'`)));
  const mil = readFileSync("src/app/millionaire/page.tsx", "utf8");
  check("المليون لم يُمس: نوع مكتبته باقٍ", mil.includes("TYPE='millionaire'"));
}


console.log("═══ دفعة إصلاحات QA — الحفظ والصوت والبطاقات وادعاء النطق ═══");
{
  const api = readFileSync("src/app/api/saved-games/route.ts", "utf8");
  check("saved-games تقبل النوع balloons", api.includes("'balloons'"));

  const b = readFileSync("src/app/balloons/page.tsx", "utf8");
  check("الحفظ بنفس عقد المكتبة: TYPE balloons", b.includes("TYPE='balloons'"));
  check("commitSave عند التشغيل الأول فقط (داخل حارس COMMITTED)",
    /if\(!COMMITTED\)\{[\s\S]{0,400}GHLib\.commitSave/.test(b.replace(/\\n/g,"\n")));
  check("فتح المحفوظة يستعيد COMMITTED — لا خصم ثانٍ", b.includes("COMMITTED=!!d.committed"));
  check("مؤثرات: إطلاق وإصابة وخطأ وفوز", ["SFX.launch()","SFX.correct()","SFX.wrong()","SFX.win()"].every(x=>b.includes(x)));
  check("الصوت كسول بعد لمسة — لا تشغيل تلقائي", b.includes("createOscillator") && !b.includes("autoplay"));
  check("القصير داخل البالون والطويل بطاقة", b.includes("drawOptText") && b.includes("wrapText") && b.includes("roundRect"));
  check("الهدف المصاب يبقى البالون — البطاقة لافتة", b.includes("b._sx=x;") && !b.includes("cardHit"));
  check("حد أدنى مقروء للخط داخل البالون", b.includes("Math.max(12,r*0.3)"));

  const cl = readFileSync("src/app/clock-locked/page.tsx", "utf8");
  const gp = readFileSync("src/app/games/page.tsx", "utf8");
  check("لا ادعاء نطق في نصوص الساعة الظاهرة", !cl.includes("نطق") && !gp.includes("نطق"));
}


console.log("═══ صوت الساعة — إيقاظ Safari والتكة المكبوحة ═══");
{
  const c = readFileSync("src/app/clock/game-html.ts", "utf8");
  check("resume عند كل beep", c.includes("if(actx.state==='suspended')actx.resume()"));
  check("إيقاظ عند pointerdown — تفعيل مستخدم حقيقي", c.includes("window.addEventListener('pointerdown'"));
  check("تكة مكبوحة زمنيًا لا لكل بكسل", c.includes("lastTick<70"));
  check("التكة لكل المستويات — قيد step>=15 زال", !c.includes("if(step>=15) tick()"));
  check("أصوات النجاح والخطأ قائمة", c.includes("const good=") && c.includes("const bad=") && c.includes("const win="));
  check("لا موسيقى خلفية — نغمات قصيرة فقط", !/loop|backgroundMusic|Audio\(/.test(c));
  check("فشل الصوت مبتلَع لا يوقف اللعبة", c.includes("}catch(e){}"));
}


console.log("═══ مسار الحفظ كاملًا — القيد كان في القاعدة لا في الـAPI وحده ═══");
{
  const api = readFileSync("src/app/api/saved-games/route.ts", "utf8");
  check("API تقبل balloons وتردّ رسالة الخطأ لا تبتلعها", api.includes("'balloons'") && api.includes("error.message"));
  const mig = readFileSync("supabase/2026-08-26-saved-games-balloons.sql", "utf8");
  check("هجرة القيد تعيد تعريفه بالأنواع الخمسة",
    mig.includes("saved_games_game_type_check") && mig.includes("'balloons'") && mig.includes("drop constraint if exists"));
  check("الهجرة لا تنشئ جدولًا ولا عمودًا ولا RLS", !/create table|add column|policy/i.test(mig));

  const b = readFileSync("src/app/balloons/page.tsx", "utf8");
  check("بطاقة المكتبة تعرف أيقونة البالون", b.includes("balloons:'🎈'"));
  check("فتح المحفوظة يمر بـ__libApply ويستعيد الأسئلة", b.includes("__libApply") && b.includes("d.questions"));
  check("لا معاملة خاصة للأدمِن في الحفظ — يحفظ كالجميع", !api.includes("is_admin") && !api.includes("role"));
}

console.log(`\n  الألعاب: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
