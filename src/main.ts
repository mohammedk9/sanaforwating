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

import { initOrderView, showView } from './ui/order.ts';
import { initGamePanel } from './ui/game.ts';
import { initRoomUi } from './ui/room.ts';
import { initAccountView, openAdminPanel } from './ui/account.ts';
import { initPwaInstall } from './ui/pwa.ts';
import { completeMagicLinkRedirect } from './net/account.ts';

initOrderView();
initGamePanel();
initRoomUi();
initAccountView();
initPwaInstall();

/**
 * إتمام دخول الرابط السحري بعد الهبوط على الموقع:
 * إن ضغط المدير رابط الدخول في بريده، نلتقط الجلسة هنا ثم نفتح صفحة الحساب ولوحة الإدارة مباشرة.
 * مرة واحدة فقط عند الإقلاع (الرابط يحمل auth=admin).
 */
void completeMagicLinkRedirect().then((loggedIn) => {
  if (!loggedIn) return;
  showView('account');
  void openAdminPanel();
});

