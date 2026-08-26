#!/usr/bin/env node
/* مركز الدعم — حراس العقد والأمان (فحص نصي للمصدر) */
import { readFileSync } from "node:fs";
let passed=0, failed=0;
const check=(n,c)=>{ if(c) passed++; else { failed++; console.error(`  ❌ ${n}`); } };

console.log("\n═══ ١ · الهجرة: عزل RLS ═══");
{
  const m = readFileSync("supabase/2026-08-27-support-center.sql","utf8");
  check("جدولا المحادثات والرسائل مع الحالات الأربع",
    m.includes("support_conversations") && m.includes("support_messages") &&
    ["open","needs_human","human_handling","closed"].every(s=>m.includes(`'${s}'`)));
  check("RLS مفعلة على الجدولين", (m.match(/enable row level security/g)||[]).length === 2);
  check("A لا ترى B: القراءة بـauth.uid() أو is_admin",
    m.includes("user_id = auth.uid() or public.is_admin()"));
  check("A لا تكتب في محادثة B: إدراج المستخدمة مقيد بملكيتها وباسمها",
    m.includes("sender_type = 'user'") && m.includes("sender_user_id = auth.uid()") &&
    m.includes("c.user_id = auth.uid()"));
  check("الأدمِن يرد بصفته عبر is_admin", m.includes("sender_type = 'admin'") && m.includes("public.is_admin()"));
  check("المغلقة لا تستقبل رسائل مستخدمة", m.includes("c.status <> 'closed'"));
  check("فهارس القوائم والصندوق", (m.match(/create index/g)||[]).length >= 3);
  check("لا مساس بجداول غراس القائمة", !/alter table public\.(profiles|saved_games)/.test(m));
}

console.log("═══ ٢ · مسار الإرسال: العقد الحاكم ═══");
{
  const r = readFileSync("src/app/api/support/send/route.ts","utf8");
  check("AI ROUTE REQUIRES AUTH", r.includes("SIGN_IN_REQUIRED"));
  check("رسالة المستخدمة تُحفظ قبل أي ذكاء", r.indexOf("تُحفظ أولًا") < r.indexOf("aiAnswer(") && r.indexOf("support_messages').insert") < r.indexOf("const ai = await aiAnswer"));
  check("بعد استلام الإدارة لا يرد الذكاء", r.includes("handling_mode === 'ai'") && r.includes("!== 'human_handling'"));
  check("تعطل الذكاء = تحويل لا انهيار", r.includes("if (!ai) return escalate()"));
  check("التحويل يكتب needs_human ورسالة نظامية", r.includes("needs_human") && r.includes("تم تحويل محادثتك"));
  check("كلمات حساسة تُحوَّل بلا اجتهاد", r.includes("ESCALATE_HINTS"));
  check("كوابح: فارغة وطويلة ومتسارعة", r.includes("EMPTY_MESSAGE") && r.includes("MESSAGE_TOO_LONG") && r.includes("RATE_LIMITED"));
  check("المفتاح خادمي فقط", r.includes("process.env.ANTHROPIC_API_KEY"));
  check("سياق المستخدمة قراءة فقط لأعمدة محدودة", r.includes("game_credits") && !r.includes("select('*')"));
  check("المعرفة المعتمدة هي المصدر", r.includes("SUPPORT_KNOWLEDGE"));
}

console.log("═══ ٣ · الأفعال والحراسة ═══");
{
  const st = readFileSync("src/app/api/support/state/route.ts","utf8");
  check("أفعال الإدارة خلف ADMIN_ONLY", st.indexOf("ADMIN_ONLY") < st.indexOf("'takeover'"));
  check("الاستلام = human + human_handling", st.includes("handling_mode: 'human'") && st.includes("status: 'human_handling'"));
  check("إعادة الرد الآلي زر صريح", st.includes("reactivate_ai"));
  check("رد الإدارة يستلم المحادثة ضمنًا", /reply[\s\S]*handling_mode: 'human'/.test(st));
}

console.log("═══ ٤ · الواجهات ═══");
{
  const u = readFileSync("src/app/support/page.tsx","utf8");
  check("لا هوية تُطلب من المستخدمة — الجلسة هي المصدر", !u.includes("placeholder=\"البريد") && !u.includes("user id"));
  check("مؤشر الرد الجديد", u.includes("user_seen_at < c.last_message_at"));
  check("إغلاق المحادثة متاح للمستخدمة", u.includes("action: 'close'"));
  check("لا مفاتيح في العميل", !u.includes("ANTHROPIC") && !u.includes("SERVICE_ROLE"));
  const a = readFileSync("src/components/AdminSupportInbox.tsx","utf8");
  check("فلاتر الصندوق الأربعة+", a.includes("تحتاج الإدارة") && a.includes("تحت المتابعة") && a.includes("مغلقة"));
  check("أزرار الاستلام والإعادة والإغلاق والرد", ["takeover","reactivate_ai","close","reply"].every(x=>a.includes(x)));
  check("لا مفاتيح في العميل (أدمِن)", !a.includes("ANTHROPIC") && !a.includes("SERVICE_ROLE"));
  const g = readFileSync("src/app/admin/support/page.tsx","utf8");
  check("صفحة الأدمِن بحارس الدور نفسه", g.includes("role !== 'admin'"));
  const acc = readFileSync("src/app/account/page.tsx","utf8");
  check("رابط تواصل معنا في حسابي", acc.includes("/support") && acc.includes("تواصل معنا"));
  const ap = readFileSync("src/components/AdminPanel.tsx","utf8");
  check("عدّاد الصندوق في اللوحة — الشارة الحية", ap.includes("SupportWaitingBadge") && ap.includes("/admin/support"));
}

