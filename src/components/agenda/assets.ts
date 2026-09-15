// أصول «أجندتي» — أيقونات ثلاثية الأبعاد وخلفيات ورقية مُعادة من سجلات رئيس الشعبة.
// تُخدَم كملفات ثابتة من public/agenda/* (خارج حزمة JS).

/** أيقونة ثلاثية الأبعاد بالمفتاح — الملفات في public/agenda/icons/<key>.png */
export const ICON = (key: string) => `/agenda/icons/${key}.png`;

/** ربط مفاهيم الأجندة بأيقونات سجلات رئيس الشعبة */
export const ICONS = {
  today: 'info',        // دفتر اليوم
  week: 'plans',        // خطة أسبوعية
  month: 'sched',       // تقويم
  ach: 'act',           // كأس الإنجازات
  harvest: 'field',     // حصاد/نمو
  tasks: 'ww',          // قائمة مهام
  taskAdd: 'prep',      // إعداد
  eventsUpcoming: 'meet', // مواعيد
  doneToday: 'act',     // أنجزت
  meeting: 'meet',
  exam: 'exams',
  visit: 'visit',
  students: 'students',
  note: 'circulars',
} as const;

export type BgTheme = { id: string; name: string; title: string };
/** خلفيات ورقية (الملفات في public/agenda/bg/<id>.jpg) */
export const BG_LIST: BgTheme[] = [
  { id: 'p1510', name: 'أزرق مائي', title: '#2C4E62' },
  { id: 'p1511', name: 'كتّان أزرق', title: '#325D59' },
  { id: 'p1512', name: 'حديقة زرقاء', title: '#35566A' },
  { id: 'p1513', name: 'ليلك أزرق', title: '#324D5D' },
  { id: 'p1528', name: 'نثرة بيضاء', title: '#2F4C60' },
  { id: 'p1509', name: 'ورد عتيق', title: '#5D3233' },
  { id: 'p1521', name: 'ورد إنجليزي', title: '#7E4048' },
  { id: 'p1518', name: 'حقل زهور', title: '#7A3A4A' },
  { id: 'p1522', name: 'رخام وردي', title: '#7A3E42' },
  { id: 'p1527', name: 'زهرة واحدة', title: '#7A3947' },
  { id: 'p1526', name: 'سنابل وردية', title: '#7C4A48' },
  { id: 'p1520', name: 'حقل لافندر', title: '#56406B' },
  { id: 'p1515', name: 'ليلكي حالم', title: '#5E3153' },
  { id: 'p1524', name: 'أقحوان ضبابي', title: '#5B4833' },
  { id: 'p1523', name: 'إطار مائي', title: '#5E5330' },
  { id: 'p1525', name: 'مزهرية أنيقة', title: '#3F5750' },
  { id: 'p1508', name: 'بيوني فضي', title: '#4A4A4E' },
  { id: 'p1514', name: 'حبر ياباني', title: '#44464A' },
];
export const BG_URL = (id: string) => `/agenda/bg/${id}.jpg`;
export const bgById = (id?: string | null) => BG_LIST.find((b) => b.id === id) || null;
