#!/usr/bin/env node
/**
 * عقد غموض PL/pgSQL (حادثة Stage 8): دالة RETURNS TABLE يصير كل اسم
 * عمود إخراج فيها متغيرًا — فأي مرجع عمود **غير مؤهَّل** بنفس الاسم داخل
 * جسدها يرفضه PostgreSQL وقت التنفيذ:
 *   column reference "..." is ambiguous
 * الفحص هنا مستهدف وصادق حدوده: يجرّد التعليقات والنصوص، يستخرج أسماء
 * الإخراج، ويرفض أي ظهور غير مؤهَّل (غير مسبوق بـ"مستعار.") لاسم إخراج
 * متبوعًا بمعامل مقارنة داخل الجسد. المؤهَّل (p.document_id) يمرّ.
 * التعريف الفعّال = آخر تعريف للدالة عبر الهجرات بالترتيب (الأساس ثم
 * التصحيحات). لا يدّعي الفحص دلالة SQL كاملة — يصطاد هذا الصنف تحديدًا.
 */
import { readFileSync, readdirSync } from 'node:fs';

let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };

const strip = (body) => body
  .replace(/--[^\n]*/g, '')
  .replace(/'(?:[^']|'')*'/g, "''");

/** يستخرج دوال RETURNS TABLE من نص هجرة: [{name, outs, body}] */
function extract(src) {
  const out = [];
  // الوسائط بلا أقواس داخلية في دوال returns table عندنا — يمنع القفز
  // الجشع عبر حدود دالة أخرى (returns void بوسيط char(3) لن يطابق)
  const re = /create (?:or replace )?function public\.(\w+)\s*\(([^()]*)\)\s*returns\s+table\s*\(([^)]*)\)\s*language plpgsql[^$]*\$\$([\s\S]*?)\$\$;/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const outs = m[3].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
    out.push({ name: m[1], outs, body: m[4] });
  }
  return out;
}

/** أسماء الإخراج المتصادمة: ظهور غير مؤهَّل + معامل مقارنة بعده */
function collisions(fn) {
  const b = strip(fn.body);
  const hits = new Set();
  for (const o of fn.outs) {
    const re = new RegExp('(?<![\\w.])' + o + '\\s*(=|<>|<|>|is\\s+(?:not\\s+)?distinct)', 'g');
    if (re.test(b)) hits.add(o);
  }
  return [...hits];
}

console.log('\n═══ إثبات نفي: الماسح يصطاد المثال الاصطناعي ويقبل المؤهَّل ═══');
{
  // ملاحظة: لا نستخدم String.replace لإدراج $$ — فهي محرف هروب في الاستبدال
  const bad = `create function public.synthetic_bad(p_document uuid)
returns table (document_id uuid)
language plpgsql security definer set search_path to 'public' as $$
begin
  select count(*) from acc_document_pages
  where document_id = p_document;
end $$;`;
  const good = bad
    .split('from acc_document_pages').join('from acc_document_pages p')
    .split('where document_id = p_document').join('where p.document_id = p_document');
  const badFns = extract(bad);
  const goodFns = extract(good);
  check('غير المؤهَّل يُرفض (نفي)', badFns.length === 1 && collisions(badFns[0]).includes('document_id'));
  check('المؤهَّل p.document_id يمرّ', goodFns.length === 1 && collisions(goodFns[0]).length === 0);
}

console.log('═══ Stage 8: التعريفات الفعّالة (الأساس ثم التصحيحات) صفر تصادم ═══');
{
  const files = readdirSync('supabase')
    .filter((f) => /^2026-08-(29|3\d)-accounting-expenses-documents.*\.sql$/.test(f))
    .sort();
  check('هجرة الأساس + التصحيح كلاهما ضمن المسح', files.length >= 2);
  const effective = new Map();  // آخر تعريف يفوز
  for (const f of files)
    for (const fn of extract(readFileSync(`supabase/${f}`, 'utf8')))
      effective.set(fn.name, { ...fn, file: f });
  check('كل دوال RETURNS TABLE التسع مغطاة', effective.size === 9);
  let bad = 0;
  for (const fn of effective.values()) {
    const hits = collisions(fn);
    check(`${fn.name} (${fn.file.includes('-30-') ? 'مصحَّحة' : 'أساس'}): بلا مرجع متصادم`, hits.length === 0, hits.join(','));
    if (hits.length) bad++;
  }
  // الدوال الخمس المصابة يجب أن يكون تعريفها الفعّال من التصحيح
  for (const n of ['acc_finalize_document','acc_delete_document','acc_submit_expense','acc_approve_expense','acc_classify_expense'])
    check(`${n}: التعريف الفعّال من هجرة التصحيح`, effective.get(n)?.file.includes('2026-08-30'));
}

console.log('═══ التصحيح يحفظ العقود (تواقيع/أمن/رسائل) ═══');
{
  const FIX = readFileSync('supabase/2026-08-30-accounting-expenses-documents-ambiguity.sql', 'utf8');
  const FIXC = FIX.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  check('خمس دوال create or replace فقط — لا drop ولا CASCADE ولا جداول',
    (FIXC.match(/create or replace function/g) || []).length === 5
    && !/drop function|cascade|create table|alter table|insert into storage/i.test(FIXC));
  check('لا تلاعب بإعداد variable_conflict — الحل في SQL ذاته',
    !/variable_conflict/i.test(FIXC));
  check('التواقيع وعقود table(id, outcome) كما هي',
    (FIXC.match(/returns table \((?:document_id|expense_id) uuid, outcome text\)/g) || []).length === 5);
  check('SECURITY DEFINER + search_path مثبَّت للخمس',
    (FIXC.match(/security definer set search_path to 'public'/g) || []).length === 5);
  check('REVOKE/GRANT معادة للخمس كما في الأساس (finalize خدمة؛ البقية authenticated)',
    /revoke execute on function public\.acc_finalize_document\(uuid\) from public, anon, authenticated/.test(FIXC)
    && /grant  execute on function public\.acc_finalize_document\(uuid\) to service_role/.test(FIXC)
    && (FIXC.match(/grant  execute on function[^;]+to authenticated/g) || []).length === 4);
  check('حرّاس التوقيع والرسائل الدلالية محفوظة',
    ['acc.doc_op','acc.expense_op','BLOCKED_POSTED','AUTHORITATIVE_MAPPING_REQUIRED:',
     'OWNER_APPROVAL_REQUIRED','no one approves their own submission',
     'manual is not source-less','page numbering must be gapless']
      .every((s) => FIX.includes(s)));
  check('صفر acc_post_journal في التصحيح (BLK-004)', !/acc_post_journal/.test(FIXC));
}

console.log(`\n  عقد الغموض: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
