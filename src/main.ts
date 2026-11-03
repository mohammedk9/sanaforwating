/**
 * نقطة دخول SANA.
 *
 * ترتيب استيراد الأنماط مهم: tokens ثم main ثم responsive — وهو نفسه ترتيب
 * كتلة <style> في ملف SANA الأصلي، لذا تبقى أولوية الأنماط كما هي بالحرف.
 *
 * ملف الأنماط ينقسم إلى ثلاثة ملفات فقط (كما اعتمدنا):
 *   tokens.css     ← :root (الألوان والخطوط والحواف)
 *   main.css       ← التصميم العام
 *   responsive.css ← الجوال والشاشات (900px و 560px)
 * وعند كبر المشروع يمكن تقسيمها أكثر دون تغيير أي قيمة.
 */
import './styles/tokens.css';
import './styles/main.css';
import './styles/responsive.css';

import { initOrderView } from './ui/order.ts';
import { initGamePanel } from './ui/game.ts';
import { initMatchDemo } from './ui/match.ts';

initOrderView();
initGamePanel();
initMatchDemo();
