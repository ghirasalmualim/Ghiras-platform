#!/usr/bin/env node
/**
 * Stage 9 — سلوك الـparsers محليًا (تجهيزات تركيبية حصرًا — BLK-011).
 * السبع عائلات + عربي/RTL + windows-1256 + النزاهة + الحدود + تأجيل
 * PDF الصوري للمرحلة 13 (قرار الإغلاق المعتمد). صفر شبكة، صفر AI.
 */
import { parseStatement } from '../../src/lib/accounting/bank/parsers/index.ts';
import { ParserError } from '../../src/lib/accounting/bank/connector.ts';
import { canonicalDescription, parseAmountToMinor, parseDateByFormat } from '../../src/lib/accounting/bank/normalize.ts';
import { buildAssertion, verifyIntegrity, coverageFromRows, movementSum } from '../../src/lib/accounting/bank/integrity.ts';
import { validateLayoutSpec } from '../../src/lib/accounting/bank/layout-spec.ts';
import { BANK_LIMITS } from '../../src/lib/accounting/bank/limits.ts';

let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) passed++; else { failed++; console.error(`  ❌ ${n} ${x}`); } };
const enc = (s) => new TextEncoder().encode(s);

const CSV_SPEC = {
  header: { skip_rows: 0, header_row_contains: ['التاريخ'] },
  columns: { txn_date: 'التاريخ', value_date: 'تاريخ القيمة', description: 'البيان',
             debit: 'مدين', credit: 'دائن', balance: 'الرصيد', reference: 'المرجع' },
  amount_semantics: 'DEBIT_CREDIT_COLUMNS', date_format: 'DD/MM/YYYY',
  decimal_separator: '.', thousands_separator: ',', encoding: 'utf-8',
  delimiter: ',', currency_mode: 'FIXED', fixed_currency: 'KWD',
  balance_direction: 'AFTER_ROW', row_order: 'ASC',
};
// كشف KWD تركيبي: افتتاحي 100.000 → +25.500 → -10.250 → ختامي 115.250
const CSV_OK = `التاريخ,تاريخ القيمة,البيان,مدين,دائن,الرصيد,المرجع
01/09/2026,01/09/2026,"تحويل وارد — عميلة  غراس",,25.500,125.500,REF-001
02/09/2026,02/09/2026,رسوم  الخدمة الشهرية,10.250,,115.250,REF-002`;

console.log('\n═══ ١ · التطبيع الحتمي والمال ═══');
{
  check('canonical: مسافات/حالة/NFKC', canonicalDescription('  Payment   to  ACME ') === 'PAYMENT TO ACME');
  check('canonical: عربي + محارف اتجاه صفرية',
    canonicalDescription('تحويل‏  وارد ‎— عميلة') === canonicalDescription('تحويل وارد — عميلة'));
  check('KWD ثلاث منازل تامة', parseAmountToMinor('12.345', 3) === 12345n);
  check('JPY صفر منازل', parseAmountToMinor('5000', 0) === 5000n);
  check('فواصل آلاف أوروبية', parseAmountToMinor('1.234,56', 2, ',', '.') === 123456n);
  check('سالب بقوسين', parseAmountToMinor('(10.250)', 3) === -10250n);
  let threw = false; try { parseAmountToMinor('1.2345', 3); } catch { threw = true; }
  check('الدقة الزائدة مرفوضة لا مقرّبة', threw);
  check('تاريخ DD/MM/YYYY', parseDateByFormat('02/09/2026', 'DD/MM/YYYY') === '2026-09-02');
  let badDate = false; try { parseDateByFormat('31/02/2026', 'DD/MM/YYYY'); } catch { badDate = true; }
  check('تاريخ تقويمي باطل مرفوض', badDate);
}

