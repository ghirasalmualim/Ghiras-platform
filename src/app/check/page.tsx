/**
 * صفحة فحص الجهاز — لماذا لا تفتح المنصّة عند بعض المعلمات.
 *
 * مكتوبةٌ بـHTML وJavaScript قديم الطراز (ES5) عمدًا: بلا React ولا مكتبات،
 * حتى تعمل على متصفّحٍ قديمٍ **لا تعمل عليه المنصّة نفسها** — فإن فتحت هذه
 * ولم تفتح المنصّة عرفنا أن العلّة في المتصفّح لا في الشبكة، والعكس بالعكس.
 *
 * تعرض: المتصفّح وإصداره · ساعة الجهاز مقارنةً بساعة الخادم (فارقٌ كبير =
 * رفضُ شهادة الأمان) · الكوكيز · مزايا JavaScript الحديثة · واختبارُ اتصالٍ
 * فعليٍّ بمسارٍ في المنصّة. وزرُّ نسخٍ يرسل التقرير كاملًا لإدارة غراس.
 */
export const dynamic = 'force-dynamic';

const CSS = `
body{margin:0;background:#FAF8F3;color:#2F3B33;font-family:Tahoma,Arial,sans-serif;direction:rtl}
.wrap{max-width:720px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:22px;margin:0 0 6px}
p.sub{color:#6b756d;font-size:14px;margin:0 0 18px}
.card{background:#fff;border:1px solid #E8E4D8;border-radius:14px;padding:14px 16px;margin-bottom:12px}
.row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #f0efe9;padding:7px 0;font-size:14px}
.row:last-child{border-bottom:0}
.k{color:#6b756d}
.v{font-weight:bold;word-break:break-all;text-align:left;direction:ltr}
.ok{color:#2e7d4f}.bad{color:#c0392b}
button{background:#7A9E7E;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit}
#out{width:100%;height:120px;margin-top:10px;font-size:12px;direction:ltr}
`;

const JS = `
function el(id){return document.getElementById(id);}
function row(k,v,cls){
  var d=document.createElement('div'); d.className='row';
  var a=document.createElement('span'); a.className='k'; a.appendChild(document.createTextNode(k));
  var b=document.createElement('span'); b.className='v '+(cls||''); b.appendChild(document.createTextNode(v));
  d.appendChild(a); d.appendChild(b); el('list').appendChild(d);
  LINES.push(k+': '+v);
}
var LINES=[];
var ua=navigator.userAgent||'';
function browser(){
  if(ua.indexOf('Edg/')>-1) return 'Edge '+(ua.split('Edg/')[1]||'').split(' ')[0];
  if(ua.indexOf('OPR/')>-1) return 'Opera '+(ua.split('OPR/')[1]||'').split(' ')[0];
  if(ua.indexOf('Firefox/')>-1) return 'Firefox '+(ua.split('Firefox/')[1]||'').split(' ')[0];
  if(ua.indexOf('Chrome/')>-1) return 'Chrome '+(ua.split('Chrome/')[1]||'').split(' ')[0];
  if(ua.indexOf('Trident')>-1||ua.indexOf('MSIE')>-1) return 'Internet Explorer (قديم جدًا)';
  if(ua.indexOf('Safari/')>-1) return 'Safari';
  return 'غير معروف';
}
function os(){
  if(ua.indexOf('Windows NT 10')>-1) return 'Windows 10/11';
  if(ua.indexOf('Windows NT 6.3')>-1) return 'Windows 8.1';
  if(ua.indexOf('Windows NT 6.1')>-1) return 'Windows 7 (قديم)';
  if(ua.indexOf('Windows')>-1) return 'Windows قديم';
  if(ua.indexOf('Mac OS X')>-1) return 'macOS / iOS';
  if(ua.indexOf('Android')>-1) return 'Android';
  return 'غير معروف';
}
function feat(){
  var missing=[];
  try{ eval('(()=>0)()'); }catch(e){ missing.push('arrow functions'); }
  if(typeof Promise==='undefined') missing.push('Promise');
  if(typeof fetch==='undefined') missing.push('fetch');
  if(!window.localStorage) missing.push('localStorage');
  if(typeof Object.assign==='undefined') missing.push('Object.assign');
  return missing;
}
function start(){
  var b=browser(), o=os();
  row('المتصفّح', b, b.indexOf('Explorer')>-1?'bad':'ok');
  row('النظام', o, o.indexOf('قديم')>-1?'bad':'ok');
  row('ساعة الجهاز', new Date().toString().slice(0,24), '');
  row('الكوكيز', navigator.cookieEnabled?'مفعّلة':'مغلقة', navigator.cookieEnabled?'ok':'bad');
  var m=feat();
  row('مزايا المتصفّح', m.length?('ناقص: '+m.join(', ')):'كاملة', m.length?'bad':'ok');
  row('العنوان', location.protocol+'//'+location.host, '');

  // اختبار اتصال فعليّ + فارق الساعة عن الخادم (سببٌ شائع لرفض الشهادة)
  var t0=new Date().getTime();
  var done=function(status, serverDate){
    row('الاتصال بخادم غراس', status, status.indexOf('نجح')>-1?'ok':'bad');
    if(serverDate){
      var diff=Math.round((new Date(serverDate).getTime()-t0)/60000);
      row('فارق ساعة الجهاز عن الخادم', diff+' دقيقة', Math.abs(diff)>20?'bad':'ok');
    }
  };
  try{
    var x=new XMLHttpRequest();
    x.open('GET','/api/health-check-ping?t='+t0,true);
    x.onreadystatechange=function(){
      if(x.readyState===4){
        done(x.status>0?('نجح ('+x.status+')'):'فشل — لا يصل للخادم', x.getResponseHeader('date'));
      }
    };
    x.onerror=function(){ done('فشل — لا يصل للخادم',null); };
    x.send();
  }catch(e){ done('فشل — '+e,null); }
}
function copyAll(){
  var t=el('out'); t.style.display='block';
  t.value='تقرير فحص غراس\\n'+LINES.join('\\n')+'\\nUA: '+ua;
  t.select();
  try{ document.execCommand('copy'); el('msg').innerHTML='تم نسخ التقرير — أرسليه لإدارة غراس'; }
  catch(e){ el('msg').innerHTML='انسخي النص في المربّع وأرسليه لإدارة غراس'; }
}
if(window.addEventListener) window.addEventListener('load',start); else window.attachEvent('onload',start);
`;

export default function CheckPage() {
  const body = `
<div class="wrap">
  <h1>🩺 فحص الجهاز — غراس المعلم</h1>
  <p class="sub">إذا كانت المنصّة لا تفتح عندك، افتحي هذه الصفحة واضغطي «انسخي التقرير» وأرسليه لإدارة غراس.</p>
  <div class="card" id="list"></div>
  <button onclick="copyAll()">📋 انسخي التقرير</button>
  <p id="msg" class="sub" style="margin-top:10px"></p>
  <textarea id="out" style="display:none"></textarea>
</div>`;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <script dangerouslySetInnerHTML={{ __html: JS }} />
    </>
  );
}