console.log("═══ ٥ · المعرفة: أرقام معتمدة فقط ═══");
{
  const k = readFileSync("src/lib/supportKnowledge.ts","utf8");
  check("أقسام المعرفة الأساسية", ["ACCOUNT","GAMES","GAME_CREDITS","SAVED_GAMES","GHARAS_BANK","SMART_STUDIO","CLOCK","PAYMENTS","TECHNICAL_HELP"].every(x=>k.includes(`[${x}`)));
  check("أسعار مطابقة للمنتجات المعتمدة", k.includes("٦ أشهر بثمانية دنانير") && k.includes("بدينارين"));
  check("قائمة التحويل الفوري", k.includes("ESCALATE_HINTS") && k.includes("استرجاع"));
}


console.log("═══ ٦ · تقييد تحديث المتصفح — الحقول الإدارية للخادم وحده ═══");
{
  const m = readFileSync("supabase/2026-08-27-support-center.sql","utf8");
  check("سحب UPDATE/DELETE من المتصفح ومنح user_seen_at وحده",
    m.includes("revoke update, delete on public.support_conversations from anon, authenticated") &&
    m.includes("grant  update (user_seen_at) on public.support_conversations to authenticated"));
  check("رسائل لا تُعدل ولا تُحذف من المتصفح",
    m.includes("revoke update, delete on public.support_messages from anon, authenticated"));
  const st = readFileSync("src/app/api/support/state/route.ts","utf8");
  check("الإغلاق: إثبات بالقراءة ثم كتابة بمفتاح الخدمة",
    /action === 'close'[\s\S]*?\.single\(\)[\s\S]*?serviceClient\(\)/.test(st));
  check("takeover/reactivate عبر مفتاح الخدمة بعد ADMIN_ONLY",
    st.indexOf("ADMIN_ONLY") < st.indexOf("svcA") && /takeover[\s\S]*?svcA/.test(st));
  const sd = readFileSync("src/app/api/support/send/route.ts","utf8");
  check("تحديث المحادثة بعد رسالة المستخدمة بمفتاح الخدمة",
    /last_sender: 'user'[\s\S]{0,200}/.test(sd) && sd.includes("svc0"));
}


console.log("═══ ٧ · السرعة والشارة العالمية ═══");
{
  const u = readFileSync("src/app/support/page.tsx","utf8");
  check("بث لحظي على رسائل المحادثة المفتوحة", u.includes("postgres_changes") && u.includes("support_messages") && u.includes("conversation_id=eq."));
  check("فقاعة تفاؤلية فورية لرسالة المستخدمة", u.includes("tmp-") && u.includes("sender_type: 'user'"));
  check("لا ازدواج: الحقيقية تحل محل التفاؤلية", u.includes("prev.some((x) => x.id === m.id)") && u.includes("x.id.startsWith('tmp-')"));
  check("تنظيف القناة عند الخروج", u.includes("removeChannel"));
  check("polling صار احتياطًا (٢٠ث) لا وسيلة أساسية", u.includes("20000") && !u.includes("8000"));

  const a = readFileSync("src/components/AdminSupportInbox.tsx","utf8");
  check("بث لحظي في صندوق الأدمِن (محادثة + قائمة)", a.includes("support-admin-") && a.includes("support-admin-list") && a.includes("removeChannel"));

  const b = readFileSync("src/components/SupportWaitingBadge.tsx","utf8");
  check("العدّاد محادثات لا رسائل", b.includes("support_conversations") && b.includes("count: 'exact'") && !b.includes("support_messages'"));
  check("التعريف: needs_human أو human_handling بآخر رد من المستخدمة",
    b.includes("status.eq.needs_human") && b.includes("status.eq.human_handling,last_sender.eq.user"));
  check("صفر يخفي الشارة و99+ يقص", b.includes("if (!count) return null") && b.includes("'99+'"));
  check("تحديث تلقائي بالبث + تنظيف", b.includes("postgres_changes") && b.includes("removeChannel"));

  const ab = readFileSync("src/components/AccountBar.tsx","utf8");
  check("الشارة خارج صفحة الدعم: شريط الحساب للأدمِن", ab.includes("SupportWaitingBadge"));
  const ap = readFileSync("src/components/AdminPanel.tsx","utf8");
  check("وزر اللوحة يستخدم الشارة الحية", ap.includes("SupportWaitingBadge"));

  const m = readFileSync("supabase/2026-08-27-support-center.sql","utf8");
  check("الهجرة تنشر الجدولين للبث بأمان التكرار", m.includes("supabase_realtime add table public.support_messages") && m.includes("duplicate_object"));
}

console.log(`\n  الدعم: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