console.log('═══ ٢ · CSV (عربي + مدين/دائن + رصيد جارٍ) ═══');
{
  const p = await parseStatement('CSV', enc(CSV_OK), CSV_SPEC, 3);
  check('صفّان، دائن موجب ومدين سالب',
    p.rows.length === 2 && p.rows[0].amountMinor === 25500n && p.rows[1].amountMinor === -10250n);
  check('الرصيد الجاري التُقط', p.rows[1].runningBalanceMinor === 115250n);
  check('الوصف الخام محفوظ والقانوني مطبَّع',
    p.rows[0].descriptionRaw.includes('  ') && !p.rows[0].descriptionCanon.includes('  '));
  const a = buildAssertion(p);
  check('التوكيد مشتق من سلسلة الرصيد بمصدر معلَن',
    a?.source === 'DERIVED_FROM_RUNNING_BALANCE' && a.openingMinor === 100000n && a.closingMinor === 115250n);
  check('حقائق الاشتقاق محفوظة', a.derivation?.rows === 2);
  const v = verifyIntegrity(a, p.rows);
  check('BANK-008: المعادلة الدقيقة تمرّ', v.ok === true);
  check('التغطية من الصفوف', JSON.stringify(coverageFromRows(p.rows)) === '{"start":"2026-09-01","end":"2026-09-02"}');
  // عبث بالرصيد الختامي → السلسلة تكسر
  const tampered = { ...a, closingMinor: 999999n };
  check('عبث الختامي يفشل المعادلة', verifyIntegrity(tampered, p.rows).ok === false);
}

console.log('═══ ٣ · windows-1256 + DESC + فاصلة منقوطة ═══');
{
  // ملف بترميز windows-1256 وترتيب تنازلي وفاصل ;
  const iconvText = 'التاريخ;البيان;دائن;مدين;الرصيد\n02/09/2026;ايداع نقدي;5.000;;15.000\n01/09/2026;سحب صراف;;3.000;10.000';
  // ترميز windows-1256 يدويًا عبر TextEncoder غير ممكن — نبني البايتات بجدول
  const cp1256 = { 'ا':0xC7,'ل':0xE1,'ت':0xCA,'ر':0xD1,'ي':0xED,'خ':0xCE,'ب':0xC8,'ن':0xE4,'د':0xCF,'ئ':0xC6,'م':0xE3,'ص':0xD5,'ف':0xDD,'ح':0xCD,'س':0xD3,'ق':0xDE,'ع':0xDA,'؛':0xBA,'ا':0xC7 };
  const bytes = [];
  for (const ch of iconvText) {
    if (cp1256[ch] !== undefined) bytes.push(cp1256[ch]);
    else if (ch.codePointAt(0) < 128) bytes.push(ch.codePointAt(0));
    else bytes.push(0x3F);
  }
  const spec = { ...CSV_SPEC, encoding: 'windows-1256', delimiter: ';', row_order: 'DESC',
    header: { skip_rows: 1 },
    columns: { txn_date: 0, description: 1, credit: 2, debit: 3, balance: 4 } };
  const p = await parseStatement('CSV', new Uint8Array(bytes), spec, 3);
  check('windows-1256 فُكّ والترتيب التنازلي عُكس تصاعديًا',
    p.rows.length === 2 && p.rows[0].txnDate === '2026-09-01' && p.rows[1].txnDate === '2026-09-02');
  check('الصف الأول سحب سالب', p.rows[0].amountMinor === -3000n);
  const a = buildAssertion(p);
  check('الاشتقاق بعد العكس صحيح', a?.openingMinor === 13000n && a.closingMinor === 15000n);
  check('معادلة النزاهة تمرّ بعد العكس', verifyIntegrity(a, p.rows).ok === true);
}

console.log('═══ ٤ · XLSX (exceljs — قيم فقط) ═══');
{
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('كشف');
  ws.addRow(['التاريخ', 'البيان', 'مدين', 'دائن', 'الرصيد']);
  ws.addRow(['01/09/2026', 'راتب موظفة', '', '500.000', '1500.000']);
  ws.addRow(['03/09/2026', 'إيجار المقر', '350.000', '', '1150.000']);
  const buf = new Uint8Array(await wb.xlsx.writeBuffer());
  const spec = { ...CSV_SPEC, header: { skip_rows: 0, header_row_contains: ['التاريخ'] } };
  const p = await parseStatement('XLSX', buf, spec, 3);
  check('XLSX: صفّان بالمبالغ الموقعة', p.rows.length === 2
    && p.rows[0].amountMinor === 500000n && p.rows[1].amountMinor === -350000n);
  const a = buildAssertion(p);
  check('XLSX: التوكيد والنزاهة', a !== null && verifyIntegrity(a, p.rows).ok === true);
}

