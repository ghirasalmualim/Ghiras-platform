/**
 * نفس تحويل HEIC لكن كنصّ JavaScript خام — لأدوات المعلمة المكتوبة HTML/JS داخل
 * صفحات الخادم (سجل الحضور، الألعاب…) حيث لا يوجد استيراد وحدات.
 *
 * يُلصق في أول سكربت الأداة فتصير `ghJpeg(file)` متاحة: تُرجع ملفًا JPEG إن كانت
 * الصورة HEIC (كاميرا الآيفون/الآيباد)، وترجع الملف نفسه في كل حالة أخرى أو عند
 * أي فشل — فلا تمنع الرفع أبدًا. بلا أي شرطة عكسية حتى يسلم من التهريب المزدوج.
 */
export const HEIC_JS = `
/* ===== غراس: تحويل صور آبل (HEIC) إلى JPEG قبل الرفع ===== */
function ghIsHeic(f){
  var n=((f&&f.name)||'').toLowerCase(), t=((f&&f.type)||'').toLowerCase();
  return n.endsWith('.heic')||n.endsWith('.heif')||t==='image/heic'||t==='image/heif';
}
async function ghJpeg(f){
  try{
    if(!f||!ghIsHeic(f)) return f;
    var src, cleanup=function(){};
    try{
      /* from-image: يحترم دوران الصورة المسجّل في EXIF */
      src=await createImageBitmap(f,{imageOrientation:'from-image'});
      cleanup=function(){ if(src.close) src.close(); };
    }catch(e1){
      var url=URL.createObjectURL(f);
      src=await new Promise(function(ok,no){
        var im=new Image(); im.onload=function(){ok(im);}; im.onerror=no; im.src=url;
      });
      cleanup=function(){ URL.revokeObjectURL(url); };
    }
    var w=src.width||src.naturalWidth, h=src.height||src.naturalHeight;
    if(!w||!h){ cleanup(); return f; }
    var k=Math.min(1,2400/Math.max(w,h));
    var c=document.createElement('canvas');
    c.width=Math.round(w*k); c.height=Math.round(h*k);
    c.getContext('2d').drawImage(src,0,0,c.width,c.height);
    cleanup();
    var blob=await new Promise(function(r){ c.toBlob(r,'image/jpeg',0.92); });
    if(!blob) return f;
    var name=((f.name||'photo').split('.').slice(0,-1).join('.')||'photo')+'.jpg';
    return new File([blob],name,{type:'image/jpeg'});
  }catch(e){ return f; }
}
`;