console.log('═══ ٥ · MT940 (أرصدة صريحة) ═══');
{
  const mt = [':20:STMT-1', ':25:KW81CBKU0000000000001234567890', ':28C:1/1',
    ':60F:C260901KWD100,000', ':61:2609020902C25,500NTRFREF-001',
    ':86:تحويل وارد من عميلة', ':61:2609030903D10,250NCHGREF-002',
    ':86:رسوم خدمة', ':62F:C260903KWD115,250', '-'].join('\n');
  const p = await parseStatement('MT940', enc(mt), {}, 3);
  check('MT940: حركتان موقّعتان', p.rows.length === 2
    && p.rows[0].amountMinor === 25500n && p.rows[1].amountMinor === -10250n);
  check('MT940: الأرصدة صريحة والعملة والحساب التُقطا',
    p.explicitOpeningMinor === 100000n && p.explicitClosingMinor === 115250n
    && p.detectedCurrency === 'KWD' && p.detectedAccountRaw?.includes('1234567890'));
  const a = buildAssertion(p);
  check('MT940: مصدر التوكيد EXPLICIT_SOURCE (لا ادعاء اشتقاق)',
    a?.source === 'EXPLICIT_SOURCE' && verifyIntegrity(a, p.rows).ok === true);
  check('MT940: value_date موجود وentry date مميز',
    p.rows[0].valueDate === '2026-09-02' && p.rows[0].txnDate === '2026-09-02');
}

console.log('═══ ٦ · CAMT.053 (XML آمن) ═══');
{
  const camt = `<?xml version="1.0"?><Document><BkToCstmrStmt><Stmt>
    <CreDtTm>2026-09-30T12:00:00</CreDtTm>
    <Acct><Id><IBAN>KW81CBKU0000000000001234567890</IBAN></Id></Acct>
    <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="KWD">100.000</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
    <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="KWD">115.250</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
    <Ntry><Amt Ccy="KWD">25.500</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-09-02</Dt></BookgDt>
      <ValDt><Dt>2026-09-02</Dt></ValDt><AcctSvcrRef>REF-001</AcctSvcrRef>
      <NtryDtls><TxDtls><RmtInf><Ustrd>تحويل وارد</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
    <Ntry><Amt Ccy="KWD">10.250</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-09-03</Dt></BookgDt>
      <ValDt><Dt>2026-09-03</Dt></ValDt><AcctSvcrRef>REF-002</AcctSvcrRef>
      <AddtlNtryInf>رسوم</AddtlNtryInf></Ntry>
  </Stmt></BkToCstmrStmt></Document>`;
  const p = await parseStatement('CAMT053', enc(camt), {}, 3);
  check('CAMT: حركتان وأرصدة صريحة', p.rows.length === 2
    && p.explicitOpeningMinor === 100000n && p.explicitClosingMinor === 115250n);
  check('CAMT: الحساب والعملة', p.detectedCurrency === 'KWD' && !!p.detectedAccountRaw);
  const a = buildAssertion(p);
  check('CAMT: EXPLICIT + معادلة تمرّ', a?.source === 'EXPLICIT_SOURCE' && verifyIntegrity(a, p.rows).ok);
  // أمان XML: DOCTYPE مرفوض (لا كيانات خارجية)
  let xxe = null;
  try { await parseStatement('CAMT053', enc('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Document/>'), {}, 3); }
  catch (e) { xxe = e; }
  check('DOCTYPE/DTD مرفوض (لا XXE)', xxe instanceof ParserError && /DTD/.test(xxe.message));
}

console.log('═══ ٧ · OFX + QIF ═══');
{
  const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>KWD<BANKACCTFROM><ACCTID>1234567890
<BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260902<TRNAMT>25.500<FITID>REF-001<MEMO>تحويل وارد</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903<TRNAMT>-10.250<FITID>REF-002<MEMO>رسوم</STMTTRN></BANKTRANLIST>
<LEDGERBAL><BALAMT>115.250<DTASOF>20260930</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const p = await parseStatement('OFX', enc(ofx), {}, 3);
  check('OFX: TRNAMT موقَّع + FITID مرجعًا', p.rows.length === 2
    && p.rows[0].amountMinor === 25500n && p.rows[1].amountMinor === -10250n
    && p.rows[0].reference === 'REF-001');
  check('OFX: ختامي فقط بلا افتتاحي مُدّعى',
    p.explicitClosingMinor === 115250n && p.explicitOpeningMinor === null);
  check('OFX: بلا افتتاحي وبلا سلسلة أرصدة = لا توكيد (فشل مغلق أعلى)',
    buildAssertion(p) === null);

  const qif = `!Type:Bank\nD02/09/2026\nT25.500\nPتحويل وارد\nNREF-001\n^\nD03/09/2026\nT-10.250\nPرسوم\n^`;
  const q = await parseStatement('QIF', enc(qif), { date_format: 'DD/MM/YYYY' }, 3);
  check('QIF: حركتان', q.rows.length === 2 && q.rows[1].amountMinor === -10250n);
  check('QIF: لا أرصدة إطلاقًا → لا توكيد → القبول مستحيل بتصميم مقصود',
    buildAssertion(q) === null);
}

console.log('═══ ٨ · PDF: طبقة نص حتمية + تأجيل الصوري للمرحلة 13 ═══');
{
  const mkPdf = (content) => {
    const stream = content;
    return enc(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${stream.length}>>stream
${stream}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Size 6/Root 1 0 R>>`);
  };
  const textPdf = mkPdf(
    'BT /F1 10 Tf ' +
    '1 0 0 1 10 150 Tm (01/09/2026) Tj 1 0 0 1 90 150 Tm (SALARY CREDIT) Tj 1 0 0 1 200 150 Tm (500.000) Tj 1 0 0 1 300 150 Tm (1500.000) Tj ' +
    '1 0 0 1 10 130 Tm (03/09/2026) Tj 1 0 0 1 90 130 Tm (RENT DEBIT) Tj 1 0 0 1 200 130 Tm (-350.000) Tj 1 0 0 1 300 130 Tm (1150.000) Tj ET');
  const spec = { columns: { txn_date: 0, description: 1, amount: 2, balance: 3 },
    amount_semantics: 'SIGNED_AMOUNT', date_format: 'DD/MM/YYYY',
    currency_mode: 'FIXED', fixed_currency: 'KWD', balance_direction: 'AFTER_ROW' };
  const p = await parseStatement('PDF_TEXT', textPdf, spec, 3);
  check('PDF نصي: استخراج حتمي لصفّين', p.rows.length === 2
    && p.rows[0].amountMinor === 500000n && p.rows[1].amountMinor === -350000n);
  const a = buildAssertion(p);
  check('PDF نصي: توكيد مشتق + نزاهة', a !== null && verifyIntegrity(a, p.rows).ok);
  // صوري: صفحة بلا أي عنصر نصي
  const imgPdf = mkPdf('q 1 0 0 1 0 0 cm Q');
  let deferred = null;
  try { await parseStatement('PDF_TEXT', imgPdf, spec, 3); } catch (e) { deferred = e; }
  check('PDF صوري = UNSUPPORTED_FORMAT مؤجَّل للمرحلة 13 صراحةً',
    deferred instanceof ParserError && deferred.condition === 'UNSUPPORTED_FORMAT'
    && deferred.detail.deferred_to === 'STAGE_13');
}

console.log('═══ ٩ · الحدود وعقد المواصفة ═══');
{
  const big = 'x'.repeat(BANK_LIMITS.MAX_UPLOAD_BYTES + 1);
  let sized = null;
  try { await parseStatement('CSV', enc(big), CSV_SPEC, 3); } catch (e) { sized = e; }
  check('حدّ حجم الرفع يُفرض', sized instanceof ParserError && /size limit/.test(sized.message));
  check('مواصفة سليمة تمرّ', validateLayoutSpec(CSV_SPEC, 'CSV').ok === true);
  check('مفتاح مجهول يُرفض', validateLayoutSpec({ ...CSV_SPEC, evil: 'x' }, 'CSV').ok === false);
  check('تعبير تنفيذي كقيمة عمود يُرفض (نوع غير مسموح)',
    validateLayoutSpec({ ...CSV_SPEC, columns: { txn_date: { eval: 'x' }, description: 1 } }, 'CSV').ok === false);
  check('صيغة تاريخ خارج الرموز تُرفض',
    validateLayoutSpec({ ...CSV_SPEC, date_format: 'DD/MM/YYYY; rm -rf' }, 'CSV').ok === false);
  check('ترميز غير مدعوم يُرفض', validateLayoutSpec({ ...CSV_SPEC, encoding: 'utf-7' }, 'CSV').ok === false);
  check('عائلة ذاتية الوصف بلا أعمدة تمرّ', validateLayoutSpec({}, 'MT940').ok === true);
  check('جدولية بلا أعمدة تُرفض', validateLayoutSpec({}, 'CSV').ok === false);
  check('movementSum بمجاميع bigint دقيقة', movementSum([{ amountMinor: 1n }, { amountMinor: -3n }]) === -2n);
}

console.log(`\n  parsers البنك: ${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
